-- Geração a que cada membro pertence (por exemplo 28), em vez do ano de entrada.
-- Corra uma vez em Supabase > SQL Editor. A coluna data_entrada fica como estava, para não perder dados.
alter table membros add column if not exists geracao int;
