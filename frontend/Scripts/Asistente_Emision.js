// Asistente de emisión (admin): plantilla → estudiantes → PDFs base →
// confirmación → progreso. También la pantalla de historial de emisiones.
import { Llamar_Api } from './Api.js';
import { Estado, Institucion_Actual } from './Estado.js';
import { Registrar_Pantalla, Mostrar_Pantalla } from './Navegacion.js';
import {
  Por_Id, Poner_Texto, Escapar, Acortar, Formatear_Fecha, Etiqueta_Estado,
  Enlaces_Emision, Fila_Vacia, Mostrar_Aviso,
} from './Utilidades.js';

const Asistente = { Paso: 1, Plantilla: null, Excel: null, Filas: [], Preparados: [], Lote: null, Trabajo_Id: null };

function Reiniciar_Asistente() {
  Object.assign(Asistente, { Paso: 1, Plantilla: null, Excel: null, Filas: [], Preparados: [], Lote: null });
  document.querySelectorAll('[data-paso-asistente] input[type="file"]').forEach((Entrada) => { Entrada.value = ''; });
  Poner_Texto('asis-resumen-filas', '');
  Por_Id('tabla-asis-filas').innerHTML = Fila_Vacia(4, 'Sube un Excel para ver las filas.');
  document.querySelector('[data-archivo-nombre="plantilla"]').textContent = 'Seleccionar plantilla PDF';
  document.querySelector('[data-archivo-nombre="excel"]').textContent = 'Seleccionar Excel de estudiantes';
  Por_Id('conf-casilla').checked = false;
  Por_Id('boton-emitir').disabled = true;
}

function Ir_A_Paso(Paso) {
  Asistente.Paso = Paso;
  document.querySelectorAll('[data-paso-asistente]').forEach((Nodo) => { Nodo.hidden = Number(Nodo.dataset.pasoAsistente) !== Paso; });
  document.querySelectorAll('#pasos-asistente [data-paso]').forEach((Nodo) => {
    Nodo.classList.toggle('actual', Number(Nodo.dataset.paso) === Paso);
    Nodo.classList.toggle('hecho', Number(Nodo.dataset.paso) < Paso);
  });
  if (Paso === 4) Pintar_Confirmacion();
}

function Pintar_Datos_Red() {
  const Red = Estado.Red;
  Poner_Texto('asis-red', Red.modo ? `${Red.modo.toUpperCase()} · ${Red.nombre_red || 'sin configurar'}` : '—');
  Poner_Texto('asis-wallet', Red.wallet_emisora);
  const Info_Lote = Por_Id('asis-lote-info');
  Info_Lote.hidden = !Asistente.Lote;
  if (Asistente.Lote) {
    Info_Lote.textContent = `Emitiendo el lote “${Asistente.Lote.nombre}” (${Asistente.Filas.length} estudiantes). `
      + (Asistente.Lote.tiene_plantilla ? `Usa la plantilla enviada por la institución (${Asistente.Lote.plantilla_nombre}); puedes reemplazarla.` : 'Sube la plantilla PDF.');
  }
  Por_Id('asis-archivo-excel').hidden = Boolean(Asistente.Lote);
}

function Pintar_Filas() {
  const Validas = Asistente.Filas.filter((Fila) => Fila.valido).length;
  Por_Id('asis-resumen-filas').innerHTML = Asistente.Filas.length
    ? `<span class="texto-ok"><b>${Validas}</b> válidas</span><span class="texto-error"><b>${Asistente.Filas.length - Validas}</b> con error</span><span>${Asistente.Filas.length} totales</span>`
    : '';
  Por_Id('tabla-asis-filas').innerHTML = Asistente.Filas.map((Fila) => `
    <tr class="${Fila.valido ? '' : 'fila-error'}"><td class="mono">${Fila.fila}</td><td><b>${Escapar(Fila.nombre)}</b></td>
    <td class="mono">${Escapar(Acortar(Fila.wallet))}</td><td>${Fila.valido ? Etiqueta_Estado('valida') : `<span class="etiqueta etiqueta--error">${Escapar(Fila.error)}</span>`}</td></tr>`).join('')
    || Fila_Vacia(4, 'Sube un Excel para ver las filas.');
}

function Pintar_Confirmacion() {
  const Institucion = Institucion_Actual();
  const Red = Estado.Red;
  Poner_Texto('conf-institucion', Institucion ? `${Institucion.nombre} · ${Institucion.etiqueta}` : '—');
  Poner_Texto('conf-cantidad', Asistente.Preparados.length);
  Poner_Texto('conf-red', `${(Red.modo || '').toUpperCase()} · ${Red.nombre_red || ''}`);
  Poner_Texto('conf-wallet', Red.wallet_emisora);
  const Aviso = Por_Id('conf-aviso-red');
  Aviso.className = `banda ${Red.modo === 'main' ? 'banda--error' : 'banda--aviso'}`;
  Aviso.textContent = Red.modo === 'main'
    ? `MAIN: se enviarán ${Asistente.Preparados.length} transacciones con gas real.`
    : `TEST: se emitirá en testnet (${Red.nombre_red || 'sin configurar'}), sin costo real.`;
}

Registrar_Pantalla('asistente', {
  Titulo: 'Nueva emisión',
  Roles: ['admin'],
  Al_Mostrar: () => {
    Pintar_Datos_Red();
    Ir_A_Paso(Asistente.Paso);
  },
});

// ---------- Archivos ----------

function Elegir_Plantilla(Archivo) {
  Asistente.Plantilla = Archivo;
}

async function Elegir_Excel(Archivo) {
  Asistente.Excel = Archivo;
  if (!Archivo) return;
  const Formulario = new FormData();
  Formulario.append('excel', Archivo);
  Asistente.Filas = (await Llamar_Api('/api/certificados/validar-excel', { formulario: Formulario })).filas;
  Pintar_Filas();
}

// ---------- Acciones ----------

function Ir_Paso_Asistente(Nodo) {
  const Paso = Number(Nodo.dataset.paso);
  if (Paso === 2 && !Asistente.Plantilla && !Asistente.Lote?.tiene_plantilla) return Mostrar_Aviso('Selecciona la plantilla PDF.', true);
  if (Paso === 4 && !Asistente.Preparados.length) return Mostrar_Aviso('Primero genera los PDFs base.', true);
  Ir_A_Paso(Paso);
}

async function Preparar_Certificados() {
  if (!Asistente.Filas.some((Fila) => Fila.valido)) return Mostrar_Aviso('No hay filas válidas para emitir.', true);
  const Formulario = new FormData();
  if (Asistente.Plantilla) Formulario.append('plantilla', Asistente.Plantilla);
  if (Asistente.Lote) Formulario.append('lote_id', Asistente.Lote.id);
  else Formulario.append('excel', Asistente.Excel);

  Ir_A_Paso(3);
  Por_Id('asis-generando').hidden = false;
  Por_Id('asis-generados').hidden = true;
  try {
    Asistente.Preparados = (await Llamar_Api('/api/certificados/masivo/preparar', { formulario: Formulario })).certificados;
  } catch (Error_Preparar) {
    Ir_A_Paso(2);
    throw Error_Preparar;
  }
  Por_Id('tabla-asis-generados').innerHTML = Asistente.Preparados.map((C) => `
    <tr><td><b>${Escapar(C.nombre)}</b></td><td class="mono">${Escapar(Acortar(C.wallet))}</td>
    <td><a class="enlace-tx" target="_blank" rel="noopener" href="${Escapar(C.pdf_url)}">${Escapar(Acortar(C.pdf_cid))} ↗</a></td></tr>`).join('');
  Por_Id('asis-generando').hidden = true;
  Por_Id('asis-generados').hidden = false;
}

function Confirmar_Emision(Casilla) {
  Por_Id('boton-emitir').disabled = !Casilla.checked;
}

async function Iniciar_Emision() {
  const Respuesta = await Llamar_Api('/api/certificados/masivo/emitir', {
    json: { certificados: Asistente.Preparados, institucion_id: Institucion_Actual()?.id, lote_id: Asistente.Lote?.id },
  });
  Asistente.Trabajo_Id = Respuesta.trabajo_id;
  Reiniciar_Asistente();
  Por_Id('boton-ver-resultado').disabled = true;
  Por_Id('prog-bloqueo').hidden = false;
  Mostrar_Pantalla('progreso');
  Consultar_Progreso();
}

const Textos_Etapa = { en_cola: 'en cola', estampando_qr: 'estampando QR', enviando: 'enviando NFT', confirmando: 'confirmando', confirmado: 'entregado', revisar: 'revisar', error: 'error' };

async function Consultar_Progreso() {
  let Datos;
  try {
    Datos = await Llamar_Api(`/api/certificados/masivo/emitir/${Asistente.Trabajo_Id}`);
  } catch (Error_Progreso) {
    Mostrar_Aviso(Error_Progreso.message, true);
    return;
  }
  const Terminados = Datos.detalles.filter((D) => ['confirmado', 'revisar', 'error'].includes(D.etapa)).length;
  Poner_Texto('prog-contador', `${Terminados} de ${Datos.detalles.length}`);
  Poner_Texto('prog-texto', Datos.estado === 'procesando' ? `Emitiendo en ${Datos.red.toUpperCase()}…` : Datos.estado === 'error' ? `Error: ${Datos.error}` : 'Emisión completada.');
  Por_Id('prog-barra').style.width = `${Datos.detalles.length ? (Terminados / Datos.detalles.length) * 100 : 0}%`;
  Por_Id('tabla-progreso').innerHTML = Datos.detalles.map((D, Indice) => {
    const Clase = D.etapa === 'confirmado' ? 'ok' : D.etapa === 'error' ? 'error' : 'aviso';
    return `<tr class="${D.etapa === 'error' ? 'fila-error' : ''}"><td class="mono">${Indice + 1}</td><td><b>${Escapar(D.nombre)}</b><small class="sub-celda mono">${Escapar(Acortar(D.wallet))}</small></td>
      <td class="mono">${D.token_id != null ? `#${D.token_id}` : '—'}</td>
      <td><span class="etiqueta etiqueta--${Clase}">${Escapar(Textos_Etapa[D.etapa] || D.etapa)}</span></td>
      <td>${Enlaces_Emision({ ...D, red: Datos.red })}</td></tr>`;
  }).join('');

  if (Datos.estado === 'procesando') {
    setTimeout(Consultar_Progreso, 2000);
  } else {
    Por_Id('boton-ver-resultado').disabled = false;
    Por_Id('prog-bloqueo').hidden = true;
  }
}

Registrar_Pantalla('progreso', { Titulo: 'Procesando emisión', Roles: ['admin'] });

function Emitir_Para_Institucion(Nodo) {
  if (Nodo.dataset.id) Estado.Institucion_Activa = Number(Nodo.dataset.id);
  Reiniciar_Asistente();
  Mostrar_Pantalla('asistente');
}

async function Emitir_Lote(Nodo) {
  const Datos = await Llamar_Api(`/api/certificados/lote/${Nodo.dataset.id}/filas`);
  Reiniciar_Asistente();
  Estado.Institucion_Activa = Number(Nodo.dataset.institucion);
  Asistente.Lote = { id: Number(Nodo.dataset.id), nombre: Nodo.closest('tr')?.querySelector('td:nth-child(2) b')?.textContent || 'lote', tiene_plantilla: Datos.tiene_plantilla, plantilla_nombre: Datos.plantilla_nombre };
  Asistente.Filas = Datos.filas;
  Pintar_Filas();
  Mostrar_Pantalla('asistente');
}

function Cambiar_Institucion_Asistente(Selector) {
  Estado.Institucion_Activa = Number(Selector.value);
}

// ---------- Historial ----------

Registrar_Pantalla('emisiones', {
  Titulo: 'Emisiones',
  Roles: ['admin'],
  Al_Mostrar: async () => {
    const { resumen: Resumen, emisiones: Emisiones } = await Llamar_Api('/api/certificados/historial');
    Poner_Texto('emi-total', Resumen.total);
    Poner_Texto('emi-lotes', Resumen.lotes);
    Poner_Texto('emi-entregados', Resumen.entregados);
    Poner_Texto('emi-errores', Resumen.con_error);
    Por_Id('tabla-emisiones').innerHTML = Emisiones.map((E) => `
      <tr class="${E.estado === 'error_minteo' ? 'fila-error' : ''}">
        <td class="mono">${Formatear_Fecha(E.creado_en)}</td><td><b>${Escapar(E.nombre_alumno)}</b></td>
        <td>${Escapar(E.institucion_etiqueta || '—')}</td><td class="mono">${Escapar(Acortar(E.wallet_alumno))}</td>
        <td class="mono">${E.token_id != null ? `#${E.token_id}` : '—'}</td><td>${Etiqueta_Estado(E.estado)}</td><td>${Enlaces_Emision(E)}</td>
      </tr>`).join('') || Fila_Vacia(7, 'Todavía no hay emisiones en este modo de red.');
  },
});

export const Acciones = {
  Ir_Paso_Asistente, Preparar_Certificados, Confirmar_Emision, Iniciar_Emision,
  Emitir_Para_Institucion, Emitir_Lote, Cambiar_Institucion_Asistente,
};
export const Archivos = { plantilla: Elegir_Plantilla, excel: Elegir_Excel };
