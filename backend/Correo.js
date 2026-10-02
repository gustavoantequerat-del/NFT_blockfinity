// Envío de correos con la API HTTP de Resend (https://resend.com), usando
// axios, que ya es dependencia del proyecto. Si RESEND_API_KEY no está
// configurada, el correo se muestra en la consola del servidor.
const axios = require('axios');

async function Enviar_Correo({ Para, Asunto, Html }) {
  const Clave = process.env.RESEND_API_KEY?.trim();
  const Remitente = process.env.CORREO_REMITENTE?.trim();
  if (!Clave || !Remitente) {
    console.log(`\n[CORREO sin enviar: falta RESEND_API_KEY o CORREO_REMITENTE]\nPara: ${Para}\nAsunto: ${Asunto}\n${Html.replace(/<[^>]+>/g, ' ')}\n`);
    return false;
  }
  try {
    await axios.post('https://api.resend.com/emails', { from: Remitente, to: [Para], subject: Asunto, html: Html }, {
      headers: { Authorization: `Bearer ${Clave}` },
      timeout: 15000,
    });
    return true;
  } catch (Error_Correo) {
    console.error('❌ No se pudo enviar el correo:', Error_Correo.response?.data?.message || Error_Correo.message);
    return false;
  }
}

module.exports = { Enviar_Correo };
