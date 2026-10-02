/*
 * Todo lo que toca el PDF del certificado:
 *   1. Escribir el nombre del alumno sobre la plantilla (PDF base, sin QR).
 *   2. Estampar el QR de verificación sobre ese PDF (PDF final).
 *   3. Renderizar la primera página como PNG cuadrado (imagen del NFT).
 * Las posiciones se configuran con CERT_NAME_* y CERT_QR_* en backend/.env.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');
const sharp = require('sharp');

const Pagina_Nombre = Number(process.env.CERT_NAME_PAGE_INDEX || 0);
const Altura_Nombre = Number(process.env.CERT_NAME_Y || 300);
const Tamano_Letra_Nombre = Number(process.env.CERT_NAME_FONT_SIZE || 28);
const Tamano_Letra_Minimo = 16;
// El nombre nunca ocupa más de la mitad del ancho de la página.
const Ancho_Maximo_Nombre = 0.5;

const Pagina_Qr = Number(process.env.CERT_QR_PAGE_INDEX || 0);
const Tamano_Qr = Number(process.env.CERT_QR_SIZE || 84);
const Margen_Qr = Number(process.env.CERT_QR_MARGIN || 28);

function Elegir_Pagina(Documento, Indice) {
  const Paginas = Documento.getPages();
  const Pagina = Paginas[Indice] || Paginas[0];
  if (!Pagina) throw new Error('El PDF no tiene páginas.');
  return Pagina;
}

// Dibuja el nombre en mayúsculas, centrado. Si no entra, achica la letra.
async function Escribir_Nombre_En_Plantilla(Bytes_Plantilla, Nombre_Alumno) {
  const Documento = await PDFDocument.load(Bytes_Plantilla);
  const Pagina = Elegir_Pagina(Documento, Pagina_Nombre);
  const Fuente = await Documento.embedFont(StandardFonts.HelveticaBold);
  const Texto = Nombre_Alumno.toUpperCase();
  const Ancho_Maximo = Pagina.getWidth() * Ancho_Maximo_Nombre;

  let Tamano = Tamano_Letra_Nombre;
  while (Fuente.widthOfTextAtSize(Texto, Tamano) > Ancho_Maximo && Tamano > Tamano_Letra_Minimo) Tamano -= 1;
  const Ancho_Texto = Fuente.widthOfTextAtSize(Texto, Tamano);

  Pagina.drawText(Texto, {
    x: Math.max((Pagina.getWidth() - Ancho_Texto) / 2, 0),
    y: Altura_Nombre,
    size: Tamano,
    font: Fuente,
    color: rgb(0, 0, 0),
  });
  return Documento.save();
}

// Sobrepone el QR (abajo a la derecha) con el token id escrito debajo.
async function Estampar_Qr(Bytes_Pdf, Contenido_Qr, Token_Id) {
  const Documento = await PDFDocument.load(Bytes_Pdf);
  const Pagina = Elegir_Pagina(Documento, Pagina_Qr);
  const Fuente = await Documento.embedFont(StandardFonts.Helvetica);
  const Imagen_Qr = await Documento.embedPng(
    await QRCode.toBuffer(Contenido_Qr, { errorCorrectionLevel: 'M', margin: 1, width: Tamano_Qr * 4 })
  );

  const X = Math.max(Pagina.getWidth() - Margen_Qr - Tamano_Qr, 0);
  const Y = Margen_Qr + 10;
  const Leyenda = `Verificar · #${Token_Id}`;
  const Tamano_Leyenda = 7;

  Pagina.drawRectangle({ x: X - 4, y: Y - 14, width: Tamano_Qr + 8, height: Tamano_Qr + 18, color: rgb(1, 1, 1) });
  Pagina.drawImage(Imagen_Qr, { x: X, y: Y, width: Tamano_Qr, height: Tamano_Qr });
  Pagina.drawText(Leyenda, {
    x: X + (Tamano_Qr - Fuente.widthOfTextAtSize(Leyenda, Tamano_Leyenda)) / 2,
    y: Y - 10,
    size: Tamano_Leyenda,
    font: Fuente,
    color: rgb(0.2, 0.2, 0.2),
  });
  return Documento.save();
}

// pdftoppm: en Windows se usa el binario incluido en pdf-poppler; en Linux
// y Mac el del sistema (paquete poppler-utils).
function Ruta_Pdftoppm() {
  if (process.platform !== 'win32') return 'pdftoppm';
  const Paquete = require.resolve('pdf-poppler/package.json');
  return path.join(path.dirname(Paquete), 'lib', 'win', 'poppler-0.51', 'bin', 'pdftoppm.exe');
}

// Renderiza la primera página y la centra en un lienzo cuadrado blanco:
// las wallets muestran la imagen del NFT recortada en 1:1.
async function Generar_Vista_Previa(Ruta_Pdf) {
  const Carpeta = path.dirname(Ruta_Pdf);
  const Prefijo = path.join(Carpeta, `${path.parse(Ruta_Pdf).name}-vista`);

  await new Promise((Resolver, Rechazar) => {
    execFile(Ruta_Pdftoppm(), ['-png', '-scale-to', '1024', '-f', '1', '-l', '1', Ruta_Pdf, Prefijo], (Error_Proceso, _Salida, Error_Texto) => {
      if (Error_Proceso) return Rechazar(new Error(`pdftoppm falló: ${Error_Texto || Error_Proceso.message}`));
      Resolver();
    });
  });

  // pdftoppm agrega "-1" o "-01" según la cantidad de páginas del PDF.
  const Ruta_Renderizada = [`${Prefijo}-1.png`, `${Prefijo}-01.png`].find((Ruta) => fs.existsSync(Ruta));
  if (!Ruta_Renderizada) throw new Error('No se pudo generar la vista previa del PDF.');

  const Ruta_Cuadrada = `${Prefijo}-cuadrada.png`;
  const { width: Ancho, height: Alto } = await sharp(Ruta_Renderizada).metadata();
  const Lado = Math.max(Ancho, Alto);
  await sharp({ create: { width: Lado, height: Lado, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: Ruta_Renderizada, gravity: 'center' }])
    .png()
    .toFile(Ruta_Cuadrada);
  fs.unlinkSync(Ruta_Renderizada);
  return Ruta_Cuadrada;
}

module.exports = { Escribir_Nombre_En_Plantilla, Estampar_Qr, Generar_Vista_Previa };
