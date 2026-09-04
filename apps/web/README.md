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

Rodam no [`@playwright/test`](https://playwright.dev), configurado em
[`playwright.config.ts`](playwright.config.ts). Sobem o Chromium contra o app
**já em pé** (a suíte não levanta servidor) e percorrem os fluxos, gerando
capturas em `e2e/screenshots/`:

- [`e2e/schedule.spec.ts`](e2e/schedule.spec.ts) — montagem de escala (criar,
  aplicar template, ministérios, voluntários) e indisponibilidade do voluntário
- [`e2e/templates.spec.ts`](e2e/templates.spec.ts) — CRUD de templates de escala
- [`e2e/suporte.spec.ts`](e2e/suporte.spec.ts) — entrada da sessão de suporte
  (`/suporte/sessao`), o handoff que vem do `apps/admin`
- [`e2e/fixtures.ts`](e2e/fixtures.ts) — sessão autenticada, coleta de erros de
  console/rede e os dados de apoio

A partir da raiz do monorepo:

```bash
E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=doca-church \
  npm run e2e -w orbien-web
```

`suporte.spec.ts` precisa de duas variáveis a mais, porque monta o handoff de
verdade — login de plataforma, listar tenants, `impersonate` — em vez de
fabricar um token:

```bash
E2E_SUPPORT_EMAIL=... E2E_SUPPORT_PASSWORD=...
```

Sem elas o spec **se pula**, e não falha: a suíte tem que continuar rodando
apontada para um ambiente que não tenha conta de plataforma. Ele também é o
único spec que não usa a fixture `page` — aquela entrega a página já
autenticada, e ali o ponto é chegar sem sessão e ver o handoff criar uma.

Comandos úteis (todos com `-w orbien-web` a partir da raiz, ou direto nesta
pasta):

```bash
npm run e2e -w orbien-web                                   # a suíte inteira
npm run e2e:report -w orbien-web                            # abre o relatório HTML
npx playwright test e2e/templates.spec.ts                    # um spec só
npx playwright test --headed                                 # vendo o navegador
npx playwright test --ui                                     # modo interativo
npx playwright show-trace test-results/<pasta>/trace.zip     # trace de uma falha
```

O relatório HTML sai em `playwright-report/` e os artefatos de falha
(screenshot, trace) em `test-results/` — ambos ignorados pelo git, como
`e2e/screenshots/`.

O `trace` é gravado com `on-first-retry`: em CI (`retries: 1`) a primeira
falha dispara uma retentativa já instrumentada. Localmente, para forçar:

```bash
npx playwright test --retries=1 --trace=on-first-retry
```

A sessão é criada por HTTP contra a API e semeada direto no `localStorage` e no
cookie `auth_session` (fixture `page` em `e2e/fixtures.ts`) — o formulário de
login não é exercitado, o que mantém o teste focado na tela em análise.

Funciona contra qualquer ambiente:

```bash
E2E_BASE_URL=https://orbien-web.vercel.app \
E2E_API_URL=https://orbien-web.vercel.app/api-proxy \
E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=... npm run e2e -w orbien-web
```

Os dados de apoio são criados e removidos pelas fixtures, com teardown
garantido mesmo se o teste estourar — e **só o que elas criaram**: a aba
"Próximas" só lista instâncias futuras e o seed pode não ter nenhuma, mas uma
instância pré-existente é reaproveitada e não é removida no fim.

A suíte roda com `workers: 1` e `fullyParallel: false` de propósito: os dois
specs montam e desmontam dados reais no mesmo tenant, e em paralelo um apagaria
o template que o outro reaproveita.

## Build

```bash
npm run build:web    # a partir da raiz
```

## Deploy

Projeto próprio na Vercel, com Root Directory `apps/web`. Procedimento
completo em [`/DEPLOY.md`](../../DEPLOY.md).
