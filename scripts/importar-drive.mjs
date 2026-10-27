// Importa o repertório do Drive Musical para a área reservada do site.
//
//   node scripts/importar-drive.mjs --simular   mostra o que vai ser importado, sem alterar nada
//   node scripts/importar-drive.mjs             importa (pede utilizador e palavra-passe de admin ou dirmusical)
//
// Estrutura esperada no Drive:  pasta raiz › categoria › música › (subpastas…) › ficheiros
// Cada pasta de música passa a uma música no site; as subpastas viram o "grupo" de cada ficheiro.
// Todos os ficheiros são copiados para o armazenamento privado do site, para o Drive poder deixar
// de existir. Vídeos e WAV são comprimidos com o FFmpeg (MP4 720p e MP3) para caberem no limite de
// 50 MB por ficheiro. Pode correr-se mais do que uma vez: o que já existe é saltado.
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';                   // o Node.js 20 não traz WebSocket; a biblioteca do Supabase precisa dele
import { randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync, statSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT_FOLDER = process.env.DRIVE_FOLDER || '1ufmDpST6e6_zE8P4oZtSjulbQppf_xHy';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wqvwfcenabhossvrvwyj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_XIRacxmt64SWrRtxM6_WFg_59nqGTmI';
const CATEGORIAS = ['Atuação', 'Pasecalles', 'Serenatas', 'Outras músicas'];
const FILE_MAX = 49 * 1024 * 1024;     // limite do Supabase gratuito: 50 MB por ficheiro
const BUDGET = 950 * 1024 * 1024;      // o plano gratuito tem 1 GB, contando com as fotos do site
const SIMULAR = process.argv.includes('--simular');
const FORCAR = process.argv.includes('--forcar');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

// Estimativa do tamanho depois de comprimir (para a simulação).
const VIDEO_RATIO = 0.12;              // MOV do telemóvel → MP4 720p
const WAV_RATIO = 0.14;                // WAV → MP3 192 kbps
const isVideo = f => f.tipo.startsWith('video/');
const isWav = f => f.tipo === 'audio/wav';

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
  const data = Buffer.from(await res.arrayBuffer());
  // O Drive devolve por vezes uma página HTML (aviso ou limite de descargas) em vez do ficheiro.
  if (data.subarray(0, 15).toString('latin1').toLowerCase().startsWith('<!doctype') || data.subarray(0, 6).toString('latin1').toLowerCase() === '<html>') throw new Error('o Drive devolveu uma página em vez do ficheiro');
  return data;
}

/* ---------- compressão ---------- */
// Devolve { data, nome, tipo } já pronto a enviar.
function compress(f, data) {
  const dir = mkdtempSync(join(tmpdir(), 'tufe-'));
  try {
    const input = join(dir, 'in.' + (ext(f.title) || 'bin'));
    writeFileSync(input, data);
    const base = f.title.replace(/\.[^.]+$/, '');
    const run = args => execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, ...args], { stdio: 'pipe' });
    if (isWav(f)) {
      const out = join(dir, 'out.mp3');
      run(['-vn', '-codec:a', 'libmp3lame', '-b:a', '192k', out]);
      return { data: readFileSync(out), nome: `${base}.mp3`, tipo: 'audio/mpeg' };
    }
    if (isVideo(f)) {
      // Tenta 720p com boa qualidade; se passar do limite, comprime mais e, por fim, baixa para 480p.
      for (const [height, crf] of [[720, 23], [720, 28], [480, 31]]) {
        const out = join(dir, `out-${height}.mp4`);
        run(['-vf', `scale=-2:'min(${height},ih)'`, '-c:v', 'libx264', '-preset', 'faster', '-crf', String(crf),
          '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out]);
        if (statSync(out).size <= FILE_MAX) return { data: readFileSync(out), nome: `${base}.mp4`, tipo: 'video/mp4' };
      }
      throw new Error('mesmo comprimido, o vídeo passa dos 50 MB');
    }
    throw new Error('ficheiro maior que 50 MB e sem forma de o comprimir');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
        if (!f.size) { f.modo = 'vazio'; continue; }
        // MOV passa sempre a MP4 (o Chrome nem sempre reproduz MOV); MP4 pequenos ficam como estão.
        const needsVideo = isVideo(f) && (ext(f.title) === 'mov' || f.size > 20 * 1024 * 1024);
        if (needsVideo || isWav(f)) { f.modo = 'comprimir'; f.estimativa = Math.round(f.size * (isVideo(f) ? VIDEO_RATIO : WAV_RATIO)); }
        else if (f.size > FILE_MAX) { f.modo = 'grande'; f.estimativa = 0; }
        else { f.modo = 'copiar'; f.estimativa = f.size; }
        used += f.estimativa;
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
  const sum = (list, k) => list.reduce((n, f) => n + (f[k] || 0), 0);
  console.log('\nResumo');
  console.log(`  Músicas:                  ${plan.length}`);
  console.log(`  Ficheiros a copiar tal e qual: ${by('copiar').length} (${mb(sum(by('copiar'), 'size'))})`);
  console.log(`  Vídeos e WAV a comprimir: ${by('comprimir').length} (${mb(sum(by('comprimir'), 'size'))} no Drive → cerca de ${mb(sum(by('comprimir'), 'estimativa'))})`);
  console.log(`  Grandes sem compressão:   ${by('grande').length}`);
  console.log(`  Ficheiros vazios:         ${by('vazio').length} (ignorados)`);
  console.log(`  Espaço no site (estimado): ${mb(used)} de ${mb(BUDGET)} disponíveis`);
  for (const f of by('grande')) console.log(`    grande: ${f.title} (${mb(f.size)})`);
  for (const f of by('vazio')) console.log(`    vazio:  ${f.title}`);
  if (used > BUDGET) console.log('\n  ⚠ Não cabe no plano gratuito do Supabase (1 GB).');
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

async function importPlan({ plan, used }) {
  if (used > BUDGET && !FORCAR) {
    throw new Error('O repertório não cabe no espaço disponível. Liberte espaço ou passe a um plano maior e corra com --forcar.');
  }
  try { execFileSync(FFMPEG, ['-version'], { stdio: 'ignore' }); }
  catch { throw new Error('O FFmpeg não está instalado (precisa dele para comprimir vídeos e WAV).'); }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false }, realtime: { transport: ws } });
  const user = (await ask('Utilizador (admin ou dirmusical): ')).toLowerCase();
  const password = await askHidden('Palavra-passe: ');
  const { error: loginError } = await sb.auth.signInWithPassword({ email: `${user}@tufeisep.local`, password });
  if (loginError) throw new Error('Utilizador ou palavra-passe errados.');
  const { data: papel } = await sb.rpc('meu_papel');
  if (!['admin', 'dirmusical'].includes(papel)) throw new Error('Esta conta não pode gerir o repertório.');

  let created = 0, copied = 0, compressed = 0, skipped = 0, failed = 0;
  for (const song of plan) {
    let { data: musica } = await sb.from('musicas').select('id').eq('drive_id', song.drive_id).maybeSingle();
    if (!musica) {
      const ins = await sb.from('musicas').insert({ titulo: song.titulo, categoria: song.categoria, drive_id: song.drive_id }).select('id').single();
      if (ins.error) { console.log(`  ✗ ${song.titulo}: ${ins.error.message}`); failed++; continue; }
      musica = ins.data;
      created++;
    }
    console.log(`${song.categoria} › ${song.titulo}`);
    for (const f of song.files) {
      if (f.modo === 'vazio') continue;
      const { data: existing } = await sb.from('musica_ficheiros').select('id').eq('drive_id', f.id).maybeSingle();
      if (existing) { skipped++; continue; }
      const label = `${f.grupo ? f.grupo + ' › ' : ''}${f.title}`;
      try {
        let file = { data: await download(f.id), nome: f.title, tipo: f.tipo };
        if (f.tipo === 'application/pdf' && !file.data.subarray(0, 1024).toString('latin1').includes('%PDF-')) throw new Error('não é um PDF válido');
        if (f.modo !== 'copiar') {
          process.stdout.write(`  … a comprimir ${label} (${mb(f.size)})\r`);
          file = compress(f, file.data);
          compressed++;
        }
        const caminho = `${musica.id}/${randomUUID()}${ext(file.nome) ? '.' + ext(file.nome) : ''}`;
        const up = await sb.storage.from('musica').upload(caminho, file.data, { contentType: file.tipo });
        if (up.error) throw new Error(up.error.message);
        const ins = await sb.from('musica_ficheiros').insert({
          musica_id: musica.id, nome: file.nome, grupo: f.grupo, tipo: file.tipo, tamanho: file.data.length, drive_id: f.id, caminho,
        });
        if (ins.error) { await sb.storage.from('musica').remove([caminho]); throw new Error(ins.error.message); }
        copied++;
        console.log(`  ✓ ${label} (${f.modo === 'copiar' ? mb(f.size) : `${mb(f.size)} → ${mb(file.data.length)}`})`);
      } catch (err) {
        failed++;
        console.log(`  ✗ ${f.title}: ${err.message}`);
      }
    }
  }
  console.log(`\nConcluído: ${created} músicas novas, ${copied} ficheiros no site (${compressed} comprimidos), ${skipped} já existiam, ${failed} falharam.`);
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
