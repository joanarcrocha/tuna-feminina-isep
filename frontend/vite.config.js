import { defineConfig } from 'vite';

const API = 'http://localhost:3001';

export default defineConfig({
  // No GitHub Pages o site fica em /<nome-do-repositório>/; o workflow define BASE_PATH.
  base: process.env.BASE_PATH || '/',
  server: {
    port: 5173,
    proxy: { '/api': API, '/uploads': API },
  },
});
