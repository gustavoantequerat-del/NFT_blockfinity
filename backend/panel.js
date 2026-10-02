const express = require('express');
const axios = require('axios');
const db = require('./db');
const blockchain = require('./blockchain');
const { requireAuth } = require('./auth');

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

const router = express.Router();
const publicRouter = express.Router();
const PRICE_PER_CERTIFICATE = 0.77;

function isAdmin(req) {
  return req.user?.rol === 'admin';
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, message: 'Esta accion requiere una cuenta administradora.' });
  }
  next();
}

// Permite la ruta solo a los roles indicados (admin, viewer, student).
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.rol)) {
      return res.status(403).json({ success: false, message: 'Tu cuenta no tiene permiso para esta accion.' });
    }
    next();
  };
}
const requireStaff = requireRole('admin', 'viewer');

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || '');
}

function statusForInstitution(inst) {
  if (!inst.wallet) return 'sin wallet';
  if (Number(inst.credito_usd) < 50) return 'credito bajo';
  return 'activa';
}

function enrichInstitution(inst) {
  return {
    ...inst,
    estado: statusForInstitution(inst),
    certs: db.prepare('SELECT COUNT(*) AS count FROM emisiones WHERE institucion_id = ?').get(inst.id).count,
    delivered: db.prepare("SELECT COUNT(*) AS count FROM emisiones WHERE institucion_id = ? AND estado = 'nft_transferido'").get(inst.id).count,
  };
}

function currentInstitutionId(user) {
  return Number(user?.institucion_id) || null;
}

router.use(requireAuth);

router.get('/overview', (req, res) => {
  try {
    const instRows = isAdmin(req)
      ? db.prepare('SELECT * FROM instituciones ORDER BY nombre').all()
      : db.prepare('SELECT * FROM instituciones WHERE id = ?').all(currentInstitutionId(req.user));
    const pendingRequests = isAdmin(req)
      ? db.prepare("SELECT COUNT(*) AS count FROM solicitudes_acceso WHERE estado = 'pendiente'").get().count
      : 0;
    const pendingBatches = isAdmin(req)
      ? db.prepare("SELECT COUNT(*) AS count FROM lotes_solicitados WHERE estado = 'pendiente'").get().count
      : db.prepare("SELECT COUNT(*) AS count FROM lotes_solicitados WHERE institucion_id = ? AND estado = 'pendiente'").get(currentInstitutionId(req.user)).count;
    const stats = db.prepare(`
      SELECT COUNT(*) AS total, SUM(CASE WHEN estado = 'nft_transferido' THEN 1 ELSE 0 END) AS delivered
      FROM emisiones
    `).get();

    res.json({
      success: true,
      usuario: req.user,
      institutions: instRows.map(enrichInstitution),
      stats: {
        totalInstitutions: instRows.length,
        totalEmissions: stats.total || 0,
        delivered: stats.delivered || 0,
        pendingRequests,
        pendingBatches,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'No se pudo cargar el panel.' });
  }
});

router.get('/instituciones', (req, res) => {
  const rows = isAdmin(req)
    ? db.prepare('SELECT * FROM instituciones ORDER BY nombre').all()
    : db.prepare('SELECT * FROM instituciones WHERE id = ?').all(currentInstitutionId(req.user));
  res.json({ success: true, instituciones: rows.map(enrichInstitution) });
});

router.post('/instituciones', requireAdmin, (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  const etiqueta = String(req.body?.etiqueta || '').trim().toUpperCase();
  const responsableNombre = String(req.body?.responsableNombre || '').trim();
  const responsableCorreo = String(req.body?.responsableCorreo || '').trim().toLowerCase();
  const wallet = String(req.body?.wallet || '').trim();

  if (!nombre || !etiqueta) {
    return res.status(400).json({ success: false, message: 'Nombre y etiqueta son requeridos.' });
  }
  if (responsableCorreo && !validEmail(responsableCorreo)) {
    return res.status(400).json({ success: false, message: 'El correo del responsable no es valido.' });
  }

  try {
    const info = db.prepare(`
      INSERT INTO instituciones (nombre, etiqueta, responsable_nombre, responsable_correo, wallet, creado_por)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(nombre, etiqueta, responsableNombre || null, responsableCorreo || null, wallet || null, req.user.id);
    const institution = db.prepare('SELECT * FROM instituciones WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ success: true, institucion: enrichInstitution(institution) });
  } catch (error) {
    const message = /unique/i.test(error.message) ? 'La etiqueta ya esta registrada.' : error.message;
    res.status(409).json({ success: false, message });
  }
});

router.get('/solicitudes-acceso', requireAdmin, (req, res) => {
  const solicitudes = db.prepare(`
    SELECT s.*, u.nombre, u.correo, i.nombre AS institucion_nombre, i.etiqueta AS institucion_etiqueta
    FROM solicitudes_acceso s
    JOIN usuarios u ON u.id = s.usuario_id
    JOIN instituciones i ON i.id = s.institucion_id
    WHERE s.estado = 'pendiente'
    ORDER BY s.creado_en DESC, s.id DESC
  `).all();
  res.json({ success: true, solicitudes });
});

router.post('/solicitudes-acceso/:id/resolver', requireAdmin, (req, res) => {
  const action = req.body?.accion;
  if (!['aprobar', 'rechazar'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Accion invalida.' });
  }
  const request = db.prepare("SELECT * FROM solicitudes_acceso WHERE id = ? AND estado = 'pendiente'").get(req.params.id);
  if (!request) return res.status(404).json({ success: false, message: 'Solicitud pendiente no encontrada.' });

  db.prepare("UPDATE solicitudes_acceso SET estado = ?, resuelto_por = ?, resuelto_en = datetime('now') WHERE id = ?")
    .run(action === 'aprobar' ? 'aprobada' : 'rechazada', req.user.id, request.id);
  db.prepare('UPDATE usuarios SET estado = ? WHERE id = ?').run(action === 'aprobar' ? 'activo' : 'rechazado', request.usuario_id);
  res.json({ success: true, estado: action === 'aprobar' ? 'aprobada' : 'rechazada' });
});

router.get('/estudiantes', requireStaff, (req, res) => {
  const institutionId = isAdmin(req) ? Number(req.query.institucionId) || null : currentInstitutionId(req.user);
  if (!institutionId) return res.json({ success: true, estudiantes: [] });
  const estudiantes = db.prepare('SELECT * FROM estudiantes_institucionales WHERE institucion_id = ? ORDER BY creado_en DESC, id DESC').all(institutionId);
  res.json({ success: true, estudiantes });
});

router.post('/estudiantes', requireStaff, (req, res) => {
  const institutionId = isAdmin(req) ? Number(req.body?.institucionId) : currentInstitutionId(req.user);
  const nombre = String(req.body?.nombre || '').trim();
  const correo = String(req.body?.correo || '').trim().toLowerCase();
  const wallet = String(req.body?.wallet || '').trim();
  if (!institutionId || !nombre) return res.status(400).json({ success: false, message: 'Institucion y nombre son requeridos.' });
  if (correo && !validEmail(correo)) return res.status(400).json({ success: false, message: 'El correo no es valido.' });

  const info = db.prepare('INSERT INTO estudiantes_institucionales (institucion_id, nombre, correo, wallet, creado_por) VALUES (?, ?, ?, ?, ?)')
    .run(institutionId, nombre, correo || null, wallet || null, req.user.id);
  const estudiante = db.prepare('SELECT * FROM estudiantes_institucionales WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ success: true, estudiante });
});

router.delete('/estudiantes/:id', requireStaff, (req, res) => {
  const record = db.prepare('SELECT * FROM estudiantes_institucionales WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'Estudiante no encontrado.' });
  if (!isAdmin(req) && record.institucion_id !== currentInstitutionId(req.user)) {
    return res.status(403).json({ success: false, message: 'No puedes modificar este estudiante.' });
  }
  db.prepare('DELETE FROM estudiantes_institucionales WHERE id = ?').run(record.id);
  res.json({ success: true });
});

router.get('/lotes', requireStaff, (req, res) => {
  const condition = isAdmin(req) ? '' : 'WHERE l.institucion_id = ?';
  const statement = db.prepare(`
    SELECT l.*, i.nombre AS institucion_nombre, i.etiqueta AS institucion_etiqueta, i.credito_usd
    FROM lotes_solicitados l JOIN instituciones i ON i.id = l.institucion_id
    ${condition} ORDER BY l.creado_en DESC, l.id DESC
  `);
  const lotes = isAdmin(req) ? statement.all() : statement.all(currentInstitutionId(req.user));
  res.json({ success: true, lotes, precioUnitario: PRICE_PER_CERTIFICATE });
});

router.post('/lotes', requireStaff, (req, res) => {
  const institutionId = isAdmin(req) ? Number(req.body?.institucionId) : currentInstitutionId(req.user);
  const nombre = String(req.body?.nombre || '').trim();
  const plantillaNombre = String(req.body?.plantillaNombre || '').trim();
  const cantidad = Number(req.body?.cantidad);
  if (!institutionId || !nombre || !Number.isInteger(cantidad) || cantidad < 1) {
    return res.status(400).json({ success: false, message: 'Nombre y cantidad valida son requeridos.' });
  }
  const costo = Number((cantidad * PRICE_PER_CERTIFICATE).toFixed(2));
  const info = db.prepare(`
    INSERT INTO lotes_solicitados (institucion_id, nombre, plantilla_nombre, cantidad, costo_usd, creado_por)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(institutionId, nombre, plantillaNombre || null, cantidad, costo, req.user.id);
  const lote = db.prepare('SELECT * FROM lotes_solicitados WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ success: true, lote });
});

router.post('/lotes/:id/resolver', requireAdmin, (req, res) => {
  const action = req.body?.accion;
  if (!['aprobar', 'rechazar'].includes(action)) return res.status(400).json({ success: false, message: 'Accion invalida.' });
  const lote = db.prepare("SELECT * FROM lotes_solicitados WHERE id = ? AND estado = 'pendiente'").get(req.params.id);
  if (!lote) return res.status(404).json({ success: false, message: 'Lote pendiente no encontrado.' });

  db.exec('BEGIN');
  try {
    if (action === 'aprobar') {
      const institution = db.prepare('SELECT credito_usd FROM instituciones WHERE id = ?').get(lote.institucion_id);
      if (!institution || Number(institution.credito_usd) < Number(lote.costo_usd)) {
        db.exec('ROLLBACK');
        return res.status(409).json({ success: false, message: 'La institucion no tiene credito suficiente.' });
      }
      db.prepare('UPDATE instituciones SET credito_usd = credito_usd - ? WHERE id = ?').run(lote.costo_usd, lote.institucion_id);
    }
    db.prepare("UPDATE lotes_solicitados SET estado = ?, resuelto_por = ?, resuelto_en = datetime('now') WHERE id = ?")
      .run(action === 'aprobar' ? 'aprobada' : 'rechazada', req.user.id, lote.id);
    db.exec('COMMIT');
    res.json({ success: true, estado: action === 'aprobar' ? 'aprobada' : 'rechazada' });
  } catch (error) {
    db.exec('ROLLBACK');
    res.status(500).json({ success: false, message: error.message || 'No se pudo resolver el lote.' });
  }
});

// Vista del estudiante: sus certificados son las emisiones hechas a la
// wallet registrada en su cuenta.
router.get('/mis-certificados', requireRole('student'), (req, res) => {
  const user = db.prepare('SELECT wallet FROM usuarios WHERE id = ?').get(req.user.id);
  const wallet = user?.wallet || null;
  const certificados = wallet
    ? db.prepare(`
        SELECT e.id, e.nombre_alumno, e.wallet_alumno, e.token_id, e.tx_hash, e.explorer_url, e.token_uri,
               e.estado, e.final_pdf_url, e.pdf_cid, e.creado_en, i.nombre AS institucion_nombre
        FROM emisiones e LEFT JOIN instituciones i ON i.id = e.institucion_id
        WHERE lower(e.wallet_alumno) = lower(?) AND e.token_id IS NOT NULL
        ORDER BY e.creado_en DESC, e.id DESC
      `).all(wallet)
    : [];
  res.json({ success: true, wallet, certificados });
});

router.put('/mi-wallet', requireRole('student'), (req, res) => {
  const wallet = String(req.body?.wallet || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ success: false, message: 'La wallet no tiene un formato valido.' });
  }
  db.prepare('UPDATE usuarios SET wallet = ? WHERE id = ?').run(wallet, req.user.id);
  res.json({ success: true, wallet });
});

publicRouter.get('/instituciones', (req, res) => {
  const instituciones = db.prepare("SELECT id, nombre, etiqueta FROM instituciones WHERE estado != 'sin wallet' ORDER BY nombre").all();
  res.json({ success: true, instituciones });
});

const EMISSION_SELECT = `
  SELECT e.*, i.nombre AS institucion_nombre, i.etiqueta AS institucion_etiqueta
  FROM emisiones e
  LEFT JOIN instituciones i ON i.id = e.institucion_id
`;

// Extrae un CID de IPFS de "ipfs://CID", de una URL de gateway ".../ipfs/CID"
// o del CID suelto (CIDv0 "Qm..." o CIDv1 "baf...").
function extractCid(value) {
  const match = String(value).match(/(?:ipfs:\/\/|\/ipfs\/)?(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})/);
  return match ? match[1] : null;
}

// Traduce lo que escribe o escanea el usuario a un tokenId del contrato.
// Acepta: URL del QR (?token= / ?cid=), tokenId ("12", "#CERT-12"), CID de
// la metadata o de cualquiera de los dos PDFs, hash de transacción o wallet.
function resolveQuery(raw) {
  let query = String(raw || '').trim();
  try {
    const url = new URL(query);
    query = url.searchParams.get('token') || url.searchParams.get('cid') || query;
  } catch (_) { /* no es una URL */ }

  const tokenMatch = query.match(/^#?(?:CERT-?)?(\d+)$/i);
  if (tokenMatch) {
    const tokenId = Number(tokenMatch[1]);
    const emission = db.prepare(`${EMISSION_SELECT} WHERE e.token_id = ? ORDER BY e.id DESC LIMIT 1`).get(tokenId);
    return { tokenId, emission, matchedBy: 'tokenId' };
  }

  const cid = extractCid(query);
  if (cid) {
    const emission = db.prepare(`
      ${EMISSION_SELECT}
      WHERE e.token_id IS NOT NULL AND (e.token_uri = ? OR e.pdf_cid = ? OR e.final_pdf_cid = ?)
      ORDER BY e.id DESC LIMIT 1
    `).get(`ipfs://${cid}`, cid, cid);
    return { tokenId: emission?.token_id ?? null, emission, matchedBy: 'cid' };
  }

  if (/^0x[a-fA-F0-9]{64}$/.test(query) || /^0x[a-fA-F0-9]{40}$/.test(query)) {
    const emission = db.prepare(`
      ${EMISSION_SELECT}
      WHERE e.token_id IS NOT NULL AND (lower(e.tx_hash) = lower(?) OR lower(e.wallet_alumno) = lower(?))
      ORDER BY e.id DESC LIMIT 1
    `).get(query, query);
    return { tokenId: emission?.token_id ?? null, emission, matchedBy: query.length === 66 ? 'tx' : 'wallet' };
  }

  return { tokenId: null, emission: null, matchedBy: null };
}

// Lee la metadata JSON del NFT desde IPFS (solo para mostrar datos cuando
// el token no está en la base local). Si el gateway no responde, se omite.
async function fetchMetadata(tokenURI) {
  const cid = extractCid(tokenURI);
  if (!cid) return null;
  try {
    const response = await axios.get(`${IPFS_GATEWAY}${cid}`, { timeout: 8000 });
    return response.data;
  } catch (_) {
    return null;
  }
}

// GET /api/public/verificar?q=… — verificación pública. La fuente de verdad
// es el contrato: el tokenId debe existir (ownerOf) y su tokenURI on-chain
// debe coincidir con el CID de metadata registrado al emitir.
publicRouter.get('/verificar', async (req, res) => {
  const query = String(req.query?.q || '').trim();
  if (!query) return res.status(400).json({ success: false, message: 'Ingresa el Token ID o el CID del certificado.' });

  const { tokenId, emission, matchedBy } = resolveQuery(query);
  if (tokenId == null) {
    return res.status(404).json({ success: false, message: 'No se encontro un certificado emitido con ese identificador.' });
  }

  let owner;
  let tokenURI;
  try {
    owner = await blockchain.nftContract.methods.ownerOf(tokenId).call();
    tokenURI = await blockchain.nftContract.methods.tokenURI(tokenId).call();
  } catch (error) {
    return res.status(404).json({ success: false, message: `El token #${tokenId} no existe en el contrato.` });
  }

  if (emission?.token_uri && emission.token_uri !== tokenURI) {
    return res.status(409).json({
      success: false,
      message: `El tokenURI on-chain del token #${tokenId} no coincide con el registrado por la institucion.`,
    });
  }

  const metadata = emission ? null : await fetchMetadata(tokenURI);
  const pdfCid = emission?.pdf_cid || extractCid(metadata?.document || '') || null;

  res.json({
    success: true,
    certificado: {
      tokenId: Number(tokenId),
      matchedBy,
      owner,
      tokenURI,
      metadataCid: extractCid(tokenURI),
      contractAddress: blockchain.contractAddress,
      network: blockchain.networkName,
      nombreAlumno: emission?.nombre_alumno || metadata?.attributes?.find((a) => a.trait_type === 'Alumno')?.value || metadata?.name || null,
      institucion: emission?.institucion_nombre || null,
      fecha: emission?.creado_en || null,
      txHash: emission?.tx_hash || null,
      explorerUrl: emission?.explorer_url || null,
      pdfCid,
      pdfUrl: pdfCid ? `${IPFS_GATEWAY}${pdfCid}` : null,
      finalPdfCid: emission?.final_pdf_cid || null,
      finalPdfUrl: emission?.final_pdf_url || null,
      ownerCoincide: emission ? owner.toLowerCase() === String(emission.wallet_alumno).toLowerCase() : null,
    },
  });
});

module.exports = { router, publicRouter };
