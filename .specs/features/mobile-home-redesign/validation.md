# mobile-home-redesign Validation

**Date**: 2026-09-22
**Spec**: `.specs/features/mobile-home-redesign/spec.md`
**Diff range**: `285c582..HEAD` (branch `claude/wizardly-einstein-c1kh8m`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | `tenant.slug` exposed in `GET /settings`, exact assertion present |
| T2   | ✅ Done | `ORBIEN_WEB_URL`/`extra.webUrl` in `app.config.js` |
| T3   | ✅ Done | `tenantSlug` threaded through `brand-theme.ts` |
| T4   | ✅ Done | `tenantSlug` exposed by `useTheme()` |
| T5   | ✅ Done | Escala moved to `src/app/escala.tsx`, testIDs preserved, 11/11 pre-existing cases migrated (tasks.md text says "12 casos" but the pre-migration suite itself had 11 escala-related `it()`s — verified by diffing against the commit prior to T5; not a real loss) |
| T6   | ✅ Done | Celebrações moved to `src/app/celebracoes.tsx`, 8/8 cases migrated |
| T7   | ✅ Done | Both routes registered in `Stack.Protected` in the same commit as T7 (`999c8f2`), matching the deviation note — see below |
| T8   | ✅ Done | 4 tabs, `showEscala` gate logic removed from `(tabs)/_layout.tsx` |
| T9   | ✅ Done | `HeroSlider` component + tests |
| T10  | ✅ Done | `HomeQuickActions` component + tests |
| T11  | ✅ Done | Home rewritten, all MHR-05..11 covered with named test cases |
| T12  | ✅ Done | Login `flexShrink`/`numberOfLines`/padding fix; visual UAT explicitly not automatable (honest limitation noted in tasks.md) |

All 12 tasks marked done in `tasks.md`, no partial/blocked items.

---

## Spec-Anchored Acceptance Criteria

### P1: Menu inferior com Home em primeiro e sem Escala/Celebrações

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: menu com Home, Grupos, Conteúdo, Perfil, nesta ordem | exactly 4 tabs, `index` first | `apps/mobile/src/app/(tabs)/_layout.tsx:104-119` (`Tabs.Screen name="index"` → `grupos` → `conteudo` → `perfil`) + `apps/mobile/src/__tests__/app/(tabs)/_layout.test.tsx` (order asserted) | ✅ PASS |
| AC2: no Escala/Celebrações items in tab bar | no `Tabs.Screen name="escala"`/`"celebracoes"` | `apps/mobile/src/app/(tabs)/_layout.tsx` (absent) + `_layout.test.tsx` asserting no `celebracoes` tab | ✅ PASS |
| AC3: `/escala` shows same list, same testIDs, with screen header | testIDs `escala-list`, `escala-error`, `escala-empty`, `assignment-*`, `confirm-*`, `decline-*`, `check-in-*`, `indisponibilidade-link`, `escala-action-error`; header title "Escala" | `apps/mobile/src/app/escala.tsx:226` (testIDs preserved) + `apps/mobile/src/app/_layout.tsx:115` (`title: "Escala"`) + `apps/mobile/src/__tests__/app/escala.test.tsx:49-247` (11 cases, migrated 1:1) | ✅ PASS |
| AC4: `/celebracoes` shows same list, role-based source, header "Celebrações" | `apps/mobile/src/app/celebracoes.tsx` + `apps/mobile/src/app/_layout.tsx:116` (`title: "Celebrações"`) + `apps/mobile/src/__tests__/app/celebracoes.test.tsx` (8 cases, migrated 1:1) | ✅ PASS |

**Status**: ✅ All ACs covered

### P1: Nova Home com hero dinâmico e CTAs

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: hero with `getPosts(1,5)`, tap → `/post/[id]` | `apps/mobile/src/app/(tabs)/index.tsx:74-79` (`getPosts(1, MAX_HERO_POSTS)`, `MAX_HERO_POSTS=5`) + `index.test.tsx:133-151` — `expect(mockPush).toHaveBeenCalledWith("/post/hero-1")` | ✅ PASS |
| AC2: hero omitted on empty/error, no crash | `index.tsx:143-145` (`heroPosts && heroPosts.length > 0`) + `index.test.tsx:154-173` — `expect(screen.queryByTestId("hero-slider")).toBeNull()` for both empty and rejected promise | ✅ PASS |
| AC3: CTAs Bíblia/Contribuição/Todos os conteúdos | `index.tsx:90-114` + `index.test.tsx:176-201` — exact destinations asserted (`/biblia`, `/conteudo`, `openBrowserAsync` with exact URL) | ✅ PASS |
| AC4: Escala shortcut gated by `areas===null \|\| areas.includes("volunteers")` | `index.tsx:115` (exact expression) + `index.test.tsx:214-238` — present with `["volunteers"]`, present with `null` (fail-open), absent with `["other_area"]` | ✅ PASS |
| AC5: Celebrações card, no role gate | `index.tsx:125-130` (unconditional) + `index.test.tsx:241-249` — present even with `["other_area"]` | ✅ PASS |
| AC6: preserves greeting/Meus grupos/Avisos recentes with same degradation | `index.tsx:136-141,149-223` + `index.test.tsx:126-130,252-328` — 8 cases covering presence/absence/error for both sections | ✅ PASS |
| AC7: Contribuição CTA disabled when `tenantSlug` unresolved | `HomeQuickActions.tsx:49` (`onPress={item.disabled ? undefined : item.onPress}`), `index.tsx:100` (`disabled: !tenantSlug`) + `index.test.tsx:204-211` — `expect(mockOpenBrowserAsync).not.toHaveBeenCalled()` | ✅ PASS |

**Status**: ✅ All ACs covered

### P2: Ajuste de layout na tela de login

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1/AC2: no character clipping 320-430px, up to 130% font scale | `apps/mobile/src/app/login.tsx:141` (`flexShrink: 1` on `styles.appName`), `login.tsx:73` (`numberOfLines={2}`), `login.tsx:138` (`paddingHorizontal: spacing.xs` on `styles.brand`) — spec itself states this AC closes by visual UAT, not Jest (RN doesn't render pixels in test) | ⚠️ Spec-precision gap (by design) — spec explicitly designates this as non-automatable; the layout fix matches the design.md prescription exactly, but no automated evidence exists (none was required) |

**Status**: ⚠️ Spec-precision gap flagged — matches spec's own acknowledgment that MHR-12 closes via visual inspection, not test assertion. Not treated as a failure; tasks.md T12 records an honest note that this session has no device/simulator to produce a real screenshot, and closes by code-level reasoning instead. This is a known, spec-sanctioned limitation, not a gap the implementer hid.

---

## Discrimination Sensor

Scratch state: `git worktree add` at a throwaway path, `node_modules` symlinked in (not copied) for jest to resolve deps. Worktree removed after all mutations reverted.

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `apps/mobile/src/components/HomeQuickActions.tsx:49` | `onPress={item.disabled ? undefined : item.onPress}` → `onPress={item.onPress}` (disabled items become clickable) | ✅ Killed — 2 tests in `HomeQuickActions.test.tsx` failed |
| 2 | `apps/mobile/src/app/(tabs)/index.tsx:115` | `areas === null \|\| areas.includes("volunteers")` → `areas && areas.includes("volunteers")` (removes fail-open) | ✅ Killed — "areas ainda é null (fail-open)" test in `index.test.tsx` failed |
| 3 | `apps/mobile/src/components/HeroSlider.tsx:36` | `if (posts.length === 0) return null;` removed | ✅ Killed — "lista vazia: não renderiza nada" test in `HeroSlider.test.tsx` failed |

**Sensor depth**: lightweight (default tier, 3 mutations)
**Result**: 3/3 killed — PASS ✅

---

## Code Quality

| Principle | Status |
| --- | --- |
| No features beyond what was asked | ✅ |
| No abstractions for single-use code | ✅ |
| No unnecessary "flexibility" added | ✅ |
| Only touched files required for task | ✅ — the two non-obvious touched test files (`navigation-boot.test.tsx`, `white-label.test.tsx`) are both required consequences of the Home/route change (initial route content changed; `/settings` mock needs `tenant.slug` now that `theme-provider` reads it), not scope creep |
| Didn't "improve" unrelated code | ✅ |
| Matches existing patterns/style | ✅ — icon subpath imports, `Card`/`AppLink` reuse, `FlatList` over new carousel dependency, `Stack.Protected` pattern for new routes, all as design.md prescribed |
| Would senior engineer approve? | ✅ |
| Tests map to acceptance criteria and are non-shallow (spot-check: P1 "Nova Home" story) | ✅ — every AC has a named, ID-tagged test with exact-value assertions (destinations, disabled state, presence/absence) |
| Spec-anchored outcome check (asserted values match spec) | ✅ |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ |
| Every test maps to a spec requirement — no unclaimed tests | ✅ |
| Documented guidelines followed | `apps/mobile/AGENTS.md`/`STYLE-GUIDE.md` (icon subpath imports, 48px touch target, theme tokens), `CLAUDE.md` root (branch-first, tenant test policy N/A here — no DB/tenant work) |

---

## Edge Cases

- [x] Hero list empty → hero omitted silently (`index.test.tsx:154-161`, `HeroSlider.tsx:36`)
- [x] Hero fetch fails → hero omitted, no blocking error (`index.test.tsx:163-173`)
- [x] `areas === null` (permission not yet resolved) → Escala shortcut shown (fail-open) (`index.test.tsx:224-230`)
- [x] CTA Contribuição disabled when `tenantSlug === null` (`index.test.tsx:204-211`, `HomeQuickActions.tsx:49`)
- [x] Groups/posts fetch error → section silently absent, no crash (`index.test.tsx:276-283,318-328`)
- [x] Every root route protected — `protected-routes.test.ts` passes; `escala`/`celebracoes` registered in `Stack.Protected guard={isAuthenticated}` in the same commit that added T7 (`999c8f2`), matching the deviation note in tasks.md — no route left unprotected at any commit in the range (T5/T6 commits reduce/create files but don't leave dangling unguarded routes since `escala.tsx`/`celebracoes.tsx` and their registration land together in T7 per the diff)

---

## Gate Check

- **Gate command**: `npm run test -w orbien-backend && npm run test -w orbien-mobile`, plus `npx turbo run lint --filter=orbien-backend --filter=orbien-mobile` (tasks.md's stated `--filter=orbien-api` does not match the actual package name `orbien-backend` in `apps/api/package.json` — cosmetic doc error in tasks.md, not a functional gap; ran with the correct filter)
- **Result — backend**: 281 suites, 2815 tests, 0 failed
- **Result — mobile**: 52 suites, 393 tests, 0 failed
- **Result — lint**: 0 errors, 100 warnings (all pre-existing patterns — `import/first` in test files, `no-redeclare` on RTL's `screen`/`Text` globals — same shape across the whole mobile test suite, none newly introduced by feature files beyond the same pattern already used everywhere)
- **Test count before feature** (worker-reported, cross-checked against migration diffs rather than re-running a historical checkout): mobile 373 → 393 (+20); API count unchanged in shape (281/2815, matches worker report)
- **Delta**: mobile +20 tests (HeroSlider 4, HomeQuickActions 4, escala.test.tsx 11 — net new file but content ported 1:1 from index.test.tsx so it doesn't count as "new" coverage per se, celebracoes.test.tsx 8 ported 1:1, index.test.tsx rewritten with ~20 Home-specific cases replacing the ~11 escala-specific ones it used to hold); API +0 net (same suite count, `tenant.slug` covered by an existing test's mock+assertion, not a new `it()`)
- **Skipped tests**: none
- **Failures**: none

**Test Integrity Check**: no decrease, no weakened assertions found. `escala.test.tsx`/`celebracoes.test.tsx` diffed against their pre-migration `it()` counts (11/11 and 8/8) confirm no coverage was silently dropped during the file moves.

---

## Fix Plans

None — no FAIL-level gap found.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| MHR-01 | Design | ✅ Verified |
| MHR-02 | Design | ✅ Verified |
| MHR-03 | Design | ✅ Verified |
| MHR-04 | Design | ✅ Verified |
| MHR-05 | Design | ✅ Verified |
| MHR-06 | Design | ✅ Verified |
| MHR-07 | Design | ✅ Verified |
| MHR-08 | Design | ✅ Verified |
| MHR-09 | Design | ✅ Verified |
| MHR-10 | Design | ✅ Verified |
| MHR-11 | Design | ✅ Verified |
| MHR-12 | Design | ⚠️ Verified with spec-sanctioned precision gap (visual-only AC, no device available in this environment) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 11/12 ACs matched spec outcome exactly; 1 spec-precision gap (MHR-12, explicitly non-automatable per spec.md itself)
**Sensor**: 3/3 mutations killed
**Gate**: 281+52 suites, 2815+393 tests, 0 failed, 0 skipped; lint 0 errors

**What works**: Full menu/navigation restructuring (4 tabs, Escala/Celebrações moved to stacked routes with testID and behavior parity), new Home with hero slider, quick-action grid, permission-gated Escala shortcut with correct fail-open semantics, Contribuição CTA correctly disabled without `tenant_slug`, login text-clipping fix applied per design. `expo-web-browser@~57.0.3` matches the project's existing `~57.0.x` pinning convention for all other `expo-*` packages; `expo-doctor`'s only failures are pre-existing (missing `expo-constants`/`expo-linking` peer-dep warnings unrelated to this diff) or environment/proxy-related (config schema check, RN Directory check), not attributable to this feature. The `Home` icon alias (`lucide-react-native/icons/house` re-exported as `Home`) correctly follows STYLE-GUIDE §5 (subpath import, not barrel).

**Issues found**: None blocking. Two cosmetic/documentation-only notes, not functional gaps:
1. `tasks.md`'s Gate Check Commands table names `--filter=orbien-api`, but the actual package name is `orbien-backend` (per root `CLAUDE.md`'s own app table and `apps/api/package.json`). The command as literally written fails with "No package found". Low priority — fix the doc string in tasks.md's Gate Check Commands table.
2. `tasks.md` T5's Done-when describes "os 12 casos" migrating to `escala.test.tsx`; the actual pre-migration and post-migration count is 11. Not a real coverage loss (verified 1:1 against the pre-T5 commit), just an off-by-one in the task's own prose.

**Next steps**: None required to close the feature. Optionally correct the two cosmetic tasks.md wording issues above in a follow-up doc-only commit.
