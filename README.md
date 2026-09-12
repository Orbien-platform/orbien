# Orbien

Monorepo da plataforma Orbien — gerenciado com **npm workspaces + Turborepo**.

## Estrutura

```
apps/
  api/     NestJS + Prisma      → Render, runtime Node    (orbien-backend)
  site/    Next.js              → Vercel (site público)   (orbien-site)
  web/     Next.js              → Vercel (app logado)     (orbien-web)
  admin/   Next.js              → Vercel (subdomínio admin.)  (orbien-admin)
  mobile/  Expo + React Native  → EAS Build (iOS/Android) (orbien-mobile)
```

Cada app continua com deploy **independente**: a API não vai para a Vercel, os
três fronts ficam em projetos Vercel separados, e o mobile não passa por
nenhuma das duas — sai por EAS Build.

`apps/admin` é o console da plataforma (opera **acima** dos tenants; dado de
igreja não passa por lá). `apps/mobile` é o app do membro e da liderança, e
fala direto com a API por Bearer token — não usa o `/api-proxy` do `web`.

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
npm run dev          # sobe todos em paralelo
npm run dev:api      # NestJS  — :3000
npm run dev:web      # Next.js — :3001
npm run dev:site     # Next.js — :3002
npm run dev:admin    # Next.js — :3003
npm run dev:mobile   # Expo (Metro) — abre no dispositivo ou emulador
```

## Build

```bash
npm run build              # tudo, com cache do Turborepo
npm run build:api          # só a API
npm run build:web          # só o app
npm run build:admin        # só o console da plataforma
npm run build:site         # só o site público
npm run build:mobile       # typecheck + expo export do mobile
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
- `apps/admin/.env.local`
- `apps/mobile`: não usa `.env` — identidade e URL da API são resolvidas por
  `app.config.js` a partir do profile do `eas.json`

## Deploy

| App | Plataforma | Configuração |
|---|---|---|
| `apps/api` | Render, **runtime Node** | `render.yaml` na raiz documenta o serviço; build e start rodam da **raiz** |
| `apps/site` | Vercel | Root Directory = `apps/site` |
| `apps/web` | Vercel | Root Directory = `apps/web` |
| `apps/admin` | Vercel | Root Directory = `apps/admin`; subdomínio `admin.` |
| `apps/mobile` | EAS Build | Profiles em `apps/mobile/eas.json`; build de preview no CI quando o diff toca `apps/mobile` |

> O `Dockerfile` de `apps/api` existe e funciona, mas **não** é o que o Render
> executa — o serviço usa runtime Node. Ver `render.yaml` na raiz.

Passo a passo completo de configuração das plataformas: [`DEPLOY.md`](DEPLOY.md)
(hoje cobre API, site, web e admin; o mobile está documentado em
[`apps/mobile/README.md`](apps/mobile/README.md), seção "Build profiles").
Estrutura interna do monorepo: [`docs/MONOREPO.md`](docs/MONOREPO.md).

## Documentação de produto e roadmap

- [`docs/PLANO.md`](docs/PLANO.md) — **fonte única**: o que já foi entregue, o
  que o material de produto prevê e não existe, as pendências abertas, os
  ajustes e as decisões de produto em aberto. Cada item aberto tem ID.
- [`docs/PENDENCIAS.md`](docs/PENDENCIAS.md) — arquivo histórico dos achados
  já fechados, com a evidência e a decisão de cada um.
- [`docs/produto/`](docs/produto/README.md) — ADRs, especificação de
  produto, pricing, mapeamento LGPD, minutas de contrato e briefings de
  sprint que guiaram o desenvolvimento.
