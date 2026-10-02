// Verificación de certificados. El servidor decide qué datos ve cada quien
// (campo "relacion") y aquí solo se muestra lo que llegó:
//   propio             estudiante dueño del certificado
//   ajeno              estudiante que consulta un certificado de otra persona
//   institucion_propia certificado de un estudiante de tu institución
//   otra_institucion   existe y es válido, sin decir de quién ni de dónde
//   invitado           sin sesión: estudiante y verificación, sin institución
//   admin              todo
import { Llamar_Api } from './Api.js';
import { Registrar_Pantalla } from './Navegacion.js';
import { Escapar, Formatear_Fecha } from './Utilidades.js';

Registrar_Pantalla('verificar', { Titulo: 'Verificar certificado', Roles: ['admin', 'viewer', 'student', 'invitado'] });

const Encabezados = {
  propio: ['ok', '✓', 'Certificado válido · es tuyo', 'Este NFT está a tu nombre y en tu wallet.'],
  ajeno: ['aviso', '!', 'Existe, pero no es tuyo', 'El certificado es válido, pero pertenece a otra persona.'],
  institucion_propia: ['ok', '✓', 'Certificado válido', 'Pertenece a un estudiante de tu institución.'],
  otra_institucion: ['aviso', '✓', 'Existe y es válido', 'El certificado pertenece a otra institución.'],
  invitado: ['ok', '✓', 'Certificado válido', 'El token existe en el contrato y su huella coincide.'],
  admin: ['ok', '✓', 'Certificado válido', 'El token existe en el contrato y su tokenURI coincide con el registrado.'],
};

function Fila(Titulo, Valor, Clase = '') {
  return Valor == null || Valor === '' ? '' : `<dt>${Titulo}</dt><dd class="${Clase}">${Escapar(Valor)}</dd>`;
}

function Html_Resultado(C) {
  const [Tono, Marca, Titulo, Nota] = Encabezados[C.relacion] || Encabezados.invitado;
  const Nota_Final = C.propietario_coincide === false ? `${Nota} Hoy está en una wallet distinta a la del estudiante.` : Nota;
  const Filas = [
    Fila('Titular', C.nombre_alumno),
    Fila('Institución emisora', C.institucion),
    Fila('Fecha de emisión', C.fecha && Formatear_Fecha(C.fecha)),
    Fila('Token ID', `#${C.token_id}`, 'mono'),
    Fila('Red', `${String(C.red).toUpperCase()} · ${C.nombre_red}`),
    Fila('Wallet propietaria', C.propietario, 'mono quebrar'),
    Fila('CID de metadata', C.metadata_cid, 'mono quebrar'),
    Fila('CID del PDF base', C.pdf_cid, 'mono quebrar'),
    Fila('Contrato', C.contrato, 'mono quebrar'),
  ].join('');
  const Botones = [
    C.pdf_url ? `<a class="boton" href="${Escapar(C.pdf_url)}" target="_blank" rel="noopener">↓ PDF del certificado${C.pdf_con_qr ? ' (con QR)' : ''}</a>` : '',
    C.explorer_url ? `<a class="boton boton--primario" href="${Escapar(C.explorer_url)}" target="_blank" rel="noopener">Ver transacción</a>` : '',
  ].join('');
  return `
    <div class="resultado resultado--${Tono}">
      <div class="resultado-cabecera"><span class="resultado-marca">${Marca}</span><span><b>${Titulo}</b><small>${Escapar(Nota_Final)}</small></span></div>
      <dl class="pares resultado-cuerpo">${Filas}</dl>
      ${Botones ? `<div class="resultado-pie">${Botones}</div>` : ''}
    </div>`;
}

function Html_Invalido(Mensaje) {
  return `
    <div class="resultado resultado--error">
      <div class="resultado-cabecera"><span class="resultado-marca">✕</span><span><b>Certificado no válido</b><small>${Escapar(Mensaje)}</small></span></div>
      <div class="resultado-cuerpo"><div class="banda banda--error">No aceptes este documento como comprobante. Si crees que hay un error, contacta a la institución emisora con el identificador consultado.</div></div>
    </div>`;
}

export async function Verificar(Consulta, Red, Contenedor) {
  const Destino = Contenedor || document.querySelector('.vista.activa [data-resultado-verificacion]');
  const Parametros = new URLSearchParams({ q: Consulta });
  if (Red) Parametros.set('red', Red);
  Destino.innerHTML = '<div class="cargando"><span class="giro"></span> Consultando la blockchain…</div>';
  try {
    const { certificado: Certificado } = await Llamar_Api(`/api/publico/verificar?${Parametros}`);
    Destino.innerHTML = Html_Resultado(Certificado);
  } catch (Error_Verificacion) {
    Destino.innerHTML = Html_Invalido(Error_Verificacion.message);
  }
  Destino.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function Verificar_Certificado(Formulario) {
  const Consulta = Formulario.consulta.value.trim();
  if (!Consulta) return;
  const Contenedor = Formulario.parentElement.querySelector('[data-resultado-verificacion]');
  await Verificar(Consulta, Formulario.red?.value, Contenedor);
}

export const Formularios = { Verificar_Certificado };
