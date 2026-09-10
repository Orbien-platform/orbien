# Mapa do monorepo e portão de cobertura do mobile — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: pulado — não há decisão de arquitetura nesta feature. As mudanças
são conteúdo de documentação e configuração de portão de teste, esta última
seguindo o padrão que os outros quatro apps já estabeleceram
(`apps/api/jest.config.js`, `apps/{web,site,admin}/vitest.config.ts`). A única
decisão técnica — o valor do piso de cobertura e o denominador que o produz —
está registrada em `spec.md`, seção Assumptions.
**Spec**: `.specs/features/mapa-monorepo-e-portoes/spec.md`
**Status**: Done — T1-T10 concluídas e commitadas (`42f1801`..`fdcf14e`); aguardando Verifier

---

## Test Coverage Matrix

> Gerada do codebase e das diretrizes do projeto — confirmar antes do Execute.
> Diretrizes encontradas: `CLAUDE.md` (raiz), `apps/mobile/AGENTS.md`,
> `docs/TESTES.md` (seções "O que conta como cobertura" e "Exclusões"),
> `apps/api/jest.config.js`, `apps/admin/vitest.config.ts`,
> `apps/mobile/jest.config.js`, `.github/workflows/ci.yml`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| Documentação (`README.md`, `CLAUDE.md`, `docs/**.md`, `.specs/**.md`) | none | Portão de build/lint e a asserção declarada no `Done when` de cada tarefa (grep verificável). Não há código a cobrir. | — | `npx turbo run lint` |
| Configuração de portão de cobertura (`apps/mobile/jest.config.js`, `apps/mobile/package.json`) | none — o próprio comando é a verificação | **Prova nas duas direções:** o comando passa no estado atual **e** falha quando qualquer threshold sobe 1 ponto. Só "passa hoje" não prova portão nenhum — um threshold em 0 também passaria. | `apps/mobile/jest.config.js` | `npm run test:cov -w orbien-mobile` |
| Workflow de CI (`.github/workflows/ci.yml`) | none | YAML válido + o passo novo roda o mesmo comando provado na tarefa anterior. Não há runner de CI local; a validação é sintática + equivalência de comando. | `.github/workflows/ci.yml` | `npx yaml-lint` ou `python3 -c "import yaml,sys;yaml.safe_load(open(...))"` |
| Suítes existentes do mobile | unit (já existentes) | **Não regridem**: 39 suítes / 239 testes continuam passando, nenhuma enfraquecida ou removida. O piso é medido sobre elas, não sobre suítes novas. | `apps/mobile/src/**/*.test.{ts,tsx}` | `npm run test -w orbien-mobile` |

> Nenhuma tarefa desta feature escreve código de produção. As tarefas de
> documentação têm `Tests: none` porque a matriz diz `none` para essa camada —
> não por diferimento. As tarefas de configuração têm `Tests: none` pelo mesmo
> motivo, e em troca carregam no `Done when` uma prova executada nas duas
> direções, que é mais forte que um arquivo de teste sobre config.

## Gate Check Commands

> Gerada do codebase — sempre a partir da raiz.

| Gate Level | When to Use | Command |
|---|---|---|
| Quick (docs) | Após tarefa que só toca `.md` | `npx turbo run lint` (nada a rodar além disso — nenhum `.md` entra em build) |
| Quick (mobile) | Após tarefa que toca config de teste do mobile | `npm run test -w orbien-mobile` |
| Cobertura (mobile) | Na tarefa do portão, nas duas direções | `npm run test:cov -w orbien-mobile` |
| Build | Ao fechar a última fase | `npx turbo run build && npx turbo run lint && npx turbo run test` |

---

## Execution Plan

### Phase 1: Mapa — os documentos que enumeram os apps

Independentes entre si, mas escritos em ordem do mais geral para o mais
específico para a voz ficar consistente.

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Homogeneidade — `app-mobile`

Depende da Fase 1 só por coerência de redação (o ROADMAP passa a citar o
estado dos MOB-NN que estas tarefas consolidam).

```
T6 → T7
```

### Phase 3: Portões

O passo do CI (T9) depende do script existir (T8). `docs/TESTES.md` (T10)
depende dos números finais que T8 trava.

```
T8 → T9 → T10
```

---

## Task Breakdown

### T1: `README.md` da raiz — cinco apps e Render em runtime Node

**What**: Atualizar a árvore de `## Estrutura`, a tabela de `## Deploy` e os
blocos de comandos para os cinco apps, e corrigir "Docker no Render" para
runtime Node.
**Where**: `README.md`
**Depends on**: None
**Reuses**: A tabela de apps do `CLAUDE.md` da raiz (mesma coluna: caminho,
package, stack, deploy) e o `DEPLOY.md` para o fato do runtime.
**Requirement**: MAP-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `## Estrutura` lista os cinco apps com package name e destino
- [ ] O deploy da API diz **runtime Node**, não Docker, e aponta o `DEPLOY.md`
- [ ] `apps/mobile` aparece com EAS como destino (não Vercel/Render)
- [ ] Os blocos de comando citam `npm run dev:admin` e `npm run dev:mobile`,
      que já existem no `package.json` da raiz
- [ ] `grep -n "sobe os três" README.md` não volta nada
- [ ] Gate check passa: `npx turbo run lint`

**Tests**: none
**Gate**: quick (docs)

**Commit**: `docs: README da raiz com os cinco apps e o runtime real da API`

---

### T2: `docs/MONOREPO.md` — quinto app, portas e deploy

**What**: Acrescentar `apps/mobile` à narrativa de origem dos apps, à tabela de
portas (ou registrar por que ele não tem porta fixa) e à seção de deploy; e
corrigir a afirmação de que a API é imagem Docker no Render.
**Where**: `docs/MONOREPO.md`
**Depends on**: T1
**Reuses**: O texto que T1 fixou sobre o runtime da API, para os dois não
divergirem de novo.
**Requirement**: MAP-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] O parágrafo de origem cita os cinco apps e diz de onde o `mobile` veio
- [ ] A seção de deploy tem a linha do mobile (EAS Build, fora de Vercel e
      Render), coerente com o job `mobile-eas-build` do `ci.yml`
- [ ] A tabela de portas registra o mobile (Metro/Expo) ou diz explicitamente
      por que ele não entra nela
- [ ] `npm run dev` já não é descrito como "sobe os quatro"
- [ ] A API é descrita como runtime Node no Render
- [ ] Gate check passa: `npx turbo run lint`

**Tests**: none
**Gate**: quick (docs)

**Commit**: `docs: MONOREPO com o mobile e o deploy real da API`

---

### T3: `CLAUDE.md` da raiz — linha do mobile na tabela de apps

**What**: Acrescentar `apps/mobile` à tabela de apps e a menção ao
`apps/mobile/CLAUDE.md`/`AGENTS.md`, sem tocar em nenhuma das regras do
monorepo já escritas.
**Where**: `CLAUDE.md`
**Depends on**: T2
**Reuses**: O formato exato da tabela existente (Caminho / Package / Stack /
Deploy).
**Requirement**: MAP-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A tabela tem cinco linhas, e a do mobile traz `orbien-mobile`, Expo/React
      Native e EAS
- [ ] Nenhuma regra existente do arquivo é alterada, reordenada ou removida
      (diff só acrescenta)
- [ ] Gate check passa: `npx turbo run lint`

**Tests**: none
**Gate**: quick (docs)

**Commit**: `docs: CLAUDE.md da raiz com apps/mobile na tabela`

---

### T4: `docs/ROADMAP.md` — o mobile existe, foi entregue, e o ciclo mudou

**What**: Remover a afirmação de que `apps/mobile` não existe, acrescentar o
módulo à tabela "O que já foi entregue" com o estado verificado dos MOB-NN, e
reescrever os itens de "Ciclos seguintes" que a entrega do mobile já resolveu.
**Where**: `docs/ROADMAP.md`
**Depends on**: T3
**Reuses**: `.specs/features/app-mobile/spec.md` (tabela de Requirement
Traceability) como fonte do estado por requisito.
**Requirement**: MAP-03

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `grep -n "não existe .apps/mobile" docs/ROADMAP.md` não volta nada
- [ ] "O que já foi entregue" tem linha do mobile citando o que está verificado
      (MOB-01 a MOB-09, MOB-11, MOB-12) e o que não está (MOB-10)
- [ ] O item 1 de "Ciclos seguintes" ("Mobile: retomar a Fase 7 ou assumir o
      `apps/web`") reflete que a decisão foi tomada e executada
- [ ] O item 3 ("White-label premium... depende da decisão de mobile acima")
      passa a depender do que de fato falta, não de uma decisão já tomada
- [ ] Os bloqueadores de go-live do mobile levantados nesta sessão
      (`ORBIEN_API_URL` do profile `production`, app id do OneSignal,
      ausência de parte de mobile no `DEPLOY.md`) aparecem nomeados como o que
      falta — sem serem corrigidos aqui (estão fora de escopo)
- [ ] Nenhuma seção histórica de `docs/produto/` é reescrita
- [ ] Gate check passa: `npx turbo run lint`

**Tests**: none
**Gate**: quick (docs)

**Commit**: `docs: ROADMAP reconhece o mobile entregue e atualiza os ciclos`

---

### T5: `docs/CI.md` — os jobs que o `ci.yml` tem hoje

**What**: Documentar o job `mobile-eas-build` e o passo de cobertura do mobile,
e corrigir toda contagem de apps no texto.
**Where**: `docs/CI.md`
**Depends on**: T4
**Reuses**: `.github/workflows/ci.yml` como fonte — o documento descreve o
workflow, não o contrário.
**Requirement**: MAP-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] O job `mobile-eas-build` está descrito: quando dispara (só quando o diff
      toca `apps/mobile`), o que exige antes (`needs`) e o que produz
- [ ] O passo de cobertura do mobile está listado junto dos outros quatro
      (escrito aqui já apontando o que T8/T9 vão criar; a conferência final é
      do `Done when` de T9)
- [ ] `grep -n "quatro apps\|4 apps" docs/CI.md` não volta nada
- [ ] Gate check passa: `npx turbo run lint`

**Tests**: none
**Gate**: quick (docs)

**Commit**: `docs: CI.md descreve o job do mobile e a cobertura dos cinco apps`

---

### T6: `app-mobile/tasks.md` e `validation.md` — rodadas 2 a 4 fechadas

**What**: Marcar as rodadas 2, 3 e 4 do `tasks.md` como Done, cada uma citando
o veredito e o commit de fix correspondente, e corrigir a numeração duplicada
das seções do `validation.md`.
**Where**: `.specs/features/app-mobile/tasks.md`,
`.specs/features/app-mobile/validation.md`
**Depends on**: T5
**Reuses**: Os vereditos já escritos no `validation.md` — nenhum é reescrito.
**Requirement**: MAP-05, MAP-06 (parte)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Antes de editar, cada rodada é conferida na codebase: os arquivos de
      implementação que a rodada declara existem, e o `validation.md` traz
      veredito para ela — a evidência é registrada no corpo do commit
- [ ] `grep -n "Status\*\*: In Progress" .specs/features/app-mobile/tasks.md`
      não volta nada
- [ ] Cada rodada fechada cita o veredito (`✅ Ready`) e o commit do fix quando
      houve (`4cec930` na de MOB-04/05, `0568697` na de MOB-07)
- [ ] As duas seções hoje numeradas "3" no `validation.md` passam a ter números
      distintos e coerentes com a ordem cronológica
- [ ] Nenhum texto de veredito, evidência ou `file:line` é alterado
- [ ] Gate check passa: `npx turbo run lint`

**Tests**: none
**Gate**: quick (docs)

**Commit**: `docs(specs): fecha as rodadas 2-4 do app-mobile com o veredito de cada uma`

---

### T7: `app-mobile/spec.md` — notas de execução vencidas e o AC2 do MOB-06

**What**: Marcar como cumpridas (ou remover) as notas "não marcar Verified
aqui", e corrigir a redação do AC2 do MOB-06 para descrever o comportamento
confirmado no `design.md` daquela rodada.
**Where**: `.specs/features/app-mobile/spec.md`
**Depends on**: T6
**Reuses**: O veredito da rodada de MOB-06 no `validation.md`, que é quem
recomendou esta correção; e a lição L-005 em `.specs/LESSONS.md`, que descreve
exatamente este defeito.
**Requirement**: MAP-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] As notas "Nota (Fase 1/2 do Execute)" e "Nota (Fase 3/4 do Execute)" já
      não instruem a não marcar Verified — a condição delas não vale mais
- [ ] O AC2 do MOB-06 descreve o comportamento implementado e confirmado
      (listagem sem filtro por segmento), citando onde a decisão foi tomada
- [ ] A linha de "Coverage" da tabela de traceability reflete a contagem real
      de verificados
- [ ] MOB-10 continua Pending — nenhuma tarefa desta feature o implementa
- [ ] Gate check passa: `npx turbo run lint`

**Tests**: none
**Gate**: quick (docs)

**Commit**: `docs(specs): spec do app-mobile reflete o que o Verifier fechou`

---

### T8: Portão de cobertura do `apps/mobile`

**What**: Acrescentar `collectCoverageFrom`, `coverageReporters` e
`coverageThreshold` ao `jest.config.js` do mobile, e o script `test:cov` ao
`package.json` do workspace.
**Where**: `apps/mobile/jest.config.js`, `apps/mobile/package.json`
**Depends on**: T7
**Reuses**: `apps/api/jest.config.js` (formato de `collectCoverageFrom`,
`coverageReporters: ['text-summary','lcov']`, comentário do piso) e
`apps/admin/vitest.config.ts` (piso medido com justificativa por métrica).
**Requirement**: MAP-07, MAP-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `collectCoverageFrom` cobre `src/**/*.{ts,tsx}` excluindo `*.test.{ts,tsx}`
      e `*.d.ts` — e nada mais
- [ ] `coverageThreshold.global` = `{ statements: 94, branches: 84, functions: 93, lines: 97 }`
- [ ] Comentário no arquivo registra: data da medição (2026-09-10), os números
      medidos (94,51 / 84,69 / 93,81 / 97,94), que o piso é o inteiro para
      baixo, e a regra "o piso nunca desce"
- [ ] `testTimeout: 60000` e o bloco de `transform`/`transformIgnorePatterns`
      do `lucide-react-native` continuam intactos
- [ ] `apps/mobile/package.json` ganha `"test:cov": "jest --coverage --passWithNoTests"`,
      no mesmo formato dos outros quatro workspaces
- [ ] **Prova direção 1**: `npm run test:cov -w orbien-mobile` sai com código 0
- [ ] **Prova direção 2**: com `statements` temporariamente em 95, o mesmo
      comando sai com código ≠ 0 — e o valor é revertido para 94 antes do commit
- [ ] Contagem de testes: 39 suítes / 239 testes continuam passando, nenhuma
      removida ou enfraquecida
- [ ] Gate check passa: `npm run test:cov -w orbien-mobile`

**Tests**: none (a camada é config; a verificação é a prova nas duas direções acima)
**Gate**: cobertura (mobile)

**Commit**: `test(mobile): trava o piso de cobertura medido e expõe test:cov`

---

### T9: `ci.yml` — cobertura do mobile e a contagem de apps

**What**: Acrescentar o passo "Cobertura do mobile" ao job "Unidade e
cobertura" e corrigir os rótulos que dizem quatro apps.
**Where**: `.github/workflows/ci.yml`
**Depends on**: T8
**Reuses**: O formato exato dos quatro passos de cobertura que já existem.
**Requirement**: MAP-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Passo `Cobertura do mobile` roda `npm run test:cov -w orbien-mobile`,
      posicionado junto dos outros quatro
- [ ] `Build dos 4 apps` e `Suítes de unidade dos 4 apps` passam a dizer cinco
- [ ] O comentário do bloco de cobertura ("enquanto estiverem em 0, este passo
      mede sem bloquear") é revisto: não vale mais para api/site/admin/mobile
- [ ] YAML continua válido: `python3 -c "import yaml;yaml.safe_load(open('.github/workflows/ci.yml'))"`
      sai com código 0
- [ ] O comando do passo novo é **literalmente** o mesmo provado em T8
- [ ] Gate check passa: `npm run test:cov -w orbien-mobile`

**Tests**: none
**Gate**: cobertura (mobile)

**Commit**: `ci: mede cobertura do mobile junto dos outros quatro apps`

---

### T10: `docs/TESTES.md` — o mobile no quadro e a Fase 13 como ela é

**What**: Acrescentar a linha do mobile ao quadro "Estado" e à tabela de
cobertura medida, registrar as exclusões de cobertura do mobile na seção que as
exige, e reescrever a Fase 13 para descrever o que o web de fato trava.
**Where**: `docs/TESTES.md`
**Depends on**: T9
**Reuses**: Os números que T8 travou; o formato das linhas de fase e de
exclusão já existentes.
**Requirement**: MAP-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] O quadro "Estado" tem linha do mobile, com escopo e estado, e a nota
      explicando que ela nasceu depois do plano original (mesmo tratamento que
      a Fase 14 recebeu)
- [ ] A tabela de cobertura medida ganha a linha do mobile com os quatro
      números e a data (2026-09-10)
- [ ] A seção "Exclusões" registra `*.test.{ts,tsx}` e `*.d.ts` do mobile com
      justificativa, como a própria seção exige de cada linha
- [ ] A seção da Fase 13 diz que o web fecha por piso por caminho, por quê, e
      que subir o web a `global: 100` segue em aberto como trabalho próprio —
      sem promessa que o `vitest.config.ts` não cumpre
- [ ] O item "1. `global: 100` no web e no admin" do quadro da Fase 13 é
      corrigido: o admin **tem** threshold travado (99/98/100/100) desde a
      Fase 14; só o web está em aberto
- [ ] `grep -c mobile docs/TESTES.md` > 0
- [ ] Gate check passa: `npx turbo run lint`

**Tests**: none
**Gate**: quick (docs)

**Commit**: `docs: plano de testes com o mobile e a Fase 13 descrita como ela é`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ──→ T2 ──→ T3 ──→ T4 ──→ T5
Phase 2:  T6 ──→ T7
Phase 3:  T8 ──→ T9 ──→ T10
```

Execução estritamente sequencial — uma tarefa por vez, na ordem.

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1: README da raiz | 1 arquivo | ✅ Granular |
| T2: MONOREPO.md | 1 arquivo | ✅ Granular |
| T3: CLAUDE.md | 1 arquivo, 1 linha de tabela | ✅ Granular |
| T4: ROADMAP.md | 1 arquivo | ✅ Granular |
| T5: CI.md | 1 arquivo | ✅ Granular |
| T6: tasks.md + validation.md do app-mobile | 2 arquivos, 1 conceito (fechar as rodadas) | ⚠️ OK — coeso: o estado e a numeração das rodadas são a mesma informação em dois lugares |
| T7: spec.md do app-mobile | 1 arquivo | ✅ Granular |
| T8: jest.config.js + package.json do mobile | 2 arquivos, 1 conceito (o portão) | ⚠️ OK — coeso: sem o script, a config não é executável nem verificável; separá-los produziria uma tarefa cujo resultado não pode ser provado |
| T9: ci.yml | 1 arquivo | ✅ Granular |
| T10: TESTES.md | 1 arquivo | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (corpo) | Diagrama mostra | Status |
|---|---|---|---|
| T1 | None | (início da Phase 1) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 (fronteira de fase) | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 (fronteira de fase) | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |

Nenhuma tarefa depende de tarefa de fase posterior.

---

## Test Co-location Validation

| Task | Camada criada/modificada | Matriz exige | Tarefa diz | Status |
|---|---|---|---|---|
| T1 | Documentação | none | none | ✅ OK |
| T2 | Documentação | none | none | ✅ OK |
| T3 | Documentação | none | none | ✅ OK |
| T4 | Documentação | none | none | ✅ OK |
| T5 | Documentação | none | none | ✅ OK |
| T6 | Documentação | none | none | ✅ OK |
| T7 | Documentação | none | none | ✅ OK |
| T8 | Config de portão de cobertura | none (prova nas duas direções no `Done when`) | none | ✅ OK |
| T9 | Workflow de CI | none (YAML válido + equivalência de comando) | none | ✅ OK |
| T10 | Documentação | none | none | ✅ OK |

Nenhum `Tests: none` aqui é diferimento: nenhuma tarefa desta feature produz
código de produção. As duas tarefas de configuração carregam prova executada,
não autoavaliação.

---

## Task Verification Standards

Cada tarefa fecha com o `Done when` inteiro satisfeito e o gate da sua linha
passando — o runner decide, não a autoavaliação. Um commit atômico por tarefa.
Depois de T10, um Verifier fresco roda automaticamente (autor ≠ verificador).
