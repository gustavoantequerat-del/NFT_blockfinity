// Plantillas PDF guardadas por institución. Se suben una vez y quedan en el
// servidor (uploads/plantillas): la institución las adjunta a sus lotes y el
// admin las ve, las previsualiza y emite con ellas.
// Acceso: el admin a todas; la institución solo a las suyas.
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const Base_Datos = require('./Base_Datos');
const { Requerir_Sesion, Requerir_Rol } = require('./Autenticacion');
const { Carpeta_Subidas } = require('./Emision_Certificados');
const { Generar_Vista_Plantilla } = require('./Plantilla_Pdf');

const Rutas = express.Router();
const Carpeta_Plantillas = path.join(Carpeta_Subidas, 'plantillas');
fs.mkdirSync(Carpeta_Plantillas, { recursive: true });

const Subida = multer({
  storage: multer.diskStorage({
    destination: Carpeta_Plantillas,
    filename: (_Peticion, _Archivo, Listo) => Listo(null, `plantilla-${Date.now()}-${Math.round(Math.random() * 1e6)}.pdf`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function Borrar_Si_Existe(Ruta) {
  if (Ruta && fs.existsSync(Ruta)) fs.unlinkSync(Ruta);
}

function Ruta_Pdf(Plantilla) {
  return path.join(Carpeta_Plantillas, Plantilla.archivo);
}

function Ruta_Vista(Plantilla) {
  return `${Ruta_Pdf(Plantilla)}.png`;
}

// Plantilla por id si el usuario puede verla; si no, null.
function Obtener_Plantilla(Id, Usuario) {
  const Plantilla = Base_Datos.prepare('SELECT * FROM plantillas WHERE id = ?').get(Number(Id));
  if (!Plantilla) return null;
  if (Usuario?.rol !== 'admin' && Number(Usuario?.institucion_id) !== Plantilla.institucion_id) return null;
  return Plantilla;
}

// Ruta del PDF de una plantilla, comprobando que el archivo siga en disco.
function Ruta_Plantilla_Existente(Plantilla) {
  const Ruta = Plantilla && Ruta_Pdf(Plantilla);
  if (!Ruta || !fs.existsSync(Ruta)) throw new Error('No se encontró el archivo de la plantilla en el servidor. Vuelve a subirla.');
  return Ruta;
}

// Borra las filas (dentro de la transacción de quien llama) y devuelve los
// archivos, que se borran recién cuando la transacción se confirma.
function Borrar_Plantillas_De_Institucion(Institucion_Id) {
  const Archivos = Base_Datos.prepare('SELECT * FROM plantillas WHERE institucion_id = ?').all(Institucion_Id)
    .flatMap((Plantilla) => [Ruta_Pdf(Plantilla), Ruta_Vista(Plantilla)]);
  Base_Datos.prepare('DELETE FROM plantillas WHERE institucion_id = ?').run(Institucion_Id);
  return Archivos;
}

Rutas.use(Requerir_Sesion, Requerir_Rol('admin', 'viewer'));

Rutas.get('/', (Peticion, Respuesta) => {
  const Institucion_Id = Peticion.Usuario.rol === 'admin' ? Number(Peticion.query.institucion_id) || null : Number(Peticion.Usuario.institucion_id);
  const Plantillas = Base_Datos.prepare(`
    SELECT p.id, p.institucion_id, p.nombre, p.creado_en, u.nombre AS subida_por
    FROM plantillas p LEFT JOIN usuarios u ON u.id = p.creado_por
    WHERE (? IS NULL OR p.institucion_id = ?)
    ORDER BY p.creado_en DESC, p.id DESC
  `).all(Institucion_Id, Institucion_Id);
  Respuesta.json({ exito: true, plantillas: Plantillas });
});

// Sube una plantilla y genera su vista previa al momento: si el PDF no se
// puede leer, se rechaza aquí y no al emitir.
Rutas.post('/', Subida.single('plantilla'), async (Peticion, Respuesta) => {
  const Archivo = Peticion.file;
  const Institucion_Id = Peticion.Usuario.rol === 'admin' ? Number(Peticion.body?.institucion_id) : Number(Peticion.Usuario.institucion_id);
  const Fallar = (Mensaje) => {
    Borrar_Si_Existe(Archivo?.path);
    Respuesta.status(400).json({ exito: false, mensaje: Mensaje });
  };

  if (!Archivo) return Fallar('Selecciona la plantilla PDF.');
  if (!Institucion_Id || !Base_Datos.prepare('SELECT id FROM instituciones WHERE id = ?').get(Institucion_Id)) return Fallar('Institución no válida.');
  const Cabecera = Buffer.alloc(5);
  const Descriptor = fs.openSync(Archivo.path, 'r');
  fs.readSync(Descriptor, Cabecera, 0, 5, 0);
  fs.closeSync(Descriptor);
  if (Cabecera.toString() !== '%PDF-') return Fallar('El archivo no es un PDF.');

  const Plantilla = { archivo: Archivo.filename };
  try {
    await Generar_Vista_Plantilla(Archivo.path, Ruta_Vista(Plantilla));
  } catch (Error_Vista) {
    console.error('❌ Plantilla ilegible:', Error_Vista.message);
    return Fallar('No se pudo leer el PDF. Revisa que no esté dañado ni protegido con contraseña.');
  }

  const Resultado = Base_Datos.prepare('INSERT INTO plantillas (institucion_id, nombre, archivo, creado_por) VALUES (?, ?, ?, ?)')
    .run(Institucion_Id, Archivo.originalname || 'plantilla.pdf', Archivo.filename, Peticion.Usuario.id);
  Respuesta.status(201).json({
    exito: true,
    plantilla: Base_Datos.prepare('SELECT id, institucion_id, nombre, creado_en FROM plantillas WHERE id = ?').get(Resultado.lastInsertRowid),
  });
});

// Vista previa PNG (con nombre de ejemplo y QR). Si falta, se regenera.
Rutas.get('/:id/vista', async (Peticion, Respuesta) => {
  const Plantilla = Obtener_Plantilla(Peticion.params.id, Peticion.Usuario);
  if (!Plantilla) return Respuesta.status(404).json({ exito: false, mensaje: 'Plantilla no encontrada.' });
  try {
    if (!fs.existsSync(Ruta_Vista(Plantilla))) await Generar_Vista_Plantilla(Ruta_Plantilla_Existente(Plantilla), Ruta_Vista(Plantilla));
    Respuesta.type('png').sendFile(Ruta_Vista(Plantilla));
  } catch (Error_Vista) {
    Respuesta.status(404).json({ exito: false, mensaje: Error_Vista.message });
  }
});

Rutas.get('/:id/archivo', (Peticion, Respuesta) => {
  const Plantilla = Obtener_Plantilla(Peticion.params.id, Peticion.Usuario);
  if (!Plantilla) return Respuesta.status(404).json({ exito: false, mensaje: 'Plantilla no encontrada.' });
  try {
    Respuesta.type('pdf').attachment(Plantilla.nombre).sendFile(Ruta_Plantilla_Existente(Plantilla));
  } catch (Error_Archivo) {
    Respuesta.status(404).json({ exito: false, mensaje: Error_Archivo.message });
  }
});

module.exports = { Rutas, Obtener_Plantilla, Ruta_Plantilla_Existente, Borrar_Plantillas_De_Institucion };
