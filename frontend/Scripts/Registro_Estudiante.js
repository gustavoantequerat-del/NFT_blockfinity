// Registro de estudiantes en /registro_<slug>. La página toma el color y el
// logo de la institución, y quien se registra queda como estudiante de ella.
// /registro (sin sufijo) es el de la institución principal, Blockfinity Advisors.
import { Llamar_Api } from './Api.js';
import { Mostrar_Vista } from './Navegacion.js';
import { Aplicar_Marca, Es_Color_Oscuro } from './Marca.js';
import { Por_Id, Datos_Formulario } from './Utilidades.js';

const Patron_Ruta = /^\/registro(?:_([a-z0-9_]+))?\/?$/i;
let Slug_Actual = null;

export function Es_Ruta_Registro() {
  return Patron_Ruta.test(window.location.pathname);
}

function Mostrar_Paso(Paso) {
  document.querySelectorAll('[data-paso-registro]').forEach((Nodo) => { Nodo.hidden = Nodo.dataset.pasoRegistro !== Paso; });
}

function Pintar_Header(Institucion) {
  const Barra = Por_Id('registro-barra');
  const Oscuro = Es_Color_Oscuro(Institucion.color);
  Barra.style.background = Institucion.color;
  Barra.style.color = Oscuro ? '#ffffff' : '#181b21';
  Barra.classList.toggle('registro-barra--clara', !Oscuro);
  Por_Id('registro-logo-blockfinity').src = `/Recursos/Logos/Logo_Blockfinity_${Oscuro ? 'Blanco' : 'Gris'}.png`;

  const Logo = Por_Id('registro-logo-institucion');
  if (Institucion.logo_url) {
    Logo.src = Institucion.logo_url;
    Logo.alt = Institucion.nombre;
  }
  // Sin logo se muestra el nombre junto al de Blockfinity. La principal es
  // Blockfinity misma: solo su logo.
  Logo.hidden = !Institucion.logo_url || Institucion.es_principal;
  Por_Id('registro-nombre-barra').textContent = Institucion.logo_url || Institucion.es_principal ? '' : Institucion.nombre;
  document.querySelector('.registro-separador').hidden = Institucion.es_principal;
}

export async function Arrancar_Registro_Estudiante() {
  const Slug_Ruta = window.location.pathname.match(Patron_Ruta)[1]?.toLowerCase();
  Mostrar_Vista('vista-registro');
  try {
    const { institucion: Institucion } = await Llamar_Api(Slug_Ruta ? `/api/publico/institucion/${Slug_Ruta}` : '/api/publico/institucion-principal');
    Slug_Actual = Institucion.slug;
    Aplicar_Marca(Institucion);
    Pintar_Header(Institucion);
    Por_Id('registro-titulo').textContent = `Regístrate en ${Institucion.nombre}`;
    document.title = `Registro · ${Institucion.nombre}`;
    Mostrar_Paso('formulario');
  } catch (_) {
    Mostrar_Paso('inexistente');
  }
}

function Ayuda_Wallet(Texto, Es_Error = false) {
  const Nodo = Por_Id('registro-ayuda-wallet');
  Nodo.textContent = Texto;
  Nodo.classList.toggle('texto-error', Es_Error);
}

// Con MetaMask instalada pide la cuenta (la crea si no existe). Si no está
// instalada abre su página de descarga.
async function Conectar_Metamask() {
  if (!window.ethereum) {
    window.open('https://metamask.io/download/', '_blank', 'noopener');
    return Ayuda_Wallet('Instala MetaMask en la pestaña que se abrió, recarga esta página y vuelve a pulsar “Usar MetaMask”. También puedes registrarte sin wallet y agregarla después.');
  }
  try {
    const Cuentas = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!Cuentas?.[0]) throw new Error();
    document.querySelector('[data-formulario="Registrar_Estudiante"] [name="wallet"]').value = Cuentas[0];
    Ayuda_Wallet('Listo: usamos la dirección de tu MetaMask. Guarda bien tu frase de recuperación.');
  } catch (_) {
    Ayuda_Wallet('No se pudo conectar con MetaMask. Pega tu dirección manualmente.', true);
  }
}

async function Registrar_Estudiante(Formulario) {
  const { mensaje: Mensaje } = await Llamar_Api(`/api/publico/registro/${Slug_Actual}`, { json: Datos_Formulario(Formulario) });
  Por_Id('registro-mensaje-listo').textContent = Mensaje;
  Formulario.reset();
  Mostrar_Paso('listo');
}

// El video del tutorial se carga solo si la persona lo abre.
document.addEventListener('toggle', (Evento) => {
  const Video = Evento.target.matches?.('.registro-tutorial') && Evento.target.querySelector('iframe[data-src]');
  if (Video && !Video.src) Video.src = Video.dataset.src;
}, true);

export const Acciones = { Conectar_Metamask };
export const Formularios = { Registrar_Estudiante };
