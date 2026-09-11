# Retenção de dados pós-fim-de-contrato — Validation

**Date**: 2026-09-11
**Spec**: `.specs/features/reten-dados-fim-contrato/spec.md`
**Diff range**: `60394ac..e49bdcf` (3 commits: `d26e09a`, `319e5bd`, `e49bdcf`) on `claude/determined-ritchie-iivw2e`
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status | Notes |
|---|---|---|
| Migration: `TenantPlan.cancelled_at` | ✅ Done | `apps/api/prisma/schema.prisma:177`, migration `20260911171718_add_tenant_plan_cancelled_at/migration.sql` |
| `purgeFinancialDonorsAfterContractEnd` | ✅ Done | `apps/api/src/persons/persons.service.ts:282-303` |
| `purgeMinorsAfterContractEnd` | ✅ Done | `apps/api/src/persons/persons.service.ts:311-334` |
| 2 novos crons no scheduler | ✅ Done | `apps/api/src/persons/persons-retention.scheduler.ts:36-48` (5h, 6h) |
| Notificação semanal | ✅ Done | `apps/api/src/persons/persons-retention-notifier.service.ts` |
| Suíte de testes | ✅ Done | 229 suites / 2169 tests passed |
| **Escrita de `cancelled_at` quando `TenantPlan.status` vira `cancelled`** | ❌ **NOT DONE** | Nenhum código escreve `cancelled_at` em lugar nenhum do `apps/api` (só a coluna existe) — ver Gap 1 |

---

## Spec-Anchored Acceptance Criteria

### P1: Retenção de dado financeiro

| Criterion | Spec-defined outcome | file:line + assertion | Result |
|---|---|---|---|
| AC1: status→`cancelled` grava `cancelled_at=now()` | Todo update que muda `status` para `cancelled` seta `cancelled_at` | — nenhum arquivo escreve esse campo (busca por `cancelled_at` só retorna leitura em `persons.service.ts`/`persons-retention-notifier.service.ts`; nenhum write path) | ❌ **GAP** |
| AC2: cron anonimiza doador com `cancelled_at` ≥5 anos, preserva `financial_transaction` | `anonymizedFields()` aplicado na Person, transação intacta | `apps/api/src/persons/persons.service.ts:283-293` (SQL: `tp.cancelled_at < now() - INTERVAL '5 years'` + `EXISTS ... financial_transactions`) — `persons.service.spec.ts:387-402` | ✅ PASS |
| AC3: já anonimizada → ignora | `p.anonymized_at IS NULL` no WHERE | `persons.service.ts:287` | ✅ PASS (evidência via leitura da SQL — teste não cobre, ver Discriminação) |
| AC4: `cancelled_at` nulo → ninguém elegível | `tp.cancelled_at IS NOT NULL` no WHERE | `persons.service.ts:288` | ✅ PASS (idem) |

### P2: Eliminação de dado de menor

| Criterion | Spec-defined outcome | file:line + assertion | Result |
|---|---|---|---|
| AC1: menor + `cancelled_at`≥30d + não doador + não anonimizada → anonimiza | `anonymizedFields()` | `persons.service.ts:312-324`; `persons.service.spec.ts:415-431` | ✅ PASS |
| AC2: sem `birth_date` → ignora | `p.birth_date IS NOT NULL` | `persons.service.ts:317` | ✅ PASS (SQL-only, não testado — ver Discriminação) |
| AC3: doador → ignora | `NOT EXISTS financial_transactions` | `persons.service.ts:321-323` | ✅ PASS (SQL-only, não testado — ver Discriminação; **mutante sobreviveu**, ver abaixo) |

### P3: Notificação semanal

| Criterion | Spec-defined outcome | file:line + assertion | Result |
|---|---|---|---|
| AC1: 1+ pessoa a 7 dias de qualquer categoria → push com contagem, filtros tenant/congregation/role | `sendPush` chamado com filtros exatos | `persons-retention-notifier.service.spec.ts:14-30` — `expect(...).toHaveBeenCalledWith({tenantId,congregationId,filters:[...],body: contains('3 pessoa')})` | ✅ PASS |
| AC2: ninguém a 7 dias → não notifica | `sendPush` não chamado | `persons-retention-notifier.service.spec.ts:33-39` | ✅ PASS |
| AC3: falha de envio → loga e segue | próxima congregação ainda recebe push | `persons-retention-notifier.service.spec.ts:41-49` — `toHaveBeenCalledTimes(2)` | ✅ PASS |

**Status**: ❌ Gap presente (AC1 de P1, marco #1 da tabela de sucesso não coberto) — as demais 10 ACs passam com evidência de código/teste.

---

## Discrimination Sensor

Executado em `git worktree` descartável (`/tmp/orbien-verify-wt`), nunca na working tree real.

| Mutation | File:line | Description | Killed? |
|---|---|---|---|
| 1 | `persons.service.ts` (`purgeMinorsAfterContractEnd`, SQL) | Removida a cláusula `NOT EXISTS (... financial_transactions ...)` (exclusão de doador) | ❌ **Survived** — `persons.service.spec.ts` continua 32/32 passando, porque o teste mocka `system.$queryRaw` inteiro e nunca inspeciona o texto do SQL |
| 2 | `persons-retention-notifier.service.ts` (loop de envio) | Removido `try/catch` ao redor de `sendPush` (fault: side-effect "seguir após falha" quebrado) | ✅ Killed — teste "segue para a próxima congregação quando o envio de uma falha" falha corretamente |

**Sensor depth**: lightweight (2 mutações, feature não é P0)
**Result**: 1/2 killed — mutante do WHERE de exclusão de doador sobrevive porque nenhum teste unitário verifica o texto da query raw (mesmo padrão pré-existente em `purgeInactivePersons`, não é regressão introduzida por esta feature, mas é um ponto cego real herdado e replicado nos dois métodos novos).

---

## Code Quality

| Principle | Status |
|---|---|
| Minimum code | ✅ |
| Surgical changes | ✅ (só os arquivos listados; `visitor.module.spec.ts` mudou por efeito colateral documentado em comentário) |
| No scope creep | ✅ |
| Matches patterns | ✅ (segue o padrão de `purgeInactivePersons`/`purgeExpiredSoftDeletes`: `$queryRaw` + `anonymizedFields()` + `prisma.system`) |
| Spec-anchored outcome check | ⚠️ AC1 de P1 (write path de `cancelled_at`) não tem evidência nenhuma — nem de código, nem de teste |
| Coverage: domain 1:1 ACs | ⚠️ SQL das 3 categorias que dependem de `cancelled_at`/exclusões não é exercitada via SQL real (todas mockam `$queryRaw`) — mesma lacuna estrutural de `purgeInactivePersons`, apenas herdada |
| Sem testes órfãos | ✅ todos os testes novos mapeiam a uma AC |
| Guideline do projeto seguido | `no-unused-vars` com `argsIgnorePattern: "^_"` — não se aplica aqui; nenhuma violação |

---

## Edge Cases

- [x] Doador E menor → só financeiro processa (exclusão `NOT EXISTS` em `purgeMinorsAfterContractEnd`) — confirmado por leitura da SQL, **não** por teste (mutante sobrevivente acima prova a lacuna).
- [x] `cancelled_at` nulo → `{ purged: 0 }` sem erro — coberto por `persons.service.spec.ts:404-412` e `:433-441` (mock retorna `[]`).
- [ ] **Reativação (`status` sai de `cancelled`) zera `cancelled_at`** — spec declara isso como comportamento SHALL no bloco de Edge Cases, mas **não há nenhum write path para `cancelled_at` em lugar nenhum do código** (nem para setar, nem para zerar). Não é "silenciosamente quebrado" — é integralmente ausente, o que é pior do que a tabela de Assumptions sugere ("assumido... campo fica pronto pra quando existir"). A spec tem uma contradição interna: a tabela de Assumptions trata a ausência de qualquer write path como aceitável/esperada, mas a AC1 de P1 e este Edge Case escrevem `SHALL` como se o write path existisse. A implementação seguiu a leitura da tabela de Assumptions (nenhum write path) e não implementou nem AC1 nem este edge case — é uma lacuna real de rastreabilidade da spec, não um bug de código.

---

## Gate Check

- **Gate command**: `cd apps/api && npx jest` (executado independentemente pelo Verifier)
- **Result**: 229 suites passed / 2169 tests passed, 0 failed, 0 skipped
- **Lint**: `npm run lint -w orbien-backend` → limpo, 0 erros/avisos
- **Test count**: 2169 (inclui os novos testes de `persons.service.spec.ts`, `persons-retention.scheduler.spec.ts`, `persons-retention-notifier.service.spec.ts`, `persons.module.spec.ts`, `visitor.module.spec.ts`)

---

## Fix Plans (gaps ranked)

### Gap 1 (Major) — AC1 de P1 e o Edge Case de reativação não têm implementação
**O quê**: nenhum código escreve `TenantPlan.cancelled_at` — nem ao marcar `status='cancelled'`, nem para zerar em reativação. A spec declara ambos como `SHALL`, mas a tabela de Assumptions do próprio spec já sinalizava que "nenhum fluxo de cancelamento existe ainda" e tratava isso como aceitável, sem que a AC1/edge case fossem ajustados para refletir isso (spec-interno inconsistente).
**Onde**: `.specs/features/reten-dados-fim-contrato/spec.md` (AC1 de P1; Edge Cases) vs. ausência de qualquer service/controller que grave `tenant_plans.cancelled_at`.
**Isso é a pendência nº 7 do CLAUDE.md?** Não — é um gap de escopo da spec, não do RLS.
**Recomendação**: não é uma correção "silenciosa" a fazer — é decisão do dev: (a) remover AC1 e o edge case de reativação da spec (movendo para Out of Scope, coerente com a linha "Fluxo de cancelamento de tenant... não foi pedido"), ou (b) abrir uma tarefa nova para o write path. Ambas são escolhas legítimas — não corrigi nada.

### Gap 2 (Minor) — Discriminação: exclusão de doador em `purgeMinorsAfterContractEnd` não é testada no texto do SQL
**O quê**: mutante que remove a cláusula `NOT EXISTS (financial_transactions)` sobrevive aos testes (comprovado no worktree descartável).
**Onde**: `apps/api/src/persons/persons.service.ts:321-323`; teste em `apps/api/src/persons/persons.service.spec.ts:415-431`.
**Nota**: mesma lacuna estrutural já existe em `purgeInactivePersons` (pré-existente, não introduzida por esta feature) — herdada, não regressão.
