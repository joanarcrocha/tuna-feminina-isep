// Importa o repertório do Drive Musical para a área reservada do site.
//
//   node scripts/importar-drive.mjs --simular   mostra o que vai ser importado, sem alterar nada
//   node scripts/importar-drive.mjs             importa (pede utilizador e palavra-passe de admin ou dirmusical)
//
// Estrutura esperada no Drive:  pasta raiz › categoria › música › (subpastas…) › ficheiros
// Cada pasta de música passa a uma música no site; as subpastas viram o "grupo" de cada ficheiro.
// Ficheiros pequenos são copiados para o armazenamento privado do site; os grandes (vídeos) ficam
// no Drive e o site guarda a ligação. Pode correr-se mais do que uma vez: o que já existe é saltado.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const ROOT_FOLDER = process.env.DRIVE_FOLDER || '1ufmDpST6e6_zE8P4oZtSjulbQppf_xHy';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wqvwfcenabhossvrvwyj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_XIRacxmt64SWrRtxM6_WFg_59nqGTmI';
const CATEGORIAS = ['Atuação', 'Pasecalles', 'Serenatas', 'Outras músicas'];
const UPLOAD_MAX = 25 * 1024 * 1024;   // acima disto, fica como ligação ao Drive
const BUDGET = 800 * 1024 * 1024;      // o plano gratuito tem 1 GB, contando com as fotos do site
const SIMULAR = process.argv.includes('--simular');

const MIME = {
  pdf: 'application/pdf', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg',
  mov: 'video/quicktime', mp4: 'video/mp4', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  musx: 'application/octet-stream', mscz: 'application/octet-stream', sib: 'application/octet-stream',
};
const ext = name => (name.match(/\.([a-z0-9]{1,5})$/i) || [, ''])[1].toLowerCase();
const mb = b => `${(b / 1024 / 1024).toFixed(1)} MB`;
const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Drive (pastas públicas, sem conta) ---------- */
async function listFolder(id) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${id}`);
    if (res.ok) {
      const html = await res.text();
      return html.split('class="flip-entry"').slice(1).map(chunk => {
        const href = (chunk.match(/href="([^"]+)"/) || [])[1] || '';
        const title = decode((chunk.match(/flip-entry-title">([^<]*)</) || [])[1] || '').trim();
        const folder = href.includes('/drive/folders/');
        const itemId = (href.match(/\/(?:folders|d)\/([\w-]+)/) || [])[1];
        return itemId && { id: itemId, title, folder };
      }).filter(Boolean);
    }
    if (attempt >= 3) throw new Error(`Não consegui ler a pasta ${id} (HTTP ${res.status}). Confirme que está partilhada com "qualquer pessoa com o link".`);
    await sleep(1500 * attempt);
  }
}

const downloadUrl = id => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;

async function fileSize(id) {
  const res = await fetch(downloadUrl(id), { headers: { Range: 'bytes=0-0' } });
  const range = res.headers.get('content-range');
  await res.body?.cancel();
  return range ? Number(range.split('/')[1]) : Number(res.headers.get('content-length') || 0);
}

async function download(id) {
  const res = await fetch(downloadUrl(id));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Percorre uma música e devolve todos os ficheiros, com o caminho de subpastas como grupo.
async function walk(folderId, path = []) {
  const files = [];
  for (const item of await listFolder(folderId)) {
    if (item.folder) files.push(...await walk(item.id, [...path, item.title]));
    else files.push({ ...item, grupo: path.join(' · ') || null });
  }
  return files;
}

/* ---------- plano ---------- */
async function buildPlan() {
  console.log('A ler o Drive…');
  const plan = [];
  let used = 0;
  for (const cat of await listFolder(ROOT_FOLDER)) {
    if (!cat.folder) continue;
    const categoria = CATEGORIAS.find(c => c.toLowerCase() === cat.title.toLowerCase());
    if (!categoria) { console.log(`  (ignorada) pasta "${cat.title}": não é uma categoria do site`); continue; }
    for (const song of await listFolder(cat.id)) {
      if (!song.folder) { console.log(`  (ignorado) "${song.title}" está solto em ${categoria}, fora de uma pasta de música`); continue; }
      const files = await walk(song.id);
      for (const f of files) {
        f.size = await fileSize(f.id);
        f.tipo = MIME[ext(f.title)] || 'application/octet-stream';
        if (!f.size) f.modo = 'vazio';
        else if (f.size <= UPLOAD_MAX && used + f.size <= BUDGET) { f.modo = 'copiar'; used += f.size; }
        else f.modo = 'ligação';
      }
      plan.push({ titulo: song.title, categoria, drive_id: song.id, files });
      process.stdout.write(`  ${categoria} › ${song.title}: ${files.length} ficheiros\n`);
    }
  }
  return { plan, used };
}

function printSummary({ plan, used }) {
  const all = plan.flatMap(s => s.files);
  const by = m => all.filter(f => f.modo === m);
  console.log('\nResumo');
  console.log(`  Músicas:                ${plan.length}`);
  console.log(`  Ficheiros a copiar:     ${by('copiar').length} (${mb(used)})`);
  console.log(`  Ficheiros como ligação: ${by('ligação').length} (grandes demais ou acima do limite de espaço)`);
  console.log(`  Ficheiros vazios:       ${by('vazio').length} (ignorados)`);
  for (const f of by('ligação')) console.log(`    ligação: ${f.title} (${mb(f.size)})`);
  for (const f of by('vazio')) console.log(`    vazio:   ${f.title}`);
}

/* ---------- Supabase ---------- */
function askHidden(question) {
  return new Promise(resolve => {
    const { stdin, stdout } = process;
    stdout.write(question);
    let value = '';
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = ch => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode?.(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n'); resolve(value);
      } else if (ch === '\u0003') { process.exit(1); }
      else if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1); }
      else value += ch;
    };
    stdin.on('data', onData);
  });
}

async function ask(question) {
  process.stdout.write(question);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise(resolve => process.stdin.once('data', d => { process.stdin.pause(); resolve(String(d).trim()); }));
}

async function importPlan({ plan }) {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const user = (await ask('Utilizador (admin ou dirmusical): ')).toLowerCase();
  const password = await askHidden('Palavra-passe: ');
  const { error: loginError } = await sb.auth.signInWithPassword({ email: `${user}@tufeisep.local`, password });
  if (loginError) throw new Error('Utilizador ou palavra-passe errados.');
  const { data: papel } = await sb.rpc('meu_papel');
  if (!['admin', 'dirmusical'].includes(papel)) throw new Error('Esta conta não pode gerir o repertório.');

  let created = 0, copied = 0, linked = 0, skipped = 0, failed = 0;
  for (const song of plan) {
    let { data: musica } = await sb.from('musicas').select('id').eq('drive_id', song.drive_id).maybeSingle();
    if (!musica) {
      const link = `https://drive.google.com/drive/folders/${song.drive_id}`;
      const ins = await sb.from('musicas').insert({ titulo: song.titulo, categoria: song.categoria, link, drive_id: song.drive_id }).select('id').single();
      if (ins.error) { console.log(`  ✗ ${song.titulo}: ${ins.error.message}`); failed++; continue; }
      musica = ins.data;
      created++;
    }
    console.log(`${song.categoria} › ${song.titulo}`);
    for (const f of song.files) {
      if (f.modo === 'vazio') continue;
      const { data: existing } = await sb.from('musica_ficheiros').select('id').eq('drive_id', f.id).maybeSingle();
      if (existing) { skipped++; continue; }
      const row = { musica_id: musica.id, nome: f.title, grupo: f.grupo, tipo: f.tipo, tamanho: f.size, drive_id: f.id };
      try {
        if (f.modo === 'copiar') {
          const data = await download(f.id);
          const caminho = `${musica.id}/${randomUUID()}${ext(f.title) ? '.' + ext(f.title) : ''}`;
          const up = await sb.storage.from('musica').upload(caminho, data, { contentType: f.tipo });
          if (up.error) throw new Error(up.error.message);
          const ins = await sb.from('musica_ficheiros').insert({ ...row, caminho });
          if (ins.error) { await sb.storage.from('musica').remove([caminho]); throw new Error(ins.error.message); }
          copied++;
          console.log(`  ✓ ${f.grupo ? f.grupo + ' › ' : ''}${f.title} (${mb(f.size)})`);
        } else {
          const ins = await sb.from('musica_ficheiros').insert({ ...row, url: `https://drive.google.com/file/d/${f.id}/view` });
          if (ins.error) throw new Error(ins.error.message);
          linked++;
          console.log(`  ↗ ${f.grupo ? f.grupo + ' › ' : ''}${f.title} (ligação ao Drive, ${mb(f.size)})`);
        }
      } catch (err) {
        failed++;
        console.log(`  ✗ ${f.title}: ${err.message}`);
      }
    }
  }
  console.log(`\nConcluído: ${created} músicas novas, ${copied} ficheiros copiados, ${linked} ligações, ${skipped} já existiam, ${failed} falharam.`);
  if (failed) console.log('Pode correr o script outra vez: só tenta de novo o que falhou.');
}

/* ---------- arranque ---------- */
try {
  const result = await buildPlan();
  printSummary(result);
  if (SIMULAR) {
    writeFileSync(new URL('./plano-importacao.json', import.meta.url), JSON.stringify(result.plan, null, 2));
    console.log('\nSimulação: nada foi alterado. Plano guardado em scripts/plano-importacao.json');
  } else {
    await importPlan(result);
  }
  process.exit(0);
} catch (err) {
  console.error(`\nErro: ${err.message}`);
  process.exit(1);
}
