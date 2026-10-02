// Subida y descarga de archivos en IPFS a través de Pinata. Las claves de
// Pinata vienen de la red activa (PINATA_*_TEST o PINATA_*_MAIN).
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const Gateway_Ipfs = 'https://gateway.pinata.cloud/ipfs/';

function Encabezados_Pinata(Red) {
  return {
    pinata_api_key: Red.Pinata_Api_Key,
    pinata_secret_api_key: Red.Pinata_Secret,
  };
}

function Mensaje_Error_Pinata(Error_Pinata) {
  const Detalle = Error_Pinata.response?.data?.error;
  return typeof Detalle === 'string' ? Detalle : Detalle?.details || Detalle?.reason || Error_Pinata.message;
}

// Sube un archivo (PDF o PNG) y devuelve su CID.
async function Subir_Archivo_Ipfs(Ruta_Archivo, Red) {
  const Formulario = new FormData();
  Formulario.append('file', fs.createReadStream(Ruta_Archivo));
  try {
    const Respuesta = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', Formulario, {
      maxBodyLength: Infinity,
      headers: { ...Formulario.getHeaders(), ...Encabezados_Pinata(Red) },
    });
    return Respuesta.data.IpfsHash;
  } catch (Error_Pinata) {
    throw new Error(`No se pudo subir el archivo a IPFS: ${Mensaje_Error_Pinata(Error_Pinata)}`);
  }
}

// Sube el JSON de metadata del NFT y devuelve su CID (se usa como tokenURI).
async function Subir_Json_Ipfs(Datos, Red) {
  try {
    const Respuesta = await axios.post('https://api.pinata.cloud/pinning/pinJSONToIPFS', Datos, {
      headers: { 'Content-Type': 'application/json', ...Encabezados_Pinata(Red) },
    });
    return Respuesta.data.IpfsHash;
  } catch (Error_Pinata) {
    throw new Error(`No se pudo subir la metadata a IPFS: ${Mensaje_Error_Pinata(Error_Pinata)}`);
  }
}

async function Descargar_Ipfs(Cid, Como_Json = false) {
  const Respuesta = await axios.get(`${Gateway_Ipfs}${Cid}`, {
    responseType: Como_Json ? 'json' : 'arraybuffer',
    timeout: 30000,
  });
  return Como_Json ? Respuesta.data : Buffer.from(Respuesta.data);
}

// Extrae un CID de "ipfs://CID", de una URL ".../ipfs/CID" o del CID suelto
// (CIDv0 "Qm..." o CIDv1 "baf...").
function Extraer_Cid(Valor) {
  const Coincidencia = String(Valor || '').match(/(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})/);
  return Coincidencia ? Coincidencia[1] : null;
}

module.exports = { Gateway_Ipfs, Subir_Archivo_Ipfs, Subir_Json_Ipfs, Descargar_Ipfs, Extraer_Cid };
