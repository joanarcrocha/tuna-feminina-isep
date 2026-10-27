# 1) Compila o site (frontend)
FROM node:20-bookworm-slim AS site
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci -w frontend
COPY frontend frontend
RUN npm run build -w frontend

# 2) Instala só as dependências de produção do backend
FROM node:20-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci -w backend --omit=dev

# 3) Imagem final: backend + site compilado
FROM node:20-bookworm-slim
ENV NODE_ENV=production PORT=3001 DATA_DIR=/data BACKUP_DIR=/backups
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY backend backend
COPY --from=site /app/frontend/dist frontend/dist
RUN mkdir -p /data /backups && chown node:node /data /backups
USER node
VOLUME ["/data", "/backups"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:3001/api/saude').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "backend/src/server.js"]
