// Registos: galeria de fotografias, cada uma de um festival ou de um marco da linha temporal.
// Os álbuns aparecem como pilhas de fotografias; ao escolher um, o mosaico reorganiza-se com animação.
// Carregar numa fotografia abre-a em grande, a crescer a partir da miniatura.
// Só a Administração acrescenta, edita e apaga; as fotografias são reduzidas no browser antes de enviar.
import { api, fileUrl } from './api.js';
import { askLogin, getRole, signOut, ROLE_LABEL } from './auth.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const MAX_LADO = 2000;          // píxeis do lado maior depois de reduzir
const QUALIDADE = 0.82;
const TIPOS = { todos: 'Todos', f: 'Festivais', m: 'Marcos' };

const state = { registos: [], festivais: [], marcos: [], tipo: 'todos', album: null, edit: false, lista: [], aberta: -1, semTabela: false };
const SEM_TABELA = 'A base de dados ainda não tem a tabela dos registos. Corra o SQL da migração 014 no Supabase e tente outra vez.';

/* ---------- álbuns ---------- */
// Chave de cada álbum: "f12" (festival 12), "m3" (marco 3) ou "sem" (fotografias sem álbum).
const chaveDe = r => r.festival_id ? `f${r.festival_id}` : r.marco_id ? `m${r.marco_id}` : 'sem';
const quando = x => x.data || (x.ano ? `${x.ano}-00-00` : '');
const dataCurta = d => {
  if (!d) return '';
  if (/^\d{4}-00-00$/.test(d)) return d.slice(0, 4);
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' });
};

function albuns() {
  const fotos = new Map();
  for (const r of state.registos) {
    const k = chaveDe(r);
    if (!fotos.has(k)) fotos.set(k, []);
    fotos.get(k).push(r);
  }
  const lista = [
    ...state.festivais.map(f => ({ chave: `f${f.id}`, tipo: 'f', titulo: f.nome, sub: [f.local, dataCurta(quando(f))].filter(Boolean).join(' · '), quando: quando(f) })),
    ...state.marcos.map(m => ({ chave: `m${m.id}`, tipo: 'm', titulo: m.titulo, sub: dataCurta(quando(m)), quando: quando(m) })),
  ];
  if (fotos.has('sem')) lista.push({ chave: 'sem', tipo: 'sem', titulo: 'Outros registos', sub: '', quando: '' });
  return lista
    .map(a => ({ ...a, fotos: fotos.get(a.chave) || [] }))
    .filter(a => a.fotos.length || state.edit)
    .sort((a, b) => b.quando.localeCompare(a.quando) || a.titulo.localeCompare(b.titulo, 'pt'));
}
const albumDe = chave => albuns().find(a => a.chave === chave);

/* ---------- desenho ---------- */
function render(animar = true) {
  const todos = albuns();
  const visiveis = todos.filter(a => state.tipo === 'todos' || a.tipo === state.tipo);

  $('#regTabs').innerHTML = Object.entries(TIPOS).map(([k, l]) =>
    `<button class="pill" role="tab" data-tipo="${k}" aria-selected="${state.tipo === k}" aria-pressed="${state.tipo === k}">${l}</button>`).join('');

  // Cada álbum é uma pilha de até três fotografias, que se abre em leque com o rato por cima.
  $('#albuns').innerHTML = visiveis.length ? visiveis.map(a => `
    <button type="button" class="album${state.album === a.chave ? ' on' : ''}" data-album="${a.chave}">
      <span class="pilha">${(a.fotos.length ? a.fotos.slice(0, 3) : [null]).map((f, i) => f
        ? `<img src="${fileUrl(f.ficheiro)}" alt="" loading="lazy" style="--i:${i}">`
        : `<span class="vazia" style="--i:${i}"></span>`).reverse().join('')}</span>
      <span class="album-txt">
        <small>${a.tipo === 'f' ? 'Festival' : a.tipo === 'm' ? 'Marco' : 'Registos'}${a.sub ? ` · ${esc(a.sub)}` : ''}</small>
        <b>${esc(a.titulo)}</b>
        <em>${a.fotos.length} ${a.fotos.length === 1 ? 'fotografia' : 'fotografias'}</em>
      </span>
    </button>`).join('')
    : `<p class="reg-vazio">${state.registos.length ? 'Ainda não há fotografias deste tipo.' : 'Ainda não há registos.'}${state.edit ? ' Carregue em “+ Adicionar fotografias”.' : ''}</p>`;

  const sel = state.album && albumDe(state.album);
  if (state.album && !sel) state.album = null;
  state.lista = state.registos
    .filter(r => sel ? chaveDe(r) === sel.chave : visiveis.some(a => a.chave === chaveDe(r)))
    .sort((a, b) => {
      const qa = albumDe(chaveDe(a))?.quando || '', qb = albumDe(chaveDe(b))?.quando || '';
      return qb.localeCompare(qa) || a.id - b.id;
    });

  $('#regSel').innerHTML = sel ? `
    <div>
      <p class="eyebrow">${sel.tipo === 'f' ? 'Festival' : sel.tipo === 'm' ? 'Marco da nossa história' : 'Registos'}</p>
      <h2>${esc(sel.titulo)}</h2>
      ${sel.sub ? `<p class="sub">${esc(sel.sub)}</p>` : ''}
    </div>
    <button type="button" class="btn" data-album="">Ver todas</button>`
    : state.lista.length ? `<div><h2>${state.tipo === 'todos' ? 'Todas as fotografias' : TIPOS[state.tipo]}</h2><p class="sub">${state.lista.length} ${state.lista.length === 1 ? 'fotografia' : 'fotografias'}</p></div>` : '';

  const desenhar = () => {
    $('#regMural').innerHTML = state.lista.map((r, i) => `
      <li class="reg-foto" style="--ar:${(r.largura && r.altura) ? r.largura / r.altura : 4 / 3};view-transition-name:r${r.id}">
        <button type="button" class="reg-abrir" data-foto="${i}" aria-label="${esc(r.legenda || 'Abrir fotografia')}">
          <img src="${fileUrl(r.ficheiro)}" alt="${esc(r.legenda || '')}" loading="lazy">
        </button>
        ${r.legenda ? `<span class="reg-leg">${esc(r.legenda)}</span>` : ''}
        <div class="item-tools"><button class="tool" data-editar="${r.id}">Editar</button><button class="tool danger" data-apagar="${r.id}">Apagar</button></div>
      </li>`).join('');
    mosaico();
    entrar();
  };
  // Com a API de transições do browser, as fotografias deslizam para o novo lugar ao filtrar.
  if (animar && document.startViewTransition && !reduced.matches && state.lista.length < 200) document.startViewTransition(desenhar);
  else desenhar();
}

// Mosaico: cada fotografia ocupa as linhas que a sua proporção pede (linhas de 8 px).
function mosaico() {
  const el = $('#regMural');
  const col = el.querySelector('.reg-foto')?.clientWidth;
  if (!col) return;
  el.querySelectorAll('.reg-foto').forEach(li => {
    const ar = Number(li.style.getPropertyValue('--ar')) || 4 / 3;
    li.style.gridRowEnd = `span ${Math.ceil((col / ar + 14) / 8)}`;
  });
}
addEventListener('resize', () => { clearTimeout(mosaico.t); mosaico.t = setTimeout(mosaico, 100); });

// As fotografias aparecem à medida que entram no ecrã, umas atrás das outras.
const entrada = new IntersectionObserver(es => {
  let k = 0;
  for (const e of es) {
    if (!e.isIntersecting) continue;
    e.target.style.setProperty('--d', `${(k++ % 8) * 60}ms`);
    e.target.classList.add('on');
    entrada.unobserve(e.target);
  }
}, { rootMargin: '0px 0px -6% 0px' });
function entrar() { document.querySelectorAll('.reg-foto:not(.on)').forEach(li => entrada.observe(li)); }

/* ---------- fotografia em grande ---------- */
const lb = $('#lb');
function mostrar(i) {
  const r = state.lista[i];
  if (!r) return;
  state.aberta = i;
  const a = albumDe(chaveDe(r));
  $('#lbImg').src = fileUrl(r.ficheiro);
  $('#lbImg').alt = r.legenda || '';
  $('#lbCap').innerHTML = `
    ${r.legenda ? `<b>${esc(r.legenda)}</b>` : ''}
    ${a && a.chave !== 'sem' ? `<button type="button" class="lb-album" data-album="${a.chave}">${a.tipo === 'f' ? 'Festival' : 'Marco'} · ${esc(a.titulo)}${a.sub ? ` · ${esc(a.sub)}` : ''}</button>` : ''}
    <span>${i + 1} / ${state.lista.length}</span>`;
  lb.querySelector('.lb-prev').disabled = i === 0;
  lb.querySelector('.lb-next').disabled = i === state.lista.length - 1;
}

function abrir(i) {
  const thumb = document.querySelector(`[data-foto="${i}"] img`);
  const go = () => { mostrar(i); if (!lb.open) lb.showModal(); };
  // A miniatura cresce até à fotografia em grande.
  if (thumb && document.startViewTransition && !reduced.matches) {
    thumb.style.viewTransitionName = 'foto';
    const t = document.startViewTransition(() => {
      thumb.style.viewTransitionName = '';
      $('#lbImg').style.viewTransitionName = 'foto';
      go();
    });
    t.finished.finally(() => { $('#lbImg').style.viewTransitionName = ''; });
  } else go();
}

function fechar() {
  const thumb = document.querySelector(`[data-foto="${state.aberta}"] img`);
  if (thumb && document.startViewTransition && !reduced.matches) {
    $('#lbImg').style.viewTransitionName = 'foto';
    const t = document.startViewTransition(() => {
      $('#lbImg').style.viewTransitionName = '';
      thumb.style.viewTransitionName = 'foto';
      lb.close();
    });
    t.finished.finally(() => { thumb.style.viewTransitionName = ''; });
  } else lb.close();
}

lb.addEventListener('cancel', e => { e.preventDefault(); fechar(); });
lb.addEventListener('click', e => { if (e.target === lb) fechar(); });
$('#lbClose').addEventListener('click', fechar);
document.addEventListener('keydown', e => {
  if (!lb.open) return;
  if (e.key === 'ArrowRight') mostrar(Math.min(state.aberta + 1, state.lista.length - 1));
  if (e.key === 'ArrowLeft') mostrar(Math.max(state.aberta - 1, 0));
});
// No telemóvel, deslizar para o lado muda de fotografia.
let toqueX = null;
lb.addEventListener('pointerdown', e => { toqueX = e.clientX; });
lb.addEventListener('pointerup', e => {
  if (toqueX == null) return;
  const dx = e.clientX - toqueX;
  toqueX = null;
  if (Math.abs(dx) > 60) mostrar(Math.min(Math.max(state.aberta + (dx < 0 ? 1 : -1), 0), state.lista.length - 1));
});

/* ---------- escolher álbum ---------- */
function escolher(chave) {
  state.album = chave || null;
  const url = new URL(location.href);
  if (state.album) url.searchParams.set('album', state.album); else url.searchParams.delete('album');
  history.replaceState(null, '', url);
  render();
  if (state.album) $('#regSel').scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
}

/* ---------- edição (só Administração) ---------- */
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600);
}

function opcoesAlbum(atual) {
  const op = (v, l) => `<option value="${v}"${v === atual ? ' selected' : ''}>${esc(l)}</option>`;
  const fs = [...state.festivais].sort((a, b) => quando(b).localeCompare(quando(a)));
  const ms = [...state.marcos].sort((a, b) => quando(b).localeCompare(quando(a)));
  return `<option value="sem">Sem álbum</option>
    ${fs.length ? `<optgroup label="Festivais">${fs.map(f => op(`f${f.id}`, `${f.nome}${quando(f) ? ` (${quando(f).slice(0, 4)})` : ''}`)).join('')}</optgroup>` : ''}
    ${ms.length ? `<optgroup label="Marcos">${ms.map(m => op(`m${m.id}`, `${m.titulo}${quando(m) ? ` (${quando(m).slice(0, 4)})` : ''}`)).join('')}</optgroup>` : ''}`;
}
const ligacao = chave => ({ festival_id: chave?.startsWith('f') ? Number(chave.slice(1)) : null, marco_id: chave?.startsWith('m') ? Number(chave.slice(1)) : null });

// Reduz a fotografia no browser (lado maior até 2000 px, WebP) para poupar espaço no Supabase.
async function reduzir(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, MAX_LADO / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  let blob = await new Promise(res => canvas.toBlob(res, 'image/webp', QUALIDADE));
  // Browsers que não sabem gravar WebP devolvem PNG: aí usa-se JPEG.
  if (!blob || blob.type !== 'image/webp') blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.86));
  return { file: new File([blob], 'foto' + (blob.type === 'image/webp' ? '.webp' : '.jpg'), { type: blob.type }), largura: w, altura: h };
}

function formulario(html, onSubmit) {
  $('#form').innerHTML = html + `
    <p class="form-err" id="formErr" hidden></p>
    <div class="actions"><button type="button" class="btn" id="cancel">Cancelar</button><button type="submit" class="btn primary" id="save">Guardar</button></div>`;
  $('#cancel').onclick = () => $('#dlg').close();
  $('#form').onsubmit = async e => {
    e.preventDefault();
    const save = $('#save'), err = $('#formErr');
    save.disabled = true; err.hidden = true;
    try { await onSubmit(new FormData($('#form')), msg => { save.textContent = msg; }); $('#dlg').close(); }
    catch (ex) {
      if (ex?.status === 401) { $('#dlg').close(); await sair(); }
      err.textContent = ex?.message || 'Não foi possível guardar. Tente outra vez.'; err.hidden = false;
    } finally { save.disabled = false; save.textContent = 'Guardar'; }
  };
  $('#dlg').showModal();
}

function adicionar() {
  formulario(`
    <h3>Adicionar fotografias</h3>
    <div class="field"><label for="fFotos">Fotografias *</label><input type="file" id="fFotos" name="fotos" accept="image/*" multiple required>
      <span class="hint">Pode escolher várias de uma vez. São reduzidas antes de enviar, para ocuparem pouco espaço.</span></div>
    <div class="field"><label for="fAlbum">Álbum</label><select id="fAlbum" name="album">${opcoesAlbum(state.album || 'sem')}</select>
      <span class="hint">O festival ou o marco da linha temporal a que pertencem.</span></div>
    <div class="field"><label for="fLeg">Legenda</label><input id="fLeg" name="legenda" maxlength="200">
      <span class="hint">Opcional. Fica igual em todas as fotografias deste envio; pode mudar-se depois uma a uma.</span></div>`,
  async (fd, progresso) => {
    const files = fd.getAll('fotos').filter(f => f?.size);
    if (!files.length) throw new Error('Escolha pelo menos uma fotografia.');
    // Sem a tabela, não vale a pena enviar: as fotografias ficariam no armazenamento sem registo.
    if (state.semTabela) throw new Error(SEM_TABELA);
    const base = { legenda: String(fd.get('legenda') || '').trim() || null, ...ligacao(fd.get('album')) };
    let feitas = 0, falhas = 0, erro = '';
    for (const f of files) {
      progresso(`A enviar ${feitas + falhas + 1} de ${files.length}…`);
      try {
        const { file, largura, altura } = await reduzir(f);
        const { ficheiro } = await api.upload(file);
        await api.create('registos', { ...base, ficheiro, largura, altura });
        feitas++;
      } catch (ex) {
        if (ex?.status === 401) throw ex;
        falhas++;
        erro ||= ex?.message || '';
      }
    }
    await carregar();
    if (falhas && !feitas) throw new Error(`Nenhuma fotografia foi enviada. ${erro}`.trim());
    toast(falhas ? `${feitas} enviadas, ${falhas} falharam: ${erro}` : `${feitas} ${feitas === 1 ? 'fotografia enviada' : 'fotografias enviadas'}.`);
  });
}

function editar(id) {
  const r = state.registos.find(x => String(x.id) === String(id));
  if (!r) return;
  formulario(`
    <h3>Editar fotografia</h3>
    <img class="form-thumb" src="${fileUrl(r.ficheiro)}" alt="">
    <div class="field"><label for="fAlbum">Álbum</label><select id="fAlbum" name="album">${opcoesAlbum(chaveDe(r))}</select></div>
    <div class="field"><label for="fLeg">Legenda</label><input id="fLeg" name="legenda" maxlength="200" value="${esc(r.legenda || '')}"></div>`,
  async fd => {
    await api.update('registos', r.id, { legenda: String(fd.get('legenda') || '').trim() || null, ...ligacao(fd.get('album')) });
    await carregar();
    toast('Guardado');
  });
}

async function apagar(btn) {
  if (!btn.classList.contains('armed')) {
    btn.classList.add('armed'); btn.textContent = 'Confirmar';
    setTimeout(() => { btn.classList.remove('armed'); btn.textContent = 'Apagar'; }, 3500);
    return;
  }
  try {
    await api.remove('registos', btn.dataset.apagar);
    await carregar();
    toast('Apagada');
  } catch (ex) {
    if (ex?.status === 401) await sair();
    toast(ex?.message || 'Não foi possível apagar.');
  }
}

function setEdit(on) {
  state.edit = on;
  document.body.classList.toggle('editing', on);
  $('#editToggle').setAttribute('aria-pressed', on);
  $('#editToggle').textContent = on ? 'Concluir edição' : 'Editar registos';
  render(false);
}

async function atualizarSessao() {
  const role = await getRole();
  $('#loginBtn').hidden = Boolean(role);
  $('#logoutBtn').hidden = !role;
  $('#editToggle').hidden = role !== 'admin';
  if (role !== 'admin' && state.edit) setEdit(false);
  return role;
}
async function sair() { await signOut(); await atualizarSessao(); }

$('#loginBtn').addEventListener('click', async () => {
  const role = await askLogin();
  if (!role) return;
  await atualizarSessao();
  toast(role === 'admin' ? 'Entraste. Carrega em “Editar registos” para gerir as fotografias.' : `Entraste como ${ROLE_LABEL[role]}.`);
});
$('#logoutBtn').addEventListener('click', async () => { await sair(); toast('Saíste da tua conta.'); });
$('#editToggle').addEventListener('click', () => setEdit(!state.edit));
$('#addFotos').addEventListener('click', adicionar);

document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.tipo) { state.tipo = t.dataset.tipo; state.album = null; escolher(null); }
  else if (t.dataset.album !== undefined) { if (lb.open) lb.close(); escolher(t.dataset.album === state.album ? null : t.dataset.album); }
  else if (t.dataset.foto !== undefined) abrir(Number(t.dataset.foto));
  else if (t.dataset.lb) mostrar(Math.min(Math.max(state.aberta + Number(t.dataset.lb), 0), state.lista.length - 1));
  else if (t.dataset.editar) editar(t.dataset.editar);
  else if (t.dataset.apagar) apagar(t);
});

/* ---------- dados ---------- */
async function carregar() {
  // Enquanto a tabela dos registos não existir no Supabase, a página mostra-se vazia.
  const [registos, festivais, marcos] = await Promise.all([
    api.list('registos').then(x => { state.semTabela = false; return x; }, () => { state.semTabela = true; return []; }),
    api.list('festivais').catch(() => []),
    api.list('marcos').catch(() => []),
  ]);
  Object.assign(state, { registos, festivais, marcos });
  render(false);
}

state.album = new URL(location.href).searchParams.get('album');
atualizarSessao();
carregar();
