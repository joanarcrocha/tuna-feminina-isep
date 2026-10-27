-- Coordenadas dos festivais, para o mapa. Corra uma vez em Supabase > SQL Editor.
alter table festivais add column if not exists lat double precision;
alter table festivais add column if not exists lng double precision;

-- Festivais registados até outubro de 2026 (coordenadas do OpenStreetMap).
update festivais f set lat = v.lat, lng = v.lng
from (values
  (1, 41.1502, -8.6103),   -- Porto
  (2, 41.1502, -8.6103),   -- Porto
  (4, 41.2699, -8.0805),   -- Amarante
  (5, 40.8498, -8.3939),   -- Vale de Cambra
  (6, 41.8061, -6.7567),   -- Bragança
  (7, 41.3878, -8.0002),   -- Celorico de Basto
  (8, 41.1502, -8.6103),   -- Porto
  (10, 41.1502, -8.6103),  -- Porto
  (9, 41.3440, -8.4772)    -- Santo Tirso
) as v(id, lat, lng)
where f.id = v.id;

-- Corrige o nome da localidade do V Tunacel.
update festivais set local = 'Celorico de Basto' where id = 7 and local = 'Celourico de Bastos';
