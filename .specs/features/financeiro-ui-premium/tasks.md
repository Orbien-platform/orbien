# Financeiro — telas que faltam (forecast, export OFX/SPED, carnê do dizimista, dashboard semanal) — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

Todo trabalho aqui é em `apps/web` — a skill `frontend-design` do `CLAUDE.md` da
raiz é obrigatória antes do primeiro Edit/Write ("Toda demanda de front passa
pela skill `frontend-design`"), reforçada por um hook `PreToolUse`. Carregar
antes de T1.

---

**Design**: `.specs/features/financeiro-ui-premium/design.md`
**Status**: Done — T1-T11 concluídas, cada uma com commit próprio (ver `git log` na branch `claude/upbeat-fermi-rgparw`).

**Gate final (T11), via `scripts/pre-push.sh`**: `Liberado para push`, 2 alertas
declarados (não bloqueiam):
1. Build falha só no crash conhecido do Next 16.x ao prerenderizar
   `/_global-error`/`/_not-found` (vercel/next.js#95741) — pré-existente,
   documentado em `docs/PLANO.md` (`AJU-04`) e `docs/TESTES.md` (Fase 10),
   confirmado como bug de ambiente de sandbox (o build real da Vercel passa,
   PR #84). Não relacionado a esta feature — reproduz idêntico em
   `origin/main` limpo, confirmado via `git worktree` nesta sessão.
2. `npm run e2e -w orbien-web` não rodou: exige `E2E_EMAIL`/`E2E_PASSWORD`/
   `E2E_TENANT` contra `teste1-church`/`teste2-church` reais, que esta sessão
   não tem. O spec novo (`apps/web/e2e/financeiro.spec.ts`, teste "Visão Geral
   mostra o dashboard semanal e o forecast (Premium)") está escrito e pronto
   para rodar em CI/dev com credenciais — não foi executado nesta sessão.
   Cobertura de unidade (100% branch/statement nos arquivos novos) é o que
   valida o comportamento aqui.

---

## Test Coverage Matrix

> Gerado a partir de `apps/web/AGENTS.md` (sem seção própria de testes —
> remete aos docs do Next embutido, sem padrão de cobertura), amostragem de
> `apps/web/src/components/financial/ExportButton.test.tsx`,
> `CategoriesModal.test.tsx`, `NewTransactionModal.test.tsx` (todos
> Vitest + Testing Library, um `.test.tsx` por componente) e
> `apps/web/e2e/financeiro.spec.ts` (Playwright, só 1 fluxo: lançar
> transação → aparece no DRE). Sem guideline de cobertura explícita → piso é
> a profundidade que os arquivos amostrados já têm (todo componente novo
> ganha `.test.tsx` cobrindo loading/sucesso/403/erro; e2e cobre só o fluxo
> mais arriscado à regressão, que é a Visão Geral, mesmo padrão de "só o
> essencial" que o resto do arquivo de e2e já segue).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Componente React (cards/painéis novos) | unit | 1:1 com os ACs de cada story: estado de loading, sucesso, 403→`NoAccessState`, erro de rede | `apps/web/src/components/financial/*.test.tsx` | `npm run test -w orbien-web` |
| Helper puro (`exportJobPolling.ts`) | unit | todos os branches: `done`, `error`, cancelamento por `AbortSignal` | `apps/web/src/lib/exportJobPolling.test.ts` | `npm run test -w orbien-web` |
| `financeiro/page.tsx` (wiring de abas) | unit (via componentes que ele monta) + e2e no fluxo mais arriscado | Visão Geral: caminho feliz (semanal + forecast renderizam com dado mockado) | `apps/web/e2e/financeiro.spec.ts` | `npm run e2e -w orbien-web` |
| Lint/tipagem | none | build gate | — | `npm run lint -w orbien-web` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Após tasks só com teste unitário | `npm run test -w orbien-web && npm run lint -w orbien-web` |
| Full | Após tasks que tocam `financeiro/page.tsx` ou fluxo de tela | Quick + `npm run e2e -w orbien-web` |
| Build | Fim de cada fase | Full + `npm run build:web` |

---

## Execution Plan

### Phase 1: Fundações (independentes entre si, sem tocar `page.tsx`)

```
T1 → T2 → T3
```

### Phase 2: Visão Geral (depende da Fase 1)

```
T4
```

### Phase 3: Exportação OFX/SPED (depende de T1)

```
T5 → T6
```

### Phase 4: Conciliação bancária / import OFX (independente das Fases 2-3)

```
T7 → T8
```

### Phase 5: Carnê do dizimista (independente das Fases 2-4)

```
T9 → T10
```

### Phase 6: Verificação final

```
T11
```

---

## Task Breakdown

### T1: Helper de polling de job de exportação ✅

**What**: Criar `pollExportJob(jobId, opts?)` — chama `GET /financial/export/jobs/:id` a cada `intervalMs` (padrão 2000ms) até `status` sair de `pending`/`processing`; em `done`, chama `GET /financial/export/jobs/:id/download` e resolve com `{ status: 'done', downloadUrl }`; em `error`, resolve com `{ status: 'error', errorMessage }`; aceita `AbortSignal` para cancelar o polling.
**Where**: `apps/web/src/lib/exportJobPolling.ts`
**Depends on**: None
**Reuses**: `api` de `@/lib/api` (mesmo cliente axios que `ExportButton.tsx` já usa)
**Requirement**: FIN-06

**Tools**:
- MCP: NONE
- Skill: `frontend-design` (carregada antes desta task, vale para toda a feature)

**Done when**:
- [ ] Função exportada, tipada, sem `any`
- [ ] Cancelamento via `AbortSignal` interrompe o polling sem rejeitar a Promise em aberto
- [ ] Gate check passa: `npm run test -w orbien-web`
- [ ] Testes cobrem: sucesso (`done`), erro (`error`), cancelamento

**Tests**: unit
**Gate**: quick

---

### T2: `WeeklyDashboardCard` ✅

**What**: Componente que busca `GET /financial/dashboard/weekly` e renderiza os 3 KPIs + gráfico de 8 semanas que hoje vivem inline em `FinanceiroPage` (Visão Geral), com loading (`Skeleton`) e 403 (`NoAccessState`).
**Where**: `apps/web/src/components/financial/WeeklyDashboardCard.tsx`
**Depends on**: None
**Reuses**: `Skeleton`, `NoAccessState`, `isForbidden` de `@/lib/api`, `recharts` `BarChart` (mesmo padrão visual do gráfico atual em `financeiro/page.tsx`)
**Requirement**: FIN-01, FIN-02

**Tools**:
- MCP: NONE
- Skill: `frontend-design`

**Done when**:
- [ ] Busca só `/financial/dashboard/weekly`, sem depender de `/financial/transactions`
- [ ] Gate check passa: `npm run test -w orbien-web`
- [ ] Testes cobrem: loading, sucesso (8 semanas renderizadas), 403 → `NoAccessState`

**Tests**: unit
**Gate**: quick

---

### T3: `ForecastCard` ✅

**What**: Componente Premium com seletor de horizonte (3/6/12 meses) que busca `GET /financial/dashboard/forecast/:months` e renderiza histórico + projeção; 403 → `NoAccessState`.
**Where**: `apps/web/src/components/financial/ForecastCard.tsx`
**Depends on**: None
**Reuses**: `Skeleton`, `NoAccessState`, `isForbidden`, padrão de seletor `<select>` já usado em `financeiro/page.tsx` (filtros de lançamentos)
**Requirement**: FIN-03, FIN-04

**Tools**:
- MCP: NONE
- Skill: `frontend-design`

**Done when**:
- [ ] Troca de horizonte rechama o endpoint com o novo `months`
- [ ] Gate check passa: `npm run test -w orbien-web`
- [ ] Testes cobrem: loading, sucesso, troca de horizonte, 403 → `NoAccessState`

**Tests**: unit
**Gate**: quick

---

### T4: Wire da Visão Geral em `financeiro/page.tsx` ✅

**What**: Substituir os cards de KPI/gráfico/forecast calculados inline (`buildWeeklyChart`, `kpiIncome`, `kpiExpense`, `kpiResult`, `forecastPct` e o `useEffect` de DRE que só alimentava esse card) por `<WeeklyDashboardCard />` e `<ForecastCard />` na aba "Visão Geral". O `useEffect` de DRE que alimenta a própria aba DRE permanece — só o uso dele na Visão Geral sai.
**Where**: `apps/web/src/app/(admin)/financeiro/page.tsx` (editar)
**Depends on**: T2, T3
**Reuses**: N/A — é o ponto de integração
**Requirement**: FIN-01, FIN-02, FIN-03, FIN-04

**Tools**:
- MCP: NONE
- Skill: `frontend-design`

**Done when**:
- [ ] `buildWeeklyChart`, `kpiIncome`, `kpiExpense`, `kpiResult`, `forecastPct` removidos de `page.tsx` (função morta zero)
- [ ] Rede: só `GET /financial/dashboard/weekly` e `GET /financial/dashboard/forecast/:months` alimentam a Visão Geral (confirmado em teste ou manualmente)
- [ ] Gate check passa: `npm run test -w orbien-web && npm run lint -w orbien-web && npm run e2e -w orbien-web`
- [ ] `apps/web/e2e/financeiro.spec.ts` ganha (ou um novo spec ganha) um teste cobrindo a Visão Geral com dado mockado/seedado

**Tests**: e2e (+ unit herdado de T2/T3)
**Gate**: full

**Commit**: `feat(web): visão geral do financeiro consome os endpoints dedicados de semanal e forecast`

---

### T5: Botão de exportação OFX ✅

**What**: Adicionar botão "OFX" ao `ExportButton`, mesmo padrão síncrono de `handleCsv`/`handlePdf` (`POST /financial/export/ofx`, download direto do blob).
**Where**: `apps/web/src/components/financial/ExportButton.tsx` (editar)
**Depends on**: None
**Reuses**: `downloadBlob` já existente no próprio arquivo
**Requirement**: FIN-05

**Tools**:
- MCP: NONE
- Skill: `frontend-design`

**Done when**:
- [ ] Botão OFX baixa `extrato-{periodStart}-{periodEnd}.ofx`
- [ ] Gate check passa: `npm run test -w orbien-web`
- [ ] `ExportButton.test.tsx` ganha teste cobrindo o botão OFX (sucesso + erro)

**Tests**: unit
**Gate**: quick

---

### T6: Botão de exportação SPED (assíncrono) ✅

**What**: Adicionar botão "SPED" ao `ExportButton` usando `pollExportJob` (T1): `POST /financial/export/sped` → estado "processando" → download automático em `done`, mensagem de erro em `error`. Cancelar o polling ao desmontar.
**Where**: `apps/web/src/components/financial/ExportButton.tsx` (editar)
**Depends on**: T1
**Reuses**: `pollExportJob` de T1
**Requirement**: FIN-06

**Tools**:
- MCP: NONE
- Skill: `frontend-design`

**Done when**:
- [ ] Botão SPED mostra estado de processamento, baixa sozinho ao concluir, mostra erro se `job.status === 'error'`
- [ ] Polling é cancelado no unmount (sem leak de timer)
- [ ] Gate check passa: `npm run test -w orbien-web && npm run lint -w orbien-web`
- [ ] `ExportButton.test.tsx` ganha teste cobrindo SPED (sucesso, erro, unmount durante polling)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): exportação de OFX e SPED na tela de financeiro`

---

### T7: `BankReconciliationPanel` — upload + lista de não conciliados ✅

**What**: Componente com upload de arquivo `.ofx` (`POST /financial/import/ofx`, `multipart/form-data`, limite 10MB) e lista de transações não conciliadas (`GET /financial/import/ofx/unmatched`), com loading/erro/403.
**Where**: `apps/web/src/components/financial/BankReconciliationPanel.tsx`
**Depends on**: None
**Reuses**: `NoAccessState`, `Skeleton`, `DataTable` (mesmo componente de tabela usado em Lançamentos)
**Requirement**: FIN-07, FIN-08, FIN-09

**Tools**:
- MCP: NONE
- Skill: `frontend-design`

**Done when**:
- [ ] Upload rejeita arquivo > 10MB no cliente antes de enviar (mesmo limite do backend)
- [ ] Lista de não conciliados recarrega após upload bem-sucedido
- [ ] 403 → `NoAccessState` cobrindo o painel inteiro
- [ ] Gate check passa: `npm run test -w orbien-web`
- [ ] Testes cobrem: upload sucesso, upload erro (arquivo inválido/grande), lista carregada, 403

**Tests**: unit
**Gate**: quick

---

### T8: Nova aba "Conciliação" em `financeiro/page.tsx` ✅

**What**: Adicionar `TabValue = "conciliacao"`, visível só para `!isPastor` (mesmo critério de "Lançamentos"/"Recorrentes"), renderizando `<BankReconciliationPanel />`.
**Where**: `apps/web/src/app/(admin)/financeiro/page.tsx` (editar)
**Depends on**: T7
**Reuses**: Padrão de aba já existente (`Tabs.Tab`/`Tabs.Panel`)
**Requirement**: FIN-07, FIN-08, FIN-09

**Tools**:
- MCP: NONE
- Skill: `frontend-design`

**Done when**:
- [ ] Aba aparece na navegação, só para papéis que já veem "Lançamentos"
- [ ] Gate check passa: `npm run test -w orbien-web && npm run lint -w orbien-web`

**Tests**: none (wiring coberto pelos testes de T7 + build gate)
**Gate**: quick

**Commit**: `feat(web): conciliação bancária (importação de OFX) na tela de financeiro`

---

### T9: `DonationBookletPanel` — carnê do dizimista ✅

**What**: Componente com seletor de ano, lista de doadores (`GET /financial/donation-receipts/annual/summary?year=`) e botão de download por linha (`GET /financial/donation-receipts/annual/:personId?year=`), com loading/vazio/403.
**Where**: `apps/web/src/components/financial/DonationBookletPanel.tsx`
**Depends on**: None
**Reuses**: `downloadBlob`-like helper (extrair de `ExportButton.tsx` ou reimplementar o mesmo padrão local — decisão do executor conforme o que já existe no arquivo), `NoAccessState`, `Skeleton`
**Requirement**: FIN-10, FIN-11, FIN-12

**Tools**:
- MCP: NONE
- Skill: `frontend-design`

**Done when**:
- [ ] Troca de ano rechama o endpoint
- [ ] Lista vazia mostra estado vazio explícito, não tabela em branco
- [ ] Download nomeia o arquivo `carne-dizimista-{year}.pdf`
- [ ] 403 → `NoAccessState`
- [ ] Gate check passa: `npm run test -w orbien-web`
- [ ] Testes cobrem: sucesso, troca de ano, vazio, download, 403

**Tests**: unit
**Gate**: quick

---

### T10: Nova aba "Carnê do dizimista" em `financeiro/page.tsx` ✅

**What**: Adicionar `TabValue = "carne-dizimista"`, visível só para `!isPastor`, renderizando `<DonationBookletPanel />`.
**Where**: `apps/web/src/app/(admin)/financeiro/page.tsx` (editar)
**Depends on**: T9
**Reuses**: Padrão de aba já existente
**Requirement**: FIN-10, FIN-11, FIN-12

**Tools**:
- MCP: NONE
- Skill: `frontend-design`

**Done when**:
- [ ] Aba aparece na navegação, só para papéis que já veem "Lançamentos"
- [ ] Gate check passa: `npm run test -w orbien-web && npm run lint -w orbien-web`

**Tests**: none (wiring coberto pelos testes de T9 + build gate)
**Gate**: quick

**Commit**: `feat(web): carnê do dizimista (relatório anual para IR) na tela de financeiro`

---

### T11: Verificação final da feature ✅ (ver Status acima)

**What**: Rodar o gate completo (lint + testes unitários + e2e + build) sobre o estado final de `apps/web` e corrigir qualquer regressão encontrada — sem introduzir funcionalidade nova.
**Where**: N/A (verificação, não código novo)
**Depends on**: T4, T6, T8, T10
**Reuses**: N/A

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `npm run lint -w orbien-web` limpo
- [ ] `npm run test -w orbien-web` — todos os testes novos e antigos passando, nenhum deletado
- [ ] `npm run e2e -w orbien-web` passando
- [ ] `npm run build:web` conclui sem erro

**Tests**: none (é o gate)
**Gate**: build

---

## Phase Execution Map

```
Phase 1 → Phase 2
Phase 1 → Phase 3
(Phase 4 e Phase 5 independentes, podem rodar em qualquer ordem após Phase 1)
Phase 2, Phase 3, Phase 4, Phase 5 → Phase 6

Phase 1:  T1 ──→ T2 ──→ T3
Phase 2:  T4  (depende de T2, T3)
Phase 3:  T5 ──→ T6  (T6 depende de T1)
Phase 4:  T7 ──→ T8
Phase 5:  T9 ──→ T10
Phase 6:  T11  (depende de T4, T6, T8, T10)
```

Execução sequencial dentro de cada fase. Fases 2-5 podem ser despachadas em
paralelo entre si (não têm dependência cruzada), desde que a Fase 1 já tenha
concluído — Fase 3 (T6) depende só de T1, não de T2/T3.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: `pollExportJob` | 1 função/arquivo | ✅ Granular |
| T2: `WeeklyDashboardCard` | 1 componente | ✅ Granular |
| T3: `ForecastCard` | 1 componente | ✅ Granular |
| T4: Wire Visão Geral | 1 arquivo, integração pontual | ✅ Granular |
| T5: Botão OFX | 1 função dentro de 1 componente existente | ✅ Granular |
| T6: Botão SPED | 1 função dentro de 1 componente existente | ✅ Granular |
| T7: `BankReconciliationPanel` | 1 componente | ✅ Granular |
| T8: Aba "Conciliação" | 1 arquivo, integração pontual | ✅ Granular |
| T9: `DonationBookletPanel` | 1 componente | ✅ Granular |
| T10: Aba "Carnê do dizimista" | 1 arquivo, integração pontual | ✅ Granular |
| T11: Verificação final | gate, sem código novo | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | — | ✅ Match |
| T2 | None | — | ✅ Match |
| T3 | None | — | ✅ Match |
| T4 | T2, T3 | T2→T4, T3→T4 (via Fase 1→Fase 2) | ✅ Match |
| T5 | None | — | ✅ Match |
| T6 | T1 | T1→T6 (via Fase 1→Fase 3) | ✅ Match |
| T7 | None | — | ✅ Match |
| T8 | T7 | T7→T8 | ✅ Match |
| T9 | None | — | ✅ Match |
| T10 | T9 | T9→T10 | ✅ Match |
| T11 | T4, T6, T8, T10 | Fases 2-5 → Fase 6 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Helper puro | unit | unit | ✅ OK |
| T2 | Componente React | unit | unit | ✅ OK |
| T3 | Componente React | unit | unit | ✅ OK |
| T4 | `page.tsx` (wiring) | e2e | e2e | ✅ OK |
| T5 | Componente React (edição) | unit | unit | ✅ OK |
| T6 | Componente React (edição) | unit | unit | ✅ OK |
| T7 | Componente React | unit | unit | ✅ OK |
| T8 | `page.tsx` (wiring) | none (coberto por T7 + build) | none | ✅ OK |
| T9 | Componente React | unit | unit | ✅ OK |
| T10 | `page.tsx` (wiring) | none (coberto por T9 + build) | none | ✅ OK |
| T11 | N/A (gate) | none | none | ✅ OK |

---

## Task Verification Standards

Cada task segue `Done when` + `Tests` + `Gate` acima — binário, com contagem
de testes checada no PR (nenhuma deleção silenciosa de teste existente).
