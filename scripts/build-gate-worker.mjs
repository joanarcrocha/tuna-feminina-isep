// Gera cloudflare/gate-worker.js: um único ficheiro, com a página de bloqueio (backend/gate) embutida,
// para colar no painel da Cloudflare. Voltar a correr depois de mudar algo em backend/gate:
//   node scripts/build-gate-worker.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const g = f => resolve(root, 'backend/gate', f);
const text = f => readFileSync(g(f), 'utf8');
const b64 = f => readFileSync(g(f)).toString('base64');

const assets = {
  '/bloqueado/bloqueado.css': ['text/css; charset=utf-8', text('bloqueado.css'), false],
  '/bloqueado/bloqueado.js': ['text/javascript; charset=utf-8', text('bloqueado.js'), false],
  '/bloqueado/fachada.svg': ['image/svg+xml', text('fachada.svg'), false],
  '/bloqueado/logo.webp': ['image/webp', b64('logo.webp'), true],
  '/bloqueado/favicon.png': ['image/png', b64('favicon.png'), true],
};

const worker = `// GERADO por scripts/build-gate-worker.mjs. Não editar à mão.
// Site "em construção" no Cloudflare Worker: sem a palavra-passe (secret SITE_PASSWORD) só se vê a página de bloqueio.
// O acesso fica guardado 30 dias num cookie assinado (HMAC-SHA256).

const COOKIE = 'tufeisep_acesso';
const DAYS = 30;
const HTML = ${JSON.stringify(text('bloqueado.html'))};
const ASSETS = ${JSON.stringify(assets)};

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const hmac = async (secret, msg) => {
  const k = await crypto.subtle.importKey('raw', enc.encode('tufeisep-gate' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
};
const same = async (a, b) => (await hmac('cmp', a)) === (await hmac('cmp', b));

async function hasAccess(request, secret) {
  const raw = (request.headers.get('cookie') || '').split(';').map(c => c.trim()).find(c => c.startsWith(COOKIE + '='));
  if (!raw) return false;
  const [exp, sig] = raw.slice(COOKIE.length + 1).split('.');
  return Boolean(exp && sig) && Number(exp) > Date.now() && await same(sig, await hmac(secret, exp));
}

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export default {
  async fetch(request, env) {
    const secret = env.SITE_PASSWORD;
    if (!secret) return fetch(request); // sem palavra-passe definida, o site fica aberto
    const url = new URL(request.url);

    const asset = ASSETS[url.pathname];
    if (asset && request.method === 'GET') {
      const [type, data, binary] = asset;
      const body = binary ? Uint8Array.from(atob(data), c => c.charCodeAt(0)) : data;
      return new Response(body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=86400' } });
    }

    if (url.pathname === '/bloqueado/entrar' && request.method === 'POST') {
      const { palavraPasse } = await request.json().catch(() => ({}));
      if (!(await same(palavraPasse ?? '', secret))) return json({ erro: 'Palavra-passe errada.' }, 401);
      const exp = Date.now() + DAYS * 864e5;
      return json({ ok: true }, 200, {
        'set-cookie': \`\${COOKIE}=\${exp}.\${await hmac(secret, String(exp))}; Max-Age=\${DAYS * 86400}; Path=/; HttpOnly; Secure; SameSite=Lax\`,
      });
    }

    if (await hasAccess(request, secret)) return fetch(request);

    return new Response(HTML, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '86400', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
    });
  },
};
`;
writeFileSync(resolve(root, 'cloudflare/gate-worker.js'), worker);
console.log('cloudflare/gate-worker.js', (worker.length / 1024).toFixed(0), 'KB');
