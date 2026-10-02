// Pantallas de la cuenta de institución (viewer): dashboard, estudiantes
// y solicitud de lotes.
import { Llamar_Api } from './Api.js';
import { Estado, Institucion_Actual } from './Estado.js';
import { Registrar_Pantalla, Mostrar_Pantalla } from './Navegacion.js';
import { Cargar_Instituciones } from './Instituciones.js';
import {
  Por_Id, Poner_Texto, Escapar, Acortar, Dinero, Formatear_Fecha, Etiqueta_Estado,
  Es_Wallet_Valida, Fila_Vacia, Mostrar_Aviso, Datos_Formulario,
} from './Utilidades.js';

Registrar_Pantalla('tablero', {
  Titulo: 'Dashboard',
  Roles: ['viewer'],
  Al_Mostrar: async () => {
    await Cargar_Instituciones();
    const Institucion = Institucion_Actual();
    const { lotes: Lotes } = await Llamar_Api('/api/panel/lotes');
    Poner_Texto('tab-nombre', Institucion?.nombre || 'Dashboard');
    Poner_Texto('tab-credito', Dinero(Institucion?.credito_usd));
    Poner_Texto('tab-certificados', Institucion ? `${Institucion.entregados} / ${Institucion.certificados}` : 0);
    Poner_Texto('tab-pendientes', Lotes.filter((L) => L.estado === 'pendiente').length);
    Por_Id('tabla-lotes-institucion').innerHTML = Lotes.map((L) => `
      <tr><td class="mono">${Formatear_Fecha(L.creado_en)}</td><td><b>${Escapar(L.nombre)}</b></td>
      <td class="mono derecha">${L.cantidad}</td><td class="mono derecha">${Dinero(L.costo_usd)}</td>
      <td>${Escapar(L.plantilla_nombre || '—')}</td><td>${Etiqueta_Estado(L.estado)}</td></tr>`).join('')
      || Fila_Vacia(6, 'Todavía no enviaste ningún lote.');
  },
});

function Pintar_Estudiantes() {
  const Validos = Estado.Estudiantes.filter((E) => Es_Wallet_Valida(E.wallet)).length;
  const Institucion = Institucion_Actual();
  Por_Id('est-resumen').innerHTML = `<span class="texto-ok"><b>${Validos}</b> listos</span><span class="texto-error"><b>${Estado.Estudiantes.length - Validos}</b> sin wallet válida</span><span>${Estado.Estudiantes.length} en total</span>`;
  Por_Id('tabla-estudiantes').innerHTML = Estado.Estudiantes.map((E) => {
    const Valido = Es_Wallet_Valida(E.wallet);
    return `<tr class="${Valido ? '' : 'fila-error'}"><td><b>${Escapar(E.nombre)}</b></td><td>${Escapar(E.correo || '—')}</td>
      <td class="mono">${Escapar(Acortar(E.wallet))}</td><td>${Valido ? Etiqueta_Estado('lista') : '<span class="etiqueta etiqueta--error">wallet pendiente</span>'}</td>
      <td class="derecha"><a class="enlace" data-accion="Quitar_Estudiante" data-id="${E.id}">Quitar</a></td></tr>`;
  }).join('') || Fila_Vacia(5, 'Agrega estudiantes para crear un lote.');
  Poner_Texto('costo-cantidad', Validos);
  Poner_Texto('costo-unitario', Dinero(Estado.Precio_Unitario));
  Poner_Texto('costo-total', Dinero(Validos * Estado.Precio_Unitario));
  Poner_Texto('costo-credito', Dinero(Institucion?.credito_usd));
}

async function Cargar_Estudiantes() {
  Estado.Estudiantes = (await Llamar_Api('/api/panel/estudiantes')).estudiantes;
  Pintar_Estudiantes();
}

Registrar_Pantalla('estudiantes', {
  Titulo: 'Estudiantes y lotes',
  Roles: ['viewer'],
  Al_Mostrar: async () => {
    await Cargar_Instituciones();
    Estado.Precio_Unitario = (await Llamar_Api('/api/panel/lotes')).precio_unitario;
    await Cargar_Estudiantes();
  },
});

async function Agregar_Estudiante(Formulario) {
  await Llamar_Api('/api/panel/estudiantes', { json: Datos_Formulario(Formulario) });
  Formulario.reset();
  Mostrar_Aviso('Estudiante agregado.');
  await Cargar_Estudiantes();
}

async function Quitar_Estudiante(Nodo) {
  await Llamar_Api(`/api/panel/estudiantes/${Nodo.dataset.id}`, { metodo: 'DELETE' });
  await Cargar_Estudiantes();
}

async function Solicitar_Lote(Formulario) {
  const Datos = new FormData(Formulario);
  if (!Datos.get('plantilla')?.size) return Mostrar_Aviso('Adjunta la plantilla PDF del lote.', true);
  await Llamar_Api('/api/panel/lotes', { formulario: Datos });
  Formulario.reset();
  document.querySelector('[data-archivo-nombre="plantilla_lote"]').textContent = 'Adjuntar plantilla PDF';
  Mostrar_Aviso('Lote enviado al administrador.');
  Mostrar_Pantalla('tablero');
}

export const Acciones = { Quitar_Estudiante };
export const Formularios = { Agregar_Estudiante, Solicitar_Lote };
