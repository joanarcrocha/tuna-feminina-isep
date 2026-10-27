import { Router } from 'express';
import { db } from './db.js';
import { verify, requireAuth } from './auth.js';
import { upload, removeUpload } from './uploads.js';

// Colunas que cada recurso aceita. O nome da tabela vem sempre desta lista, nunca do pedido.
const RESOURCES = {
  marcos:    { text: ['titulo', 'texto', 'foto'], int: ['ano'], required: ['ano', 'titulo'], files: ['foto'] },
  membros:   { text: ['nome', 'estado', 'naipe', 'foto'], int: ['data_entrada'], json: ['instrumentos'], required: ['nome', 'estado'], files: ['foto'] },
  fotos:     { text: ['ficheiro', 'legenda'], int: ['ano'], required: ['ficheiro'], files: ['ficheiro'] },
  festivais: { text: ['nome', 'local', 'data', 'outros', 'notas'], int: [], json: ['premios'], required: ['nome'], files: [] },
};
const INFO = { text: ['lema', 'historia'], int: ['fundacao'], required: [] };

const columns = spec => [...spec.text, ...spec.int, ...(spec.json || [])];

// Só pode haver uma Magíster: ao escolher uma nova, a anterior passa a Tunante.
function umaMagister(table, id, data) {
  if (table === 'membros' && data.estado === 'Magíster') {
    db.prepare(`UPDATE membros SET estado = 'Tunante' WHERE estado = 'Magíster' AND id != ?`).run(id);
  }
}

function clean(spec, body = {}) {
  const out = {};
  for (const k of spec.text) {
    const v = typeof body[k] === 'string' ? body[k].trim().slice(0, 20000) : '';
    out[k] = v || null;
  }
  for (const k of spec.int) {
    const n = Number.parseInt(body[k], 10);
    out[k] = Number.isFinite(n) ? n : null;
  }
  for (const k of spec.json || []) {
    const arr = Array.isArray(body[k]) ? body[k].filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean) : [];
    out[k] = JSON.stringify(arr.slice(0, 50));
  }
  const missing = spec.required.find(k => out[k] == null);
  if (missing) throw Object.assign(new Error(`Falta o campo “${missing}”.`), { status: 400 });
  return out;
}

function parse(spec, row) {
  if (!row) return row;
  for (const k of spec.json || []) row[k] = JSON.parse(row[k] || '[]');
  return row;
}

const getResource = (req, res, next) => {
  req.spec = RESOURCES[req.params.recurso];
  if (!req.spec) return res.status(404).json({ erro: 'Recurso desconhecido.' });
  next();
};

export const api = Router();

api.post('/login', (req, res) => {
  if (verify(req, res, req.body?.password ?? '', 'Palavra-passe errada.')) res.json({ ok: true });
});

// Usado pelo Docker para saber se o servidor está de pé.
api.get('/saude', (req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ ok: true });
});

api.get('/info', (req, res) => {
  res.json(db.prepare('SELECT fundacao, lema, historia FROM info WHERE id = 1').get());
});

api.put('/info', requireAuth, (req, res) => {
  const data = clean(INFO, req.body);
  const cols = columns(INFO);
  db.prepare(`UPDATE info SET ${cols.map(c => `${c} = @${c}`).join(', ')} WHERE id = 1`).run(data);
  res.json(db.prepare('SELECT fundacao, lema, historia FROM info WHERE id = 1').get());
});

api.post('/uploads', requireAuth, upload.single('ficheiro'), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhuma imagem recebida.' });
  res.status(201).json({ ficheiro: req.file.filename });
});

api.get('/:recurso', getResource, (req, res) => {
  const rows = db.prepare(`SELECT * FROM ${req.params.recurso} ORDER BY id`).all();
  res.json(rows.map(r => parse(req.spec, r)));
});

api.post('/:recurso', requireAuth, getResource, (req, res) => {
  const { spec } = req, table = req.params.recurso;
  const data = clean(spec, req.body), cols = columns(spec);
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(c => '@' + c).join(', ')})`)
    .run(data);
  umaMagister(table, lastInsertRowid, data);
  res.status(201).json(parse(spec, db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(lastInsertRowid)));
});

api.put('/:recurso/:id', requireAuth, getResource, async (req, res) => {
  const { spec } = req, table = req.params.recurso;
  const before = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
  if (!before) return res.status(404).json({ erro: 'Registo não encontrado.' });
  const data = clean(spec, req.body), cols = columns(spec);
  db.prepare(`UPDATE ${table} SET ${cols.map(c => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({ ...data, id: before.id });
  umaMagister(table, before.id, data);
  for (const k of spec.files) if (before[k] && before[k] !== data[k]) await removeUpload(before[k]);
  res.json(parse(spec, db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(before.id)));
});

api.delete('/:recurso/:id', requireAuth, getResource, async (req, res) => {
  const { spec } = req, table = req.params.recurso;
  const before = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
  if (!before) return res.status(404).json({ erro: 'Registo não encontrado.' });
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(before.id);
  for (const k of spec.files) await removeUpload(before[k]);
  res.status(204).end();
});
