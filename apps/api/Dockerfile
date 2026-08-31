# Build context = raiz do monorepo (ver dockerContext em apps/api/render.yaml)
#
# Stage 1: builder
FROM node:22-alpine AS builder

WORKDIR /app

# Manifests do root + do workspace da API (cache de layer do npm ci)
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma/

# Instala apenas o root + o workspace da API (não baixa deps de site/web)
RUN npm ci --workspace orbien-backend --include-workspace-root

COPY apps/api ./apps/api

RUN npm run db:generate -w orbien-backend \
 && npm run build -w orbien-backend \
 && npm prune --omit=dev

# Stage 2: runner
FROM node:22-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
