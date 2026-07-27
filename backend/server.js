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

app.use(express.json());

// Página pública de auto-registro de wallet (React + Vite, compilada con
// "npm run build" en registro-wallet/). Va antes del estático del panel
// admin para que /registro se resuelva aquí primero.
const registroDist = path.join(__dirname, '..', 'registro-wallet', 'dist');
app.use('/registro', express.static(registroDist));

// Fallback SPA: cualquier ruta bajo /registro que no sea un archivo estático
// (ej. /registro, /registro/algo) devuelve el index.html compilado. Evita el
// "Cannot GET /registro" cuando se navega directo a esa URL. Si dist/index.html
// no existe (build no ejecutado), pasa al siguiente handler en vez de romper.
app.get(['/registro', '/registro/*'], (req, res, next) => {
  res.sendFile(path.join(registroDist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use(
  express.static(path.join(__dirname, '..', 'frontend'), {
    index: 'Certificados NFT.html',
  })
);

// Todas las rutas de certificados quedan protegidas: solo un usuario con JWT válido puede usarlas.
app.use('/api/certificados', requireAuth, certificadosRouter);

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

  const token = jwt.sign(
    { id: usuario.id, correo: usuario.correo, rol: usuario.rol },
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
    },
  });
});

app.post('/api/register', async (req, res) => {
  const { nombre, correo, contrasena } = req.body ?? {};

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

  db.prepare(
    'INSERT INTO usuarios (correo, contrasena_hash, nombre) VALUES (?, ?, ?)'
  ).run(correo.trim().toLowerCase(), hash, nombre.trim());

  res.status(201).json({ mensaje: 'Cuenta creada correctamente.' });
});

app.get('/api/me', requireAuth, (req, res) => {
  const usuario = db
    .prepare('SELECT id, correo, nombre, rol FROM usuarios WHERE id = ?')
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
