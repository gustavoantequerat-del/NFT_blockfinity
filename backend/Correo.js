// Envío de correos. Se usa el primer proveedor configurado en backend/.env:
//   1. SMTP (ej. la cuenta de correo de cPanel): SMTP_HOST, SMTP_PUERTO,
//      SMTP_USUARIO, SMTP_CONTRASENA y CORREO_REMITENTE.
//   2. Resend (https://resend.com): RESEND_API_KEY y CORREO_REMITENTE.
// Sin ninguno, el correo se muestra en la consola del servidor.
// El cliente SMTP usa net/tls de Node, sin dependencias nuevas.
const net = require('net');
const tls = require('tls');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');

const Tiempo_Maximo = 20000;

function Variable(Nombre) {
  return process.env[Nombre]?.trim() || '';
}

function Proveedor_Activo() {
  if (Variable('SMTP_HOST') && Variable('CORREO_REMITENTE')) return 'smtp';
  if (Variable('RESEND_API_KEY') && Variable('CORREO_REMITENTE')) return 'resend';
  return null;
}

// Lo que ve el admin en Configuración (sin contraseñas).
function Estado_Correo() {
  const Proveedor = Proveedor_Activo();
  return {
    configurado: Boolean(Proveedor),
    proveedor: Proveedor,
    remitente: Variable('CORREO_REMITENTE') || null,
    servidor: Proveedor === 'smtp' ? `${Variable('SMTP_HOST')}:${Number(Variable('SMTP_PUERTO')) || 465}` : null,
  };
}

// "Nombre <correo@dominio>" → "correo@dominio".
function Direccion(Texto) {
  return (Texto.match(/<([^>]+)>/)?.[1] || Texto).trim();
}

function Base64_Lineas(Texto) {
  return Buffer.from(Texto, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
}

function Armar_Mensaje({ Remitente, Para, Asunto, Html }) {
  const Dominio = Direccion(Remitente).split('@')[1] || 'localhost';
  return [
    `From: ${Remitente}`,
    `To: ${Para}`,
    `Subject: =?UTF-8?B?${Buffer.from(Asunto, 'utf8').toString('base64')}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${Dominio}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Base64_Lineas(Html),
  ].join('\r\n');
}

// Conversación SMTP mínima: EHLO, STARTTLS (puerto 587), AUTH LOGIN, envío.
// Puerto 465 = TLS directo (el habitual en cPanel).
function Enviar_Por_Smtp({ Para, Asunto, Html }) {
  const Servidor = Variable('SMTP_HOST');
  const Puerto = Number(Variable('SMTP_PUERTO')) || 465;
  const Usuario = Variable('SMTP_USUARIO');
  const Contrasena = process.env.SMTP_CONTRASENA || '';
  const Remitente = Variable('CORREO_REMITENTE');
  const Nombre_Equipo = os.hostname() || 'localhost';

  return new Promise((Resolver, Rechazar) => {
    let Conexion;
    let Buffer_Entrada = '';
    let Esperando = null;
    let Terminado = false;

    const Cerrar = (Error_Smtp) => {
      if (Terminado) return;
      Terminado = true;
      clearTimeout(Temporizador);
      Conexion?.destroy();
      if (Error_Smtp) Rechazar(Error_Smtp);
      else Resolver();
    };
    const Temporizador = setTimeout(() => Cerrar(new Error(`El servidor SMTP ${Servidor}:${Puerto} no respondió a tiempo.`)), Tiempo_Maximo);

    // Respuestas de varias líneas: "250-..." continúa, "250 ..." termina.
    const Al_Recibir = (Datos) => {
      Buffer_Entrada += Datos.toString('utf8');
      const Lineas = Buffer_Entrada.split('\r\n');
      const Ultima_Completa = Lineas.slice(0, -1).reverse().find((Linea) => /^\d{3} /.test(Linea));
      if (!Ultima_Completa || !Esperando) return;
      const Respuesta = Buffer_Entrada;
      Buffer_Entrada = '';
      const Resolver_Paso = Esperando;
      Esperando = null;
      Resolver_Paso({ Codigo: Number(Ultima_Completa.slice(0, 3)), Texto: Respuesta.trim() });
    };

    const Leer = () => new Promise((Resolver_Paso) => { Esperando = Resolver_Paso; if (Buffer_Entrada) Al_Recibir(Buffer.alloc(0)); });
    const Paso = async (Comando, Codigos_Ok, Ocultar = false) => {
      if (Comando !== null) Conexion.write(`${Comando}\r\n`);
      const Respuesta = await Leer();
      if (!Codigos_Ok.includes(Respuesta.Codigo)) {
        throw new Error(`SMTP rechazó ${Ocultar ? 'la autenticación' : (Comando || 'la conexión').split(' ')[0]}: ${Respuesta.Texto}`);
      }
      return Respuesta;
    };

    const Conectar_Eventos = (Socket) => {
      Socket.on('data', Al_Recibir);
      Socket.on('error', (Error_Socket) => Cerrar(new Error(`No se pudo conectar a ${Servidor}:${Puerto}: ${Error_Socket.message}`)));
    };

    const Conversar = async () => {
      await Paso(null, [220]);
      let Saludo = await Paso(`EHLO ${Nombre_Equipo}`, [250]);
      if (Puerto !== 465 && /STARTTLS/i.test(Saludo.Texto)) {
        await Paso('STARTTLS', [220]);
        Conexion.removeAllListeners('data');
        Conexion = tls.connect({ socket: Conexion, servername: Servidor });
        Conectar_Eventos(Conexion);
        await new Promise((Listo) => Conexion.once('secureConnect', Listo));
        Saludo = await Paso(`EHLO ${Nombre_Equipo}`, [250]);
      }
      if (Usuario) {
        await Paso('AUTH LOGIN', [334]);
        await Paso(Buffer.from(Usuario).toString('base64'), [334], true);
        await Paso(Buffer.from(Contrasena).toString('base64'), [235], true);
      }
      await Paso(`MAIL FROM:<${Direccion(Remitente)}>`, [250]);
      await Paso(`RCPT TO:<${Direccion(Para)}>`, [250, 251]);
      await Paso('DATA', [354]);
      // Un punto al inicio de línea se duplica (transparencia SMTP).
      const Mensaje = Armar_Mensaje({ Remitente, Para, Asunto, Html }).replace(/^\./gm, '..');
      await Paso(`${Mensaje}\r\n.`, [250]);
      Conexion.write('QUIT\r\n');
    };

    Conexion = Puerto === 465
      ? tls.connect({ host: Servidor, port: Puerto, servername: Servidor })
      : net.connect({ host: Servidor, port: Puerto });
    Conectar_Eventos(Conexion);
    Conversar().then(() => Cerrar(), Cerrar);
  });
}

async function Enviar_Por_Resend({ Para, Asunto, Html }) {
  try {
    await axios.post('https://api.resend.com/emails', { from: Variable('CORREO_REMITENTE'), to: [Para], subject: Asunto, html: Html }, {
      headers: { Authorization: `Bearer ${Variable('RESEND_API_KEY')}` },
      timeout: Tiempo_Maximo,
    });
  } catch (Error_Resend) {
    throw new Error(`Resend: ${Error_Resend.response?.data?.message || Error_Resend.message}`);
  }
}

// Devuelve { Enviado, Error }. Nunca lanza: quien llama decide qué mostrar.
async function Enviar_Correo({ Para, Asunto, Html }) {
  const Proveedor = Proveedor_Activo();
  if (!Proveedor) {
    console.log(`\n[CORREO sin enviar: configura SMTP_* o RESEND_API_KEY y CORREO_REMITENTE en backend/.env]\nPara: ${Para}\nAsunto: ${Asunto}\n${Html.replace(/<[^>]+>/g, ' ')}\n`);
    return { Enviado: false, Error: 'No hay un servidor de correo configurado (SMTP_* o RESEND_API_KEY y CORREO_REMITENTE en backend/.env).' };
  }
  try {
    await (Proveedor === 'smtp' ? Enviar_Por_Smtp : Enviar_Por_Resend)({ Para, Asunto, Html });
    return { Enviado: true, Error: null };
  } catch (Error_Correo) {
    console.error('❌ No se pudo enviar el correo:', Error_Correo.message);
    return { Enviado: false, Error: Error_Correo.message };
  }
}

module.exports = { Enviar_Correo, Estado_Correo };
