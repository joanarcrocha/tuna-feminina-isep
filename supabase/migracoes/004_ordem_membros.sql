-- Ordem dos membros no site (a Magíster aparece sempre primeiro).
-- Corra uma vez em Supabase > SQL Editor.
alter table membros add column if not exists ordem int;

-- Hierarquia das tunantes em outubro de 2026.
update membros m set ordem = v.ordem
from (values
  (3, 0),    -- Candace (Magíster)
  (10, 1),   -- Hashtag
  (14, 2),   -- Pucca
  (4, 3),    -- Bambina
  (17, 4),   -- Trampolins
  (20, 5),   -- Wally
  (19, 6),   -- UberEats
  (11, 7),   -- Melody
  (8, 8),    -- Flash
  (2, 9),    -- Traço
  (7, 10),   -- Emiliana
  (16, 11),  -- Temida
  (5, 12),   -- Bordas
  (13, 13),  -- Paparazzi
  (15, 14),  -- Rampoila
  (18, 15),  -- TremeTreme
  (12, 16),  -- Novum
  (6, 17),   -- Chica da Concertina
  (9, 18)    -- Gretchen
) as v(id, ordem)
where m.id = v.id;
