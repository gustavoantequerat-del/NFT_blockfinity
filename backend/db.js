// SQLite integrado en Node.js 22+ — sin dependencias nativas
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'database.sqlite'));

// Tabla de usuarios administradores del panel (login, registro).
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    correo           TEXT    UNIQUE NOT NULL,
    contrasena_hash  TEXT    NOT NULL,
    nombre           TEXT,
    rol              TEXT    DEFAULT 'admin',
    creado_en        TEXT    DEFAULT (datetime('now'))
  )
`);

// Tabla de tokens de recuperación de contraseña (un token de un solo uso, con expiración).
db.exec(`
  CREATE TABLE IF NOT EXISTS reset_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token      TEXT    UNIQUE NOT NULL,
    expires_at TEXT    NOT NULL,
    used       INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES usuarios(id)
  )
`);

// Tabla de historial: guarda cada certificado emitido (o fallido) con su
// alumno, wallet, tokenId y hash de transacción, para consultarlo después
// sin depender de Etherscan.
db.exec(`
  CREATE TABLE IF NOT EXISTS emisiones (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id        TEXT    NOT NULL,
    nombre_alumno  TEXT    NOT NULL,
    wallet_alumno  TEXT    NOT NULL,
    token_id       INTEGER,
    tx_hash        TEXT,
    explorer_url   TEXT,
    token_uri      TEXT,
    estado         TEXT    NOT NULL,
    error          TEXT,
    creado_por     INTEGER,
    creado_en      TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (creado_por) REFERENCES usuarios(id)
  )
`);

// Tabla de auto-registro público (página /registro, sin login): nombre +
// wallet de cada persona que se registra para recibir su certificado.
db.exec(`
  CREATE TABLE IF NOT EXISTS participantes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre         TEXT    NOT NULL,
    wallet         TEXT    NOT NULL,
    tipo           TEXT    NOT NULL,
    evento         TEXT    NOT NULL DEFAULT 'foro',
    creado_en      TEXT    DEFAULT (datetime('now'))
  )
`);

// Migración: agrega la columna "evento" (distingue de qué módulo público vino
// el registro, ej. "foro" o "asoban") a bases de datos creadas antes de este
// cambio. Falla en silencio si la columna ya existe.
try {
  db.exec(`ALTER TABLE participantes ADD COLUMN evento TEXT NOT NULL DEFAULT 'foro'`);
} catch (error) {
  if (!/duplicate column/i.test(error.message)) throw error;
}

module.exports = db;
