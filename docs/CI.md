# Plano de CI

Racional das decisões de CI. **As fases 1, 2 e 3 estão implementadas** em
`.github/workflows/ci.yml`; as fases 4 e 5 seguem como plano.

O contexto que motiva: com mais de uma pessoa no projeto, os deploys deixam de
ser suficientes como rede de proteção. Render e Vercel só constroem o app que
mudou, e o que passa nos dois já está em produção — quando quebra, quebrou pra
valer. CI serve para pegar antes do merge o que o deploy só descobre depois.

## O que CI pega aqui que o deploy não pega

| Falha | Deploy pega? | Por quê |
|---|---|---|
| Erro de tipo em `apps/api` | ✅ | o build do Render falha |
| Erro de tipo em `apps/web` | ✅ | o build da Vercel falha |
| Quebra de RLS (vazamento entre tenants) | ❌ | nenhum build roda os testes |
| Migration que não aplica em base limpa | ❌ | ninguém provisiona banco novo no deploy |
| Tela que compila mas não funciona | ❌ | build passa, o app quebra em runtime |
| Regressão de lint | ❌ | `next build` não roda eslint |

As três últimas linhas são o valor real. As duas primeiras o CI apenas antecipa
— útil, porque falhar num PR é mais barato que falhar num deploy de `main`.

## As checagens objetivas rodam sem um único segredo

Não é o caso comum, e vale explicar por quê aqui:

- **`apps/api/scripts/bootstrap-db.sh` provisiona um banco do zero** e é
  idempotente. Foi testado contra PostgreSQL 17 — que é exatamente o que um
  service container do GitHub Actions oferece. Roles, migrations, scripts de
  RLS e o role de aplicação, tudo num comando.
- **O seed (`prisma/seed.ts`) carrega usuário, tenant, ministérios e
  voluntários**, com senha em texto no próprio repositório. É problema em
  produção (ver `DEPLOY.md`), mas em CI é conveniência: as credenciais do e2e
  saem do seed, não de um secret.

Consequência: as fases 1 a 3 rodam em um runner efêmero, contra um Postgres
descartável, sem tocar no Supabase de desenvolvimento e sem nenhum segredo
configurado. Isso remove o obstáculo mais comum para CI em projeto pequeno —
e significa que um fork ou um PR de fora roda igual.

A fase 4 (revisão por IA) é a exceção: precisa de autenticação. Está separada
justamente por isso.

## Fases

Deliberadamente incremental: cada fase entrega valor sozinha e a próxima só
começa quando a anterior estiver verde e estável.

### Fase 1 — Build e tipos (imediata)

Dispara em PR e em push para `main`.

```yaml
# .github/workflows/ci.yml (esboço)
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci --include=dev
      - run: npx turbo run build
      - run: npx tsc --noEmit -p apps/api/tsconfig.json
```

Notas que não são óbvias:

- **`--include=dev` é obrigatório** se o job definir `NODE_ENV=production`.
  Foi o que quebrou o primeiro deploy no Render: o npm omite devDependencies e
  o build morre por falta de `turbo`, `nest` e `typescript`.
- `node-version-file: .nvmrc` mantém a versão do Node em um só lugar.
- `npx tsc --noEmit` na API é separado porque `nest build` não checa a pasta
  `test/`, e é justamente lá que ficam os testes de RLS.
- `cache: npm` funciona bem com o lockfile único da raiz.

Tempo estimado: 2–4 min com cache.

### Fase 2 — Testes de RLS contra Postgres efêmero

O ganho mais alto do plano: RLS é a fronteira multi-tenant do sistema, e hoje
nada a verifica automaticamente. São 39 testes, incluindo um controle positivo
que garante que os testes de isolamento não passam por vacuidade.

```yaml
  rls:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env: { POSTGRES_PASSWORD: ci, POSTGRES_DB: orbien }
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 5s
          --health-timeout 5s --health-retries 10
    env:
      DIRECT_URL: postgresql://postgres:ci@localhost:5432/orbien
      DATABASE_URL: postgresql://orbien_app:ci_app@localhost:5432/orbien
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci --include=dev
      - run: ORBIEN_APP_PASSWORD=ci_app bash scripts/bootstrap-db.sh
        working-directory: apps/api
      - run: npm run test:rls -w orbien-backend
```

Pontos de atenção:

- `bootstrap-db.sh` exige PostgreSQL **16+**: usa `GRANT ... WITH SET TRUE`.
  Não rebaixe a imagem para 15.
- O `DATABASE_URL` usa `orbien_app`, o role que o bootstrap cria — não
  `postgres`. Rodar os testes como superusuário passaria por cima do RLS e os
  testes passariam sem testar nada.
- Este job é o que protege contra a categoria de bug mais caro do projeto:
  vazamento de dados entre igrejas.
- `test/setup.ts` carrega `.env` via dotenv, que em CI não existe. Verificado
  que isso não é problema: arquivo ausente não lança, e variável já presente no
  ambiente tem precedência sobre o arquivo. Definir as URLs no `env:` do job
  basta — não é preciso gerar um `.env` no runner.

Tempo estimado: 4–7 min (a suíte sozinha leva ~2,5 min).

### Fase 3 — E2E autocontido

Sobe API e web no próprio runner, contra o Postgres da fase 2 já com seed, e
roda a suíte do Playwright. Sem depender de deploy, de preview da Vercel nem
de credencial externa.

Sequência: bootstrap com `--seed` → `node apps/api/dist/src/main.js` em
background → `next start` do web com `API_BACKEND_URL=http://localhost:3000/api`
→ Playwright com `E2E_BASE_URL=http://localhost:3001`.

Requisitos:

- `npx playwright install --with-deps chromium` (o Chromium não vem no runner)
- Credenciais do seed via env, apontando para o usuário **`tenant_admin`** — o
  `platform_support` leva 403 na maioria das rotas
- Publicar `playwright-report/` e os traces como artifact quando falhar: é o
  que transforma "quebrou no CI" em diagnóstico de dois minutos

Tempo estimado: 6–10 min. Vale rodar em PR, mas é o primeiro candidato a virar
`workflow_dispatch` ou noturno se o tempo incomodar.

### Fase 4 — Revisão de PR pelo Claude (opcional, e a única que custa)

Substitui o template que veio nas skills, que usava o **Cursor SDK** com
`CURSOR_API_KEY` — incompatível com a decisão de usar Claude para tudo. Foi
removido do repositório.

A action oficial é `anthropics/claude-code-action@v1`, e ela consegue rodar a
skill `/code-review` embutida:

```yaml
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: "/code-review --comment ${{ github.repository }}/pull/${{ github.event.pull_request.number }}"
          claude_args: >-
            --max-turns 8
            --allowedTools "mcp__github_inline_comment__create_inline_comment"
```

`permissions` do job: `contents: read`, `pull-requests: write` (para comentar),
`id-token: write`.

O que decidir aqui:

| Assunto | Opções | Nota |
|---|---|---|
| Autenticação | `ANTHROPIC_API_KEY` (secret de org), `CLAUDE_CODE_OAUTH_TOKEN` (pessoal), ou **WIF** (sem secret, via OIDC) | O OAuth é atrelado a uma assinatura pessoal — não serve para organização. WIF é o único caminho que funciona em PR de fork |
| Gatilho | automático em `pull_request`, ou sob demanda via `@claude` em comentário | `prompt` presente = automático; ausente = espera menção |
| Custo | pago por token consumido. `--max-turns` e `--model` limitam | O serviço gerenciado de Code Review da Anthropic é cobrado por review (na ordem de dezenas de dólares em PR grande); a action com API key é bem mais barata para PR pequeno |

**PR de fork:** o GitHub não entrega secrets a workflow disparado por fork.
Com API key, a revisão simplesmente não roda. WIF resolve, ou exigir `@claude`
de alguém com write access.

**Ordem recomendada:** só depois das fases 1 e 2 estáveis. Revisão por IA
opinando sobre um PR cujo build ninguém verificou é ruído caro — e há um
risco de hábito: barra verde da IA não é evidência de que o código funciona.

#### WIF — autenticar sem secret

WIF (Workload Identity Federation) troca o token OIDC que o GitHub já emite
para todo workflow por um token da Anthropic. Não há chave guardada em lugar
nenhum, e é o **único** caminho que funciona em PR de fork, porque o GitHub
retém secrets nesse cenário mas continua emitindo o OIDC.

Configuração em duas pontas:

1. **No Console da Anthropic** — criar um issuer apontando para o GitHub OIDC
   e uma federation rule restringindo qual repositório e qual branch podem
   trocar token. É aqui que fica o controle de acesso: a regra é o que impede
   outro repositório de usar sua conta.
2. **No workflow** — em vez de `anthropic_api_key`, passar os três
   identificadores que a regra gerou:

```yaml
    permissions:
      contents: read
      pull-requests: write
      id-token: write        # sem isto o GitHub não emite o OIDC
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_federation_rule_id: ${{ vars.ANTHROPIC_FEDERATION_RULE_ID }}
          anthropic_organization_id: ${{ vars.ANTHROPIC_ORGANIZATION_ID }}
          anthropic_service_account_id: ${{ vars.ANTHROPIC_SERVICE_ACCOUNT_ID }}
```

Os três não são segredo — são identificadores. Podem ir em `vars` (variáveis de
repositório, visíveis) em vez de `secrets`, ou até literais no arquivo. O que
autoriza é a federation rule do lado da Anthropic, não o valor deles.

Trade-off honesto: exige uma configuração inicial no Console que a API key
dispensa. Em troca, não há chave para rotacionar, revogar ou vazar em log — e
funciona em fork.

#### Acionamento sob demanda

O modo é determinado por um detalhe: **`prompt` presente = automático;
`prompt` ausente = espera menção.**

```yaml
name: Claude
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          claude_args: '--max-turns 8'
```

Na prática: alguém comenta no PR `@claude revisa o isolamento multi-tenant
deste diff` e o workflow dispara com aquele texto como instrução. Dois eventos
são necessários — `issue_comment` cobre comentário no corpo do PR,
`pull_request_review_comment` cobre comentário em linha de código.

Quem comenta precisa ter write access no repositório; menção de terceiro não
dispara. E o `if:` no nível do job é o que evita gastar runner em todo
comentário do repositório.

Vantagem além do custo: você pede a revisão que quer, em vez de receber sempre
a mesma. "Revisa só a parte de RLS" é um pedido melhor que uma varredura
genérica — e é onde a skill `pr-review` deste repo entra, porque ela sabe quais
dimensões existem aqui.

### Fase 5 — Sanidade das skills (barata, e nova)

As skills em `.claude/skills/` passaram a ser versionadas — é o que faz o time
compartilhar as mesmas regras em vez de cada um ter as suas. Isso pede uma
verificação mínima, porque skill quebrada falha silenciosamente:

- todo `SKILL.md` tem frontmatter com `name` e `description`
- o `name` do frontmatter casa com o nome da pasta
- nenhum `SKILL.md` referencia caminho ancorado na raiz que não existe

Já implementado: `node scripts/check-skills.mjs`. Basta acrescentar como step da
fase 1. Vale porque o modo de falha de uma skill é não ser acionada — não gera
erro em lugar nenhum, ninguém percebe.

## O bloqueio: o lint falha hoje

Não é ideia de fase futura, é impedimento imediato. Estado atual:

| App | `lint` | Situação |
|---|---|---|
| `apps/api` | **não existe** | nunca teve eslint configurado |
| `apps/site` | falha | 10 erros, 2 avisos |
| `apps/web` | falha | 17 erros, 7 avisos |

Colocar `turbo run lint` no CI hoje deixa a barra vermelha desde o primeiro PR
— e barra vermelha permanente ensina o time a ignorar a barra, o que é pior do
que não ter CI.

Três caminhos, em ordem de preferência:

1. **Zerar os 27 erros antes de ativar o lint no CI.** A maioria é de duas
   famílias: `react-hooks/set-state-in-effect` e imports não usados. Trabalho
   delimitado e mecânico, e deixa a regra valendo de verdade daí em diante.
2. **Ativar como não-bloqueante** (`continue-on-error: true`), com o
   compromisso explícito de virar bloqueante em uma data. Funciona se o
   compromisso for real; caso contrário é só ruído.
3. **Lint apenas nos arquivos alterados no PR.** Impede regressão nova sem
   exigir a limpeza do passado. Mais complexo de configurar, e a barra fica
   dependente do diff.

Recomendo o caminho 1. Enquanto ele não acontecer, a fase 1 entra **sem** lint.

Sobre `apps/api` não ter eslint: adicionar é desejável, mas é decisão à parte
— configurar eslint num projeto NestJS existente costuma revelar dezenas de
avisos, e isso merece ser tratado como tarefa própria, não como pré-requisito
de CI.

## O que deliberadamente NÃO entra em CI

- **Deploy.** Render e Vercel já publicam a partir de `main`, com
  `buildFilter` e `turbo-ignore` cuidando do isolamento entre apps. Duplicar
  isso em Actions criaria dois caminhos de publicação e uma fonte de confusão.
- **Migrations contra o banco de desenvolvimento.** O bootstrap roda contra
  Postgres efêmero. Nenhum job deve ter credencial do Supabase.
- **Testes contra produção.** O e2e é capaz disso e é útil na mão, para
  verificar um deploy. Como gate automático de PR, tornaria o CI dependente de
  um serviço em free tier que dorme.
- **Remote cache do Turborepo.** Reduziria o tempo, mas exige token e conta.
  Vale reconsiderar se o tempo de CI passar a incomodar; hoje não é o gargalo.
- **Revisão por IA como gate bloqueante.** Ela opina, não decide. Barra verde
  de revisão por IA não é evidência de que o código funciona — quem dá essa
  evidência são as fases 1 a 3. Deixe a fase 4 como comentário, nunca como
  check obrigatório.

## Fluxo de PR e proteção de branch

Hoje tudo vai direto na `main` — 20+ commits, uma branch, zero PRs. Sem PR não
há onde o CI barrar nada, então adotar o fluxo é o que transforma este
workflow em rede de proteção em vez de relatório.

**O fluxo:**

```bash
git switch -c feat/nome-curto
# … trabalho, commits …
git push -u origin HEAD
gh pr create --base main        # usa .github/PULL_REQUEST_TEMPLATE.md
```

O template do PR e a skill `pull-request` compartilham a mesma estrutura de
quatro seções, então pedir "redige o PR" produz algo que já encaixa no
template.

**Proteção de branch — depois de uma semana de CI verde**, não antes: ligar
proteção com workflow instável só ensina a usar bypass. Em Settings → Branches,
regra para `main`:

- Exigir PR antes do merge
- Exigir os checks verdes: `Build, tipos e lint` e `Testes de RLS`
- Exigir branch atualizada com `main` antes do merge

Deixe o check de **E2E fora dos obrigatórios no começo**: é o mais lento e o
mais sujeito a intermitência de rede. Promova a obrigatório quando tiver
histórico dele.

Não vale exigir aprovação de outra pessoa ainda — com uma pessoa ativa,
travaria o próprio autor. Revisitar quando houver a segunda.

## Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Testes de RLS lentos (transações contra o pooler) | Em CI o Postgres é local, sem pooler: devem ficar bem mais rápidos que os ~2,5 min contra Supabase |
| E2E intermitente | O harness já usa espera por estado, não por tempo. Com `retries: 1` e trace no primeiro retry, falha transitória não vira ruído |
| Seed divergir do que o e2e espera | O e2e cria e remove as próprias fixtures; depende do seed apenas para usuário e ministérios |
| Tempo total de CI crescer | Fases 1 e 2 em PR; fase 3 pode virar noturna se incomodar |

## Decisões que dependem de você

1. **Zerar os 27 erros de lint** antes de ativar o lint no CI? (recomendo sim)
2. Ativar as fases **1 e 2 juntas**, ou a 1 primeiro e a 2 depois de estável?
3. E2E **em todo PR** ou só noturno / sob demanda?
4. Adicionar **eslint em `apps/api`** agora ou tratar como tarefa separada?
5. Ativar **proteção de branch** já, ou esperar a primeira semana de CI verde?
6. Revisão por IA (fase 4): **ativar agora ou depois**? E qual autenticação —
   API key em secret de organização, ou WIF sem secret? (recomendo depois das
   fases 1 e 2, e WIF se houver intenção de aceitar PR de fork)
7. Gatilho da revisão: **automático em todo PR** ou sob demanda com `@claude`?
   (sob demanda custa menos e evita ruído em PR de uma linha)
