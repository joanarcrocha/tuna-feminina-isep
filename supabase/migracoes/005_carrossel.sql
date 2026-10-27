-- Carrossel de fotografias da secção "A nossa história".
-- Corra uma vez em Supabase > SQL Editor.
create table if not exists carrossel (
  id         bigint generated always as identity primary key,
  foto       text not null,
  descricao  text,
  criado     timestamptz not null default now()
);

alter table carrossel enable row level security;
drop policy if exists "leitura publica" on carrossel;
drop policy if exists "escrita editores" on carrossel;
create policy "leitura publica" on carrossel for select using (true);
create policy "escrita editores" on carrossel for all to authenticated using (is_editor()) with check (is_editor());
