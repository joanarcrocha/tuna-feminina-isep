# Tuna Feminina do ISEP

Site e arquivo da Tuna Feminina do ISEP: história, membros, fotografias e festivais.

## Estrutura

```
tuna-feminina-isep/
├── backend/            API em Node.js + Express, base de dados SQLite
│   ├── src/
│   │   ├── server.js   arranque do servidor
│   │   ├── routes.js   rotas /api (info, marcos, membros, fotos, festivais, uploads)
│   │   ├── db.js       esquema da base de dados
│   │   ├── auth.js     palavra-passe partilhada para editar
│   │   ├── uploads.js  envio de fotografias
│   │   └── config.js   variáveis de ambiente
│   ├── data/           base de dados e fotografias (criada sozinha, fora do git)
│   └── .env            configuração local (fora do git)
└── frontend/           site em HTML, CSS e JavaScript, servido pelo Vite
    ├── index.html
    └── src/
        ├── main.js     secções, formulários e galeria
        ├── api.js      chamadas ao backend
        ├── strings.js  as cordas animadas do topo
        └── style.css
```

## Começar

Precisa do Node.js 20 ou mais recente.

```bash
npm install
cp backend/.env.example backend/.env   # só na primeira vez, depois mude a ADMIN_PASSWORD
npm run dev
```

- Site: http://localhost:5173
- API: http://localhost:3001/api

Para editar o arquivo, carregue em **Editar arquivo** e use a `ADMIN_PASSWORD` do `backend/.env`.

## API

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/info` | Ano de fundação, lema e história |
| PUT | `/api/info` | Atualiza a informação (precisa de sessão) |
| GET | `/api/:recurso` | Lista `marcos`, `membros`, `fotos` ou `festivais` |
| POST | `/api/:recurso` | Cria um registo (precisa de sessão) |
| PUT | `/api/:recurso/:id` | Substitui um registo (precisa de sessão) |
| DELETE | `/api/:recurso/:id` | Apaga um registo e a fotografia associada (precisa de sessão) |
| POST | `/api/uploads` | Envia uma imagem no campo `ficheiro` e devolve o nome guardado |
| POST | `/api/login` | Confirma a palavra-passe |

Os pedidos com sessão levam o cabeçalho `Authorization: Bearer <ADMIN_PASSWORD>`.

## Produção

```bash
npm run build   # compila o frontend para frontend/dist
npm start       # o backend serve o site e a API na mesma porta
```

## Dados e cópias de segurança

Todo o arquivo está em `backend/data`:

| Pasta ou ficheiro | Conteúdo |
| --- | --- |
| `arquivo.db` | Base de dados SQLite (história, marcos, membros, festivais, legendas das fotos) |
| `uploads/` | Fotografias |
| `apagadas/` | Fotografias de registos apagados, para recuperar se for preciso |
| `backups/` | Cópia diária da base de dados, as últimas 30 |

- Cada gravação só é confirmada depois de estar escrita no disco.
- O backend faz uma cópia da base de dados ao arrancar e depois uma vez por dia. Para fazer uma na hora: `npm run backup -w backend`.
- Para restaurar: pare o servidor, substitua `arquivo.db` pela cópia que quiser e apague `arquivo.db-wal` e `arquivo.db-shm`.
- As cópias diárias só incluem a base de dados. Copie regularmente a pasta `backend/data` inteira, com as fotografias, para outro disco ou para a nuvem. Pode apontar `BACKUP_DIR` no `.env` para uma pasta sincronizada.
