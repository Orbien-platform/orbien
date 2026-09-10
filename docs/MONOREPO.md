# Monorepo — estrutura e deploy

## Por que assim

Três dos cinco apps de hoje viviam em repositórios separados (`orbien-api`,
`orbien-site`, `orbien-web`). Foram unificados em um único repositório
**preservando todo o histórico de commits** (via `git subtree`), mas **sem
unificar os deploys**:

- `apps/api` roda no **Render**, em runtime Node.
- `apps/site` e `apps/web` continuam em **projetos Vercel separados**.

`apps/admin` é o quarto app e nasceu aqui, na Fase 3 do plano de plataforma —
não veio de repositório nenhum. É o console da plataforma, roda no subdomínio
`admin.` e tem projeto Vercel próprio, pela mesma forma dos outros dois: deploy
independente, e nada que rode na Vercel importa código de `apps/api`.

`apps/mobile` é o quinto e também nasceu aqui, em 2026-09-08 — app nativo do
membro e da liderança, Expo + React Native. É o único que não vai para Vercel
nem para Render: sai por **EAS Build**, o serviço da própria Expo, e sua
distribuição são as lojas, não uma URL. Fala direto com a API por
`Authorization: Bearer`, sem o `/api-proxy` que o `web` usa — app nativo não
tem origem de navegador para exigir cookie `HttpOnly`.

> **Runtime Node, não Docker.** O `apps/api/Dockerfile` existe e funciona para
> build local, mas o serviço do Render não o executa: build
> `npm ci --include=dev && npm run build:api`, start
> `node apps/api/dist/src/main.js`, ambos a partir da raiz. Ver `render.yaml`
> na raiz e `/DEPLOY.md`.

O que passou a ser compartilhado é apenas o gerenciamento de dependências
(um `package-lock.json` na raiz) e a orquestração de tarefas (Turborepo).

## Dependências

npm workspaces com `workspaces: ["apps/*"]`. O `node_modules` é hoisted para a
raiz; quando dois apps pedem versões diferentes do mesmo pacote, o npm aninha a
divergente em `apps/<app>/node_modules` automaticamente.

> Hoje `apps/site` usa `next@16.2.6` e `apps/web` usa `next@16.2.9`. Funciona,
> mas alinhar as duas versões deixaria o hoisting mais limpo.

Adicionar dependência:

```bash
npm install <pkg> -w orbien-web
npm install -D <pkg> -w orbien-backend
```

`apps/api` tem um `postinstall` que roda `prisma generate`. Ele existe porque,
com `node_modules` compartilhado, esquecer de gerar o client passa a quebrar o
build de forma não óbvia.

## Portas em desenvolvimento

| App | Porta |
|---|---|
| `apps/api` | 3000 |
| `apps/web` | 3001 |
| `apps/site` | 3002 |
| `apps/admin` | 3003 |
| `apps/mobile` | — (Metro na 8081, escolhida pelo Expo) |

`npm run dev` sobe os cinco em paralelo sem colisão. As portas dos fronts
estão fixadas nos próprios scripts `dev` de cada app, e não no `next dev`
padrão, justamente para não brigarem com a API na 3000. O mobile não entra
nessa lista porque não serve HTTP para o navegador: quem escolhe a porta do
Metro é o `expo start`, e o cliente dele é o dispositivo ou o emulador.

Para o app do dispositivo alcançar a API local não basta subir as duas: o
`localhost` do celular é o próprio celular. A URL da API sai de
`Constants.expoConfig.extra.apiUrl` (`apps/mobile/app.config.js`), e em
desenvolvimento em dispositivo físico ela precisa apontar para o IP da máquina
na rede, não para `http://localhost:3000`.

Para exercitar a sessão de suporte de ponta a ponta são necessários três: a API
na 3000, o `admin` na 3003 (de onde a sessão é aberta) e o `web` na 3001 (para
onde ela é entregue). O destino sai de `NEXT_PUBLIC_WEB_URL`, no
`.env.local` do admin.

## Deploy

O passo a passo de configuração do Render e da Vercel está em
[`/DEPLOY.md`](../DEPLOY.md). Resumo do que o monorepo mudou:

- **API (Render):** build e start passaram a rodar a partir da **raiz**, porque
  o `package-lock.json` mora lá — `npm ci --include=dev && npm run build:api`,
  depois `node apps/api/dist/src/main.js`. Ver `render.yaml` na raiz.
- **site, web e admin (Vercel):** três projetos separados, cada um com Root
  Directory em `apps/site` / `apps/web` / `apps/admin` e *"Include files
  outside of the Root Directory"* habilitado. Cada um tem `ignoreCommand` com
  `turbo-ignore` no seu `vercel.json`, para não deployar quando o commit não
  afetou aquele app.
- **mobile (EAS Build):** fora das duas plataformas. Os profiles vivem em
  `apps/mobile/eas.json` e a identidade do app (nome, bundle id, ícone, app id
  do OneSignal) é resolvida por `apps/mobile/app.config.js` a partir do profile
  — nunca hardcoded em código-fonte compartilhado, que é o que permite a
  variante white-label por tenant existir depois sem fork (AD-002 em
  `.specs/STATE.md`). O CI dispara um build de preview quando o diff toca
  `apps/mobile` (job `mobile-eas-build`, ver [`CI.md`](CI.md)).
- **Variáveis de ambiente:** não mudaram para API, site, web e admin. O mobile
  não usa `.env`: as suas chegam por `env` do profile no `eas.json`.

Os repositórios antigos (`orbien-api`, `orbien-site`, `orbien-web`) devem ser
arquivados só depois que os três deploys novos estiverem verdes — eles são o
plano de rollback. O histórico deles está inteiro aqui, sob `apps/*`.
