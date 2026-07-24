const express = require('express');
const db = require('./db');
const blockchain = require('./blockchain');

const router = express.Router();

// POST /api/registro — endpoint PÚBLICO (sin requireAuth, ver server.js).
// Usado por la página /registro para guardar el auto-registro de un
// participante: nombre completo + wallet (ya sea que la haya pegado él
// mismo o que se le haya creado con Web3Auth).
router.post('/', (req, res) => {
  const nombre = (req.body?.nombre || '').trim();
  const wallet = (req.body?.wallet || '').trim();
  const tipo = req.body?.tipo === 'creada' ? 'creada' : 'existente';

  if (!nombre) {
    return res.status(400).json({ success: false, message: 'Falta el nombre completo.' });
  }

  if (!blockchain.web3.utils.isAddress(wallet)) {
    return res.status(400).json({ success: false, message: 'La wallet no tiene un formato válido.' });
  }

  db.prepare('INSERT INTO participantes (nombre, wallet, tipo) VALUES (?, ?, ?)').run(nombre, wallet, tipo);

  res.status(201).json({ success: true, message: 'Registro guardado correctamente.' });
});

module.exports = router;
