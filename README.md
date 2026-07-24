# Plataforma de Certificados NFT — Módulo de Autenticación

Aplicación web con sistema completo de autenticación: registro, inicio de sesión, sesión persistente con JWT y recuperación de contraseña. El frontend es una SPA en vanilla JS y el backend corre en Node.js con SQLite nativo (sin servidor de base de datos externo).

---

## Requisitos previos

- [Node.js 22+](https://nodejs.org/) (se usa el módulo SQLite nativo, disponible a partir de v22.5)
- Git

---

## Cómo levantar el proyecto desde cero

### 1. Clonar el repositorio

```bash
git clone <url-del-repo>
cd login
```

### 2. Instalar dependencias del backend

```bash
cd backend
npm install
```

### 3. Crear el archivo `.env`

Los siguientes comandos se ejecutan desde la carpeta `backend` en la que ya estás. Copia el archivo de ejemplo y rellena los valores:

```bash
cp .env.example .env
```

Edita `backend/.env` y define tus propios valores (ver la sección de variables más abajo).

### 4. Crear el usuario de prueba

Los siguientes comandos se ejecutan desde la carpeta `backend` en la que ya estás:

```bash
node --experimental-sqlite seed.js
```

Esto crea (o actualiza) el usuario de prueba en la base de datos local.

### 5. Arrancar el servidor

Los siguientes comandos se ejecutan desde la carpeta `backend` en la que ya estás:

```bash
node --experimental-sqlite server.js
```

### 6. Abrir la aplicación

Abre tu navegador en: [http://localhost:3000](http://localhost:3000)

---

## Variables de entorno (`backend/.env`)

| Variable     | Descripción                                                        |
|--------------|--------------------------------------------------------------------|
| `JWT_SECRET` | Clave secreta para firmar los tokens JWT. Usa una cadena larga y aleatoria. |
| `PORT`       | Puerto en el que escucha el servidor. Por defecto: `3000`.         |

---

## Usuario de prueba

Después de correr `seed.js`, puedes entrar con:

| Campo       | Valor                          |
|-------------|--------------------------------|
| Correo      | `laura.mendez@universidad.edu` |
| Contraseña  | `demoaccess`                   |

---

## Notas importantes

Los siguientes archivos y carpetas **no se suben al repositorio** (están en `.gitignore`):

- `backend/.env` — contiene secretos; cada desarrollador crea el suyo a partir de `.env.example`
- `backend/node_modules/` — se regenera con `npm install`
- `backend/database.sqlite` — se regenera al arrancar el servidor por primera vez
