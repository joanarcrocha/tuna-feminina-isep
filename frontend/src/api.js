// Dois modos de guardar o arquivo:
//  - Supabase, quando VITE_SUPABASE_URL está definida (demo no GitHub Pages, gratuita);
//  - o backend Express deste projeto, em /api (servidor próprio).
import { sb } from './supabase.js';

const SESSION_ERROR = 'Sessão inválida. Entre outra vez com a conta da Administração.';
const fail = (message, status) => Object.assign(new Error(message), { status });

/* ---------- Backend Express ---------- */
function expressApi() {
  const TOKEN_KEY = 'tfisep.token';
  const token = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
  const setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

  async function request(method, path, body) {
    const headers = {};
    if (token()) headers.Authorization = 'Bearer ' + token();
    const isForm = body instanceof FormData;
    if (body && !isForm) headers['Content-Type'] = 'application/json';
    const res = await fetch('/api' + path, { method, headers, body: isForm ? body : body && JSON.stringify(body) });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw fail(data?.erro || 'Não foi possível guardar. Tente outra vez.', res.status);
    return data;
  }

  return {
    async hasSession() { return Boolean(token()); },
    async login(password) { await request('POST', '/login', { password }); setToken(password); },
    async logout() { setToken(null); },
    info: () => request('GET', '/info'),
    saveInfo: data => request('PUT', '/info', data),
    list: kind => request('GET', '/' + kind),
    create: (kind, data) => request('POST', '/' + kind, data),
    update: (kind, id, data) => request('PUT', `/${kind}/${id}`, data),
    remove: (kind, id) => request('DELETE', `/${kind}/${id}`),
    reorder: items => request('PATCH', '/membros/ordem', items),
    upload(file) {
      const fd = new FormData();
      fd.append('ficheiro', file);
      return request('POST', '/uploads', fd);
    },
    fileUrl: name => '/uploads/' + encodeURIComponent(name),
  };
}

/* ---------- Supabase ---------- */
function supabaseApi() {
  const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

  // Traduz os erros do Supabase para mensagens que a página mostra.
  function check({ data, error }) {
    if (!error) return data;
    if (error.code === '42501' || error.code === 'PGRST301' || error.status === 401 || error.status === 403) throw fail(SESSION_ERROR, 401);
    if (error.code === 'PGRST116') throw fail('Registo não encontrado, ou a sessão terminou. Entre outra vez.', 401);
    if (error.code === 'PGRST204') throw fail('A base de dados precisa de ser atualizada. Corra a migração mais recente no Supabase.', 500);
    if (error.code === '23505') throw fail('Já existe uma Magíster. Recarregue a página e tente outra vez.', 409);
    if (error.code === '23514') throw fail('Há um valor que não é aceite. Confirme a hierarquia e o naipe.', 400);
    throw fail('Não foi possível guardar. Tente outra vez.', 500);
  }

  // A sessão (entrar, sair, papel de cada conta) é tratada em auth.js.
  return {
    info: async () => check(await sb.from('info').select('fundacao, lema, historia').eq('id', 1).single()),
    saveInfo: async data => check(await sb.from('info').update(data).eq('id', 1).select().single()),
    list: async kind => check(await sb.from(kind).select('*').order('id')),
    create: async (kind, data) => check(await sb.from(kind).insert(data).select().single()),
    update: async (kind, id, data) => check(await sb.from(kind).update(data).eq('id', id).select().single()),
    remove: async (kind, id) => {
      const { count, error } = await sb.from(kind).delete({ count: 'exact' }).eq('id', id);
      check({ error });
      if (!count) throw fail(SESSION_ERROR, 401);
    },
    // Muda a ordem dos membros: [{id, ordem}, ...]
    async reorder(items) {
      await Promise.all(items.map(async ({ id, ordem }) =>
        check(await sb.from('membros').update({ ordem }).eq('id', id).select('id').single())));
    },
    async upload(file) {
      if (!EXT[file.type]) throw fail('Formato não suportado. Use JPG, PNG, WEBP ou GIF.', 400);
      if (file.size > 15 * 1024 * 1024) throw fail('A imagem é demasiado grande (máximo 15 MB).', 413);
      const name = crypto.randomUUID() + EXT[file.type];
      const { error } = await sb.storage.from('fotos').upload(name, file, { contentType: file.type });
      if (error) throw fail(error.statusCode === '403' ? SESSION_ERROR : 'Não foi possível enviar a imagem.', error.statusCode === '403' ? 401 : 500);
      return { ficheiro: name };
    },
    fileUrl: name => sb.storage.from('fotos').getPublicUrl(name).data.publicUrl,
  };
}

export const api = sb ? supabaseApi() : expressApi();
export const fileUrl = name => api.fileUrl(name);
