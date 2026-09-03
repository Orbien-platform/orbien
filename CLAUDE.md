# Orbien — monorepo

npm workspaces + Turborepo. Node 22.

## Apps

| Caminho | Package | Stack | Deploy |
|---|---|---|---|
| `apps/api` | `orbien-backend` | NestJS 10, Prisma 6, Postgres (Supabase) | Render (runtime Node) |
| `apps/site` | `orbien-site` | Next.js 16 (App Router), Tailwind 4 | Vercel |
| `apps/web` | `orbien-web` | Next.js 16 (App Router), Tailwind 4 | Vercel |

Cada app tem seu próprio `CLAUDE.md`/`AGENTS.md` com as regras específicas —
leia o do app antes de mexer nele.

## Regras do monorepo

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
- `platform_support` não está em nenhuma lista de `@Roles` de dados de igreja, e
  isso é deliberado: o acesso dela é pontual, por `POST /auth/impersonate`, que
  emite token com `support_session: true` — e essa marca satisfaz qualquer
  `@Roles` no `RolesGuard`. O contrapeso é o `AuditInterceptor`, global, que
  grava `support_access` em `audit_logs` por `audit_insert()`. Se você mexer em
  um dos três, mexeu no acordo inteiro.
- Os deploys são independentes. Nada que rode na Vercel deve importar código de
  `apps/api`, e a API não deve depender de nada dos fronts.
