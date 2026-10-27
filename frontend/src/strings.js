// Seis cordas no fundo do hero que vibram quando o rato (ou o dedo) passa por elas.
export function mountStrings(canvas, hero) {
  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S = [0.56, 0.62, 0.68, 0.74, 0.80, 0.86].map((y, i) => ({ y, w: 2 - i * 0.22, a: 0, px: 0.5, t: 0 }));
  let W = 0, H = 0, rgb = '161, 29, 75', last = null, running = false;

  function size() {
    const r = canvas.getBoundingClientRect(), d = devicePixelRatio || 1;
    W = r.width; H = r.height;
    canvas.width = W * d; canvas.height = H * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    rgb = getComputedStyle(document.documentElement).getPropertyValue('--string').trim() || rgb;
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const s of S) {
      const y0 = s.y * H, px = s.px * W, d = s.a * Math.sin(s.t * 0.9);
      ctx.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const env = x < px ? x / px : (W - x) / (W - px);
        x ? ctx.lineTo(x, y0 + d * env) : ctx.moveTo(x, y0);
      }
      ctx.strokeStyle = `rgba(${rgb}, ${0.24 + Math.min(Math.abs(s.a) / 30, 0.5)})`;
      ctx.lineWidth = s.w;
      ctx.stroke();
    }
  }

  function tick() {
    let live = false;
    for (const s of S) {
      s.t += 1; s.a *= 0.972;
      if (Math.abs(s.a) > 0.15) live = true; else s.a = 0;
    }
    draw();
    running = live;
    if (live) requestAnimationFrame(tick);
  }

  const pluck = (s, x, v) => {
    const amp = Math.min(24, Math.max(10, Math.abs(v) * 1.6));
    s.px = Math.min(0.92, Math.max(0.08, x / W));
    s.a = v < 0 ? -amp : amp;
    s.t = 1.75;
  };
  const go = () => { if (!running && S.some(s => s.a)) { running = true; requestAnimationFrame(tick); } };
  const at = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  // Dedilhar é um gesto da pessoa, por isso responde sempre; só a animação automática respeita o movimento reduzido.
  hero.addEventListener('pointermove', e => {
    const p = at(e);
    if (last) for (const s of S) {
      const y = s.y * H;
      if ((last.y - y) * (p.y - y) <= 0 && last.y !== p.y) pluck(s, p.x, p.y - last.y);
    }
    last = p;
    go();
  });
  hero.addEventListener('pointerdown', e => {
    const p = at(e);
    const s = S.reduce((a, b) => Math.abs(b.y * H - p.y) < Math.abs(a.y * H - p.y) ? b : a);
    if (Math.abs(s.y * H - p.y) < 40) { pluck(s, p.x, 16); go(); }
  });
  hero.addEventListener('pointerleave', () => { last = null; });

  addEventListener('resize', size);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', size);
  size();

  if (!still) S.forEach((s, i) => setTimeout(() => { pluck(s, W * (0.3 + i * 0.08), 10 - i); go(); }, 500 + i * 90));
}
