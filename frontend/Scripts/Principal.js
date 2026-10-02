// Punto de entrada: junta las acciones de cada módulo, conecta los eventos
// del documento y decide qué vista mostrar según la URL.
import * as Acceso from './Acceso.js';
import * as Red from './Red.js';
import * as Instituciones from './Instituciones.js';
import * as Asistente_Emision from './Asistente_Emision.js';
import * as Panel_Institucion from './Panel_Institucion.js';
import * as Participantes from './Participantes.js';
import * as Estudiante from './Estudiante.js';
import * as Verificacion from './Verificacion.js';
import * as Registro_Wallet from './Registro_Wallet.js';
import { Leer_Token } from './Api.js';
import { Mostrar_Pantalla } from './Navegacion.js';
import { Mostrar_Aviso } from './Utilidades.js';

const Modulos = [Acceso, Red, Instituciones, Asistente_Emision, Panel_Institucion, Participantes, Estudiante, Verificacion, Registro_Wallet];
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

document.addEventListener('submit', async (Evento) => {
  const Formulario = Evento.target.closest('[data-formulario]');
  if (!Formulario || !Formularios[Formulario.dataset.formulario]) return;
  Evento.preventDefault();
  const Boton = Formulario.querySelector('[type="submit"]');
  if (Boton) Boton.disabled = true;
  await Ejecutar(Formularios[Formulario.dataset.formulario], Formulario);
  if (Boton) Boton.disabled = false;
});

async function Arrancar() {
  if (Registro_Wallet.Es_Ruta_Registro()) return Registro_Wallet.Arrancar_Registro_Wallet();

  // El QR del certificado abre "/?token=<id>&cid=<cid>&red=<modo>".
  const Parametros = new URLSearchParams(window.location.search);
  if (Parametros.get('token') || Parametros.get('cid')) {
    if (Leer_Token()) await Acceso.Entrar_A_La_App('verificar').catch(() => Mostrar_Pantalla('verificar'));
    else Mostrar_Pantalla('verificar');
    document.getElementById('ver-consulta').value = Parametros.get('token') || Parametros.get('cid');
    document.getElementById('ver-red').value = Parametros.get('red') || '';
    return Verificacion.Verificar(window.location.href);
  }
  return Acceso.Arrancar_Acceso();
}

Arrancar();
