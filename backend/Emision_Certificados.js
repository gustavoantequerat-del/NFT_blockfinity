/*
 * Flujo de emisión de un certificado:
 *
 *   PREPARAR (paso 3 del asistente)
 *   1. Plantilla + nombre  ──► PDF base (sin QR) ──► IPFS = pdf_cid
 *
 *   EMITIR (paso 4, un alumno a la vez)
 *   2. Se lee el próximo token_id del contrato (tokenCounter).
 *   3. QR = <PUBLIC_VERIFY_URL>?token=<token_id>&cid=<pdf_cid>&red=<modo>
 *   4. Se sobrepone el QR al PDF base y se re-renderiza ──► PDF final ──► IPFS
 *   5. Imagen PNG del PDF final + metadata JSON ──► IPFS = tokenURI
 *   6. Recién ahí se mintea el NFT directo a la wallet del estudiante.
 *
 * Así el NFT que recibe el estudiante ya apunta al PDF con QR.
 */
const fs = require('fs');
const path = require('path');
const Base_Datos = require('./Base_Datos');
const Blockchain = require('./Blockchain');
const Ipfs = require('./Ipfs');
const { Escribir_Nombre_En_Plantilla, Estampar_Qr, Generar_Vista_Previa } = require('./Plantilla_Pdf');

const Carpeta_Subidas = path.join(__dirname, 'uploads');
// Copia local de cada PDF base, nombrada por su CID, para no descargarlo de
// IPFS al emitir. Si no está (ej. el servidor se reinició) se baja del gateway.
const Carpeta_Pdf_Base = path.join(Carpeta_Subidas, 'pdf-base');
fs.mkdirSync(Carpeta_Pdf_Base, { recursive: true });

function Ruta_Temporal(Prefijo, Extension = 'pdf') {
  return path.join(Carpeta_Subidas, `${Prefijo}-${Date.now()}-${Math.round(Math.random() * 1e6)}.${Extension}`);
}

function Borrar_Si_Existe(Ruta) {
  if (Ruta && fs.existsSync(Ruta)) fs.unlinkSync(Ruta);
}

// URL pública de verificación. Si PUBLIC_VERIFY_URL está vacío se usa el
// host del request (sirve en local, pero no fuera de tu máquina).
function Base_Verificacion(Peticion) {
  return process.env.PUBLIC_VERIFY_URL?.trim() || `${Peticion.protocol}://${Peticion.get('host')}/`;
}

function Url_Verificacion(Base, Token_Id, Pdf_Cid, Modo) {
  const Url = new URL(Base);
  Url.searchParams.set('token', String(Token_Id));
  Url.searchParams.set('cid', Pdf_Cid);
  Url.searchParams.set('red', Modo);
  return Url.toString();
}

async function Preparar_Pdf_Base(Nombre_Alumno, Bytes_Plantilla, Red) {
  const Bytes_Pdf = await Escribir_Nombre_En_Plantilla(Bytes_Plantilla, Nombre_Alumno);
  const Ruta_Pdf = Ruta_Temporal('cert-base');
  fs.writeFileSync(Ruta_Pdf, Bytes_Pdf);
  try {
    const Pdf_Cid = await Ipfs.Subir_Archivo_Ipfs(Ruta_Pdf, Red);
    fs.copyFileSync(Ruta_Pdf, path.join(Carpeta_Pdf_Base, `${Pdf_Cid}.pdf`));
    return { pdf_cid: Pdf_Cid, pdf_url: `${Ipfs.Gateway_Ipfs}${Pdf_Cid}` };
  } finally {
    Borrar_Si_Existe(Ruta_Pdf);
  }
}

async function Leer_Pdf_Base(Pdf_Cid) {
  const Ruta_Local = path.join(Carpeta_Pdf_Base, `${Pdf_Cid}.pdf`);
  if (fs.existsSync(Ruta_Local)) return fs.readFileSync(Ruta_Local);
  return Ipfs.Descargar_Ipfs(Pdf_Cid);
}

// PDF final con QR + imagen + metadata en IPFS. Devuelve el tokenURI.
async function Subir_Pdf_Final(Datos, Red) {
  const { Nombre_Alumno, Pdf_Cid, Token_Id, Contenido_Qr } = Datos;
  const Bytes_Final = await Estampar_Qr(await Leer_Pdf_Base(Pdf_Cid), Contenido_Qr, Token_Id);
  const Ruta_Final = Ruta_Temporal(`cert-final-${Token_Id}`);
  fs.writeFileSync(Ruta_Final, Bytes_Final);

  let Ruta_Vista = null;
  try {
    const Final_Pdf_Cid = await Ipfs.Subir_Archivo_Ipfs(Ruta_Final, Red);
    Ruta_Vista = await Generar_Vista_Previa(Ruta_Final);
    const Imagen_Cid = await Ipfs.Subir_Archivo_Ipfs(Ruta_Vista, Red);
    const Final_Pdf_Url = `${Ipfs.Gateway_Ipfs}${Final_Pdf_Cid}`;

    const Metadata_Cid = await Ipfs.Subir_Json_Ipfs({
      name: `Certificado ${Nombre_Alumno}`,
      description: 'Certificado almacenado en IPFS y representado como NFT. Escanea el QR del PDF para verificarlo.',
      image: `ipfs://${Imagen_Cid}`,
      external_url: Contenido_Qr,
      document: `ipfs://${Final_Pdf_Cid}`,
      pdf_url: Final_Pdf_Url,
      pdf_base: `ipfs://${Pdf_Cid}`,
      attributes: [
        { trait_type: 'Tipo', value: 'Certificado NFT' },
        { trait_type: 'Alumno', value: Nombre_Alumno },
        { trait_type: 'Token ID', value: String(Token_Id) },
        { trait_type: 'CID PDF base', value: Pdf_Cid },
      ],
    }, Red);

    return { Token_Uri: `ipfs://${Metadata_Cid}`, Final_Pdf_Cid, Final_Pdf_Url };
  } finally {
    Borrar_Si_Existe(Ruta_Final);
    Borrar_Si_Existe(Ruta_Vista);
  }
}

// Ejecuta los pasos 2 a 6 para un alumno. Al_Cambiar_Etapa(etapa, datos)
// informa el avance: estampando_qr -> enviando -> confirmando.
function Emitir_Certificado({ Red, Nombre_Alumno, Wallet_Alumno, Pdf_Cid, Base_Url, Al_Cambiar_Etapa = () => {} }) {
  return Blockchain.En_Cola_De_Minteo(async () => {
    Al_Cambiar_Etapa('estampando_qr');
    const Token_Id_Previsto = await Blockchain.Obtener_Siguiente_Token_Id(Red);
    const Contenido_Qr = Url_Verificacion(Base_Url, Token_Id_Previsto, Pdf_Cid, Red.Modo);
    const Final = await Subir_Pdf_Final({ Nombre_Alumno, Pdf_Cid, Token_Id: Token_Id_Previsto, Contenido_Qr }, Red);

    Al_Cambiar_Etapa('enviando');
    const Minteo = await Blockchain.Mintear_Certificado(Red, Wallet_Alumno, Final.Token_Uri, (Hash) => {
      Al_Cambiar_Etapa('confirmando', { tx_hash: Hash, explorer_url: `${Red.Explorador_Url}${Hash}` });
    });

    const Token_Id = Minteo.Token_Id ?? Token_Id_Previsto;
    const Token = await Blockchain.Consultar_Token(Red, Token_Id);
    let Estado = 'nft_transferido';
    let Error_Emision = null;
    if (Token_Id !== Token_Id_Previsto) {
      Estado = 'revisar_token';
      Error_Emision = `El contrato asignó el token #${Token_Id}, pero el QR apunta al #${Token_Id_Previsto}.`;
    } else if (Token?.Propietario?.toLowerCase() !== Wallet_Alumno.toLowerCase()) {
      Estado = 'revisar_owner';
      Error_Emision = 'El NFT no quedó en la wallet del estudiante.';
    }

    Borrar_Si_Existe(path.join(Carpeta_Pdf_Base, `${Pdf_Cid}.pdf`));
    const Hash = Minteo.Recibo.transactionHash;
    return {
      token_id: Token_Id,
      tx_hash: Hash,
      explorer_url: `${Red.Explorador_Url}${Hash}`,
      token_uri: Final.Token_Uri,
      pdf_cid: Pdf_Cid,
      final_pdf_cid: Final.Final_Pdf_Cid,
      final_pdf_url: Final.Final_Pdf_Url,
      qr_payload: Contenido_Qr,
      propietario: Token?.Propietario || null,
      estado: Estado,
      error: Error_Emision,
    };
  });
}

function Guardar_Emision(Datos) {
  Base_Datos.prepare(`
    INSERT INTO emisiones
      (lote_id, nombre_alumno, wallet_alumno, token_id, tx_hash, explorer_url, token_uri, estado, error,
       creado_por, institucion_id, pdf_cid, final_pdf_cid, final_pdf_url, qr_payload, red)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Datos.lote_id,
    Datos.nombre_alumno,
    Datos.wallet_alumno,
    Datos.token_id ?? null,
    Datos.tx_hash ?? null,
    Datos.explorer_url ?? null,
    Datos.token_uri ?? null,
    Datos.estado,
    Datos.error ?? null,
    Datos.creado_por ?? null,
    Datos.institucion_id ?? null,
    Datos.pdf_cid ?? null,
    Datos.final_pdf_cid ?? null,
    Datos.final_pdf_url ?? null,
    Datos.qr_payload ?? null,
    Datos.red
  );
}

module.exports = {
  Carpeta_Subidas,
  Base_Verificacion,
  Preparar_Pdf_Base,
  Emitir_Certificado,
  Guardar_Emision,
};
