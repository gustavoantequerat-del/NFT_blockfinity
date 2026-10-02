// Aplica la marca de una institución (color + logo) a la página: paneles del
// admin institucional y del estudiante, y el header de /registro_<slug>.
import { Por_Id } from './Utilidades.js';

// Texto blanco u oscuro según qué se lea mejor sobre el color.
export function Es_Color_Oscuro(Color) {
  const [Rojo, Verde, Azul] = [1, 3, 5].map((Inicio) => parseInt(Color.slice(Inicio, Inicio + 2), 16) / 255);
  const Luminancia = 0.2126 * Rojo + 0.7152 * Verde + 0.0722 * Azul;
  return Luminancia < 0.6;
}

const Logo_Blockfinity = '/Recursos/Logos/Logo_Blockfinity_Gris.png';

// En el menú lateral va solo el logo (el nombre queda como texto
// alternativo): el de la institución, el de Blockfinity para el admin y la
// institución principal, o un monograma con su color si no subió logo.
function Pintar_Logo_Lateral(Institucion) {
  const Logo = Por_Id('marca-lateral-logo');
  const Inicial = Por_Id('marca-lateral-inicial');
  const Url = Institucion ? Institucion.logo_url || (Institucion.es_principal ? Logo_Blockfinity : null) : Logo_Blockfinity;
  const Nombre = Institucion?.nombre || 'Blockfinity Advisors';
  Logo.hidden = !Url;
  Inicial.hidden = Boolean(Url);
  if (Url) Logo.src = Url;
  Logo.alt = Nombre;
  Inicial.textContent = Nombre.split(/\s+/).slice(0, 2).map((Palabra) => Palabra[0] || '').join('').toUpperCase();
  Por_Id('marca-lateral').title = Nombre;
}

// Sin institución vuelve a los colores por defecto (definidos en Base.css).
export function Aplicar_Marca(Institucion) {
  const Estilo = document.body.style;
  Pintar_Logo_Lateral(Institucion);
  if (!Institucion) {
    ['--acento', '--acento-presionado', '--acento-suave', '--acento-texto', '--sobre-acento', '--fondo'].forEach((Variable) => Estilo.removeProperty(Variable));
    return;
  }

  const Color = Institucion.color;
  Estilo.setProperty('--acento', Color);
  Estilo.setProperty('--acento-presionado', `color-mix(in oklab, ${Color} 82%, black)`);
  Estilo.setProperty('--acento-suave', `color-mix(in oklab, ${Color} 12%, white)`);
  Estilo.setProperty('--sobre-acento', Es_Color_Oscuro(Color) ? '#ffffff' : '#0f172a');
  // Un color claro (ej. amarillo) se oscurece para textos y enlaces sobre blanco.
  Estilo.setProperty('--acento-texto', Es_Color_Oscuro(Color) ? Color : `color-mix(in oklab, ${Color} 45%, black)`);
  Estilo.setProperty('--fondo', `color-mix(in oklab, ${Color} 5%, #f4f6fb)`);
}
