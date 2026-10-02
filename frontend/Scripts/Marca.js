// Aplica la marca de una institución (color + logo) a la página: paneles del
// admin institucional y del estudiante, y el header de /registro_<slug>.
import { Por_Id } from './Utilidades.js';

// Texto blanco u oscuro según qué se lea mejor sobre el color.
export function Es_Color_Oscuro(Color) {
  const [Rojo, Verde, Azul] = [1, 3, 5].map((Inicio) => parseInt(Color.slice(Inicio, Inicio + 2), 16) / 255);
  const Luminancia = 0.2126 * Rojo + 0.7152 * Verde + 0.0722 * Azul;
  return Luminancia < 0.6;
}

// Sin institución vuelve a los colores por defecto (definidos en Base.css).
export function Aplicar_Marca(Institucion) {
  const Estilo = document.body.style;
  const Lateral_Logo = Por_Id('marca-lateral-logo');
  const Lateral_Inicial = Por_Id('marca-lateral-inicial');

  if (!Institucion) {
    ['--acento', '--acento-presionado', '--acento-suave', '--acento-texto', '--sobre-acento', '--fondo'].forEach((Variable) => Estilo.removeProperty(Variable));
    Lateral_Logo.hidden = true;
    Lateral_Inicial.hidden = false;
    Por_Id('marca-lateral-nombre').textContent = 'Certificados NFT';
    return;
  }

  const Color = Institucion.color;
  Estilo.setProperty('--acento', Color);
  Estilo.setProperty('--acento-presionado', `color-mix(in oklab, ${Color} 82%, black)`);
  Estilo.setProperty('--acento-suave', `color-mix(in oklab, ${Color} 12%, white)`);
  Estilo.setProperty('--sobre-acento', Es_Color_Oscuro(Color) ? '#ffffff' : '#181b21');
  // Un color claro (ej. amarillo) se oscurece para textos y enlaces sobre blanco.
  Estilo.setProperty('--acento-texto', Es_Color_Oscuro(Color) ? Color : `color-mix(in oklab, ${Color} 45%, black)`);
  Estilo.setProperty('--fondo', `color-mix(in oklab, ${Color} 4%, #f5f6f8)`);

  Lateral_Logo.hidden = !Institucion.logo_url;
  Lateral_Inicial.hidden = Boolean(Institucion.logo_url);
  if (Institucion.logo_url) Lateral_Logo.src = Institucion.logo_url;
  Lateral_Inicial.textContent = Institucion.nombre.slice(0, 2).toUpperCase();
  Por_Id('marca-lateral-nombre').textContent = Institucion.nombre;
}
