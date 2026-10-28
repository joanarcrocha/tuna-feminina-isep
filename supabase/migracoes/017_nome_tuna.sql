-- Nome de tuna de cada membro (ex.: "Cardinalis Graciosus Pandeiretus"), mostrado por baixo da alcunha.
-- Corra uma vez em Supabase > SQL Editor.
alter table membros add column if not exists nome_tuna text;

update membros m set nome_tuna = v.nome_tuna
from (values
  ('Hashtag',    'Cardinalis Graciosus Pandeiretus'),
  ('Pucca',      'Puccinis Descontraidus Transversalis'),
  ('Bambina',    'Bambinis Pavarotis Acordeonatis'),
  ('Pocket',     'Aljibeirus Sensatis Bandolinus'),
  ('Panda',      'Pandeiristus Cariocae Cavacorum'),
  ('Jolim',      'Banjolinis Monofinus Stradivarius'),
  ('Trampolins', 'Bestis Impetuosus Estandartus'),
  ('Wally',      'Ocultus Hipnotizae Pandeiretus'),
  ('UberEats',   'Audimobilis Harmoniosus Ritmadus'),
  ('Melody',     'Oceanis Pacificae Bandolinus'),
  ('Flash',      'Relampagus Indecisus Violorum'),
  ('Traço',      'Rabiscus Pirosae Violorum'),
  ('Emiliana',   'Emiliae Hiperventilatis Ritmadus'),
  ('Temida',     'Temidus Broeirus Estandartus'),
  ('Candace',    'Imaginarius Julgatis Bandolinus'),
  ('Bordas',     'Doraimundus Aluadus Acordeonatis'),
  ('Paparazzi',  'Paparazzis Creativus Pandeiretus'),
  ('Rampoila',   'Papoilus Canecae Saxofonicus')
) as v (nome, nome_tuna)
where lower(m.nome) = lower(v.nome);
