import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import express from 'express';
import { SITE_PASSWORD, ROOT } from './config.js';

// Bloqueio do site "em construção": sem a SITE_PASSWORD só se vê a página de bloqueio.
// A verificação é feita aqui, no servidor, por isso quem não entra não recebe o site, a API nem as fotografias.

const GATE_DIR = resolve(ROOT, 'gate');
const COOKIE = 'tufeisep_acesso';
const DAYS = 30;
const OPEN = new Set(['/api/saude']); // o healthcheck do Docker não tem cookie

const key = () => createHmac('sha256', 'tufeisep-gate').update(SITE_PASSWORD).digest();
const sign = exp => createHmac('sha256', key()).update(String(exp)).digest('hex');

function hasAccess(req) {
  const raw = (req.get('cookie') || '').split(';').map(c => c.trim()).find(c => c.startsWith(COOKIE + '='));
  if (!raw) return false;
  const [exp, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && timingSafeEqual(a, b);
}

// 10 falhas por IP em 15 minutos, como no login do arquivo.
const WINDOW = 15 * 60 * 1000, MAX_FAILS = 10;
const fails = new Map();
setInterval(() => { const now = Date.now(); for (const [ip, f] of fails) if (now > f.reset) fails.delete(ip); }, WINDOW).unref();

const same = (a, b) => {
  const x = createHmac('sha256', 'cmp').update(String(a)).digest();
  const y = createHmac('sha256', 'cmp').update(String(b)).digest();
  return timingSafeEqual(x, y);
};

export function gate() {
  const router = express.Router();
  if (!SITE_PASSWORD) return router; // sem palavra-passe definida, o site fica aberto

  router.use('/bloqueado', express.static(GATE_DIR, { index: false }));

  router.post('/bloqueado/entrar', express.json({ limit: '1kb' }), (req, res) => {
    const f = fails.get(req.ip);
    if (f && Date.now() < f.reset && f.n >= MAX_FAILS) {
      return res.status(429).json({ erro: 'Demasiadas tentativas. Tente outra vez daqui a 15 minutos.' });
    }
    if (!same(req.body?.palavraPasse ?? '', SITE_PASSWORD)) {
      if (!f || Date.now() > f.reset) fails.set(req.ip, { n: 1, reset: Date.now() + WINDOW });
      else f.n++;
      return res.status(401).json({ erro: 'Palavra-passe errada.' });
    }
    const exp = Date.now() + DAYS * 864e5;
    res.cookie(COOKIE, `${exp}.${sign(exp)}`, {
      httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: DAYS * 864e5, path: '/',
    });
    res.json({ ok: true });
  });

  router.use((req, res, next) => {
    if (OPEN.has(req.path) || hasAccess(req)) return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return res.status(401).json({ erro: 'Site em construção.' });
    }
    res.status(503).set('Retry-After', '86400').set('Cache-Control', 'no-store')
      .set('X-Robots-Tag', 'noindex').sendFile(resolve(GATE_DIR, 'bloqueado.html'));
  });

  return router;
}
