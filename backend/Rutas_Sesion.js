// Inicio de sesión, creación de cuenta y recuperación de contraseña.
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Base_Datos = require('./Base_Datos');
const { Requerir_Sesion, Firmar_Sesion } = require('./Autenticacion');

const Rutas = express.Router();
const Rondas_Hash = 12;

function Normalizar_Correo(Correo) {
  return String(Correo || '').trim().toLowerCase();
}

function Usuario_Publico(Usuario) {
  return {
    id: Usuario.id,
    correo: Usuario.correo,
    nombre: Usuario.nombre,
    rol: Usuario.rol,
    institucion_id: Usuario.institucion_id || null,
    wallet: Usuario.wallet || null,
  };
}

Rutas.post('/login', async (Peticion, Respuesta) => {
  const Correo = Normalizar_Correo(Peticion.body?.correo);
  const Contrasena = String(Peticion.body?.contrasena || '');
  if (!Correo || !Contrasena) return Respuesta.status(400).json({ exito: false, mensaje: 'Correo y contraseña son requeridos.' });

  const Usuario = Base_Datos.prepare('SELECT * FROM usuarios WHERE correo = ?').get(Correo);
  if (!Usuario || !(await bcrypt.compare(Contrasena, Usuario.contrasena_hash))) {
    return Respuesta.status(401).json({ exito: false, mensaje: 'Correo o contraseña incorrectos.' });
  }
  if (Usuario.estado && Usuario.estado !== 'activo') {
    return Respuesta.status(403).json({ exito: false, mensaje: 'Tu cuenta aún no está habilitada por el administrador.' });
  }
  Respuesta.json({ exito: true, token: Firmar_Sesion(Usuario), usuario: Usuario_Publico(Usuario) });
});

// Cuenta nueva: con institución queda como "viewer" pendiente de aprobación;
// sin institución queda como estudiante (para ver sus certificados).
Rutas.post('/registro', async (Peticion, Respuesta) => {
  const Nombre = String(Peticion.body?.nombre || '').trim();
  const Correo = Normalizar_Correo(Peticion.body?.correo);
  const Contrasena = String(Peticion.body?.contrasena || '');
  const Institucion_Id = Number(Peticion.body?.institucion_id) || null;
  const Wallet = String(Peticion.body?.wallet || '').trim();

  if (!Nombre || !Correo || !Contrasena) return Respuesta.status(400).json({ exito: false, mensaje: 'Nombre, correo y contraseña son requeridos.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(Correo)) return Respuesta.status(400).json({ exito: false, mensaje: 'El correo no tiene un formato válido.' });
  if (Contrasena.length < 8) return Respuesta.status(400).json({ exito: false, mensaje: 'La contraseña debe tener al menos 8 caracteres.' });
  if (Wallet && !/^0x[a-fA-F0-9]{40}$/.test(Wallet)) return Respuesta.status(400).json({ exito: false, mensaje: 'La wallet no tiene un formato válido.' });
  if (Base_Datos.prepare('SELECT id FROM usuarios WHERE correo = ?').get(Correo)) {
    return Respuesta.status(409).json({ exito: false, mensaje: 'Ya existe una cuenta con ese correo.' });
  }
  if (Institucion_Id && !Base_Datos.prepare('SELECT id FROM instituciones WHERE id = ?').get(Institucion_Id)) {
    return Respuesta.status(400).json({ exito: false, mensaje: 'La institución seleccionada no existe.' });
  }

  const Hash = await bcrypt.hash(Contrasena, Rondas_Hash);
  const Resultado = Base_Datos.prepare(
    'INSERT INTO usuarios (correo, contrasena_hash, nombre, rol, institucion_id, estado, wallet) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(Correo, Hash, Nombre, Institucion_Id ? 'viewer' : 'student', Institucion_Id, Institucion_Id ? 'pendiente' : 'activo', Wallet || null);

  if (Institucion_Id) {
    Base_Datos.prepare('INSERT INTO solicitudes_acceso (usuario_id, institucion_id) VALUES (?, ?)').run(Resultado.lastInsertRowid, Institucion_Id);
    return Respuesta.status(201).json({ exito: true, pendiente: true, mensaje: 'Solicitud enviada. Un administrador debe aprobar tu acceso.' });
  }
  Respuesta.status(201).json({ exito: true, mensaje: 'Cuenta de estudiante creada. Ya puedes iniciar sesión.' });
});

Rutas.get('/sesion', Requerir_Sesion, (Peticion, Respuesta) => {
  const Usuario = Base_Datos.prepare('SELECT * FROM usuarios WHERE id = ?').get(Peticion.Usuario.id);
  if (!Usuario || (Usuario.estado && Usuario.estado !== 'activo')) {
    return Respuesta.status(401).json({ exito: false, mensaje: 'Sesión no válida.' });
  }
  Respuesta.json({ exito: true, usuario: Usuario_Publico(Usuario) });
});

// No hay servidor de correo: el enlace se imprime en la consola del servidor.
Rutas.post('/olvide-contrasena', (Peticion, Respuesta) => {
  const Correo = Normalizar_Correo(Peticion.body?.correo);
  if (!Correo) return Respuesta.status(400).json({ exito: false, mensaje: 'El correo es requerido.' });

  const Usuario = Base_Datos.prepare('SELECT id FROM usuarios WHERE correo = ?').get(Correo);
  if (Usuario) {
    const Token = crypto.randomBytes(32).toString('hex');
    const Expira = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    Base_Datos.prepare('INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(Usuario.id, Token, Expira);
    console.log(`\n[RESET] Enlace de recuperación (válido 1 hora): ${Peticion.protocol}://${Peticion.get('host')}/?reset=${Token}\n`);
  }
  Respuesta.json({ exito: true, mensaje: 'Si el correo existe, el enlace de recuperación aparece en la consola del servidor.' });
});

Rutas.post('/restablecer-contrasena', async (Peticion, Respuesta) => {
  const Token = String(Peticion.body?.token || '');
  const Contrasena = String(Peticion.body?.contrasena || '');
  if (!Token || !Contrasena) return Respuesta.status(400).json({ exito: false, mensaje: 'Token y contraseña nueva son requeridos.' });
  if (Contrasena.length < 8) return Respuesta.status(400).json({ exito: false, mensaje: 'La contraseña debe tener al menos 8 caracteres.' });

  const Registro = Base_Datos.prepare('SELECT * FROM reset_tokens WHERE token = ? AND used = 0').get(Token);
  if (!Registro) return Respuesta.status(400).json({ exito: false, mensaje: 'El enlace no es válido o ya fue usado.' });
  if (new Date(Registro.expires_at) < new Date()) return Respuesta.status(400).json({ exito: false, mensaje: 'El enlace expiró. Solicita uno nuevo.' });

  Base_Datos.prepare('UPDATE usuarios SET contrasena_hash = ? WHERE id = ?').run(await bcrypt.hash(Contrasena, Rondas_Hash), Registro.user_id);
  Base_Datos.prepare('UPDATE reset_tokens SET used = 1 WHERE id = ?').run(Registro.id);
  Respuesta.json({ exito: true, mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
});

module.exports = Rutas;
