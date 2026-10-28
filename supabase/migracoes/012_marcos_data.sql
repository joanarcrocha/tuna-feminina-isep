-- Linha temporal: data completa de cada marco (o ano continua a existir para os marcos sem data).
-- Corra uma vez em Supabase > SQL Editor.
alter table marcos add column if not exists data date;
