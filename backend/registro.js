const express = require('express');
const db = require('./db');
const blockchain = require('./blockchain');

const router = express.Router();

// Módulos públicos de auto-registro que comparten esta misma app (ver
// registro-wallet/src/App.jsx, que detecta la ruta y manda este valor).
// Cualquier otro valor recibido cae a 'foro' por seguridad.
const EVENTOS_VALIDOS = ['foro', 'asoban'];

// POST /api/registro — endpoint PÚBLICO (sin requireAuth, ver server.js).
// Usado por la página /registro (y /registroASOBAN) para guardar el
// auto-registro de un participante: nombre completo + wallet (ya sea que la
// haya pegado él mismo o que acabe de crear en MetaMask), y de qué módulo
// vino (para poder filtrar/exportar por evento en el panel admin).
router.post('/', async (req, res) => {
  const nombre = (req.body?.nombre || '').trim();
  const wallet = (req.body?.wallet || '').trim();
  const tipo = req.body?.tipo === 'creada' ? 'creada' : 'existente';
  const evento = EVENTOS_VALIDOS.includes(req.body?.evento) ? req.body.evento : 'foro';

  if (!nombre) {
    return res.status(400).json({ success: false, message: 'Falta el nombre completo.' });
  }

  if (!blockchain.web3.utils.isAddress(wallet)) {
    return res.status(400).json({ success: false, message: 'La wallet no tiene un formato válido.' });
  }

  db.prepare('INSERT INTO participantes (nombre, wallet, tipo, evento) VALUES (?, ?, ?, ?)').run(nombre, wallet, tipo, evento);

  res.status(201).json({ success: true, message: 'Registro guardado correctamente.' });
});

module.exports = router;
