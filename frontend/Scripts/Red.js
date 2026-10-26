// Modo de red (test / main): indicador en la barra superior, switch del
// administrador y pantalla de Configuración.
import { Llamar_Api } from './Api.js';
import { Estado, Rol_Actual } from './Estado.js';
import { Registrar_Pantalla, Mostrar_Pantalla } from './Navegacion.js';
import { Por_Id, Escapar, Mostrar_Aviso } from './Utilidades.js';

export async function Cargar_Red() {
  Estado.Red = Estado.Usuario ? await Llamar_Api('/api/panel/red') : { modo: null };
  Pintar_Red();
  return Estado.Red;
}

function Pintar_Red() {
  const { modo: Modo, nombre_red: Nombre_Red, error: Error_Red } = Estado.Red;
  const Pastilla = Por_Id('pastilla-red');
  Pastilla.hidden = !Modo;
  Pastilla.dataset.modo = Modo || '';
  Por_Id('pastilla-red-texto').textContent = Modo ? `${Modo.toUpperCase()} · ${Nombre_Red || 'sin configurar'}` : '';
  document.body.dataset.modoRed = Modo || '';
  document.querySelectorAll('.selector-red [data-modo]').forEach((Boton) => Boton.classList.toggle('activo', Boton.dataset.modo === Modo));

  const Banda = Por_Id('banda-red');
  const Mensajes = [];
  if (Modo === 'test' && Rol_Actual() === 'admin') Mensajes.push('Modo TEST: emisiones en testnet, sin costo real y sin descontar Credits.');
  if (Modo === 'main' && Rol_Actual() === 'admin') Mensajes.push('Modo MAIN: cada emisión gasta gas real y los lotes descuentan Credits.');
  if (Error_Red && Rol_Actual() === 'admin') Mensajes.push(`⚠ ${Error_Red}`);
  Banda.hidden = !Mensajes.length;
  Banda.textContent = Mensajes.join('  ');
}

async function Cambiar_Modo_Red(Nodo) {
  const Modo = Nodo.dataset.modo;
  if (Modo === Estado.Red.modo) return;
  if (Modo === 'main' && !confirm('Vas a pasar a MAIN: las emisiones gastarán gas real y los lotes descontarán Credits. ¿Continuar?')) return;
  try {
    await Llamar_Api('/api/panel/red/modo', { metodo: 'PUT', json: { modo: Modo } });
    await Cargar_Red();
    Mostrar_Aviso(`Modo ${Modo.toUpperCase()} activado.`);
    Mostrar_Pantalla(document.querySelector('.pantalla:not([hidden])')?.dataset.pantalla);
  } catch (Error_Cambio) {
    Mostrar_Aviso(Error_Cambio.message, true);
  }
}

function Tarjeta_Red(Red) {
  const Filas = Red.configurada
    ? `<dt>Red</dt><dd>${Escapar(Red.nombre_red)} (chain ${Escapar(Red.chain_id)})</dd>
       <dt>Wallet emisora</dt><dd class="mono quebrar">${Escapar(Red.wallet_emisora)}</dd>
       <dt>Contrato</dt><dd class="mono quebrar">${Escapar(Red.contrato)}</dd>
       <dt>Saldo para gas</dt><dd class="mono">${Red.saldo != null ? Escapar(Number(Red.saldo).toFixed(5)) : '—'}</dd>`
    : `<dt>Variables faltantes</dt><dd class="mono quebrar">${Escapar(Red.faltantes.join(', '))}</dd>`;
  return `
    <div class="tarjeta relleno tarjeta-red ${Red.activo ? 'tarjeta-red--activa' : ''}">
      <div class="fila-cabecera">
        <h2>${Red.modo === 'test' ? 'Test · pruebas sin costo' : 'Main · costos reales'}</h2>
        ${Red.activo ? '<span class="etiqueta etiqueta--ok">activa</span>' : ''}
      </div>
      <dl class="pares">${Filas}</dl>
      ${Red.error ? `<div class="banda banda--error">${Escapar(Red.error)}</div>` : ''}
      <button class="boton ${Red.activo ? '' : 'boton--primario'} boton--bloque" type="button" data-accion="Cambiar_Modo_Red" data-modo="${Red.modo}" ${Red.activo || !Red.operativa ? 'disabled' : ''}>
        ${Red.activo ? 'Modo en uso' : `Usar modo ${Red.modo.toUpperCase()}`}
      </button>
    </div>`;
}

Registrar_Pantalla('configuracion', {
  Titulo: 'Configuración',
  Roles: ['admin'],
  Al_Mostrar: async () => {
    Por_Id('tarjetas-redes').innerHTML = '<div class="cargando"><span class="giro"></span> Consultando ambas redes…</div>';
    const Datos = await Llamar_Api('/api/panel/red/estado');
    Por_Id('tarjetas-redes').innerHTML = Datos.redes.map(Tarjeta_Red).join('');
    await Pintar_Estado_Correo();
  },
});

// Sin correo configurado, "¿Olvidaste tu contraseña?" no puede enviar el enlace.
async function Pintar_Estado_Correo() {
  const Correo = await Llamar_Api('/api/panel/correo/estado');
  Por_Id('correo-prueba-para').value ||= Estado.Usuario?.correo || '';
  Por_Id('correo-estado').innerHTML = Correo.configurado
    ? `<div class="banda banda--info">Enviando con ${Correo.proveedor === 'smtp' ? `SMTP (<span class="mono">${Escapar(Correo.servidor)}</span>)` : 'Resend'} desde <span class="mono">${Escapar(Correo.remitente)}</span>.</div>`
    : `<div class="banda banda--error">No hay correo configurado: los enlaces de recuperación no llegan (solo se muestran en la consola del servidor).
       Configura <span class="mono">SMTP_HOST</span>, <span class="mono">SMTP_PUERTO</span>, <span class="mono">SMTP_USUARIO</span>, <span class="mono">SMTP_CONTRASENA</span> y <span class="mono">CORREO_REMITENTE</span> en <span class="mono">backend/.env</span> (por ejemplo, una cuenta de correo de cPanel) y reinicia el servidor.</div>`;
}

async function Probar_Correo(Formulario) {
  const { mensaje: Mensaje } = await Llamar_Api('/api/panel/correo/prueba', { json: { para: Formulario.para.value } });
  Mostrar_Aviso(Mensaje);
}

export const Acciones = { Cambiar_Modo_Red };
export const Formularios = { Probar_Correo };
