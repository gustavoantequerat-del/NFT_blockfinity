/*
 * Genera el PDF final de un certificado a partir de una plantilla PDF,
 * dibujando el nombre del alumno en una posición fija configurable
 * (ver CERT_NAME_* en .env). El nombre se centra horizontalmente de forma
 * automática según el ancho de la página y la fuente usada.
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');

const NAME_PAGE_INDEX = Number(process.env.CERT_NAME_PAGE_INDEX || 0);
const NAME_Y = Number(process.env.CERT_NAME_Y || 300);
const NAME_FONT_SIZE = Number(process.env.CERT_NAME_FONT_SIZE || 28);
const NAME_MIN_FONT_SIZE = 16;
// Ancho máximo permitido para el nombre, como fracción del ancho de la
// página: deja margen a los costados para que un nombre largo nunca
// invada el borde de la plantilla ni se encime con la etiqueta "A:".
const NAME_MAX_WIDTH_RATIO = 0.5;
const QR_PAGE_INDEX = Number(process.env.CERT_QR_PAGE_INDEX || 0);
const QR_SIZE = Number(process.env.CERT_QR_SIZE || 84);
const QR_MARGIN = Number(process.env.CERT_QR_MARGIN || 28);

// Toma los bytes de la plantilla PDF y el nombre del alumno, dibuja el
// nombre centrado sobre la plantilla en la posición configurada, y
// devuelve los bytes del PDF final ya con el nombre insertado. Si el
// nombre es muy largo para el tamaño de letra preferido, lo va achicando
// hasta que entre dentro del ancho máximo permitido (nunca se desborda).
async function generarCertificadoDesdeTemplate(templateBytes, nombreAlumno) {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const pages = pdfDoc.getPages();
  const page = pages[NAME_PAGE_INDEX] || pages[0];

  if (!page) {
    throw new Error('La plantilla PDF no tiene páginas.');
  }

  const nombreMayusculas = nombreAlumno.toUpperCase();

  const { width } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const maxTextWidth = width * NAME_MAX_WIDTH_RATIO;

  let fontSize = NAME_FONT_SIZE;
  let textWidth = font.widthOfTextAtSize(nombreMayusculas, fontSize);
  while (textWidth > maxTextWidth && fontSize > NAME_MIN_FONT_SIZE) {
    fontSize -= 1;
    textWidth = font.widthOfTextAtSize(nombreMayusculas, fontSize);
  }

  const x = Math.max((width - textWidth) / 2, 0);

  page.drawText(nombreMayusculas, {
    x,
    y: NAME_Y,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });

  return pdfDoc.save();
}

async function estamparQrDeVerificacion(pdfBytes, verificationUrl) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPages()[QR_PAGE_INDEX] || pdfDoc.getPages()[0];

  if (!page) throw new Error('El certificado no tiene paginas para estampar el QR.');

  const qrPng = await QRCode.toBuffer(verificationUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: QR_SIZE * 4,
  });
  const image = await pdfDoc.embedPng(qrPng);
  const { width } = page.getSize();
  const x = Math.max(width - QR_MARGIN - QR_SIZE, 0);
  const y = QR_MARGIN;

  page.drawRectangle({ x: x - 4, y: y - 4, width: QR_SIZE + 8, height: QR_SIZE + 8, color: rgb(1, 1, 1) });
  page.drawImage(image, { x, y, width: QR_SIZE, height: QR_SIZE });
  return pdfDoc.save();
}

module.exports = { generarCertificadoDesdeTemplate, estamparQrDeVerificacion };
