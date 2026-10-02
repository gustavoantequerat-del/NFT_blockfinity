/*
 * Registro de wallet para recibir el certificado (/registro y /registroASOBAN).
 * Antes era una app React aparte; ahora es una vista más de este frontend.
 *   - "Ya tengo wallet": pega su dirección o la detectamos con la extensión.
 *   - "No tengo wallet": pedimos a MetaMask crear/conectar una cuenta. Si no
 *     está instalada, abrimos su descarga y esperamos a que aparezca.
 */
import { Llamar_Api } from './Api.js';
import { Mostrar_Vista } from './Navegacion.js';
import { Por_Id, Es_Wallet_Valida, Datos_Formulario } from './Utilidades.js';

const Es_Asoban = window.location.pathname.toLowerCase().includes('registroasoban');
const Evento = Es_Asoban ? 'asoban' : 'foro';
const Clave_Pendiente = 'rw_nombre_pendiente';
const Intervalo_Instalacion = 1500;
const Limite_Instalacion = 180000;

let Temporizador_Instalacion = null;
let Direccion_Registrada = '';

export function Es_Ruta_Registro() {
  return /^\/registro(asoban)?\/?$/i.test(window.location.pathname);
}

function Mostrar_Paso(Paso) {
  document.querySelectorAll('[data-rw-paso]').forEach((Nodo) => { Nodo.hidden = Nodo.dataset.rwPaso !== Paso; });
  Por_Id('rw-contenido').classList.toggle('rw-contenido--ancho', Paso === 'crear');
}

function Mensaje(Paso, Texto, Es_Error = true) {
  const Nodo = document.querySelector(`[data-rw-paso="${Paso}"] [data-rw-mensaje]`);
  Nodo.hidden = !Texto && Paso === 'crear';
  Nodo.className = Es_Error && Texto ? 'rw-error' : 'rw-ayuda';
  Nodo.textContent = Texto || 'Es la dirección pública que empieza con 0x (no una frase secreta ni una clave privada).';
}

async function Guardar_Registro(Nombre, Wallet, Tipo) {
  await Llamar_Api('/api/publico/registro-wallet', { json: { nombre: Nombre, wallet: Wallet, tipo: Tipo, evento: Evento } });
  Direccion_Registrada = Wallet;
  Por_Id('rw-direccion').textContent = Wallet;
  Por_Id('rw-listo-titulo').textContent = Tipo === 'creada' ? 'Tu wallet está lista' : 'Todo listo';
  Por_Id('rw-listo-texto').textContent = Tipo === 'creada'
    ? 'Creamos tu wallet en MetaMask y registramos tu dirección. Ahí recibirás tu certificado Web3.'
    : 'Registramos tu dirección. Ahí recibirás tu certificado Web3.';
  Por_Id('rw-nota-frase').hidden = Tipo !== 'creada';
  Mostrar_Paso('listo');
}

function Validar(Nombre, Wallet) {
  if (!Nombre) return 'Ingresa tu nombre completo.';
  if (!Es_Wallet_Valida(Wallet)) return 'Ingresa una dirección válida: empieza con 0x y tiene 42 caracteres.';
  return null;
}

// ---------- Acciones ----------

function Elegir_Camino_Wallet(Nodo) {
  Mostrar_Paso(Nodo.dataset.camino);
  if (Nodo.dataset.camino === 'tengo') {
    Mensaje('tengo', '');
    // Si la wallet ya autorizó este sitio, la precargamos sin pedir permiso.
    window.ethereum?.request({ method: 'eth_accounts' }).then((Cuentas) => {
      if (Cuentas?.[0]) document.querySelector('[data-rw-paso="tengo"] [name="wallet"]').value = Cuentas[0];
    }).catch(() => {});
  }
}

async function Detectar_Wallet() {
  if (!window.ethereum) return Mensaje('tengo', 'No detectamos ninguna wallet en este navegador (MetaMask, Coinbase Wallet, etc.). Ingresa tu dirección manualmente.');
  try {
    const Cuentas = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (Cuentas?.[0]) {
      document.querySelector('[data-rw-paso="tengo"] [name="wallet"]').value = Cuentas[0];
      Mensaje('tengo', 'Detectamos esta dirección en tu wallet conectada. Si no es la correcta, edítala.', false);
    }
  } catch (_) {
    Mensaje('tengo', 'No se pudo conectar con tu wallet. Puedes ingresar la dirección manualmente.');
  }
}

async function Registrar_Wallet_Existente(Formulario) {
  const { nombre: Nombre = '', wallet: Wallet = '' } = Datos_Formulario(Formulario);
  const Error_Datos = Validar(Nombre.trim(), Wallet.trim());
  if (Error_Datos) return Mensaje('tengo', Error_Datos);
  try {
    await Guardar_Registro(Nombre.trim(), Wallet.trim(), 'existente');
  } catch (Error_Guardar) {
    Mensaje('tengo', Error_Guardar.message);
  }
}

function Formulario_Crear() {
  return document.querySelector('[data-rw-paso="crear"] form');
}

function Mostrar_Espera(Esperando, Texto) {
  const Boton = document.querySelector('[data-rw-boton-crear]');
  Boton.disabled = Esperando;
  Boton.textContent = Texto || 'Crear mi wallet en MetaMask';
  document.querySelector('[data-rw-cancelar]').hidden = !Esperando || !Temporizador_Instalacion;
}

function Mostrar_Manual() {
  document.querySelector('[data-rw-manual]').hidden = false;
}

async function Conectar_Y_Guardar(Nombre) {
  Mostrar_Espera(true, 'Creando tu wallet…');
  try {
    const Cuentas = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!Cuentas?.[0]) throw new Error('No se pudo obtener tu dirección de MetaMask.');
    await Guardar_Registro(Nombre, Cuentas[0], 'creada');
  } catch (Error_Metamask) {
    Mensaje('crear', Error_Metamask.message || 'No se pudo crear tu wallet. Inténtalo de nuevo.');
    Mostrar_Manual();
  }
  Mostrar_Espera(false);
}

function Detener_Espera() {
  clearInterval(Temporizador_Instalacion);
  Temporizador_Instalacion = null;
  window.removeEventListener('focus', Recargar_Al_Volver);
}

// El navegador no inyecta una extensión recién instalada en una pestaña ya
// abierta: al volver a esta pestaña recargamos una vez y retomamos el registro.
function Recargar_Al_Volver() {
  if (window.ethereum) return;
  sessionStorage.setItem(Clave_Pendiente, Formulario_Crear().nombre.value.trim());
  window.location.reload();
}

async function Crear_Wallet_Metamask(Formulario) {
  const Nombre = Formulario.nombre.value.trim();
  Mensaje('crear', '');
  if (!Nombre) return Mensaje('crear', 'Ingresa tu nombre completo antes de continuar.');
  if (window.ethereum) return Conectar_Y_Guardar(Nombre);

  window.open('https://metamask.io/download/', '_blank', 'noopener');
  let Transcurrido = 0;
  Temporizador_Instalacion = setInterval(() => {
    Transcurrido += Intervalo_Instalacion;
    if (window.ethereum) {
      Detener_Espera();
      Conectar_Y_Guardar(Nombre);
    } else if (Transcurrido >= Limite_Instalacion) {
      Detener_Espera();
      Mostrar_Espera(false);
      Mensaje('crear', 'No detectamos MetaMask todavía. Si ya la instalaste, vuelve a hacer clic o pega tu dirección abajo.');
      Mostrar_Manual();
    }
  }, Intervalo_Instalacion);
  window.addEventListener('focus', Recargar_Al_Volver);
  Mostrar_Espera(true, 'Esperando a que instales MetaMask…');
}

function Cancelar_Espera_Metamask() {
  Detener_Espera();
  Mostrar_Espera(false);
}

async function Registrar_Wallet_Manual() {
  const Formulario = Formulario_Crear();
  const Nombre = Formulario.nombre.value.trim();
  const Wallet = Formulario.wallet.value.trim();
  const Error_Datos = Validar(Nombre, Wallet);
  if (Error_Datos) return Mensaje('crear', Error_Datos);
  try {
    await Guardar_Registro(Nombre, Wallet, 'creada');
  } catch (Error_Guardar) {
    Mensaje('crear', Error_Guardar.message);
  }
}

function Reiniciar_Registro_Wallet() {
  Detener_Espera();
  document.querySelectorAll('#vista-registro form').forEach((Formulario) => Formulario.reset());
  document.querySelector('[data-rw-manual]').hidden = true;
  Mensaje('crear', '');
  Mostrar_Espera(false);
  Mostrar_Paso('inicio');
}

function Copiar_Wallet_Registrada(Boton) {
  navigator.clipboard?.writeText(Direccion_Registrada).then(() => {
    Boton.textContent = 'Copiado';
    setTimeout(() => { Boton.textContent = 'Copiar'; }, 1800);
  });
}

export function Arrancar_Registro_Wallet() {
  document.title = Es_Asoban ? 'Recibe tu certificado Web3 · Certificados NFT ASOBAN' : 'Recibe tu certificado Web3 · Blockfinity Advisors';
  document.querySelectorAll('[data-rw-solo]').forEach((Nodo) => { Nodo.hidden = Nodo.dataset.rwSolo !== Evento; });
  Por_Id('rw-antetitulo').textContent = Es_Asoban ? 'Certificados NFT ASOBAN' : 'Certificados NFT';
  Mostrar_Vista('vista-registro');
  Mostrar_Paso('inicio');

  // Retoma el registro tras la recarga automática (ver Recargar_Al_Volver).
  const Nombre_Pendiente = sessionStorage.getItem(Clave_Pendiente);
  if (Nombre_Pendiente) {
    sessionStorage.removeItem(Clave_Pendiente);
    Mostrar_Paso('crear');
    Formulario_Crear().nombre.value = Nombre_Pendiente;
    if (window.ethereum) Conectar_Y_Guardar(Nombre_Pendiente);
  }
}

export const Acciones = {
  Elegir_Camino_Wallet, Detectar_Wallet, Cancelar_Espera_Metamask, Registrar_Wallet_Manual,
  Reiniciar_Registro_Wallet, Copiar_Wallet_Registrada,
};
export const Formularios = { Registrar_Wallet_Existente, Crear_Wallet_Metamask };
