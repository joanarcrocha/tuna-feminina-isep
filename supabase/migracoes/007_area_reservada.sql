-- Área reservada: contas com papéis, repertório musical e ficheiros privados.
-- Corra uma vez em Supabase > SQL Editor, DEPOIS de criar as contas em Authentication > Users.

-- ---------- Papéis ----------
-- admin: edita tudo · dirmusical: gere o repertório · tunante e caloira: só veem a área reservada.
create table if not exists perfis (
  email  text primary key,
  papel  text not null check (papel in ('admin', 'dirmusical', 'tunante', 'caloira'))
);
alter table perfis enable row level security;  -- sem políticas: invisível para o site

insert into perfis (email, papel) values
  ('jr@joanarocha.com',              'admin'),
  ('tufeisep+dirmusical@gmail.com',  'dirmusical'),
  ('tufeisep+tunantes@gmail.com',    'tunante'),
  ('tufeisep+caloiras@gmail.com',    'caloira')
on conflict (email) do update set papel = excluded.papel;

create or replace function meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from perfis where email = auth.jwt() ->> 'email';
$$;
grant execute on function meu_papel() to authenticated;

-- O site público passa a ser editado só pela administração.
create or replace function is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() = 'admin', false);
$$;

create or replace function gere_musica() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() in ('admin', 'dirmusical'), false);
$$;

create or replace function e_membro() returns boolean
language sql stable security definer set search_path = public as $$
  select meu_papel() is not null;
$$;

-- ---------- Repertório ----------
create table if not exists musicas (
  id         bigint generated always as identity primary key,
  titulo     text not null,
  categoria  text not null check (categoria in ('Atuação', 'Pasecalles', 'Serenatas', 'Outras músicas')),
  letra      text,
  notas      text,
  link       text,
  criado     timestamptz not null default now()
);

create table if not exists musica_ficheiros (
  id         bigint generated always as identity primary key,
  musica_id  bigint not null references musicas (id) on delete cascade,
  nome       text not null,          -- nome original do ficheiro
  caminho    text not null unique,   -- caminho no armazenamento "musica"
  tipo       text,
  tamanho    bigint,
  criado     timestamptz not null default now()
);

create table if not exists ligacoes (
  id      bigint generated always as identity primary key,
  titulo  text not null,
  url     text not null,
  criado  timestamptz not null default now()
);

-- Membros (qualquer papel) leem; administração e direção musical gerem.
do $$
declare t text;
begin
  foreach t in array array['musicas', 'musica_ficheiros', 'ligacoes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "membros leem" on %I', t);
    execute format('drop policy if exists "musica gere" on %I', t);
    execute format('create policy "membros leem" on %I for select to authenticated using (e_membro())', t);
    execute format('create policy "musica gere" on %I for all to authenticated using (gere_musica()) with check (gere_musica())', t);
  end loop;
end $$;

insert into ligacoes (titulo, url)
select 'Drive Musical 24/25', 'https://drive.google.com/drive/folders/1ufmDpST6e6_zE8P4oZtSjulbQppf_xHy'
where not exists (select 1 from ligacoes where url = 'https://drive.google.com/drive/folders/1ufmDpST6e6_zE8P4oZtSjulbQppf_xHy');

-- ---------- Ficheiros privados (pautas, áudios, letras) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('musica', 'musica', false, 52428800)
on conflict (id) do update set public = false;

drop policy if exists "musica: membros leem" on storage.objects;
drop policy if exists "musica: gestao envia" on storage.objects;
drop policy if exists "musica: gestao altera" on storage.objects;
drop policy if exists "musica: gestao apaga" on storage.objects;
create policy "musica: membros leem" on storage.objects
  for select to authenticated using (bucket_id = 'musica' and e_membro());
create policy "musica: gestao envia" on storage.objects
  for insert to authenticated with check (bucket_id = 'musica' and gere_musica());
create policy "musica: gestao altera" on storage.objects
  for update to authenticated using (bucket_id = 'musica' and gere_musica());
create policy "musica: gestao apaga" on storage.objects
  for delete to authenticated using (bucket_id = 'musica' and gere_musica());
