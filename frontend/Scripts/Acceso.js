// Inicio de sesión y arranque de la app según el portal:
//   /login → estudiantes y administradores institucionales
//   /admin → administrador de la plataforma
// No se crean cuentas aquí: las instituciones las da de alta el admin y los
// estudiantes se registran en /registro_<institución>. Sí se recupera la
// contraseña: "¿Olvidaste tu contraseña?" envía un enlace ?reset=<token>.
import { Llamar_Api, Guardar_Token, Leer_Token } from './Api.js';
import { Estado } from './Estado.js';
import { Mostrar_Vista, Mostrar_Pantalla, Pantalla_Inicio } from './Navegacion.js';
import { Cargar_Red } from './Red.js';
import { Cargar_Instituciones } from './Instituciones.js';
import { Aplicar_Marca } from './Marca.js';
import { Datos_Formulario, Mostrar_Aviso, Por_Id } from './Utilidades.js';

export function Portal_Actual() {
  return window.location.pathname.replace(/\/+$/, '') === '/admin' ? 'admin' : 'usuario';
}

function Rol_Permitido(Rol) {
  return Portal_Actual() === 'admin' ? Rol === 'admin' : Rol !== 'admin';
}

const Token_Recuperacion = new URLSearchParams(window.location.search).get('reset');

function Mostrar_Panel_Acceso(Nodo) {
  const Panel = Nodo.dataset.panel;
  document.querySelectorAll('[data-panel-acceso]').forEach((Formulario) => { Formulario.hidden = Formulario.dataset.panelAcceso !== Panel; });
}

function Preparar_Pantalla_Acceso() {
  const Es_Admin = Portal_Actual() === 'admin';
  Por_Id('acceso-titulo').textContent = Es_Admin ? 'Acceso de administración' : 'Iniciar sesión';
  Por_Id('acceso-subtitulo').textContent = Es_Admin
    ? 'Solo para el administrador de la plataforma.'
    : 'Estudiantes e instituciones: entra con tu cuenta. Verás el panel de tu institución.';
  document.querySelectorAll('[data-solo-portal]').forEach((Nodo) => {
    if (Nodo.id !== 'acceso-contacto') Nodo.hidden = Nodo.dataset.soloPortal !== Portal_Actual();
  });
  document.title = Es_Admin ? 'Administración · Certificados NFT' : 'Iniciar sesión · Certificados NFT';
  Aplicar_Marca(null);
  Mostrar_Vista('vista-acceso');
}

// Las instituciones nuevas se piden por correo (CORREO_CONTACTO en el .env).
async function Mostrar_Contacto() {
  const { correo_contacto: Correo } = await Llamar_Api('/api/publico/configuracion');
  const Nodo = Por_Id('acceso-contacto');
  if (!Correo || Portal_Actual() === 'admin') return;
  Nodo.innerHTML = '¿Tu institución quiere emitir certificados? Escríbenos a <a class="enlace"></a>.';
  Nodo.querySelector('a').href = `mailto:${Correo}`;
  Nodo.querySelector('a').textContent = Correo;
  Nodo.hidden = false;
}

// Carga el usuario de la sesión guardada y muestra su entorno.
export async function Entrar_A_La_App(Pantalla) {
  Estado.Usuario = (await Llamar_Api('/api/sesion')).usuario;
  Aplicar_Marca(Estado.Usuario.institucion);
  await Cargar_Red();
  if (['admin', 'viewer'].includes(Estado.Usuario.rol)) await Cargar_Instituciones();
  document.title = `${Estado.Usuario.institucion?.nombre || 'Administración'} · Certificados NFT`;
  Mostrar_Pantalla(Pantalla || Pantalla_Inicio());
}

async function Iniciar_Sesion(Formulario) {
  const Datos = await Llamar_Api('/api/login', { json: { ...Datos_Formulario(Formulario), portal: Portal_Actual() } });
  Guardar_Token(Datos.token);
  Formulario.reset();
  await Entrar_A_La_App();
}

async function Pedir_Recuperacion(Formulario) {
  const { mensaje: Mensaje } = await Llamar_Api('/api/olvide-contrasena', { json: Datos_Formulario(Formulario) });
  Formulario.reset();
  Mostrar_Aviso(Mensaje);
  Mostrar_Panel_Acceso({ dataset: { panel: 'entrar' } });
}

async function Restablecer_Contrasena(Formulario) {
  const { contrasena: Contrasena, repetir: Repetir } = Datos_Formulario(Formulario);
  if (Contrasena !== Repetir) return Mostrar_Aviso('Las contraseñas no coinciden.', true);
  const { mensaje: Mensaje } = await Llamar_Api('/api/restablecer-contrasena', { json: { token: Token_Recuperacion, contrasena: Contrasena } });
  Formulario.reset();
  history.replaceState(null, '', window.location.pathname);
  Mostrar_Aviso(Mensaje);
  Mostrar_Panel_Acceso({ dataset: { panel: 'entrar' } });
}

function Cerrar_Sesion() {
  const Era_Admin = Estado.Usuario?.rol === 'admin';
  Guardar_Token(null);
  Estado.Usuario = null;
  Estado.Instituciones = [];
  window.location.href = Era_Admin ? '/admin' : '/login';
}

export async function Arrancar_Acceso() {
  Mostrar_Contacto().catch(() => {});
  if (Token_Recuperacion) {
    Preparar_Pantalla_Acceso();
    return Mostrar_Panel_Acceso({ dataset: { panel: 'restablecer' } });
  }
  if (Leer_Token()) {
    try {
      const { usuario: Usuario } = await Llamar_Api('/api/sesion');
      // Una sesión de otro portal no entra aquí: se pide iniciar sesión.
      if (Rol_Permitido(Usuario.rol)) return await Entrar_A_La_App();
    } catch (_) {
      Guardar_Token(null);
      Estado.Usuario = null;
    }
  }
  Preparar_Pantalla_Acceso();
}

export const Acciones = { Cerrar_Sesion, Mostrar_Panel_Acceso };
export const Formularios = { Iniciar_Sesion, Pedir_Recuperacion, Restablecer_Contrasena };
