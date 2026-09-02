# orbien-web

Aplicação logada da Orbien — Next.js 16 (App Router), Tailwind 4,
TanStack Query.

Faz parte do [monorepo Orbien](../../README.md). As dependências são
gerenciadas por npm workspaces a partir da **raiz** do repositório.

## Desenvolvimento

A partir da raiz do monorepo:

```bash
npm install       # instala todos os workspaces (uma vez)
npm run dev:api   # backend em :3000
npm run dev:web   # esta app em :3001
```

Não rode `npm install` dentro desta pasta — o `package-lock.json` fica na raiz.

## Como a app fala com a API

O browser **nunca** chama o backend direto. Ele bate em `/api-proxy/*`, e o
rewrite definido em `next.config.ts` encaminha para `API_BACKEND_URL` no
servidor. É isso que elimina o CORS.

| Variável | Valor | Escopo |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `/api-proxy` | browser |
| `API_BACKEND_URL` | URL real do backend | **apenas servidor** |

`API_BACKEND_URL` não pode ganhar o prefixo `NEXT_PUBLIC_`: isso a exporia no
bundle do cliente e quebraria o esquema sem-CORS. Localmente ela vive em
`.env.local`; em produção, no dashboard da Vercel.

## Autenticação

`src/proxy.ts` intercepta as rotas privadas e redireciona para
`/login?from=<rota>` quando não há cookie `auth_session`. Rotas cobertas:
`/dashboard`, `/pessoas`, `/grupos`, `/financeiro`, `/conteudo`,
`/voluntarios`, `/celebracoes`, `/configuracoes`.

## Estrutura

```
src/app/(public)/   rotas abertas (login)
src/app/(admin)/    rotas protegidas
src/components/     componentes por domínio + ui/ compartilhado
src/contexts/       providers de estado
src/hooks/          hooks de dados (TanStack Query)
src/lib/            client HTTP e utilitários
src/proxy.ts        guarda de autenticação
```

## Testes de tela (e2e)

Scripts em [`e2e/`](e2e) sobem o Chromium contra o app rodando e percorrem os
fluxos, gerando capturas em `e2e/screenshots/`.

```bash
E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=doca-church npm run e2e
```

A sessão é criada por HTTP contra a API e semeada direto no `localStorage` e no
cookie `auth_session` (ver `e2e/session.mjs`) — o formulário de login não é
exercitado, o que mantém o teste focado na tela em análise.

Funciona contra qualquer ambiente:

```bash
E2E_BASE_URL=https://orbien-web.vercel.app \
E2E_API_URL=https://orbien-web.vercel.app/api-proxy \
E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=... npm run e2e
```

Os dados de apoio são criados e removidos pela própria execução
(`e2e/fixtures.mjs`): a aba "Próximas" só lista instâncias futuras, e o seed
pode não ter nenhuma.

## Build

```bash
npm run build:web    # a partir da raiz
```

## Deploy

Projeto próprio na Vercel, com Root Directory `apps/web`. Procedimento
completo em [`/DEPLOY.md`](../../DEPLOY.md).
