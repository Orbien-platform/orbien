# Deploy

Passo a passo para configurar o deploy dos três apps do monorepo.

Os deploys são **independentes**: a API roda no Render (runtime Node) e
`site` e `web` rodam em **dois projetos Vercel separados**. Nada disso muda por
causa do monorepo — o que muda é onde cada plataforma procura os arquivos.

| App | Package | Plataforma | O que muda com o monorepo |
|---|---|---|---|
| `apps/api` | `orbien-backend` | Render (Node) | Root Directory vazio; build e start rodam da **raiz** |
| `apps/site` | `orbien-site` | Vercel | Root Directory = `apps/site` |
| `apps/web` | `orbien-web` | Vercel | Root Directory = `apps/web` |

> Este documento substitui o antigo `apps/api/DEPLOY.md`, que descrevia o setup
> de quando a API tinha repositório próprio.

---

## Antes de começar

1. Criar o repositório `Orbien-platform/orbien` **vazio** no GitHub
   (sem README, sem .gitignore — o repo local já tem os dois).

2. Publicar o monorepo:

   ```bash
   git push -u origin main
   ```

3. **Não arquive** `orbien-api`, `orbien-site` e `orbien-web` ainda. Eles são o
   plano de rollback até os três deploys novos ficarem verdes.

A ordem recomendada é **API primeiro**, depois `web`, depois `site`. A API é a
única que os outros dois dependem; o `site` é o de menor risco (página pública,
sem backend) e serve de última confirmação.

---

## Parte 1 — API no Render

### 1.1 O serviço roda em Node, não em Docker

Apesar de existir um `Dockerfile` funcional em `apps/api/`, o serviço
`orbien-api` no Render foi criado com runtime **Node** e é configurado pelo
dashboard. Dá para confirmar num olhar: em Settings, um serviço Node mostra
**Build Command** e **Start Command**; um serviço Docker mostra **Dockerfile
Path** e **Docker Build Context Directory**. Os dois pares nunca aparecem
juntos.

O runtime **não pode ser alterado** depois da criação. Trocar para Docker
exigiria criar um serviço novo.

O `render.yaml` na raiz documenta essa configuração, mas **não é aplicado
automaticamente** — o serviço não é gerenciado por Blueprint.

### 1.2 Migrar o serviço existente

No dashboard do Render, serviço `orbien-api` → **Settings**:

| Campo | Valor |
|---|---|
| Source (Repository) | `Orbien-platform/orbien` |
| Branch | `main` |
| Root Directory | **vazio** |
| Build Command | `npm ci --include=dev && npm run build:api` |
| Start Command | `node apps/api/dist/src/main.js` |
| Health Check Path | `/api/health` |

> **Limpe cada campo por inteiro antes de digitar.** O Render não substitui o
> conteúdo ao colar: o texto novo é inserido onde estiver o cursor, emendando
> no antigo. Colar o Build Command novo por cima de `npm install; npm run build`
> produz `npm run buildnpm ci --include=dev ...` e o build falha com
> `Missing script: "buildnpm"`. Vale para o Start Command também, que vinha
> como `yarn start`.
>
> O `$` que aparece à esquerda do campo é o prompt desenhado pelo Render, não
> faz parte do comando.

Depois, **Manual Deploy → Deploy latest commit**.

Três pontos que quebram o deploy se passarem batido:

- **Root Directory vazio.** O `package-lock.json` está na raiz do monorepo. Se
  apontar para `apps/api`, o `npm ci` não acha o lockfile.
- **`--include=dev` no build.** O serviço define `NODE_ENV=production`, e com
  isso o npm omite as devDependencies — que é onde estão `turbo`, `nest` e
  `typescript`. Sem a flag, `npm ci` remove 612 pacotes e o build falha.
- **Start Command a partir da raiz.** O artefato fica em
  `apps/api/dist/src/main.js` (o `dist/src/` é o layout que o `nest build`
  produz neste projeto, não um erro de digitação).

Opcionalmente, em **Build Filters → Included Paths**, restrinja o que dispara
deploy da API:

```
apps/api/**
package.json
package-lock.json
turbo.json
```

**Uma entrada por caminho**, clicando em *+ Add Included Path* a cada uma. O
campo valida contra `^[A-Za-z0-9-_./^*?\[\]]+$`, ou seja, não aceita vírgula
nem espaço — tentar colar os quatro numa linha só é rejeitado.

Com isso preenchido, apenas commits que tocam esses caminhos reconstroem a API;
mudanças em `apps/site/**` ou `apps/web/**` passam a ser ignoradas.

### 1.3 Se preferir migrar para Docker

Não é necessário — o runtime Node funciona e está validado. Mas se quiser usar
o `Dockerfile` (imagem enxuta, 176MB, só com as deps da API):

1. **New → Web Service** → conectar `Orbien-platform/orbien`
2. Runtime **Docker**, Branch `main`
3. Root Directory **vazio**, Dockerfile Path `apps/api/Dockerfile`,
   Docker Build Context Directory `.`
4. Vincular o Environment Group `orbien-secrets` (seção 1.4)
5. Depois do deploy verde, apontar o domínio e **suspender o serviço antigo**

Serviço novo significa URL nova até o domínio ser reapontado.

### 1.4 Variáveis de ambiente

**Não mudam.** Continuam no Environment Group `orbien-secrets`:

| Variável | Descrição | Onde encontrar |
|---|---|---|
| `DATABASE_URL` | Supabase pooler (porta 6543, role `orbien_app`) | Supabase → Settings → Database → Connection string (pooler) |
| `DIRECT_URL` | Supabase direto (porta 5432, role `postgres`) | Supabase → Settings → Database → Connection string (direct) |
| `JWT_SECRET` | Segredo do access token | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Segredo do refresh token | `openssl rand -hex 32` |
| `ONESIGNAL_APP_ID` | OneSignal App ID | Dashboard OneSignal |
| `ONESIGNAL_API_KEY` | OneSignal REST API Key | Dashboard OneSignal → Keys |
| `ASAAS_API_KEY` | API key Asaas | Dashboard Asaas |
| `ASAAS_WEBHOOK_SECRET` | Secret do webhook Asaas | Dashboard Asaas → Webhooks |
| `R2_ACCOUNT_ID` | Cloudflare account ID | Dashboard Cloudflare |
| `R2_ACCESS_KEY_ID` | R2 access key | Cloudflare → R2 → API Tokens |
| `R2_SECRET_ACCESS_KEY` | R2 secret key | Cloudflare → R2 → API Tokens |
| `R2_BUCKET_NAME` | Nome do bucket R2 | Cloudflare → R2 |
| `R2_PUBLIC_URL` | URL pública do bucket R2 | Cloudflare → R2 → Settings |
| `RESEND_API_KEY` | API key do Resend | Dashboard Resend |

Definidas direto no `render.yaml` (não são segredo): `NODE_ENV`, `PORT`,
`ALLOWED_ORIGINS`, `MAIL_FROM`, `FRONTEND_URL`.

`ALLOWED_ORIGINS` é a lista de origens do CORS, separada por vírgula. Se o
domínio de algum front mudar, ele precisa ser adicionado aqui — sem isso o
browser bloqueia as chamadas.

### 1.5 Provisionar o banco do zero

Necessário quando não existe banco (projeto Supabase novo, ou ambiente novo).
O `DATABASE_URL` da aplicação usa o role `orbien_app`, que **não existe** num
Postgres recém-criado — e as migrations sozinhas não bastam.

```bash
cd apps/api
DIRECT_URL='postgresql://postgres:<senha>@<host>:5432/postgres' \
ORBIEN_APP_PASSWORD='<senha-do-app>' \
bash scripts/bootstrap-db.sh --seed
```

O script é idempotente e faz, nesta ordem:

1. cria os roles `app_user`, `app_admin` e `orbien_app` (a migration
   `fix_rls_enforcement` faz `GRANT app_user TO postgres` e falha se eles não
   existirem antes);
2. `prisma migrate deploy`;
3. aplica `001_rls_setup.sql` e `002_rls_celebration_schedules.sql`, que estão
   fora do histórico do Prisma e por isso não rodam sozinhos;
4. dá `LOGIN` + senha ao `orbien_app` e concede `app_user ... WITH SET TRUE`
   (o backend usa `SET LOCAL ROLE app_user` para forçar a avaliação do RLS);
5. verifica tabelas, login do role e herança, falhando alto se algo faltar;
6. com `--seed`, popula os dados de exemplo.

Depois disso, `DIRECT_URL` aponta para a conexão direta (5432, role `postgres`)
e `DATABASE_URL` para o pooler (6543, role `orbien_app`).

> `GRANT ... WITH SET TRUE` exige PostgreSQL 16+. Testado em PG 17.

### 1.6 Verificar

```bash
curl https://orbien-api.onrender.com/api/health
# esperado: {"status":"ok","timestamp":"..."}
```

No free tier o serviço dorme após 15min sem tráfego; o primeiro request depois
disso leva 30–50s. Para manter acordado, pingar `/api/health` a cada 14min
(UptimeRobot resolve).

E a cadeia inteira, que é o que realmente importa:

```bash
curl -X POST https://orbien-web.vercel.app/api-proxy/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"...","tenant_slug":"doca-church"}'
```

Isso exercita Vercel → rewrite `/api-proxy` → Render → Supabase de ponta a
ponta. Valores medidos após a migração, para referência: `/api/health` em
0,47s (já aquecido, 24s no cold start) e o login em 3,1s — os mesmos números
de antes da migração.

### 1.7 Testar o build Docker localmente

**A partir da raiz do repositório**, nunca de dentro de `apps/api`:

```bash
docker build -f apps/api/Dockerfile -t orbien-api .
docker run -p 3000:3000 --env-file apps/api/.env orbien-api
curl http://localhost:3000/api/health
```

> Se der `P1012 ... the URL must start with the protocol postgresql://`: o
> `docker run --env-file` **não remove aspas**, e os valores no `.env` estão
> entre aspas. É limitação do Docker, não erro de configuração — rode sem aspas
> ou passe as variáveis com `-e`.

### 1.8 Migrations

Continuam manuais, rodadas da máquina local contra o Supabase. A partir da raiz
do monorepo:

```bash
npm run db:migrate -- nome_da_migration
npm run db:migrate:status
```

---

## Parte 2 — `web` na Vercel

### 2.1 Configuração do projeto

No projeto Vercel `orbien-web` → **Settings**:

1. **Git → Connected Git Repository** → desconectar `orbien-web` e conectar
   `Orbien-platform/orbien`, branch de produção `main`.
2. **Build and Deployment → Root Directory** → `apps/web`
3. Marcar **"Include files outside of the Root Directory in the Build Step"**.

   Esse checkbox é o passo que as pessoas esquecem. Sem ele a Vercel só enxerga
   `apps/web/`, não acha o `package.json` nem o `package-lock.json` da raiz, e o
   build morre no install.

4. **Não sobrescreva** Install Command nem Build Command. A Vercel detecta npm
   workspaces sozinha: roda `npm install` na raiz e `next build` dentro do Root
   Directory. Se o projeto tiver overrides antigos (`installCommand: npm install`),
   remova-os.

5. **Node.js Version**: 22.x

### 2.2 Evitar deploy cruzado

`apps/web/vercel.json` já traz:

```json
{ "ignoreCommand": "npx --yes turbo-ignore orbien-web" }
```

Sem isso, **todo** commit no monorepo — inclusive um que só mexe na API —
dispararia build dos dois fronts. O `turbo-ignore` compara o commit com o
deploy anterior e cancela o build quando `orbien-web` e suas dependências não
foram tocados.

O primeiro deploy sempre roda (não existe deploy anterior para comparar). Isso é
esperado.

### 2.3 Variáveis de ambiente

**Não mudam.** Continuam no dashboard do projeto:

| Variável | Valor | Escopo |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `/api-proxy` | browser |
| `API_BACKEND_URL` | `https://orbien-api.onrender.com/api` | **server-only** |

O browser nunca chama a API direto: ele bate em `/api-proxy/*`, e o rewrite do
`next.config.ts` encaminha para `API_BACKEND_URL`. Por isso `API_BACKEND_URL`
**não** pode ter o prefixo `NEXT_PUBLIC_` — isso a exporia no bundle do cliente
e ainda quebraria o esquema sem-CORS.

### 2.4 Verificar

1. Abrir a URL de produção e fazer login.
2. Confirmar no DevTools → Network que as chamadas vão para `/api-proxy/...`
   (mesma origem) e retornam 200.
3. Conferir se o domínio do front está em `ALLOWED_ORIGINS` no Render.

---

## Parte 3 — `site` na Vercel

Mesmo procedimento da Parte 2, com duas diferenças:

1. **Root Directory** → `apps/site`
2. O `site` **não tem variáveis de ambiente** e não fala com a API. É estático.

`apps/site/vercel.json` já tem o `turbo-ignore` correspondente
(`npx --yes turbo-ignore orbien-site`).

Verificar: abrir a home, `/precos`, `/funcionalidades` e conferir que
`/sitemap.xml` e `/robots.txt` respondem.

---

## Depois que os três estiverem verdes

1. Confirmar que os domínios customizados (`app.useorbien.com` e o do site)
   apontam para os projetos novos.
2. Arquivar no GitHub: `orbien-api`, `orbien-site`, `orbien-web`
   (Settings → Archive this repository). O histórico deles está inteiro aqui,
   sob `apps/*` — `git log --follow apps/web/src/...` atravessa tudo.
3. Suspender/remover o serviço antigo do Render, se você criou um novo.

---

## Visibilidade do repositório

O repositório é **público por enquanto**, e assim permanece até o lançamento
oficial. Isso não impede nenhum passo deste documento — Render e Vercel
conectam normalmente.

Quando for fechado para privado, atenção à ordem:

- Render e Vercel **perdem acesso** ao repositório no momento em que ele vira
  privado. Cada plataforma volta a enxergá-lo só depois que você autorizar o
  GitHub App dela para este repo, em
  GitHub → Settings → Applications → *(Render / Vercel)* → Repository access.
- Se você fechar **antes** de reconectar os serviços, o repo simplesmente não
  aparece no seletor dos dashboards — parece bug, mas é falta de permissão.

O caminho de menor atrito é **reconectar as três plataformas enquanto o repo
ainda está público**, e fechar depois.

Um ponto que fechar o repositório *não* resolve: o que já esteve exposto
continua exposto (forks, clones, caches de busca). Vale uma revisão antes do
lançamento — por exemplo, `apps/api/prisma/seed.ts` tem senha em texto puro e
e-mails reais, e está público desde os repositórios antigos. Trate essa senha
como já vazada e não a reaproveite fora do ambiente de desenvolvimento.

## Deploys do dia a dia

Com o monorepo, um `git push` na `main` pode disparar até três deploys. O que
dispara o quê:

| Commit toca | API (Render) | site (Vercel) | web (Vercel) |
|---|---|---|---|
| `apps/api/**` | deploya | ignora | ignora |
| `apps/site/**` | ignora | deploya | ignora |
| `apps/web/**` | ignora | ignora | deploya |
| `package-lock.json` / raiz | deploya | deploya | deploya |

No Render, o filtro é o `buildFilter` do `render.yaml`. Na Vercel, é o
`turbo-ignore`. Mudança na raiz reconstrói tudo — o que é o comportamento
correto, já que o lockfile é compartilhado.

---

## Problemas comuns

**Render: `npm ci` não acha o lockfile**
Root Directory está preenchido. Tem que ficar **vazio** — o `package-lock.json`
está na raiz do monorepo.

**Render: `npm error Missing script: "buildnpm"`**
O Build Command foi colado por cima do antigo sem limpar o campo, emendando
`npm run build` com `npm ci`. Apague o conteúdo inteiro e digite só a linha
correta.

**Render: build falha com `turbo: not found` / `nest: not found`**
Falta `--include=dev` no Build Command. O serviço tem `NODE_ENV=production`, o
que faz o npm omitir as devDependencies.

**Vercel: `npm error Cannot read properties of null` ou lockfile não encontrado**
Falta marcar *"Include files outside of the Root Directory"*.

**Vercel: build roda mas o app não acha módulos de outro workspace**
Provavelmente há um Install Command sobrescrito no dashboard. Remova o override
e deixe a detecção automática de workspaces agir.

**Vercel: builds ficaram mais lentos**
Esperado. O `npm install` na raiz instala as dependências dos três workspaces,
incluindo NestJS e Prisma, e o `postinstall` da API roda `prisma generate`. A
Vercel cacheia `node_modules` entre builds, então o custo real é só no primeiro.

**Erro de CORS depois de trocar domínio**
Adicionar a nova origem em `ALLOWED_ORIGINS` no Render e redeployar a API.

**Build da API falha com centenas de erros `TS2339` / `Prisma has no exported member`**
O Prisma Client não foi gerado. Localmente: `npm run db:generate` na raiz. No
Docker isso já é feito no build.

---

## Rollback

Enquanto os repositórios antigos existirem, o rollback é reconectar cada
plataforma ao repositório de origem e refazer o deploy do último commit
conhecido. Por isso vale arquivá-los só depois de tudo verde e testado em
produção.
