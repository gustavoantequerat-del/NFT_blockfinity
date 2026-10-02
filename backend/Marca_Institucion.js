// Ruta y marca (color + logo) de cada institución.
const path = require('path');

const Carpeta_Logos = path.join(__dirname, 'uploads', 'logos');
const Url_Logos = '/Logos_Instituciones';
const Color_Predeterminado = '#2f56d3';

// "Rosa Gattorno" -> "rosa_gattorno" (la ruta queda /registro_rosa_gattorno).
function Crear_Slug(Nombre) {
  return String(Nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function Es_Color_Valido(Color) {
  return /^#[0-9a-fA-F]{6}$/.test(String(Color || ''));
}

// Lo que el frontend necesita para "brandear" la institución.
function Datos_Marca(Institucion) {
  if (!Institucion) return null;
  return {
    id: Institucion.id,
    nombre: Institucion.nombre,
    slug: Institucion.slug,
    color: Es_Color_Valido(Institucion.color) ? Institucion.color : Color_Predeterminado,
    logo_url: Institucion.logo_archivo ? `${Url_Logos}/${Institucion.logo_archivo}` : null,
    ruta_registro: `/registro_${Institucion.slug}`,
  };
}

module.exports = { Carpeta_Logos, Url_Logos, Color_Predeterminado, Crear_Slug, Es_Color_Valido, Datos_Marca };
