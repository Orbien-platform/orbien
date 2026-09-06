# Orbien

Monorepo da plataforma Orbien — gerenciado com **npm workspaces + Turborepo**.

## Estrutura

```
apps/
  api/    NestJS + Prisma  → Docker no Render        (orbien-backend)
  site/   Next.js          → Vercel (site público)   (orbien-site)
  web/    Next.js          → Vercel (app logado)     (orbien-web)
```

Cada app continua com deploy **independente**: a API não vai para a Vercel e
os dois fronts permanecem em projetos Vercel separados.

## Requisitos

- Node 22 (`.nvmrc`)
- npm 11+

## Instalação

```bash
npm install     # instala todos os workspaces a partir da raiz
```

Um único `package-lock.json` na raiz. Não rode `npm install` dentro de `apps/*`.

## Desenvolvimento

```bash
npm run dev          # sobe os três em paralelo
npm run dev:api      # NestJS  — :3000
npm run dev:web      # Next.js — :3001
npm run dev:site     # Next.js — :3002
```

## Build

```bash
npm run build              # tudo, com cache do Turborepo
npm run build:api          # só a API
npm run build:web          # só o app
```

## Banco de dados (Prisma — workspace da API)

```bash
npm run db:generate
npm run db:migrate -- nome_da_migration
npm run db:migrate:status
npm run db:seed
npm run db:studio
```

## Variáveis de ambiente

Não são centralizadas — cada app mantém as suas:

- `apps/api/.env`
- `apps/web/.env.local`, `apps/web/.env.production`

## Deploy

| App | Plataforma | Configuração |
|---|---|---|
| `apps/api` | Render (Docker) | `apps/api/render.yaml` — build context é a **raiz** do repo |
| `apps/site` | Vercel | Root Directory = `apps/site` |
| `apps/web` | Vercel | Root Directory = `apps/web` |

Passo a passo completo de configuração das plataformas: [`DEPLOY.md`](DEPLOY.md).
Estrutura interna do monorepo: [`docs/MONOREPO.md`](docs/MONOREPO.md).

## Documentação de produto e roadmap

- [`docs/ROADMAP.md`](docs/ROADMAP.md) — o que já foi entregue, onde o plano
  original ficou para trás e a visão de próximos ciclos de entrega.
- [`docs/produto/`](docs/produto/README.md) — ADRs, especificação de
  produto, pricing, mapeamento LGPD, minutas de contrato e briefings de
  sprint que guiaram o desenvolvimento.
