# DRE: lucro/prejuízo, PDF e centros de custo — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and follow its Execute flow and Critical Rules.**
**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

**Design**: `.specs/features/financeiro-dre-resultado-centros-custo/design.md`
**Status**: Done (aguarda Verifier)

Regras do repo que valem em toda tarefa: branch `feat/dre-lucro-prejuizo-centros-de-custo` (já criada); todo Edit/Write em `apps/web` exige a skill `frontend-design` carregada (hook); gráficos exigem `dataviz`; testes só em `teste1-church`/`teste2-church`; instalar só da raiz; um commit atômico por tarefa, em português, terminando com as linhas de atribuição do harness.

---

## Test Coverage Matrix

> Guidelines lidas: `CLAUDE.md`, `apps/web/AGENTS.md`, `apps/api/jest.config.js`, `docs/TESTES.md`. Jest da API tem projeto `unit` em `src/**` (testes ao lado do código, como os `dre*.spec.ts` atuais).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Helper/serviço/DTO da API | unit | 1:1 com os ACs; casos de borda da spec; asserção no valor/estado, não só na chamada | `apps/api/src/financial/*.spec.ts` | `npm run test:unit -w orbien-backend -- financial/<arquivo>` |
| Controller da API | unit | Rota nova: caminho feliz + 400 + papéis/plano (padrão de `dre.controller.spec.ts`) | `apps/api/src/financial/*.controller.spec.ts` | idem |
| Componente web | unit (vitest + Testing Library) | Estados: carregando, vazio, erro, 403, sucesso; rótulos lucro/prejuízo | `apps/web/src/components/financial/*.test.tsx` | `npm run test -w orbien-web -- <arquivo>` |
| Fluxo de tela | e2e (Playwright) | Caminho feliz da aba DRE + um de erro, só `teste1-church` | `apps/web/e2e/financeiro.spec.ts` | `npm run e2e -w orbien-web` (se o ambiente permitir) |
| Schema/RLS | none | Sem tabela nova | — | — |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick (API) | Tarefa só com unit da API | `npm run test:unit -w orbien-backend -- financial` |
| Quick (Web) | Tarefa só com unit do web | `npm run test -w orbien-web -- financial financeiro` |
| Full | Tarefa com e2e | quick + `npm run e2e -w orbien-web -- financeiro` |
| Build | Última tarefa da fase | `npm run build:api` ou `npm run build:web` + `npm run lint -w orbien-backend` / `-w orbien-web` + todos os testes do app |

---

## Execution Plan

Fases em sequência; a Fase 3 depende dos contratos da Fase 1 e 2.

### Phase 1: DRE na API
```
T1 → T2 → T3
```
### Phase 2: Centros de custo na API
```
T4 → T5 → T6
```
### Phase 3: DRE na tela
```
T7 → T8 → T9
```
### Phase 4: Balancete e fechamento
```
T10 → T11 → T12
```

Empacotamento (~7 tarefas por worker, fases inteiras): **Batch 1 = Fases 1+2 (API, 6 tarefas)** · **Batch 2 = Fases 3+4 (web + fechamento, 6 tarefas)**.

---

## Task Breakdown

### T1: Helper de escopo e DTOs
**What**: `dre-scope.ts` (`REALIZED_STATUSES`, `buildScope`, `round2`, `resultLabel`) e validação de `cost_center_id` (UUID ou `none`) e de período invertido em `DreQueryDto` e `BalanceteQueryDto`.
**Where**: `apps/api/src/financial/dre-scope.ts`, `dto/dre-query.dto.ts`, `dto/balancete-query.dto.ts` (+ specs)
**Depends on**: None · **Reuses**: `dto/dre-query.dto.spec.ts`
**Requirement**: DRE-04, DRE-07, DRE-10, DRE-11, DRE-12
**Done when**:
- [x] `buildScope` com `none` gera `cost_center_id: null`; com UUID, `cost_center_id`; UUID vence nome
- [x] `round2(0.1+0.2-0.3) === 0`
- [x] DTO rejeita `cost_center_id` inválido e `period_end < period_start`; aceita `none`
- [x] Gate quick passa; contagem de testes registrada
**Tests**: unit · **Gate**: quick (API)
**Status**: ✅ Concluída

### T2: DreService realizado, A realizar e filtro por id
**What**: `buildDre` e `fetchPeriodSummary` usam `buildScope` com `REALIZED_STATUSES`; `net_result` arredondado; novo `pending`; `cost_center_id`.
**Where**: `apps/api/src/financial/dre.service.ts` (+ spec)
**Depends on**: T1 · **Requirement**: DRE-01, DRE-02, DRE-04, DRE-09, DRE-10, DRE-11
**Done when**:
- [x] Pendente não entra em receitas/despesas/resultado, atual nem anterior
- [x] `pending` traz a soma dos pendentes do mesmo recorte
- [x] 0,10 + 0,20 − 0,30 → `net_result` 0
- [x] Filtro por centro vale para período atual e anterior
- [x] Testes existentes de `previousPeriod` e arredondamento por categoria seguem verdes sem edição
**Tests**: unit · **Gate**: quick (API)
**Status**: ✅ Concluída

### T3: PDF do DRE somente leitura com Lucro/Prejuízo
**What**: remover o `updateMany`; rótulo "Lucro/Prejuízo do período"/"Resultado zerado"; linha "A realizar"; cabeçalho com o recorte de centro (nome ou "Sem centro de custo"); controller com 400 em período inválido.
**Where**: `dre-pdf.service.ts`, `dre.controller.ts` (+ specs)
**Depends on**: T2 · **Requirement**: DRE-05, DRE-06, DRE-07
**Done when**:
- [x] Teste afirma que `financialTransaction.updateMany`/`update` nunca é chamado
- [x] `docDef` contém "Lucro do período" para net > 0, "Prejuízo do período" para net < 0 e "Resultado zerado" para 0
- [x] `docDef` contém "A realizar" e o recorte do centro
- [x] `DreQueryDto` inválido no export → 400
- [x] Gate **Build** da fase 1 (`build:api`, lint, `test:unit` completo da API)
**Tests**: unit · **Gate**: build
**Status**: ✅ Concluída

### T4: Balancete só com realizados
**What**: `BalanceteService` passa a usar `buildScope` + `REALIZED_STATUSES`.
**Where**: `balancete.service.ts` (+ spec)
**Depends on**: T3 · **Requirement**: DRE-16
**Done when**:
- [x] Lançamento `pending` não entra nas linhas nem nos totais
- [x] Para o mesmo conjunto de lançamentos, `net_result` do Balancete = `net_result` do DRE
**Tests**: unit · **Gate**: quick (API)
**Status**: ✅ Concluída

### T5: DRE comparativo por centro de custo (API)
**What**: `DreCostCenterService` e `GET /financial/dre/by-cost-center` (Premium, mesmos papéis do DRE).
**Where**: `dre-cost-center.service.ts`, `dre.controller.ts`, `financial.module.ts` (+ specs)
**Depends on**: T4 · **Requirement**: DRE-13
**Done when**:
- [x] Colunas por centro + "Sem centro de custo" quando houver; linhas de receita e despesa por categoria
- [x] Soma das colunas = total geral = `net_result` de `buildDre` para o mesmo conjunto
- [x] Rota exige `PlanGuard` Premium e papéis do DRE (teste do controller); período inválido → 400
**Tests**: unit · **Gate**: quick (API)
**Status**: ✅ Concluída

### T6: Evolução mensal por centro (API)
**What**: `BalanceteMonthlyService` e `GET /financial/balancete/monthly`.
**Where**: `balancete-monthly.service.ts`, `balancete.controller.ts`, `financial.module.ts` (+ specs)
**Depends on**: T5 · **Requirement**: DRE-17
**Done when**:
- [x] Um ponto por mês de calendário do período, com zeros nos meses sem lançamento
- [x] Mais de 36 meses → 400; exatamente 36 → 200
- [x] Série por centro inclui "Sem centro de custo"; soma dos meses = total do centro no Balancete
- [x] Gate **Build** da fase 2 (`build:api`, lint, todos os testes da API)
**Tests**: unit · **Gate**: build
**Status**: ✅ Concluída

### T7: Extrair `DrePanel` com Lucro/Prejuízo, A realizar e seletor de centro
**What**: mover a aba DRE para `DrePanel.tsx`; rótulo Lucro/Prejuízo/zerado com cor e texto; linha "A realizar"; `CostCenterSelect` (Todos, Sem centro de custo, centros) que envia `cost_center_id`.
**Where**: `components/financial/DrePanel.tsx`, `financeiro/page.tsx` (+ testes)
**Depends on**: T6 · **Requirement**: DRE-03, DRE-09
**Tools**: Skill `frontend-design` (obrigatória antes do 1º Edit)
**Done when**:
- [x] Testes de DRE de `page.test.tsx` passam sem edição
- [x] net > 0 → "Lucro do período" com `text-teal`; < 0 → "Prejuízo do período" com `text-crimson`; 0 → "Resultado zerado"
- [x] Linha "A realizar" exibe receitas e despesas pendentes e não altera o resultado
- [x] Trocar o centro dispara `GET /financial/dre?...&cost_center_id=<id>`; "Todos" omite o parâmetro; resposta antiga ignorada (`requestSeq`)
- [x] 403 → `NoAccessState`
**Tests**: unit · **Gate**: quick (Web)
**Status**: ✅ Concluída

> Desvio de desenho (não de spec): o estado da aba vive no hook `useDreReport`, chamado na `page.tsx`, e o `DrePanel` é só apresentação. `keepMounted` foi tentado e descartado: deixava os `input[type=date]` do DRE no DOM antes dos do Balancete e quebrava `BalancetePanel` nos testes existentes, que indexam os inputs globalmente.

### T8: Botão "DRE (PDF)"
**What**: `DrePdfButton` chamando `POST /financial/dre/export/pdf` e baixando `orbien_dre_*.pdf`; escondido para pastor.
**Where**: `components/financial/DrePdfButton.tsx`, `DrePanel.tsx` (+ testes)
**Depends on**: T7 · **Requirement**: DRE-08
**Tools**: Skill `frontend-design`
**Done when**:
- [x] Clique envia período e `cost_center_id` no corpo e dispara o download
- [x] Período vazio: mostra mensagem e não chama a API
- [x] Falha: "Erro ao exportar o DRE." e botão reabilitado
- [x] Pastor sem outro papel: botão ausente
**Tests**: unit · **Gate**: quick (Web)
**Status**: ✅ Concluída

### T9: Matriz DRE por centro de custo (tela)
**What**: `DreCostCenterMatrix` na aba DRE, consumindo `GET /financial/dre/by-cost-center`.
**Where**: `components/financial/DreCostCenterMatrix.tsx`, `DrePanel.tsx` (+ testes)
**Depends on**: T8 · **Requirement**: DRE-14
**Tools**: Skills `frontend-design`, `dataviz`
**Done when**:
- [x] Colunas por centro, cada uma com Lucro/Prejuízo (texto + cor); rolagem horizontal sem quebrar o layout
- [x] Sem lançamentos → "Sem lançamentos no período"; 403 → `NoAccessState`
- [x] Gate **Build** da fase 3 (`build:web`, lint, todos os testes do web)
**Tests**: unit · **Gate**: build
**Status**: ✅ Concluída

> Gate de build: `NODE_ENV=production npm run build:web` (o ambiente de cloud tem `NODE_ENV=development`, o que quebra o prerender de `/_not-found` mesmo em `main`, sem relação com a feature).

### T10: Gráficos no Balancete
**What**: barras receita×despesa por centro e participação de cada centro nas despesas.
**Where**: `components/financial/CostCenterCharts.tsx`, `BalancetePanel.tsx` (+ testes)
**Depends on**: T9 · **Requirement**: DRE-15
**Tools**: Skills `frontend-design`, `dataviz`
**Done when**:
- [x] Barras na mesma ordem da tabela, cada uma com `aria-label` de centro e valores
- [x] Participação soma 100% (arredondamento tratado) e some quando despesas = 0
- [x] Tabela existente intacta (testes atuais de `BalancetePanel.test.tsx` verdes sem edição)
**Tests**: unit · **Gate**: quick (Web)
**Status**: ✅ Concluída

> Desvio: barras em HTML (largura proporcional, `aria-label` e valor escrito em cada uma) em vez de `recharts`; marcado `SPEC_DEVIATION` no componente. A tabela segue como equivalente textual.

### T11: Evolução mensal por centro (tela)
**What**: `CostCenterTrend` com seletor de centro e resultado mês a mês.
**Where**: `components/financial/CostCenterTrend.tsx`, `BalancetePanel.tsx` (+ testes)
**Depends on**: T10 · **Requirement**: DRE-18
**Tools**: Skills `frontend-design`, `dataviz`
**Done when**:
- [x] Positivo/negativo distinguíveis por mais que a cor (sinal + eixo zero)
- [x] Período > 36 meses mostra "Escolha um período de até 36 meses"
- [x] 403 → `NoAccessState`
**Tests**: unit · **Gate**: quick (Web)
**Status**: ✅ Concluída

### T12: e2e, AD-011 e rastreabilidade
**What**: e2e do DRE (lucro/prejuízo, filtro, download do PDF) em `teste1-church`; registrar `AD-011` em `.specs/STATE.md`; item em `docs/PLANO.md`; status `Verified` na tabela da spec.
**Where**: `apps/web/e2e/financeiro.spec.ts`, `.specs/STATE.md`, `docs/PLANO.md`, `spec.md`
**Depends on**: T11 · **Requirement**: DRE-01…DRE-18
**Done when**:
- [x] e2e: caminho feliz da aba DRE + um erro; usa só `teste1-church`/`teste2-church`
- [x] `AD-011` escrito (resultado = realizado) e `node scripts/check-skills.mjs` não regride
- [x] Gate **Build** final: `build:api`, `build:web`, lint dos dois, testes dos dois
**Status**: ✅ Concluída

> Rodado de verdade: API + web locais, seed, Playwright com o Chromium pré-instalado: 4/4 em `financeiro.spec.ts`. A rodada achou dois problemas que os unitários não pegaram — as linhas "Receitas"/"Despesas" da matriz colidiam com o e2e do DRE (renomeadas para "Total de receitas/despesas") e a linha de zero da evolução mensal estava no fundo do gráfico. Gate de build: `NODE_ENV=production npm run build:web`.

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4
P1: T1 → T2 → T3        P2: T4 → T5 → T6
P3: T7 → T8 → T9        P4: T10 → T11 → T12
```

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 helper + 2 DTOs coesos | ⚠️ OK (mesmo conceito) |
| T2–T6 | 1 serviço/endpoint cada | ✅ |
| T7 | 1 componente extraído + 1 seletor | ⚠️ OK (extração é pré-requisito do seletor) |
| T8–T11 | 1 componente cada | ✅ |
| T12 | e2e + docs | ⚠️ OK (fechamento) |

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram | Status |
| --- | --- | --- | --- |
| T1 | — | início P1 | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T2 | T2→T3 | ✅ |
| T4 | T3 | P1→P2 | ✅ |
| T5 | T4 | T4→T5 | ✅ |
| T6 | T5 | T5→T6 | ✅ |
| T7 | T6 | P2→P3 | ✅ |
| T8 | T7 | T7→T8 | ✅ |
| T9 | T8 | T8→T9 | ✅ |
| T10 | T9 | P3→P4 | ✅ |
| T11 | T10 | T10→T11 | ✅ |
| T12 | T11 | T11→T12 | ✅ |

## Test Co-location Validation

| Task | Tests (body) | Matrix | Status |
| --- | --- | --- | --- |
| T1–T6 | unit | Helper/serviço/DTO/controller → unit | ✅ |
| T7–T11 | unit | Componente web → unit | ✅ |
| T12 | e2e | Fluxo de tela → e2e | ✅ |
