// Landing pública /invitado: explica el certificado NFT y tiene "Comprobar"
// (escribir o escanear el QR). Sin sesión, el servidor muestra solo el
// estudiante y la verificación, nunca la institución.
import { Mostrar_Vista } from './Navegacion.js';
import { Aplicar_Marca } from './Marca.js';
import { Verificar } from './Verificacion.js';

export function Es_Ruta_Invitado() {
  return /^\/invitado\/?$/i.test(window.location.pathname);
}

// Consulta: texto del QR (URL completa) si se llegó escaneándolo.
export async function Arrancar_Invitado(Consulta) {
  Aplicar_Marca(null);
  document.title = 'Comprobar certificado · Certificados NFT';
  Mostrar_Vista('vista-invitado');
  if (!Consulta) return;
  const Formulario = document.querySelector('#vista-invitado [data-formulario="Verificar_Certificado"]');
  Formulario.consulta.value = new URLSearchParams(window.location.search).get('token') || Consulta;
  await Verificar(Consulta, null, document.querySelector('#vista-invitado [data-resultado-verificacion]'));
}
