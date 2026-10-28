// Importa as Tunantes Inativas do portefólio (PDF) para a lista de membros do site.
//
//   node scripts/importar-inativas.mjs --simular            mostra o que vai ser importado, sem alterar nada
//   node scripts/importar-inativas.mjs                      importa (pede utilizador e palavra-passe de admin)
//   node scripts/importar-inativas.mjs "C:\…\outro.pdf"     usa outro PDF
//
// O PDF tem uma secção por geração ("Fundadoras - 11/11/1991", "-2º Geração - 1992", …, "26º Geração - …")
// e, em cada uma, uma linha por tunante: "Alcunha - Nome de tuna" ou só o nome. O instrumento sai do nome
// de tuna (Violorum → Guitarra, Bandolinus → Bandolim, …). O naipe de voz não vem no PDF: fica por preencher.
// Quem já está no site (com o mesmo nome, sem contar maiúsculas nem acentos) é saltada, por isso pode
// correr-se mais do que uma vez.
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';                   // o Node.js 20 não traz WebSocket; a biblioteca do Supabase precisa dele
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wqvwfcenabhossvrvwyj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_XIRacxmt64SWrRtxM6_WFg_59nqGTmI';
const SIMULAR = process.argv.includes('--simular');
const PDF = process.argv.slice(2).find(a => !a.startsWith('--')) || join(pastaTransferencias(), 'Cópia de portefolio tuna.pdf');
const INATIVA = 'Tunante Inativa';
const FUNDADORAS = -3;                 // as fundadoras vêm antes da geração -2 (igual em frontend/src/main.js)

// Palavra do nome de tuna → instrumento do site. Vale a última palavra que corresponder.
const INSTRUMENTO = [
  [/^violin/, 'Violino'],
  [/^viol/, 'Guitarra'],
  [/^bandolin/, 'Bandolim'],
  [/^cavac/, 'Cavaquinho'],
  [/^pandeir/, 'Pandeireta'],
  [/^contrabaix/, 'Contra-baixo'],
  [/^estandart/, 'Estandarte'],
  [/^acordeon/, 'Acordeão'],
  [/^flaut/, 'Flauta transversal'],
  [/^aduf/, 'Percussão'],
];

// No Windows a pasta Transferências pode estar noutro disco: pergunta-se ao registo onde está.
function pastaTransferencias() {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
      '/v', '{374DE290-123F-4565-9164-39C4925E467B}'], { encoding: 'utf8' });
    const dir = out.match(/REG_\w+\s+(.+)/)?.[1].trim().replace(/%(\w+)%/g, (_, v) => process.env[v] ?? '');
    if (dir) return dir;
  } catch { /* fora do Windows */ }
  return join(homedir(), 'Downloads');
}

const semAcentos =s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const chave = s => semAcentos(String(s || '')).toLowerCase().replace(/\s+/g, ' ').trim();

/* ---------- PDF ---------- */
async function linhasDoPdf(file) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
  const linhas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const { items } = await (await doc.getPage(p)).getTextContent();
    let atual = '';
    for (const it of items) {
      atual += it.str;
      if (it.hasEOL) { linhas.push(atual); atual = ''; }
    }
    linhas.push(atual);
  }
  return linhas.map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function instrumentoDe(nomeTuna) {
  let achado = null;
  for (const palavra of chave(nomeTuna).split(/[\s-]+/)) {
    const m = INSTRUMENTO.find(([re]) => re.test(palavra));
    if (m) achado = m[1];
  }
  return achado;
}

function lerTunantes(linhas) {
  const tunantes = [];
  let geracao;                         // undefined até à secção das Fundadoras: o que vem antes é o cabeçalho
  for (const linha of linhas) {
    if (/^fundadoras\b/i.test(linha)) { geracao = FUNDADORAS; continue; }
    const g = linha.match(/^(-?\d+)\s*[ºª°o]?\s*gera[çc][ãa]o\b/i);
    if (g) { geracao = Number(g[1]); continue; }
    if (geracao === undefined) continue;

    // "Alcunha - Nome de tuna"; o hífen com espaços dos dois lados separa as duas partes ("Meia- Leca" é uma alcunha).
    const [alcunha, ...resto] = linha.split(/\s+-\s+/);
    const nomeTuna = resto.join(' - ') || alcunha;
    tunantes.push({
      nome: alcunha.replace(/-\s+/g, '-').trim(),
      nomeTuna,
      geracao,
      instrumentos: [instrumentoDe(nomeTuna)].filter(Boolean),
    });
  }
  return tunantes;
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

const fmtGeracao = g => g === FUNDADORAS ? 'Fundadoras' : `${g}.ª geração`;

async function main() {
  console.log(`A ler ${PDF}…`);
  const tunantes = lerTunantes(await linhasDoPdf(PDF));
  if (!tunantes.length) throw new Error('Não encontrei tunantes no PDF (faltam as secções "Fundadoras" e "Xº Geração").');

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false }, realtime: { transport: ws } });
  const { data: membros, error } = await sb.from('membros').select('nome, ordem');
  if (error) throw new Error(`Não consegui ler os membros do site: ${error.message}`);

  // Salta quem já está no site e quem aparece duas vezes no PDF.
  const vistos = new Set(membros.map(m => chave(m.nome)));
  const novas = [], jaExistem = [];
  for (const t of tunantes) {
    const k = chave(t.nome);
    if (vistos.has(k)) { jaExistem.push(t); continue; }
    vistos.add(k);
    novas.push(t);
  }

  let geracaoAtual;
  for (const t of novas) {
    if (t.geracao !== geracaoAtual) console.log(`\n  ${fmtGeracao(geracaoAtual = t.geracao)}`);
    console.log(`    ${t.nome} · ${t.instrumentos[0] || 'instrumento por preencher'}${t.nome === t.nomeTuna ? '' : ` (${t.nomeTuna})`}`);
  }
  console.log(`\nResumo
  No PDF:            ${tunantes.length}
  Já estão no site:  ${jaExistem.length}${jaExistem.length ? ` (${jaExistem.map(t => t.nome).join(', ')})` : ''}
  Novas a importar:  ${novas.length}
  Sem instrumento:   ${novas.filter(t => !t.instrumentos.length).length}`);

  if (SIMULAR) { console.log('\nSimulação: nada foi alterado.'); return; }
  if (!novas.length) { console.log('\nNada a importar.'); return; }

  const user = (await ask('\nUtilizador (admin): ')).toLowerCase();
  const password = await askHidden('Palavra-passe: ');
  const { error: loginError } = await sb.auth.signInWithPassword({ email: `${user}@tufeisep.local`, password });
  if (loginError) throw new Error('Utilizador ou palavra-passe errados.');
  const { data: papel } = await sb.rpc('meu_papel');
  if (papel !== 'admin') throw new Error('Só a conta admin pode acrescentar membros.');

  // Ficam no fim da ordem atual, pela ordem do PDF.
  let ordem = Math.max(0, ...membros.map(m => m.ordem ?? 0));
  const linhas = novas.map(t => ({ nome: t.nome, estado: INATIVA, geracao: t.geracao, instrumentos: t.instrumentos, ordem: ++ordem }));
  const { error: insertError } = await sb.from('membros').insert(linhas);
  if (insertError) throw new Error(`A importação falhou (nada foi gravado): ${insertError.message}`);
  console.log(`\nConcluído: ${novas.length} tunantes inativas acrescentadas ao site, ${jaExistem.length} já existiam.`);
}

main().then(() => process.exit(0)).catch(err => { console.error(`\n✗ ${err.message}`); process.exit(1); });
