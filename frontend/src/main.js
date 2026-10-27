import { api, fileUrl } from './api.js';
import { mountStrings } from './strings.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const INSTRUMENTOS = ['Guitarra', 'Bandolim', 'Cavaquinho', 'Acordeão', 'Flauta transversal', 'Saxofone', 'Percussão', 'Estandarte', 'Pandeireta', 'Contra-baixo'];
const NAIPES = ['Contralto', 'Mezzo', 'Soprano'];
const ESTADOS = ['Veterana', 'Tunante', 'Caloira'];          // separadores da lista
const MAGISTER = 'Magíster';                                 // uma só, e conta como Tunante
const HIERARQUIAS = [MAGISTER, ...ESTADOS];                  // opções do formulário
const isMagister = m => m.estado === MAGISTER;
const PREMIOS = ['Melhor Tuna', '2.ª Melhor Tuna', 'Tuna Mais Tuna', 'Melhor Instrumental', 'Melhor Serenata', 'Melhor Pandeireta', 'Melhor Estandarte', 'Melhor Solista', 'Melhor Original', 'Prémio do Público'];

const SCHEMAS = {
  info: { title: 'Sobre a tuna', fields: [
    { k: 'fundacao', l: 'Ano de fundação', type: 'number' },
    { k: 'lema', l: 'Lema ou frase da tuna' },
    { k: 'historia', l: 'A história', type: 'textarea', hint: 'Separe os parágrafos com uma linha em branco.' },
  ]},
  marcos: { title: 'Marco', fields: [
    { k: 'ano', l: 'Ano', type: 'number', req: true },
    { k: 'titulo', l: 'Título', req: true },
    { k: 'texto', l: 'O que aconteceu', type: 'textarea' },
    { k: 'foto', l: 'Fotografia', type: 'image' },
  ]},
  membros: { title: 'Membro', fields: [
    { k: 'nome', l: 'Nome', req: true },
    { k: 'estado', l: 'Hierarquia', type: 'select', opts: HIERARQUIAS, req: true, hint: 'Só pode haver uma Magíster. Ao escolher uma nova, a anterior passa a Tunante.' },
    { k: 'instrumentos', l: 'Instrumentos', type: 'checks', opts: INSTRUMENTOS },
    { k: 'naipe', l: 'Naipe de voz', type: 'select', opts: NAIPES },
    { k: 'data_entrada', l: 'Ano de entrada na Tuna', type: 'number' },
    { k: 'foto', l: 'Fotografia', type: 'image' },
  ]},
  fotos: { title: 'Fotografia', fields: [
    { k: 'ficheiro', l: 'Imagem', type: 'image', req: true },
    { k: 'legenda', l: 'Legenda' },
    { k: 'ano', l: 'Ano', type: 'number' },
  ]},
  festivais: { title: 'Festival', fields: [
    { k: 'nome', l: 'Nome do festival', req: true },
    { k: 'local', l: 'Cidade' },
    { k: 'data', l: 'Data', type: 'date' },
    { k: 'premios', l: 'Prémios', type: 'checks', opts: PREMIOS },
    { k: 'outros', l: 'Outros prémios', hint: 'Separados por vírgulas.' },
    { k: 'notas', l: 'Notas', type: 'textarea' },
  ]},
};
const KINDS = ['marcos', 'membros', 'fotos', 'festivais'];

const state = { info: {}, membros: [], marcos: [], fotos: [], festivais: [], loaded: false, edit: false, mFiltro: 'Todas', fFiltro: 'Todos', q: '' };

/* ---------- render ---------- */
const allPrizes = f => [...(f.premios || []), ...String(f.outros || '').split(',').map(s => s.trim()).filter(Boolean)];
const initials = m => (m.nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const fmtEntrada = ano => ano ? esc(ano) : '—';
const tools = (kind, id) => `<div class="item-tools"><button class="tool" data-edit="${kind}" data-id="${id}">Editar</button><button class="tool danger" data-del="${kind}" data-id="${id}">Apagar</button></div>`;
const fmtDate = d => {
  if (!d) return { big: '—', small: '' };
  const dt = new Date(d + 'T12:00:00');
  if (isNaN(dt)) return { big: esc(d), small: '' };
  return { big: dt.getFullYear(), small: dt.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' }) };
};

function renderStats() {
  const L = state.loaded;
  $('#sFund').textContent = state.info.fundacao || '—';
  $('#sMemb').textContent = L ? state.membros.filter(daTuna).length : '—';
  $('#sFest').textContent = L ? state.festivais.length : '—';
  $('#sPrem').textContent = L ? state.festivais.reduce((n, f) => n + allPrizes(f).length, 0) : '—';
}

function renderHistoria() {
  const i = state.info;
  const paras = String(i.historia || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  $('#intro').innerHTML = (i.lema ? `<p class="lema">“${esc(i.lema)}”</p>` : '') +
    (paras.length
      ? `<div class="txt">${paras.map(p => `<p>${esc(p)}</p>`).join('')}</div>`
      : `<div class="empty"><strong>A história ainda está por escrever.</strong>Conte como a tuna nasceu, quem a fundou e o que a move. Carregue em “Editar arquivo” para começar.</div>`) +
    `<div class="item-tools"><button class="tool" data-edit="info" data-id="info">Editar texto</button></div>`;

  const ms = [...state.marcos].sort((a, b) => (a.ano || 0) - (b.ano || 0));
  $('#timeline').innerHTML = ms.length ? ms.map(m => `
    <li class="mk reveal">
      <div class="ano">${esc(m.ano)}</div>
      <div>
        <h3>${esc(m.titulo)}</h3>
        ${m.texto ? `<p>${esc(m.texto)}</p>` : ''}
        ${m.foto ? `<img src="${fileUrl(m.foto)}" alt="${esc(m.titulo)}" loading="lazy">` : ''}
        ${tools('marcos', m.id)}
      </div>
    </li>`).join('')
    : `<li class="empty"><strong>Sem marcos registados.</strong>A fundação, o primeiro festival, a primeira digressão: cada ano importante tem lugar aqui.</li>`;
}

// As caloiras ainda não pertencem à tuna: o público vê uma mensagem, só quem edita vê a lista.
const CALOIRA = 'Caloira';
const MSG_CALOIRAS = 'As caloiras da TUFEISEP estão a tentar conquistar o seu lugar na Tuna, tenta mais tarde';
const daTuna = m => m.estado !== CALOIRA;
const inFilter = (m, filtro) =>
  filtro === 'Todas' ? daTuna(m) : filtro === 'Tunante' ? m.estado === 'Tunante' || isMagister(m) : m.estado === filtro;

function renderMembros() {
  const counts = { Todas: state.membros.filter(daTuna).length };
  ESTADOS.forEach(e => counts[e] = state.membros.filter(m => inFilter(m, e)).length);
  const showCount = e => e !== CALOIRA || state.edit;
  $('#mFilter').innerHTML = ['Todas', ...ESTADOS].map(e =>
    `<button class="pill" data-mf="${e}" aria-pressed="${state.mFiltro === e}">${e === 'Todas' ? 'Todas' : e + 's'}${showCount(e) ? `<small>${counts[e]}</small>` : ''}</button>`).join('') +
    `<input class="search" id="mSearch" type="search" placeholder="Procurar por nome ou instrumento" aria-label="Procurar membros" value="${esc(state.q)}">`;

  if (state.mFiltro === CALOIRA && !state.edit) {
    $('#members').innerHTML = `<div class="caloiras" style="grid-column:1/-1"><p>${MSG_CALOIRAS}</p></div>`;
    return;
  }

  const q = state.q.toLowerCase();
  const list = state.membros
    .filter(m => inFilter(m, state.mFiltro))
    .filter(m => !q || [m.nome, m.naipe, ...(m.instrumentos || [])].join(' ').toLowerCase().includes(q))
    .sort((a, b) => Number(isMagister(b)) - Number(isMagister(a)) || String(a.data_entrada || '9999').localeCompare(String(b.data_entrada || '9999')) || String(a.nome).localeCompare(b.nome, 'pt'));
  $('#members').innerHTML = list.length ? list.map(m => `
    <article class="mb reveal${isMagister(m) ? ' is-magister' : ''}">
      <div class="mb-photo">${m.foto ? `<img src="${fileUrl(m.foto)}" alt="${esc(m.nome)}" loading="lazy">` : `<span>${esc(initials(m))}</span>`}${isMagister(m) ? '<span class="badge">Magíster</span>' : ''}</div>
      <div class="mb-body">
        <h3 class="nt">${esc(m.nome)}</h3>
        <dl class="mb-facts">
          <div><dt>${(m.instrumentos || []).length > 1 ? 'Instrumentos' : 'Instrumento'}</dt><dd>${esc((m.instrumentos || []).join(', ')) || '—'}</dd></div>
          <div><dt>Naipe</dt><dd>${esc(m.naipe) || '—'}</dd></div>
          <div><dt>Entrada</dt><dd>${fmtEntrada(m.data_entrada)}</dd></div>
        </dl>
        ${tools('membros', m.id)}
      </div>
    </article>`).join('')
    : `<div class="empty" style="grid-column:1/-1"><strong>${state.membros.length ? 'Ninguém corresponde a este filtro.' : 'Ainda não há membros no arquivo.'}</strong>${state.membros.length ? 'Experimente outra hierarquia ou outra pesquisa.' : 'Adicione cada membro com a fotografia, os instrumentos, o naipe e a data de entrada.'}</div>`;
}

let visiblePhotos = [];
function renderFotos() {
  const anos = [...new Set(state.fotos.map(f => f.ano).filter(Boolean))].sort((a, b) => b - a);
  $('#fFilter').innerHTML = state.fotos.length ? ['Todos', ...anos].map(a =>
    `<button class="pill" data-ff="${a}" aria-pressed="${String(state.fFiltro) === String(a)}">${a}</button>`).join('') : '';
  visiblePhotos = state.fotos
    .filter(f => state.fFiltro === 'Todos' || String(f.ano) === String(state.fFiltro))
    .sort((a, b) => (b.ano || 0) - (a.ano || 0) || b.id - a.id);
  $('#gallery').innerHTML = visiblePhotos.length ? visiblePhotos.map((f, i) => `
    <figure class="ph reveal">
      <button class="open" data-lb="${i}" aria-label="Abrir ${esc(f.legenda || 'fotografia')}">
        <img src="${fileUrl(f.ficheiro)}" alt="${esc(f.legenda || '')}" loading="lazy">
      </button>
      ${(f.legenda || f.ano) ? `<figcaption><span>${esc(f.legenda)}</span><span>${esc(f.ano)}</span></figcaption>` : ''}
      ${tools('fotos', f.id)}
    </figure>`).join('')
    : `<div class="empty"><strong>A galeria está vazia.</strong>Carregue fotografias de atuações, serenatas e viagens, com legenda e ano.</div>`;
  $('#gallery').querySelectorAll('img').forEach(img => img.addEventListener('error', () => {
    img.replaceWith(Object.assign(document.createElement('div'), { className: 'broken', textContent: 'Imagem indisponível' }));
  }, { once: true }));
}

function renderFestivais() {
  const list = [...state.festivais].sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  $('#fest').innerHTML = list.length ? list.map(f => {
    const d = fmtDate(f.data), pr = allPrizes(f);
    return `<li class="fv reveal">
      <div class="dt"><b>${d.big}</b>${esc(d.small)}</div>
      <div>
        <h3>${esc(f.nome)}</h3>
        ${f.local ? `<div class="loc">${esc(f.local)}</div>` : ''}
        ${pr.length ? `<div class="prizes">${pr.map(p => `<span class="tag">${esc(p)}</span>`).join('')}</div>` : ''}
        ${f.notas ? `<p class="notes">${esc(f.notas)}</p>` : ''}
        ${tools('festivais', f.id)}
      </div>
      <div class="count">${pr.length || '—'}<small>${pr.length === 1 ? 'prémio' : 'prémios'}</small></div>
    </li>`;
  }).join('')
    : `<li class="empty"><strong>Nenhum festival registado.</strong>Registe cada festival com a data, a cidade e os prémios ganhos.</li>`;
}

function render() {
  const focused = document.activeElement?.id === 'mSearch';
  const pos = focused ? document.activeElement.selectionStart : 0;
  renderStats(); renderHistoria(); renderMembros(); renderFotos(); renderFestivais();
  if (focused) { const s = $('#mSearch'); s.focus(); s.setSelectionRange(pos, pos); }
}

/* ---------- dados ---------- */
async function load(kind) {
  if (kind === 'info') state.info = await api.info();
  else state[kind] = await api.list(kind);
}

async function loadAll() {
  const status = $('#status');
  try {
    await Promise.all(['info', ...KINDS].map(load));
    state.loaded = true;
    status.textContent = 'Arquivo atualizado';
  } catch {
    status.textContent = 'Não foi possível ligar ao arquivo. Tente recarregar a página.';
  }
  render();
}

/* ---------- edição ---------- */
function setEditing(on) {
  state.edit = on;
  document.body.classList.toggle('editing', on);
  $('#editToggle').setAttribute('aria-pressed', on);
  $('#editToggle').textContent = on ? 'Concluir edição' : 'Editar arquivo';
  render();
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600);
}

function handleError(err) {
  if (err?.status === 401) { api.logout(); setEditing(false); }
  toast(err?.message || 'Não foi possível guardar. Tente outra vez.');
}

async function armDelete(btn) {
  if (!btn.classList.contains('armed')) {
    btn.classList.add('armed'); btn.textContent = 'Confirmar';
    setTimeout(() => { btn.classList.remove('armed'); btn.textContent = 'Apagar'; }, 3500);
    return;
  }
  const kind = btn.dataset.del;
  try {
    await api.remove(kind, btn.dataset.id);
    await load(kind); render();
    toast('Apagado');
  } catch (err) { handleError(err); }
}

let current = null;
function openForm(kind, item) {
  const sc = SCHEMAS[kind], v = item || {};
  current = { kind, item };
  const field = x => {
    const id = 'f_' + x.k, val = v[x.k] ?? '';
    const req = x.req ? ' required' : '';
    let input;
    if (x.type === 'textarea') input = `<textarea id="${id}" name="${x.k}"${req}>${esc(val)}</textarea>`;
    else if (x.type === 'select') input = `<select id="${id}" name="${x.k}"><option value="">—</option>${x.opts.map(o => `<option${o === val ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    else if (x.type === 'checks') return `<div class="field"><span class="lb">${x.l}</span><div class="checks">${x.opts.map((o, i) =>
        `<label for="${id}_${i}"><input type="checkbox" id="${id}_${i}" name="${x.k}" value="${o}"${(v[x.k] || []).includes(o) ? ' checked' : ''}>${o}</label>`).join('')}</div></div>`;
    else if (x.type === 'image') input = `<input type="file" id="${id}" name="${x.k}" accept="image/jpeg,image/png,image/webp,image/gif">` + (val ? `<span class="hint">Já tem imagem. Escolha outra para substituir.</span>` : '');
    else input = `<input id="${id}" name="${x.k}" type="${x.type || 'text'}" value="${esc(val)}"${x.type === 'number' ? ' inputmode="numeric" min="1900" max="2100"' : ''}${req}>`;
    return `<div class="field"><label for="${id}">${x.l}${x.req ? ' *' : ''}</label>${input}${x.hint ? `<span class="hint">${x.hint}</span>` : ''}</div>`;
  };
  $('#form').innerHTML = `<h3>${item ? 'Editar' : 'Novo'} · ${sc.title.toLowerCase()}</h3>${sc.fields.map(field).join('')}
    <p class="form-err" id="formErr" hidden></p>
    <div class="actions"><button type="button" class="btn" id="cancel">Cancelar</button><button type="submit" class="btn primary" id="save">Guardar</button></div>`;
  $('#cancel').onclick = () => $('#dlg').close();
  $('#dlg').showModal();
  $('#form').querySelector('input:not([type=file]),textarea,select')?.focus();
}

$('#form').addEventListener('submit', async e => {
  e.preventDefault();
  const { kind, item } = current, sc = SCHEMAS[kind], fd = new FormData($('#form'));
  const err = $('#formErr'), save = $('#save');
  const showErr = msg => { err.textContent = msg; err.hidden = false; };
  const missing = sc.fields.find(x => x.req && x.type !== 'image' && !String(fd.get(x.k) || '').trim());
  if (missing) return showErr(`Preencha o campo “${missing.l}”.`);
  const imgMissing = sc.fields.find(x => x.req && x.type === 'image' && !item?.[x.k] && !fd.get(x.k)?.size);
  if (imgMissing) return showErr('Escolha uma imagem.');

  save.disabled = true; save.textContent = 'A guardar…'; err.hidden = true;
  try {
    const data = {};
    for (const x of sc.fields) {
      if (x.type === 'image') {
        const file = fd.get(x.k);
        data[x.k] = file?.size ? (await api.upload(file)).ficheiro : item?.[x.k] ?? null;
      } else if (x.type === 'checks') data[x.k] = fd.getAll(x.k);
      else if (x.type === 'number') { const n = parseInt(fd.get(x.k), 10); data[x.k] = Number.isFinite(n) ? n : null; }
      else data[x.k] = String(fd.get(x.k) || '').trim() || null;
    }
    if (kind === 'info') await api.saveInfo(data);
    else if (item) await api.update(kind, item.id, data);
    else await api.create(kind, data);
    await load(kind); render();
    $('#dlg').close();
    toast('Guardado no arquivo');
  } catch (ex) {
    if (ex?.status === 401) { $('#dlg').close(); handleError(ex); }
    else showErr(ex?.message || 'Não foi possível guardar. Tente outra vez.');
  } finally { save.disabled = false; save.textContent = 'Guardar'; }
});

/* ---------- login ---------- */
$('#editToggle').hidden = false;
$('#editToggle').addEventListener('click', async () => {
  if (state.edit) return setEditing(false);
  if (await api.hasSession()) return setEditing(true);
  $('#loginErr').hidden = true; $('#loginPass').value = '';
  $('#login').showModal();
});
$('#loginCancel').onclick = () => $('#login').close();
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const pass = $('#loginPass').value;
  try {
    await api.login(pass);
    $('#login').close();
    setEditing(true);
  } catch (err) {
    $('#loginErr').textContent = err.message; $('#loginErr').hidden = false;
  }
});

/* ---------- interações ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.mf) { state.mFiltro = t.dataset.mf; render(); }
  else if (t.dataset.ff) { state.fFiltro = t.dataset.ff; render(); }
  else if (t.dataset.add) openForm(t.dataset.add);
  else if (t.dataset.edit) openForm(t.dataset.edit, t.dataset.edit === 'info' ? state.info : state[t.dataset.edit].find(x => String(x.id) === t.dataset.id));
  else if (t.dataset.del) armDelete(t);
  else if (t.dataset.lb) openLb(+t.dataset.lb);
});
document.addEventListener('input', e => { if (e.target.id === 'mSearch') { state.q = e.target.value; render(); } });

/* ---------- lightbox ---------- */
let lbI = 0;
function openLb(i) { lbI = i; showLb(); if (!$('#lb').open) $('#lb').showModal(); }
function showLb() {
  const f = visiblePhotos[lbI];
  if (!f) return;
  $('#lbImg').src = fileUrl(f.ficheiro); $('#lbImg').alt = f.legenda || '';
  $('#lbCap').textContent = f.legenda || '';
  $('#lbMeta').textContent = `${f.ano || ''}  ${lbI + 1} / ${visiblePhotos.length}`;
}
const step = d => { lbI = (lbI + d + visiblePhotos.length) % visiblePhotos.length; showLb(); };
$('#lbPrev').onclick = () => step(-1);
$('#lbNext').onclick = () => step(1);
$('#lbClose').onclick = () => $('#lb').close();
$('#lb').addEventListener('keydown', e => { if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1); });
$('#lb').addEventListener('click', e => { if (e.target.id === 'lb') $('#lb').close(); });

mountStrings($('#strings'), $('.hero'));
render();
loadAll();
