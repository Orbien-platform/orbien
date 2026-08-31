# Orbien — monorepo

npm workspaces + Turborepo. Node 22.

## Apps

| Caminho | Package | Stack | Deploy |
|---|---|---|---|
| `apps/api` | `orbien-backend` | NestJS 10, Prisma 6, Postgres (Supabase) | Render, Docker |
| `apps/site` | `orbien-site` | Next.js 16 (App Router), Tailwind 4 | Vercel |
| `apps/web` | `orbien-web` | Next.js 16 (App Router), Tailwind 4, React Query | Vercel |

Cada app tem seu próprio `CLAUDE.md`/`AGENTS.md` com as regras específicas —
leia o do app antes de mexer nele.

## Regras do monorepo

- **Sempre** instale a partir da raiz (`npm install`). Existe um único
  `package-lock.json`, na raiz. Não crie lockfiles em `apps/*`.
- Para adicionar dependência a um app:
  `npm install <pkg> -w orbien-web`
- Rode tarefas via Turborepo: `npm run build:web`, `turbo run lint --filter=orbien-api`.
- Não mova o `Dockerfile` da API nem mude `dockerContext` sem ajustar o
  `render.yaml`: o build da API usa a **raiz** do repo como contexto.
- Os deploys são independentes. Nada que rode na Vercel deve importar código de
  `apps/api`, e a API não deve depender de nada dos fronts.
