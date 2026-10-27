-- Importação do Drive Musical. Corra uma vez em Supabase > SQL Editor, depois da 007.

-- De onde veio cada música e cada ficheiro (permite correr a importação outra vez sem duplicar).
alter table musicas add column if not exists drive_id text unique;
alter table musica_ficheiros add column if not exists drive_id text unique;

-- Ficheiros agrupados por pasta, por exemplo "Vozes · Sopranos" ou "Instrumentos · Guitarras".
alter table musica_ficheiros add column if not exists grupo text;

-- Ficheiros grandes (vídeos) ficam no Drive: guardamos só a ligação.
alter table musica_ficheiros add column if not exists url text;
alter table musica_ficheiros alter column caminho drop not null;
alter table musica_ficheiros drop constraint if exists musica_ficheiros_origem;
alter table musica_ficheiros add constraint musica_ficheiros_origem check (caminho is not null or url is not null);
