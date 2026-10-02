// Rutas del administrador: asistente de emisión, historial y registros de
// wallet (tabla participantes). Todas exigen sesión de admin (ver Servidor.js).
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const Base_Datos = require('./Base_Datos');
const Blockchain = require('./Blockchain');
const Configuracion_Red = require('./Configuracion_Red');
const Emision = require('./Emision_Certificados');

const Rutas = express.Router();
const Subida = multer({ dest: Emision.Carpeta_Subidas });

const Eventos_Validos = ['foro', 'asoban'];

function Borrar_Archivos(...Archivos) {
  for (const Archivo of Archivos) if (Archivo?.path && fs.existsSync(Archivo.path)) fs.unlinkSync(Archivo.path);
}

function Responder_Error(Respuesta, Error_Ruta, Estado = 500) {
  console.error('❌', Error_Ruta.message);
  Respuesta.status(Estado).json({ exito: false, mensaje: Error_Ruta.message || 'Error inesperado.' });
}

// Lee el Excel (columnas "nombre" y "wallet") y valida cada fila.
function Leer_Filas_Excel(Ruta_Excel) {
  const Libro = xlsx.readFile(Ruta_Excel);
  const Filas = xlsx.utils.sheet_to_json(Libro.Sheets[Libro.SheetNames[0]], { defval: '' });
  return Filas.map((Fila, Indice) => Validar_Fila({
    fila: Indice + 2,
    nombre: Fila.nombre || Fila.Nombre || Fila.estudiante || Fila.Estudiante,
    wallet: Fila.wallet || Fila.Wallet || Fila.wallet_destino || Fila.walletAddress,
  }));
}

function Validar_Fila({ fila, nombre, wallet }) {
  const Nombre = String(nombre || '').trim();
  const Wallet = String(wallet || '').trim();
  let Error_Fila = null;
  if (!Nombre) Error_Fila = 'Falta el nombre.';
  else if (!Wallet) Error_Fila = 'Falta la wallet.';
  else if (!Blockchain.Es_Wallet_Valida(Wallet)) Error_Fila = 'Wallet con formato inválido.';
  return { fila, nombre: Nombre, wallet: Wallet, valido: !Error_Fila, error: Error_Fila };
}

// Estudiantes y plantilla adjuntos a un lote aprobado por el admin.
function Leer_Lote_Aprobado(Lote_Id) {
  const Lote = Base_Datos.prepare("SELECT * FROM lotes_solicitados WHERE id = ? AND estado = 'aprobada'").get(Lote_Id);
  if (!Lote) throw new Error('El lote no existe o todavía no está aprobado.');
  const Estudiantes = JSON.parse(Lote.estudiantes_json || '[]');
  return {
    Lote,
    Filas: Estudiantes.map((Estudiante, Indice) => Validar_Fila({ fila: Indice + 1, ...Estudiante })),
  };
}

Rutas.post('/validar-excel', Subida.single('excel'), (Peticion, Respuesta) => {
  try {
    if (!Peticion.file) return Respuesta.status(400).json({ exito: false, mensaje: 'Debes subir un archivo Excel.' });
    const Filas = Leer_Filas_Excel(Peticion.file.path);
    if (!Filas.length) return Respuesta.status(400).json({ exito: false, mensaje: 'El Excel no contiene registros.' });
    Respuesta.json({ exito: true, filas: Filas });
  } catch (Error_Ruta) {
    Responder_Error(Respuesta, Error_Ruta);
  } finally {
    Borrar_Archivos(Peticion.file);
  }
});

// Filas de un lote aprobado (en vez de un Excel).
Rutas.get('/lote/:id/filas', (Peticion, Respuesta) => {
  try {
    const { Lote, Filas } = Leer_Lote_Aprobado(Number(Peticion.params.id));
    Respuesta.json({ exito: true, filas: Filas, tiene_plantilla: Boolean(Lote.plantilla_archivo), plantilla_nombre: Lote.plantilla_nombre });
  } catch (Error_Ruta) {
    Responder_Error(Respuesta, Error_Ruta, 400);
  }
});

// Paso 3: genera y sube a IPFS el PDF base (sin QR) de cada fila válida.
// Los datos salen del Excel subido o de un lote aprobado (lote_id).
Rutas.post('/masivo/preparar', Subida.fields([{ name: 'plantilla', maxCount: 1 }, { name: 'excel', maxCount: 1 }]), async (Peticion, Respuesta) => {
  const Plantilla = Peticion.files?.plantilla?.[0];
  const Excel = Peticion.files?.excel?.[0];
  try {
    const Red = Configuracion_Red.Obtener_Red_Activa();
    const Lote_Id = Number(Peticion.body?.lote_id) || null;
    let Filas = [];
    let Ruta_Plantilla = Plantilla?.path;

    if (Lote_Id) {
      const Datos_Lote = Leer_Lote_Aprobado(Lote_Id);
      Filas = Datos_Lote.Filas;
      if (!Ruta_Plantilla && Datos_Lote.Lote.plantilla_archivo) {
        Ruta_Plantilla = path.join(Emision.Carpeta_Subidas, 'plantillas', Datos_Lote.Lote.plantilla_archivo);
      }
    } else if (Excel) {
      Filas = Leer_Filas_Excel(Excel.path);
    }

    if (!Ruta_Plantilla || !fs.existsSync(Ruta_Plantilla)) {
      return Respuesta.status(400).json({ exito: false, mensaje: 'Debes subir la plantilla PDF.' });
    }
    const Filas_Validas = Filas.filter((Fila) => Fila.valido);
    if (!Filas_Validas.length) return Respuesta.status(400).json({ exito: false, mensaje: 'No hay filas válidas para emitir.' });

    const Bytes_Plantilla = fs.readFileSync(Ruta_Plantilla);
    const Certificados = [];
    for (const Fila of Filas_Validas) {
      console.log(`📝 PDF base fila ${Fila.fila}: ${Fila.nombre}`);
      Certificados.push({ ...Fila, ...(await Emision.Preparar_Pdf_Base(Fila.nombre, Bytes_Plantilla, Red)) });
    }
    Respuesta.json({ exito: true, certificados: Certificados });
  } catch (Error_Ruta) {
    Responder_Error(Respuesta, Error_Ruta);
  } finally {
    Borrar_Archivos(Plantilla, Excel);
  }
});

// Estado en memoria de cada emisión masiva en curso (id -> trabajo).
const Trabajos = new Map();

// Paso 4: responde de inmediato con un id y emite en segundo plano, un
// alumno a la vez. El navegador consulta el avance cada 2 segundos.
Rutas.post('/masivo/emitir', async (Peticion, Respuesta) => {
  const Certificados = Array.isArray(Peticion.body?.certificados) ? Peticion.body.certificados : [];
  if (!Certificados.length) return Respuesta.status(400).json({ exito: false, mensaje: 'No hay certificados para emitir.' });
  const Invalido = Certificados.find((C) => !Blockchain.Es_Wallet_Valida(C.wallet) || !C.pdf_cid || !C.nombre);
  if (Invalido) {
    return Respuesta.status(400).json({ exito: false, mensaje: `Datos incompletos para ${Invalido.nombre || 'un alumno'}. Vuelve a generar los certificados.` });
  }

  let Red;
  try {
    Red = await Configuracion_Red.Validar_Red(Configuracion_Red.Obtener_Modo_Activo());
  } catch (Error_Red) {
    return Responder_Error(Respuesta, Error_Red, 400);
  }

  const Institucion_Id = Number(Peticion.body?.institucion_id) || null;
  const Lote_Solicitado_Id = Number(Peticion.body?.lote_id) || null;
  const Base_Url = Emision.Base_Verificacion(Peticion);
  const Trabajo_Id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const Trabajo = {
    estado: 'procesando',
    red: Red.Modo,
    detalles: Certificados.map((C) => ({ fila: C.fila, nombre: C.nombre, wallet: C.wallet, pdf_cid: C.pdf_cid, etapa: 'en_cola' })),
  };
  Trabajos.set(Trabajo_Id, Trabajo);
  Respuesta.status(202).json({ exito: true, trabajo_id: Trabajo_Id });

  console.log(`\n⛓️ Emisión ${Trabajo_Id}: ${Certificados.length} certificado(s) en modo ${Red.Modo}`);
  try {
    for (const Detalle of Trabajo.detalles) {
      const Registro = {
        lote_id: Trabajo_Id,
        nombre_alumno: Detalle.nombre,
        wallet_alumno: Detalle.wallet,
        creado_por: Peticion.Usuario.id,
        institucion_id: Institucion_Id,
        pdf_cid: Detalle.pdf_cid,
        red: Red.Modo,
      };
      try {
        const Resultado = await Emision.Emitir_Certificado({
          Red,
          Nombre_Alumno: Detalle.nombre,
          Wallet_Alumno: Detalle.wallet,
          Pdf_Cid: Detalle.pdf_cid,
          Base_Url,
          Al_Cambiar_Etapa: (Etapa, Datos) => Object.assign(Detalle, Datos, { etapa: Etapa }),
        });
        Object.assign(Detalle, Resultado, { etapa: Resultado.estado === 'nft_transferido' ? 'confirmado' : 'revisar' });
        Emision.Guardar_Emision({ ...Registro, ...Resultado });
      } catch (Error_Minteo) {
        console.error(`❌ ${Detalle.nombre}:`, Error_Minteo.message);
        Object.assign(Detalle, { etapa: 'error', estado: 'error_minteo', error: Error_Minteo.message });
        Emision.Guardar_Emision({ ...Registro, estado: 'error_minteo', error: Error_Minteo.message, tx_hash: Detalle.tx_hash, explorer_url: Detalle.explorer_url });
      }
    }

    if (Lote_Solicitado_Id) {
      Base_Datos.prepare("UPDATE lotes_solicitados SET estado = 'emitida' WHERE id = ?").run(Lote_Solicitado_Id);
    }
    Trabajo.estado = 'completado';
    console.log(`✅ Emisión ${Trabajo_Id} completada`);
  } catch (Error_Trabajo) {
    Trabajo.estado = 'error';
    Trabajo.error = Error_Trabajo.message;
    console.error(`❌ Emisión ${Trabajo_Id}:`, Error_Trabajo.message);
  }
  setTimeout(() => Trabajos.delete(Trabajo_Id), 30 * 60 * 1000);
});

Rutas.get('/masivo/emitir/:id', (Peticion, Respuesta) => {
  const Trabajo = Trabajos.get(Peticion.params.id);
  if (!Trabajo) return Respuesta.status(404).json({ exito: false, mensaje: 'No se encontró ese proceso de emisión.' });
  Respuesta.json({ exito: true, ...Trabajo });
});

// Emisión de un solo alumno por API (multipart: plantilla, nombre, wallet).
Rutas.post('/individual', Subida.single('plantilla'), async (Peticion, Respuesta) => {
  const Fila = Validar_Fila({ fila: 1, nombre: Peticion.body?.nombre, wallet: Peticion.body?.wallet });
  try {
    if (!Peticion.file) return Respuesta.status(400).json({ exito: false, mensaje: 'Debes subir la plantilla PDF.' });
    if (!Fila.valido) return Respuesta.status(400).json({ exito: false, mensaje: Fila.error });

    const Red = await Configuracion_Red.Validar_Red(Configuracion_Red.Obtener_Modo_Activo());
    const Base = await Emision.Preparar_Pdf_Base(Fila.nombre, fs.readFileSync(Peticion.file.path), Red);
    const Resultado = await Emision.Emitir_Certificado({
      Red,
      Nombre_Alumno: Fila.nombre,
      Wallet_Alumno: Fila.wallet,
      Pdf_Cid: Base.pdf_cid,
      Base_Url: Emision.Base_Verificacion(Peticion),
    });
    Emision.Guardar_Emision({
      lote_id: `individual-${Date.now()}`,
      nombre_alumno: Fila.nombre,
      wallet_alumno: Fila.wallet,
      creado_por: Peticion.Usuario.id,
      institucion_id: Number(Peticion.body?.institucion_id) || null,
      red: Red.Modo,
      ...Resultado,
    });
    Respuesta.json({ exito: true, red: Red.Modo, ...Resultado });
  } catch (Error_Ruta) {
    Responder_Error(Respuesta, Error_Ruta);
  } finally {
    Borrar_Archivos(Peticion.file);
  }
});

// Historial de emisiones del modo indicado (?red=test|main), con resumen.
Rutas.get('/historial', (Peticion, Respuesta) => {
  const Red = Configuracion_Red.Modos_Validos.includes(Peticion.query.red) ? Peticion.query.red : Configuracion_Red.Obtener_Modo_Activo();
  const Institucion_Id = Number(Peticion.query.institucion_id) || null;
  const Emisiones = Base_Datos.prepare(`
    SELECT e.*, i.nombre AS institucion_nombre, i.etiqueta AS institucion_etiqueta
    FROM emisiones e LEFT JOIN instituciones i ON i.id = e.institucion_id
    WHERE e.red = ? AND (? IS NULL OR e.institucion_id = ?)
    ORDER BY e.creado_en DESC, e.id DESC
  `).all(Red, Institucion_Id, Institucion_Id);

  Respuesta.json({
    exito: true,
    red: Red,
    resumen: {
      total: Emisiones.length,
      entregados: Emisiones.filter((E) => E.estado === 'nft_transferido').length,
      con_error: Emisiones.filter((E) => E.estado !== 'nft_transferido').length,
      lotes: new Set(Emisiones.map((E) => E.lote_id)).size,
    },
    emisiones: Emisiones,
  });
});

// ---------- Registros de wallet (página pública /registro) ----------

Rutas.get('/participantes', (Peticion, Respuesta) => {
  const Participantes = Base_Datos.prepare('SELECT * FROM participantes ORDER BY creado_en DESC, id DESC').all();
  Respuesta.json({ exito: true, participantes: Participantes });
});

// Descarga un Excel nombre/wallet listo para el asistente. ?ids=1,2,3
// exporta solo esos; ?evento=foro|asoban filtra por módulo.
Rutas.get('/participantes/exportar', (Peticion, Respuesta) => {
  const Ids = String(Peticion.query.ids || '').split(',').map(Number).filter(Number.isInteger).filter(Boolean);
  const Evento = Eventos_Validos.includes(Peticion.query.evento) ? Peticion.query.evento : null;
  const Filtro_Ids = Ids.length ? `AND id IN (${Ids.map(() => '?').join(',')})` : '';
  const Participantes = Base_Datos.prepare(`
    SELECT nombre, wallet FROM participantes
    WHERE (? IS NULL OR evento = ?) ${Filtro_Ids}
    ORDER BY creado_en ASC, id ASC
  `).all(Evento, Evento, ...Ids);

  const Hoja = xlsx.utils.json_to_sheet(Participantes.length ? Participantes : [{ nombre: '', wallet: '' }]);
  Hoja['!cols'] = [{ wch: 32 }, { wch: 46 }];
  const Libro = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(Libro, Hoja, 'Participantes');
  Respuesta.setHeader('Content-Disposition', 'attachment; filename="Participantes.xlsx"');
  Respuesta.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  Respuesta.send(xlsx.write(Libro, { type: 'buffer', bookType: 'xlsx' }));
});

Rutas.post('/participantes', (Peticion, Respuesta) => {
  const Fila = Validar_Fila({ fila: 1, nombre: Peticion.body?.nombre, wallet: Peticion.body?.wallet });
  if (!Fila.valido) return Respuesta.status(400).json({ exito: false, mensaje: Fila.error });
  const Evento = Eventos_Validos.includes(Peticion.body?.evento) ? Peticion.body.evento : 'foro';
  const Resultado = Base_Datos.prepare('INSERT INTO participantes (nombre, wallet, tipo, evento) VALUES (?, ?, ?, ?)')
    .run(Fila.nombre, Fila.wallet, 'manual', Evento);
  const Participante = Base_Datos.prepare('SELECT * FROM participantes WHERE id = ?').get(Resultado.lastInsertRowid);
  Respuesta.status(201).json({ exito: true, participante: Participante });
});

Rutas.delete('/participantes/:id', (Peticion, Respuesta) => {
  const Resultado = Base_Datos.prepare('DELETE FROM participantes WHERE id = ?').run(Number(Peticion.params.id));
  if (!Resultado.changes) return Respuesta.status(404).json({ exito: false, mensaje: 'Participante no encontrado.' });
  Respuesta.json({ exito: true });
});

module.exports = Rutas;
