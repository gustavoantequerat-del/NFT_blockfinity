const path    = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const db      = require('./db');
const { requireAuth, JWT_SECRET } = require('./auth');
const certificadosRouter = require('./certificados');
const registroRouter = require('./registro');
const blockchain = require('./blockchain');
const panel = require('./panel');

const app        = express();
const PORT       = process.env.PORT || 3000;

// Evita que un error async no capturado (ej. timeout de Web3.js) tumbe el servidor.
process.on('unhandledRejection', (error) => {
  console.error('⚠️ unhandledRejection (no debería tumbar el servidor):', error);
});

if (!JWT_SECRET) {
  console.error('ERROR: JWT_SECRET no está definido en backend/.env');
  process.exit(1);
}

// El límite por defecto de Express (100kb) se queda corto en /masivo/emitir,
// que recibe TODOS los certificados ya preparados (con sus URLs de IPFS) en
// un solo JSON — con un lote real de cientos de alumnos supera ese límite.
app.use(express.json({ limit: '15mb' }));

// Página pública de auto-registro de wallet (React + Vite, compilada con
// "npm run build" en registro-wallet/). Va antes del estático del panel
// admin para que /registro se resuelva aquí primero.
app.use('/registro', express.static(path.join(__dirname, '..', 'registro-wallet', 'dist')));

// Mismo build que /registro, servido también bajo /registroASOBAN: es la
// misma app (mismo código, mismo brandeo), que detecta esta ruta en tiempo
// de ejecución para mostrar "Certificados NFT ASOBAN" y marcar sus registros
// con evento="asoban" (ver registro-wallet/src/App.jsx).
app.use('/registroASOBAN', express.static(path.join(__dirname, '..', 'registro-wallet', 'dist')));

// El nombre del archivo se cambió a "index.html" (era "Certificados NFT.html",
// con espacio y mayúsculas) para evitar problemas al desplegar en Linux
// (case-sensitive) y usar el índice por defecto de express.static.
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Todas las rutas de certificados quedan protegidas con JWT. Emitir y ver el
// historial es exclusivo del administrador; los demás roles solo leen /config.
function requireAdminExceptConfig(req, res, next) {
  if (req.user?.rol === 'admin' || (req.method === 'GET' && req.path === '/config')) return next();
  res.status(403).json({ error: 'Esta accion requiere una cuenta administradora.' });
}
app.use('/api/certificados', requireAuth, requireAdminExceptConfig, certificadosRouter);

// El nuevo panel separa las consultas publicas de los flujos institucionales
// protegidos por JWT y rol.
app.use('/api/panel', panel.router);
app.use('/api/public', panel.publicRouter);

// Público a propósito: la página /registro no requiere login (la usa cualquier
// visitante para registrar su wallet, no un administrador del panel).
app.use('/api/registro', registroRouter);

app.post('/api/login', async (req, res) => {
  const { correo, contrasena } = req.body ?? {};

  if (!correo || !contrasena) {
    return res.status(400).json({ error: 'Correo y contraseña son requeridos.' });
  }

  const usuario = db
    .prepare('SELECT * FROM usuarios WHERE correo = ?')
    .get(correo.trim().toLowerCase());

  const passwordValida =
    usuario != null && (await bcrypt.compare(contrasena, usuario.contrasena_hash));

  if (!passwordValida) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }

  if (usuario.estado && usuario.estado !== 'activo') {
    return res.status(403).json({ error: 'Tu cuenta aun no esta habilitada por el administrador.' });
  }

  const token = jwt.sign(
    { id: usuario.id, correo: usuario.correo, rol: usuario.rol, institucion_id: usuario.institucion_id || null },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    usuario: {
      id:     usuario.id,
      correo: usuario.correo,
      nombre: usuario.nombre,
      rol:    usuario.rol,
      institucionId: usuario.institucion_id || null,
      wallet: usuario.wallet || null,
    },
  });
});

app.post('/api/register', async (req, res) => {
  const { nombre, correo, contrasena, institucionId } = req.body ?? {};

  if (!nombre || !correo || !contrasena) {
    return res.status(400).json({ error: 'Nombre, correo y contraseña son requeridos.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
  }

  if (contrasena.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  const existe = db
    .prepare('SELECT id FROM usuarios WHERE correo = ?')
    .get(correo.trim().toLowerCase());

  if (existe) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
  }

  const hash = await bcrypt.hash(contrasena, 12);

  const institutionId = Number(institucionId) || null;
  if (institutionId) {
    const institution = db.prepare('SELECT id FROM instituciones WHERE id = ?').get(institutionId);
    if (!institution) return res.status(400).json({ error: 'La institucion seleccionada no existe.' });
  }

  const info = db.prepare(
    'INSERT INTO usuarios (correo, contrasena_hash, nombre, rol, institucion_id, estado) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    correo.trim().toLowerCase(),
    hash,
    nombre.trim(),
    institutionId ? 'viewer' : 'admin',
    institutionId,
    institutionId ? 'pendiente' : 'activo'
  );

  if (institutionId) {
    db.prepare('INSERT INTO solicitudes_acceso (usuario_id, institucion_id) VALUES (?, ?)').run(info.lastInsertRowid, institutionId);
    return res.status(201).json({ mensaje: 'Solicitud enviada. Un administrador debe aprobar tu acceso.', pendiente: true });
  }

  res.status(201).json({ mensaje: 'Cuenta creada correctamente.' });
});

app.get('/api/me', requireAuth, (req, res) => {
  const usuario = db
    .prepare('SELECT id, correo, nombre, rol, institucion_id, estado, wallet FROM usuarios WHERE id = ?')
    .get(req.user.id);

  if (!usuario) {
    return res.status(401).json({ error: 'Usuario no encontrado.' });
  }

  res.json({ usuario });
});

app.post('/api/forgot-password', (req, res) => {
  const { correo } = req.body ?? {};

  if (!correo) {
    return res.status(400).json({ error: 'El correo es requerido.' });
  }

  const usuario = db
    .prepare('SELECT id FROM usuarios WHERE correo = ?')
    .get(correo.trim().toLowerCase());

  if (usuario) {
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    db.prepare(
      'INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)'
    ).run(usuario.id, token, expiresAt);

    console.log('\n──────────────────────────────────────────────────────');
    console.log('[RESET] Enlace de recuperación de contraseña (válido 1 hora):');
    console.log(`http://localhost:${PORT}/?reset=${token}`);
    console.log('──────────────────────────────────────────────────────\n');
  }

  res.json({ mensaje: 'Si ese correo existe, el enlace aparecerá en la consola del servidor.' });
});

app.post('/api/reset-password', async (req, res) => {
  const { token, contrasena } = req.body ?? {};

  if (!token || !contrasena) {
    return res.status(400).json({ error: 'Token y contraseña nueva son requeridos.' });
  }

  if (contrasena.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  const record = db
    .prepare('SELECT * FROM reset_tokens WHERE token = ? AND used = 0')
    .get(token);

  if (!record) {
    return res.status(400).json({ error: 'El enlace no es válido o ya fue usado.' });
  }

  if (new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ error: 'El enlace ha expirado. Solicita uno nuevo.' });
  }

  const hash = await bcrypt.hash(contrasena, 12);

  db.prepare('UPDATE usuarios SET contrasena_hash = ? WHERE id = ?').run(hash, record.user_id);
  db.prepare('UPDATE reset_tokens SET used = 1 WHERE id = ?').run(record.id);

  res.json({ mensaje: 'Contraseña actualizada correctamente.' });
});

// Valida la red blockchain configurada antes de arrancar el servidor.
blockchain
  .validateNetwork()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\nServidor corriendo en http://localhost:${PORT}`);
      console.log(`Panel:       http://localhost:${PORT}/`);
      console.log(`API login:   POST http://localhost:${PORT}/api/login`);
      console.log(`API certif.: GET  http://localhost:${PORT}/api/certificados/config`);
      console.log(`             POST http://localhost:${PORT}/api/certificados/validar-excel`);
      console.log(`             POST http://localhost:${PORT}/api/certificados/masivo/preparar`);
      console.log(`             POST http://localhost:${PORT}/api/certificados/masivo/emitir`);
      console.log(`             POST http://localhost:${PORT}/api/certificados/individual\n`);
    });
  })
  .catch((error) => {
    console.error('❌ Error validando red blockchain:', error.message);
    process.exit(1);
  });
