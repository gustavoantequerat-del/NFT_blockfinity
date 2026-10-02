# Verificación por tokenId / CID: despliegue y pruebas

Este cambio elimina la verificación por **hash SHA-256 del archivo**. Ahora un certificado se verifica con su **tokenId** en el contrato o con su **CID** de IPFS.

## 1. El flujo nuevo

```
1. PDF SIN QR  ──► IPFS (pdfCID) + preview PNG + metadata JSON (metadataCID)
2. MINT        ──► createCertificate(walletAlumno, ipfs://metadataCID)  → tokenId
3. ESTAMPAR QR ──► QR = <PUBLIC_VERIFY_URL>?token=<tokenId> sobre el PDF del paso 1
4. PDF FINAL   ──► IPFS (finalPdfCid). Este es el PDF que se entrega al alumno
5. HISTORIAL   ──► tabla emisiones: token_id, token_uri, pdf_cid, final_pdf_cid, final_pdf_url, qr_payload
```

La verificación pública (`GET /api/public/verificar?q=…`) acepta:

| Entrada | Ejemplo |
|---|---|
| URL del QR | `https://certs.midominio.com/?token=12` |
| tokenId | `12` o `#CERT-12` |
| CID de metadata (tokenURI) | `Qm…` / `bafy…` / `ipfs://Qm…` |
| CID del PDF sin QR o del PDF final | `Qm…` |
| Hash de transacción o wallet | `0x…` (devuelve el último certificado) |

La fuente de verdad es el contrato. El certificado se da por **válido** solo si:
- `ownerOf(tokenId)` responde (el token existe), y
- `tokenURI(tokenId)` on-chain coincide con el `token_uri` que se registró al emitir.

Si el token existe pero hoy pertenece a otra wallet, se muestra como válido con un aviso.

> **Limitación conocida:** el contrato no tiene `setTokenURI`, así que el `tokenURI` on-chain apunta a la metadata del **PDF sin QR**. El CID del PDF final (con QR) solo queda en la base de datos y en la respuesta de la verificación. Esto es lo esperado en este flujo, porque el QR solo puede existir después del mint.

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/certificados.js` | Flujo mint → estampar QR → subir PDF final (individual y masivo); nuevo `POST /api/certificados/qr/:tokenId` |
| `backend/panel.js` | `GET /api/public/verificar` resuelve tokenId/CID y consulta el contrato |
| `backend/pdfTemplate.js` | `estamparQrDeVerificacion` (ya existía, ahora se usa) |
| `backend/db.js` | Nueva columna `emisiones.pdf_cid` (migración automática) |
| `backend/blockchain.js` | Exporta `networkName` |
| `backend/.env.example` | `PUBLIC_VERIFY_URL`, `CERT_QR_*` |
| `frontend/index.html`, `frontend/app.js` | Pantalla de verificación sin la zona de SHA-256; soporta el enlace `?token=`; en los resultados aparece el enlace "PDF con QR" |

---

## 2. Despliegue

### 2.1 Requisitos
- Node.js 22 o superior (usa `node:sqlite` con `--experimental-sqlite`).
- `pdftoppm` (Poppler) instalado, para generar el preview PNG. Ya era un requisito antes de este cambio.
- Claves de Pinata y una wallet universidad con gas en la red configurada.

### 2.2 Respaldar la base de datos
```powershell
Copy-Item backend\database.sqlite backend\database.sqlite.bak-$(Get-Date -Format yyyyMMdd-HHmmss)
```
La migración solo agrega columnas (`ALTER TABLE … ADD COLUMN`) y no borra datos. Aun así, respalda antes de desplegar.

### 2.3 Variables de entorno (`backend/.env`)
Agrega lo siguiente:
```env
# Dominio público donde se sirve el panel. El QR apunta aquí.
PUBLIC_VERIFY_URL=https://certs.midominio.com/

# Posición y tamaño del QR, en puntos PDF. El origen está en la esquina
# inferior izquierda y el QR se ancla abajo a la derecha.
CERT_QR_PAGE_INDEX=0
CERT_QR_SIZE=84
CERT_QR_MARGIN=28
```
- **Importante:** si `PUBLIC_VERIFY_URL` queda vacío, el QR usa el host del request (por ejemplo `http://localhost:3000/`). Así el QR no funciona fuera de tu máquina. En producción siempre debe tener el dominio real con HTTPS.
- Con `plantilla-ejemplo.pdf`, un margen de 28 pisa un poco el marco. Sube `CERT_QR_MARGIN` a unos 44 si tu plantilla tiene borde.

### 2.4 Instalar y arrancar
```powershell
cd backend
npm install        # qrcode ya está en package.json
npm start          # node --experimental-sqlite server.js
```
En los logs debe verse `Servidor corriendo en http://localhost:3000`. Las columnas nuevas se crean solas al arrancar.

### 2.5 Producción
- Sirve el backend detrás de HTTPS en el mismo dominio que `PUBLIC_VERIFY_URL`.
- El proceso necesita escribir en `backend/uploads/pdf-base/`. Ahí queda una copia temporal del PDF sin QR entre "preparar" y "emitir", y se borra al subir el PDF final. Si la copia no está (por ejemplo, porque el servidor se reinició entre los dos pasos), se descarga de IPFS por su CID.
- `backend/uploads/` ya está en `.gitignore`.

### 2.6 Cuentas por rol
El login ya no tiene selector de rol. Cada cuenta entra directo a su vista, según el rol que tiene en la base de datos, igual que en producción. Para crear o restablecer las cuentas de prueba:
```powershell
cd backend
npm run seed
```
El seed crea la institución **UDEMO · Universidad Demo** (con $100 de crédito) y estas tres cuentas. Se puede ejecutar varias veces: restablece las contraseñas y no duplica datos.

| Vista | Correo | Contraseña | Qué ve al entrar |
|---|---|---|---|
| Administrador | `laura.mendez@universidad.edu` | `demoaccess` | Instituciones, Emisiones, Solicitudes de lotes, Nueva emisión, Configuración |
| Institución (consulta) | `consulta@universidad.edu` | `consulta123` | Dashboard y Estudiantes de UDEMO. Arma lotes y los envía al admin; no emite |
| Estudiante | `estudiante@universidad.edu` | `estudiante123` | Mis certificados (los NFTs emitidos a su wallet) y Verificación |

- Para cambiar de vista, usa **Cerrar sesión** (abajo en la barra lateral) y entra con otra cuenta.
- La wallet del estudiante es `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (la cuenta #1 pública de Hardhat). Su clave privada es conocida por todos, así que úsala **solo en testnet**. Para usar otra, pon `DEMO_STUDENT_WALLET=0x…` en `.env` antes del seed, o cámbiala desde **Mis certificados → Guardar dirección**.
- Para que el estudiante vea un certificado, emítelo como admin a esa wallet (por ejemplo, con una fila `Carlos Ramírez` + esa wallet en el Excel). Aparece en **Mis certificados** con enlaces al PDF, a la transacción y a la verificación.
- Las cuentas nuevas creadas con **Crear cuenta** quedan como institución (consulta) en estado pendiente hasta que el admin las aprueba en **Instituciones**.
- **Antes de salir a producción real**, cambia estas contraseñas o borra las cuentas de prueba.

Permisos que aplica el backend (no solo el menú):

| Ruta | Admin | Institución | Estudiante |
|---|---|---|---|
| `/api/certificados/*` (emitir, historial, participantes) | ✓ | ✗ (solo `GET /config`) | ✗ (solo `GET /config`) |
| `/api/panel/estudiantes`, `/api/panel/lotes` | ✓ | ✓ (solo su institución) | ✗ |
| `/api/panel/mis-certificados`, `/api/panel/mi-wallet` | ✗ | ✗ | ✓ |

---

## 3. Pruebas como administrador

Usa testnet (Sepolia, `EXPECTED_CHAIN_ID=11155111`) antes de pasar a mainnet.

### 3.1 Emisión masiva (wizard)
1. Inicia sesión como `laura.mendez@universidad.edu` / `demoaccess` y ve a **Instituciones → Emitir**.
2. **Paso 1:** sube la plantilla PDF.
3. **Paso 2:** sube un Excel con las columnas `nombre` y `wallet` (2 o 3 filas es suficiente).
4. **Paso 3 (Generar):** se suben a IPFS los PDFs **sin QR**. Comprueba:
   - En la consola del backend aparece `📝 Generando certificado fila …`.
   - `backend/uploads/pdf-base/` contiene un `<pdfCID>.pdf` por alumno.
5. Marca la confirmación y pulsa **Emitir**. En la pantalla de progreso cada fila pasa por `enviando → confirmando → estampando QR → confirmado`.
6. Abre **Resultado y trazabilidad**. Cada fila debe mostrar **Ver transacción · PDF con QR**.
7. Abre **PDF con QR** y comprueba:
   - El QR está abajo a la derecha.
   - Al escanearlo abre `<PUBLIC_VERIFY_URL>?token=<tokenId>`.
   - El tokenId del QR es el mismo de la columna Token.
8. Comprueba en la base de datos que se guardaron los datos nuevos:
   ```powershell
   cd backend
   node --experimental-sqlite -e "const db=require('./db');console.table(db.prepare('SELECT token_id,pdf_cid,final_pdf_cid,qr_payload,error FROM emisiones ORDER BY id DESC LIMIT 5').all())"
   ```
   Los campos `pdf_cid`, `final_pdf_cid` y `qr_payload` deben estar llenos y `error` vacío.
9. Comprueba que `uploads/pdf-base/` quedó vacío.

### 3.2 Emisión individual (API)
El panel no tiene formulario individual, así que esta prueba se hace con `curl.exe` en PowerShell:
```powershell
$login = curl.exe -s -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d '{\"correo\":\"laura.mendez@universidad.edu\",\"contrasena\":\"demoaccess\"}' | ConvertFrom-Json
$T = $login.token

curl.exe -s -X POST http://localhost:3000/api/certificados/individual `
  -H "Authorization: Bearer $T" `
  -F "plantilla=@plantilla-ejemplo.pdf" `
  -F "nombreAlumno=Ana Prueba" `
  -F "walletAlumno=0xTU_WALLET_DE_PRUEBA"
```
La respuesta debe incluir `tokenId`, `tokenURI`, `pdfCID`, `finalPdfCid`, `finalPdfUrl` y `qrPayload` (terminado en `?token=<tokenId>`), con `qrError: null`.

### 3.3 Reintentar el QR
Si una fila quedó con **QR pendiente** (el mint funcionó pero falló Pinata al subir el PDF final):
```powershell
curl.exe -s -X POST http://localhost:3000/api/certificados/qr/<tokenId> -H "Authorization: Bearer $T"
```
La respuesta trae el nuevo `finalPdfUrl` y la fila en `emisiones` se actualiza (`error` vuelve a NULL). No se vuelve a mintear nada.

Para simular el fallo, pon una `PINATA_SECRET_API_KEY` incorrecta **justo después** de que la transacción se confirme. Es más práctico probar el reintento sobre un tokenId ya emitido, porque el endpoint regenera el PDF final igualmente.

### 3.4 Casos negativos
| Prueba | Resultado esperado |
|---|---|
| `POST /masivo/emitir` con un certificado sin `pdfCID` | 400 "Falta el tokenURI o el PDF…" |
| `POST /qr/99999` | 404 "No hay una emisión registrada…" |
| Verificar un tokenId que no existe en el contrato (por ejemplo `999999`) | Tarjeta roja "El token #999999 no existe en el contrato." |
| Cambiar a mano `token_uri` de una fila en la base de datos y verificar ese tokenId | Tarjeta roja "El tokenURI on-chain … no coincide…" |

---

## 4. Pruebas como estudiante o verificador público

### 4.0 Con la cuenta del estudiante
1. Inicia sesión como `estudiante@universidad.edu` / `estudiante123`. Entra directo a **Mis certificados**.
2. Deben aparecer los certificados emitidos a su wallet, cada uno con **PDF**, **Transacción** y **Verificar**.
3. Si no aparece ninguno, comprueba que la wallet del campo sea la misma que usaste al emitir.

Para las pruebas siguientes no hace falta iniciar sesión.

### 4.1 Escanear el QR
1. Abre el **PDF con QR** que recibió el alumno (en el móvil o en una impresión).
2. Escanea el QR con la cámara. Se abre `<PUBLIC_VERIFY_URL>?token=<tokenId>`.
3. La página va directo a **Verificación pública** y ya muestra el resultado:
   - ✓ **Certificado válido**
   - Titular, institución, fecha, **Token ID**, **Wallet propietaria**, **CID de metadata**, contrato y red.
   - **↓ PDF del certificado (con QR)** abre el PDF final en IPFS.
   - **Explorar transacción** abre el explorador de bloques.

### 4.2 Verificar a mano
En la pantalla de login, pulsa **"Verificar un certificado sin iniciar sesión →"** y prueba cada entrada:
- `12` y `#CERT-12`
- el CID de metadata (lo ves en el resultado, o en el explorador como `tokenURI`)
- el `finalPdfCid` (el CID que aparece en la URL del PDF final)
- la URL completa del QR

Las cuatro deben llevar al mismo token.

### 4.3 Verificar en la wallet y en la blockchain
1. En MetaMask, en la red configurada, ve a **NFTs → Importar NFT** e ingresa la dirección del contrato (`CONTRACT_ADDRESS`) y el tokenId. El NFT debe aparecer en la wallet del alumno.
2. En el explorador (Etherscan o Sepolia Etherscan), abre el contrato. En **Read Contract**:
   - `ownerOf(tokenId)` debe devolver la wallet del alumno.
   - `tokenURI(tokenId)` debe devolver `ipfs://<metadataCID>`, el mismo CID que muestra la verificación.
3. Abre `https://gateway.pinata.cloud/ipfs/<metadataCID>`. El JSON debe tener `document: ipfs://<pdfCID>`, que es el PDF **sin** QR, como se espera en este flujo.

### 4.4 Lo que ya no existe
- La zona "Arrastra el certificado aquí" con SHA-256 se eliminó. Un PDF ya no se valida por su hash, sino por el tokenId de su QR o por su CID.

---

## 5. Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| El QR abre `localhost` | Falta `PUBLIC_VERIFY_URL` en `.env` |
| Fila con "QR pendiente" | Pinata falló después del mint → `POST /api/certificados/qr/<tokenId>` |
| La verificación tarda o da 404 con un token válido | El RPC no responde → revisa `RPC_URL` |
| Un certificado emitido antes de este cambio verifica, pero sin "PDF con QR" | Esas filas no tienen `pdf_cid` ni `final_pdf_*`. Siguen siendo válidas on-chain y el reintento de QR no aplica a ellas |
| "Tu cuenta no tiene permiso para esta acción" | Entraste con un rol que no puede usar esa ruta. Revisa la tabla de permisos en 2.6 |
| El login dice "Correo o contraseña incorrectos" con las cuentas de prueba | Falta ejecutar `npm run seed` en ese servidor |
| El QR tapa parte del diseño | Ajusta `CERT_QR_SIZE`, `CERT_QR_MARGIN` o `CERT_QR_PAGE_INDEX` |
