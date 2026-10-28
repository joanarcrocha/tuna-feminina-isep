-- Registos: eventos (jantares, aniversários, serenatas, atuações…) como terceiro tipo de álbum.
-- Corra uma vez em Supabase > SQL Editor, depois da 014.
create table if not exists eventos (
  id      bigint generated always as identity primary key,
  nome    text not null,
  local   text,
  data    date,
  ano     int,
  criado  timestamptz not null default now()
);
alter table eventos enable row level security;
drop policy if exists "leitura publica" on eventos;
drop policy if exists "escrita editores" on eventos;
create policy "leitura publica" on eventos for select using (true);
create policy "escrita editores" on eventos for all to authenticated using (is_editor()) with check (is_editor());

alter table registos add column if not exists evento_id bigint references eventos (id) on delete set null;
