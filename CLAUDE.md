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
- Os deploys são independentes. Nada que rode na Vercel deve importar código de
  `apps/api`, e a API não deve depender de nada dos fronts.
