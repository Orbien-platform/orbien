# Celebrações e OC no Mobile (MOB-08) Validation

**Date**: 2026-09-09
**Spec**: `.specs/features/celebracoes-oc-mobile/spec.md`
**Diff range**: `ea2b97a~1..HEAD` (branch `claude/proximo-feature-sugerido-3e5o1a`; `ea2b97a`=T1 … `6b37230`=fix da rodada 1)
**Verifier**: independent sub-agent (author ≠ verifier)
**Round**: 2 of max 3 (fix→re-verify) — this report supersedes the round-1 report

---

## What changed since round 1

Round 1 (`.specs/features/celebracoes-oc-mobile/validation.md`, previous version) ended **❌ Issues** with:

1. **Major**: AC2/AC3 (P1) required the OC screen to show each step's "horário" (schedule/time) and to include it in the "minha etapa" highlight, but `apps/mobile/src/app/celebracao/[id].tsx` never read `item.start_offset_minutes`/`item.duration_minutes`.
2. **Minor**: 3 of 4 spec edge cases had no dedicated test (generic `responsible_label`, two steps sharing `sequence`, refetch on revisit).

Commit `6b37230` (`fix(mobile): mostra o horário de cada etapa da OC (MOB-08-02/03)`) addressed:

- Adds `formatOffset()` (`apps/mobile/src/app/celebracao/[id].tsx:22-27`) and renders `${formatOffset(item.start_offset_minutes)} · ${item.duration_minutes}min` per step (`:98-100`), with `testID={`celebracao-item-${item.id}-horario`}`. The element sits inside the same `View` used for the "-mine" highlight testID, so the schedule is part of the highlighted block for the user's own step.
- New tests in `apps/mobile/src/__tests__/app/celebracao/[id].test.tsx`: a dedicated AC2/AC3 test (`:82-129`) and two new edge-case tests (`:223-249`, `:251-292`).
- The third edge case (refetch on revisit) was **not** covered — round 1 already recorded this as consistent with the app's existing precedent (`post/[id].tsx` also has no such test) and as an accepted, non-blocking decision. Re-affirmed in this round (see Edge Cases below); not re-litigated.

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1–T5 | ✅ Done | Unchanged from round 1 — not re-verified in depth this round (no code changed in their surface) |
| T6   | ✅ Done | Fix commit `6b37230` closes the round-1 gap: horário now rendered per step and inside the highlight |

---

## Spec-Anchored Acceptance Criteria (focused re-check: P1 AC2/AC3)

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC2 — abre celebração da lista → busca e mostra OC (nome/**horário** de cada etapa, responsável) e setlist, leitura | Cada etapa mostra nome, horário, responsável | `apps/mobile/src/app/celebracao/[id].tsx:98-100` renders `` `${formatOffset(item.start_offset_minutes)} · ${item.duration_minutes}min` `` with `testID=celebracao-item-${item.id}-horario`. Test: `apps/mobile/src/__tests__/app/celebracao/[id].test.tsx:122-128` — `expect(within(mineItem).getByTestId("celebracao-item-item1-horario")).toHaveTextContent("0min · 20min")` (input: `start_offset_minutes:0, duration_minutes:20`) and `expect(screen.getByTestId("celebracao-item-item2-horario")).toHaveTextContent("1h30min · 30min")` (input: `start_offset_minutes:90, duration_minutes:30` → `formatOffset(90)` = `1h30min`, matching `formatOffset`'s own `h`/`m` branch at `:22-27`). Values asserted are exact, not a substring/wildcard, and match what the implementation actually computes for those inputs (verified by hand: 90min = 1h30min). | ✅ PASS |
| AC3 — etapa/linha da setlist corresponde à escala do usuário → destaca visualmente **função e horário** | Destaque visual da função e do horário da etapa do usuário | Same test, `apps/mobile/src/__tests__/app/celebracao/[id].test.tsx:122-125` — the horário assertion is scoped with `within(mineItem)` where `mineItem = screen.getByTestId("celebracao-item-item1-mine")` (`:122`), proving the horário `Text` is a descendant of the highlighted ("-mine") container, not merely present somewhere on screen. This directly demonstrates the horário is part of the highlight, matching AC3's "destacar função e horário" (função already covered since round 1 via the same `-mine` testID). | ✅ PASS |

Both criteria that failed in round 1 now pass with exact-value, non-vague assertions. No other P1/P2/backend criteria were re-litigated (unchanged code; round 1 already verified them ✅ PASS with file:line evidence).

**Status**: ✅ All P1 AC2/AC3 gaps closed.

---

## Edge Cases (focused re-check: the two new ones)

- [x] Etapa sem responsável definido (`responsible_label` genérico) mostrado verbatim — `apps/mobile/src/__tests__/app/celebracao/[id].test.tsx:223-249`: item with `responsible_label: "A definir"`, `responsible_type: "free_text"`, `person: null`, `ministry: null` → `expect(screen.getByText("A definir")).toBeTruthy()` (`:248`). This exercises the fallback branch at `apps/mobile/src/app/celebracao/[id].tsx:106` (`: item.responsible_label`).
- [x] Duas etapas com o mesmo `sequence`, sem deduplicar — `apps/mobile/src/__tests__/app/celebracao/[id].test.tsx:251-292`: two items both with `sequence: 1` (`item1`, `item2`) → `expect(screen.getByTestId("celebracao-item-item1")).toBeTruthy()` and `expect(screen.getByTestId("celebracao-item-item2")).toBeTruthy()` (`:290-291`), proving both render (no dedupe by the stable `.sort()` at `:82`).
- [ ] Refetch ao revisitar a tela — still not covered by a dedicated test. Reaffirmed as an accepted, non-blocking decision from round 1: consistent with the app's existing precedent (`post/[id].tsx` has no equivalent test either), and the prompt for this round explicitly said not to require it. Not a gap for this verdict.

**Status**: 2/2 targeted edge cases now covered with direct evidence; the third remains an accepted, documented gap (not blocking, per explicit scope of this round).

---

## Gate Check

- **Gate command**: `npm run test -w orbien-backend`, `npm run test -w orbien-mobile`, `npm run lint`, `npm run build:api`, `cd apps/mobile && npx tsc --noEmit`
- **Result**:
  - Backend: 216 suites / 2019 tests — all passing
  - Mobile: 23 suites / 124 tests — all passing (121 → 124: +3 net, matching the 3 new tests added by the fix — AC2/AC3 horário test + 2 edge-case tests)
  - Lint: 0 errors, 47 pre-existing warnings (same set as round 1 — `no-redeclare`/`import/first` in mobile test files, `array-type` in `auth-client.ts`); no new warnings introduced
  - `build:api`: success (cache hit)
  - `tsc --noEmit` (mobile): no errors, no output
- **Test count before this round's fix**: Mobile 121 (round 1 baseline)
- **Test count after**: Mobile 124
- **Delta**: +3 tests, 0 removed
- **Skipped tests**: none
- **Failures**: none

---

## Discrimination Sensor (focused on the fix's new code only)

Per this round's scope, only the new code from commit `6b37230` was mutated — the 3 mutations from round 1 (already documented as killed) were not re-run.

Executed in `git worktree add /tmp/verify-wt2 HEAD` (disposable, node_modules symlinked in for jest resolution, removed at the end — real tree untouched).

| # | File:line | Description | Killed? |
| - | --- | --- | --- |
| 1 | `apps/mobile/src/app/celebracao/[id].tsx:99` | `` `${formatOffset(item.start_offset_minutes)} · ...}` `` → `` `${formatOffset(0)} · ...}` `` (fixed offset instead of the real field) | ✅ Killed — `apps/mobile/src/__tests__/app/celebracao/[id].test.tsx:126` failed: `Expected: "1h30min · 30min", Received: "0min · 30min"` |

**Sensor depth**: lightweight (1 targeted mutation on the fix's new code, proportional per prompt instruction not to re-mutate unchanged code)
**Result**: 1/1 killed — PASS ✅

---

## Code Quality (focused re-check)

| Principle | Status |
| --- | --- |
| Surgical changes | ✅ — fix touches only the rendering block and adds `formatOffset`; no unrelated lines changed |
| No scope creep | ✅ — files touched match exactly what Fix 1/Fix 2 of round 1 prescribed |
| Matches patterns | ✅ — inline helper function follows existing file conventions (e.g. `NO_SETLIST_MESSAGE` constants above), testID naming follows the established `celebracao-item-${id}...` scheme |
| Spec-anchored outcome check | ✅ — see AC2/AC3 table above; exact values asserted and verified against `formatOffset`'s own logic |
| Every test maps to a spec requirement | ✅ — all 3 new tests map to AC2/AC3 or a named spec edge case |

---

## Requirement Traceability Update

| Requirement | Previous Status (round 1) | New Status |
| --- | --- | --- |
| MOB-08-01 | ✅ Verified | ✅ Verified (unchanged) |
| MOB-08-02 | ❌ Needs Fix (falta horário) | ✅ Verified |
| MOB-08-03 | ❌ Needs Fix (falta horário no destaque) | ✅ Verified |
| MOB-08-04 | ✅ Verified | ✅ Verified (unchanged) |
| MOB-08-05 | ✅ Verified | ✅ Verified (unchanged) |
| MOB-08-06 | ✅ Verified | ✅ Verified (unchanged) |
| MOB-08-07 | ✅ Verified | ✅ Verified (unchanged) |
| MOB-08-08 | ✅ Verified | ✅ Verified (unchanged) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 9/9 critérios batendo o outcome da spec (round-1 gap on P1 AC2/AC3 closed)
**Sensor**: 1/1 new mutation killed (round-1's 3 mutations remain killed, not re-run per scope)
**Gate**: Backend 2019 passed, Mobile 124 passed, lint 0 errors, build:api ok, tsc ok

**What works**: Everything from round 1, plus: each OC step now shows its schedule (`start_offset_minutes`/`duration_minutes` formatted as `Xh Ymin · Zmin`), and the schedule is rendered inside the same highlighted container as "minha etapa" (função + horário together, per AC3). Two of the three previously-uncovered edge cases (generic `responsible_label`, duplicate `sequence`) now have dedicated, evidence-backed tests.

**Issues found**: None blocking. One edge case (refetch on screen revisit) remains untested, matching an app-wide precedent (`post/[id].tsx`) — explicitly scoped out of this round and not re-flagged as a lesson (no new signal beyond what round 1 already captured).

**Next steps**: MOB-08 P1 can be considered closed. No further fix→re-verify iteration needed.

---

## Lessons

No new lesson recorded this round. This is a clean PASS after the round-1 fix — no surviving mutant, no spec-precision gap, no new uncovered AC. Round 1 already distilled the relevant candidate lessons (L-007/L-008); not duplicating here per instruction.
