import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { BACKUP_DIR } from './config.js';

const KEEP = 30;                 // cópias diárias guardadas
const DAY = 24 * 60 * 60 * 1000;
const NAME = /^arquivo-\d{4}-\d{2}-\d{2}\.db$/;

// Cópia consistente da base de dados, feita com o servidor a correr.
export async function backupNow() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const file = resolve(BACKUP_DIR, `arquivo-${new Date().toISOString().slice(0, 10)}.db`);
  await db.backup(file);
  const old = readdirSync(BACKUP_DIR).filter(f => NAME.test(f)).sort().slice(0, -KEEP);
  for (const f of old) unlinkSync(resolve(BACKUP_DIR, f));
  return file;
}

export function scheduleBackups() {
  const run = () => backupNow()
    .then(file => console.log(`Cópia de segurança feita: ${file}`))
    .catch(err => console.error('A cópia de segurança falhou:', err));
  run();
  setInterval(run, DAY).unref();
}

// npm run backup -w backend
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  backupNow().then(file => { console.log(`Cópia de segurança feita: ${file}`); db.close(); });
}
