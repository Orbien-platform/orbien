# orbien-site

Site público da Orbien — Next.js 16 (App Router) + Tailwind 4.

Faz parte do [monorepo Orbien](../../README.md). As dependências são
gerenciadas por npm workspaces a partir da **raiz** do repositório.

## Desenvolvimento

A partir da raiz do monorepo:

```bash
npm install        # instala todos os workspaces (uma vez)
npm run dev:site
```

O site sobe em http://localhost:3000. Se a API estiver rodando (também na
3000), use outra porta:

```bash
npm run dev:site -- --port 3002
```

Não rode `npm install` dentro desta pasta — o `package-lock.json` fica na raiz.

## Build

```bash
npm run build:site     # a partir da raiz
```

## Estrutura

```
src/app/          rotas (App Router)
src/components/   componentes por página + ui/ compartilhado
design-reference/ referências visuais
```

## Deploy

Projeto próprio na Vercel, com Root Directory `apps/site`. O site é
inteiramente estático e não consome a API. Procedimento completo em
[`/DEPLOY.md`](../../DEPLOY.md).
