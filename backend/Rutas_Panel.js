// Rutas del panel por rol: instituciones (alta, marca y borrado), estudiantes,
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
const { Crear_Enlace_Recuperacion } = require('./Recuperacion');
const Marca = require('./Marca_Institucion');
const bcrypt = require('bcryptjs');

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

fs.mkdirSync(Marca.Carpeta_Logos, { recursive: true });
const Extensiones_Logo = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const Subida_Logo = multer({
  storage: multer.diskStorage({
    destination: Marca.Carpeta_Logos,
    filename: (_Peticion, Archivo, Listo) => Listo(null, `logo-${Date.now()}-${Math.round(Math.random() * 1e6)}.${Extensiones_Logo[Archivo.mimetype]}`),
  }),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (_Peticion, Archivo, Listo) => Listo(Extensiones_Logo[Archivo.mimetype] ? null : Object.assign(new Error('El logo debe ser PNG, JPG o WebP.'), { status: 400 }), Boolean(Extensiones_Logo[Archivo.mimetype])),
});

function Borrar_Archivo(Ruta) {
  if (Ruta && fs.existsSync(Ruta)) fs.unlinkSync(Ruta);
}

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
  const Administrador = Base_Datos.prepare("SELECT correo FROM usuarios WHERE institucion_id = ? AND rol = 'viewer' ORDER BY id LIMIT 1").get(Institucion.id);
  const Estudiantes = Base_Datos.prepare('SELECT COUNT(*) AS cantidad FROM estudiantes_institucionales WHERE institucion_id = ?').get(Institucion.id);
  return {
    ...Institucion,
    ...Marca.Datos_Marca(Institucion),
    estado: Number(Institucion.credito_usd) < 50 ? 'credito bajo' : 'activa',
    admin_correo: Administrador?.correo || null,
    estudiantes: Estudiantes.cantidad,
    certificados: Conteo.certificados || 0,
    entregados: Conteo.entregados || 0,
  };
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
      lotes_pendientes: Es_Admin(Peticion)
        ? Pendientes("SELECT COUNT(*) AS cantidad FROM lotes_solicitados WHERE estado = 'pendiente'")
        : Pendientes("SELECT COUNT(*) AS cantidad FROM lotes_solicitados WHERE estado = 'pendiente' AND institucion_id = ?", Institucion_Id),
    },
  });
});

function Validar_Cuenta_Institucional(Correo, Contrasena, Obligatoria, Usuario_Id = null) {
  if (Obligatoria && (!Correo || !Contrasena)) return 'Correo y contraseña del administrador institucional son requeridos.';
  if (Correo && !Es_Correo_Valido(Correo)) return 'El correo del administrador institucional no es válido.';
  if (Contrasena && Contrasena.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  const Existente = Correo && Base_Datos.prepare('SELECT id FROM usuarios WHERE correo = ?').get(Correo);
  if (Existente && Existente.id !== Usuario_Id) return 'Ya existe una cuenta con ese correo.';
  return null;
}

// Alta de institución con su ruta de registro, marca y cuenta del admin
// institucional (rol "viewer"). Multipart: logo opcional.
Rutas.post('/instituciones', Solo_Admin, Subida_Logo.single('logo'), async (Peticion, Respuesta) => {
  const Nombre = String(Peticion.body?.nombre || '').trim();
  const Slug = Marca.Crear_Slug(Nombre);
  const Color = String(Peticion.body?.color || Marca.Color_Predeterminado);
  const Responsable = String(Peticion.body?.responsable_nombre || '').trim();
  const Correo = String(Peticion.body?.correo_admin || '').trim().toLowerCase();
  const Contrasena = String(Peticion.body?.contrasena_admin || '');
  const Credito = Number(Peticion.body?.credito_usd) || 0;
  const Fallar = (Codigo, Mensaje) => { Borrar_Archivo(Peticion.file?.path); Respuesta.status(Codigo).json({ exito: false, mensaje: Mensaje }); };

  if (!Nombre || !Slug) return Fallar(400, 'El nombre de la institución es requerido.');
  if (!Marca.Es_Color_Valido(Color)) return Fallar(400, 'El color debe tener el formato #RRGGBB.');
  if (Base_Datos.prepare('SELECT id FROM instituciones WHERE slug = ?').get(Slug)) return Fallar(409, `Ya existe una institución con la ruta /registro_${Slug}.`);
  const Error_Cuenta = Validar_Cuenta_Institucional(Correo, Contrasena, true);
  if (Error_Cuenta) return Fallar(400, Error_Cuenta);

  const Hash = await bcrypt.hash(Contrasena, 12);
  Base_Datos.exec('BEGIN');
  try {
    const Resultado = Base_Datos.prepare(`
      INSERT INTO instituciones (nombre, etiqueta, slug, color, logo_archivo, responsable_nombre, responsable_correo, credito_usd, creado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(Nombre, Slug.toUpperCase(), Slug, Color, Peticion.file?.filename || null, Responsable || null, Correo, Credito, Peticion.Usuario.id);
    Base_Datos.prepare("INSERT INTO usuarios (correo, contrasena_hash, nombre, rol, institucion_id, estado) VALUES (?, ?, ?, 'viewer', ?, 'activo')")
      .run(Correo, Hash, Responsable || `Admin ${Nombre}`, Resultado.lastInsertRowid);
    Base_Datos.exec('COMMIT');
    const Institucion = Base_Datos.prepare('SELECT * FROM instituciones WHERE id = ?').get(Resultado.lastInsertRowid);
    Respuesta.status(201).json({ exito: true, institucion: Completar_Institucion(Institucion) });
  } catch (Error_Insercion) {
    Base_Datos.exec('ROLLBACK');
    Fallar(500, Error_Insercion.message);
  }
});

// Edición: color, logo, responsable y cuenta del admin institucional. El
// nombre (y por lo tanto la ruta de registro) no cambia.
Rutas.patch('/instituciones/:id', Solo_Admin, Subida_Logo.single('logo'), async (Peticion, Respuesta) => {
  const Institucion = Base_Datos.prepare('SELECT * FROM instituciones WHERE id = ?').get(Number(Peticion.params.id));
  const Fallar = (Codigo, Mensaje) => { Borrar_Archivo(Peticion.file?.path); Respuesta.status(Codigo).json({ exito: false, mensaje: Mensaje }); };
  if (!Institucion) return Fallar(404, 'Institución no encontrada.');

  const Color = String(Peticion.body?.color || Institucion.color || Marca.Color_Predeterminado);
  const Responsable = String(Peticion.body?.responsable_nombre ?? Institucion.responsable_nombre ?? '').trim();
  const Correo = String(Peticion.body?.correo_admin || '').trim().toLowerCase();
  const Contrasena = String(Peticion.body?.contrasena_admin || '');
  if (!Marca.Es_Color_Valido(Color)) return Fallar(400, 'El color debe tener el formato #RRGGBB.');

  const Administrador = Base_Datos.prepare("SELECT * FROM usuarios WHERE institucion_id = ? AND rol = 'viewer' ORDER BY id LIMIT 1").get(Institucion.id);
  const Error_Cuenta = Validar_Cuenta_Institucional(Correo, Contrasena, !Administrador && (Correo || Contrasena), Administrador?.id);
  if (Error_Cuenta) return Fallar(400, Error_Cuenta);

  if (Peticion.file) Borrar_Archivo(Institucion.logo_archivo && path.join(Marca.Carpeta_Logos, Institucion.logo_archivo));
  Base_Datos.prepare('UPDATE instituciones SET color = ?, responsable_nombre = ?, responsable_correo = COALESCE(?, responsable_correo), logo_archivo = COALESCE(?, logo_archivo) WHERE id = ?')
    .run(Color, Responsable || null, Correo || null, Peticion.file?.filename || null, Institucion.id);

  if (Administrador) {
    if (Correo) Base_Datos.prepare('UPDATE usuarios SET correo = ? WHERE id = ?').run(Correo, Administrador.id);
    if (Contrasena) Base_Datos.prepare('UPDATE usuarios SET contrasena_hash = ? WHERE id = ?').run(await bcrypt.hash(Contrasena, 12), Administrador.id);
  } else if (Correo && Contrasena) {
    Base_Datos.prepare("INSERT INTO usuarios (correo, contrasena_hash, nombre, rol, institucion_id, estado) VALUES (?, ?, ?, 'viewer', ?, 'activo')")
      .run(Correo, await bcrypt.hash(Contrasena, 12), Responsable || `Admin ${Institucion.nombre}`, Institucion.id);
  }
  Respuesta.json({ exito: true, institucion: Completar_Institucion(Base_Datos.prepare('SELECT * FROM instituciones WHERE id = ?').get(Institucion.id)) });
});

// Borra la institución. Sus estudiantes (cuentas y lista) y sus certificados
// pasan a la institución principal (Blockfinity Advisors), así siguen
// pudiendo entrar y ver sus certificados. Se borran sus cuentas de admin
// institucional, sus lotes y su logo.
Rutas.delete('/instituciones/:id', Solo_Admin, (Peticion, Respuesta) => {
  const Institucion = Base_Datos.prepare('SELECT * FROM instituciones WHERE id = ?').get(Number(Peticion.params.id));
  if (!Institucion) return Respuesta.status(404).json({ exito: false, mensaje: 'Institución no encontrada.' });
  if (Institucion.es_principal) return Respuesta.status(400).json({ exito: false, mensaje: 'La institución principal no se puede eliminar.' });
  const Principal_Id = Marca.Id_Institucion_Principal(Base_Datos);
  const Plantillas = Base_Datos.prepare('SELECT plantilla_archivo FROM lotes_solicitados WHERE institucion_id = ? AND plantilla_archivo IS NOT NULL').all(Institucion.id);

  Base_Datos.exec('BEGIN');
  try {
    Base_Datos.prepare("DELETE FROM reset_tokens WHERE user_id IN (SELECT id FROM usuarios WHERE institucion_id = ? AND rol = 'viewer')").run(Institucion.id);
    Base_Datos.prepare("DELETE FROM usuarios WHERE institucion_id = ? AND rol = 'viewer'").run(Institucion.id);
    Base_Datos.prepare("UPDATE usuarios SET institucion_id = ? WHERE institucion_id = ? AND rol = 'student'").run(Principal_Id, Institucion.id);
    Base_Datos.prepare('UPDATE estudiantes_institucionales SET institucion_id = ? WHERE institucion_id = ?').run(Principal_Id, Institucion.id);
    Base_Datos.prepare('UPDATE emisiones SET institucion_id = ? WHERE institucion_id = ?').run(Principal_Id, Institucion.id);
    Base_Datos.prepare('DELETE FROM solicitudes_acceso WHERE institucion_id = ?').run(Institucion.id);
    Base_Datos.prepare('DELETE FROM lotes_solicitados WHERE institucion_id = ?').run(Institucion.id);
    Base_Datos.prepare('DELETE FROM instituciones WHERE id = ?').run(Institucion.id);
    Base_Datos.exec('COMMIT');
  } catch (Error_Borrado) {
    Base_Datos.exec('ROLLBACK');
    return Respuesta.status(500).json({ exito: false, mensaje: Error_Borrado.message });
  }
  Borrar_Archivo(Institucion.logo_archivo && path.join(Marca.Carpeta_Logos, Institucion.logo_archivo));
  for (const Lote of Plantillas) Borrar_Archivo(path.join(Carpeta_Plantillas, Lote.plantilla_archivo));
  console.log(`🗑️ Institución "${Institucion.nombre}" eliminada por ${Peticion.Usuario.correo}; sus estudiantes pasan a la institución principal`);
  Respuesta.json({ exito: true });
});

// Recarga (o descuento) de crédito de una institución.
Rutas.post('/instituciones/:id/credito', Solo_Admin, (Peticion, Respuesta) => {
  const Monto = Number(Peticion.body?.monto);
  if (!Number.isFinite(Monto) || Monto === 0) return Respuesta.status(400).json({ exito: false, mensaje: 'Ingresa un monto distinto de cero.' });
  const Resultado = Base_Datos.prepare('UPDATE instituciones SET credito_usd = MAX(credito_usd + ?, 0) WHERE id = ?').run(Monto, Number(Peticion.params.id));
  if (!Resultado.changes) return Respuesta.status(404).json({ exito: false, mensaje: 'Institución no encontrada.' });
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
  // Si se registró por la ruta de la institución, también pierde el acceso.
  if (Estudiante.usuario_id) Base_Datos.prepare("DELETE FROM usuarios WHERE id = ? AND rol = 'student'").run(Estudiante.usuario_id);
  Respuesta.json({ exito: true });
});

// Enlace para que un estudiante cree una contraseña nueva (útil si el
// servidor no tiene correo configurado). Válido 1 hora, un solo uso.
Rutas.post('/estudiantes/:id/enlace-recuperacion', Solo_Personal, (Peticion, Respuesta) => {
  const Estudiante = Base_Datos.prepare('SELECT * FROM estudiantes_institucionales WHERE id = ?').get(Number(Peticion.params.id));
  if (!Estudiante) return Respuesta.status(404).json({ exito: false, mensaje: 'Estudiante no encontrado.' });
  if (!Es_Admin(Peticion) && Estudiante.institucion_id !== Institucion_De(Peticion)) {
    return Respuesta.status(403).json({ exito: false, mensaje: 'No puedes modificar este estudiante.' });
  }
  if (!Estudiante.usuario_id) return Respuesta.status(400).json({ exito: false, mensaje: 'Este estudiante no tiene cuenta: se agregó a mano, no por el registro.' });
  Respuesta.json({ exito: true, enlace: Crear_Enlace_Recuperacion(Peticion, Estudiante.usuario_id) });
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
  Base_Datos.prepare('UPDATE estudiantes_institucionales SET wallet = ? WHERE usuario_id = ?').run(Wallet, Peticion.Usuario.id);
  Respuesta.json({ exito: true, wallet: Wallet });
});

module.exports = Rutas;
