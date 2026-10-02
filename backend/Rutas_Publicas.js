// Rutas públicas (sin sesión): marca y registro de estudiantes de cada
// institución (/registro_<slug>) y verificación de certificados.
const express = require('express');
const bcrypt = require('bcryptjs');
const Base_Datos = require('./Base_Datos');
const Blockchain = require('./Blockchain');
const Configuracion_Red = require('./Configuracion_Red');
const Ipfs = require('./Ipfs');
const { Datos_Marca } = require('./Marca_Institucion');
const { Leer_Sesion_Opcional } = require('./Autenticacion');

const Rutas = express.Router();

function Buscar_Institucion(Slug) {
  return Base_Datos.prepare('SELECT * FROM instituciones WHERE slug = ?').get(String(Slug || '').toLowerCase());
}

// /registro (sin sufijo) es el registro de la institución principal.
Rutas.get('/institucion-principal', (_Peticion, Respuesta) => {
  const Institucion = Base_Datos.prepare('SELECT * FROM instituciones WHERE es_principal = 1').get();
  Respuesta.json({ exito: true, institucion: Datos_Marca(Institucion) });
});

// Correo al que las instituciones escriben para que las demos de alta.
Rutas.get('/configuracion', (_Peticion, Respuesta) => {
  Respuesta.json({ exito: true, correo_contacto: process.env.CORREO_CONTACTO?.trim() || null });
});

Rutas.get('/institucion/:slug', (Peticion, Respuesta) => {
  const Institucion = Buscar_Institucion(Peticion.params.slug);
  if (!Institucion) return Respuesta.status(404).json({ exito: false, mensaje: 'Esta institución no existe o fue eliminada.' });
  Respuesta.json({ exito: true, institucion: Datos_Marca(Institucion) });
});

// Registro de un estudiante en su institución: crea su cuenta (entra por
// /login) y lo agrega a la lista de estudiantes de la institución.
Rutas.post('/registro/:slug', async (Peticion, Respuesta) => {
  const Institucion = Buscar_Institucion(Peticion.params.slug);
  if (!Institucion) return Respuesta.status(404).json({ exito: false, mensaje: 'Esta institución no existe o fue eliminada.' });

  const Nombre = String(Peticion.body?.nombre || '').trim();
  const Correo = String(Peticion.body?.correo || '').trim().toLowerCase();
  const Contrasena = String(Peticion.body?.contrasena || '');
  const Wallet = String(Peticion.body?.wallet || '').trim();

  if (!Nombre || !Correo || !Contrasena) return Respuesta.status(400).json({ exito: false, mensaje: 'Nombre, correo y contraseña son requeridos.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(Correo)) return Respuesta.status(400).json({ exito: false, mensaje: 'El correo no tiene un formato válido.' });
  if (Contrasena.length < 8) return Respuesta.status(400).json({ exito: false, mensaje: 'La contraseña debe tener al menos 8 caracteres.' });
  if (Wallet && !Blockchain.Es_Wallet_Valida(Wallet)) return Respuesta.status(400).json({ exito: false, mensaje: 'La wallet no tiene un formato válido (0x + 40 caracteres).' });
  if (Base_Datos.prepare('SELECT id FROM usuarios WHERE correo = ?').get(Correo)) {
    return Respuesta.status(409).json({ exito: false, mensaje: 'Ya existe una cuenta con ese correo. Inicia sesión en /login.' });
  }

  const Hash = await bcrypt.hash(Contrasena, 12);
  Base_Datos.exec('BEGIN');
  try {
    const Usuario = Base_Datos.prepare(
      "INSERT INTO usuarios (correo, contrasena_hash, nombre, rol, institucion_id, estado, wallet) VALUES (?, ?, ?, 'student', ?, 'activo', ?)"
    ).run(Correo, Hash, Nombre, Institucion.id, Wallet || null);
    Base_Datos.prepare('INSERT INTO estudiantes_institucionales (institucion_id, nombre, correo, wallet, usuario_id) VALUES (?, ?, ?, ?, ?)')
      .run(Institucion.id, Nombre, Correo, Wallet || null, Usuario.lastInsertRowid);
    Base_Datos.exec('COMMIT');
  } catch (Error_Registro) {
    Base_Datos.exec('ROLLBACK');
    return Respuesta.status(500).json({ exito: false, mensaje: Error_Registro.message });
  }
  Respuesta.status(201).json({ exito: true, mensaje: `Te registraste en ${Institucion.nombre}. Ya puedes iniciar sesión en /login.` });
});

const Consulta_Emision = `
  SELECT e.*, i.nombre AS institucion_nombre
  FROM emisiones e LEFT JOIN instituciones i ON i.id = e.institucion_id
  WHERE e.red = ? AND e.token_id IS NOT NULL
`;

// Traduce lo que se escanea o escribe a { Token_Id, Emision, Cid_Qr, Modo }.
// Acepta: URL del QR, token id ("12", "#CERT-12"), CID (metadata o PDF),
// hash de transacción o wallet.
function Interpretar_Consulta(Texto, Modo_Pedido) {
  let Consulta = String(Texto || '').trim();
  let Modo = Modo_Pedido;
  let Cid_Qr = null;
  try {
    const Url = new URL(Consulta);
    // Los QR anteriores al switch test/main no traen "red": son de main.
    Modo = Url.searchParams.get('red') || Modo || 'main';
    Cid_Qr = Url.searchParams.get('cid');
    Consulta = Url.searchParams.get('token') || Cid_Qr || Consulta;
  } catch (_) { /* no es una URL */ }
  if (!Configuracion_Red.Modos_Validos.includes(Modo)) Modo = Configuracion_Red.Obtener_Modo_Activo();

  const Token = Consulta.match(/^#?(?:CERT-?)?(\d+)$/i);
  if (Token) {
    const Token_Id = Number(Token[1]);
    const Emision = Base_Datos.prepare(`${Consulta_Emision} AND e.token_id = ? ORDER BY e.id DESC LIMIT 1`).get(Modo, Token_Id);
    return { Token_Id, Emision, Cid_Qr, Modo };
  }

  const Cid = Ipfs.Extraer_Cid(Consulta);
  if (Cid) {
    const Emision = Base_Datos.prepare(`${Consulta_Emision} AND (e.token_uri = ? OR e.pdf_cid = ? OR e.final_pdf_cid = ?) ORDER BY e.id DESC LIMIT 1`)
      .get(Modo, `ipfs://${Cid}`, Cid, Cid);
    return { Token_Id: Emision?.token_id ?? null, Emision, Cid_Qr, Modo };
  }

  if (/^0x[a-fA-F0-9]{40}([a-fA-F0-9]{24})?$/.test(Consulta)) {
    const Emision = Base_Datos.prepare(`${Consulta_Emision} AND (lower(e.tx_hash) = lower(?) OR lower(e.wallet_alumno) = lower(?)) ORDER BY e.id DESC LIMIT 1`)
      .get(Modo, Consulta, Consulta);
    return { Token_Id: Emision?.token_id ?? null, Emision, Cid_Qr, Modo };
  }

  return { Token_Id: null, Emision: null, Cid_Qr, Modo };
}

async function Leer_Metadata(Token_Uri) {
  const Cid = Ipfs.Extraer_Cid(Token_Uri);
  if (!Cid) return null;
  try {
    return await Ipfs.Descargar_Ipfs(Cid, true);
  } catch (_) {
    return null;
  }
}

// La fuente de verdad es el contrato: el token debe existir, su tokenURI
// on-chain debe coincidir con el registrado al emitir y, si viene del QR,
// el CID debe ser el del PDF de ese certificado.
Rutas.get('/verificar', async (Peticion, Respuesta) => {
  const Texto = String(Peticion.query?.q || '').trim();
  if (!Texto) return Respuesta.status(400).json({ exito: false, mensaje: 'Ingresa el Token ID, el CID o la URL del QR.' });

  const { Token_Id, Emision, Cid_Qr, Modo } = Interpretar_Consulta(Texto, Peticion.query?.red);
  if (Token_Id == null) return Respuesta.status(404).json({ exito: false, mensaje: 'No se encontró un certificado emitido con ese identificador.' });

  let Red;
  try {
    Red = Configuracion_Red.Obtener_Red(Modo);
  } catch (Error_Red) {
    return Respuesta.status(503).json({ exito: false, mensaje: `La red ${Modo} no está configurada en el servidor.` });
  }

  const Token = await Blockchain.Consultar_Token(Red, Token_Id);
  if (!Token) return Respuesta.status(404).json({ exito: false, mensaje: `El token #${Token_Id} no existe en el contrato (${Red.Nombre_Red}).` });

  if (Emision?.token_uri && Emision.token_uri !== Token.Token_Uri) {
    return Respuesta.status(409).json({ exito: false, mensaje: `El tokenURI on-chain del token #${Token_Id} no coincide con el registrado por la institución.` });
  }

  const Metadata = Emision ? null : await Leer_Metadata(Token.Token_Uri);
  const Cids_Validos = [Emision?.pdf_cid, Emision?.final_pdf_cid, Ipfs.Extraer_Cid(Metadata?.pdf_base), Ipfs.Extraer_Cid(Metadata?.document)].filter(Boolean);
  if (Cid_Qr && Cids_Validos.length && !Cids_Validos.includes(Cid_Qr)) {
    return Respuesta.status(409).json({ exito: false, mensaje: `El CID del QR no corresponde al PDF del token #${Token_Id}.` });
  }

  const Final_Pdf_Url = Emision?.final_pdf_url || Metadata?.pdf_url || null;
  const Certificado = {
    token_id: Token_Id,
    red: Modo,
    nombre_red: Red.Nombre_Red,
    contrato: Red.Direccion_Contrato,
    propietario: Token.Propietario,
    token_uri: Token.Token_Uri,
    metadata_cid: Ipfs.Extraer_Cid(Token.Token_Uri),
    nombre_alumno: Emision?.nombre_alumno || Metadata?.attributes?.find((A) => A.trait_type === 'Alumno')?.value || Metadata?.name || null,
    institucion: Emision?.institucion_nombre || null,
    fecha: Emision?.creado_en || null,
    tx_hash: Emision?.tx_hash || null,
    explorer_url: Emision?.explorer_url || null,
    pdf_cid: Emision?.pdf_cid || Ipfs.Extraer_Cid(Metadata?.pdf_base) || null,
    pdf_url: Final_Pdf_Url || (Emision?.pdf_cid ? `${Ipfs.Gateway_Ipfs}${Emision.pdf_cid}` : null),
    pdf_con_qr: Boolean(Final_Pdf_Url),
    propietario_coincide: Emision ? Token.Propietario.toLowerCase() === String(Emision.wallet_alumno).toLowerCase() : null,
  };
  Respuesta.json({ exito: true, certificado: Filtrar_Segun_Quien_Consulta(Certificado, Emision, Leer_Sesion_Opcional(Peticion)) });
});

// Qué ve cada quien del certificado (el filtro se hace aquí, no en el navegador):
//   admin                → todo
//   estudiante, propio   → todo ("es tuyo")
//   estudiante, ajeno    → "existe pero no es tuyo" + a quién pertenece, sin institución
//   institución, propio  → todo (un estudiante de tu institución)
//   institución, ajeno   → solo que existe y es válido, sin estudiante ni institución
//   invitado (sin sesión)→ estudiante y verificación, sin institución
function Filtrar_Segun_Quien_Consulta(Certificado, Emision, Sesion) {
  const Sin_Institucion = { ...Certificado, institucion: null };
  if (Sesion?.rol === 'admin') return { ...Certificado, relacion: 'admin' };

  if (Sesion?.rol === 'student') {
    const Wallet = Base_Datos.prepare('SELECT wallet FROM usuarios WHERE id = ?').get(Sesion.id)?.wallet?.toLowerCase();
    const Es_Suyo = Boolean(Wallet) && [Certificado.propietario, Emision?.wallet_alumno].some((W) => String(W || '').toLowerCase() === Wallet);
    return Es_Suyo ? { ...Certificado, relacion: 'propio' } : { ...Sin_Institucion, relacion: 'ajeno' };
  }

  if (Sesion?.rol === 'viewer') {
    if (Emision?.institucion_id && Emision.institucion_id === Sesion.institucion_id) return { ...Certificado, relacion: 'institucion_propia' };
    return { token_id: Certificado.token_id, red: Certificado.red, nombre_red: Certificado.nombre_red, contrato: Certificado.contrato, relacion: 'otra_institucion' };
  }

  return { ...Sin_Institucion, relacion: 'invitado' };
}

module.exports = Rutas;
