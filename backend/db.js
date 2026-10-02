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

// Datos operativos del panel institucional. Estas tablas reemplazan los datos
// de ejemplo del nuevo diseno y dejan auditables los flujos por rol.
db.exec(`
  CREATE TABLE IF NOT EXISTS instituciones (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre             TEXT NOT NULL,
    etiqueta           TEXT NOT NULL UNIQUE,
    responsable_nombre TEXT,
    responsable_correo TEXT,
    wallet             TEXT,
    credito_usd        REAL NOT NULL DEFAULT 0,
    estado             TEXT NOT NULL DEFAULT 'activa',
    creado_por         INTEGER,
    creado_en          TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (creado_por) REFERENCES usuarios(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS solicitudes_acceso (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id      INTEGER NOT NULL,
    institucion_id  INTEGER NOT NULL,
    estado          TEXT NOT NULL DEFAULT 'pendiente',
    resuelto_por    INTEGER,
    creado_en       TEXT DEFAULT (datetime('now')),
    resuelto_en     TEXT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (institucion_id) REFERENCES instituciones(id),
    FOREIGN KEY (resuelto_por) REFERENCES usuarios(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS estudiantes_institucionales (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    institucion_id  INTEGER NOT NULL,
    nombre          TEXT NOT NULL,
    correo          TEXT,
    wallet          TEXT,
    creado_por      INTEGER,
    creado_en       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (institucion_id) REFERENCES instituciones(id),
    FOREIGN KEY (creado_por) REFERENCES usuarios(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS lotes_solicitados (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    institucion_id  INTEGER NOT NULL,
    nombre          TEXT NOT NULL,
    plantilla_nombre TEXT,
    cantidad        INTEGER NOT NULL,
    costo_usd       REAL NOT NULL DEFAULT 0,
    estado          TEXT NOT NULL DEFAULT 'pendiente',
    creado_por      INTEGER,
    creado_en       TEXT DEFAULT (datetime('now')),
    resuelto_por    INTEGER,
    resuelto_en     TEXT,
    FOREIGN KEY (institucion_id) REFERENCES instituciones(id),
    FOREIGN KEY (creado_por) REFERENCES usuarios(id),
    FOREIGN KEY (resuelto_por) REFERENCES usuarios(id)
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

// Las instalaciones creadas antes del panel multirol se actualizan sin perder
// sus usuarios existentes. SQLite no soporta IF NOT EXISTS para ADD COLUMN.
for (const migration of [
  "ALTER TABLE usuarios ADD COLUMN institucion_id INTEGER",
  "ALTER TABLE usuarios ADD COLUMN estado TEXT NOT NULL DEFAULT 'activo'",
  "ALTER TABLE usuarios ADD COLUMN wallet TEXT",
  "ALTER TABLE emisiones ADD COLUMN institucion_id INTEGER",
  "ALTER TABLE emisiones ADD COLUMN pdf_cid TEXT",
  "ALTER TABLE emisiones ADD COLUMN final_pdf_cid TEXT",
  "ALTER TABLE emisiones ADD COLUMN final_pdf_url TEXT",
  "ALTER TABLE emisiones ADD COLUMN qr_payload TEXT",
]) {
  try {
    db.exec(migration);
  } catch (error) {
    if (!/duplicate column/i.test(error.message)) throw error;
  }
}

module.exports = db;
