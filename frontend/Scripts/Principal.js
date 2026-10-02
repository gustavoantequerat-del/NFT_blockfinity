// Punto de entrada: junta las acciones de cada módulo, conecta los eventos
// del documento y decide qué vista mostrar según la URL.
import * as Acceso from './Acceso.js';
import * as Red from './Red.js';
import * as Instituciones from './Instituciones.js';
import * as Asistente_Emision from './Asistente_Emision.js';
import * as Panel_Institucion from './Panel_Institucion.js';
import * as Estudiante from './Estudiante.js';
import * as Verificacion from './Verificacion.js';
import * as Registro_Estudiante from './Registro_Estudiante.js';
import * as Camara_Qr from './Camara_Qr.js';
import * as Invitado from './Invitado.js';
import { Leer_Token } from './Api.js';
import { Mostrar_Pantalla } from './Navegacion.js';
import { Mostrar_Aviso } from './Utilidades.js';

const Modulos = [Acceso, Red, Instituciones, Asistente_Emision, Panel_Institucion, Estudiante, Verificacion, Registro_Estudiante, Camara_Qr];
const Acciones = Object.assign({ Alternar_Menu: () => document.body.classList.toggle('menu-abierto') }, ...Modulos.map((M) => M.Acciones || {}));
const Formularios = Object.assign({}, ...Modulos.map((M) => M.Formularios || {}));
const Archivos = Object.assign({}, ...Modulos.map((M) => M.Archivos || {}));

// Ejecuta una acción y muestra cualquier error como aviso.
async function Ejecutar(Funcion, ...Argumentos) {
  try {
    await Funcion(...Argumentos);
  } catch (Error_Accion) {
    Mostrar_Aviso(Error_Accion.message, true);
  }
}

document.addEventListener('click', (Evento) => {
  const Ir = Evento.target.closest('[data-pantalla-ir]');
  if (Ir) {
    Evento.preventDefault();
    Mostrar_Pantalla(Ir.dataset.pantallaIr);
    return;
  }
  const Nodo = Evento.target.closest('[data-accion]');
  if (!Nodo || !Acciones[Nodo.dataset.accion]) return;
  if (Nodo.tagName === 'A' && !Nodo.getAttribute('href')) Evento.preventDefault();
  Ejecutar(Acciones[Nodo.dataset.accion], Nodo, Evento);
});

document.addEventListener('change', (Evento) => {
  const Nodo = Evento.target;
  if (Nodo.dataset.archivo) {
    const Archivo = Nodo.files[0] || null;
    const Etiqueta = document.querySelector(`[data-archivo-nombre="${Nodo.dataset.archivo}"]`);
    if (Etiqueta && Archivo) Etiqueta.textContent = Archivo.name;
    if (Archivos[Nodo.dataset.archivo]) Ejecutar(Archivos[Nodo.dataset.archivo], Archivo, Nodo);
  }
  if (Nodo.dataset.accionCambio && Acciones[Nodo.dataset.accionCambio]) Ejecutar(Acciones[Nodo.dataset.accionCambio], Nodo, Evento);
});

// Campos que reaccionan mientras se escribe (ej. vista previa de la ruta).
document.addEventListener('input', (Evento) => {
  const Nodo = Evento.target;
  if (Nodo.dataset.accionEntrada && Acciones[Nodo.dataset.accionEntrada]) Ejecutar(Acciones[Nodo.dataset.accionEntrada], Nodo, Evento);
});

document.addEventListener('submit', async (Evento) => {
  const Formulario = Evento.target.closest('[data-formulario]');
  if (!Formulario || !Formularios[Formulario.dataset.formulario]) return;
  Evento.preventDefault();
  const Boton = Formulario.querySelector('[type="submit"]');
  if (Boton) Boton.disabled = true;
  await Ejecutar(Formularios[Formulario.dataset.formulario], Formulario);
  if (Boton) Boton.disabled = false;
});

// En celular las tablas se muestran como tarjetas: cada celda lleva el
// nombre de su columna (data-label) para mostrarlo al lado del valor.
function Etiquetar_Tablas() {
  document.querySelectorAll('.tabla').forEach((Tabla) => {
    const Columnas = [...Tabla.querySelectorAll('thead th')].map((Celda) => Celda.textContent.trim());
    Tabla.querySelectorAll('tbody tr').forEach((Fila) => {
      [...Fila.children].forEach((Celda, Indice) => {
        if (!Celda.hasAttribute('colspan') && Columnas[Indice] && !Celda.dataset.label) Celda.dataset.label = Columnas[Indice];
      });
    });
  });
}
new MutationObserver(Etiquetar_Tablas).observe(document.body, { childList: true, subtree: true });

document.addEventListener('keydown', (Evento) => {
  if (Evento.key === 'Escape') document.body.classList.remove('menu-abierto');
});

// Rutas: /login y /admin (acceso), /registro y /registro_<institución>,
// /invitado (landing pública), /verificar y la raíz con ?token=… (QR).
// Sin sesión, el QR y /verificar llevan a la landing de invitados.
async function Arrancar() {
  if (Registro_Estudiante.Es_Ruta_Registro()) return Registro_Estudiante.Arrancar_Registro_Estudiante();
  if (Invitado.Es_Ruta_Invitado()) return Invitado.Arrancar_Invitado();

  const Parametros = new URLSearchParams(window.location.search);
  const Viene_Del_Qr = Parametros.get('token') || Parametros.get('cid');
  if (Viene_Del_Qr || window.location.pathname.startsWith('/verificar')) {
    const Consulta = Viene_Del_Qr ? window.location.href : null;
    if (!Leer_Token()) return Invitado.Arrancar_Invitado(Consulta);
    try {
      await Acceso.Entrar_A_La_App('verificar');
    } catch (_) {
      return Invitado.Arrancar_Invitado(Consulta);
    }
    if (!Consulta) return;
    document.getElementById('ver-consulta').value = Viene_Del_Qr;
    document.getElementById('ver-red').value = Parametros.get('red') || '';
    return Verificacion.Verificar(Consulta);
  }
  return Acceso.Arrancar_Acceso();
}

Arrancar();
