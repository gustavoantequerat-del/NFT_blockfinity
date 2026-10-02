// SQLite integrado en Node.js 22+ (node:sqlite), sin dependencias nativas.
// Los nombres de tablas y columnas se mantienen en snake_case para no
// romper las bases de datos que ya están en uso.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { Crear_Slug } = require('./Marca_Institucion');

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
  // Ruta de registro (/registro_<slug>) y marca de cada institución.
  'ALTER TABLE instituciones ADD COLUMN slug TEXT',
  'ALTER TABLE instituciones ADD COLUMN color TEXT',
  'ALTER TABLE instituciones ADD COLUMN logo_archivo TEXT',
  // Cuenta del estudiante que se registró por la ruta de su institución.
  'ALTER TABLE estudiantes_institucionales ADD COLUMN usuario_id INTEGER',
  // La institución principal (Blockfinity Advisors) no se puede borrar y
  // recibe a los estudiantes de las instituciones eliminadas.
  'ALTER TABLE instituciones ADD COLUMN es_principal INTEGER NOT NULL DEFAULT 0',
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

// Instituciones creadas antes de tener ruta propia: el slug sale del nombre
// (si se repite se le agrega el id).
for (const Institucion of Base_Datos.prepare('SELECT id, nombre FROM instituciones WHERE slug IS NULL').all()) {
  let Slug = Crear_Slug(Institucion.nombre) || `institucion_${Institucion.id}`;
  if (Base_Datos.prepare('SELECT id FROM instituciones WHERE slug = ?').get(Slug)) Slug = `${Slug}_${Institucion.id}`;
  Base_Datos.prepare('UPDATE instituciones SET slug = ? WHERE id = ?').run(Slug, Institucion.id);
}
Base_Datos.exec('CREATE UNIQUE INDEX IF NOT EXISTS instituciones_slug ON instituciones(slug)');

// Institución principal: su registro está en /registro.
if (!Base_Datos.prepare('SELECT id FROM instituciones WHERE es_principal = 1').get()) {
  const Existente = Base_Datos.prepare("SELECT id FROM instituciones WHERE slug = 'blockfinity_advisors'").get();
  if (Existente) Base_Datos.prepare('UPDATE instituciones SET es_principal = 1 WHERE id = ?').run(Existente.id);
  else Base_Datos.exec("INSERT INTO instituciones (nombre, etiqueta, slug, color, es_principal) VALUES ('Blockfinity Advisors', 'BLOCKFINITY_ADVISORS', 'blockfinity_advisors', '#1d2b3a', 1)");
}
// Estudiantes y certificados sin institución (ej. de instituciones borradas
// antes de existir la principal) pasan a la principal.
Base_Datos.exec(`
  UPDATE usuarios SET institucion_id = (SELECT id FROM instituciones WHERE es_principal = 1) WHERE rol = 'student' AND institucion_id IS NULL;
  UPDATE emisiones SET institucion_id = (SELECT id FROM instituciones WHERE es_principal = 1) WHERE institucion_id IS NULL;
`);

module.exports = Base_Datos;
