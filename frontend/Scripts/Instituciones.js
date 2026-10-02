// Pantallas del administrador: instituciones (alta con marca y cuenta
// institucional, edición y borrado) y solicitudes de lotes.
import { Llamar_Api } from './Api.js';
import { Estado, Institucion_Actual } from './Estado.js';
import { Registrar_Pantalla, Mostrar_Pantalla } from './Navegacion.js';
import {
  Por_Id, Poner_Texto, Escapar, Acortar, Dinero, Formatear_Fecha, Etiqueta_Estado,
  Enlaces_Emision, Fila_Vacia, Mostrar_Aviso, Datos_Formulario,
} from './Utilidades.js';

export async function Cargar_Instituciones() {
  const Datos = await Llamar_Api('/api/panel/resumen');
  Estado.Instituciones = Datos.instituciones;
  Estado.Resumen = Datos.resumen;
  const Opciones = Estado.Instituciones.map((I) => `<option value="${I.id}">${Escapar(I.nombre)}</option>`).join('');
  document.querySelectorAll('#vista-app [data-lista-instituciones]').forEach((Selector) => {
    Selector.innerHTML = Opciones;
    Selector.value = String(Institucion_Actual()?.id || '');
  });
  const Insignia = Por_Id('menu-lotes-pendientes');
  Insignia.hidden = !Datos.resumen.lotes_pendientes;
  Insignia.textContent = Datos.resumen.lotes_pendientes;
  return Datos;
}

// Misma regla que el backend: "Rosa Gattorno" -> "rosa_gattorno".
function Crear_Slug(Nombre) {
  return String(Nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function Logo_Miniatura(I) {
  return I.logo_url
    ? `<img class="miniatura-logo" src="${Escapar(I.logo_url)}" alt="" />`
    : `<span class="miniatura-logo" style="background:${Escapar(I.color)}"></span>`;
}

function Pintar_Instituciones() {
  const Lista = Estado.Instituciones;
  Poner_Texto('inst-total', Lista.length);
  Poner_Texto('inst-certificados', Lista.reduce((Suma, I) => Suma + I.certificados, 0));
  Poner_Texto('inst-credito', Dinero(Lista.reduce((Suma, I) => Suma + Number(I.credito_usd), 0)));
  Poner_Texto('inst-estudiantes', Lista.reduce((Suma, I) => Suma + I.estudiantes, 0));
  Por_Id('tabla-instituciones').innerHTML = Lista.map((I) => `
    <tr>
      <td><span class="celda-marca">${Logo_Miniatura(I)}<span><b>${Escapar(I.nombre)}</b>${I.es_principal ? ' <span class="pastilla">principal</span>' : ''}<small class="sub-celda">${Escapar(I.admin_correo || 'sin admin institucional')}</small></span></span></td>
      <td><a class="enlace-tx" href="${Escapar(I.ruta_registro)}" target="_blank">${Escapar(I.ruta_registro)}</a></td>
      <td class="mono derecha">${Dinero(I.credito_usd)}</td>
      <td class="mono derecha">${I.estudiantes}</td>
      <td class="mono derecha">${I.entregados} / ${I.certificados}</td>
      <td>${Etiqueta_Estado(I.estado)}</td>
      <td class="derecha"><a class="enlace" data-accion="Abrir_Institucion" data-id="${I.id}">Ver</a> · <a class="enlace" data-accion="Emitir_Para_Institucion" data-id="${I.id}">Emitir</a></td>
    </tr>`).join('') || Fila_Vacia(7, 'Aún no hay instituciones. Créalas cuando te las soliciten por correo.');
}

Registrar_Pantalla('instituciones', {
  Titulo: 'Instituciones',
  Roles: ['admin'],
  Al_Mostrar: async () => {
    await Cargar_Instituciones();
    Pintar_Instituciones();
  },
});

Registrar_Pantalla('institucion', {
  Titulo: 'Institución',
  Roles: ['admin'],
  Al_Mostrar: async () => {
    await Cargar_Instituciones();
    const I = Institucion_Actual();
    if (!I) return Mostrar_Pantalla('instituciones');
    Poner_Texto('det-nombre', I.nombre);
    Por_Id('det-logo').innerHTML = Logo_Miniatura(I);
    const Ruta = Por_Id('det-ruta');
    Ruta.href = I.ruta_registro;
    Ruta.textContent = `${window.location.origin}${I.ruta_registro}`;
    Poner_Texto('det-estudiantes', I.estudiantes);
    Poner_Texto('det-certificados', I.certificados);
    Poner_Texto('det-entregados', I.entregados);
    Poner_Texto('det-credito', Dinero(I.credito_usd));
    Por_Id('det-color').value = I.color;
    // La principal recibe a los estudiantes de las instituciones borradas: no se borra.
    Por_Id('zona-eliminar').hidden = I.es_principal;
    Por_Id('aviso-principal').hidden = !I.es_principal;
    Por_Id('det-responsable').value = I.responsable_nombre || '';
    Por_Id('det-correo').value = I.admin_correo || '';
    const { emisiones: Emisiones } = await Llamar_Api(`/api/certificados/historial?institucion_id=${I.id}`);
    Por_Id('tabla-det-emisiones').innerHTML = Emisiones.map((E) => `
      <tr><td class="mono">${Formatear_Fecha(E.creado_en)}</td><td><b>${Escapar(E.nombre_alumno)}</b></td>
      <td class="mono">${E.token_id != null ? `#${E.token_id}` : '—'}</td><td>${Etiqueta_Estado(E.estado)}</td><td>${Enlaces_Emision(E)}</td></tr>`).join('')
      || Fila_Vacia(5, 'Esta institución aún no tiene certificados en el modo activo.');
  },
});

Registrar_Pantalla('solicitudes', {
  Titulo: 'Solicitudes de lotes',
  Roles: ['admin'],
  Al_Mostrar: async () => {
    const { lotes: Lotes } = await Llamar_Api('/api/panel/lotes');
    Por_Id('tabla-lotes-admin').innerHTML = Lotes.map((L) => {
      let Acciones = '';
      if (L.estado === 'pendiente') {
        Acciones = `<button class="boton boton--chico boton--primario" type="button" data-accion="Resolver_Lote" data-id="${L.id}" data-decision="aprobar">Autorizar</button>
          <button class="boton boton--chico" type="button" data-accion="Resolver_Lote" data-id="${L.id}" data-decision="rechazar">Rechazar</button>`;
      } else if (L.estado === 'aprobada') {
        Acciones = `<button class="boton boton--chico boton--primario" type="button" data-accion="Emitir_Lote" data-id="${L.id}" data-institucion="${L.institucion_id}">Emitir</button>`;
      }
      return `<tr>
        <td><b>${Escapar(L.institucion_nombre)}</b></td>
        <td><b>${Escapar(L.nombre)}</b><small class="sub-celda">${L.cantidad} certificados · ${Escapar(L.plantilla_nombre || 'sin plantilla')} · ${Formatear_Fecha(L.creado_en)}</small></td>
        <td class="mono derecha">${Dinero(L.costo_usd)}</td>
        <td class="mono derecha">${Dinero(L.credito_usd)}</td>
        <td>${Etiqueta_Estado(L.estado)}${L.red ? ` <small class="sub-celda">${Escapar(L.red)}</small>` : ''}</td>
        <td class="derecha">${Acciones}</td>
      </tr>`;
    }).join('') || Fila_Vacia(6, 'No hay solicitudes registradas.');
  },
});

function Mostrar_Formulario_Institucion() {
  Por_Id('formulario-institucion').hidden = false;
}

function Ocultar_Formulario_Institucion() {
  Por_Id('formulario-institucion').hidden = true;
}

function Previsualizar_Ruta(Entrada) {
  Por_Id('ruta-previa').textContent = `/registro_${Crear_Slug(Entrada.value) || '…'}`;
}

async function Crear_Institucion(Formulario) {
  const { institucion: Institucion } = await Llamar_Api('/api/panel/instituciones', { formulario: new FormData(Formulario) });
  Formulario.reset();
  document.querySelector('[data-archivo-nombre="logo_nuevo"]').textContent = 'Subir logo';
  Previsualizar_Ruta({ value: '' });
  Ocultar_Formulario_Institucion();
  Mostrar_Aviso(`Institución creada. Registro de estudiantes: ${Institucion.ruta_registro}`);
  Mostrar_Pantalla('instituciones');
}

async function Editar_Institucion(Formulario) {
  await Llamar_Api(`/api/panel/instituciones/${Institucion_Actual().id}`, { metodo: 'PATCH', formulario: new FormData(Formulario) });
  Formulario.contrasena_admin.value = '';
  Formulario.logo.value = '';
  document.querySelector('[data-archivo-nombre="logo_editar"]').textContent = 'Reemplazar logo';
  Mostrar_Aviso('Institución actualizada.');
  Mostrar_Pantalla('institucion');
}

// Borrado irreversible: se pide escribir el nombre exacto para confirmar.
async function Eliminar_Institucion() {
  const I = Institucion_Actual();
  const Respuesta = prompt(`Se borrarán "${I.nombre}", su ruta de registro, su cuenta institucional y sus lotes. Sus ${I.estudiantes} estudiantes y sus certificados pasarán a Blockfinity Advisors.\n\nEscribe el nombre de la institución para confirmar:`);
  if (Respuesta === null) return;
  if (Respuesta.trim() !== I.nombre) return Mostrar_Aviso('El nombre no coincide. No se eliminó nada.', true);
  await Llamar_Api(`/api/panel/instituciones/${I.id}`, { metodo: 'DELETE' });
  Estado.Institucion_Activa = null;
  Mostrar_Aviso(`Institución "${I.nombre}" eliminada.`);
  Mostrar_Pantalla('instituciones');
}

async function Recargar_Credito(Formulario) {
  await Llamar_Api(`/api/panel/instituciones/${Institucion_Actual().id}/credito`, { json: Datos_Formulario(Formulario) });
  Formulario.reset();
  Mostrar_Aviso('Crédito actualizado.');
  Mostrar_Pantalla('institucion');
}

function Abrir_Institucion(Nodo) {
  Estado.Institucion_Activa = Number(Nodo.dataset.id);
  Mostrar_Pantalla('institucion');
}

async function Resolver_Lote(Nodo) {
  const Respuesta = await Llamar_Api(`/api/panel/lotes/${Nodo.dataset.id}/resolver`, { json: { accion: Nodo.dataset.decision } });
  Mostrar_Aviso(Nodo.dataset.decision === 'aprobar' ? (Respuesta.cobrado ? 'Lote autorizado y crédito descontado.' : 'Lote autorizado (modo test: sin descontar crédito).') : 'Lote rechazado.');
  await Cargar_Instituciones();
  Mostrar_Pantalla('solicitudes');
}

export const Acciones = {
  Mostrar_Formulario_Institucion, Ocultar_Formulario_Institucion, Abrir_Institucion,
  Previsualizar_Ruta, Eliminar_Institucion, Resolver_Lote,
};
export const Formularios = { Crear_Institucion, Editar_Institucion, Recargar_Credito };
