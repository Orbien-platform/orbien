# Monorepo — estrutura e deploy

## Por que assim

Os três projetos viviam em repositórios separados (`orbien-api`, `orbien-site`,
`orbien-web`). Foram unificados em um único repositório **preservando todo o
histórico de commits** (via `git subtree`), mas **sem unificar os deploys**:

- `apps/api` continua sendo uma imagem Docker publicada no **Render**.
- `apps/site` e `apps/web` continuam em **projetos Vercel separados**.

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

`npm run dev` sobe os três em paralelo sem colisão. As portas dos fronts estão
fixadas nos próprios scripts `dev` de cada app, e não no `next dev` padrão,
justamente para não brigarem com a API na 3000.

## Deploy

O passo a passo de configuração do Render e da Vercel está em
[`/DEPLOY.md`](../DEPLOY.md). Resumo do que o monorepo mudou:

- **API (Render):** o build context do Docker passou a ser a **raiz** do repo,
  porque o `package-lock.json` mora lá. Ver `dockerContext` / `dockerfilePath` /
  `buildFilter` em `apps/api/render.yaml`.
- **site e web (Vercel):** dois projetos separados, cada um com Root Directory
  em `apps/site` / `apps/web` e *"Include files outside of the Root Directory"*
  habilitado. Cada um tem `ignoreCommand` com `turbo-ignore` no seu
  `vercel.json`, para não deployar quando o commit não afetou aquele app.
- **Variáveis de ambiente:** não mudaram, em nenhuma das três plataformas.

Os repositórios antigos (`orbien-api`, `orbien-site`, `orbien-web`) devem ser
arquivados só depois que os três deploys novos estiverem verdes — eles são o
plano de rollback. O histórico deles está inteiro aqui, sob `apps/*`.
