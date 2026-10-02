// Escaneo del QR del certificado con la cámara. Usa BarcodeDetector del
// navegador (Chrome, Edge, Android) y, si no existe (Safari, Firefox), la
// librería jsQR desde CDN. La cámara solo funciona con HTTPS o en localhost.
import { Por_Id, Mostrar_Aviso } from './Utilidades.js';

const Url_JsQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
let Flujo = null;
let Formulario_Destino = null;
let Activo = false;

function Cargar_JsQR() {
  if (window.jsQR) return Promise.resolve();
  return new Promise((Resolver, Rechazar) => {
    const Script = document.createElement('script');
    Script.src = Url_JsQR;
    Script.onload = Resolver;
    Script.onerror = () => Rechazar(new Error('No se pudo cargar el lector de QR.'));
    document.head.append(Script);
  });
}

// Devuelve una función que lee el QR de un cuadro del video (o null).
async function Crear_Lector(Video) {
  if ('BarcodeDetector' in window) {
    const Detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    return async () => (await Detector.detect(Video))[0]?.rawValue || null;
  }
  await Cargar_JsQR();
  const Lienzo = document.createElement('canvas');
  const Contexto = Lienzo.getContext('2d', { willReadFrequently: true });
  return async () => {
    Lienzo.width = Video.videoWidth;
    Lienzo.height = Video.videoHeight;
    Contexto.drawImage(Video, 0, 0);
    return window.jsQR(Contexto.getImageData(0, 0, Lienzo.width, Lienzo.height).data, Lienzo.width, Lienzo.height)?.data || null;
  };
}

function Cerrar_Camara() {
  Activo = false;
  Flujo?.getTracks().forEach((Pista) => Pista.stop());
  Flujo = null;
  Por_Id('modal-camara').hidden = true;
}

async function Escanear_Qr(Boton) {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Mostrar_Aviso('Este navegador no permite usar la cámara (se necesita HTTPS). Escribe el identificador a mano.', true);
  }
  Formulario_Destino = Boton.closest('form');
  const Video = Por_Id('camara-video');
  Por_Id('modal-camara').hidden = false;
  Por_Id('camara-estado').textContent = 'Abriendo la cámara…';
  try {
    Flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    Video.srcObject = Flujo;
    await Video.play();
    const Leer = await Crear_Lector(Video);
    Por_Id('camara-estado').textContent = 'Buscando el QR…';
    Activo = true;
    while (Activo) {
      const Texto = Video.readyState >= 2 ? await Leer().catch(() => null) : null;
      if (Texto) {
        Cerrar_Camara();
        Formulario_Destino.consulta.value = Texto;
        Formulario_Destino.requestSubmit();
        return;
      }
      await new Promise((Resolver) => setTimeout(Resolver, 250));
    }
  } catch (Error_Camara) {
    Cerrar_Camara();
    Mostrar_Aviso(Error_Camara.name === 'NotAllowedError' ? 'Permiso de cámara denegado.' : Error_Camara.message || 'No se pudo abrir la cámara.', true);
  }
}

export const Acciones = { Escanear_Qr, Cerrar_Camara };
