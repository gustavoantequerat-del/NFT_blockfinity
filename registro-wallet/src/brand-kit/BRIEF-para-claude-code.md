# Brief para Claude Code — Rebranding del portal registro-wallet

## Contexto
Estoy en el proyecto `registro-wallet` (React + Vite): el portal donde los
asistentes al **Foro Activos Digitales Bolivia 2026** registran o crean su
wallet para recibir un certificado NFT. Quiero aplicarle la identidad visual
oficial del Foro.

## Regla dura (no negociable)
NO toques la lógica funcional. En concreto, no modifiques:
- La integración de Web3Auth ni la inicialización del login.
- La función que guarda datos / conecta con el backend o Google Apps Script.
- La configuración de red, variables de entorno ni `vite.config.js`.
- El flujo de pantallas (las dos tarjetas "Sí, ya tengo una / No, créala por mí"
  y la pantalla de éxito) debe seguir funcionando igual.

Solo cambias **capa visual**: colores, tipografías, logos, texturas y estilos.
Cada cambio, muéstramelo antes de aplicarlo.

## Assets que voy a colocar en el proyecto
Voy a copiar la carpeta `brand-kit` dentro de `src/`, así:
- `src/brand-kit/design-tokens.css` — variables de color y tipografía.
- `src/brand-kit/fonts.css` — @import de IBM Plex + @font-face de Clash Display.
- `src/brand-kit/fonts/ClashDisplay-{400,500,600,700}.woff2` — fuente de títulos.
- `src/brand-kit/logos/` — logos en PNG con fondo transparente.
- `src/brand-kit/textures/` — textura de fondo.

## Tareas
1. Importa `design-tokens.css` y `fonts.css` en el punto de entrada global de
   estilos (probablemente `src/index.css` o `src/main.jsx`), de modo que las
   variables `--navy`, `--teal`, `--cream`, etc. y las fuentes queden
   disponibles en toda la app.

2. Reemplaza los colores actuales del portal por los tokens del Foro:
   - Fondo claro → `var(--cream)`
   - Texto principal → `var(--navy)`
   - Color de marca / botones primarios → `var(--teal)`, hover `var(--teal-deep)`
   - Tarjetas → `var(--card)` con borde `var(--card-line)`
   No dejes colores hardcodeados nuevos; usa siempre las variables.

3. Aplica las tipografías:
   - Títulos y encabezados → `var(--font-display)` (Clash Display)
   - Texto general → `var(--font-body)` (IBM Plex Sans)
   - Etiquetas pequeñas / código / direcciones de wallet → `var(--font-mono)`

4. Logos: reemplaza el "sello dorado" actual de la pantalla inicial por el logo
   del Foro. (Te voy a decir cuál archivo es el correcto de la carpeta `logos/`.)
   Mantén el pie de página pero con el/los logos que te indique.

5. Opcional: usa la textura de `textures/` como fondo sutil si encaja, sin que
   estorbe la legibilidad.

## Cómo trabajar
- Primero dame un plan de qué archivos vas a tocar y qué vas a cambiar en cada uno.
- Espera mi OK antes de editar.
- Después de aplicar, recuérdame correr `npm run dev` para revisar en el navegador.
