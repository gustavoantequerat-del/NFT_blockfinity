# Certificados NFT · Blockfinity

Plataforma para emitir certificados académicos como NFT. Cada PDF lleva un QR con su **token ID** y el **CID** de IPFS, y cualquiera puede verificarlo contra el contrato.

- **Backend:** Node.js 22+ con Express y SQLite nativo (`node:sqlite`).
- **Frontend:** una sola app en JavaScript puro (módulos ES) y CSS modular, sin frameworks ni Tailwind. Express la sirve.
- **Sin pasos de compilación:** no hay proyecto React aparte. Todas las rutas (`/login`, `/admin`, `/registro_<institución>`, `/verificar`) son la misma app.

---

## Puesta en marcha

Requisitos: [Node.js 22.5+](https://nodejs.org/) y `pdftoppm` (Poppler) para la imagen del NFT. En Linux se instala con `apt install poppler-utils`. En Windows ya viene incluido en `pdf-poppler`.

```bash
cd backend
npm install
cp .env.example .env      # completa las credenciales test y main (ver abajo)
npm run seed              # crea la institución y las cuentas de prueba
npm start                 # http://localhost:3000 → redirige a /login
```

## Rutas

| Ruta | Para quién | Qué hace |
|---|---|---|
| `/login` | Estudiantes y admins institucionales | Inicio de sesión. Cada cuenta entra a su panel con la marca de su institución. No se pueden crear cuentas aquí |
| `/admin` | Administrador de la plataforma | Inicio de sesión del administrador. Las cuentas de admin no entran por `/login` y las demás no entran por `/admin` |
| `/registro` | Estudiantes | Registro en la institución principal, **Blockfinity Advisors** |
| `/registro_<institución>` | Estudiantes | Registro con nombre, correo, contraseña y wallet. Quien se registra queda como estudiante de esa institución. Ej.: `/registro_rosa_gattorno` |
| `/invitado` | Cualquiera, sin cuenta | Landing que explica el certificado NFT, con **Comprobar** (escribir el identificador o escanear el QR con la cámara) |
| `/verificar` y `/?token=…` | Cualquiera | El QR del certificado abre `/?token=…&cid=…&red=…`. Sin sesión lleva a la landing de `/invitado` con el resultado; con sesión, a la pantalla de verificación del panel |

**Recuperar contraseña:** "¿Olvidaste tu contraseña?" en `/login` (y en `/admin`) envía un enlace de un solo uso, válido 1 hora (`/login?reset=…`). El correo se envía con la API de [Resend](https://resend.com) usando `RESEND_API_KEY` y `CORREO_REMITENTE`. Sin esas variables, el enlace aparece en la consola del servidor. Además, el admin institucional puede generar el enlace de un estudiante desde **Estudiantes y lotes → Enlace de contraseña**, y el administrador cambia la contraseña del admin institucional desde el detalle de la institución.

La raíz `/` redirige a `/login`, salvo que traiga los parámetros del QR.

Al arrancar, la consola muestra el estado de las dos redes y cuál está activa. El servidor arranca aunque una red no esté configurada: el panel muestra qué variables faltan.

---

## Modo TEST y modo MAIN

En `backend/.env` cada credencial va dos veces: con el sufijo `_TEST` y con el sufijo `_MAIN`.

| Variable | Descripción |
|---|---|
| `RPC_URL_*` | RPC de la red (Infura, Alchemy, etc.) |
| `CHAIN_ID_*` | `11155111` para Sepolia, `1` para Ethereum Mainnet, `137` para Polygon… |
| `PRIVATE_KEY_*` | Clave de la wallet emisora (owner del contrato). La dirección se deriva de esta clave |
| `CONTRACT_ADDRESS_*` | Contrato `CertificateNFT` desplegado en esa red |
| `PINATA_API_KEY_*`, `PINATA_SECRET_API_KEY_*` | Claves de Pinata (IPFS) |
| `EXPLORER_URL_*` | Opcional. Para las redes conocidas se completa sola |

El administrador cambia de modo con el switch **Test | Main** de la barra superior, o desde **Configuración**, donde ve el estado, la wallet, el contrato y el saldo de cada red. El cambio:

- Se guarda en la base de datos (tabla `configuracion`) y se mantiene aunque el servidor se reinicie.
- Solo se permite si la red responde con el chain ID esperado y la wallet emisora es owner del contrato.
- Para pasar a **MAIN** se pide confirmación.

| | TEST | MAIN |
|---|---|---|
| Red | testnet (gas de prueba) | red principal (gas real) |
| Aprobar un lote | **no** descuenta crédito | descuenta `$0.77` por certificado |
| Historial y verificación | solo emisiones de test | solo emisiones de main |
| Protección | `CHAIN_ID_TEST=1` se rechaza | — |

Las emisiones hechas antes de este cambio se marcan como `main`.

Otras variables: `JWT_SECRET` (obligatoria), `PORT`, `CORREO_CONTACTO` (correo para que las instituciones pidan su alta), `RESEND_API_KEY` y `CORREO_REMITENTE` (correos de recuperación de contraseña), `PUBLIC_VERIFY_URL` (dominio público al que apunta el QR), `CERT_QR_*` y `CERT_NAME_*` (posición del QR y del nombre en la plantilla) y `DEMO_STUDENT_WALLET`.

---

## Flujo de emisión con QR

```
PREPARAR (paso 3 del asistente)
1. Plantilla + nombre ──► PDF base (sin QR) ──► IPFS = pdf_cid

EMITIR (paso 4, un estudiante a la vez)
2. Se lee el próximo token_id del contrato (tokenCounter)
3. QR = <PUBLIC_VERIFY_URL>?token=<token_id>&cid=<pdf_cid>&red=<test|main>
4. El QR se sobrepone al PDF base y se re-renderiza ──► PDF final ──► IPFS
5. Imagen PNG del PDF final + metadata JSON ──► IPFS = tokenURI
6. Recién entonces se mintea el NFT directo a la wallet del estudiante
```

El NFT que recibe el estudiante ya apunta al **PDF con QR**. La metadata guarda también `pdf_base` (el CID que va en el QR). Los mints se ejecutan de a uno, así el token_id previsto es el que asigna el contrato. Si no coincide, la emisión queda como `revisar_token`.

Datos que se guardan en la tabla `emisiones`: `token_id`, `token_uri`, `pdf_cid`, `final_pdf_cid`, `final_pdf_url`, `qr_payload`, `tx_hash` y `red`.

### Verificación pública

Al escanear el QR se abre `/?token=…&cid=…&red=…` y el resultado aparece sin iniciar sesión. A mano se puede buscar por token ID (`12`, `#CERT-12`), por CID (de metadata, del PDF base o del PDF final), por la URL del QR, por hash de transacción o por wallet. El certificado es **válido** solo si se cumplen las tres condiciones:

1. El token existe en el contrato de esa red (`ownerOf`).
2. Su `tokenURI` on-chain coincide con el registrado al emitir.
3. Si se consulta con el QR, el `cid` es el del PDF de ese token.

---

## Instituciones

Las instituciones no se registran solas: escriben al correo de `CORREO_CONTACTO`, que se muestra en `/login`, y el administrador las da de alta en **Instituciones → Nueva institución** con:

- **Nombre:** genera la ruta de registro automáticamente. "Rosa Gattorno" crea `/registro_rosa_gattorno`; se quitan acentos y espacios, y el nombre no se puede repetir.
- **Logo:** PNG, JPG o WebP, máximo 1 MB.
- **Color de la marca.**
- **Correo y contraseña del admin institucional:** con esa cuenta la institución entra por `/login`.

La marca se aplica en:

- **`/registro_<institución>`:** header con el color elegido, el logo de Blockfinity Advisors y el logo de la institución. El logo de Blockfinity cambia a la versión blanca o gris según el contraste. Sin logo de institución, se muestra su nombre.
- **Paneles del admin institucional y del estudiante:** el color reemplaza al acento de toda la interfaz y el logo y el nombre aparecen en el menú lateral. Con colores claros, los textos se oscurecen para que se lean.

En el detalle de la institución, el administrador puede cambiar el color, el logo, el responsable y el correo o la contraseña del admin institucional. El admin institucional ve y comparte el enlace de registro desde su Dashboard.

**Institución principal, Blockfinity Advisors:** se crea sola al arrancar, su registro está en `/registro` y no se puede eliminar.

**Eliminar institución** es exclusivo del administrador y pide escribir el nombre para confirmar.

- **Se borran:** la institución, su ruta de registro, su cuenta de admin institucional, sus lotes con las plantillas y su logo.
- **Pasan a Blockfinity Advisors:** sus estudiantes, con su cuenta y su lugar en la lista, y sus certificados. Así siguen entrando por `/login` y viendo sus NFT.

Si una institución quita a un estudiante de su lista, ese estudiante pierde su cuenta.

## Qué muestra la verificación a cada quien

El filtro se aplica en el servidor: los datos ocultos nunca llegan al navegador.

| Quien consulta | Resultado |
|---|---|
| Estudiante, certificado propio | "Certificado válido · es tuyo" con todos los datos |
| Estudiante, certificado de otra persona | "Existe, pero no es tuyo" con los datos de su titular (nombre y wallet), sin la institución |
| Admin institucional, estudiante de su institución | "Certificado válido" con los datos del estudiante y del certificado |
| Admin institucional, certificado de otra institución | "Existe y es válido", sin decir de qué institución ni de qué estudiante |
| Invitado o sin sesión (`/invitado`, QR) | Solo si es válido: datos del estudiante y de la verificación, sin la institución |
| Administrador | Todo |

**Escanear con la cámara:** el botón 📷 abre la cámara y lee el QR con `BarcodeDetector` (Chrome, Edge, Android). En Safari y Firefox carga [jsQR](https://github.com/cozmo/jsQR) desde jsDelivr. El navegador solo permite usar la cámara con HTTPS o en `localhost`.

## Roles y cuentas de prueba

`npm run seed` crea la institución **Universidad Demo** (`/registro_universidad_demo`, con $100 de crédito) y estas cuentas:

| Rol | Entra por | Correo | Contraseña | Qué ve |
|---|---|---|---|---|
| Administrador | `/admin` | `laura.mendez@universidad.edu` | `demoaccess` | Instituciones, Emisiones, Solicitudes de lotes, Nueva emisión, Configuración (switch test/main) |
| Admin institucional | `/login` | `consulta@universidad.edu` | `consulta123` | Dashboard con el enlace de registro, Estudiantes y lotes (con enlace de recuperación de contraseña) |
| Estudiante | `/login` | `estudiante@universidad.edu` | `estudiante123` | Mis certificados |

La wallet del estudiante demo es la cuenta #1 pública de Hardhat. Úsala **solo en test**. Cambia estas contraseñas antes de salir a producción.

### Flujo completo de un lote

1. Los estudiantes se registran en `/registro_<institución>`, o la institución los agrega a mano. Luego la institución adjunta la plantilla PDF y pulsa **Enviar al administrador**.
2. El admin lo autoriza en **Solicitudes de lotes**. Solo en MAIN se descuenta el crédito.
3. El admin pulsa **Emitir**. El asistente se abre con la plantilla y los estudiantes del lote.
4. El admin genera los PDFs base, confirma y sigue el progreso. El lote queda como `emitida`.

También se puede emitir sin lote: en el asistente se sube la plantilla y un Excel con las columnas `nombre` y `wallet`.

---

## API principal

| Ruta | Acceso |
|---|---|
| `POST /api/login` (con `portal: "admin"` desde `/admin`), `GET /api/sesion`, `POST /api/olvide-contrasena`, `POST /api/restablecer-contrasena` | público / sesión |
| `GET /api/publico/verificar?q=…&red=…` (responde según la sesión, si la hay), `GET /api/publico/institucion/:slug`, `GET /api/publico/institucion-principal`, `POST /api/publico/registro/:slug`, `GET /api/publico/configuracion` | público |
| `POST /api/panel/estudiantes/:id/enlace-recuperacion` | admin e institución (solo sus estudiantes) |
| `GET /api/panel/red`, `GET /api/panel/red/estado`, `PUT /api/panel/red/modo` | sesión / admin |
| `POST/PATCH/DELETE /api/panel/instituciones` (multipart con logo), `/instituciones/:id/credito` | admin |
| `/api/panel/resumen`, `/estudiantes`, `/lotes` | admin e institución (solo la suya) |
| `/api/panel/mis-certificados`, `/api/panel/mi-wallet` | estudiante |
| `/api/certificados/*` (validar Excel, preparar, emitir, historial, emisión individual) | admin |

Las respuestas tienen la forma `{ exito, mensaje, … }`.

---

## Estructura y convenciones

```
backend/
  Servidor.js              Express: estáticos, rutas y arranque
  Configuracion_Red.js     Credenciales _TEST/_MAIN y modo activo
  Emision_Certificados.js  PDF base → QR → PDF final → mint
  Blockchain.js            Contrato: mint, consulta de tokens, cola de minteo
  Ipfs.js                  Pinata
  Plantilla_Pdf.js         Nombre, QR y vista previa del PDF
  Marca_Institucion.js     Ruta (slug), color y logo de cada institución
  Recuperacion.js          Enlaces de recuperación de contraseña
  Correo.js                Envío de correos (Resend)
  Rutas_*.js               Sesión, panel, público y certificados
  uploads/logos/           Logos subidos (servidos en /Logos_Instituciones)
  Base_Datos.js            Esquema SQLite y migraciones
  Semilla.js               Cuentas de prueba
frontend/
  index.html               Todas las vistas: acceso, registro de estudiantes y panel
  Scripts/*.js             Un módulo por área (Acceso, Red, Asistente_Emision…)
  Estilos/*.css            Un archivo por área (Base, Componentes, Estructura…)
  Recursos/Logos/          Logos de Blockfinity (blanco y gris)
```

- **Archivos, funciones y variables:** en español y en `Snake_Camel_Case` (`Emitir_Certificado`, `Wallet_Alumno`, `Rutas_Panel.js`).
- **Tablas, columnas y claves JSON:** se quedan en `snake_case` minúscula (`token_id`, `final_pdf_url`) para no romper las bases de datos existentes.
- **Variables de entorno:** en `MAYÚSCULAS`.
- **Archivos con nombre fijo:** `index.html`, `package.json` y `README.md` conservan el nombre que esperan sus herramientas.
- **CSS:** clases en español. Cada vista tiene su archivo y las variables de diseño están en `Base.css`.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| El QR abre `localhost` | Falta `PUBLIC_VERIFY_URL` en `.env` |
| No deja pasar a MAIN | Faltan variables `_MAIN`, el RPC apunta a otro chain ID o la wallet no es owner del contrato. El motivo aparece en **Configuración** |
| `revisar_token` en una emisión | Otro proceso minteó con la misma wallet mientras se emitía: el QR apunta a otro token |
| "pdftoppm falló" | Instala `poppler-utils` en el servidor |
| "Las cuentas de administrador ingresan por /admin" | El admin intentó entrar por `/login` |
| `/registro_…` dice que la institución no existe | El enlace está mal escrito o la institución fue eliminada |
| Un certificado de test no verifica en main | Test y main tienen contratos distintos: el QR incluye `red=`, y a mano se elige la red en el buscador |
