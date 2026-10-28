// Linha temporal da história: um caminho ondulado que se desenha à medida que se desce a página.
// Cada marco fica de um lado do caminho, alternadamente; o ponto acende quando a linha lá chega,
// e o cartão entra pelo seu lado. As fotografias são miniaturas que só aumentam com o rato por cima
// (ou com um toque, no telemóvel).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SVG = 'http://www.w3.org/2000/svg';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

let el = null, svg = null, track = null, line = null, head = null;
let total = 0, samples = [], dots = [], frame = 0, key = '';

export function renderTimeline(box, items, { edit, tools, fileUrl }) {
  el = box;
  const list = [...items].sort((a, b) => (a.ano ?? 0) - (b.ano ?? 0) || a.id - b.id);
  // Só redesenha quando os marcos ou o modo de edição mudam, para não repetir as animações.
  const k = JSON.stringify([list, edit]);
  if (k === key) return;
  key = k;
  el.closest('.tl-wrap').hidden = !list.length && !edit;
  if (!list.length) {
    el.innerHTML = `<div class="empty"><strong>Ainda não há marcos.</strong>Carregue em “+ Adicionar marco” para começar pela fundação, a 11 de novembro de 1991.</div>`;
    svg = null;
    return;
  }

  el.innerHTML = `
    <svg class="tl-svg" aria-hidden="true">
      <path class="tl-track"/><path class="tl-line"/>
      <g class="tl-head"><circle class="tl-pulse" r="7"/><circle r="5"/></g>
    </svg>
    <ol class="tl-list">${list.map((m, i) => {
      const fotos = m.fotos?.length ? m.fotos : m.foto ? [m.foto] : [];
      const paras = String(m.texto || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      return `
      <li class="tl-item ${i % 2 ? 'dir' : 'esq'}" style="--n:${i}">
        <span class="tl-dot"></span>
        <article class="tl-card">
          <p class="tl-ano">${esc(m.ano)}</p>
          <h4>${esc(m.titulo)}</h4>
          ${paras.map(p => `<p class="tl-txt">${esc(p)}</p>`).join('')}
          ${fotos.length ? `<div class="tl-fotos">${fotos.map((f, k) => `
            <button type="button" class="tl-ph" style="--k:${k};--rot:${[-4, 3, -2, 5, -3][k % 5]}deg" aria-label="Fotografia ${k + 1} de ${esc(m.titulo)}">
              <img src="${fileUrl(f)}" alt="" loading="lazy">
            </button>`).join('')}</div>` : ''}
          ${tools('marcos', m.id)}
        </article>
      </li>`;
    }).join('')}</ol>`;

  svg = el.querySelector('svg');
  [track, line] = svg.querySelectorAll('path');
  head = svg.querySelector('.tl-head');
  dots = [...el.querySelectorAll('.tl-dot')];
  build();
}

// Desenha o caminho a passar pelo centro de cada ponto, com curvas suaves entre eles.
function build() {
  if (!svg) return;
  const box = el.getBoundingClientRect();
  const w = el.clientWidth, h = el.scrollHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  const pts = dots.map(d => {
    const r = d.getBoundingClientRect();
    return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
  });
  if (!pts.length) return;
  const start = { x: pts[0].x, y: 0 }, end = { x: pts.at(-1).x, y: h };
  const all = [start, ...pts, end];
  let d = `M ${start.x} ${start.y}`;
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1], b = all[i], my = (a.y + b.y) / 2;
    d += ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
  }
  track.setAttribute('d', d);
  line.setAttribute('d', d);
  total = line.getTotalLength();
  line.style.strokeDasharray = total;
  // Amostras (comprimento → altura) para saber depressa até onde desenhar.
  samples = [];
  for (let i = 0; i <= 240; i++) {
    const len = total * i / 240;
    samples.push([len, line.getPointAtLength(len).y]);
  }
  dots.forEach((dot, i) => { dot.dataset.y = pts[i].y; });
  update();
}

function update() {
  frame = 0;
  if (!svg || !total) return;
  const tip = reduced.matches ? Infinity : innerHeight * 0.62 - el.getBoundingClientRect().top;
  let len = total;
  if (tip < samples.at(-1)[1]) {
    const j = samples.findIndex(([, y]) => y >= tip);
    if (j <= 0) len = 0;
    else {
      const [l0, y0] = samples[j - 1], [l1, y1] = samples[j];
      len = l0 + (l1 - l0) * ((tip - y0) / (y1 - y0 || 1));
    }
  }
  line.style.strokeDashoffset = total - len;
  const p = line.getPointAtLength(len);
  head.setAttribute('transform', `translate(${p.x} ${p.y})`);
  head.classList.toggle('off', len <= 0 || len >= total);
  // O ponto acende quando a linha lá chega; o cartão, uma vez visto, fica.
  dots.forEach(dot => {
    const on = Number(dot.dataset.y) <= tip + 4;
    dot.classList.toggle('on', on);
    if (on) dot.parentElement.classList.add('visto');
  });
}

const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
addEventListener('scroll', schedule, { passive: true });
reduced.addEventListener?.('change', schedule);
// Imagens a carregar, letra a mudar, janela a mudar de tamanho: refaz o caminho.
const resize = new ResizeObserver(() => { clearTimeout(resize.t); resize.t = setTimeout(build, 60); });
queueMicrotask(() => { const t = document.getElementById('timeline'); if (t) resize.observe(t); });

// No telemóvel não há rato: um toque aumenta a fotografia, outro toque (ou tocar fora) volta ao normal.
document.addEventListener('click', e => {
  const ph = e.target.closest('.tl-ph');
  document.querySelectorAll('.tl-ph.grande').forEach(x => { if (x !== ph) x.classList.remove('grande'); });
  if (ph && matchMedia('(hover: none)').matches) ph.classList.toggle('grande');
});
