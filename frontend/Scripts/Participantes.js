// Registros de wallet (admin): lo que llega desde /registro y /registroASOBAN.
import { Llamar_Api, Descargar_Archivo } from './Api.js';
import { Registrar_Pantalla } from './Navegacion.js';
import { Por_Id, Escapar, Formatear_Fecha, Fila_Vacia, Mostrar_Aviso, Datos_Formulario } from './Utilidades.js';

async function Cargar_Participantes() {
  const Evento = Por_Id('filtro-evento').value;
  const { participantes: Todos } = await Llamar_Api('/api/certificados/participantes');
  const Participantes = Evento ? Todos.filter((P) => P.evento === Evento) : Todos;
  Por_Id('tabla-participantes').innerHTML = Participantes.map((P) => `
    <tr><td><input type="checkbox" data-participante="${P.id}" /></td><td class="mono">${Formatear_Fecha(P.creado_en)}</td>
    <td><b>${Escapar(P.nombre)}</b></td><td class="mono">${Escapar(P.wallet)}</td><td>${Escapar(P.tipo)}</td><td>${Escapar(P.evento)}</td>
    <td class="derecha"><a class="enlace" data-accion="Eliminar_Participante" data-id="${P.id}">Eliminar</a></td></tr>`).join('')
    || Fila_Vacia(7, 'Todavía no hay registros de wallet.');
}

Registrar_Pantalla('participantes', { Titulo: 'Registros de wallet', Roles: ['admin'], Al_Mostrar: Cargar_Participantes });

function Marcar_Todos_Participantes(Casilla) {
  document.querySelectorAll('[data-participante]').forEach((Otra) => { Otra.checked = Casilla.checked; });
}

async function Exportar_Participantes() {
  const Ids = [...document.querySelectorAll('[data-participante]:checked')].map((Casilla) => Casilla.dataset.participante);
  const Evento = Por_Id('filtro-evento').value;
  const Parametros = new URLSearchParams();
  if (Ids.length) Parametros.set('ids', Ids.join(','));
  if (Evento) Parametros.set('evento', Evento);
  await Descargar_Archivo(`/api/certificados/participantes/exportar?${Parametros}`, 'Participantes.xlsx');
}

async function Agregar_Participante(Formulario) {
  await Llamar_Api('/api/certificados/participantes', { json: Datos_Formulario(Formulario) });
  Formulario.reset();
  Mostrar_Aviso('Registro agregado.');
  await Cargar_Participantes();
}

async function Eliminar_Participante(Nodo) {
  if (!confirm('¿Eliminar este registro de wallet?')) return;
  await Llamar_Api(`/api/certificados/participantes/${Nodo.dataset.id}`, { metodo: 'DELETE' });
  await Cargar_Participantes();
}

export const Acciones = { Cargar_Participantes, Marcar_Todos_Participantes, Exportar_Participantes, Eliminar_Participante };
export const Formularios = { Agregar_Participante };
