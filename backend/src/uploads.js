import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { rename } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { UPLOADS_DIR, DELETED_DIR } from './config.js';

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

export const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => cb(null, randomUUID() + EXT[file.mimetype]),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (EXT[file.mimetype]) return cb(null, true);
    cb(Object.assign(new Error('Formato não suportado. Use JPG, PNG, WEBP ou GIF.'), { status: 400 }));
  },
});

// As fotos apagadas não se perdem: passam para data/apagadas, de onde se podem recuperar.
export async function removeUpload(name) {
  if (!name) return;
  const file = basename(name);
  await rename(resolve(UPLOADS_DIR, file), resolve(DELETED_DIR, file)).catch(() => {});
}
