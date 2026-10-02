// SQLite integrado en Node.js 22+ (node:sqlite), sin dependencias nativas.
// Los nombres de tablas y columnas se mantienen en snake_case para no
// romper las bases de datos que ya están en uso.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const Base_Datos = new DatabaseSync(path.join(__dirname, 'database.sqlite'));

Base_Datos.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    correo           TEXT    UNIQUE NOT NULL,
    contrasena_hash  TEXT    NOT NULL,
    nombre           TEXT,
    rol              TEXT    DEFAULT 'admin',
    creado_en        TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reset_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token      TEXT    UNIQUE NOT NULL,
    expires_at TEXT    NOT NULL,
    used       INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES usuarios(id)
  );

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
  );

  CREATE TABLE IF NOT EXISTS participantes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre         TEXT    NOT NULL,
    wallet         TEXT    NOT NULL,
    tipo           TEXT    NOT NULL,
    evento         TEXT    NOT NULL DEFAULT 'foro',
    creado_en      TEXT    DEFAULT (datetime('now'))
  );

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
  );

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
  );

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
  );

  CREATE TABLE IF NOT EXISTS lotes_solicitados (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    institucion_id   INTEGER NOT NULL,
    nombre           TEXT NOT NULL,
    plantilla_nombre TEXT,
    cantidad         INTEGER NOT NULL,
    costo_usd        REAL NOT NULL DEFAULT 0,
    estado           TEXT NOT NULL DEFAULT 'pendiente',
    creado_por       INTEGER,
    creado_en        TEXT DEFAULT (datetime('now')),
    resuelto_por     INTEGER,
    resuelto_en      TEXT,
    FOREIGN KEY (institucion_id) REFERENCES instituciones(id),
    FOREIGN KEY (creado_por) REFERENCES usuarios(id),
    FOREIGN KEY (resuelto_por) REFERENCES usuarios(id)
  );

  -- Ajustes globales del sistema (por ahora solo el modo de red: test / main).
  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
`);

// Migraciones: agregan columnas a bases creadas con versiones anteriores.
// SQLite no soporta "ADD COLUMN IF NOT EXISTS", así que se ignora el error
// de columna duplicada.
const Migraciones = [
  "ALTER TABLE participantes ADD COLUMN evento TEXT NOT NULL DEFAULT 'foro'",
  'ALTER TABLE usuarios ADD COLUMN institucion_id INTEGER',
  "ALTER TABLE usuarios ADD COLUMN estado TEXT NOT NULL DEFAULT 'activo'",
  'ALTER TABLE usuarios ADD COLUMN wallet TEXT',
  'ALTER TABLE emisiones ADD COLUMN institucion_id INTEGER',
  'ALTER TABLE emisiones ADD COLUMN pdf_cid TEXT',
  'ALTER TABLE emisiones ADD COLUMN final_pdf_cid TEXT',
  'ALTER TABLE emisiones ADD COLUMN final_pdf_url TEXT',
  'ALTER TABLE emisiones ADD COLUMN qr_payload TEXT',
  // Red en la que se emitió el certificado: 'test' o 'main'.
  'ALTER TABLE emisiones ADD COLUMN red TEXT',
  // Plantilla PDF y lista de estudiantes que la institución adjunta al lote.
  'ALTER TABLE lotes_solicitados ADD COLUMN plantilla_archivo TEXT',
  'ALTER TABLE lotes_solicitados ADD COLUMN estudiantes_json TEXT',
  'ALTER TABLE lotes_solicitados ADD COLUMN red TEXT',
];

for (const Migracion of Migraciones) {
  try {
    Base_Datos.exec(Migracion);
  } catch (Error_Migracion) {
    if (!/duplicate column/i.test(Error_Migracion.message)) throw Error_Migracion;
  }
}

// Las emisiones hechas antes de existir el switch test/main no tienen red
// registrada. Se asumen de 'main' (la red con la que ya funcionaba el sistema).
Base_Datos.exec("UPDATE emisiones SET red = 'main' WHERE red IS NULL");

module.exports = Base_Datos;
