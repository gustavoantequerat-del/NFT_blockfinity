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
import { Leer_Token } from './Api.js';
import { Mostrar_Pantalla } from './Navegacion.js';
import { Mostrar_Aviso } from './Utilidades.js';

const Modulos = [Acceso, Red, Instituciones, Asistente_Emision, Panel_Institucion, Estudiante, Verificacion, Registro_Estudiante];
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

// Rutas: /login y /admin (acceso), /registro_<institución>, /verificar y
// la raíz con ?token=… (QR del certificado).
async function Arrancar() {
  if (Registro_Estudiante.Es_Ruta_Registro()) return Registro_Estudiante.Arrancar_Registro_Estudiante();

  const Parametros = new URLSearchParams(window.location.search);
  const Viene_Del_Qr = Parametros.get('token') || Parametros.get('cid');
  if (Viene_Del_Qr || window.location.pathname.startsWith('/verificar')) {
    if (Leer_Token()) await Acceso.Entrar_A_La_App('verificar').catch(() => Mostrar_Pantalla('verificar'));
    else Mostrar_Pantalla('verificar');
    if (!Viene_Del_Qr) return;
    document.getElementById('ver-consulta').value = Viene_Del_Qr;
    document.getElementById('ver-red').value = Parametros.get('red') || '';
    return Verificacion.Verificar(window.location.href);
  }
  return Acceso.Arrancar_Acceso();
}

Arrancar();
