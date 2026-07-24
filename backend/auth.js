const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware: valida el JWT del header "Authorization: Bearer <token>" y,
// si es válido, deja los datos del usuario en req.user para la siguiente ruta.
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado.' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión expirada. Inicia sesión nuevamente.' });
  }
}

module.exports = { requireAuth, JWT_SECRET };
