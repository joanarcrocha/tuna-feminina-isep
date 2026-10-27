-- A Magíster passa a ser uma hierarquia (só uma, e conta como Tunante).
-- Substitui a 002. Corra uma vez em Supabase > SQL Editor; funciona tenha ou não corrido a 002.

alter table membros drop constraint if exists membros_estado_check;
alter table membros add constraint membros_estado_check
  check (estado in ('Magíster', 'Veterana', 'Tunante', 'Caloira'));

-- Se a 002 foi corrida, passa a Magíster marcada para a hierarquia nova e remove o campo antigo.
drop trigger if exists so_uma_magister on membros;
drop index if exists membros_uma_magister;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'membros' and column_name = 'magister') then
    update membros set estado = 'Magíster' where magister;
    alter table membros drop column magister;
  end if;
end $$;

create or replace function so_uma_magister() returns trigger language plpgsql as $$
begin
  if new.estado = 'Magíster' then
    update membros set estado = 'Tunante' where estado = 'Magíster' and id is distinct from new.id;
  end if;
  return new;
end $$;

create unique index membros_uma_magister on membros (estado) where estado = 'Magíster';
create trigger so_uma_magister before insert or update of estado on membros
  for each row execute function so_uma_magister();
