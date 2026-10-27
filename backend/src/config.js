import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const PORT = Number(process.env.PORT) || 3001;
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
// Se estiver definida, o site fica bloqueado ("em construção") até se introduzir esta palavra-passe.
export const SITE_PASSWORD = process.env.SITE_PASSWORD || '';
export const DATA_DIR = resolve(ROOT, process.env.DATA_DIR || 'data');
export const UPLOADS_DIR = resolve(DATA_DIR, 'uploads');
export const DELETED_DIR = resolve(DATA_DIR, 'apagadas');
export const BACKUP_DIR = resolve(ROOT, process.env.BACKUP_DIR || resolve(DATA_DIR, 'backups'));
export const FRONTEND_DIST = resolve(ROOT, '..', 'frontend', 'dist');

mkdirSync(UPLOADS_DIR, { recursive: true });
mkdirSync(DELETED_DIR, { recursive: true });

if (!ADMIN_PASSWORD) {
  console.warn('Aviso: ADMIN_PASSWORD não está definida em backend/.env. Ninguém vai conseguir editar o arquivo.');
}
