# Celebrações e OC no Mobile (MOB-08) Validation

**Date**: 2026-09-09
**Spec**: `.specs/features/celebracoes-oc-mobile/spec.md`
**Diff range**: `ea2b97a~1..HEAD` (branch `claude/proximo-feature-sugerido-3e5o1a`; `ea2b97a`=T1 … `f1c74ed`=docs de fechamento). Superfície: `apps/api/src/celebrations/celebration-assignment.service.ts(+.spec.ts)`, `apps/mobile/src/lib/celebracoes/*` (novo), `apps/mobile/src/lib/escala/types.ts`, `apps/mobile/src/app/(tabs)/_layout.tsx(+.test)`, `apps/mobile/src/app/(tabs)/celebracoes.tsx(+.test, novo)`, `apps/mobile/src/app/celebracao/[id].tsx(+.test, novo)`.
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | `getMyAssignments` inclui `service_order_id`/`checked_in_at`, testes dedicados presentes |
| T2   | ✅ Done | Tipos `ServiceOrder`/`ServiceOrderItem`/`SetlistSongRef`/`CelebrationInstanceSummary` batem com design.md; `Assignment.service_order_id` adicionado |
| T3   | ✅ Done | `celebracoes-client.ts` com as duas funções, testadas |
| T4   | ✅ Done | Terceira tab "Celebrações" adicionada, teste de regressão atualizado |
| T5   | ✅ Done | Tela de lista por papel, 8 testes cobrindo os cenários do Done-when |
| T6   | ⚠️ Partial | Tela de detalhe implementada e testada, mas **não renderiza horário de cada etapa** (`start_offset_minutes`/`duration_minutes` nunca aparecem na UI) — AC2/AC3 da spec pedem "nome/horário" e "destacar função **e horário**"; ver gap abaixo |

---

## Spec-Anchored Acceptance Criteria

### P1: Ver a OC e a setlist da celebração em que estou escalado

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 — abre aba "Celebrações" (member/volunteer) → lista escalas futuras via `getMyAssignments`, ordenada por data crescente | Lista vem da mesma fonte/filtro de `GET /volunteers/my-celebration-assignments`, asc por `scheduled_date` | Mobile: `apps/mobile/src/__tests__/app/(tabs)/celebracoes.test.tsx:51-76` — `expect(mockGetMyAssignments).toHaveBeenCalledTimes(1)` + `expect(mockListUpcomingInstances).not.toHaveBeenCalled()`. Ordenação asc: `apps/api/src/celebrations/celebration-assignment.service.spec.ts:741-756` — `expect(result.map((r) => r.id)).toEqual(['a1', 'a2'])` (a1 tem `scheduled_date` menor) | ✅ PASS (fonte/papel provados no mobile; ordenação provada na API, que é quem ordena — mobile só renderiza na ordem recebida, sem re-sort) |
| AC2 — abre celebração da lista → busca e mostra OC (**nome/horário** de cada etapa, responsável) e setlist, leitura | Cada etapa mostra nome, **horário**, responsável; setlist quando existir | Nome/responsável: `apps/mobile/src/__tests__/app/celebracao/[id].test.tsx:37-80` — `screen.getByText(...)` implícito via render de `item.name`/responsável; setlist: `:110-151` — `expect(screen.getByText("Grande é o Senhor")).toBeTruthy()`. **Horário: nenhuma evidência** — `apps/mobile/src/app/celebracao/[id].tsx` nunca lê/renderiza `item.start_offset_minutes` ou `item.duration_minutes` (`grep` no arquivo não retorna nenhuma ocorrência) | ❌ GAP — metade do critério (nome/responsável/setlist) coberta; a parte "horário" do AC2 não está implementada nem testada |
| AC3 — etapa/linha da setlist corresponde à escala do usuário → destaca visualmente **função e horário** | Destaque visual da função **e do horário** da etapa do usuário | Função: `apps/mobile/src/__tests__/app/celebracao/[id].test.tsx:37-80` — `expect(screen.getByTestId("celebracao-item-item1-mine")).toBeTruthy()` (casamento por `ministry.id`, decisão de design documentada). **Horário: nenhuma evidência** — mesmo campo ausente do AC2 não existe para ser destacado | ❌ GAP — mesma causa raiz do AC2: a informação de horário nunca chega à tela, então "destacar horário" não pode ocorrer nem ser testado |
| AC4 — celebração sem setlist publicada → mostra OC normal + "Repertório ainda não publicado", sem esconder OC | Mensagem exata "Repertório ainda não publicado" no lugar da setlist, OC continua visível | `apps/mobile/src/app/celebracao/[id].tsx:97` — `<Text>{NO_SETLIST_MESSAGE}</Text>` com `NO_SETLIST_MESSAGE = "Repertório ainda não publicado"` (linha 16). Teste: `apps/mobile/src/__tests__/app/celebracao/[id].test.tsx:82-108` — `expect(screen.getByText("Repertório ainda não publicado")).toBeTruthy()` | ✅ PASS |
| AC5 — busca da OC falha (rede/servidor) → estado de erro com retry, nunca tela vazia | Erro genérico + botão de retry; nunca indistinguível de "sem OC" | `apps/mobile/src/__tests__/app/celebracao/[id].test.tsx:185-202` — `expect(screen.getByText("Não foi possível carregar a Ordem de Culto. Verifique sua conexão.")).toBeTruthy()`, `fireEvent.press(retryButton)` → `expect(mockGetServiceOrder).toHaveBeenCalledTimes(2)`. 404 diferenciado: `:174-183` — `expect(screen.getByText("Ordem de culto não encontrada.")).toBeTruthy()` sem botão de retry | ✅ PASS |

### P2: Líder vê todas as próximas celebrações da congregação

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 — `ministry_leader`+ → lista via `GET /celebrations/instances`, não só escala pessoal | Fonte de dados é `listUpcomingInstances` (`GET /celebrations/instances?date_from=hoje`), `getMyAssignments` não é chamado | `apps/mobile/src/__tests__/app/(tabs)/celebracoes.test.tsx:78-97` — `expect(mockListUpcomingInstances).toHaveBeenCalledTimes(1)` + `expect(mockGetMyAssignments).not.toHaveBeenCalled()`. URL exata: `apps/mobile/src/lib/celebracoes/celebracoes-client.test.ts:16-27` — `expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/celebrations/instances?date_from=2026-09-09")` | ✅ PASS |
| AC2 — lista vazia (sem celebração futura) → estado vazio explícito, não erro | Texto "Nenhuma celebração agendada" (não indistinguível de erro) | `apps/mobile/src/__tests__/app/(tabs)/celebracoes.test.tsx:178-187` — `expect(screen.getByText("Nenhuma celebração agendada.")).toBeTruthy()` | ✅ PASS |

### Backend (MOB-08-07/08)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| MOB-08-07 — `getMyAssignments` inclui `service_order_id` | `service_order_id` = id da OC quando existe; `null` quando a instância não tem OC ainda | `apps/api/src/celebrations/celebration-assignment.service.spec.ts:958-983` — `expect(result[0].service_order_id).toBe('ord1')`; `:985-1010` — `expect(result[0].service_order_id).toBeNull()` | ✅ PASS |
| MOB-08-08 — `getMyAssignments` inclui `checked_in_at` | `checked_in_at` = data do check-in quando feito; `null` quando não | `apps/api/src/celebrations/celebration-assignment.service.spec.ts:1012-1025` — `expect(result[0].checked_in_at).toEqual(checkedInAt)`; `:1027-1039` — `expect(result[0].checked_in_at).toBeNull()` | ✅ PASS |

**Status**: ❌ Gaps present — 7/9 critérios em PASS; **AC2 e AC3 do P1 estão parcialmente cobertos** (o componente "horário" de cada um nunca é exposto pela UI nem testado).

---

## Discrimination Sensor

Executado em `git worktree add /tmp/verify-wt HEAD` (descartável, removido ao final — árvore real nunca tocada).

| # | File:line | Description | Killed? |
| - | --- | --- | --- |
| 1 | `apps/api/src/celebrations/celebration-assignment.service.ts:409` | `service_order_id: a...serviceOrder?.id ?? null` → sempre `null` | ✅ Killed — `celebration-assignment.service.spec.ts:982` falhou (`Expected: "ord1", Received: null`) |
| 2 | `apps/mobile/src/app/(tabs)/celebracoes.tsx:64` | `isLeader = roles.some(...)` → `isLeader = !roles.some(...)` | ✅ Killed — 7/8 testes de `celebracoes.test.tsx` falharam (fonte de dados e mensagens de vazio invertidas) |
| 3 | `apps/mobile/src/app/celebracao/[id].tsx:80` | `isMine = ministryId !== undefined && item.ministry?.id === ministryId` → sempre `false` | ✅ Killed — `[id].test.tsx:77` falhou (`celebracao-item-item1-mine` não encontrado) |

**Sensor depth**: lightweight (3 mutações, padrão default)
**Result**: 3/3 killed — PASS ✅

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ — `getMyAssignments` ganhou só um include e dois campos; nenhuma função adjacente tocada |
| No scope creep | ✅ — arquivos tocados batem exatamente com o esperado no prompt |
| Matches patterns | ✅ — `celebracoes-client.ts` segue `content-client.ts`/`escala-client.ts`; telas seguem `post/[id].tsx`/`(tabs)/index.tsx` (3 estados, `testID`, mensagens de erro) |
| Spec-anchored outcome check (asserted values match spec) | ⚠️ Parcial — ver AC2/AC3 acima: assertions existem e batem com o que a implementação faz, mas a implementação não cobre o outcome inteiro da spec (falta horário) |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ⚠️ Parcial — mesma lacuna de horário; resto 1:1 |
| Every test maps to a spec requirement — no unclaimed tests | ✅ |
| Documented guidelines followed: `apps/api/jest.config.js`, `apps/mobile/jest.config.js`, `docs/TESTES.md`, `tasks.md` Test Coverage Matrix | ✅ |

---

## Edge Cases

- [x] Sem escala futura e não `ministry_leader`+ → estado vazio "Você não tem celebrações próximas." — `apps/mobile/src/__tests__/app/(tabs)/celebracoes.test.tsx:167-176`
- [ ] Etapa sem responsável definido (`responsible_label` genérico) mostrado como veio da API — **NÃO testado**: o teste em `[id].test.tsx:82-108` usa `responsible_label: "A definir"` mas só assere a ausência de setlist ("Repertório ainda não publicado"), nunca `screen.getByText("A definir")`. A lógica de fallback existe em `apps/mobile/src/app/celebracao/[id].tsx:92` (`: item.responsible_label`), mas sem asserção dedicada é evidence-or-zero → gap de cobertura (comportamento provavelmente correto, mas não comprovado)
- [ ] Duas etapas com mesmo horário/sequência, sem deduplicar → **sem evidência**: nenhum teste usa dois itens com `sequence` repetida; `apps/mobile/src/app/celebracao/[id].tsx:71` (`[...order.items].sort(...)`) não deduplica por construção (`Array.prototype.sort` é estável e não remove itens), então o comportamento provavelmente está correto, mas não há teste que prove isso
- [ ] Sai da tela de detalhe e volta → refaz a busca, sem cache stale → **sem evidência direta**: não há teste de remount/segunda visita. A tela usa `useEffect` com `[id, retryCount]` (mesmo padrão de `post/[id].tsx`, que também não tem tal teste) — o padrão do MOB-04 citado no design.md também não tem teste equivalente, então isto está consistente com o precedente do app, mas não comprovado por teste novo desta feature

**Status**: 1/4 edge cases com evidência direta; 3/4 sem asserção dedicada (comportamento plausivelmente correto por inspeção de código, mas não coberto — evidence-or-zero).

---

## Gate Check

- **Gate command**: `npm run test -w orbien-backend`, `npm run test -w orbien-mobile`, `npm run lint`, `npm run build:api`, `cd apps/mobile && npx tsc --noEmit`
- **Result**:
  - Backend: 216 suites / 2019 testes — todos passando (inclui as 8 novas de `getMyAssignments` MOB-08-07/08 + as pré-existentes de setlist)
  - Mobile: 23 suites / 121 testes — todos passando (inclui `celebracoes-client.test.ts`, `(tabs)/celebracoes.test.tsx`, `celebracao/[id].test.tsx`, `(tabs)/_layout.test.tsx` atualizado)
  - Lint: 0 erros, 47 warnings pré-existentes (padrão `no-redeclare`/`import/first` em todos os arquivos de teste do mobile, `array-type` em `auth-client.ts` — nenhum novo introduzido por esta feature)
  - `build:api`: sucesso (cache hit)
  - `tsc --noEmit` (mobile): sem erros
- **Test count before feature**: não medido isoladamente (não foi rodado checkout de `ea2b97a~1`); delta calculado por diff de `it(` blocks
- **Test count after feature**: Backend 2019, Mobile 121
- **Delta**: +23 blocos `it(` adicionados no diff (`ea2b97a~1..HEAD`), -1 removido — mas o "removido" é uma renomeação/fortalecimento do teste de `_layout.test.tsx` (passou a checar também a tab "Celebrações"), não uma exclusão real. Net: nenhuma perda de cobertura, nenhuma asserção enfraquecida
- **Skipped tests**: nenhum
- **Failures**: nenhuma

---

## Fix Plans (if issues found)

### Fix 1: AC2/AC3 — horário da etapa nunca é exibido na tela de detalhe

- **Root cause**: `apps/mobile/src/app/celebracao/[id].tsx` renderiza `item.name`, o responsável e a setlist, mas nunca lê `item.start_offset_minutes`/`item.duration_minutes` (campos que já existem no tipo `ServiceOrderItem`, `apps/mobile/src/lib/celebracoes/types.ts:25-26`, e no shape devolvido pela API). A spec (AC2 e AC3 do P1) pede explicitamente "nome/horário de cada etapa" e destaque de "função e horário" — a metade "horário" nunca foi implementada nem testada.
- **Fix task**: Renderizar o horário de cada etapa (formatado a partir de `start_offset_minutes`/`duration_minutes`, relativo ao início da celebração — critério de formatação a confirmar com o usuário) em `apps/mobile/src/app/celebracao/[id].tsx`, e adicionar asserção de horário nos testes de `apps/mobile/src/__tests__/app/celebracao/[id].test.tsx` (inclusive no cenário de destaque "minha etapa", AC3).
- **Priority**: Major — é parte literal de dois critérios de aceite do P1 (MVP), não um nice-to-have.

### Fix 2 (menor): Edge cases sem teste dedicado

- **Root cause**: 3 dos 4 edge cases da spec não têm asserção própria nos testes desta feature (rótulo de responsável genérico, duas etapas com mesma sequência, refetch ao revisitar a tela) — o comportamento parece correto por inspeção do código, mas evidence-or-zero os marca como não cobertos.
- **Fix task**: Adicionar 2-3 testes pontuais em `celebracao/[id].test.tsx` (responsible_label renderizado verbatim; duas etapas com `sequence` igual renderizando ambas sem dedupe). O caso de refetch ao revisitar é consistente com o precedente do app (nem `post/[id].tsx` tem esse teste) — decisão do usuário se vale a pena cobrir agora ou registrar como padrão aceito do app.
- **Priority**: Minor.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| MOB-08-01 | Implementing | ✅ Verified |
| MOB-08-02 | Implementing | ❌ Needs Fix (falta horário) |
| MOB-08-03 | Implementing | ❌ Needs Fix (falta horário no destaque) |
| MOB-08-04 | Implementing | ✅ Verified |
| MOB-08-05 | Implementing | ✅ Verified |
| MOB-08-06 | Implementing | ✅ Verified |
| MOB-08-07 | Implementing | ✅ Verified |
| MOB-08-08 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues

**Spec-anchored check**: 7/9 critérios batendo o outcome da spec; 2 com gap (AC2/AC3 do P1 — horário da etapa nunca aparece na UI)
**Sensor**: 3/3 mutações mortas
**Gate**: Backend 2019 passed, Mobile 121 passed, lint 0 erros, build:api ok, tsc ok

**What works**: Fluxo completo de lista por papel (member/volunteer via `getMyAssignments`, `ministry_leader`+ via `listUpcomingInstances`), navegação para o detalhe com os params certos, estados de vazio/erro/retry, setlist ausente, OC não publicada, destaque de "minha função" por `ministry.id` (granularidade documentada como Tech Decision no design.md e corretamente coberta pelo teste), backend devolvendo `service_order_id`/`checked_in_at`.

**Issues found**:
1. AC2/AC3 do P1 (spec.md) pedem "horário" de cada etapa e destaque de "função e horário" — a implementação (`apps/mobile/src/app/celebracao/[id].tsx`) nunca renderiza `start_offset_minutes`/`duration_minutes`. Fix: exibir o horário na etapa e no destaque, com teste dedicado.
2. 3 dos 4 edge cases da spec não têm teste dedicado (comportamento plausivelmente correto por inspeção, mas evidence-or-zero não confirma). Fix: 2 testes pontuais valem a pena; o terceiro (refetch ao revisitar) é consistente com o precedente do app.

**Next steps**: Decisão do orquestrador/usuário — corrigir o gap de horário (Fix 1, Major) antes de considerar o MOB-08 P1 fechado, já que é parte literal de dois ACs do MVP; Fix 2 é opcional/minor.
