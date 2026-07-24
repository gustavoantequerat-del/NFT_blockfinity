import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: '/registro/' porque Express sirve esta app compilada bajo esa ruta,
// no en la raíz del dominio (ver server.js).
export default defineConfig({
  plugins: [react()],
  base: '/registro/',
  server: {
    port: 5173,
  },
});
