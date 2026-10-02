// Rutas del panel por rol: instituciones, solicitudes de acceso, estudiantes,
// lotes, vista del estudiante y el switch de red test / main.
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const Base_Datos = require('./Base_Datos');
const Blockchain = require('./Blockchain');
const Configuracion_Red = require('./Configuracion_Red');
const { Requerir_Sesion, Requerir_Rol } = require('./Autenticacion');
const { Carpeta_Subidas } = require('./Emision_Certificados');

const Rutas = express.Router();
const Precio_Por_Certificado = 0.77;

const Carpeta_Plantillas = path.join(Carpeta_Subidas, 'plantillas');
fs.mkdirSync(Carpeta_Plantillas, { recursive: true });
const Subida_Plantilla = multer({
  storage: multer.diskStorage({
    destination: Carpeta_Plantillas,
    filename: (_Peticion, _Archivo, Listo) => Listo(null, `lote-${Date.now()}-${Math.round(Math.random() * 1e6)}.pdf`),
  }),
});

const Solo_Admin = Requerir_Rol('admin');
const Solo_Personal = Requerir_Rol('admin', 'viewer');

function Es_Admin(Peticion) {
  return Peticion.Usuario?.rol === 'admin';
}

function Es_Correo_Valido(Correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(Correo || '');
}

// El admin elige la institución; las cuentas de institución usan la suya.
function Institucion_De(Peticion, Valor_Admin) {
  return Es_Admin(Peticion) ? Number(Valor_Admin) || null : Number(Peticion.Usuario?.institucion_id) || null;
}

function Completar_Institucion(Institucion) {
  const Conteo = Base_Datos.prepare(`
    SELECT COUNT(*) AS certificados, SUM(CASE WHEN estado = 'nft_transferido' THEN 1 ELSE 0 END) AS entregados
    FROM emisiones WHERE institucion_id = ? AND red = ?
  `).get(Institucion.id, Configuracion_Red.Obtener_Modo_Activo());
  let Estado = 'activa';
  if (!Institucion.wallet) Estado = 'sin wallet';
  else if (Number(Institucion.credito_usd) < 50) Estado = 'credito bajo';
  return { ...Institucion, estado: Estado, certificados: Conteo.certificados || 0, entregados: Conteo.entregados || 0 };
}

function Listar_Instituciones(Peticion) {
  const Filas = Es_Admin(Peticion)
    ? Base_Datos.prepare('SELECT * FROM instituciones ORDER BY nombre').all()
    : Base_Datos.prepare('SELECT * FROM instituciones WHERE id = ?').all(Institucion_De(Peticion));
  return Filas.map(Completar_Institucion);
}

Rutas.use(Requerir_Sesion);

// ---------- Red (test / main) ----------

Rutas.get('/red', (_Peticion, Respuesta) => {
  const Modo = Configuracion_Red.Obtener_Modo_Activo();
  try {
    const Red = Configuracion_Red.Obtener_Red(Modo);
    Respuesta.json({ exito: true, modo: Modo, nombre_red: Red.Nombre_Red, chain_id: Red.Chain_Id, wallet_emisora: Red.Wallet_Emisora, contrato: Red.Direccion_Contrato });
  } catch (Error_Red) {
    Respuesta.json({ exito: true, modo: Modo, error: Error_Red.message });
  }
});

Rutas.get('/red/estado', Solo_Admin, async (_Peticion, Respuesta) => {
  const Redes = await Promise.all(Configuracion_Red.Modos_Validos.map(Configuracion_Red.Describir_Red));
  Respuesta.json({ exito: true, modo: Configuracion_Red.Obtener_Modo_Activo(), redes: Redes });
});

Rutas.put('/red/modo', Solo_Admin, async (Peticion, Respuesta) => {
  try {
    const Modo = await Configuracion_Red.Cambiar_Modo(String(Peticion.body?.modo || ''));
    console.log(`🔀 Modo de red cambiado a ${Modo} por ${Peticion.Usuario.correo}`);
    Respuesta.json({ exito: true, modo: Modo });
  } catch (Error_Red) {
    Respuesta.status(400).json({ exito: false, mensaje: Error_Red.message });
  }
});

// ---------- Instituciones ----------

Rutas.get('/resumen', Solo_Personal, (Peticion, Respuesta) => {
  const Instituciones = Listar_Instituciones(Peticion);
  const Institucion_Id = Institucion_De(Peticion);
  const Pendientes = (Consulta, ...Valores) => Base_Datos.prepare(Consulta).get(...Valores).cantidad;
  Respuesta.json({
    exito: true,
    instituciones: Instituciones,
    resumen: {
      solicitudes_acceso: Es_Admin(Peticion) ? Pendientes("SELECT COUNT(*) AS cantidad FROM solicitudes_acceso WHERE estado = 'pendiente'") : 0,
      lotes_pendientes: Es_Admin(Peticion)
        ? Pendientes("SELECT COUNT(*) AS cantidad FROM lotes_solicitados WHERE estado = 'pendiente'")
        : Pendientes("SELECT COUNT(*) AS cantidad FROM lotes_solicitados WHERE estado = 'pendiente' AND institucion_id = ?", Institucion_Id),
    },
  });
});

Rutas.post('/instituciones', Solo_Admin, (Peticion, Respuesta) => {
  const Nombre = String(Peticion.body?.nombre || '').trim();
  const Etiqueta = String(Peticion.body?.etiqueta || '').trim().toUpperCase();
  const Responsable_Nombre = String(Peticion.body?.responsable_nombre || '').trim();
  const Responsable_Correo = String(Peticion.body?.responsable_correo || '').trim().toLowerCase();
  const Wallet = String(Peticion.body?.wallet || '').trim();
  const Credito = Number(Peticion.body?.credito_usd) || 0;

  if (!Nombre || !Etiqueta) return Respuesta.status(400).json({ exito: false, mensaje: 'Nombre y etiqueta son requeridos.' });
  if (Responsable_Correo && !Es_Correo_Valido(Responsable_Correo)) return Respuesta.status(400).json({ exito: false, mensaje: 'El correo del responsable no es válido.' });
  if (Wallet && !Blockchain.Es_Wallet_Valida(Wallet)) return Respuesta.status(400).json({ exito: false, mensaje: 'La wallet no tiene un formato válido.' });

  try {
    const Resultado = Base_Datos.prepare(`
      INSERT INTO instituciones (nombre, etiqueta, responsable_nombre, responsable_correo, wallet, credito_usd, creado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(Nombre, Etiqueta, Responsable_Nombre || null, Responsable_Correo || null, Wallet || null, Credito, Peticion.Usuario.id);
    const Institucion = Base_Datos.prepare('SELECT * FROM instituciones WHERE id = ?').get(Resultado.lastInsertRowid);
    Respuesta.status(201).json({ exito: true, institucion: Completar_Institucion(Institucion) });
  } catch (Error_Insercion) {
    const Mensaje = /unique/i.test(Error_Insercion.message) ? 'La etiqueta ya está registrada.' : Error_Insercion.message;
    Respuesta.status(409).json({ exito: false, mensaje: Mensaje });
  }
});

// Recarga (o descuento) de crédito de una institución.
Rutas.post('/instituciones/:id/credito', Solo_Admin, (Peticion, Respuesta) => {
  const Monto = Number(Peticion.body?.monto);
  if (!Number.isFinite(Monto) || Monto === 0) return Respuesta.status(400).json({ exito: false, mensaje: 'Ingresa un monto distinto de cero.' });
  const Resultado = Base_Datos.prepare('UPDATE instituciones SET credito_usd = MAX(credito_usd + ?, 0) WHERE id = ?').run(Monto, Number(Peticion.params.id));
  if (!Resultado.changes) return Respuesta.status(404).json({ exito: false, mensaje: 'Institución no encontrada.' });
  Respuesta.json({ exito: true });
});

// ---------- Solicitudes de acceso (cuentas de institución) ----------

Rutas.get('/solicitudes-acceso', Solo_Admin, (_Peticion, Respuesta) => {
  const Solicitudes = Base_Datos.prepare(`
    SELECT s.*, u.nombre, u.correo, i.nombre AS institucion_nombre, i.etiqueta AS institucion_etiqueta
    FROM solicitudes_acceso s
    JOIN usuarios u ON u.id = s.usuario_id
    JOIN instituciones i ON i.id = s.institucion_id
    WHERE s.estado = 'pendiente'
    ORDER BY s.creado_en DESC, s.id DESC
  `).all();
  Respuesta.json({ exito: true, solicitudes: Solicitudes });
});

Rutas.post('/solicitudes-acceso/:id/resolver', Solo_Admin, (Peticion, Respuesta) => {
  const Aprobar = Peticion.body?.accion === 'aprobar';
  if (!['aprobar', 'rechazar'].includes(Peticion.body?.accion)) return Respuesta.status(400).json({ exito: false, mensaje: 'Acción inválida.' });
  const Solicitud = Base_Datos.prepare("SELECT * FROM solicitudes_acceso WHERE id = ? AND estado = 'pendiente'").get(Number(Peticion.params.id));
  if (!Solicitud) return Respuesta.status(404).json({ exito: false, mensaje: 'Solicitud pendiente no encontrada.' });

  Base_Datos.prepare("UPDATE solicitudes_acceso SET estado = ?, resuelto_por = ?, resuelto_en = datetime('now') WHERE id = ?")
    .run(Aprobar ? 'aprobada' : 'rechazada', Peticion.Usuario.id, Solicitud.id);
  Base_Datos.prepare('UPDATE usuarios SET estado = ? WHERE id = ?').run(Aprobar ? 'activo' : 'rechazado', Solicitud.usuario_id);
  Respuesta.json({ exito: true });
});

// ---------- Estudiantes de una institución ----------

Rutas.get('/estudiantes', Solo_Personal, (Peticion, Respuesta) => {
  const Institucion_Id = Institucion_De(Peticion, Peticion.query.institucion_id);
  const Estudiantes = Institucion_Id
    ? Base_Datos.prepare('SELECT * FROM estudiantes_institucionales WHERE institucion_id = ? ORDER BY creado_en DESC, id DESC').all(Institucion_Id)
    : [];
  Respuesta.json({ exito: true, estudiantes: Estudiantes });
});

Rutas.post('/estudiantes', Solo_Personal, (Peticion, Respuesta) => {
  const Institucion_Id = Institucion_De(Peticion, Peticion.body?.institucion_id);
  const Nombre = String(Peticion.body?.nombre || '').trim();
  const Correo = String(Peticion.body?.correo || '').trim().toLowerCase();
  const Wallet = String(Peticion.body?.wallet || '').trim();
  if (!Institucion_Id || !Nombre) return Respuesta.status(400).json({ exito: false, mensaje: 'Institución y nombre son requeridos.' });
  if (Correo && !Es_Correo_Valido(Correo)) return Respuesta.status(400).json({ exito: false, mensaje: 'El correo no es válido.' });

  const Resultado = Base_Datos.prepare('INSERT INTO estudiantes_institucionales (institucion_id, nombre, correo, wallet, creado_por) VALUES (?, ?, ?, ?, ?)')
    .run(Institucion_Id, Nombre, Correo || null, Wallet || null, Peticion.Usuario.id);
  const Estudiante = Base_Datos.prepare('SELECT * FROM estudiantes_institucionales WHERE id = ?').get(Resultado.lastInsertRowid);
  Respuesta.status(201).json({ exito: true, estudiante: Estudiante });
});

Rutas.delete('/estudiantes/:id', Solo_Personal, (Peticion, Respuesta) => {
  const Estudiante = Base_Datos.prepare('SELECT * FROM estudiantes_institucionales WHERE id = ?').get(Number(Peticion.params.id));
  if (!Estudiante) return Respuesta.status(404).json({ exito: false, mensaje: 'Estudiante no encontrado.' });
  if (!Es_Admin(Peticion) && Estudiante.institucion_id !== Institucion_De(Peticion)) {
    return Respuesta.status(403).json({ exito: false, mensaje: 'No puedes modificar este estudiante.' });
  }
  Base_Datos.prepare('DELETE FROM estudiantes_institucionales WHERE id = ?').run(Estudiante.id);
  Respuesta.json({ exito: true });
});

// ---------- Lotes solicitados por las instituciones ----------

Rutas.get('/lotes', Solo_Personal, (Peticion, Respuesta) => {
  const Filtro = Es_Admin(Peticion) ? '' : 'WHERE l.institucion_id = ?';
  const Consulta = Base_Datos.prepare(`
    SELECT l.id, l.institucion_id, l.nombre, l.plantilla_nombre, l.cantidad, l.costo_usd, l.estado, l.red,
           l.creado_en, l.resuelto_en, i.nombre AS institucion_nombre, i.etiqueta AS institucion_etiqueta, i.credito_usd
    FROM lotes_solicitados l JOIN instituciones i ON i.id = l.institucion_id
    ${Filtro} ORDER BY l.creado_en DESC, l.id DESC
  `);
  const Lotes = Es_Admin(Peticion) ? Consulta.all() : Consulta.all(Institucion_De(Peticion));
  Respuesta.json({ exito: true, lotes: Lotes, precio_unitario: Precio_Por_Certificado });
});

// La institución envía el lote con su plantilla PDF; se guarda una copia de
// sus estudiantes con wallet válida para que el admin emita exactamente eso.
Rutas.post('/lotes', Solo_Personal, Subida_Plantilla.single('plantilla'), (Peticion, Respuesta) => {
  const Institucion_Id = Institucion_De(Peticion, Peticion.body?.institucion_id);
  const Nombre = String(Peticion.body?.nombre || '').trim();
  const Borrar_Plantilla = () => Peticion.file && fs.existsSync(Peticion.file.path) && fs.unlinkSync(Peticion.file.path);

  if (!Institucion_Id || !Nombre) {
    Borrar_Plantilla();
    return Respuesta.status(400).json({ exito: false, mensaje: 'Institución y nombre del lote son requeridos.' });
  }
  if (!Peticion.file) return Respuesta.status(400).json({ exito: false, mensaje: 'Adjunta la plantilla PDF del lote.' });

  const Estudiantes = Base_Datos.prepare('SELECT nombre, wallet FROM estudiantes_institucionales WHERE institucion_id = ? ORDER BY id').all(Institucion_Id)
    .filter((Estudiante) => Blockchain.Es_Wallet_Valida(Estudiante.wallet));
  if (!Estudiantes.length) {
    Borrar_Plantilla();
    return Respuesta.status(400).json({ exito: false, mensaje: 'No hay estudiantes con wallet válida para este lote.' });
  }

  const Costo = Number((Estudiantes.length * Precio_Por_Certificado).toFixed(2));
  const Resultado = Base_Datos.prepare(`
    INSERT INTO lotes_solicitados (institucion_id, nombre, plantilla_nombre, plantilla_archivo, estudiantes_json, cantidad, costo_usd, creado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(Institucion_Id, Nombre, Peticion.file.originalname, Peticion.file.filename, JSON.stringify(Estudiantes), Estudiantes.length, Costo, Peticion.Usuario.id);
  Respuesta.status(201).json({ exito: true, lote_id: Number(Resultado.lastInsertRowid) });
});

// Aprobar descuenta el costo del crédito, salvo en modo test (pruebas sin costo).
Rutas.post('/lotes/:id/resolver', Solo_Admin, (Peticion, Respuesta) => {
  const Aprobar = Peticion.body?.accion === 'aprobar';
  if (!['aprobar', 'rechazar'].includes(Peticion.body?.accion)) return Respuesta.status(400).json({ exito: false, mensaje: 'Acción inválida.' });
  const Lote = Base_Datos.prepare("SELECT * FROM lotes_solicitados WHERE id = ? AND estado = 'pendiente'").get(Number(Peticion.params.id));
  if (!Lote) return Respuesta.status(404).json({ exito: false, mensaje: 'Lote pendiente no encontrado.' });

  const Modo = Configuracion_Red.Obtener_Modo_Activo();
  const Cobrar = Aprobar && Modo === 'main';
  if (Cobrar) {
    const Institucion = Base_Datos.prepare('SELECT credito_usd FROM instituciones WHERE id = ?').get(Lote.institucion_id);
    if (Number(Institucion?.credito_usd) < Number(Lote.costo_usd)) {
      return Respuesta.status(409).json({ exito: false, mensaje: 'La institución no tiene crédito suficiente.' });
    }
  }

  Base_Datos.exec('BEGIN');
  try {
    if (Cobrar) Base_Datos.prepare('UPDATE instituciones SET credito_usd = credito_usd - ? WHERE id = ?').run(Lote.costo_usd, Lote.institucion_id);
    Base_Datos.prepare("UPDATE lotes_solicitados SET estado = ?, red = ?, resuelto_por = ?, resuelto_en = datetime('now') WHERE id = ?")
      .run(Aprobar ? 'aprobada' : 'rechazada', Modo, Peticion.Usuario.id, Lote.id);
    Base_Datos.exec('COMMIT');
  } catch (Error_Lote) {
    Base_Datos.exec('ROLLBACK');
    return Respuesta.status(500).json({ exito: false, mensaje: Error_Lote.message });
  }
  Respuesta.json({ exito: true, cobrado: Cobrar });
});

// ---------- Vista del estudiante ----------

Rutas.get('/mis-certificados', Requerir_Rol('student'), (Peticion, Respuesta) => {
  const Wallet = Base_Datos.prepare('SELECT wallet FROM usuarios WHERE id = ?').get(Peticion.Usuario.id)?.wallet || null;
  const Certificados = Wallet
    ? Base_Datos.prepare(`
        SELECT e.id, e.nombre_alumno, e.token_id, e.tx_hash, e.explorer_url, e.estado, e.final_pdf_url, e.pdf_cid,
               e.red, e.creado_en, i.nombre AS institucion_nombre
        FROM emisiones e LEFT JOIN instituciones i ON i.id = e.institucion_id
        WHERE lower(e.wallet_alumno) = lower(?) AND e.token_id IS NOT NULL
        ORDER BY e.creado_en DESC, e.id DESC
      `).all(Wallet)
    : [];
  Respuesta.json({ exito: true, wallet: Wallet, certificados: Certificados });
});

Rutas.put('/mi-wallet', Requerir_Rol('student'), (Peticion, Respuesta) => {
  const Wallet = String(Peticion.body?.wallet || '').trim();
  if (!Blockchain.Es_Wallet_Valida(Wallet)) return Respuesta.status(400).json({ exito: false, mensaje: 'La wallet no tiene un formato válido.' });
  Base_Datos.prepare('UPDATE usuarios SET wallet = ? WHERE id = ?').run(Wallet, Peticion.Usuario.id);
  Respuesta.json({ exito: true, wallet: Wallet });
});

module.exports = Rutas;
