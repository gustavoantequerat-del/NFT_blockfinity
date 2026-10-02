const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const Configuracion_Red = require('./Configuracion_Red');
const { Secreto_Jwt, Requerir_Sesion, Requerir_Rol } = require('./Autenticacion');
const Rutas_Sesion = require('./Rutas_Sesion');
const Rutas_Panel = require('./Rutas_Panel');
const Rutas_Publicas = require('./Rutas_Publicas');
const Rutas_Certificados = require('./Rutas_Certificados');

if (!Secreto_Jwt) {
  console.error('ERROR: JWT_SECRET no está definido en backend/.env');
  process.exit(1);
}

// Un error async no capturado (ej. un timeout de Web3) no debe tumbar el servidor.
process.on('unhandledRejection', (Error_Async) => console.error('⚠️ unhandledRejection:', Error_Async));

const Aplicacion = express();
const Puerto = Number(process.env.PORT) || 3000;
const Carpeta_Frontend = path.join(__dirname, '..', 'frontend');

// /masivo/emitir recibe todos los certificados preparados en un solo JSON.
Aplicacion.use(express.json({ limit: '15mb' }));
Aplicacion.use(express.static(Carpeta_Frontend));

// El registro de wallet es parte de la misma app: /registro y /registroASOBAN
// sirven el mismo index.html y el frontend muestra esa vista según la ruta.
Aplicacion.get(['/registro', '/registroASOBAN'], (_Peticion, Respuesta) => {
  Respuesta.sendFile(path.join(Carpeta_Frontend, 'index.html'));
});

Aplicacion.use('/api', Rutas_Sesion);
Aplicacion.use('/api/publico', Rutas_Publicas);
Aplicacion.use('/api/panel', Rutas_Panel);
Aplicacion.use('/api/certificados', Requerir_Sesion, Requerir_Rol('admin'), Rutas_Certificados);

Aplicacion.use('/api', (_Peticion, Respuesta) => Respuesta.status(404).json({ exito: false, mensaje: 'Ruta no encontrada.' }));

// Errores de Express (JSON mal formado, archivo inválido de multer, etc.).
Aplicacion.use((Error_Express, _Peticion, Respuesta, _Siguiente) => {
  console.error('❌', Error_Express.message);
  Respuesta.status(Error_Express.status || 500).json({ exito: false, mensaje: Error_Express.message || 'Error inesperado.' });
});

Aplicacion.listen(Puerto, async () => {
  console.log(`\nServidor corriendo en http://localhost:${Puerto}`);
  console.log(`Registro de wallet: http://localhost:${Puerto}/registro  ·  /registroASOBAN`);

  // Se informa el estado de ambas redes, pero el servidor arranca igual: el
  // admin puede corregir el .env o cambiar de modo sin perder el panel.
  for (const Modo of Configuracion_Red.Modos_Validos) {
    const Red = await Configuracion_Red.Describir_Red(Modo);
    const Marca = Red.activo ? '▶' : ' ';
    if (Red.operativa) console.log(`${Marca} ${Modo.toUpperCase()}: ${Red.nombre_red} · emisora ${Red.wallet_emisora} · saldo ${Red.saldo}`);
    else console.log(`${Marca} ${Modo.toUpperCase()}: no disponible → ${Red.error}`);
  }
  console.log(`Modo activo: ${Configuracion_Red.Obtener_Modo_Activo().toUpperCase()} (se cambia desde Configuración en el panel)\n`);
});
