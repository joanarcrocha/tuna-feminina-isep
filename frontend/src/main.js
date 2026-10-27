import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, fileUrl } from './api.js';
import { mountContact } from './contact.js';
import { askLogin, getRole, signOut, hasReservedArea, ROLE_LABEL } from './auth.js';
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
  carrossel: { title: 'Fotografia da história', fields: [
    { k: 'foto', l: 'Fotografia', type: 'image', req: true },
  ]},
  membros: { title: 'Membro', fields: [
    { k: 'nome', l: 'Nome', req: true },
    { k: 'estado', l: 'Hierarquia', type: 'select', opts: HIERARQUIAS, req: true, hint: 'Só pode haver uma Magíster. Ao escolher uma nova, a anterior passa a Tunante.' },
    { k: 'instrumentos', l: 'Instrumentos', type: 'checks', opts: INSTRUMENTOS },
    { k: 'naipe', l: 'Naipe de voz', type: 'select', opts: NAIPES },
    { k: 'geracao', l: 'Geração', type: 'number', min: 1, max: 99, hint: 'Escreva o número (por exemplo 28). No site aparece em numeração romana (XXVIII).' },
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
const KINDS = ['carrossel', 'membros', 'fotos', 'festivais'];

const state = { info: {}, membros: [], carrossel: [], fotos: [], festivais: [], loaded: false, edit: false, mFiltro: 'Todas', fFiltro: 'Todos', q: '' };

/* ---------- render ---------- */
const allPrizes = f => [...(f.premios || []), ...String(f.outros || '').split(',').map(s => s.trim()).filter(Boolean)];
const initials = m => (m.nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
// Gerações escrevem-se em numeração romana (28 -> XXVIII); o rótulo "Geração" já vem do campo ao lado.
const toRoman = n => [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  .reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
const fmtGeracao = g => g ? toRoman(g) : '—';
const tools = (kind, id, extra = '') => `<div class="item-tools">${extra}<button class="tool" data-edit="${kind}" data-id="${id}">Editar</button><button class="tool danger" data-del="${kind}" data-id="${id}">Apagar</button></div>`;
const fmtDate = d => {
  if (!d) return { big: '—', small: '' };
  const dt = new Date(d + 'T12:00:00');
  if (isNaN(dt)) return { big: esc(d), small: '' };
  return { big: dt.getFullYear(), small: dt.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' }) };
};

function renderStats() {
  const L = state.loaded;
  $('#sFund').textContent = state.info.fundacao || 1991;   // ano que está no emblema
  $('#sMemb').textContent = L ? state.membros.filter(daTuna).length : '—';
  $('#sFest').textContent = L ? state.festivais.length : '—';
  $('#sAnos').textContent = new Date().getFullYear() - (state.info.fundacao || 1991);
}

function renderHistoria() {
  const i = state.info;
  const paras = String(i.historia || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  // O lema aparece no topo do site, por baixo do nome.
  $('#hino').textContent = i.lema ? `“${i.lema}”` : '';
  $('#hino').hidden = !i.lema;
  $('#intro').innerHTML = (paras.length
      ? `<div class="txt">${paras.map(p => `<p>${esc(p)}</p>`).join('')}</div>`
      : `<div class="empty"><strong>A história ainda está por escrever.</strong>Conte como a tuna nasceu, quem a fundou e o que a move. Carregue em “Editar arquivo” para começar.</div>`) +
    `<div class="item-tools"><button class="tool" data-edit="info" data-id="info">Editar texto</button></div>`;

  renderCarrossel();
}

/* ---------- carrossel da história ---------- */
const SLIDE_MS = 5000;
let slideIdx = 0, slideTimer = null, slidePaused = false, carouselKey = '';

function renderCarrossel() {
  const items = [...state.carrossel].sort((a, b) => a.id - b.id);
  // Só redesenha quando as fotos ou o modo de edição mudam, para não interromper a passagem.
  const key = JSON.stringify([items.map(s => [s.id, s.foto]), state.edit]);
  if (key === carouselKey) return;
  carouselKey = key;
  const el = $('#carousel');
  clearInterval(slideTimer);
  if (!items.length) {
    el.classList.add('is-empty');
    el.innerHTML = `<div class="empty"><strong>Ainda não há fotografias.</strong>Carregue em “Editar arquivo” e depois em “+ Adicionar fotografia”. As fotos passam aqui sozinhas.</div>`;
    return;
  }
  el.classList.remove('is-empty');
  if (slideIdx >= items.length) slideIdx = 0;
  el.innerHTML = items.map((s, i) => `
      <figure class="slide${i === slideIdx ? ' on' : ''}" aria-hidden="${i !== slideIdx}">
        <img src="${fileUrl(s.foto)}" alt="Fotografia ${i + 1} da história da tuna"${i ? ' loading="lazy"' : ''}>
        ${tools('carrossel', s.id)}
      </figure>`).join('') +
    (items.length > 1 ? `
      <button class="car-btn prev" data-car="-1" aria-label="Fotografia anterior">‹</button>
      <button class="car-btn next" data-car="1" aria-label="Fotografia seguinte">›</button>
      <div class="dots">${items.map((_, i) => `<button class="dot" data-dot="${i}" aria-label="Fotografia ${i + 1}" aria-current="${i === slideIdx}"></button>`).join('')}</div>` : '');
  startSlides(items.length);
}

function startSlides(n) {
  clearInterval(slideTimer);
  if (n > 1) slideTimer = setInterval(() => { if (!slidePaused && !document.hidden) showSlide(slideIdx + 1); }, SLIDE_MS);
}

function showSlide(i, restart) {
  const slides = document.querySelectorAll('#carousel .slide');
  if (!slides.length) return;
  slideIdx = (i + slides.length) % slides.length;
  slides.forEach((s, k) => { s.classList.toggle('on', k === slideIdx); s.setAttribute('aria-hidden', k !== slideIdx); });
  document.querySelectorAll('#carousel .dot').forEach((d, k) => d.setAttribute('aria-current', k === slideIdx));
  if (restart) startSlides(slides.length);
}

// Pausa enquanto o rato ou o teclado estão no carrossel.
$('#carousel').addEventListener('mouseenter', () => { slidePaused = true; });
$('#carousel').addEventListener('mouseleave', () => { slidePaused = false; });
$('#carousel').addEventListener('focusin', () => { slidePaused = true; });
$('#carousel').addEventListener('focusout', () => { slidePaused = false; });

// As caloiras ainda não pertencem à tuna: o público vê uma mensagem, só quem edita vê a lista.
const CALOIRA = 'Caloira';
const MSG_CALOIRAS = 'As caloiras da TUFEISEP estão a tentar conquistar o seu lugar na Tuna, tenta mais tarde';
const daTuna = m => m.estado !== CALOIRA;
const inFilter = (m, filtro) =>
  filtro === 'Todas' ? daTuna(m) : filtro === 'Tunante' ? m.estado === 'Tunante' || isMagister(m) : m.estado === filtro;

// Ordem da hierarquia: a Magíster primeiro, depois o campo "ordem" (definido no modo de edição).
const byOrder = (a, b) =>
  Number(isMagister(b)) - Number(isMagister(a)) ||
  (a.ordem ?? Infinity) - (b.ordem ?? Infinity) ||
  (a.geracao ?? Infinity) - (b.geracao ?? Infinity) ||
  String(a.nome).localeCompare(b.nome, 'pt');

const moveTools = (m, i, list) => isMagister(m) ? '' : `
  <button class="tool" data-move="-1" data-id="${m.id}" aria-label="Subir ${esc(m.nome)}"${i === 0 || isMagister(list[i - 1]) ? ' disabled' : ''}>↑</button>
  <button class="tool" data-move="1" data-id="${m.id}" aria-label="Descer ${esc(m.nome)}"${i === list.length - 1 ? ' disabled' : ''}>↓</button>`;

let visibleMembers = [];
async function moveMember(id, dir) {
  const list = visibleMembers.filter(m => !isMagister(m));
  const i = list.findIndex(m => String(m.id) === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;

  // Numera toda a hierarquia de seguida (1, 2, 3…) e depois troca os dois vizinhos.
  const changes = new Map();
  [...state.membros].filter(m => !isMagister(m)).sort(byOrder)
    .forEach((m, k) => { if (m.ordem !== k + 1) changes.set(m.id, k + 1); });
  const ordem = m => changes.get(m.id) ?? m.ordem;
  const [a, b] = [list[i], list[j]];
  const [oa, ob] = [ordem(a), ordem(b)];
  changes.set(a.id, ob);
  changes.set(b.id, oa);

  const before = state.membros.map(m => ({ ...m }));
  state.membros = state.membros.map(m => changes.has(m.id) ? { ...m, ordem: changes.get(m.id) } : m);
  render();
  try {
    await api.reorder([...changes].map(([id, ordem]) => ({ id, ordem })));
  } catch (err) {
    state.membros = before;
    render();
    handleError(err);
  }
}

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
    .sort(byOrder);
  visibleMembers = list;
  $('#members').innerHTML = list.length ? list.map((m, i) => `
    <article class="mb reveal${isMagister(m) ? ' is-magister' : ''}">
      <div class="mb-photo">${m.foto ? `<img src="${fileUrl(m.foto)}" alt="${esc(m.nome)}" loading="lazy">` : `<span>${esc(initials(m))}</span>`}${isMagister(m) ? '<span class="badge">Magíster</span>' : ''}</div>
      <div class="mb-body">
        <h3 class="nt">${esc(m.nome)}</h3>
        <dl class="mb-facts">
          <div><dt>${(m.instrumentos || []).length > 1 ? 'Instrumentos' : 'Instrumento'}</dt><dd>${esc((m.instrumentos || []).join(', ')) || '—'}</dd></div>
          <div><dt>Naipe</dt><dd>${esc(m.naipe) || '—'}</dd></div>
          <div><dt>Geração</dt><dd>${fmtGeracao(m.geracao)}</dd></div>
        </dl>
        ${tools('membros', m.id, moveTools(m, i, list))}
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
    return `<li class="fv reveal" data-place="${esc(placeKey(f))}">
      <div class="dt"><b>${d.big}</b>${esc(d.small)}</div>
      <div>
        <h3>${esc(f.nome)}</h3>
        ${f.local ? `<div class="loc">${esc(f.local)}</div>` : ''}
        ${pr.length ? `<p class="prizes">${esc(pr.join(' · '))}</p>` : ''}
        ${f.notas ? `<p class="notes">${esc(f.notas)}</p>` : ''}
        ${tools('festivais', f.id)}
      </div>
    </li>`;
  }).join('')
    : `<li class="empty"><strong>Nenhum festival registado.</strong>Registe cada festival com a data e a cidade.</li>`;
  renderMapa();
}

/* ---------- mapa dos festivais ---------- */
const placeKey = f => String(f.local || '').trim().toLowerCase();
let map = null, mapLayer = null, mapKey = '';
const markers = new Map();

function renderMapa() {
  const el = $('#festMap');
  // Uma marca por cidade, com os festivais que lá aconteceram.
  const places = new Map();
  for (const f of state.festivais) {
    if (!Number.isFinite(f.lat) || !Number.isFinite(f.lng)) continue;
    const k = placeKey(f);
    if (!places.has(k)) places.set(k, { name: f.local, lat: f.lat, lng: f.lng, fests: [] });
    places.get(k).fests.push(f);
  }
  const key = JSON.stringify([...places].map(([k, p]) => [k, p.lat, p.lng, p.fests.map(f => [f.nome, f.data])]));
  if (key === mapKey) return;
  mapKey = key;
  el.hidden = !places.size;
  if (!places.size) return;

  if (!map) {
    map = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
    // Mapa do OpenStreetMap (gratuito, sem chave); o CSS põe-no em tons de cinza.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    mapLayer = L.layerGroup().addTo(map);
  }
  mapLayer.clearLayers();
  markers.clear();
  for (const [k, p] of places) {
    const n = p.fests.length;
    const icon = L.divIcon({ className: 'pin', html: `<span>${n > 1 ? n : ''}</span>`, iconSize: [n > 1 ? 30 : 18, n > 1 ? 30 : 18] });
    const fests = [...p.fests].sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
    const m = L.marker([p.lat, p.lng], { icon, title: p.name })
      .bindPopup(`<strong>${esc(p.name)}</strong><ul>${fests.map(f => `<li>${esc(f.nome)}${f.data ? ` <span>${esc(String(f.data).slice(0, 4))}</span>` : ''}</li>`).join('')}</ul>`)
      .addTo(mapLayer);
    markers.set(k, m);
  }
  const bounds = L.latLngBounds([...places.values()].map(p => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [48, 48], maxZoom: 9 });
  setTimeout(() => map.invalidateSize(), 0);
}

// Passar o rato por um festival realça a cidade no mapa.
$('#fest').addEventListener('mouseover', e => {
  const k = e.target.closest('.fv')?.dataset.place;
  markers.forEach((m, mk) => m.getElement()?.classList.toggle('hot', mk === k));
});
$('#fest').addEventListener('mouseleave', () => markers.forEach(m => m.getElement()?.classList.remove('hot')));

// Procura as coordenadas da cidade no OpenStreetMap quando um festival é guardado.
async function geocode(local) {
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pt,es&q=' + encodeURIComponent(local);
    const [hit] = await (await fetch(url, { headers: { 'Accept-Language': 'pt-PT' } })).json();
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  }
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
  // Cada secção carrega por si: se uma falhar, as outras continuam a aparecer.
  const results = await Promise.allSettled(['info', ...KINDS].map(load));
  const failed = results.filter(r => r.status === 'rejected').length;
  state.loaded = failed < results.length;
  status.textContent = !failed ? 'Arquivo atualizado'
    : state.loaded ? 'Parte do arquivo não carregou. Tente recarregar a página.'
    : 'Não foi possível ligar ao arquivo. Tente recarregar a página.';
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
  if (err?.status === 401) { setEditing(false); signOut().then(updateNav); }
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
    else input = `<input id="${id}" name="${x.k}" type="${x.type || 'text'}" value="${esc(val)}"${x.type === 'number' ? ' inputmode="numeric" min="${x.min ?? 1900}" max="${x.max ?? 2100}"' : ''}${req}>`;
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
    if (kind === 'festivais') {
      // Mantém as coordenadas se a cidade não mudou; senão procura-as de novo.
      const same = item && placeKey(item) === placeKey(data) && Number.isFinite(item.lat);
      const pos = !data.local ? null : same ? { lat: item.lat, lng: item.lng } : await geocode(data.local);
      data.lat = pos?.lat ?? null;
      data.lng = pos?.lng ?? null;
      if (data.local && !pos) toast('Não encontrei esta cidade no mapa. O festival fica guardado na mesma.');
    }
    if (kind === 'info') await api.saveInfo(data);
    else if (item) await api.update(kind, item.id, data);
    else {
      // Um membro novo entra no fim da hierarquia.
      if (kind === 'membros') data.ordem = Math.max(0, ...state.membros.map(m => m.ordem ?? 0)) + 1;
      await api.create(kind, data);
    }
    await load(kind); render();
    $('#dlg').close();
    toast('Guardado no arquivo');
  } catch (ex) {
    if (ex?.status === 401) { $('#dlg').close(); handleError(ex); }
    else showErr(ex?.message || 'Não foi possível guardar. Tente outra vez.');
  } finally { save.disabled = false; save.textContent = 'Guardar'; }
});

/* ---------- sessão ---------- */
// Público: "Entrar". Com sessão: "Área reservada" e "Sair"; a Administração também tem "Editar arquivo".
async function updateNav() {
  const role = await getRole();
  $('#loginBtn').hidden = Boolean(role);
  $('#logoutBtn').hidden = !role;
  $('#reservedLink').hidden = !role || !hasReservedArea;
  $('#editToggle').hidden = role !== 'admin';
  if (role !== 'admin' && state.edit) setEditing(false);
}

$('#loginBtn').addEventListener('click', async () => {
  const role = await askLogin();
  if (!role) return;
  await updateNav();
  toast(`Entraste como ${ROLE_LABEL[role]}.`);
});
$('#logoutBtn').addEventListener('click', async () => {
  await signOut();
  await updateNav();
  toast('Saíste da tua conta.');
});
$('#editToggle').addEventListener('click', () => setEditing(!state.edit));

/* ---------- interações ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.mf) { state.mFiltro = t.dataset.mf; render(); }
  else if (t.dataset.ff) { state.fFiltro = t.dataset.ff; render(); }
  else if (t.dataset.add) openForm(t.dataset.add);
  else if (t.dataset.edit) openForm(t.dataset.edit, t.dataset.edit === 'info' ? state.info : state[t.dataset.edit].find(x => String(x.id) === t.dataset.id));
  else if (t.dataset.del) armDelete(t);
  else if (t.dataset.move) moveMember(t.dataset.id, Number(t.dataset.move));
  else if (t.dataset.car) showSlide(slideIdx + Number(t.dataset.car), true);
  else if (t.dataset.dot) showSlide(Number(t.dataset.dot), true);
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
mountContact();
updateNav();
render();
loadAll();
