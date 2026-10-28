-- FE'TUFEISEP: o festival da tuna. Cada linha é uma edição, com o cartaz, as tunas a concurso e os prémios.
-- Corra uma vez em Supabase > SQL Editor.
create table if not exists edicoes (
  id         bigint generated always as identity primary key,
  numero     int,                                  -- 1.ª, 2.ª… edição
  data       date,                                 -- dia do festival (ou só o ano, em baixo)
  ano        int,
  local      text,
  cartaz     text,                                 -- imagem no armazenamento "fotos"
  descricao  text,
  tunas      jsonb not null default '[]',          -- ["Tuna X", "Tuna Y"]
  premios    jsonb not null default '[]',          -- ["Melhor Tuna: Tuna X", …]
  criado     timestamptz not null default now()
);

alter table edicoes enable row level security;
drop policy if exists "leitura publica" on edicoes;
drop policy if exists "escrita editores" on edicoes;
create policy "leitura publica" on edicoes for select using (true);
create policy "escrita editores" on edicoes for all to authenticated using (is_editor()) with check (is_editor());
