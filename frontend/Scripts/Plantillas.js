// Plantillas PDF guardadas en el servidor, por institución. Se usan en:
//   - el asistente de emisión (admin) y el formulario "Solicitar lote"
//     (institución): selector + subir nueva + vista previa;
//   - la ficha de la institución (admin): galería de sus plantillas;
//   - las tablas de lotes: "Ver plantilla".
// La vista previa es un PNG que genera el backend con un nombre y un QR de
// ejemplo, así se ve cómo quedará el certificado.
import { Llamar_Api, Leer_Token, Descargar_Archivo } from './Api.js';
import { Por_Id, Escapar, Formatear_Fecha, Mostrar_Aviso } from './Utilidades.js';

const Imagenes = new Map(); // id -> URL local del PNG (ya descargado)
const Selectores = {}; // nombre del selector -> { Institucion_Id, Plantillas }

function Selector(Nombre) {
  return document.querySelector(`[data-selector-plantilla="${Nombre}"]`);
}

// Las imágenes van con el token de sesión, por eso no se usa <img src> directo.
async function Url_Vista(Id) {
  if (!Imagenes.has(Id)) {
    const Respuesta = await fetch(`/api/panel/plantillas/${Id}/vista`, { headers: { Authorization: `Bearer ${Leer_Token()}` } });
    if (!Respuesta.ok) throw new Error((await Respuesta.json().catch(() => ({}))).mensaje || 'No se pudo cargar la vista previa.');
    Imagenes.set(Id, URL.createObjectURL(await Respuesta.blob()));
  }
  return Imagenes.get(Id);
}

async function Poner_Imagen(Imagen, Id) {
  Imagen.removeAttribute('src');
  Imagen.closest('[data-cargando]')?.setAttribute('data-cargando', '1');
  try {
    Imagen.src = await Url_Vista(Id);
  } catch (Error_Vista) {
    Imagen.alt = Error_Vista.message;
  } finally {
    Imagen.closest('[data-cargando]')?.setAttribute('data-cargando', '0');
  }
}

async function Listar(Institucion_Id) {
  return (await Llamar_Api(`/api/panel/plantillas?institucion_id=${Institucion_Id || ''}`)).plantillas;
}

export function Plantilla_Elegida(Nombre) {
  return Number(Selector(Nombre)?.querySelector('[data-lista-plantillas]').value) || null;
}

function Mostrar_Plantilla_Elegida(Nodo) {
  const Contenedor = Nodo.closest('[data-selector-plantilla]');
  const Id = Number(Contenedor.querySelector('[data-lista-plantillas]').value);
  const Vista = Contenedor.querySelector('[data-vista-plantilla]');
  Vista.hidden = !Id;
  if (Id) Poner_Imagen(Vista.querySelector('img'), Id);
}

// Llena el selector con las plantillas de la institución y elige
// Elegida_Id (o la más reciente).
export async function Cargar_Selector_Plantillas(Nombre, Institucion_Id, Elegida_Id) {
  const Contenedor = Selector(Nombre);
  const Plantillas = await Listar(Institucion_Id);
  Selectores[Nombre] = { Institucion_Id, Plantillas };
  const Lista = Contenedor.querySelector('[data-lista-plantillas]');
  Lista.innerHTML = Plantillas.length
    ? Plantillas.map((P) => `<option value="${P.id}">${Escapar(P.nombre)} · ${Formatear_Fecha(P.creado_en)}</option>`).join('')
    : '<option value="">Sin plantillas guardadas: sube una</option>';
  if (Plantillas.length) Lista.value = String(Plantillas.some((P) => P.id === Number(Elegida_Id)) ? Elegida_Id : Plantillas[0].id);
  Mostrar_Plantilla_Elegida(Lista);
}

// Sube el PDF, el backend genera la vista previa y queda elegida.
async function Subir_Plantilla(Archivo, Entrada) {
  if (!Archivo) return;
  const Contenedor = Entrada.closest('[data-selector-plantilla]');
  const Nombre = Contenedor.dataset.selectorPlantilla;
  const Etiqueta = Contenedor.querySelector('.archivo b');
  const Texto_Original = Etiqueta.textContent;
  const Formulario = new FormData();
  Formulario.append('plantilla', Archivo);
  Formulario.append('institucion_id', Selectores[Nombre]?.Institucion_Id || '');
  Etiqueta.textContent = 'Subiendo y generando vista previa…';
  try {
    const { plantilla: Plantilla } = await Llamar_Api('/api/panel/plantillas', { formulario: Formulario });
    await Cargar_Selector_Plantillas(Nombre, Selectores[Nombre]?.Institucion_Id, Plantilla.id);
    Mostrar_Aviso(`Plantilla “${Plantilla.nombre}” guardada.`);
  } finally {
    Etiqueta.textContent = Texto_Original;
    Entrada.value = '';
  }
}

// Galería de la ficha de institución (admin).
export async function Pintar_Galeria_Plantillas(Contenedor_Id, Institucion_Id) {
  const Contenedor = Por_Id(Contenedor_Id);
  const Plantillas = await Listar(Institucion_Id);
  Contenedor.innerHTML = Plantillas.map((P) => `
    <button class="plantilla-tarjeta" type="button" data-accion="Ampliar_Plantilla" data-id="${P.id}" data-nombre="${Escapar(P.nombre)}">
      <span class="plantilla-miniatura" data-cargando="1"><img data-plantilla-img="${P.id}" alt="" /></span>
      <b>${Escapar(P.nombre)}</b>
      <small>${Formatear_Fecha(P.creado_en)}${P.subida_por ? ` · ${Escapar(P.subida_por)}` : ''}</small>
    </button>`).join('') || '<p class="ayuda">Esta institución todavía no subió plantillas.</p>';
  Contenedor.querySelectorAll('[data-plantilla-img]').forEach((Imagen) => Poner_Imagen(Imagen, Number(Imagen.dataset.plantillaImg)));
}

// Id y nombre: del botón (tablas, galería) o de lo elegido en el selector.
function Plantilla_Del_Nodo(Nodo) {
  if (Nodo.dataset.id) return { Id: Number(Nodo.dataset.id), Nombre: Nodo.dataset.nombre || 'plantilla.pdf' };
  const Lista = Nodo.closest('[data-selector-plantilla]')?.querySelector('[data-lista-plantillas]');
  const Id = Number(Lista?.value);
  const Plantilla = Object.values(Selectores).flatMap((S) => S.Plantillas).find((P) => P.id === Id);
  return { Id, Nombre: Plantilla?.nombre || 'plantilla.pdf' };
}

function Ampliar_Plantilla(Nodo) {
  const { Id, Nombre } = Plantilla_Del_Nodo(Nodo);
  if (!Id) return;
  const Modal = Por_Id('modal-plantilla');
  Por_Id('modal-plantilla-nombre').textContent = Nombre;
  Object.assign(Por_Id('modal-plantilla-descargar').dataset, { id: Id, nombre: Nombre });
  Modal.hidden = false;
  Poner_Imagen(Por_Id('modal-plantilla-imagen'), Id);
}

function Cerrar_Plantilla() {
  Por_Id('modal-plantilla').hidden = true;
}

async function Descargar_Plantilla(Nodo) {
  const { Id, Nombre } = Plantilla_Del_Nodo(Nodo);
  if (!Id) return Mostrar_Aviso('Elige una plantilla.', true);
  await Descargar_Archivo(`/api/panel/plantillas/${Id}/archivo`, Nombre);
}

// Celda "Plantilla" de las tablas de lotes.
export function Enlace_Plantilla(Lote) {
  if (!Lote.plantilla_id) return Escapar(Lote.plantilla_nombre || 'sin plantilla');
  return `<a class="enlace" data-accion="Ampliar_Plantilla" data-id="${Lote.plantilla_id}" data-nombre="${Escapar(Lote.plantilla_nombre || 'plantilla.pdf')}">${Escapar(Lote.plantilla_nombre || 'Ver plantilla')}</a>`;
}

export const Acciones = { Mostrar_Plantilla_Elegida, Ampliar_Plantilla, Cerrar_Plantilla, Descargar_Plantilla };
export const Archivos = { plantilla: Subir_Plantilla, plantilla_lote: Subir_Plantilla };
