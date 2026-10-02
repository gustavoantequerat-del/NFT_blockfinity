const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const axios = require('axios');

const db = require('./db');
const blockchain = require('./blockchain');
const { generarCertificadoDesdeTemplate, estamparQrDeVerificacion } = require('./pdfTemplate');

const router = express.Router();

// Inserta una fila en la tabla "emisiones" de SQLite con el resultado de
// un certificado (exitoso o fallido), para tener historial propio sin
// depender de ir a Etherscan. loteId agrupa filas de una misma emisión
// masiva ('individual-<timestamp>' para el flujo de un solo alumno).
function guardarEmision({
  loteId,
  nombreAlumno,
  walletAlumno,
  tokenId,
  txHash,
  explorerUrl,
  tokenURI,
  estado,
  error,
  creadoPor,
  institucionId,
  pdfCid,
  finalPdfCid,
  finalPdfUrl,
  qrPayload,
}) {
  db.prepare(
    `INSERT INTO emisiones
      (lote_id, nombre_alumno, wallet_alumno, token_id, tx_hash, explorer_url, token_uri, estado, error, creado_por, institucion_id, pdf_cid, final_pdf_cid, final_pdf_url, qr_payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    loteId,
    nombreAlumno,
    walletAlumno,
    tokenId ?? null,
    txHash ?? null,
    explorerUrl ?? null,
    tokenURI ?? null,
    estado,
    error ?? null,
    creadoPor ?? null,
    institucionId ?? null,
    pdfCid ?? null,
    finalPdfCid ?? null,
    finalPdfUrl ?? null,
    qrPayload ?? null
  );
}

// Carpeta donde Multer deja temporalmente los archivos subidos (plantilla, Excel).
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Copia local del PDF SIN QR de cada certificado preparado, guardada con su
// CID como nombre. Tras mintear se usa para estamparle el QR sin tener que
// bajarlo de IPFS; si no está (ej. el servidor se reinició) se descarga del
// gateway por su CID, que garantiza que es exactamente el mismo archivo.
const pdfBaseDir = path.join(uploadsDir, 'pdf-base');
if (!fs.existsSync(pdfBaseDir)) {
  fs.mkdirSync(pdfBaseDir);
}

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

// Configuración de Multer: cada archivo subido se guarda con un nombre único
// (timestamp + número aleatorio) para no chocar con otros archivos.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${file.originalname}`),
});

const upload = multer({ storage });

// PASO 1 DEL FLUJO — Genera el PDF del certificado (plantilla + nombre) SIN
// QR, sube ese PDF + su preview PNG + su metadata JSON a Pinata, y devuelve
// el tokenURI listo para mintear. El QR todavía no puede existir porque
// apunta al tokenId, que solo se conoce después del mint.
async function generarYSubirCertificado(nombreAlumno, templateBytes) {
  const pdfBytes = await generarCertificadoDesdeTemplate(templateBytes, nombreAlumno);
  const pdfPath = path.join(
    uploadsDir,
    `cert-${Date.now()}-${Math.round(Math.random() * 1e6)}.pdf`
  );
  fs.writeFileSync(pdfPath, pdfBytes);

  let previewPath = null;

  try {
    previewPath = await blockchain.generatePdfPreview(pdfPath);

    const pdfCID = await blockchain.uploadFileToIPFS(pdfPath);
    const pdfIpfsUrl = `ipfs://${pdfCID}`;
    const pdfGatewayUrl = `${IPFS_GATEWAY}${pdfCID}`;
    fs.copyFileSync(pdfPath, path.join(pdfBaseDir, `${pdfCID}.pdf`));

    const previewCID = await blockchain.uploadFileToIPFS(previewPath);
    const previewIpfsUrl = `ipfs://${previewCID}`;
    const previewGatewayUrl = `${IPFS_GATEWAY}${previewCID}`;

    const metadata = {
      name: `Certificado ${nombreAlumno}`,
      description: 'Certificado universitario almacenado en IPFS y representado como NFT',
      image: previewIpfsUrl,
      external_url: pdfGatewayUrl,
      document: pdfIpfsUrl,
      pdf_url: pdfGatewayUrl,
      attributes: [
        { trait_type: 'Tipo', value: 'Certificado NFT' },
        { trait_type: 'Alumno', value: nombreAlumno },
        { trait_type: 'PDF', value: pdfGatewayUrl },
      ],
    };

    const metadataCID = await blockchain.uploadJSONToIPFS(metadata);
    const tokenURI = `ipfs://${metadataCID}`;

    return {
      pdfCID,
      previewCID,
      metadataCID,
      pdfIpfsUrl,
      pdfGatewayUrl,
      previewIpfsUrl,
      previewGatewayUrl,
      tokenURI,
    };
  } finally {
    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    if (previewPath && fs.existsSync(previewPath)) fs.unlinkSync(previewPath);
  }
}

// Base pública de la página de verificación. Se calcula con el request
// original porque el minteo masivo corre en segundo plano, sin request.
function baseVerificacion(req) {
  return process.env.PUBLIC_VERIFY_URL?.trim() || `${req.protocol}://${req.get('host')}/`;
}

// Contenido del QR: la página pública de verificación con el tokenId del
// NFT. Quien lo escanee ve el certificado consultado directo en el contrato.
function urlVerificacion(base, tokenId) {
  const url = new URL(base);
  url.searchParams.set('token', String(tokenId));
  return url.toString();
}

// Devuelve los bytes del PDF sin QR identificado por su CID: primero de la
// copia local, si no existe lo descarga de IPFS.
async function obtenerPdfBase(pdfCID) {
  const localPath = path.join(pdfBaseDir, `${pdfCID}.pdf`);
  if (fs.existsSync(localPath)) return fs.readFileSync(localPath);

  const response = await axios.get(`${IPFS_GATEWAY}${pdfCID}`, {
    responseType: 'arraybuffer',
    timeout: 30000,
  });
  return Buffer.from(response.data);
}

// PASO 3 DEL FLUJO — Con el tokenId ya conocido, estampa el QR de
// verificación sobre el PDF minteado y sube ese PDF final a IPFS. Ese es el
// PDF que se entrega al alumno.
async function estamparQrYSubirPdfFinal(pdfCID, tokenId, base) {
  const qrPayload = urlVerificacion(base, tokenId);
  const pdfBase = await obtenerPdfBase(pdfCID);
  const finalBytes = await estamparQrDeVerificacion(pdfBase, qrPayload);
  const finalPath = path.join(uploadsDir, `cert-final-${tokenId}-${Date.now()}.pdf`);

  fs.writeFileSync(finalPath, finalBytes);
  try {
    const finalPdfCid = await blockchain.uploadFileToIPFS(finalPath);
    const localPath = path.join(pdfBaseDir, `${pdfCID}.pdf`);
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

    return {
      qrPayload,
      finalPdfCid,
      finalPdfIpfsUrl: `ipfs://${finalPdfCid}`,
      finalPdfUrl: `${IPFS_GATEWAY}${finalPdfCid}`,
    };
  } finally {
    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
  }
}

// POST /api/certificados/individual — recibe plantilla + nombre + wallet de
// UN alumno y ejecuta el flujo completo: PDF sin QR a IPFS -> mint directo a
// su wallet -> QR con el tokenId estampado -> PDF final a IPFS -> historial.
router.post('/individual', upload.single('plantilla'), async (req, res) => {
  const templateFile = req.file;

  try {
    console.log('\n🚀 INICIO CERTIFICADO INDIVIDUAL');

    const nombreAlumno = req.body.nombreAlumno?.trim();
    const walletAlumno = req.body.walletAlumno?.trim();

    if (!templateFile) {
      return res.status(400).json({ success: false, message: 'Debes subir la plantilla PDF.' });
    }

    if (!nombreAlumno) {
      return res.status(400).json({ success: false, message: 'Debes ingresar el nombre del alumno.' });
    }

    if (!walletAlumno) {
      return res.status(400).json({ success: false, message: 'Debes ingresar la wallet del alumno.' });
    }

    if (!blockchain.web3.utils.isAddress(walletAlumno)) {
      return res.status(400).json({ success: false, message: 'La wallet del alumno no es válida.' });
    }

    const templateBytes = fs.readFileSync(templateFile.path);

    console.log('📝 Generando PDF (sin QR) desde plantilla para:', nombreAlumno);
    const cert = await generarYSubirCertificado(nombreAlumno, templateBytes);

    console.log('⛓️ Minteando NFT directo a la wallet del alumno...');
    const mintResult = await blockchain.mintCertificate(walletAlumno, cert.tokenURI);

    const finalOwner = await blockchain.nftContract.methods.ownerOf(mintResult.tokenId).call();
    const onChainTokenURI = await blockchain.nftContract.methods.tokenURI(mintResult.tokenId).call();
    const entregado = finalOwner.toLowerCase() === walletAlumno.toLowerCase();

    console.log('✅ NFT creado correctamente. Owner:', finalOwner);

    // Si el estampado falla el NFT ya existe: se registra igual y el QR se
    // puede reintentar con POST /api/certificados/qr/:tokenId.
    let final = {};
    let errorQr = null;
    try {
      console.log(`🔳 Estampando QR con tokenId ${mintResult.tokenId}...`);
      final = await estamparQrYSubirPdfFinal(cert.pdfCID, mintResult.tokenId, baseVerificacion(req));
    } catch (qrError) {
      errorQr = `QR pendiente: ${qrError.message}`;
      console.error('⚠️', errorQr);
    }

    guardarEmision({
      loteId: `individual-${Date.now()}`,
      nombreAlumno,
      walletAlumno,
      tokenId: mintResult.tokenId,
      txHash: mintResult.receipt.transactionHash,
      explorerUrl: `${blockchain.explorerBaseUrl}${mintResult.receipt.transactionHash}`,
      tokenURI: cert.tokenURI,
      estado: entregado ? 'nft_transferido' : 'revisar_owner',
      error: errorQr,
      creadoPor: req.user?.id,
      institucionId: Number(req.body?.institucionId) || null,
      pdfCid: cert.pdfCID,
      finalPdfCid: final.finalPdfCid,
      finalPdfUrl: final.finalPdfUrl,
      qrPayload: final.qrPayload,
    });

    return res.status(200).json({
      success: true,
      message: 'NFT creado correctamente en la wallet del estudiante',
      tokenId: mintResult.tokenId,
      ...cert,
      ...final,
      qrError: errorQr,
      universityWallet: blockchain.universityWallet,
      studentWallet: walletAlumno,
      owner: finalOwner,
      mintTxHash: mintResult.receipt.transactionHash,
      explorerUrl: `${blockchain.explorerBaseUrl}${mintResult.receipt.transactionHash}`,
      onChainTokenURI,
    });
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    guardarEmision({
      loteId: `individual-${Date.now()}`,
      nombreAlumno: req.body.nombreAlumno?.trim() || '(sin nombre)',
      walletAlumno: req.body.walletAlumno?.trim() || '(sin wallet)',
      estado: 'error_minteo',
      error: error.message,
      creadoPor: req.user?.id,
      institucionId: Number(req.body?.institucionId) || null,
    });
    return res.status(500).json({
      success: false,
      message: error.message || 'Error procesando el certificado.',
    });
  } finally {
    if (templateFile && fs.existsSync(templateFile.path)) {
      fs.unlinkSync(templateFile.path);
    }
  }
});

// Lee un archivo Excel y devuelve un objeto por fila con su validación
// (nombre no vacío, wallet con formato correcto). No toca IPFS ni
// blockchain: es la validación rápida que se muestra en el paso 2 del
// wizard antes de generar nada.
function leerFilasExcel(excelPath) {
  const workbook = xlsx.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

  return rows.map((row, i) => {
    const excelRow = i + 2;

    const studentWallet = String(
      row.wallet || row.Wallet || row.walletAddress || row.WalletAddress || ''
    ).trim();

    const studentName = String(
      row.nombre || row.Nombre || row.estudiante || row.Estudiante || ''
    ).trim();

    let error = null;
    if (!studentName) error = 'Falta el nombre del alumno.';
    else if (!studentWallet) error = 'Falta la wallet del alumno.';
    else if (!blockchain.web3.utils.isAddress(studentWallet)) error = 'Formato de wallet inválido.';

    return { row: excelRow, studentName, studentWallet, valido: !error, error };
  });
}

// GET /api/certificados/config — datos de la wallet universidad, el
// contrato, la red y el saldo actual de gas, para el resumen del wizard.
router.get('/config', async (req, res) => {
  try {
    const balanceWei = await blockchain.web3.eth.getBalance(blockchain.universityWallet);
    const balanceEth = blockchain.web3.utils.fromWei(balanceWei, 'ether');

    res.status(200).json({
      success: true,
      universityWallet: blockchain.universityWallet,
      contractAddress: blockchain.contractAddress,
      explorerBaseUrl: blockchain.explorerBaseUrl,
      isMainnet: blockchain.expectedChainId === 1,
      network: blockchain.networkName,
      balanceEth,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'No se pudo leer la configuración.' });
  }
});

// POST /api/certificados/validar-excel — recibe el Excel y solo valida sus
// filas (nombre + wallet). No genera PDFs ni sube nada a Pinata todavía.
router.post('/validar-excel', upload.single('excel'), (req, res) => {
  const excelFile = req.file;

  try {
    if (!excelFile) {
      return res.status(400).json({ success: false, message: 'Debes subir un archivo Excel.' });
    }

    const filas = leerFilasExcel(excelFile.path);

    if (filas.length === 0) {
      return res.status(400).json({ success: false, message: 'El Excel no contiene registros.' });
    }

    const validCount = filas.filter((f) => f.valido).length;

    res.status(200).json({
      success: true,
      filas,
      totalCount: filas.length,
      validCount,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'No se pudo leer el Excel.' });
  } finally {
    if (excelFile && fs.existsSync(excelFile.path)) {
      fs.unlinkSync(excelFile.path);
    }
  }
});

// POST /api/certificados/masivo/preparar — recibe la plantilla + el Excel,
// genera un PDF por cada fila válida y sube PDF + preview + metadata a
// Pinata. NO mintea todavía: solo deja listo el tokenURI de cada
// certificado para el paso de emisión.
router.post(
  '/masivo/preparar',
  upload.fields([
    { name: 'plantilla', maxCount: 1 },
    { name: 'excel', maxCount: 1 },
  ]),
  async (req, res) => {
    const tempFiles = [];

    try {
      console.log('\n🚀 INICIO PREPARACIÓN DE CERTIFICADOS');

      const templateFile = req.files?.plantilla?.[0];
      const excelFile = req.files?.excel?.[0];

      if (!templateFile) {
        return res.status(400).json({ success: false, message: 'Debes subir la plantilla PDF.' });
      }

      if (!excelFile) {
        return res.status(400).json({ success: false, message: 'Debes subir el Excel con los alumnos.' });
      }

      tempFiles.push(templateFile.path, excelFile.path);

      const templateBytes = fs.readFileSync(templateFile.path);
      const filasValidas = leerFilasExcel(excelFile.path).filter((f) => f.valido);

      if (filasValidas.length === 0) {
        return res.status(400).json({ success: false, message: 'No hay filas válidas en el Excel.' });
      }

      const certificados = [];

      for (const fila of filasValidas) {
        console.log(`\n📝 Generando certificado fila ${fila.row}: ${fila.studentName}`);
        const cert = await generarYSubirCertificado(fila.studentName, templateBytes);

        certificados.push({
          row: fila.row,
          studentName: fila.studentName,
          studentWallet: fila.studentWallet,
          ...cert,
        });
      }

      console.log('✅ CERTIFICADOS PREPARADOS Y SUBIDOS A IPFS');

      return res.status(200).json({
        success: true,
        message: 'Certificados generados y subidos a IPFS correctamente.',
        totalGenerados: certificados.length,
        certificados,
      });
    } catch (error) {
      console.error('❌ ERROR PREPARANDO CERTIFICADOS:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error generando los certificados.',
      });
    } finally {
      for (const filePath of tempFiles) {
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
  }
);

// Guarda en memoria el estado de cada emisión masiva en curso (jobId -> job).
// El contrato real no tiene minteo por lotes, así que cada alumno es una
// transacción separada y este mapa es lo que permite consultar el avance
// de cada una sin que el navegador tenga que esperar a que termine todo.
const jobs = new Map();

// Genera un identificador único y corto para un nuevo job de emisión.
function crearJobId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// Los jobs terminados se limpian solos para no acumular memoria indefinidamente.
function programarLimpiezaJob(jobId) {
  setTimeout(() => jobs.delete(jobId), 30 * 60 * 1000);
}

// POST /api/certificados/masivo/emitir — recibe la lista de certificados ya
// preparados (con su tokenURI) y responde DE INMEDIATO con un jobId, sin
// esperar a que minteen. Cada alumno se mintea en su propia transacción,
// una por una, en segundo plano (ver el bloque async debajo).
router.post('/masivo/emitir', (req, res) => {
  const creadoPor = req.user?.id;
  const institucionId = Number(req.body?.institucionId) || null;
  const certificados = Array.isArray(req.body?.certificados) ? req.body.certificados : [];

  if (certificados.length === 0) {
    return res.status(400).json({ success: false, message: 'No hay certificados para emitir.' });
  }

  for (const c of certificados) {
    if (!c.studentWallet || !blockchain.web3.utils.isAddress(c.studentWallet)) {
      return res.status(400).json({
        success: false,
        message: `Wallet inválida para ${c.studentName || 'un alumno'}.`,
      });
    }
    if (!c.tokenURI || !c.pdfCID) {
      return res.status(400).json({
        success: false,
        message: `Falta el tokenURI o el PDF de ${c.studentName || 'un alumno'}. Vuelve a generar los certificados.`,
      });
    }
  }

  const verifyBase = baseVerificacion(req);
  const jobId = crearJobId();
  const job = {
    status: 'procesando',
    total: certificados.length,
    details: certificados.map((c) => ({ ...c, stage: 'en_cola' })),
  };
  jobs.set(jobId, job);

  console.log(`\n⛓️ INICIO EMISIÓN EN BLOCKCHAIN (job ${jobId}, ${certificados.length} alumno(s))`);
  res.status(202).json({ success: true, jobId });

  // Procesa los mints uno por uno en segundo plano (la respuesta HTTP ya se
  // envió arriba) y actualiza "job.details[i]" en cada paso: en_cola ->
  // enviando -> confirmando (ya hay hash) -> estampando_qr -> confirmado/error. También
  // guarda cada resultado en el historial (tabla "emisiones").
  (async () => {
    for (let i = 0; i < job.details.length; i++) {
      const item = job.details[i];
      item.stage = 'enviando';

      try {
        console.log(`\n⛓️ (${i + 1}/${job.details.length}) createCertificate → ${item.studentName} · ${item.studentWallet}`);

        const mintResult = await blockchain.mintCertificate(item.studentWallet, item.tokenURI, (hash) => {
          item.stage = 'confirmando';
          item.txHash = hash;
          item.explorerUrl = `${blockchain.explorerBaseUrl}${hash}`;
        });

        const finalOwner = await blockchain.nftContract.methods.ownerOf(mintResult.tokenId).call();
        const onChainTokenURI = await blockchain.nftContract.methods.tokenURI(mintResult.tokenId).call();
        const entregado = finalOwner.toLowerCase() === item.studentWallet.toLowerCase();

        item.tokenId = mintResult.tokenId;
        item.owner = finalOwner;
        item.onChainTokenURI = onChainTokenURI;
        item.txHash = mintResult.receipt.transactionHash;
        item.explorerUrl = `${blockchain.explorerBaseUrl}${mintResult.receipt.transactionHash}`;
        item.status = entregado ? 'nft_transferido' : 'revisar_owner';

        // Con el tokenId ya conocido se estampa el QR y se sube el PDF final.
        // Si falla, el NFT ya existe: queda registrado con "QR pendiente".
        item.stage = 'estampando_qr';
        try {
          Object.assign(item, await estamparQrYSubirPdfFinal(item.pdfCID, item.tokenId, verifyBase));
        } catch (qrError) {
          item.qrError = `QR pendiente: ${qrError.message}`;
          console.error(`⚠️ ${item.studentName}:`, item.qrError);
        }
        item.stage = entregado ? 'confirmado' : 'revisar_owner';

        guardarEmision({
          loteId: jobId,
          nombreAlumno: item.studentName,
          walletAlumno: item.studentWallet,
          tokenId: item.tokenId,
          txHash: item.txHash,
          explorerUrl: item.explorerUrl,
          tokenURI: item.tokenURI,
          estado: item.status,
          error: item.qrError,
          creadoPor,
          institucionId,
          pdfCid: item.pdfCID,
          finalPdfCid: item.finalPdfCid,
          finalPdfUrl: item.finalPdfUrl,
          qrPayload: item.qrPayload,
        });

      } catch (mintError) {
        console.error(`❌ Falló el mint para ${item.studentName}:`, mintError.message);
        item.stage = 'error';
        item.status = 'error_minteo';
        item.error = mintError.message;

        guardarEmision({
          loteId: jobId,
          nombreAlumno: item.studentName,
          walletAlumno: item.studentWallet,
          tokenURI: item.tokenURI,
          estado: 'error_minteo',
          error: mintError.message,
          creadoPor,
          institucionId,
        });
      }
    }

    job.status = 'completado';
    console.log(`✅ EMISIÓN COMPLETADA (job ${jobId})`);
    programarLimpiezaJob(jobId);
  })().catch((error) => {
    job.status = 'error';
    job.error = error.message;
    console.error('❌ ERROR EN EMISIÓN:', error.message);
    programarLimpiezaJob(jobId);
  });
});

// GET /api/certificados/masivo/emitir/:jobId — consulta el estado actual del
// job ('procesando' | 'completado' | 'error') y el detalle por alumno; el
// frontend llama esto cada 2 segundos mientras dura la emisión.
router.get('/masivo/emitir/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ success: false, message: 'No se encontró ese proceso de emisión.' });
  }

  res.status(200).json({
    success: true,
    status: job.status,
    total: job.total,
    details: job.details,
    error: job.error || null,
  });
});

// POST /api/certificados/qr/:tokenId — vuelve a estampar el QR de un NFT ya
// minteado (ej. si Pinata falló justo después del mint) y guarda el nuevo
// PDF final en su fila del historial.
router.post('/qr/:tokenId', async (req, res) => {
  try {
    const emision = db
      .prepare('SELECT * FROM emisiones WHERE token_id = ? ORDER BY id DESC LIMIT 1')
      .get(Number(req.params.tokenId));

    if (!emision) {
      return res.status(404).json({ success: false, message: 'No hay una emisión registrada con ese tokenId.' });
    }
    if (!emision.pdf_cid) {
      return res.status(409).json({ success: false, message: 'Esa emisión no tiene registrado el CID del PDF base.' });
    }

    const final = await estamparQrYSubirPdfFinal(emision.pdf_cid, emision.token_id, baseVerificacion(req));
    db.prepare('UPDATE emisiones SET final_pdf_cid = ?, final_pdf_url = ?, qr_payload = ?, error = NULL WHERE id = ?')
      .run(final.finalPdfCid, final.finalPdfUrl, final.qrPayload, emision.id);

    res.status(200).json({ success: true, tokenId: emision.token_id, ...final });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'No se pudo estampar el QR.' });
  }
});

// GET /api/certificados/historial — devuelve todas las emisiones guardadas
// en SQLite (más recientes primero) junto con estadísticas agregadas
// (total emitidos, entregados, con error, lotes), para el Dashboard.
router.get('/historial', (req, res) => {
  try {
    const emisiones = db
      .prepare('SELECT * FROM emisiones ORDER BY creado_en DESC, id DESC')
      .all();

    const totalEmitidos = emisiones.length;
    const entregados = emisiones.filter((e) => e.estado === 'nft_transferido').length;
    const conError = emisiones.filter((e) => e.estado !== 'nft_transferido').length;
    const totalLotes = new Set(emisiones.map((e) => e.lote_id)).size;

    res.status(200).json({
      success: true,
      stats: { totalEmitidos, entregados, conError, totalLotes },
      emisiones,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'No se pudo leer el historial.' });
  }
});

// GET /api/certificados/participantes — lista los auto-registros hechos
// desde la página pública /registro (nombre, wallet, si la crearon o ya
// la tenían), más recientes primero.
router.get('/participantes', (req, res) => {
  try {
    const participantes = db
      .prepare('SELECT * FROM participantes ORDER BY creado_en DESC, id DESC')
      .all();

    res.status(200).json({ success: true, participantes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'No se pudo leer los participantes.' });
  }
});

// GET /api/certificados/participantes/exportar — descarga un Excel con
// columnas nombre/wallet, en el mismo formato que espera el wizard de
// emisión masiva, listo para subirlo ahí directamente. Con ?ids=1,2,3 exporta
// solo esos participantes (los marcados con su casilla en el panel); sin ese
// parámetro exporta la tabla completa.
router.get('/participantes/exportar', (req, res) => {
  try {
    const idsParam = (req.query.ids || '').trim();
    let participantes;

    if (idsParam) {
      const ids = idsParam.split(',').map(Number).filter(Number.isInteger);
      if (!ids.length) {
        return res.status(400).json({ success: false, message: 'No se especificaron participantes válidos.' });
      }
      const placeholders = ids.map(() => '?').join(',');
      participantes = db
        .prepare(`SELECT nombre, wallet FROM participantes WHERE id IN (${placeholders}) ORDER BY creado_en ASC, id ASC`)
        .all(...ids);
    } else {
      participantes = db
        .prepare('SELECT nombre, wallet FROM participantes ORDER BY creado_en ASC, id ASC')
        .all();
    }

    const ws = xlsx.utils.json_to_sheet(participantes);
    ws['!cols'] = [{ wch: 28 }, { wch: 46 }];
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Participantes');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="participantes.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'No se pudo generar el Excel.' });
  }
});

// Módulos públicos de auto-registro existentes (ver registro-wallet/src/App.jsx
// y server.js); cualquier otro valor recibido cae a 'foro' por seguridad.
const EVENTOS_VALIDOS = ['foro', 'asoban'];

// POST /api/certificados/participantes — alta manual desde el panel admin
// (mismo destino que el auto-registro público, para completar la tabla a mano).
router.post('/participantes', (req, res) => {
  const nombre = (req.body?.nombre || '').trim();
  const wallet = (req.body?.wallet || '').trim();
  const evento = EVENTOS_VALIDOS.includes(req.body?.evento) ? req.body.evento : 'foro';

  if (!nombre) return res.status(400).json({ success: false, message: 'Falta el nombre completo.' });
  if (!blockchain.web3.utils.isAddress(wallet)) {
    return res.status(400).json({ success: false, message: 'La wallet no tiene un formato válido.' });
  }

  const info = db
    .prepare('INSERT INTO participantes (nombre, wallet, tipo, evento) VALUES (?, ?, ?, ?)')
    .run(nombre, wallet, 'manual', evento);

  const participante = db.prepare('SELECT * FROM participantes WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ success: true, participante });
});

// PATCH /api/certificados/participantes/:id — edita nombre, wallet y/o evento de un participante existente.
router.patch('/participantes/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM participantes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ success: false, message: 'Participante no encontrado.' });

  const nombre = (req.body?.nombre || '').trim();
  const wallet = (req.body?.wallet || '').trim();
  const evento = EVENTOS_VALIDOS.includes(req.body?.evento) ? req.body.evento : existente.evento;

  if (!nombre) return res.status(400).json({ success: false, message: 'Falta el nombre completo.' });
  if (!blockchain.web3.utils.isAddress(wallet)) {
    return res.status(400).json({ success: false, message: 'La wallet no tiene un formato válido.' });
  }

  db.prepare('UPDATE participantes SET nombre = ?, wallet = ?, evento = ? WHERE id = ?').run(nombre, wallet, evento, req.params.id);
  const participante = db.prepare('SELECT * FROM participantes WHERE id = ?').get(req.params.id);
  res.status(200).json({ success: true, participante });
});

// DELETE /api/certificados/participantes/:id — elimina un participante de la tabla.
router.delete('/participantes/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM participantes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ success: false, message: 'Participante no encontrado.' });

  db.prepare('DELETE FROM participantes WHERE id = ?').run(req.params.id);
  res.status(200).json({ success: true });
});

module.exports = router;
