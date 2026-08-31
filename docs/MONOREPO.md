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
| `apps/site` | 3000 (`next dev` padrão) |
| `apps/web` | 3001 |

`npm run dev` sobe os três em paralelo e **a API colide com o site na 3000**.
Rode `npm run dev:api` + `npm run dev:web` (combinação usual), ou suba o site
com `npm run dev:site -- --port 3002`.

## Deploy — API (Render)

O `Dockerfile` mudou de "contexto = pasta da API" para **"contexto = raiz do
repositório"**, porque o `package-lock.json` agora vive na raiz.

Configuração no Render (`apps/api/render.yaml`):

```yaml
rootDir: .
dockerContext: .
dockerfilePath: ./apps/api/Dockerfile
buildFilter:
  paths:
    - apps/api/**
    - package.json
    - package-lock.json
    - turbo.json
```

- `dockerContext: .` — sem isso o `COPY package-lock.json` falha.
- `buildFilter` evita que commits que só tocam site/web disparem deploy da API.

O build instala apenas o workspace da API
(`npm ci --workspace orbien-backend --include-workspace-root`), então as
dependências de Next/React não entram na imagem.

Testar localmente, **a partir da raiz do repositório**:

```bash
docker build -f apps/api/Dockerfile -t orbien-api .
docker run -p 3000:3000 --env-file apps/api/.env orbien-api
curl http://localhost:3000/api/health
```

### O que reconfigurar no Render

1. No serviço `orbien-api` → Settings → conectar ao repositório novo.
2. Root Directory: **vazio** (raiz do repo).
3. Dockerfile Path: `apps/api/Dockerfile`.
4. Docker Build Context Directory: `.`
5. As variáveis de ambiente e o Environment Group `orbien-secrets` não mudam.

## Deploy — site e web (Vercel)

Dois projetos Vercel independentes, ambos apontando para o mesmo repositório.

Para cada projeto, em Settings → General:

| Projeto | Root Directory |
|---|---|
| `orbien-site` | `apps/site` |
| `orbien-web` | `apps/web` |

E marque **"Include files outside of the Root Directory in the Build Step"** —
é isso que dá acesso ao `package.json` e ao `package-lock.json` da raiz.

A Vercel detecta npm workspaces sozinha: roda `npm install` na raiz e
`next build` dentro do Root Directory. Não sobrescreva Install/Build Command.

Cada app tem um `vercel.json` com:

```json
{ "ignoreCommand": "npx --yes turbo-ignore orbien-web" }
```

Isso cancela o build quando o commit não afetou aquele app — sem isso, todo
commit no monorepo dispararia deploy dos dois fronts.

### Variáveis de ambiente

Não mudam. Continuam definidas no dashboard de cada projeto Vercel
(`NEXT_PUBLIC_API_URL`, `API_BACKEND_URL`).

## Repositórios antigos

`orbien-api`, `orbien-site` e `orbien-web` no GitHub devem ser arquivados
(Settings → Archive this repository) depois que os deploys estiverem apontando
para o monorepo. O histórico deles está inteiro aqui, sob `apps/*`.
