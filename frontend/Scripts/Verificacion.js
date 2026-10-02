// Verificación pública. El QR del PDF abre "/?token=<id>&cid=<cid>&red=<modo>"
// y esta pantalla muestra el resultado consultado en el contrato.
import { Llamar_Api } from './Api.js';
import { Registrar_Pantalla } from './Navegacion.js';
import { Por_Id, Poner_Texto, Formatear_Fecha } from './Utilidades.js';

Registrar_Pantalla('verificar', { Titulo: 'Verificación pública', Roles: ['admin', 'viewer', 'student', 'invitado'] });

function Mostrar_Resultado(Valido) {
  Por_Id('ver-espera').hidden = true;
  Por_Id('ver-valido').hidden = !Valido;
  Por_Id('ver-invalido').hidden = Valido;
}

export async function Verificar(Consulta, Red) {
  const Parametros = new URLSearchParams({ q: Consulta });
  if (Red) Parametros.set('red', Red);
  try {
    const { certificado: C } = await Llamar_Api(`/api/publico/verificar?${Parametros}`);
    Poner_Texto('ver-alumno', C.nombre_alumno || 'No registrado');
    Poner_Texto('ver-institucion', C.institucion || 'Institución emisora');
    Poner_Texto('ver-fecha', Formatear_Fecha(C.fecha));
    Poner_Texto('ver-token', `#${C.token_id}`);
    Poner_Texto('ver-red-nombre', `${C.red.toUpperCase()} · ${C.nombre_red}`);
    Poner_Texto('ver-propietario', C.propietario);
    Poner_Texto('ver-cid', C.metadata_cid || C.token_uri);
    Poner_Texto('ver-pdf-cid', C.pdf_cid);
    Poner_Texto('ver-contrato', C.contrato);
    Poner_Texto('ver-nota', C.propietario_coincide === false
      ? 'El token existe, pero hoy pertenece a una wallet distinta a la del estudiante.'
      : `El token existe en el contrato y su tokenURI coincide con el registrado${C.red === 'test' ? ' (red de pruebas)' : ''}.`);
    const Pdf = Por_Id('ver-pdf');
    Pdf.hidden = !C.pdf_url;
    Pdf.href = C.pdf_url || '#';
    Pdf.textContent = C.pdf_con_qr ? '↓ PDF del certificado (con QR)' : '↓ PDF del certificado';
    const Explorador = Por_Id('ver-explorador');
    Explorador.hidden = !C.explorer_url;
    Explorador.href = C.explorer_url || '#';
    Mostrar_Resultado(true);
  } catch (Error_Verificacion) {
    Poner_Texto('ver-error', Error_Verificacion.message);
    Mostrar_Resultado(false);
  }
}

async function Verificar_Certificado(Formulario) {
  const Consulta = Formulario.consulta.value.trim();
  if (Consulta) await Verificar(Consulta, Formulario.red.value);
}

export const Formularios = { Verificar_Certificado };
