-- Arquivo da Tuna Feminina do ISEP no Supabase.
-- Corra este ficheiro inteiro uma vez em: Supabase > SQL Editor > New query.
-- Pode voltar a corrê-lo sem perder dados.

-- ---------- Tabelas ----------
create table if not exists info (
  id        int primary key default 1 check (id = 1),
  fundacao  int,
  lema      text,
  historia  text
);
insert into info (id) values (1) on conflict do nothing;

create table if not exists marcos (
  id      bigint generated always as identity primary key,
  ano     int not null,
  titulo  text not null,
  texto   text,
  foto    text,
  fotos   jsonb not null default '[]',
  criado  timestamptz not null default now()
);
alter table marcos add column if not exists fotos jsonb not null default '[]';  -- várias fotografias por marco
alter table marcos add column if not exists data date;                         -- dia exato, quando se sabe (o ano fica em ano)

create table if not exists membros (
  id            bigint generated always as identity primary key,
  nome          text not null,
  estado        text not null check (estado in ('Magíster', 'Veterana', 'Tunante', 'Caloira', 'Tunante Inativa')),
  instrumentos  jsonb not null default '[]',
  naipe         text check (naipe in ('Contralto', 'Mezzo', 'Soprano')),
  data_entrada  int,                         -- já não se usa: ver geracao
  geracao       int,
  foto          text,
  ordem         int,                         -- posição na lista do site
  criado        timestamptz not null default now()
);
alter table membros add column if not exists ordem int;
alter table membros add column if not exists geracao int;

-- A Magíster: só um membro de cada vez. Escolher uma nova passa a anterior a Tunante.
create or replace function so_uma_magister() returns trigger language plpgsql as $$
begin
  if new.estado = 'Magíster' then
    update membros set estado = 'Tunante' where estado = 'Magíster' and id is distinct from new.id;
  end if;
  return new;
end $$;

create unique index if not exists membros_uma_magister on membros (estado) where estado = 'Magíster';
drop trigger if exists so_uma_magister on membros;
create trigger so_uma_magister before insert or update of estado on membros
  for each row execute function so_uma_magister();

create table if not exists carrossel (
  id         bigint generated always as identity primary key,
  foto       text not null,
  descricao  text,
  criado     timestamptz not null default now()
);

create table if not exists fotos (
  id        bigint generated always as identity primary key,
  ficheiro  text not null,
  legenda   text,
  ano       int,
  criado    timestamptz not null default now()
);

create table if not exists festivais (
  id       bigint generated always as identity primary key,
  nome     text not null,
  local    text,
  data     date,
  premios  jsonb not null default '[]',
  outros   text,
  notas    text,
  lat      double precision,          -- coordenadas da cidade, para o mapa
  lng      double precision,
  criado   timestamptz not null default now()
);
alter table festivais add column if not exists lat double precision;
alter table festivais add column if not exists lng double precision;

-- FE'TUFEISEP: o festival da tuna, uma linha por edição.
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

-- ---------- Quem pode editar ----------
-- Só as contas cujo email esteja nesta tabela podem alterar o arquivo.
create table if not exists editores (email text primary key);

create or replace function is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from editores where email = auth.jwt() ->> 'email');
$$;

-- ---------- Regras de acesso ----------
-- Toda a gente lê; só editores escrevem.
do $$
declare t text;
begin
  foreach t in array array['info', 'marcos', 'carrossel', 'membros', 'fotos', 'festivais', 'edicoes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "leitura publica" on %I', t);
    execute format('drop policy if exists "escrita editores" on %I', t);
    execute format('create policy "leitura publica" on %I for select using (true)', t);
    execute format('create policy "escrita editores" on %I for all to authenticated using (is_editor()) with check (is_editor())', t);
  end loop;
end $$;

alter table editores enable row level security;  -- sem políticas: invisível para o site

-- ---------- Fotografias ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "fotos: editores enviam" on storage.objects;
drop policy if exists "fotos: editores alteram" on storage.objects;
create policy "fotos: editores enviam" on storage.objects
  for insert to authenticated with check (bucket_id = 'fotos' and is_editor());
create policy "fotos: editores alteram" on storage.objects
  for update to authenticated using (bucket_id = 'fotos' and is_editor());
-- Não há política de apagar: as fotos ficam guardadas mesmo que o registo seja apagado.

-- ---------- Editora ----------
-- Troque pelo email da conta que criou em Authentication > Users e corra só esta linha.
-- insert into editores (email) values ('o-seu-email@exemplo.com') on conflict do nothing;
