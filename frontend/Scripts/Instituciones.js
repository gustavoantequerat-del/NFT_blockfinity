// Pantallas del administrador: instituciones, detalle, solicitudes de
// acceso y solicitudes de lotes.
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
  const Opciones = Estado.Instituciones.map((I) => `<option value="${I.id}">${Escapar(I.etiqueta)} · ${Escapar(I.nombre)}</option>`).join('');
  document.querySelectorAll('#vista-app [data-lista-instituciones]').forEach((Selector) => {
    Selector.innerHTML = Opciones;
    Selector.value = String(Institucion_Actual()?.id || '');
  });
  const Insignia = Por_Id('menu-lotes-pendientes');
  Insignia.hidden = !Datos.resumen.lotes_pendientes;
  Insignia.textContent = Datos.resumen.lotes_pendientes;
  return Datos;
}

function Pintar_Instituciones() {
  const Lista = Estado.Instituciones;
  Poner_Texto('inst-total', Lista.length);
  Poner_Texto('inst-certificados', Lista.reduce((Suma, I) => Suma + I.certificados, 0));
  Poner_Texto('inst-credito', Dinero(Lista.reduce((Suma, I) => Suma + Number(I.credito_usd), 0)));
  Poner_Texto('inst-solicitudes', Estado.Resumen?.solicitudes_acceso || 0);
  Por_Id('tabla-instituciones').innerHTML = Lista.map((I) => `
    <tr>
      <td><b>${Escapar(I.nombre)}</b><small class="sub-celda">${Escapar(I.etiqueta)} · ${Escapar(I.responsable_nombre || 'Sin responsable')}</small></td>
      <td class="mono">${Escapar(Acortar(I.wallet))}</td>
      <td class="mono derecha">${Dinero(I.credito_usd)}</td>
      <td class="mono derecha">${I.entregados} / ${I.certificados}</td>
      <td>${Etiqueta_Estado(I.estado)}</td>
      <td class="derecha"><a class="enlace" data-accion="Abrir_Institucion" data-id="${I.id}">Ver</a> · <a class="enlace" data-accion="Emitir_Para_Institucion" data-id="${I.id}">Emitir</a></td>
    </tr>`).join('') || Fila_Vacia(6, 'Aún no hay instituciones registradas.');
}

async function Cargar_Solicitudes_Acceso() {
  const { solicitudes: Solicitudes } = await Llamar_Api('/api/panel/solicitudes-acceso');
  Por_Id('tarjeta-solicitudes-acceso').hidden = !Solicitudes.length;
  Por_Id('tabla-solicitudes-acceso').innerHTML = Solicitudes.map((S) => `
    <tr>
      <td><b>${Escapar(S.nombre)}</b><small class="sub-celda">${Escapar(S.correo)}</small></td>
      <td>${Escapar(S.institucion_nombre)}</td>
      <td class="mono">${Formatear_Fecha(S.creado_en)}</td>
      <td class="derecha">
        <button class="boton boton--chico boton--primario" type="button" data-accion="Resolver_Solicitud_Acceso" data-id="${S.id}" data-decision="aprobar">Aprobar</button>
        <button class="boton boton--chico" type="button" data-accion="Resolver_Solicitud_Acceso" data-id="${S.id}" data-decision="rechazar">Rechazar</button>
      </td>
    </tr>`).join('');
}

Registrar_Pantalla('instituciones', {
  Titulo: 'Instituciones',
  Roles: ['admin'],
  Al_Mostrar: async () => {
    await Cargar_Instituciones();
    Pintar_Instituciones();
    await Cargar_Solicitudes_Acceso();
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
    Poner_Texto('det-etiqueta', I.etiqueta);
    Poner_Texto('det-responsable', I.responsable_nombre);
    Poner_Texto('det-certificados', I.certificados);
    Poner_Texto('det-entregados', I.entregados);
    Poner_Texto('det-credito', Dinero(I.credito_usd));
    Poner_Texto('det-wallet', I.wallet || 'Sin wallet registrada');
    Poner_Texto('det-correo', I.responsable_correo);
    Por_Id('det-estado').innerHTML = Etiqueta_Estado(I.estado);
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
        <td><b>${Escapar(L.institucion_nombre)}</b><small class="sub-celda">${Escapar(L.institucion_etiqueta)}</small></td>
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

async function Crear_Institucion(Formulario) {
  await Llamar_Api('/api/panel/instituciones', { json: Datos_Formulario(Formulario) });
  Formulario.reset();
  Ocultar_Formulario_Institucion();
  Mostrar_Aviso('Institución creada.');
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

async function Resolver_Solicitud_Acceso(Nodo) {
  await Llamar_Api(`/api/panel/solicitudes-acceso/${Nodo.dataset.id}/resolver`, { json: { accion: Nodo.dataset.decision } });
  Mostrar_Aviso('Solicitud actualizada.');
  Mostrar_Pantalla('instituciones');
}

async function Resolver_Lote(Nodo) {
  const Respuesta = await Llamar_Api(`/api/panel/lotes/${Nodo.dataset.id}/resolver`, { json: { accion: Nodo.dataset.decision } });
  Mostrar_Aviso(Nodo.dataset.decision === 'aprobar' ? (Respuesta.cobrado ? 'Lote autorizado y crédito descontado.' : 'Lote autorizado (modo test: sin descontar crédito).') : 'Lote rechazado.');
  await Cargar_Instituciones();
  Mostrar_Pantalla('solicitudes');
}

export const Acciones = {
  Mostrar_Formulario_Institucion, Ocultar_Formulario_Institucion, Abrir_Institucion,
  Resolver_Solicitud_Acceso, Resolver_Lote,
};
export const Formularios = { Crear_Institucion, Recargar_Credito };
