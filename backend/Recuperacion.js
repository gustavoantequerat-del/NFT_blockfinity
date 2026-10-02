// Recuperación de contraseña con enlaces de un solo uso (válidos 1 hora).
// El enlace llega por correo (ver Correo.js) o, si no hay correo
// configurado, la institución lo genera y se lo pasa al estudiante.
const crypto = require('crypto');
const Base_Datos = require('./Base_Datos');

const Duracion_Enlace = 60 * 60 * 1000;

function Url_Base(Peticion) {
  const Publica = process.env.PUBLIC_VERIFY_URL?.trim();
  return Publica ? new URL(Publica).origin : `${Peticion.protocol}://${Peticion.get('host')}`;
}

function Crear_Enlace_Recuperacion(Peticion, Usuario_Id) {
  const Usuario = Base_Datos.prepare('SELECT rol FROM usuarios WHERE id = ?').get(Usuario_Id);
  const Token = crypto.randomBytes(32).toString('hex');
  // Un enlace nuevo invalida los anteriores del mismo usuario.
  Base_Datos.prepare('UPDATE reset_tokens SET used = 1 WHERE user_id = ? AND used = 0').run(Usuario_Id);
  Base_Datos.prepare('INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
    .run(Usuario_Id, Token, new Date(Date.now() + Duracion_Enlace).toISOString());
  return `${Url_Base(Peticion)}/${Usuario?.rol === 'admin' ? 'admin' : 'login'}?reset=${Token}`;
}

// Devuelve el registro del token si sirve, o un mensaje de error.
function Validar_Token(Token) {
  const Registro = Base_Datos.prepare('SELECT * FROM reset_tokens WHERE token = ? AND used = 0').get(String(Token || ''));
  if (!Registro) return { Error_Token: 'El enlace no es válido o ya fue usado. Pide uno nuevo.' };
  if (new Date(Registro.expires_at) < new Date()) return { Error_Token: 'El enlace expiró. Pide uno nuevo.' };
  return { Registro };
}

module.exports = { Crear_Enlace_Recuperacion, Validar_Token };
