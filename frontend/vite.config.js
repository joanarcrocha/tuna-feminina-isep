import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const API = 'http://localhost:3001';

export default defineConfig({
  // No GitHub Pages o site fica em /<nome-do-repositório>/; o workflow define BASE_PATH.
  base: process.env.BASE_PATH || '/',
  build: {
    // Três páginas: o site público, os registos (galeria) e a área reservada.
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        reservado: resolve(import.meta.dirname, 'reservado.html'),
        registos: resolve(import.meta.dirname, 'registos.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': API, '/uploads': API },
  },
});
