import { createHash, timingSafeEqual } from 'node:crypto';
import { ADMIN_PASSWORD } from './config.js';

const hash = s => createHash('sha256').update(String(s)).digest();

export function checkPassword(password) {
  return Boolean(ADMIN_PASSWORD) && timingSafeEqual(hash(password), hash(ADMIN_PASSWORD));
}

// Trava quem tenta adivinhar a palavra-passe: 10 falhas por IP em 15 minutos.
const WINDOW = 15 * 60 * 1000, MAX_FAILS = 10;
const fails = new Map();
setInterval(() => { const now = Date.now(); for (const [ip, f] of fails) if (now > f.reset) fails.delete(ip); }, WINDOW).unref();

const blocked = ip => { const f = fails.get(ip); return Boolean(f) && Date.now() < f.reset && f.n >= MAX_FAILS; };
const recordFail = ip => {
  const f = fails.get(ip);
  if (!f || Date.now() > f.reset) fails.set(ip, { n: 1, reset: Date.now() + WINDOW });
  else f.n++;
};
const TOO_MANY = { erro: 'Demasiadas tentativas. Tente outra vez daqui a 15 minutos.' };

// Verifica a palavra-passe e responde com o erro certo; devolve true se pode continuar.
export function verify(req, res, password, message) {
  if (blocked(req.ip)) { res.status(429).json(TOO_MANY); return false; }
  if (checkPassword(password)) return true;
  recordFail(req.ip);
  res.status(401).json({ erro: message });
  return false;
}

// O frontend envia a palavra-passe partilhada como token Bearer.
export function requireAuth(req, res, next) {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (verify(req, res, token, 'Sessão inválida. Entre outra vez com a palavra-passe da tuna.')) next();
}
