import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const API = 'http://localhost:3001';

export default defineConfig({
  // No GitHub Pages o site fica em /<nome-do-repositório>/; o workflow define BASE_PATH.
  base: process.env.BASE_PATH || '/',
  build: {
    // Duas páginas: o site público e a área reservada.
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        reservado: resolve(import.meta.dirname, 'reservado.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': API, '/uploads': API },
  },
});
