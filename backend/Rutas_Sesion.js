// Inicio de sesión. Hay dos portales:
//   /login  → estudiantes y administradores institucionales
//   /admin  → administrador de la plataforma
// No hay creación de cuentas aquí: las instituciones las da de alta el
// administrador y los estudiantes se registran en /registro_<institución>.
const express = require('express');
const bcrypt = require('bcryptjs');
const Base_Datos = require('./Base_Datos');
const { Requerir_Sesion, Firmar_Sesion } = require('./Autenticacion');
const { Datos_Marca } = require('./Marca_Institucion');

const Rutas = express.Router();

function Usuario_Publico(Usuario) {
  const Institucion = Usuario.institucion_id
    ? Base_Datos.prepare('SELECT * FROM instituciones WHERE id = ?').get(Usuario.institucion_id)
    : null;
  return {
    id: Usuario.id,
    correo: Usuario.correo,
    nombre: Usuario.nombre,
    rol: Usuario.rol,
    institucion_id: Usuario.institucion_id || null,
    wallet: Usuario.wallet || null,
    institucion: Datos_Marca(Institucion),
  };
}

Rutas.post('/login', async (Peticion, Respuesta) => {
  const Correo = String(Peticion.body?.correo || '').trim().toLowerCase();
  const Contrasena = String(Peticion.body?.contrasena || '');
  const Portal_Admin = Peticion.body?.portal === 'admin';
  if (!Correo || !Contrasena) return Respuesta.status(400).json({ exito: false, mensaje: 'Correo y contraseña son requeridos.' });

  const Usuario = Base_Datos.prepare('SELECT * FROM usuarios WHERE correo = ?').get(Correo);
  if (!Usuario || !(await bcrypt.compare(Contrasena, Usuario.contrasena_hash))) {
    return Respuesta.status(401).json({ exito: false, mensaje: 'Correo o contraseña incorrectos.' });
  }
  if (Portal_Admin && Usuario.rol !== 'admin') {
    return Respuesta.status(403).json({ exito: false, mensaje: 'Esta cuenta no es de administrador. Ingresa por /login.' });
  }
  if (!Portal_Admin && Usuario.rol === 'admin') {
    return Respuesta.status(403).json({ exito: false, mensaje: 'Las cuentas de administrador ingresan por /admin.' });
  }
  if (Usuario.estado && Usuario.estado !== 'activo') {
    return Respuesta.status(403).json({ exito: false, mensaje: 'Tu cuenta está deshabilitada. Contacta a tu institución.' });
  }
  Respuesta.json({ exito: true, token: Firmar_Sesion(Usuario), usuario: Usuario_Publico(Usuario) });
});

Rutas.get('/sesion', Requerir_Sesion, (Peticion, Respuesta) => {
  const Usuario = Base_Datos.prepare('SELECT * FROM usuarios WHERE id = ?').get(Peticion.Usuario.id);
  if (!Usuario || (Usuario.estado && Usuario.estado !== 'activo')) {
    return Respuesta.status(401).json({ exito: false, mensaje: 'Sesión no válida.' });
  }
  Respuesta.json({ exito: true, usuario: Usuario_Publico(Usuario) });
});

module.exports = Rutas;
