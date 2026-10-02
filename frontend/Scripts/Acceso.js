// Inicio de sesión, creación de cuenta, recuperación de contraseña y
// arranque de la app según el rol del usuario.
import { Llamar_Api, Guardar_Token, Leer_Token } from './Api.js';
import { Estado } from './Estado.js';
import { Mostrar_Vista, Mostrar_Pantalla, Pantalla_Inicio } from './Navegacion.js';
import { Cargar_Red } from './Red.js';
import { Cargar_Instituciones } from './Instituciones.js';
import { Datos_Formulario, Mostrar_Aviso, Escapar } from './Utilidades.js';

const Parametros = new URLSearchParams(window.location.search);

function Cambiar_Pestana_Acceso(Nodo) {
  const Pestana = Nodo.dataset.pestana;
  document.querySelectorAll('[data-panel-acceso]').forEach((Panel) => { Panel.hidden = Panel.dataset.panelAcceso !== Pestana; });
  document.querySelectorAll('.pestanas [data-pestana]').forEach((Boton) => Boton.classList.toggle('activa', Boton.dataset.pestana === Pestana));
}

function Cambiar_Tipo_Cuenta(Selector) {
  document.querySelectorAll('[data-solo-tipo]').forEach((Campo) => { Campo.hidden = Campo.dataset.soloTipo !== Selector.value; });
}

export async function Cargar_Instituciones_Publicas() {
  const Datos = await Llamar_Api('/api/publico/instituciones');
  const Opciones = Datos.instituciones.map((I) => `<option value="${I.id}">${Escapar(I.etiqueta)} · ${Escapar(I.nombre)}</option>`).join('');
  document.querySelectorAll('[data-panel-acceso="crear"] [data-lista-instituciones]').forEach((Selector) => { Selector.innerHTML = Opciones; });
}

// Carga el usuario de la sesión guardada y muestra su pantalla de inicio.
export async function Entrar_A_La_App(Pantalla) {
  Estado.Usuario = (await Llamar_Api('/api/sesion')).usuario;
  await Cargar_Red();
  if (['admin', 'viewer'].includes(Estado.Usuario.rol)) await Cargar_Instituciones();
  Mostrar_Pantalla(Pantalla || Pantalla_Inicio());
}

async function Iniciar_Sesion(Formulario) {
  const Datos = await Llamar_Api('/api/login', { json: Datos_Formulario(Formulario) });
  Guardar_Token(Datos.token);
  Formulario.reset();
  await Entrar_A_La_App();
}

async function Crear_Cuenta(Formulario) {
  const Datos = Datos_Formulario(Formulario);
  if (Datos.tipo === 'estudiante') delete Datos.institucion_id;
  else delete Datos.wallet;
  const Respuesta = await Llamar_Api('/api/registro', { json: Datos });
  Mostrar_Aviso(Respuesta.mensaje);
  Formulario.reset();
  Cambiar_Pestana_Acceso({ dataset: { pestana: 'entrar' } });
}

async function Pedir_Recuperacion(Formulario) {
  Mostrar_Aviso((await Llamar_Api('/api/olvide-contrasena', { json: Datos_Formulario(Formulario) })).mensaje);
}

async function Restablecer_Contrasena(Formulario) {
  const Respuesta = await Llamar_Api('/api/restablecer-contrasena', { json: { ...Datos_Formulario(Formulario), token: Parametros.get('reset') } });
  Mostrar_Aviso(Respuesta.mensaje);
  history.replaceState(null, '', '/');
  Cambiar_Pestana_Acceso({ dataset: { pestana: 'entrar' } });
}

function Cerrar_Sesion() {
  Guardar_Token(null);
  Estado.Usuario = null;
  Estado.Instituciones = [];
  Volver_Al_Acceso();
}

function Volver_Al_Acceso() {
  history.replaceState(null, '', '/');
  Mostrar_Vista('vista-acceso');
}

async function Ir_A_Verificacion() {
  await Cargar_Red();
  Mostrar_Pantalla('verificar');
}

// Decide qué mostrar al abrir la página: restablecer contraseña, sesión
// guardada o pantalla de acceso.
export async function Arrancar_Acceso() {
  Cargar_Instituciones_Publicas().catch(() => {});
  if (Parametros.get('reset')) {
    Mostrar_Vista('vista-acceso');
    Cambiar_Pestana_Acceso({ dataset: { pestana: 'restablecer' } });
    return;
  }
  if (Leer_Token()) {
    try {
      await Entrar_A_La_App();
      return;
    } catch (_) {
      Guardar_Token(null);
      Estado.Usuario = null;
    }
  }
  Mostrar_Vista('vista-acceso');
}

export const Acciones = { Cambiar_Pestana_Acceso, Cambiar_Tipo_Cuenta, Cerrar_Sesion, Volver_Al_Acceso, Ir_A_Verificacion };
export const Formularios = { Iniciar_Sesion, Crear_Cuenta, Pedir_Recuperacion, Restablecer_Contrasena };
