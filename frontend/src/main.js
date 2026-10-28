import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, fileUrl } from './api.js';
import { mountContact } from './contact.js';
import { askLogin, getRole, signOut, hasReservedArea, ROLE_LABEL } from './auth.js';
import { mountStrings } from './strings.js';
import { renderTimeline as drawTimeline } from './timeline.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const INSTRUMENTOS = ['Guitarra', 'Bandolim', 'Cavaquinho', 'Violino', 'Acordeão', 'Flauta transversal', 'Saxofone', 'Percussão', 'Estandarte', 'Pandeireta', 'Contra-baixo'];
const NAIPES = ['Contralto', 'Mezzo', 'Soprano'];
const INATIVA = 'Tunante Inativa';
const ESTADOS = ['Tunante', INATIVA, 'Caloira'];             // separadores da lista (a Veterana fica de fora até haver alguma)
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
    { k: 'titulo', l: 'Título', req: true, hint: 'Por exemplo: Fundação, Primeiro festival, 1.º prémio.' },
    { k: 'texto', l: 'Descrição', type: 'textarea' },
    { k: 'fotos', l: 'Fotografias', type: 'images', hint: 'Pode escolher várias de uma vez. No site aumentam quando se passa o rato por cima.' },
  ]},
  carrossel: { title: 'Fotografia da história', fields: [
    { k: 'foto', l: 'Fotografia', type: 'image', req: true },
  ]},
  membros: { title: 'Membro', fields: [
    { k: 'nome', l: 'Nome', req: true },
    { k: 'estado', l: 'Hierarquia', type: 'select', opts: HIERARQUIAS, req: true, hint: 'Só pode haver uma Magíster. Ao escolher uma nova, a anterior passa a Tunante.' },
    { k: 'instrumentos', l: 'Instrumentos', type: 'checks', opts: INSTRUMENTOS },
    { k: 'naipe', l: 'Naipe de voz', type: 'select', opts: NAIPES },
    { k: 'geracao', l: 'Geração', type: 'number', min: -3, max: 99, hint: 'Escreva o número (por exemplo 28). No site aparece em numeração romana (XXVIII). As gerações antes da primeira são 0, -1 e -2; as Fundadoras são -3.' },
    { k: 'foto', l: 'Fotografia', type: 'image' },
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
const KINDS = ['marcos', 'carrossel', 'membros', 'festivais'];

const FEST_PASSO = 10; // festivais visíveis de cada vez; "Mostrar mais" revela mais 10
const state = { gerVistas: 1, festLimite: FEST_PASSO, info: {}, marcos: [], membros: [], carrossel: [], festivais: [], loaded: false, edit: false, mFiltro: 'Todas', q: '' };

/* ---------- render ---------- */
const allPrizes = f => [...(f.premios || []), ...String(f.outros || '').split(',').map(s => s.trim()).filter(Boolean)];
const initials = m => (m.nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
// Gerações escrevem-se em numeração romana (28 -> XXVIII); o rótulo "Geração" já vem do campo ao lado.
const toRoman = n => [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  .reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
// Antes da 1.ª geração vêm a 0, a -1, a -2 e as Fundadoras (guardadas como -3); estas ficam em algarismos.
const FUNDADORAS = -3;
const fmtGeracao = g => g == null ? '—' : g === FUNDADORAS ? 'Fundadoras' : g > 0 ? toRoman(g) : String(g);
const tituloGeracao = g => g == null ? 'Sem geração' : g === FUNDADORAS ? 'Fundadoras' : `Geração ${fmtGeracao(g)}`;
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
  renderTimeline();
}

/* ---------- linha temporal ---------- */
const renderTimeline = () => drawTimeline($('#timeline'), state.marcos, { edit: state.edit, tools, fileUrl });

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
const daTuna = m => m.estado !== CALOIRA && m.estado !== INATIVA;   // tunantes em atividade: as caloiras e as inativas têm o seu separador
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

let gerObserver = null, ultimoFiltro = null;
// Só prende ao topo ("empilha") os cartões que cabem no ecrã; um cartão mais alto que o ecrã ficaria com o fim escondido.
const ajustarPilha = () => requestAnimationFrame(() => document.querySelectorAll('.ger-card').forEach(c => c.classList.toggle('fixa', c.offsetHeight < innerHeight - 170)));
addEventListener('resize', () => { clearTimeout(ajustarPilha.t); ajustarPilha.t = setTimeout(ajustarPilha, 200); });
function renderMembros() {
  gerObserver?.disconnect();
  if (state.mFiltro !== ultimoFiltro) { ultimoFiltro = state.mFiltro; state.gerVistas = 1; }
  // Tunantes Inativas: cartões pequenos, sem fotografia.
  $('#members').classList.toggle('compact', state.mFiltro === INATIVA);
  const counts = { Todas: state.membros.filter(daTuna).length };
  ESTADOS.forEach(e => counts[e] = state.membros.filter(m => inFilter(m, e)).length);
  const showCount = e => e !== CALOIRA || state.edit;
  $('#mFilter').innerHTML = ['Todas', ...ESTADOS].map(e =>
    `<button class="pill" data-mf="${e}" aria-pressed="${state.mFiltro === e}">${e === 'Todas' ? 'Todas' : e === INATIVA ? 'Tunantes Inativas' : e + 's'}${showCount(e) ? `<small>${counts[e]}</small>` : ''}</button>`).join('') +
    `<input class="search" id="mSearch" type="search" placeholder="Procurar por nome ou instrumento" aria-label="Procurar membros" value="${esc(state.q)}">`;

  if (state.mFiltro === CALOIRA && !state.edit) {
    $('#members').innerHTML = `<div class="caloiras" style="grid-column:1/-1"><p>${MSG_CALOIRAS}</p></div>`;
    return;
  }

  const q = state.q.toLowerCase();
  const porGeracao = state.mFiltro === INATIVA;
  const list = state.membros
    .filter(m => inFilter(m, state.mFiltro))
    .filter(m => !q || [m.nome, m.naipe, ...(m.instrumentos || [])].join(' ').toLowerCase().includes(q))
    .sort(porGeracao ? (a, b) => (b.geracao ?? -Infinity) - (a.geracao ?? -Infinity) || byOrder(a, b) : byOrder);
  visibleMembers = list;
  // Tunantes Inativas: divididas por geração (a mais recente primeiro); sem setas de ordem, a ordem é a da geração.
  const card = (m, i) => `
    <article class="mb reveal${isMagister(m) ? ' is-magister' : ''}${porGeracao ? ' compact' : ''}">
      ${porGeracao ? '' : `<div class="mb-photo">${m.foto ? `<img src="${fileUrl(m.foto)}" alt="${esc(m.nome)}" loading="lazy">` : `<span>${esc(initials(m))}</span>`}${isMagister(m) ? '<span class="badge">Magíster</span>' : ''}</div>`}
      <div class="mb-body">
        <h3 class="nt">${esc(m.nome)}</h3>
        <dl class="mb-facts">
          <div><dt>${(m.instrumentos || []).length > 1 ? 'Instrumentos' : 'Instrumento'}</dt><dd>${esc((m.instrumentos || []).join(', ')) || '—'}</dd></div>
          <div><dt>Naipe</dt><dd>${esc(m.naipe) || '—'}</dd></div>
          ${porGeracao ? '' : `<div><dt>Geração</dt><dd>${fmtGeracao(m.geracao)}</dd></div>`}
        </dl>
        ${tools('membros', m.id, porGeracao ? '' : moveTools(m, i, list))}
      </div>
    </article>`;
  // Cada geração é um cartão. Aparece uma de cada vez: a seguinte surge, com animação, quando se desce até ao fim
  // (ou se carrega em "Próxima geração"), para a secção não ficar enorme. Com pesquisa ativa mostram-se todas.
  const gruposGer = [];
  if (porGeracao) list.forEach(m => {
    const g = m.geracao ?? null;
    let x = gruposGer.at(-1);
    if (!x || x.g !== g) gruposGer.push(x = { g, ms: [] });
    x.ms.push(m);
  });
  // Cartões empilhados: cada um fica um pouco rodado e deslocado, e o seguinte desliza por cima do anterior.
  const cartaoGer = ({ g, ms }, i, novo) => `
    <section class="ger-card${novo ? ' novo' : ''}" style="--i:${i};--rot:${i % 2 ? .6 : -.6}deg;--dx:${i % 2 ? 6 : -6}px">
      <h3 class="ger-title">${tituloGeracao(g)}<small>${ms.length} ${ms.length === 1 ? 'tunante' : 'tunantes'}</small></h3>
      <div class="ger-grid">${ms.map(m => card(m, 0)).join('')}</div>
    </section>`;
  const mostrarGeracoes = () => {
    const box = $('#members');
    const todas = Boolean(q);
    const n = todas ? gruposGer.length : Math.min(Math.max(state.gerVistas, 1), gruposGer.length);
    box.innerHTML = gruposGer.slice(0, n).map((g, i) => cartaoGer(g, i)).join('') +
      (n < gruposGer.length ? `<div class="ger-more" id="gerMore"><button class="btn" data-ger-next>Próxima geração <small>${gruposGer.length - n} por ver</small></button></div>` : '');
    ajustarPilha();
    const mais = $('#gerMore');
    if (!mais) return;
    const seguinte = () => {
      if (state.gerVistas >= gruposGer.length) return;
      gerObserver?.disconnect();
      state.gerVistas++;
      mais.insertAdjacentHTML('beforebegin', cartaoGer(gruposGer[state.gerVistas - 1], state.gerVistas - 1, true));
      ajustarPilha();
      if (state.gerVistas >= gruposGer.length) mais.remove();
      else {
        mais.querySelector('small').textContent = `${gruposGer.length - state.gerVistas} por ver`;
        gerObserver.observe(mais);
      }
    };
    mais.querySelector('button').addEventListener('click', seguinte);
    gerObserver = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) seguinte(); }, { rootMargin: '0px 0px -10% 0px' });
    gerObserver.observe(mais);
  };
  if (porGeracao && list.length) { mostrarGeracoes(); return; }
  $('#members').innerHTML = list.length ? list.map(card).join('')
    : `<div class="empty" style="grid-column:1/-1"><strong>${state.membros.length ? 'Ninguém corresponde a este filtro.' : 'Ainda não há membros no arquivo.'}</strong>${state.membros.length ? 'Experimente outra hierarquia ou outra pesquisa.' : 'Adicione cada membro com a fotografia, os instrumentos, o naipe e a data de entrada.'}</div>`;
}

function renderFestivais() {
  const list = [...state.festivais].sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  const visiveis = list.slice(0, state.festLimite), restantes = list.length - visiveis.length;
  $('#fest').innerHTML = list.length ? visiveis.map(f => {
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
  }).join('') + (restantes > 0
    ? `<li class="fest-more"><button class="btn" data-more="festivais">Mostrar mais <small>${restantes} por ver</small></button></li>` : '')
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
  renderStats(); renderHistoria(); renderMembros(); renderFestivais();
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
    const id = 'f_' + x.k, val = v[x.k] ?? (x.type === 'images' ? [] : '');
    const req = x.req ? ' required' : '';
    let input;
    if (x.type === 'textarea') input = `<textarea id="${id}" name="${x.k}"${req}>${esc(val)}</textarea>`;
    else if (x.type === 'select') input = `<select id="${id}" name="${x.k}"><option value="">—</option>${x.opts.map(o => `<option${o === val ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    else if (x.type === 'checks') return `<div class="field"><span class="lb">${x.l}</span><div class="checks">${x.opts.map((o, i) =>
        `<label for="${id}_${i}"><input type="checkbox" id="${id}_${i}" name="${x.k}" value="${o}"${(v[x.k] || []).includes(o) ? ' checked' : ''}>${o}</label>`).join('')}</div></div>`;
    else if (x.type === 'images') input = `<input type="file" id="${id}" name="${x.k}" multiple accept="image/jpeg,image/png,image/webp,image/gif">` +
      (val.length ? `<div class="keep">${val.map(fx => `<label><img src="${fileUrl(fx)}" alt=""><span><input type="checkbox" name="${x.k}_remover" value="${esc(fx)}"> Remover</span></label>`).join('')}</div>` : '');
    else if (x.type === 'image') input = `<input type="file" id="${id}" name="${x.k}" accept="image/jpeg,image/png,image/webp,image/gif">` + (val ? `<span class="hint">Já tem imagem. Escolha outra para substituir.</span>` : '');
    else input = `<input id="${id}" name="${x.k}" type="${x.type || 'text'}" value="${esc(val)}"${x.type === 'number' ? ` inputmode="numeric" min="${x.min ?? 1900}" max="${x.max ?? 2100}"` : ''}${req}>`;
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
      } else if (x.type === 'images') {
        // As que ficam (sem "Remover") e depois as novas, pela ordem em que foram escolhidas.
        const remover = fd.getAll(x.k + '_remover');
        const novas = [];
        for (const file of fd.getAll(x.k).filter(fl => fl?.size)) novas.push((await api.upload(file)).ficheiro);
        data[x.k] = [...(item?.[x.k] || []).filter(fx => !remover.includes(fx)), ...novas];
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
  if (t.dataset.more === 'festivais') { state.festLimite += FEST_PASSO; renderFestivais(); }
  else if (t.dataset.mf) { state.mFiltro = t.dataset.mf; render(); }
  else if (t.dataset.add) openForm(t.dataset.add);
  else if (t.dataset.edit) openForm(t.dataset.edit, t.dataset.edit === 'info' ? state.info : state[t.dataset.edit].find(x => String(x.id) === t.dataset.id));
  else if (t.dataset.del) armDelete(t);
  else if (t.dataset.move) moveMember(t.dataset.id, Number(t.dataset.move));
  else if (t.dataset.car) showSlide(slideIdx + Number(t.dataset.car), true);
  else if (t.dataset.dot) showSlide(Number(t.dataset.dot), true);
});
document.addEventListener('input', e => { if (e.target.id === 'mSearch') { state.q = e.target.value; render(); } });

mountStrings($('#strings'), $('.hero'));
mountContact();
updateNav();
render();
loadAll();
