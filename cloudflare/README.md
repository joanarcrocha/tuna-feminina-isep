# Site em construção na Cloudflare

`gate-worker.js` é um Cloudflare Worker (plano gratuito) que fica à frente de `tufeisep.com`. Quem não tem acesso vê a página "Em construção" com um campo de palavra-passe. Quem entra fica com um cookie assinado durante 30 dias. O bloqueio é feito nos servidores da Cloudflare, por isso o site só é enviado a quem sabe a palavra-passe.

## Ativar

1. No painel da Cloudflare: **Workers & Pages > Create > Create Worker**. Dê-lhe o nome `tufeisep-bloqueio` e carregue em **Deploy**.
2. **Edit code**: apague o exemplo, cole o conteúdo de `gate-worker.js` e carregue em **Deploy**.
3. **Settings > Variables and Secrets > Add**: tipo **Secret**, nome `SITE_PASSWORD`, valor a palavra-passe que quiser. Carregue em **Deploy**.
4. **Settings > Domains & Routes > Add > Route**: zona `tufeisep.com`, rota `tufeisep.com/*`, e escolha este Worker. Repita para `www.tufeisep.com/*`.
5. O registo DNS de `tufeisep.com` (e de `www`) tem de estar com a **nuvem cor de laranja** (Proxied). Sem isso, o Worker não vê os pedidos.

## Abrir o site ao público

Apague a rota (passo 4) ou apague o secret `SITE_PASSWORD`. Sem o secret, o Worker deixa tudo passar.

## Mudar a página de bloqueio

Edite os ficheiros em `backend/gate/`, corra `node scripts/build-gate-worker.mjs` e cole outra vez o novo `gate-worker.js` no painel.

## Limites

- O plano gratuito dá 100 000 pedidos por dia ao Worker. Chega para um site em construção.
- Os dados do Supabase continuam acessíveis a quem conhecer o endereço e a chave pública do projeto. O bloqueio esconde o site, não protege a base de dados (isso faz-se com as regras RLS do Supabase).
