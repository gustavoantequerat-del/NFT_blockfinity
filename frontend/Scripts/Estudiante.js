// Vista del estudiante: certificados emitidos a la wallet de su cuenta.
import { Llamar_Api } from './Api.js';
import { Registrar_Pantalla } from './Navegacion.js';
import { Por_Id, Escapar, Acortar, Formatear_Fecha, Mostrar_Aviso, Datos_Formulario } from './Utilidades.js';

const Gateway_Ipfs = 'https://gateway.pinata.cloud/ipfs/';

async function Cargar_Mis_Certificados() {
  const { wallet: Wallet, certificados: Certificados } = await Llamar_Api('/api/panel/mis-certificados');
  Por_Id('mi-wallet').value = Wallet || '';
  Por_Id('certificados-vacio').hidden = Certificados.length > 0;
  Por_Id('grilla-certificados').innerHTML = Certificados.map((C) => {
    const Pdf = C.final_pdf_url || (C.pdf_cid ? `${Gateway_Ipfs}${C.pdf_cid}` : '');
    return `
      <article class="certificado">
        <div class="certificado-sello"><span class="certificado-anillo">✓</span><span class="mono">#CERT-${Escapar(C.token_id)}</span></div>
        <div class="certificado-cuerpo">
          <span class="etiqueta etiqueta--${C.red === 'main' ? 'ok' : 'aviso'}">${C.red === 'main' ? 'vigente' : 'prueba (test)'}</span>
          <h3>Certificado NFT · ${Escapar(C.nombre_alumno)}</h3>
          <p>${Escapar(C.institucion_nombre || 'Institución emisora')}</p>
          <dl class="pares pares--compacto">
            <dt>Token ID</dt><dd class="mono">${Escapar(C.token_id)}</dd>
            <dt>Fecha</dt><dd>${Formatear_Fecha(C.creado_en)}</dd>
            <dt>Transacción</dt><dd class="mono">${Escapar(Acortar(C.tx_hash))}</dd>
          </dl>
          <div class="certificado-pie">
            ${Pdf ? `<a class="boton boton--chico" href="${Escapar(Pdf)}" target="_blank" rel="noopener">PDF</a>` : ''}
            ${C.explorer_url ? `<a class="boton boton--chico" href="${Escapar(C.explorer_url)}" target="_blank" rel="noopener">Transacción</a>` : ''}
            <a class="boton boton--chico boton--primario" href="/?token=${Escapar(C.token_id)}&red=${Escapar(C.red)}">Verificar</a>
          </div>
        </div>
      </article>`;
  }).join('');
}

Registrar_Pantalla('certificados', { Titulo: 'Mis certificados', Roles: ['student'], Al_Mostrar: Cargar_Mis_Certificados });

async function Guardar_Mi_Wallet(Formulario) {
  await Llamar_Api('/api/panel/mi-wallet', { metodo: 'PUT', json: Datos_Formulario(Formulario) });
  Mostrar_Aviso('Wallet guardada.');
  await Cargar_Mis_Certificados();
}

export const Formularios = { Guardar_Mi_Wallet };
