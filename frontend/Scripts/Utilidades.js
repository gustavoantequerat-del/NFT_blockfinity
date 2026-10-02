// Funciones pequeñas que usan todas las pantallas.

export function Por_Id(Id) {
  return document.getElementById(Id);
}

export function Poner_Texto(Id, Valor) {
  const Nodo = Por_Id(Id);
  if (Nodo) Nodo.textContent = Valor == null || Valor === '' ? '—' : Valor;
}

export function Escapar(Valor) {
  return String(Valor ?? '').replace(/[&<>"']/g, (Caracter) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[Caracter]);
}

export function Acortar(Valor) {
  const Texto = String(Valor || '');
  return Texto.length > 14 ? `${Texto.slice(0, 6)}…${Texto.slice(-4)}` : Texto || '—';
}

export function Dinero(Valor) {
  return `$${Number(Valor || 0).toFixed(2)}`;
}

export function Formatear_Fecha(Valor) {
  if (!Valor) return '—';
  const Fecha = new Date(String(Valor).replace(' ', 'T') + (String(Valor).includes('Z') ? '' : 'Z'));
  return Number.isNaN(Fecha.getTime()) ? Valor : Fecha.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
}

export function Es_Wallet_Valida(Wallet) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(Wallet || '').trim());
}

const Clases_Estado = {
  ok: ['activa', 'aprobada', 'emitida', 'nft_transferido', 'confirmado', 'valida', 'lista'],
  aviso: ['pendiente', 'credito bajo', 'revisar_owner', 'revisar_token', 'revisar', 'estampando_qr', 'enviando', 'confirmando', 'en_cola'],
};
const Textos_Estado = {
  nft_transferido: 'entregado',
  error_minteo: 'error de minteo',
  revisar_owner: 'revisar propietario',
  revisar_token: 'revisar token',
  estampando_qr: 'estampando QR',
  en_cola: 'en cola',
  credito_bajo: 'crédito bajo',
};

export function Etiqueta_Estado(Estado) {
  const Clase = Clases_Estado.ok.includes(Estado) ? 'ok' : Clases_Estado.aviso.includes(Estado) ? 'aviso' : 'error';
  return `<span class="etiqueta etiqueta--${Clase}">${Escapar(Textos_Estado[Estado] || Estado)}</span>`;
}

export function Enlaces_Emision(Emision) {
  const Enlaces = [];
  if (Emision.explorer_url) Enlaces.push(`<a class="enlace-tx" target="_blank" rel="noopener" href="${Escapar(Emision.explorer_url)}">Transacción ↗</a>`);
  if (Emision.final_pdf_url) Enlaces.push(`<a class="enlace-tx" target="_blank" rel="noopener" href="${Escapar(Emision.final_pdf_url)}">PDF con QR ↗</a>`);
  if (Emision.token_id != null && Emision.estado === 'nft_transferido') {
    Enlaces.push(`<a class="enlace-tx" target="_blank" href="/?token=${Escapar(Emision.token_id)}&red=${Escapar(Emision.red || '')}">Verificar ↗</a>`);
  }
  if (Emision.error) Enlaces.push(`<span class="texto-error" title="${Escapar(Emision.error)}">${Escapar(Emision.error.slice(0, 60))}</span>`);
  return Enlaces.join(' ') || '—';
}

export function Fila_Vacia(Columnas, Texto) {
  return `<tr><td colspan="${Columnas}" class="vacio-celda">${Escapar(Texto)}</td></tr>`;
}

let Temporizador_Aviso = null;
export function Mostrar_Aviso(Mensaje, Es_Error = false) {
  const Nodo = Por_Id('aviso-flotante');
  Nodo.textContent = Mensaje;
  Nodo.classList.toggle('aviso-flotante--error', Es_Error);
  Nodo.classList.add('visible');
  clearTimeout(Temporizador_Aviso);
  Temporizador_Aviso = setTimeout(() => Nodo.classList.remove('visible'), 3500);
}

export function Datos_Formulario(Formulario) {
  return Object.fromEntries(new FormData(Formulario).entries());
}
