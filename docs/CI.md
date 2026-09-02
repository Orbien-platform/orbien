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

### Fase 4 — Revisão: local, não no CI

**Decidido: a revisão por IA acontece localmente, antes de abrir o PR.** Não há
job de revisão no CI, e por bons motivos:

- Custa zero em minutos de Actions e zero em API — o Claude Code já está pago.
- Dispensa autenticação: nada de secret, nada de WIF a configurar.
- O feedback chega **antes** do push, quando corrigir não exige outro commit.
- O revisor local tem o repositório inteiro à mão: roda os testes, abre o banco,
  confirma a hipótese. Um job de CI só lê o diff.

O fluxo está nas skills, para não depender de memória: a skill `pull-request`
manda revisar antes do `gh pr create`, e a skill `pr-review` aceita a branch
local (`main...HEAD`) como alvo padrão.

Para quem quiser a revisão como **portão** e não como conversa,
`scripts/pre-push.sh --review` invoca o Claude em modo headless (`claude -p`),
com ferramentas restritas a leitura, e exige que a última linha da resposta seja
`VEREDITO: APROVADO` ou `VEREDITO: BLOQUEADO`. Bloqueado sai com código 1.

Ressalva importante: veredito de IA **não é determinístico**. Ele pode reprovar
o que está bom e aprovar o que não está. É por isso que as regras mecânicas do
Orbien viraram checagem por script no mesmo arquivo — o que dá para verificar,
verifica-se; a IA fica para o juízo que não dá.

#### As três fraquezas, ditas de frente

1. **Não é verificável.** Passo local depende de disciplina. Com uma pessoa,
   funciona; com duas, "você rodou a revisão?" não tem resposta objetiva.
2. **Autor revisando o próprio trabalho.** Se a revisão roda na mesma sessão
   que escreveu o código, aplica-se o mesmo modelo mental que produziu qualquer
   lacuna. Mitiga-se revisando em sessão nova ou despachando as dimensões como
   subagentes, mas não equivale a outra pessoa.
3. **Não deixa registro.** Revisão em PR fica no histórico para quem vier
   depois. A local se perde no terminal.

#### Quando reverter esta decisão

Quando entrar a segunda pessoa contribuindo. Aí a revisão local dela é
invisível para você, e o item 1 deixa de ser aceitável. Nesse momento, as duas
receitas abaixo passam a valer.

#### Receita A — automático em todo PR

```yaml
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: "/code-review --comment ${{ github.repository }}/pull/${{ github.event.pull_request.number }}"
          claude_args: >-
            --max-turns 8
            --allowedTools "mcp__github_inline_comment__create_inline_comment"
```

`permissions`: `contents: read`, `pull-requests: write`, `id-token: write`.

#### Receita B — sob demanda por menção

O modo é decidido por um detalhe: **`prompt` presente = automático; `prompt`
ausente = espera menção.**

```yaml
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

Alguém comenta `@claude revisa o isolamento multi-tenant deste diff` e o
workflow dispara com aquele texto. Dois eventos são necessários:
`issue_comment` para comentário no corpo, `pull_request_review_comment` para
comentário em linha. Só quem tem write access dispara, e o `if:` no nível do
job evita gastar runner em todo comentário.

#### Autenticação, quando chegar a hora

| Opção | Secret | Nota |
|---|---|---|
| `ANTHROPIC_API_KEY` | sim, de organização | Mais simples. **Não funciona em PR de fork** — o GitHub retém secrets |
| `CLAUDE_CODE_OAUTH_TOKEN` | sim, pessoal | Atrelado a uma assinatura individual; não serve para organização |
| **WIF** | **nenhum** | Troca o OIDC que o GitHub já emite por token da Anthropic. Único caminho que funciona em fork |

WIF em duas pontas: no Console da Anthropic, criar issuer apontando para o
GitHub OIDC e uma federation rule restringindo repositório e branch — é a regra
que autoriza, e é onde fica o controle de acesso. No workflow, trocar
`anthropic_api_key` por três identificadores:

```yaml
          anthropic_federation_rule_id: ${{ vars.ANTHROPIC_FEDERATION_RULE_ID }}
          anthropic_organization_id: ${{ vars.ANTHROPIC_ORGANIZATION_ID }}
          anthropic_service_account_id: ${{ vars.ANTHROPIC_SERVICE_ACCOUNT_ID }}
```

Os três não são segredo, são identificadores — podem ir em `vars`, visíveis.
`id-token: write` é obrigatório, senão o GitHub não emite o OIDC.

Custo, para quando for decidir: a action com API key é paga por token
consumido, controlável com `--max-turns` e `--model`. O serviço gerenciado de
Code Review da Anthropic é cobrado por review, na ordem de dezenas de dólares
em PR grande.


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

## Trunk-based: o CI é alarme, não portão

**Decidido: trunk-based.** Commit direto na `main`, sem PR, até se provar que o
modelo não serve.

Isso muda o papel do CI, e vale dizer com clareza: o job dispara em `push` para
a `main`, ou seja **depois** de o commit já estar lá. Ele detecta, não impede.
Quando ficar vermelho, o problema já está na `main` — e possivelmente já
deployado, porque Render e Vercel disparam do mesmo push.

Não é inútil: pega o que você não rodou localmente, e pega rápido. Mas é alarme
de incêndio, não porta trancada.

**Consequência prática: o portão passa a ser local**, e está implementado:

```bash
bash scripts/pre-push.sh              # determinístico
bash scripts/pre-push.sh --e2e        # inclui a suíte de tela
bash scripts/pre-push.sh --review     # inclui revisão por IA, com veredito
```

Ele roda o que o CI rodaria — build dos 3 apps, tipos da API incluindo `test/`,
lint, sanidade das skills — e dispara os testes de RLS sozinho quando o diff
toca `apps/api`. Sai com código 1 quando bloqueia, então serve de hook.

Antes dos portões genéricos ele checa o que é **específico do Orbien e dá para
verificar por script**, em vez de depender de juízo:

| Checagem | Efeito |
|---|---|
| Import cruzando app | bloqueia — quebra a independência dos deploys |
| `package-lock.json` em `apps/*` | bloqueia — a raiz é a única fonte |
| `schema.prisma` sem migration, ou o inverso | alerta |
| Tabela nova sem `ENABLE ROW LEVEL SECURITY` | alerta |
| Tabela nova sem caso em `isolation.spec.ts` | alerta |
| `CREATE POLICY` sem `DROP POLICY IF EXISTS` | alerta — quebra reexecução |

A distinção entre bloquear e alertar é deliberada: bloqueio é só para o que é
inequívoco. Alerta que vira bloqueio falso ensina a usar `--no-verify`, e aí o
portão deixa de existir.

O gatilho `pull_request` fica no workflow de propósito: não custa nada
enquanto não houver PR, e passa a funcionar sozinho no dia em que houver.

### Se a disciplina falhar, o hook é uma linha

O script existe, mas rodar depende de lembrar. Para virar portão de verdade:

```bash
printf '#!/bin/sh\nexec bash scripts/pre-push.sh\n' > .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

`git push --no-verify` continua passando por cima — de propósito, como escape
consciente. Hook não é versionado pelo git, então cada pessoa ativa o seu.

Deliberadamente **não ativei**: hook que roda 3 min a cada push vira atrito, e
atrito vira `--no-verify` por reflexo. Vale esperar para ver se a disciplina
falta antes de impor.

### O que fica dormente

- `.github/PULL_REQUEST_TEMPLATE.md` e a skill `pull-request` só entram em cena
  se um PR for aberto. Não incomodam enquanto isso.
- Proteção de branch não se aplica: não há PR para exigir check.


## Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Testes de RLS lentos (transações contra o pooler) | Em CI o Postgres é local, sem pooler: devem ficar bem mais rápidos que os ~2,5 min contra Supabase |
| E2E intermitente | O harness já usa espera por estado, não por tempo. Com `retries: 1` e trace no primeiro retry, falha transitória não vira ruído |
| Seed divergir do que o e2e espera | O e2e cria e remove as próprias fixtures; depende do seed apenas para usuário e ministérios |
| Tempo total de CI crescer | Fases 1 e 2 em PR; fase 3 pode virar noturna se incomodar |

## Decisões — todas tomadas

Mantidas aqui com o racional, para quem chegar depois entender por quê.

1. ~~Zerar os erros de lint antes de ativar o lint no CI~~ — **sim**, zerados, e
   o `turbo run lint` entrou como step obrigatório da fase 1.
2. ~~Quais fases ativar~~ — **1, 2 e 3 juntas**, já implementadas.
3. ~~E2E em todo PR ou noturno~~ — **em todo push**, que no modelo trunk-based é
   o equivalente. Fica fora dos checks obrigatórios se algum dia houver PR: é o
   mais lento e o mais sujeito a intermitência de rede.
4. ~~eslint em `apps/api`~~ — **adicionado agora**, junto com a limpeza dos
   fronts, para o `turbo run lint` cobrir os três apps.
~~5. Proteção de branch~~ — **decidido: trunk-based**, sem PR. Não se aplica
   enquanto o modelo estiver em teste.
~~6. Revisão por IA no CI~~ — **decidido: não.** A revisão é local, antes de
   abrir o PR (fase 4). Reverter quando entrar a segunda pessoa contribuindo.
~~7. Gatilho da revisão~~ — sem gatilho, porque não roda no CI. As duas
   receitas ficam documentadas na fase 4 para quando a decisão 6 for revista.
