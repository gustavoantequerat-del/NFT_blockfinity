const jwt = require('jsonwebtoken');

const Secreto_Jwt = process.env.JWT_SECRET;

// Valida el header "Authorization: Bearer <token>" y deja el usuario en
// Peticion.Usuario para las rutas siguientes.
function Requerir_Sesion(Peticion, Respuesta, Siguiente) {
  const Encabezado = Peticion.headers.authorization || '';
  if (!Encabezado.startsWith('Bearer ')) {
    return Respuesta.status(401).json({ exito: false, mensaje: 'No autenticado.' });
  }
  try {
    Peticion.Usuario = jwt.verify(Encabezado.slice(7), Secreto_Jwt);
    Siguiente();
  } catch (_) {
    Respuesta.status(401).json({ exito: false, mensaje: 'Sesión expirada. Inicia sesión nuevamente.' });
  }
}

// Permite la ruta solo a los roles indicados: admin, viewer (institución) o student.
function Requerir_Rol(...Roles) {
  return (Peticion, Respuesta, Siguiente) => {
    if (!Roles.includes(Peticion.Usuario?.rol)) {
      return Respuesta.status(403).json({ exito: false, mensaje: 'Tu cuenta no tiene permiso para esta acción.' });
    }
    Siguiente();
  };
}

// Para rutas públicas que responden distinto si hay sesión (verificación).
function Leer_Sesion_Opcional(Peticion) {
  const Encabezado = Peticion.headers.authorization || '';
  if (!Encabezado.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(Encabezado.slice(7), Secreto_Jwt);
  } catch (_) {
    return null;
  }
}

function Firmar_Sesion(Usuario) {
  return jwt.sign(
    { id: Usuario.id, correo: Usuario.correo, rol: Usuario.rol, institucion_id: Usuario.institucion_id || null },
    Secreto_Jwt,
    { expiresIn: '8h' }
  );
}

module.exports = { Secreto_Jwt, Requerir_Sesion, Requerir_Rol, Firmar_Sesion, Leer_Sesion_Opcional };
