import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PORT, UPLOADS_DIR, FRONTEND_DIST } from './config.js';
import { api } from './routes.js';
import { db } from './db.js';
import { scheduleBackups } from './backup.js';

const app = express();
app.disable('x-powered-by');
// Em produção o servidor está atrás do Caddy; assim req.ip é o IP real de quem visita.
app.set('trust proxy', 1);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "connect-src 'self' https://nominatim.openstreetmap.org https://api.web3forms.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});

app.use(express.json({ limit: '1mb' }));

app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true }));
app.use('/api', api);

// Em produção, o backend serve também o site já compilado (npm run build).
if (existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (req, res) => res.sendFile(resolve(FRONTEND_DIST, 'index.html')));
}

app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status === 500) console.error(err);
  const erro = err.code === 'LIMIT_FILE_SIZE' ? 'A imagem é demasiado grande (máximo 15 MB).'
    : status === 500 ? 'Erro no servidor.' : err.message;
  res.status(status).json({ erro });
});

const server = app.listen(PORT, () => console.log(`API do arquivo em http://localhost:${PORT}`));
scheduleBackups();

// Fecha a base de dados de forma limpa quando o servidor é parado (Ctrl+C ou reinício).
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
