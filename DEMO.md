# Demo gratuita: GitHub Pages + Supabase

O site fica no GitHub Pages e os dados (texto e fotografias) ficam no Supabase. Os dois são gratuitos.

```
visitante ──▶ GitHub Pages (site) ──▶ Supabase (base de dados + fotografias)
```

## 1. Criar o projeto no Supabase

1. Crie uma conta em https://supabase.com e um projeto novo (região: Europe, por exemplo Frankfurt). Guarde a palavra-passe da base de dados.
2. Em **SQL Editor > New query**, cole o conteúdo de `supabase/schema.sql` e carregue em **Run**.
3. Em **Authentication > Sign In / Providers**, desligue **Allow new users to sign up**.
4. Em **Authentication > Users > Add user > Create new user**, crie a conta de edição com um email e uma palavra-passe. Esta é a palavra-passe que se escreve em "Editar arquivo". Marque **Auto Confirm User**.
5. Volte ao **SQL Editor** e autorize essa conta a editar:
   ```sql
   insert into editores (email) values ('o-email-que-usou@exemplo.com');
   ```
6. Em **Project Settings > API** (ou **Data API**), copie o **Project URL** e a chave **anon / publishable**.

## 2. Ligar o GitHub ao Supabase

No repositório do GitHub, em **Settings > Secrets and variables > Actions > Variables**, crie:

| Nome | Valor |
| --- | --- |
| `SUPABASE_URL` | Project URL do Supabase |
| `SUPABASE_ANON_KEY` | chave anon / publishable |
| `EDITOR_EMAIL` | email da conta de edição |

A chave anon pode ser pública: quem a tiver só consegue ler, porque as regras do `schema.sql` só deixam escrever a conta de edição.

## 3. Ativar o GitHub Pages

Em **Settings > Pages > Build and deployment > Source**, escolha **GitHub Actions**. Depois, em **Actions > Publicar site > Run workflow**, publique pela primeira vez.

O site fica em `https://<utilizador>.github.io/tuna-feminina-isep/`. Cada envio para o ramo `main` volta a publicá-lo.

## Testar localmente com o Supabase

Crie `frontend/.env.local` (fica fora do git):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_EDITOR_EMAIL=o-email-que-usou@exemplo.com
```

E corra `npm run dev -w frontend`. Sem este ficheiro, o site usa o backend Express local (`npm run dev`).

## Limites do plano gratuito

- 500 MB de base de dados e 1 GB de fotografias. Chega para milhares de membros e algumas centenas de fotos.
- Um projeto sem visitas durante 7 dias fica em pausa. Os dados não se perdem: reativa-se no painel do Supabase com um clique.
- O plano gratuito não tem cópias de segurança automáticas que se possam descarregar. Para guardar uma cópia, use **Database > Backups** ou exporte cada tabela em CSV no **Table Editor**.

## Área reservada e contas

Há quatro contas, cada uma com um papel. No site entra-se com o nome de utilizador; o Supabase exige um email por conta, por isso cada uma tem um email interno `<utilizador>@tufeisep.local`, que não existe nem recebe emails.

| Utilizador no site | Email interno no Supabase | Pode |
| --- | --- | --- |
| `admin` | admin@tufeisep.local | editar todo o site e gerir o repertório |
| `dirmusical` | dirmusical@tufeisep.local | gerir o repertório (músicas, ficheiros, ligações) |
| `tunantes` | tunantes@tufeisep.local | ver a área reservada |
| `caloiras` | caloiras@tufeisep.local | ver a área reservada |

1. Em **Authentication > Users > Add user > Create new user**, crie as quatro contas com **Auto Confirm User**. Como os emails não existem, as palavras-passe não se recuperam por email: trocam-se sempre no painel.
2. Corra `supabase/migracoes/007_area_reservada.sql` no **SQL Editor**.
3. Para trocar uma palavra-passe, use **Authentication > Users**, nos três pontos ao lado da conta.

Os papéis estão na tabela `perfis`. Os ficheiros do repertório ficam no armazenamento privado `musica` (máximo de 50 MB por ficheiro; o plano gratuito tem 1 GB no total).
