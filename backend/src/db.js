import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { DATA_DIR } from './config.js';

export const db = new Database(resolve(DATA_DIR, 'arquivo.db'));
db.pragma('journal_mode = WAL');
// Cada gravação só é confirmada depois de estar escrita no disco (sobrevive a falhas de energia).
db.pragma('synchronous = FULL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS info (
    id        INTEGER PRIMARY KEY CHECK (id = 1),
    fundacao  INTEGER,
    lema      TEXT,
    historia  TEXT
  );
  INSERT OR IGNORE INTO info (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS marcos (
    id      INTEGER PRIMARY KEY,
    ano     INTEGER NOT NULL,
    titulo  TEXT NOT NULL,
    texto   TEXT,
    foto    TEXT,
    criado  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS membros (
    id            INTEGER PRIMARY KEY,
    nome          TEXT NOT NULL,
    estado        TEXT,                        -- Veterana, Tunante ou Caloira
    instrumentos  TEXT NOT NULL DEFAULT '[]',  -- lista JSON
    naipe         TEXT,
    data_entrada  TEXT,                        -- ano de entrada na tuna (AAAA)
    foto          TEXT,
    criado        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS carrossel (
    id         INTEGER PRIMARY KEY,
    foto       TEXT NOT NULL,
    descricao  TEXT,
    criado     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fotos (
    id        INTEGER PRIMARY KEY,
    ficheiro  TEXT NOT NULL,
    legenda   TEXT,
    ano       INTEGER,
    criado    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS festivais (
    id       INTEGER PRIMARY KEY,
    nome     TEXT NOT NULL,
    local    TEXT,
    data     TEXT,
    premios  TEXT NOT NULL DEFAULT '[]',
    outros   TEXT,
    notas    TEXT,
    criado   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migração das bases criadas com a primeira versão (um só instrumento, ano de entrada, estado "Tuna").
const membrosCols = new Set(db.prepare('PRAGMA table_info(membros)').all().map(c => c.name));
if (!membrosCols.has('instrumentos')) {
  db.exec(`ALTER TABLE membros ADD COLUMN instrumentos TEXT NOT NULL DEFAULT '[]'`);
  db.exec(`UPDATE membros SET instrumentos = json_array(instrumento) WHERE instrumento IS NOT NULL`);
}
if (!membrosCols.has('naipe')) db.exec('ALTER TABLE membros ADD COLUMN naipe TEXT');
if (!membrosCols.has('data_entrada')) {
  db.exec('ALTER TABLE membros ADD COLUMN data_entrada TEXT');
  db.exec('UPDATE membros SET data_entrada = CAST(entrada AS TEXT) WHERE entrada IS NOT NULL');
}
db.exec(`UPDATE membros SET estado = 'Tunante' WHERE estado = 'Tuna'`);

const festivaisCols = new Set(db.prepare('PRAGMA table_info(festivais)').all().map(c => c.name));
if (!festivaisCols.has('lat')) db.exec('ALTER TABLE festivais ADD COLUMN lat REAL');
if (!festivaisCols.has('lng')) db.exec('ALTER TABLE festivais ADD COLUMN lng REAL');

if (!membrosCols.has('ordem')) db.exec('ALTER TABLE membros ADD COLUMN ordem INTEGER');

// A Magíster passou de opção à parte para hierarquia.
if (membrosCols.has('magister')) {
  db.exec(`UPDATE membros SET estado = 'Magíster' WHERE magister = 1`);
  db.exec('ALTER TABLE membros DROP COLUMN magister');
}

// Da entrada só se guarda o ano.
db.exec(`UPDATE membros SET data_entrada = substr(data_entrada, 1, 4) WHERE length(data_entrada) > 4`);

// Nomes oficiais dos naipes da tuna.
db.exec(`UPDATE membros SET naipe = 'Mezzo' WHERE naipe = 'Mezzo-soprano'`);
db.exec(`UPDATE membros SET instrumentos = replace(replace(instrumentos,
  '"Contrabaixo"', '"Contra-baixo"'), '"Flauta"', '"Flauta transversal"')`);
