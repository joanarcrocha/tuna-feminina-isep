// Área reservada: repertório musical e ligações úteis.
// Todas as contas leem; a Administração e a Direção musical gerem.
// Os ficheiros estão num armazenamento privado e abrem com ligações temporárias (1 hora).
import { sb } from './supabase.js';
import { askLogin, getRole, signOut, canManageMusic, ROLE_LABEL } from './auth.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CATEGORIAS = ['Atuação', 'Pasecalles', 'Serenatas', 'Outras músicas'];
const BUCKET = 'musica';
const MAX_BYTES = 50 * 1024 * 1024;

const state = { role: null, manage: false, musicas: [], ficheiros: [], ligacoes: [], urls: {}, cat: 'Todas', q: '' };

const SCHEMAS = {
  musicas: { title: 'música', fields: [
    { k: 'titulo', l: 'Título', req: true },
    { k: 'categoria', l: 'Categoria', type: 'select', opts: CATEGORIAS, req: true },
    { k: 'notas', l: 'Notas', hint: 'Por exemplo: tom, quem faz o solo, em que parte da atuação entra.' },
    { k: 'link', l: 'Ligação', type: 'url', hint: 'Opcional. Uma gravação no YouTube ou uma pasta no Drive.' },
    { k: 'letra', l: 'Letra', type: 'textarea' },
  ]},
  ligacoes: { title: 'ligação', fields: [
    { k: 'titulo', l: 'Nome', req: true },
    { k: 'url', l: 'Endereço', type: 'url', req: true },
  ]},
};

/* ---------- utilitários ---------- */
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), 3000);
}

function check({ data, error }) {
  if (!error) return data;
  if (error.code === '42501' || error.status === 401 || error.status === 403) throw new Error('Não tens permissão para fazer isto.');
  if (error.code === 'PGRST205' || error.code === '42P01' || error.code === 'PGRST202') {
    throw new Error('A área reservada ainda não está configurada no Supabase.');
  }
  throw new Error('Não foi possível concluir. Tenta outra vez.');
}

const kindOf = f => {
  const t = f.tipo || '';
  if (t === 'application/pdf') return 'PDF';
  if (t.startsWith('audio/')) return 'Áudio';
  if (t.startsWith('video/')) return 'Vídeo';
  if (t.startsWith('image/')) return 'Imagem';
  return 'Ficheiro';
};
const fmtSize = b => !b ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
const isUrl = s => /^https?:\/\/\S+$/i.test(s);

/* ---------- arranque ---------- */
async function start() {
  if (!sb) {
    $('#status').textContent = 'A área reservada só funciona com o Supabase configurado.';
    return;
  }
  state.role = await getRole();
  state.manage = canManageMusic(state.role);
  const in_ = Boolean(state.role);
  $('#gate').hidden = in_;
  $('#app').hidden = !in_;
  $('#who').hidden = !in_;
  $('#logoutBtn').hidden = !in_;
  document.querySelectorAll('.manage').forEach(b => { b.hidden = !state.manage; });
  if (!in_) return;
  $('#who').textContent = ROLE_LABEL[state.role];
  await load();
}

async function load() {
  $('#status').textContent = 'A carregar…';
  try {
    const [m, f, l] = await Promise.all([
      sb.from('musicas').select('*').order('titulo'),
      sb.from('musica_ficheiros').select('*').order('nome'),
      sb.from('ligacoes').select('*').order('id'),
    ]);
    state.musicas = check(m);
    state.ficheiros = check(f);
    state.ligacoes = check(l);
    state.urls = {};
    const paths = state.ficheiros.map(x => x.caminho).filter(Boolean);
    if (paths.length) {
      const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
      for (const d of data || []) if (d.signedUrl) state.urls[d.path] = d.signedUrl;
    }
    $('#status').textContent = '';
  } catch (err) {
    $('#status').textContent = err.message;
  }
  render();
}

/* ---------- render ---------- */
function render() {
  renderLinks();
  renderSongs();
}

function renderLinks() {
  $('#linksList').innerHTML = state.ligacoes.length
    ? state.ligacoes.map(l => `
      <li>
        <a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.titulo)} <span aria-hidden="true">↗</span></a>
        ${state.manage ? `<button class="tool danger" data-del="ligacoes" data-id="${l.id}">Apagar</button>` : ''}
      </li>`).join('')
    : `<li class="muted">Ainda não há ligações.</li>`;
}

function renderSongs() {
  const counts = Object.fromEntries(CATEGORIAS.map(c => [c, state.musicas.filter(m => m.categoria === c).length]));
  $('#catFilter').innerHTML = ['Todas', ...CATEGORIAS].map(c =>
    `<button class="pill" data-cat="${c}" aria-pressed="${state.cat === c}">${c}<small>${c === 'Todas' ? state.musicas.length : counts[c]}</small></button>`).join('') +
    `<input class="search" id="songSearch" type="search" placeholder="Procurar música" aria-label="Procurar música" value="${esc(state.q)}">`;

  const q = state.q.toLowerCase();
  const list = state.musicas.filter(m =>
    (state.cat === 'Todas' || m.categoria === state.cat) &&
    (!q || [m.titulo, m.notas, m.letra].join(' ').toLowerCase().includes(q)));

  if (!list.length) {
    $('#songs').innerHTML = `<div class="empty"><strong>${state.musicas.length ? 'Nenhuma música corresponde.' : 'O repertório ainda está vazio.'}</strong>${
      state.musicas.length ? 'Experimenta outra categoria ou outra pesquisa.'
      : state.manage ? 'Carrega em “+ Adicionar música” para começar.' : 'A Direção musical vai juntar aqui as músicas.'}</div>`;
    return;
  }

  // Agrupado por categoria, pela ordem do repertório.
  $('#songs').innerHTML = CATEGORIAS
    .map(c => [c, list.filter(m => m.categoria === c)])
    .filter(([, ms]) => ms.length)
    .map(([c, ms]) => `
      <section class="cat-group">
        <h3 class="cat-title">${c}</h3>
        <div class="song-grid">${ms.map(songCard).join('')}</div>
      </section>`).join('');
}

function songCard(m) {
  const files = state.ficheiros.filter(f => f.musica_id === m.id);
  return `
    <article class="song">
      <div class="song-head">
        <h4>${esc(m.titulo)}</h4>
        ${state.manage ? `<div class="item-tools on">
          <button class="tool" data-edit="musicas" data-id="${m.id}">Editar</button>
          <button class="tool danger" data-del="musicas" data-id="${m.id}">Apagar</button></div>` : ''}
      </div>
      ${m.notas ? `<p class="song-notes">${esc(m.notas)}</p>` : ''}
      ${files.length ? fileGroups(files) : `<p class="muted">Ainda sem ficheiros.</p>`}
      ${m.link && isUrl(m.link) ? `<a class="song-link" href="${esc(m.link)}" target="_blank" rel="noopener">${m.link.includes('drive.google.com') ? 'Abrir a pasta no Drive' : 'Abrir ligação'} <span aria-hidden="true">↗</span></a>` : ''}
      ${m.letra ? `<details class="letra"><summary>Letra</summary><div>${esc(m.letra)}</div></details>` : ''}
      ${state.manage ? `<label class="upload"><input type="file" multiple data-upload="${m.id}">+ Adicionar ficheiros</label>` : ''}
    </article>`;
}

// Ficheiros agrupados pela pasta de origem (por exemplo "Vozes · Sopranos").
// Com muitos ficheiros, cada grupo abre e fecha para o cartão não ficar enorme.
function fileGroups(files) {
  const groups = new Map();
  for (const f of [...files].sort((a, b) => String(a.grupo || '').localeCompare(String(b.grupo || ''), 'pt') || a.nome.localeCompare(b.nome, 'pt'))) {
    const g = f.grupo || 'Geral';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(f);
  }
  if (groups.size === 1 && files.length <= 6) return `<ul class="files">${files.map(fileItem).join('')}</ul>`;
  return [...groups].map(([g, fs]) => `
    <details class="file-group"${files.length <= 6 ? ' open' : ''}>
      <summary>${esc(g)} <small>${fs.length}</small></summary>
      <ul class="files">${fs.map(fileItem).join('')}</ul>
    </details>`).join('');
}

function fileItem(f) {
  // Copiado para o site (ligação temporária) ou deixado no Drive (ligação fixa).
  const url = f.caminho ? state.urls[f.caminho] : f.url;
  const audio = f.caminho && (f.tipo || '').startsWith('audio/');
  return `
    <li class="file">
      <div class="file-row">
        <span class="file-kind">${kindOf(f)}</span>
        <span class="file-name" title="${esc(f.nome)}">${esc(f.nome)}</span>
        <span class="file-size">${fmtSize(f.tamanho)}</span>
        ${url ? `<a class="tool" href="${esc(url)}" target="_blank" rel="noopener">${f.caminho ? 'Abrir' : 'Drive ↗'}</a>` : ''}
        ${state.manage ? `<button class="tool danger" data-delfile="${f.id}">Apagar</button>` : ''}
      </div>
      ${audio && url ? `<audio controls preload="none" src="${esc(url)}"></audio>` : ''}
      ${f.caminho && f.tipo === 'video/mp4' && url ? `<video controls preload="none" playsinline src="${esc(url)}"></video>` : ''}
    </li>`;
}

/* ---------- formulários ---------- */
let current = null;
function openForm(kind, item) {
  const sc = SCHEMAS[kind], v = item || {};
  current = { kind, item };
  const field = x => {
    const id = 'f_' + x.k, val = v[x.k] ?? '';
    let input;
    if (x.type === 'textarea') input = `<textarea id="${id}" name="${x.k}">${esc(val)}</textarea>`;
    else if (x.type === 'select') input = `<select id="${id}" name="${x.k}">${x.opts.map(o => `<option${o === (val || (state.cat !== 'Todas' ? state.cat : '')) ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    else input = `<input id="${id}" name="${x.k}" type="${x.type || 'text'}" value="${esc(val)}"${x.type === 'url' ? ' placeholder="https://"' : ''}>`;
    return `<div class="field"><label for="${id}">${x.l}${x.req ? ' *' : ''}</label>${input}${x.hint ? `<span class="hint">${x.hint}</span>` : ''}</div>`;
  };
  $('#form').innerHTML = `<h3>${item ? 'Editar' : 'Nova'} ${sc.title}</h3>${sc.fields.map(field).join('')}
    <p class="form-err" id="formErr" role="alert" hidden></p>
    <div class="actions"><button type="button" class="btn" id="cancel">Cancelar</button><button type="submit" class="btn primary" id="save">Guardar</button></div>`;
  $('#cancel').onclick = () => $('#dlg').close();
  $('#dlg').showModal();
  $('#form').querySelector('input, select, textarea').focus();
}

$('#form').addEventListener('submit', async e => {
  e.preventDefault();
  const { kind, item } = current, sc = SCHEMAS[kind], fd = new FormData($('#form'));
  const err = $('#formErr'), save = $('#save');
  const showErr = msg => { err.textContent = msg; err.hidden = false; };
  const data = {};
  for (const x of sc.fields) data[x.k] = String(fd.get(x.k) || '').trim() || null;
  const missing = sc.fields.find(x => x.req && !data[x.k]);
  if (missing) return showErr(`Preenche o campo “${missing.l}”.`);
  const badUrl = sc.fields.find(x => x.type === 'url' && data[x.k] && !isUrl(data[x.k]));
  if (badUrl) return showErr(`O campo “${badUrl.l}” tem de começar por https://`);

  save.disabled = true;
  save.textContent = 'A guardar…';
  try {
    if (item) check(await sb.from(kind).update(data).eq('id', item.id).select('id').single());
    else check(await sb.from(kind).insert(data).select('id').single());
    $('#dlg').close();
    toast('Guardado');
    await load();
  } catch (ex) {
    showErr(ex.message);
  } finally {
    save.disabled = false;
    save.textContent = 'Guardar';
  }
});

/* ---------- ficheiros ---------- */
async function uploadFiles(musicaId, files) {
  const list = [...files];
  const tooBig = list.filter(f => f.size > MAX_BYTES);
  if (tooBig.length) toast(`${tooBig.map(f => f.name).join(', ')}: maior que 50 MB, não foi enviado.`);
  const ok = list.filter(f => f.size <= MAX_BYTES);
  let sent = 0;
  for (const f of ok) {
    toast(`A enviar ${sent + 1} de ${ok.length}: ${f.name}`);
    const ext = (f.name.match(/\.[a-z0-9]{1,6}$/i) || [''])[0].toLowerCase();
    const caminho = `${musicaId}/${crypto.randomUUID()}${ext}`;
    const up = await sb.storage.from(BUCKET).upload(caminho, f, { contentType: f.type || 'application/octet-stream' });
    if (up.error) { toast(`Não foi possível enviar ${f.name}.`); continue; }
    try {
      check(await sb.from('musica_ficheiros').insert({ musica_id: musicaId, nome: f.name, caminho, tipo: f.type || null, tamanho: f.size }).select('id').single());
      sent++;
    } catch (ex) {
      await sb.storage.from(BUCKET).remove([caminho]);
      toast(ex.message);
    }
  }
  if (sent) toast(sent === 1 ? 'Ficheiro adicionado' : `${sent} ficheiros adicionados`);
  await load();
}

// Apagar pede confirmação: o primeiro clique arma o botão, o segundo apaga.
function armed(btn) {
  if (btn.classList.contains('armed')) return true;
  btn.classList.add('armed');
  btn.textContent = 'Confirmar';
  setTimeout(() => { btn.classList.remove('armed'); btn.textContent = 'Apagar'; }, 3500);
  return false;
}

async function removeRecord(kind, id) {
  try {
    if (kind === 'musicas') {
      const paths = state.ficheiros.filter(f => f.musica_id === id).map(f => f.caminho).filter(Boolean);
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    }
    const { count, error } = await sb.from(kind).delete({ count: 'exact' }).eq('id', id);
    check({ error });
    if (!count) throw new Error('Não tens permissão para fazer isto.');
    toast('Apagado');
  } catch (ex) {
    toast(ex.message);
  }
  await load();
}

async function removeFile(id) {
  const f = state.ficheiros.find(x => x.id === id);
  if (!f) return;
  try {
    if (f.caminho) {
      const { error } = await sb.storage.from(BUCKET).remove([f.caminho]);
      if (error) throw new Error('Não foi possível apagar o ficheiro.');
    }
    check(await sb.from('musica_ficheiros').delete().eq('id', id));
    toast('Ficheiro apagado');
  } catch (ex) {
    toast(ex.message);
  }
  await load();
}

/* ---------- interações ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.cat) { state.cat = t.dataset.cat; renderSongs(); }
  else if (t.dataset.edit) openForm(t.dataset.edit, state[t.dataset.edit].find(x => String(x.id) === t.dataset.id));
  else if (t.dataset.del) { if (armed(t)) removeRecord(t.dataset.del, Number(t.dataset.id)); }
  else if (t.dataset.delfile) { if (armed(t)) removeFile(Number(t.dataset.delfile)); }
});

document.addEventListener('input', e => {
  if (e.target.id !== 'songSearch') return;
  state.q = e.target.value;
  const pos = e.target.selectionStart;
  renderSongs();
  const s = $('#songSearch');
  s.focus();
  s.setSelectionRange(pos, pos);
});

document.addEventListener('change', e => {
  const id = e.target.dataset?.upload;
  if (id && e.target.files.length) uploadFiles(Number(id), e.target.files);
});

$('#addSong').addEventListener('click', () => openForm('musicas'));
$('#addLink').addEventListener('click', () => openForm('ligacoes'));
$('#gateLogin').addEventListener('click', async () => { if (await askLogin()) start(); });
$('#logoutBtn').addEventListener('click', async () => {
  await signOut();
  location.href = './';
});

start();
