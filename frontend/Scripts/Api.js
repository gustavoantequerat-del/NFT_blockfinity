// Llamadas al backend. Agrega el token de sesión y convierte los errores
// del servidor ({ exito: false, mensaje }) en excepciones.
const Clave_Token = 'certnft_token';

export function Leer_Token() {
  try { return localStorage.getItem(Clave_Token); } catch (_) { return null; }
}

export function Guardar_Token(Token) {
  try {
    if (Token) localStorage.setItem(Clave_Token, Token);
    else localStorage.removeItem(Clave_Token);
  } catch (_) { /* almacenamiento bloqueado */ }
}

// Opciones: { metodo, json, formulario (FormData) }
export async function Llamar_Api(Url, Opciones = {}) {
  const Encabezados = {};
  const Token = Leer_Token();
  if (Token) Encabezados.Authorization = `Bearer ${Token}`;

  let Cuerpo;
  if (Opciones.json !== undefined) {
    Encabezados['Content-Type'] = 'application/json';
    Cuerpo = JSON.stringify(Opciones.json);
  } else if (Opciones.formulario) {
    Cuerpo = Opciones.formulario;
  }

  const Respuesta = await fetch(Url, { method: Opciones.metodo || (Cuerpo ? 'POST' : 'GET'), headers: Encabezados, body: Cuerpo });
  const Datos = await Respuesta.json().catch(() => ({}));
  if (!Respuesta.ok || Datos.exito === false) {
    const Error_Api = new Error(Datos.mensaje || 'No se pudo completar la operación.');
    Error_Api.estado = Respuesta.status;
    throw Error_Api;
  }
  return Datos;
}

// Descarga un archivo protegido por sesión (ej. Excel de participantes).
export async function Descargar_Archivo(Url, Nombre_Archivo) {
  const Respuesta = await fetch(Url, { headers: { Authorization: `Bearer ${Leer_Token()}` } });
  if (!Respuesta.ok) throw new Error('No se pudo descargar el archivo.');
  const Enlace = document.createElement('a');
  Enlace.href = URL.createObjectURL(await Respuesta.blob());
  Enlace.download = Nombre_Archivo;
  Enlace.click();
  setTimeout(() => URL.revokeObjectURL(Enlace.href), 1000);
}
