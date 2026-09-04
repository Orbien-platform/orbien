# Orbien — monorepo

npm workspaces + Turborepo. Node 22.

## Apps

| Caminho | Package | Stack | Deploy |
|---|---|---|---|
| `apps/api` | `orbien-backend` | NestJS 10, Prisma 6, Postgres (Supabase) | Render (runtime Node) |
| `apps/site` | `orbien-site` | Next.js 16 (App Router), Tailwind 4 | Vercel |
| `apps/web` | `orbien-web` | Next.js 16 (App Router), Tailwind 4 | Vercel |
| `apps/admin` | `orbien-admin` | Next.js 16 (App Router), Tailwind 4 | Vercel (subdomínio `admin.`) |

Cada app tem seu próprio `CLAUDE.md`/`AGENTS.md` com as regras específicas —
leia o do app antes de mexer nele.

## Regras do monorepo

- **Branch antes da primeira edição.** Todo prompt que vai alterar arquivo
  começa criando uma branch a partir de `main` — antes de qualquer Edit,
  Write ou comando que escreva no disco. Nada é editado com `main` em
  checkout, nem "só um ajuste rápido". Nome no padrão
  `<tipo>/<assunto-em-kebab>` (`feat/`, `fix/`, `chore/`, `docs/`, `ci/`),
  em português, como o histórico já faz. Se o prompt seguinte continua o
  mesmo trabalho, fique na branch que já existe; branch nova é por unidade
  de trabalho, não por mensagem. Commit e push continuam só quando pedidos.
- **Sempre** instale a partir da raiz (`npm install`). Existe um único
  `package-lock.json`, na raiz. Não crie lockfiles em `apps/*`.
- Para adicionar dependência a um app:
  `npm install <pkg> -w orbien-web`
- Rode tarefas via Turborepo: `npm run build:web`, `turbo run lint --filter=orbien-api`.
- O serviço da API no Render usa **runtime Node**, não Docker: build
  `npm ci --include=dev && npm run build:api`, start
  `node apps/api/dist/src/main.js`, ambos a partir da raiz. O `Dockerfile`
  existe e funciona, mas não é o que o Render executa. Ver `/DEPLOY.md`.
- No web, `<Button>` é para botões primários (com `bg-navy` na className). Para
  ícone ou link, use `<button>` puro: o `variant` padrão do componente pinta um
  fundo escuro que a className não remove.
- A sessão do web vive em cookie `HttpOnly` (`orbien_at`/`orbien_rt`/
  `orbien_id`), nunca em `localStorage`. O token só é visto no servidor, pelo
  Route Handler de `/api-proxy` — que substituiu o `rewrite` justamente por
  isso. Renovação tem rota própria (`/api/session/refresh`) e **uma por vez**:
  a API revoga a família inteira ao detectar reuso de refresh token, então
  rotação concorrente derruba a sessão. Quem serializa é a fila do interceptor
  em `src/lib/api.ts`.
- Busca de dados no web é `useEffect` + axios (`src/lib/api.ts`), em todas as
  telas. `@tanstack/react-query` está no package.json mas **não tem provider
  nem uso** — não é o padrão da base; siga o que está em volta.
- As skills em `.claude/skills/` fazem parte do harness e são versionadas — é o
  que faz o time compartilhar as mesmas regras. Só `settings.local.json` fica
  fora. `node scripts/check-skills.mjs` valida frontmatter e caminhos citados.
- Antes de escrever uma skill nova, verifique se o Claude Code já resolve
  nativamente: `/code-review`, `/simplify`, `/security-review`, memória em
  arquivos, subagentes, TodoWrite. Skill que reimplementa o embutido custa
  contexto em toda ativação e envelhece pior.
- **Achado de revisão ou alerta de portão vira pergunta, não decisão
  unilateral.** Ao encontrar problema em revisão (`pr-review`, `/code-review`)
  ou alerta em `scripts/pre-push.sh`, apresente o achado com a evidência e
  pergunte: seguir assim, ou ajustar antes? Seguir com pendência conhecida é
  uma escolha legítima do dev — mas tem que ser escolha declarada, não
  silêncio. Não corrija por conta própria o que não foi pedido, e não bloqueie
  o trabalho esperando por certeza.
- Os três apps têm `lint` e `turbo run lint` cobre os três. A base da API é
  `typescript-eslint` recommended **sem** checagem de tipos, e a única regra
  ajustada é `no-unused-vars` com `argsIgnorePattern: "^_"` — o código marca
  "não usado de propósito" com underscore (`_tx`, `_depth`).
- Os scripts de RLS (`apps/api/prisma/migrations/00{1,2,3,4}_*.sql`) ficam
  **fora** do histórico do Prisma: `prisma migrate deploy` não os aplica, só o
  `bootstrap-db.sh`, e a ordem entre eles importa. Ao mexer em policy, o
  `USING` e o `WITH CHECK` têm que dizer a mesma coisa — divergir faz o admin
  ler a linha e falhar ao gravar com 42501. O passo 7 do bootstrap falha alto
  se isso acontecer.
- Toda requisição autenticada roda como `app_user`: o `TenantContextInterceptor`
  faz `SET LOCAL ROLE app_user` antes do `set_config`. É isso que faz o RLS ser
  avaliado — a conexão é `orbien_app`, que tem `orbien_app_auth USING (true)`
  nas tabelas de auth para o login funcionar sem contexto. Rodar autenticado
  como `orbien_app` reabre todas elas com um `OR true`. Ver a pendência nº 7.
- Rota que opera **acima** dos tenants leva três marcas juntas, e nenhuma basta
  sozinha: `@Roles('platform_support')`, `@PlatformRoute()` (o interceptor não
  fixa `app.tenant_id`) e o interceptor em si. Quem responde por elas no banco
  é `app_platform_access()`, que exige contexto sem tenant **e** o papel em
  `role_assignments` — o papel vem do banco, não de `app.role_codes`.
- `POST /auth/impersonate` resolve `platform_support` em `role_assignments`, não
  no `roles` do JWT. É de propósito, e é o mesmo princípio que o cabeçalho de
  `004_rls_platform_plane.sql` declara para `app_is_platform_support()`: o
  predicado que abre tenant é o último lugar onde vale depender de valor que
  veio de fora do banco. O que depende disso é uma coisa: papel revogado vale na
  hora — o token vive até 15 minutos e a cadeia de refresh segue renovando. O
  `is_active` na mesma consulta é redundância; quem barra conta desativada é o
  `JwtStrategy.validate`, em toda requisição. O `@Roles` do controller continua
  lá como rejeição barata — não é a autoridade. Trocar essa consulta por
  `user.roles.includes(...)` reabre a janela dos 15 minutos.
- `platform_support` não está em nenhuma lista de `@Roles` de dados de igreja, e
  isso é deliberado: o acesso dela é pontual, por `POST /auth/impersonate`, que
  emite token com `support_session: true` — e essa marca satisfaz qualquer
  `@Roles` no `RolesGuard`. O contrapeso é o `AuditInterceptor`, global, que
  grava `support_access` em `audit_logs` por `audit_insert()`. Se você mexer em
  um dos três, mexeu no acordo inteiro. O mesmo interceptor grava
  `platform_access` nas rotas marcadas com `@PlatformRoute()` — ali não há
  impersonação, mas há o ramo de RLS que abre os N tenants, e ele também
  precisa de rastro.
- Os deploys são independentes. Nada que rode na Vercel deve importar código de
  `apps/api`, e a API não deve depender de nada dos fronts.
- `apps/admin` é o console da plataforma e **não** é uma tela do produto. Só
  entra ali o que opera acima dos tenants — e, na prática, só o que a API expõe
  como rota de plataforma (`@PlatformRoute()` + `@Roles('platform_support')`).
  Dado de igreja não passa por lá; para ver dado de igreja o suporte abre uma
  sessão de suporte no `apps/web`. Se você se pegar precisando de uma rota de
  tenant no admin, o desenho está errado em algum lugar.
- O console tem login próprio: `POST /auth/platform/login`, **sem
  `tenant_slug`**. Quem administra a plataforma não está dentro de tenant
  nenhum, e o desempate vem do papel — só contas com `platform_support` em
  `role_assignments` são candidatas. Mas o token continua carregando o tenant
  de origem da conta, resolvido no servidor: as rotas de plataforma o ignoram
  (o `@PlatformRoute()` não o fixa), e o `AuditInterceptor` o usa como
  `audit_logs.tenant_id`, que é NOT NULL com FK. Token sem tenant faria toda
  linha `platform_access` falhar em silêncio, porque a auditoria é
  best-effort. Não "simplifique" tirando o tenant do token.
- Conta sem `platform_support` recebe o mesmo 401 de senha errada, de
  propósito: credencial válida de `tenant_admin` não deve descobrir pela
  mensagem que serve em outro lugar. Se você mexer nas mensagens dessa rota,
  mantenha as três indistinguíveis (senha errada, sem papel, inativa).
- `platform_support` entra no token mesmo quando a atribuição está em outra
  congregação do tenant — é o que `rolesForToken()` em `auth.service.ts` faz.
  O papel é global por definição (`app_is_platform_support()` não filtra por
  tenant nem congregação); sem a união, um refresh o perderia e o console
  cairia a cada 15 minutos sem motivo aparente. **Não é verdade que
  `platform_support` esteja fora de toda lista de `@Roles`** — estão nela
  `POST /internal/celebrations/*` e `POST /auth/impersonate`.
- A sessão de suporte cruza duas origens (`admin.` → app do tenant), e
  `localStorage` é por origem: o token vai no **fragmento** da URL, nunca na
  query. Fragmento não chega ao servidor — fica fora do log de acesso da
  Vercel, do `Referer` e de qualquer proxy no caminho. Ver
  `apps/admin/src/lib/support-session.ts` e
  `apps/web/src/app/(public)/suporte/sessao/page.tsx`. O token de
  `POST /auth/impersonate` não traz refresh token: a sessão vale 15 minutos e
  não se renova, de propósito.
- Enquanto a sessão for de suporte, o `apps/web` mostra a faixa do
  `SupportSessionBanner`. Ela é o par visível do `AuditInterceptor`: um grava o
  rastro, o outro avisa quem está operando. Não some nenhum dos dois sozinho.
