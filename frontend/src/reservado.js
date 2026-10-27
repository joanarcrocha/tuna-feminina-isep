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

const state = { role: null, manage: false, musicas: [], ficheiros: [], ligacoes: [], urls: {}, q: '', sel: null, naipe: null, pdf: 0 };

const SCHEMAS = {
  musicas: { title: 'música', fields: [
    { k: 'titulo', l: 'Título', req: true },
    { k: 'categoria', l: 'Categoria', type: 'select', opts: CATEGORIAS, req: true },
    { k: 'notas', l: 'Notas', hint: 'Por exemplo: tom, quem faz o solo, em que parte da atuação entra.' },
    { k: 'link', l: 'Ligação do YouTube', type: 'url', hint: 'Opcional. A gravação que aparece ao lado da partitura.' },
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
const ytId = u => (String(u || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/) || [])[1] || null;
const driveId = u => (String(u || '').match(/\/d\/([\w-]+)|[?&]id=([\w-]+)/) || []).slice(1).find(Boolean) || null;
const isPdf = f => f.tipo === 'application/pdf' || /\.pdf$/i.test(f.nome || '');
// O naipe é a última pasta do Drive (por exemplo "Vozes · Sopranos" -> "Sopranos").
const naipeOf = f => (f.grupo || 'Geral').split(' · ').pop();
const NAIPE_ORDEM = [/sopran/i, /mezz/i, /contralt/i];
const naipeRank = n => { const i = NAIPE_ORDEM.findIndex(r => r.test(n)); return i < 0 ? NAIPE_ORDEM.length : i; };
const fileHref = f => f.caminho ? state.urls[f.caminho] : f.url;
// PDF no site (ligação temporária) ou pré-visualização do Drive.
const pdfSrc = f => f.caminho ? state.urls[f.caminho] : (driveId(f.url) ? `https://drive.google.com/file/d/${driveId(f.url)}/preview` : null);
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

const songTools = m => state.manage ? `<div class="item-tools on">
  <button class="tool" data-edit="musicas" data-id="${m.id}">Editar</button>
  <button class="tool danger" data-del="musicas" data-id="${m.id}">Apagar</button></div>` : '';

function renderSongs() {
  const m = state.musicas.find(x => x.id === state.sel);
  $('#resLinks').hidden = $('#songsHead').hidden = Boolean(m);
  return m ? renderSong(m) : renderList();
}

// Só os nomes, agrupados por categoria. Carregar numa música abre-a.
function renderList() {
  const q = state.q.toLowerCase();
  const list = state.musicas.filter(m => !q || m.titulo.toLowerCase().includes(q));
  const search = `<input class="search song-search" id="songSearch" type="search" placeholder="Procurar música" aria-label="Procurar música" value="${esc(state.q)}">`;

  if (!list.length) {
    $('#songs').innerHTML = search + `<div class="empty"><strong>${state.musicas.length ? 'Nenhuma música corresponde.' : 'O repertório ainda está vazio.'}</strong>${
      state.musicas.length ? 'Experimenta outra pesquisa.'
      : state.manage ? 'Carrega em “+ Adicionar música” para começar.' : 'A Direção musical vai juntar aqui as músicas.'}</div>`;
    return;
  }
  $('#songs').innerHTML = search + CATEGORIAS
    .map(c => [c, list.filter(m => m.categoria === c)])
    .filter(([, ms]) => ms.length)
    .map(([c, ms]) => `
      <section class="cat-group">
        <h3 class="cat-title">${c}</h3>
        <ul class="song-list">${ms.map(m => `<li><button class="song-item" data-song="${m.id}">${esc(m.titulo)}<span aria-hidden="true">›</span></button></li>`).join('')}</ul>
      </section>`).join('');
}

// Uma música: escolher o naipe, ver a partitura (PDF) e ouvir a gravação (YouTube).
function renderSong(m) {
  const files = state.ficheiros.filter(f => f.musica_id === m.id);
  const naipes = [...new Set(files.map(naipeOf))].sort((a, b) => naipeRank(a) - naipeRank(b) || a.localeCompare(b, 'pt'));
  if (!naipes.includes(state.naipe)) state.naipe = naipes[0] || null;
  const doNaipe = files.filter(f => naipeOf(f) === state.naipe);
  const pdfs = doNaipe.filter(f => isPdf(f) && pdfSrc(f));
  const others = doNaipe.filter(f => !pdfs.includes(f));
  const pdf = pdfs[Math.min(state.pdf, pdfs.length - 1)];
  const yt = ytId(m.link);

  const partitura = pdf
    ? `${pdfs.length > 1 ? `<div class="bar tight">${pdfs.map((f, i) => `<button class="pill" data-pdf="${i}" aria-pressed="${f === pdf}">${esc(f.nome.replace(/\.pdf$/i, ''))}</button>`).join('')}</div>` : ''}
       <iframe class="pdf-frame" src="${esc(pdfSrc(pdf))}" title="Partitura: ${esc(pdf.nome)}"></iframe>
       ${fileHref(pdf) ? `<a class="song-link" href="${esc(fileHref(pdf))}" target="_blank" rel="noopener">Abrir a partitura em ecrã inteiro <span aria-hidden="true">↗</span></a>` : ''}`
    : `<p class="muted">${files.length ? 'Não há partitura em PDF para este naipe.' : 'Ainda sem ficheiros.'}</p>`;

  const gravacao = yt
    ? `<div class="yt"><iframe src="https://www.youtube-nocookie.com/embed/${yt}" title="Gravação: ${esc(m.titulo)}" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
    : `<p class="muted">Ainda sem gravação no YouTube.${m.link && isUrl(m.link) ? ` <a href="${esc(m.link)}" target="_blank" rel="noopener">Abrir ligação ↗</a>` : ''}</p>`;

  const extra = others.map(f => {
    const url = fileHref(f);
    return `<li class="file"><div class="file-row">
      <span class="file-kind">${kindOf(f)}</span><span class="file-name" title="${esc(f.nome)}">${esc(f.nome)}</span>
      ${url ? `<a class="tool" href="${esc(url)}" target="_blank" rel="noopener">${f.caminho ? 'Abrir' : 'Drive ↗'}</a>` : ''}
      ${state.manage ? `<button class="tool danger" data-delfile="${f.id}">Apagar</button>` : ''}</div>
      ${f.caminho && url && (f.tipo || '').startsWith('audio/') ? `<audio controls preload="none" src="${esc(url)}"></audio>` : ''}
    </li>`;
  }).join('');

  $('#songs').innerHTML = `
    <div class="song-top">
      <button class="back" data-back>← Todas as músicas</button>
      ${songTools(m)}
    </div>
    <h2 class="song-title">${esc(m.titulo)}</h2>
    ${m.notas ? `<p class="song-notes">${esc(m.notas)}</p>` : ''}
    ${naipes.length ? `<div class="bar" role="group" aria-label="Naipe">${naipes.map(n =>
      `<button class="pill big" data-naipe="${esc(n)}" aria-pressed="${n === state.naipe}">${esc(n)}</button>`).join('')}</div>` : ''}
    <div class="viewer">
      <section class="panel"><h3>Partitura</h3>${partitura}</section>
      <section class="panel"><h3>Ouvir</h3>${gravacao}</section>
    </div>
    ${extra ? `<details class="panel more"><summary>Outros ficheiros <small>${others.length}</small></summary><ul class="files">${extra}</ul></details>` : ''}
    ${m.letra ? `<details class="panel more letra"><summary>Letra</summary><div>${esc(m.letra)}</div></details>` : ''}
    ${state.manage ? `<label class="upload"><input type="file" multiple data-upload="${m.id}">+ Adicionar ficheiros (partituras em PDF, áudio…)</label>` : ''}`;
}

function openSong(id) {
  state.sel = id; state.naipe = null; state.pdf = 0;
  const hash = id ? `#m=${id}` : '';
  if (location.hash !== hash) history.pushState(null, '', hash || location.pathname + location.search);
  renderSongs();
  scrollTo({ top: 0 });
}
// Ligação direta e botão "voltar" do navegador: a música aberta fica no endereço (#m=ID).
function fromHash() {
  state.sel = Number((location.hash.match(/^#m=(\d+)$/) || [])[1]) || null;
  state.naipe = null; state.pdf = 0;
  if (state.role) renderSongs();
}
addEventListener('popstate', fromHash);

/* ---------- formulários ---------- */
let current = null;
function openForm(kind, item) {
  const sc = SCHEMAS[kind], v = item || {};
  current = { kind, item };
  const field = x => {
    const id = 'f_' + x.k, val = v[x.k] ?? '';
    let input;
    if (x.type === 'textarea') input = `<textarea id="${id}" name="${x.k}">${esc(val)}</textarea>`;
    else if (x.type === 'select') input = `<select id="${id}" name="${x.k}">${x.opts.map(o => `<option${o === (val || '') ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
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
  if (t.dataset.song) openSong(Number(t.dataset.song));
  else if (t.dataset.back !== undefined) openSong(null);
  else if (t.dataset.naipe) { state.naipe = t.dataset.naipe; state.pdf = 0; renderSongs(); }
  else if (t.dataset.pdf) { state.pdf = Number(t.dataset.pdf); renderSongs(); }
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

fromHash();
start();
