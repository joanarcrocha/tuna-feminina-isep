-- Registos: galeria de fotografias, cada uma de um festival ou de um marco da linha temporal.
-- Corra uma vez em Supabase > SQL Editor.
create table if not exists registos (
  id          bigint generated always as identity primary key,
  ficheiro    text not null,                                        -- imagem no armazenamento "fotos"
  largura     int,                                                  -- para o mosaico não saltar enquanto carrega
  altura      int,
  legenda     text,
  festival_id bigint references festivais (id) on delete set null,
  marco_id    bigint references marcos (id) on delete set null,
  criado      timestamptz not null default now()
);

alter table registos enable row level security;
drop policy if exists "leitura publica" on registos;
drop policy if exists "escrita editores" on registos;
create policy "leitura publica" on registos for select using (true);
create policy "escrita editores" on registos for all to authenticated using (is_editor()) with check (is_editor());
