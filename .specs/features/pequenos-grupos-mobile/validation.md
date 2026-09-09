# Pequenos Grupos no Mobile (MOB-09) Validation

**Date**: 2026-09-09 (rodada 2, consolidado — supersede a rodada 1)
**Spec**: `.specs/features/pequenos-grupos-mobile/spec.md`
**Diff range**: `origin/main..HEAD` (branch `feat/pequenos-grupos-mobile`, primeiro commit de código `803f3de`, fix desta rodada `48547f9`)
**Verifier**: independente (fresh, rodada 2) — autor do fix ≠ verificador

---

## O que mudou desde a rodada 1

A rodada 1 (relatório anterior, arquivado no histórico do commit `175f3ec`) terminou em **FAIL** com dois achados:

1. **Major**: nenhuma das 4 telas (`grupos.tsx`, `grupo/[id].tsx`, `grupo/encontro/[id].tsx`, `grupo/encontro/[id]/presenca.tsx`) tinha ação de retry no estado de erro, apesar do AC3 de "Ver meus grupos" (`spec.md:69-70`) e do `design.md` (Error Handling Strategy) exigirem.
2. **Minor**: edge case "dois grupos com o mesmo nome" sem teste dedicado.

O commit `48547f9` corrigiu os dois. Esta rodada reabre a checagem **focada nesses dois pontos** — as demais 15 ACs, o backend e os edge cases já ✅ da rodada 1 não têm código novo e não foram re-verificados linha a linha (não regride: nenhum arquivo fora dos 8 tocados por `48547f9` mudou desde então — `git diff 175f3ec..HEAD --stat` toca só os 4 arquivos de tela + 4 arquivos de teste).

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1–T5, T8, T9 | ✅ Done | inalterado desde a rodada 1 |
| T6   | ✅ Done | tela lista grupos — retry implementado e testado nesta rodada (era gap) |
| T7   | ✅ Done | tela de encontros — retry implementado e testado nesta rodada (era gap) |

---

## Spec-Anchored Acceptance Criteria (foco da rodada 2)

### P1: Ver meus grupos — AC3 (retry) e equivalente nas outras 3 telas

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion expression | Result |
| -------------------------- | --------------------- | ------------------------ | ------ |
| WHEN a busca de `/small-groups/mine` falha THEN estado de erro **com opção de tentar novamente** (`spec.md:69-70`) | Ação acionável que refaz a busca; conteúdo novo aparece após retry | Implementação: `apps/mobile/src/app/(tabs)/grupos.tsx:24` (`retryCount` state), `:42` (`}, [retryCount]);` — depende do retry para reexecutar o `useEffect`), `:47-54` (`<Text testID="grupos-retry" onPress={() => { setError(null); setRetryCount((n) => n + 1); }}>`). Teste: `apps/mobile/src/__tests__/app/(tabs)/grupos.test.tsx:72-87` — `mockListMyGroups.mockRejectedValueOnce(...)` seguido de `mockResolvedValueOnce([...])`; `fireEvent.press(screen.getByTestId("grupos-retry"))`; `expect(mockListMyGroups).toHaveBeenCalledTimes(2); expect(screen.getByTestId("grupo-sg1")).toBeTruthy();` — prova dupla: a função de busca é chamada de novo (não só que o `onPress` existe) E o conteúdo do fetch bem-sucedido aparece na tela | ✅ PASS |
| WHEN a busca de `GET /small-groups/:groupId/meetings` falha THEN retry (design.md, "erro genérico com retry... nunca tela vazia interpretável", generalizado a toda tela) | Idem acima | `apps/mobile/src/app/grupo/[id].tsx:20` (`retryCount`), `:41` (`}, [id, retryCount]);`), `:46-53` (`<Text testID="grupo-retry" onPress={...}>`). Teste: `apps/mobile/src/__tests__/app/grupo/[id].test.tsx:61-76` — reject-once + resolve-once, `fireEvent.press(screen.getByTestId("grupo-retry"))`, `expect(mockListMeetings).toHaveBeenCalledTimes(2); expect(screen.getByTestId("encontro-m1")).toBeTruthy();` | ✅ PASS |
| WHEN a busca de `GET .../materials` falha THEN retry | Idem | `apps/mobile/src/app/grupo/encontro/[id].tsx:29` (`retryCount`), `:48` (`}, [id, retryCount]);`), `:53-60` (`<Text testID="encontro-retry" onPress={...}>`). Teste: `apps/mobile/src/__tests__/app/grupo/encontro/[id].test.tsx:122-136` — reject-once + resolve-once `[]`, `fireEvent.press(screen.getByTestId("encontro-retry"))`, `expect(mockListMaterials).toHaveBeenCalledTimes(2); expect(screen.getByTestId("encontro-materials-empty")).toBeTruthy();` | ✅ PASS |
| WHEN a busca de `getMeeting`/roster (carregamento inicial da tela de presença) falha THEN retry | Idem — distinto do erro de **envio** (`submitError`, já coberto na rodada 1 preservando seleção) | `apps/mobile/src/app/grupo/encontro/[id]/presenca.tsx:25` (`retryCount`), `:46` (`}, [meetingId, retryCount]);`), `:79-86` (`<Text testID="presenca-retry" onPress={() => { setLoadError(null); setRetryCount((n) => n + 1); }}>`). Teste: `apps/mobile/src/__tests__/app/grupo/encontro/[id]/presenca.test.tsx:136-157` — `mockGetMeeting.mockRejectedValueOnce(...)` + `mockResolvedValueOnce({...})`, `beforeEach` já garante `mockGetGroupRoster.mockResolvedValue(ROSTER)` (confirmado lendo `presenca.test.tsx:27-29`, não alterado por este fix), `fireEvent.press(screen.getByTestId("presenca-retry"))`, `expect(mockGetMeeting).toHaveBeenCalledTimes(2); expect(screen.getByTestId("presenca-roster")).toBeTruthy();` — prova que o retry refaz a cadeia `getMeeting → getGroupRoster` e chega a renderizar o roster, não só que a chamada aconteceu | ✅ PASS |

**Rigor da evidência**: em todas as 4 telas o teste usa `mockRejectedValueOnce` seguido de `mockResolvedValueOnce`/`mockResolvedValue` — ou seja, a primeira chamada falha (dispara o estado de erro real, não simulado por prop), o retry dispara a segunda chamada com sucesso, e a asserção verifica **tanto** a contagem de chamadas (a busca foi refeita) **quanto** o conteúdo pós-sucesso na tela (não é um clique que não faz nada visível). Isso satisfaz a exigência de "provar que a busca é refeita... e que o conteúdo novo aparece", não apenas que o botão existe.

**Status**: ✅ Gap da rodada 1 fechado nas 4 telas, com evidência `file:line` completa.

### Edge case: dois grupos com o mesmo nome

| Item | Spec-defined outcome | `file:line` + assertion | Result |
| ---- | --------------------- | ------------------------ | ------ |
| Dois grupos com `name` idêntico ("Célula Jovem") | Ambos aparecem na lista, distinguíveis por papel/horário — sem dedup | `apps/mobile/src/__tests__/app/(tabs)/grupos.test.tsx:89-99` — mock com `{ id: "sg1", name: "Célula Jovem", meeting_time: "19:00", role: "leader" }` e `{ id: "sg2", name: "Célula Jovem", meeting_time: "20:00", role: "member" }`; `expect(screen.getByText("Célula Jovem — Líder — 19:00")).toBeTruthy(); expect(screen.getByText("Célula Jovem — Membro — 20:00")).toBeTruthy();` — prova que ambos os itens renderizam simultaneamente com textos distintos, não apenas que o array tem 2 elementos | ✅ PASS |

**Status**: ✅ Gap da rodada 1 fechado.

---

## Discrimination Sensor (rodada 2 — focado no código novo do fix)

Executado em `git worktree add /tmp/orbien-verify-wt3 HEAD --detach`, descartável. `node_modules` (raiz + `apps/mobile`) symlinkados só pra rodar os testes; nenhuma escrita no repositório real — `git status --short` confirmado limpo antes e depois; worktree removido ao final (`git worktree remove --force`).

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ------------ | ------- |
| 1 | `apps/mobile/src/app/(tabs)/grupos.tsx:42` | Removido `retryCount` da lista de dependências do `useEffect` de busca: `}, [retryCount]);` → `}, []);` (o handler de retry ainda existiria, mas o fetch nunca seria refeito) | ✅ Killed — `grupos.test.tsx` falhou 2/7: o teste de retry (`toHaveBeenCalledTimes(2)` recebeu 1) e, em efeito cascata do estado obsoleto não resetado, o teste de edge case seguinte também falhou. Restaurado o arquivo (`git checkout --`) e a suíte confirmada 7/7 verde sem a mutação, isolando a causa na mutação, não em ordem de testes pré-existente. |

**Sensor depth**: lightweight (1 mutação, escopo reduzido desta rodada — instrução explícita da tarefa não exige repetir as 3 mutações da rodada 1, cujo código não mudou)
**Result**: 1/1 killed — PASS ✅

---

## Code Quality

| Principle        | Status |
| ---------------- | ------ |
| Minimum code     | ✅ — `retryCount` + `onPress` é o mínimo necessário; nenhum hook/lib nova |
| Surgical changes | ✅ — só as 4 telas + seus 4 arquivos de teste; nenhum outro arquivo tocado por `48547f9` |
| No scope creep   | ✅ — nenhuma UI de retry além do pedido (sem debounce, sem contador de tentativas visível, sem backoff — nada disso foi pedido) |
| Matches patterns | ✅ — reaproveita o padrão de `retryCount` já usado em `celebracao/[id].tsx` (MOB-08), citado na mensagem do commit e coerente com o restante da base |
| Spec-anchored outcome check | ✅ — outcome do AC3 (retry executável, refetch comprovado) coberto nas 4 telas |
| Per-layer Coverage Expectation | ✅ — a lacuna identificada na rodada 1 ("falta o retry que o AC pede") está fechada |
| Every test maps to a spec requirement | ✅ — os 4 testes de retry mapeiam ao AC3/design.md; o teste de edge case mapeia ao edge case documentado na rodada 1 |
| Documented guidelines followed | ✅ — mesmo padrão de mocks (`mockRejectedValueOnce`/`mockResolvedValueOnce`) já usado nos testes de erro pré-existentes das mesmas 4 suítes |

---

## Edge Cases

- [x] Usuário sem papel de PG nenhum: inalterado desde a rodada 1 (✅)
- [x] Dois grupos com o mesmo nome: **fechado nesta rodada** — `apps/mobile/src/__tests__/app/(tabs)/grupos.test.tsx:89-99`
- [x] Encontro sem `AttendanceRecord` nenhum: inalterado desde a rodada 1 (✅)
- [x] Material com `file_url` nulo: inalterado desde a rodada 1 (✅)

---

## Gate Check

- **Gate command**: `npm run test -w orbien-backend` + `npm run test -w orbien-mobile` + `npm run lint` + `npm run build:api` + `cd apps/mobile && npx tsc --noEmit`
- **Result**:
  - Backend: 216 suítes, 2021 testes — todos passaram (idêntico à rodada 1, nenhum arquivo de backend tocado por `48547f9`)
  - Mobile: 25 suítes, **136 testes** — todos passaram (era 131 na rodada 1; +5 novos: 4 testes de retry + 1 de edge case, exatamente os 5 anunciados no diff do commit)
  - Lint: 0 erros, 52 warnings — mesma contagem e mesmos arquivos da rodada 1, nenhum warning novo introduzido pelo fix
  - `npm run build:api`: sucesso (cache hit, sem mudança de backend)
  - `cd apps/mobile && npx tsc --noEmit`: sucesso, sem erros
- **Test count before fix (rodada 1)**: 131 mobile / 2021 backend
- **Test count after fix (rodada 2)**: 136 mobile / 2021 backend
- **Delta**: +5 mobile, 0 backend — nenhum teste removido ou enfraquecido
- **Skipped tests**: nenhum
- **Failures**: nenhuma
- **Nota de qualidade (não bloqueante)**: a suíte mobile emite 3 avisos `console.error` ("You seem to have overlapping act() calls") durante a execução completa (não isolados às suítes desta feature, e não causam falha). Não investigado a fundo por estar fora do escopo desta rodada (focada em retry + edge case); registrar se recorrer.

---

## Fix Plans

Nenhum. Os dois achados da rodada 1 (Major: retry ausente; Minor: edge case sem teste) foram corrigidos e verificados nesta rodada com evidência `file:line` completa.

---

## Requirement Traceability Update

| Requirement | Previous Status (rodada 1) | New Status (rodada 2) |
| ----------- | ---------------- | ----------- |
| MOB-09-01   | ✅ Verified | ✅ Verified (inalterado) |
| MOB-09-02   | ⚠️ Needs Fix (retry ausente) | ✅ Verified — retry implementado e testado nas 4 telas |
| MOB-09-03   | ✅ Verified | ✅ Verified (inalterado) |
| MOB-09-04   | ✅ Verified | ✅ Verified (inalterado) |
| MOB-09-05   | ✅ Verified | ✅ Verified (inalterado) |
| MOB-09-06   | ✅ Verified | ✅ Verified (inalterado) |
| MOB-09-07   | ✅ Verified | ✅ Verified (inalterado) |
| MOB-09-08   | ✅ Verified | ✅ Verified (inalterado) |
| MOB-09-09   | ✅ Verified | ✅ Verified (inalterado) |
| MOB-09-10   | ✅ Verified | ✅ Verified (inalterado) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 16/16 ACs matched spec outcome (0 gaps — o gap de retry, replicado em 4 telas, está fechado)
**Sensor**: 1/1 mutação desta rodada killed (focada no código novo do fix); as 3 mutações da rodada 1 seguem válidas (código-fonte que cobriam não mudou desde então)
**Gate**: 216 (backend) + 136 (mobile) tests passed, 0 failed, lint 0 erros, build:api ok, tsc --noEmit ok

**What works**: As 4 telas do MOB-09 agora implementam retry executável no estado de erro (`retryCount` como dependência do `useEffect` de busca + ação `onPress` que zera o erro e reexecuta a busca), com testes que provam tanto a nova chamada à função de busca quanto o conteúdo pós-sucesso aparecendo na tela — não apenas a presença do botão. O edge case de dois grupos com nome idêntico está coberto, provando que ambos aparecem distinguíveis por papel/horário. Nenhuma regressão: backend intacto (2021 testes), lint/build/tsc limpos, e a mutação injetada nesta rodada (remover `retryCount` das deps do `useEffect`) foi morta pelos testes, confirmando que a suíte discrimina esse comportamento.

**Issues found**: Nenhuma pendente.

**Next steps**: Nenhum fix adicional necessário. Feature pronta para a etapa de PR (skill `pull-request`). A lição candidata L-007 ("retry executável e testado em toda tela de erro que a spec/design exigem") permanece registrada como candidate — este fix a corrige dentro da mesma feature (não conta como segunda ocorrência distinta para promoção a confirmed); nenhuma lição nova foi gravada nesta rodada.
