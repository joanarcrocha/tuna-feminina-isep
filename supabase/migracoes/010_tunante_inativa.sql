-- Nova hierarquia "Tunante Inativa". Corra uma vez em Supabase > SQL Editor.
-- A Veterana continua permitida na base de dados, mas deixou de aparecer no site até haver alguma.
alter table membros drop constraint if exists membros_estado_check;
alter table membros add constraint membros_estado_check
  check (estado in ('Magíster', 'Veterana', 'Tunante', 'Caloira', 'Tunante Inativa'));
