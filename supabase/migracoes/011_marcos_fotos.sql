-- Linha temporal da história: cada marco pode ter várias fotografias.
-- Corra uma vez em Supabase > SQL Editor.
alter table marcos add column if not exists fotos jsonb not null default '[]';

-- A fotografia única antiga (se houver) passa para a lista.
update marcos set fotos = jsonb_build_array(foto) where foto is not null and fotos = '[]'::jsonb;
