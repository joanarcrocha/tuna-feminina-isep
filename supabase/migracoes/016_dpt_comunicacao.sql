-- Departamento de Comunicação: a conta dptcomunicacao gere os Registos (fotografias e álbuns).
-- Corra uma vez em Supabase > SQL Editor, depois da 014 e da 015.
-- Crie também a conta em Authentication > Users > Add user: dptcomunicacao@tufeisep.local (Auto Confirm).

-- Novo papel "comunicacao".
alter table perfis drop constraint if exists perfis_papel_check;
alter table perfis add constraint perfis_papel_check
  check (papel in ('admin', 'dirmusical', 'tunante', 'caloira', 'comunicacao'));
insert into perfis (email, papel) values ('dptcomunicacao@tufeisep.local', 'comunicacao')
on conflict (email) do update set papel = excluded.papel;

create or replace function gere_registos() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() in ('admin', 'comunicacao'), false);
$$;

-- Registos e eventos: acrescentar, editar e apagar.
drop policy if exists "registos gere" on registos;
create policy "registos gere" on registos for all to authenticated using (gere_registos()) with check (gere_registos());
drop policy if exists "registos gere" on eventos;
create policy "registos gere" on eventos for all to authenticated using (gere_registos()) with check (gere_registos());

-- Álbuns novos a partir dos Registos: pode criar festivais e marcos (editar e apagar continua só com a Administração).
drop policy if exists "registos criam" on festivais;
create policy "registos criam" on festivais for insert to authenticated with check (gere_registos());
drop policy if exists "registos criam" on marcos;
create policy "registos criam" on marcos for insert to authenticated with check (gere_registos());

-- Enviar fotografias para o armazenamento "fotos".
drop policy if exists "fotos: registos enviam" on storage.objects;
create policy "fotos: registos enviam" on storage.objects
  for insert to authenticated with check (bucket_id = 'fotos' and gere_registos());
