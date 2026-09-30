/*
 * Genera el PDF final de un certificado a partir de una plantilla PDF,
 * dibujando el nombre del alumno en una posición fija configurable
 * (ver CERT_NAME_* en .env). El nombre se centra horizontalmente de forma
 * automática según el ancho de la página y la fuente usada.
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const NAME_PAGE_INDEX = Number(process.env.CERT_NAME_PAGE_INDEX || 0);
const NAME_Y = Number(process.env.CERT_NAME_Y || 300);
const NAME_FONT_SIZE = Number(process.env.CERT_NAME_FONT_SIZE || 28);
const NAME_MIN_FONT_SIZE = 16;
// Ancho máximo permitido para el nombre, como fracción del ancho de la
// página: deja margen a los costados para que un nombre largo nunca
// invada el borde de la plantilla ni se encime con la etiqueta "A:".
const NAME_MAX_WIDTH_RATIO = 0.5;

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

module.exports = { generarCertificadoDesdeTemplate };
