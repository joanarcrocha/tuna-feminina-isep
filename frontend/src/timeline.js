// Linha temporal da história, na horizontal: ao descer a página, a secção fica parada no ecrã e o
// caminho ondulado anda para o lado e vai-se desenhando. Os marcos ficam alternadamente por cima e por
// baixo da linha; o ponto acende quando a linha lá chega e o cartão aparece. As fotografias são
// miniaturas que só aumentam com o rato por cima (ou com um toque, no telemóvel).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 1991-11-11 → "11 de novembro"
const diaMes = d => new Date(d + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const HEAD = `<h3>O nosso <em class="s">caminho</em></h3>`;
const ADD = `<button class="add" data-add="marcos">+ Adicionar marco</button>`;

let el = null, view = null, strip = null, svg = null, track = null, line = null, head = null;
let total = 0, samples = [], dots = [], frame = 0, key = '', dist = 0, navH = 0;

export function renderTimeline(box, items, { edit, tools, fileUrl }) {
  el = box;
  // Por data; um marco só com ano fica no início desse ano.
  const quando = m => m.data || `${String(m.ano ?? 0).padStart(4, '0')}-00-00`;
  const list = [...items].sort((a, b) => quando(a).localeCompare(quando(b)) || a.id - b.id);
  // Só redesenha quando os marcos ou o modo de edição mudam, para não repetir as animações.
  const k = JSON.stringify([list, edit]);
  if (k === key) return;
  key = k;
  el.closest('.tl-wrap').hidden = !list.length && !edit;
  if (!list.length) {
    el.classList.add('vazio');
    el.style.height = '';
    el.innerHTML = `<div class="tl-head">${HEAD}${ADD}</div>
      <div class="empty"><strong>Ainda não há marcos.</strong>Carregue em “+ Adicionar marco” para começar pela fundação, a 11 de novembro de 1991.</div>`;
    svg = null;
    return;
  }

  el.classList.remove('vazio');
  el.innerHTML = `
    <div class="tl-stage">
      <div class="tl-head">${HEAD}<span class="tl-hint" aria-hidden="true">Desça para percorrer <b>→</b></span>${ADD}</div>
      <div class="tl-view">
        <div class="tl-strip">
          <svg class="tl-svg" aria-hidden="true">
            <path class="tl-track"/><path class="tl-line"/>
            <g class="tl-head-dot"><circle class="tl-pulse" r="7"/><circle r="5"/></g>
          </svg>
          <ol class="tl-list">${list.map((m, i) => {
            const fotos = m.fotos?.length ? m.fotos : m.foto ? [m.foto] : [];
            const paras = String(m.texto || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
            return `
            <li class="tl-item ${i % 2 ? 'baixo' : 'cima'}">
              <span class="tl-dot"></span>
              <article class="tl-card">
                <p class="tl-ano">${esc(m.data ? m.data.slice(0, 4) : m.ano)}${m.data ? `<small>${esc(diaMes(m.data))}</small>` : ''}</p>
                <h4>${esc(m.titulo)}</h4>
                ${paras.map(p => `<p class="tl-txt">${esc(p)}</p>`).join('')}
                ${fotos.length ? `<div class="tl-fotos">${fotos.map((f, k) => `
                  <button type="button" class="tl-ph" style="--k:${k};--rot:${[-4, 3, -2, 5, -3][k % 5]}deg" aria-label="Fotografia ${k + 1} de ${esc(m.titulo)}">
                    <img src="${fileUrl(f)}" alt="">
                  </button>`).join('')}</div>` : ''}
                ${tools('marcos', m.id)}
              </article>
            </li>`;
          }).join('')}</ol>
        </div>
      </div>
    </div>`;

  view = el.querySelector('.tl-view');
  strip = el.querySelector('.tl-strip');
  svg = el.querySelector('svg');
  [track, line] = svg.querySelectorAll('path');
  head = svg.querySelector('.tl-head-dot');
  dots = [...el.querySelectorAll('.tl-dot')];
  resize.disconnect();
  resize.observe(strip);
  build();
}

// Mede tudo e desenha o caminho a passar pelo centro de cada ponto, com curvas suaves entre eles.
function build() {
  if (!svg) return;
  navH = document.querySelector('.nav')?.offsetHeight || 56;
  el.style.setProperty('--tl-top', navH + 'px');
  // A faixa ocupa a largura toda do ecrã, mas o primeiro marco fica alinhado com o título.
  const gut = Math.max(16, el.getBoundingClientRect().left);
  view.style.setProperty('--gut', gut + 'px');
  view.style.marginLeft = -gut + 'px';
  view.style.width = document.documentElement.clientWidth + 'px';

  const w = strip.scrollWidth, h = strip.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  const base = strip.getBoundingClientRect();
  const pts = dots.map(d => {
    const r = d.getBoundingClientRect();
    return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top };
  });
  const all = [{ x: 0, y: h / 2 }, ...pts, { x: w, y: h / 2 }];
  let d = `M ${all[0].x} ${all[0].y}`;
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1], b = all[i], mx = (a.x + b.x) / 2;
    d += ` C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
  }
  track.setAttribute('d', d);
  line.setAttribute('d', d);
  total = line.getTotalLength();
  line.style.strokeDasharray = total;
  // Amostras (comprimento → posição na horizontal) para saber depressa até onde desenhar.
  samples = [];
  for (let i = 0; i <= 300; i++) {
    const len = total * i / 300;
    samples.push([len, line.getPointAtLength(len).x]);
  }
  dots.forEach((dot, i) => { dot.dataset.x = pts[i].x; });

  // A secção fica tão alta quanto o caminho é comprido: cada píxel a descer anda um píxel para o lado.
  dist = Math.max(0, w - view.clientWidth);
  el.style.height = el.querySelector('.tl-stage').offsetHeight + dist + 'px';
  update();
}

function update() {
  frame = 0;
  if (!svg || !total) return;
  const top = el.getBoundingClientRect().top;
  const p = dist ? Math.min(1, Math.max(0, (navH - top) / dist)) : Number(top < innerHeight / 2);
  strip.style.transform = `translateX(${-p * dist}px)`;
  el.classList.toggle('a-andar', p > 0.02);

  // A ponta da linha vai à frente do que se vê; começa a desenhar-se quando a secção entra no ecrã.
  const vw = view.clientWidth;
  const tip = reduced.matches ? Infinity : p * dist + vw * (0.55 + 0.45 * p) - Math.max(0, top - navH);
  let len = total;
  if (tip < samples.at(-1)[1]) {
    const j = samples.findIndex(([, x]) => x >= tip);
    if (j <= 0) len = 0;
    else {
      const [l0, x0] = samples[j - 1], [l1, x1] = samples[j];
      len = l0 + (l1 - l0) * ((tip - x0) / (x1 - x0 || 1));
    }
  }
  line.style.strokeDashoffset = total - len;
  const pt = line.getPointAtLength(len);
  head.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
  head.classList.toggle('off', len <= 0 || len >= total);
  // O ponto acende quando a linha lá chega; o cartão, uma vez visto, fica.
  dots.forEach(dot => {
    const on = Number(dot.dataset.x) <= tip + 4;
    dot.classList.toggle('on', on);
    if (on) dot.parentElement.classList.add('visto');
  });
}

const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
addEventListener('scroll', schedule, { passive: true });
reduced.addEventListener?.('change', schedule);
// Imagens a carregar, letra a mudar, janela a mudar de tamanho: mede tudo outra vez.
const rebuild = () => { clearTimeout(rebuild.t); rebuild.t = setTimeout(build, 80); };
const resize = new ResizeObserver(rebuild);
addEventListener('resize', rebuild);

// No telemóvel não há rato: um toque aumenta a fotografia, outro toque (ou tocar fora) volta ao normal.
document.addEventListener('click', e => {
  const ph = e.target.closest('.tl-ph');
  document.querySelectorAll('.tl-ph.grande').forEach(x => { if (x !== ph) x.classList.remove('grande'); });
  if (ph && matchMedia('(hover: none)').matches) ph.classList.toggle('grande');
});
