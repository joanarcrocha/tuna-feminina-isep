# Pôr o site online

O site, a API, a base de dados e as fotografias correm num único servidor com Docker. O Caddy fica à frente: liga o domínio e trata do certificado HTTPS sozinho.

```
visitante ──https──▶ Caddy (80/443) ──▶ app (Node + SQLite) ──▶ volume "arquivo" (base de dados + fotos)
                                                          └──▶ volume "backups" (cópias diárias)
```

## 1. O que é preciso

| O quê | Sugestão | Custo aproximado |
| --- | --- | --- |
| Domínio | `.pt` num registador como PTisp, Amen ou Dominios.pt | 10–20 € por ano |
| Servidor (VPS) | Hetzner CX22 (Alemanha ou Finlândia), Ubuntu 24.04 | cerca de 4–5 € por mês |

Qualquer VPS com Linux, 2 GB de RAM e Docker serve.

## 2. Apontar o domínio para o servidor

No painel do registador, crie dois registos DNS com o IP do servidor:

| Tipo | Nome | Valor |
| --- | --- | --- |
| A | `@` | IP do servidor |
| A | `www` | IP do servidor |

A propagação pode demorar de minutos a algumas horas.

## 3. Preparar o servidor

Entre no servidor (`ssh root@IP`) e instale o Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

Abra apenas as portas necessárias:

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 4. Enviar o projeto

A partir do seu computador, na pasta do projeto (sem `node_modules`):

```bash
scp -r Dockerfile docker-compose.yml .dockerignore .env.example package.json package-lock.json backend frontend deploy root@IP:/opt/tufeisep/
```

Em alternativa, coloque o projeto num repositório privado no GitHub e faça `git clone` no servidor. É também a melhor forma de trabalharmos os dois no código.

> `scp -r backend` envia também `backend/.env` e `backend/data` se existirem. Não fazem mal, porque o Docker ignora-os, mas pode apagá-los do servidor.

## 5. Configurar e arrancar

No servidor:

```bash
cd /opt/tufeisep
cp .env.example .env
nano .env        # DOMAIN=o-seu-dominio.pt e ADMIN_PASSWORD=uma palavra-passe longa
docker compose up -d --build
```

Ao fim de um minuto, o site está em `https://o-seu-dominio.pt`. Para ver o que se passa:

```bash
docker compose ps
docker compose logs -f
```

## 6. Levar os dados que já tem no computador (opcional)

Se já preencheu o arquivo localmente, envie a pasta `backend/data` para o servidor e copie-a para dentro do contentor:

```bash
# no computador
scp -r backend/data root@IP:/opt/tufeisep/dados-locais

# no servidor
cd /opt/tufeisep
docker compose stop app
docker compose cp dados-locais/. app:/data/
docker compose run --rm -u root --entrypoint chown app -R node:node /data
docker compose start app
```

## 7. Atualizar o site depois de mudanças no código

Envie os ficheiros novos (ou `git pull`) e reconstrua:

```bash
docker compose up -d --build
```

Os dados ficam nos volumes e não são tocados.

## 8. Cópias de segurança

- O servidor faz uma cópia da base de dados ao arrancar e depois todos os dias, e guarda as últimas 30 no volume `backups`.
- As fotografias apagadas ficam em `/data/apagadas`, dentro do volume `arquivo`.
- **Guarde cópias fora do servidor.** Pelo menos uma vez por semana, traga tudo para o seu computador:

```bash
# no servidor: junta a base de dados e as fotos num só ficheiro
cd /opt/tufeisep
docker compose exec app node backend/src/backup.js
docker compose cp app:/data ./copia && docker compose cp app:/backups ./copia/backups
tar czf arquivo-$(date +%F).tar.gz copia && rm -rf copia

# no computador
scp root@IP:/opt/tufeisep/arquivo-*.tar.gz .
```

A Hetzner também oferece cópias automáticas do servidor inteiro (Backups, +20% do preço). Vale a pena ativá-las.

### Restaurar uma cópia

```bash
docker compose stop app
docker compose cp arquivo-AAAA-MM-DD.db app:/data/arquivo.db
docker compose run --rm -u root --entrypoint sh app -c "rm -f /data/arquivo.db-wal /data/arquivo.db-shm && chown -R node:node /data"
docker compose start app
```

## Site em construção

Enquanto `SITE_PASSWORD` estiver preenchida no `.env`, quem visita `tufeisep.com` vê só a página "Em construção" com um campo de palavra-passe. O bloqueio é feito no servidor: sem a palavra-passe não se recebe o site, a API nem as fotografias. Depois de entrar, o acesso fica guardado 30 dias nesse navegador.

Para abrir o site ao público, deixe `SITE_PASSWORD=` vazia e corra `docker compose up -d`.

## Segurança

- Só quem sabe a `ADMIN_PASSWORD` pode editar. Partilhe-a apenas com quem gere o arquivo e troque-a quando alguém sai: mude-a no `.env` e corra `docker compose up -d`.
- Ao fim de 10 tentativas erradas, o IP fica bloqueado durante 15 minutos.
- O HTTPS é obrigatório e é renovado automaticamente pelo Caddy.
