// FE'TUFEISEP: um mural de cartazes, um por edição do festival. O cartaz vira quando se passa o rato
// por cima (no verso, o resumo da edição); ao carregar abre-se a ficha com as tunas a concurso e os prémios.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
const ROT = [-2.4, 1.6, -1, 2.2, -1.8, 1.1, -2.8, 0.8];   // cada cartaz fica ligeiramente torto, como num mural
const ROT_FITA = [-4, 3, -2, 5, -3];

const edicao = e => e.numero ? `${e.numero}.ª edição` : 'Edição';
const ano = e => e.data ? e.data.slice(0, 4) : e.ano ?? '';
const dataLonga = e => e.data
  ? new Date(e.data + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
  : e.ano ? String(e.ano) : '';
// "Melhor Tuna: Tuna X" → ["Melhor Tuna", "Tuna X"]
const premio = p => { const i = String(p).indexOf(':'); return i < 0 ? [p, ''] : [p.slice(0, i).trim(), p.slice(i + 1).trim()]; };

// Começa com as 4 edições mais recentes; ao chegar ao fundo do mural, colam-se mais 4 de cada vez.
const PASSO = 4;
let lista = [], opts = {}, mostradas = PASSO, key = '', aColar = false;

export function renderMural(el, items, o) {
  opts = o;
  lista = [...items].sort((a, b) => (b.numero ?? 0) - (a.numero ?? 0) || String(ano(b)).localeCompare(String(ano(a))) || b.id - a.id);
  // Só redesenha quando as edições ou o modo de edição mudam, para não perder os cartazes já colados.
  const k = JSON.stringify([lista, o.edit]);
  if (k === key) return;
  key = k;
  el.closest('section').hidden = !lista.length && !o.edit;
  if (!lista.length) {
    el.innerHTML = `<li class="empty"><strong>Ainda não há edições.</strong>Carregue em “+ Adicionar edição” e junte o cartaz, as tunas a concurso e os prémios.</li>`;
    atualizarMais();
    return;
  }
  // No modo de edição vêem-se todas, para se poderem gerir.
  const n = o.edit ? lista.length : Math.min(Math.max(mostradas, PASSO), lista.length);
  el.innerHTML = lista.slice(0, n).map((e, i) => cartaz(e, i)).join('');
  atualizarMais();
}

// i: posição no mural (dá a inclinação); j: ordem dentro de um grupo colado agora (-1 se não for colado).
function cartaz(e, i, j = -1) {
  const o = opts;
  const frente = e.cartaz
    ? `<img src="${o.fileUrl(e.cartaz)}" alt="" loading="lazy">`
    : `<span class="poster-vazio"><b>${esc(e.numero ?? '')}</b><span>FE'TUFEISEP</span><small>${esc(ano(e))}</small></span>`;
  return `
    <li class="poster-slot${j < 0 ? ' reveal' : ' novo'}" style="--rot:${ROT[i % ROT.length]}deg;--fita:${ROT_FITA[i % ROT_FITA.length]}deg;--j:${Math.max(j, 0)}">
      <button type="button" class="poster" data-ed="${e.id}" aria-label="${esc(edicao(e))} do FE'TUFEISEP${ano(e) ? `, ${esc(ano(e))}` : ''}. Ver detalhes">
        <span class="poster-in">
          <span class="poster-face frente">${frente}</span>
          <span class="poster-face verso">
            <span class="eyebrow">FE'TUFEISEP</span>
            <b class="verso-n">${esc(edicao(e))}</b>
            <span class="verso-ano">${esc(ano(e))}</span>
            ${e.local ? `<span class="verso-loc">${esc(e.local)}</span>` : ''}
            <span class="verso-num">${(e.tunas || []).length ? `${e.tunas.length} ${e.tunas.length === 1 ? 'tuna' : 'tunas'} a concurso` : ''}</span>
            <span class="verso-cta">Ver detalhes →</span>
          </span>
        </span>
      </button>
      ${o.tools('edicoes', e.id)}
    </li>`;
}

// Cola as 4 edições seguintes no mural, uma a uma.
function colarMais() {
  const el = $('#mural');
  const de = el.querySelectorAll('.poster-slot').length;
  if (aColar || de >= lista.length) return;
  aColar = true;
  const ate = Math.min(de + PASSO, lista.length);
  el.insertAdjacentHTML('beforeend', lista.slice(de, ate).map((e, k) => cartaz(e, de + k, k)).join(''));
  mostradas = ate;
  atualizarMais();
  // Espera que acabem de colar antes de deixar vir as seguintes.
  setTimeout(() => { aColar = false; vigiar(); }, 900);
}

function atualizarMais() {
  const box = $('#muralMais');
  const vistas = $('#mural').querySelectorAll('.poster-slot').length;
  const faltam = lista.length - vistas;
  box.hidden = faltam <= 0 || opts.edit;
  box.querySelector('small').textContent = `${faltam} por ver`;
  vigiar();
}

// Quando o fundo do mural aparece no ecrã, colam-se mais edições.
const observador = 'IntersectionObserver' in window
  ? new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) colarMais(); }, { rootMargin: '0px 0px -12% 0px' })
  : null;
function vigiar() {
  const box = $('#muralMais');
  if (!observador || !box) return;
  observador.disconnect();
  if (!box.hidden) observador.observe(box);
}

function abrir(id, origem) {
  const e = lista.find(x => String(x.id) === String(id));
  if (!e) return;
  const dlg = $('#edDlg');
  const paras = String(e.descricao || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const premios = (e.premios || []).map(premio);
  dlg.innerHTML = `
    <div class="ed-body">
      ${e.cartaz ? `<figure class="ed-cartaz"><img src="${opts.fileUrl(e.cartaz)}" alt="Cartaz da ${esc(edicao(e))} do FE'TUFEISEP"></figure>` : ''}
      <div class="ed-info">
        <p class="eyebrow">FE'TUFEISEP · ${esc(edicao(e))}</p>
        <h3 id="edTitle">${esc(ano(e)) || esc(edicao(e))}</h3>
        <dl class="ed-facts">
          ${dataLonga(e) ? `<div><dt>Data</dt><dd>${esc(dataLonga(e))}</dd></div>` : ''}
          ${e.local ? `<div><dt>Local</dt><dd>${esc(e.local)}</dd></div>` : ''}
        </dl>
        ${paras.map(p => `<p class="ed-txt">${esc(p)}</p>`).join('')}
        ${(e.tunas || []).length ? `
          <h4>Tunas a concurso</h4>
          <ul class="ed-tunas">${e.tunas.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        ${premios.length ? `
          <h4>Prémios</h4>
          <ul class="ed-premios">${premios.map(([p, t]) => `<li><span>${esc(p)}</span><b>${esc(t) || '—'}</b></li>`).join('')}</ul>` : ''}
      </div>
    </div>
    <button type="button" class="ed-fechar" aria-label="Fechar">×</button>`;
  // A janela abre a partir do sítio do cartaz.
  const r = origem.getBoundingClientRect();
  dlg.style.setProperty('--ox', `${r.left + r.width / 2 - innerWidth / 2}px`);
  dlg.style.setProperty('--oy', `${r.top + r.height / 2 - innerHeight / 2}px`);
  dlg.showModal();
  dlg.querySelector('.ed-fechar').focus();
}

document.addEventListener('click', ev => {
  if (ev.target.closest('#muralMaisBtn')) return colarMais();
  const p = ev.target.closest('.poster');
  if (p) return abrir(p.dataset.ed, p);
  const dlg = $('#edDlg');
  // Fecha com o botão ou ao carregar fora da janela.
  if (ev.target.closest('.ed-fechar') || ev.target === dlg) dlg.close();
});
