-- Acrescenta a Magíster aos membros. Corra uma vez em Supabase > SQL Editor.
alter table membros add column if not exists magister boolean not null default false;
create unique index if not exists membros_uma_magister on membros (magister) where magister;

create or replace function so_uma_magister() returns trigger language plpgsql as $$
begin
  if new.magister then
    update membros set magister = false where magister and id is distinct from new.id;
  end if;
  return new;
end $$;

drop trigger if exists so_uma_magister on membros;
create trigger so_uma_magister before insert or update of magister on membros
  for each row execute function so_uma_magister();
