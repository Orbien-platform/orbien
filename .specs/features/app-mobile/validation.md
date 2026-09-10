# App Mobile Validation — Rodada 1 (MOB-01, MOB-02, MOB-03, MOB-11, MOB-12)

**Date**: 2026-09-08
**Spec**: `.specs/features/app-mobile/spec.md`
**Round**: 2 (re-verification of round 1's Blocker gap + full re-derivation
from scratch). Round 1 (this same file, previously) resulted in ❌ FAIL: the
refresh-queue mechanism (T11, MOB-02) was correctly implemented and tested in
isolation, but nothing in the app's real request path (`ThemeProvider`, the
only live authenticated caller at the time) ever went through it — MOB-01
AC3/AC4 and the "duas telas disparam refresh" edge case had no real code path
exercising them. Fix task F1 (`tasks.md`) was dispatched to close that gap.
This report does **not** trust round 1's conclusions — every claim below was
re-derived independently against the current tip of `apps/mobile`'s history.
**Diff/commit range inspected**: full `apps/mobile` history, tip
`d5512ef` (`fix(mobile): interceptação reativa de 401 conecta ApiClient ao
AuthClient (MOB-01, F1)`), branch `claude/next-mobile-feature-414k3k`.
**Verifier**: independent sub-agent (author ≠ verifier). Ran read-only over
a dedicated scratch worktree
(`/tmp/claude-0/-home-user-orbien/29a26d0b-9919-5de4-a936-f99081b0e70a/scratchpad/verify-mobile`,
detached at `d5512ef`, created via `git worktree add` — never `git stash`,
never touching the shared checkout or any other agent's worktree). Mutations
for the Discrimination Sensor were injected and reverted only inside that
scratch worktree.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1   | ✅ Done | Workspace scaffold present, builds, no lockfile in `apps/mobile`. |
| T2   | ✅ Done | Expo Router + `jest-expo` configured; `@testing-library/jest-native` intentionally dropped (documented `SPEC_DEVIATION`, no coverage impact). |
| T3   | ✅ Done | `dev:mobile`/`build:mobile` in root `package.json`; `turbo run lint --filter=orbien-mobile` runs. |
| T4   | ✅ Done | `apps/mobile/eslint.config.mjs` — `typescript-eslint` recommended + `eslint-config-expo`, `no-unused-vars` with `argsIgnorePattern: "^_"`. |
| T5   | ✅ Done | `apps/mobile/app.config.js` dynamic, resolves Orbien defaults with no env set. |
| T6   | ✅ Done | `apps/mobile/eas.json` — `development`/`preview`/`production`, all `extends: "generic"`; `README.md` documents build profiles. |
| T7   | ✅ Done | `no-hardcoded-identity.test.ts` — generic recursive grep over `src/`, not a narrow case check. |
| T8   | ✅ Done | `types.ts` (auth, theme) match `design.md` Data Models exactly. |
| T9   | ✅ Done | `ApiClient` — `NetworkError`/`HttpError` contract tested (`client.test.ts`). |
| T10  | ✅ Done | `login`/`logout`/`getSession` implemented and tested (AC1, AC2, AC5). |
| T11  | ✅ Done | `getValidAccessToken` (serialized refresh queue) implemented, concurrency + failure paths proven — **and now wired into a real request path** (see F1 below and AC3/AC4 in the next section). |
| T12  | ✅ Done | `AuthProvider` hydration + status transitions tested, plus new AC4 `onSessionExpired` → `unauthenticated` test. |
| T13  | ✅ Done | Login screen, generic error message tested against 3 distinct simulated causes. |
| T14  | ✅ Done | Root layout guard (`loading`/`unauthenticated`/`authenticated`) tested. |
| T15  | ✅ Done | `ThemeProvider` — cache-before-network, fallback-on-null-branding, fallback-on-network-error, all with real component tests; now sourced through `authenticatedRequest`. |
| T16  | ✅ Done | Two-tenant wiring test in `_layout.test.tsx` proves distinct header color/logo per branding payload. |
| **F1** | ✅ **Done** | Round-1 fix task. `auth-client.ts` gained `performRefresh` (shared by the proactive clock-based path and the new reactive one), `onSessionExpired`/`notifySessionExpired` (pub-sub), and `authenticatedRequest<T>` (obtains a valid token, calls `apiClient`, and on a reactive 401 forces one renewal + one retry). `theme-provider.tsx` now calls `authenticatedRequest("get", "/settings")` instead of building the header manually. `auth-provider.tsx` subscribes to `onSessionExpired` to flip `status` to `"unauthenticated"`, which `AuthGate` (`_layout.tsx`) already redirects on. New test file `authenticated-request.test.ts` (3 tests) + new AC4 test in `auth-provider.test.tsx`; `theme-provider.test.tsx`/`_layout.test.tsx` updated to mock `authenticatedRequest`. |

All 16 tasks + F1 independently re-confirmed as Done from the actual test files and source, not copied from `tasks.md`'s own status markers.

---

## Spec-Anchored Acceptance Criteria

### P1: Autenticação e sessão

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: credenciais corretas → autentica, grava tokens no SecureStore, navega para tela inicial | `POST /auth/login` chamado com `{tenant_slug, email, password}`; `Session` gravada via `SecureStore.setItemAsync`; navegação para `/` | `apps/mobile/src/lib/auth/auth-client.test.ts:42-53` — `expect(mockPost).toHaveBeenCalledWith("/auth/login", {body:{tenant_slug:"igreja-teste",email:"a@b.com",password:"senha123"}})`, `expect(mockSetItemAsync).toHaveBeenCalledWith("orbien.session", JSON.stringify(session))`; `apps/mobile/src/app/login.test.tsx:31-34` — `expect(mockReplace).toHaveBeenCalledWith("/")` | ✅ PASS |
| AC2: credenciais erradas → mensagem genérica, sem distinguir motivo | Mesma mensagem para qualquer causa (senha errada, tenant não encontrado, rede) | `apps/mobile/src/app/login.test.tsx:37-56` — `it.each([["senha errada",...],["tenant não encontrado",...],["erro de rede",...]])`, every case asserts `expect(screen.getByTestId("login-error").props.children).toBe("Não foi possível entrar. Confira os dados e tente novamente.")` — genuinely proves message invariance across causes, not a single-case check | ✅ PASS |
| AC3: access token expira em chamada autenticada → dispara exatamente uma renovação (fila serializada) e reenvia a chamada original | Uma única `POST /auth/refresh`; a chamada HTTP original reenviada com o token novo após sucesso | `apps/mobile/src/lib/auth/authenticated-request.test.ts:46-73` — mocks `apiClient.get` to reject once with `HttpError(401)` then resolve; asserts `expect(mockApiGet).toHaveBeenNthCalledWith(1, "/settings", {token:"token-valido",...})` and `toHaveBeenNthCalledWith(2, "/settings", {token:"token-novo",...})`, `expect(mockApiPost).toHaveBeenCalledTimes(1)`. **Real path confirmed**: `apps/mobile/src/lib/theme/theme-provider.tsx:76` calls `authenticatedRequest<ResolvedSettings>("get", "/settings")` — grepped `theme-provider.tsx` and `_layout.tsx` (the only two live authenticated call sites in this round) and confirmed neither passes `session.accessToken` raw anymore; `apps/mobile/src/app/_layout.test.tsx:107-115` (tenant A) independently proves the same call renders correctly end-to-end through `ThemedShell` | ✅ PASS (gap from round 1 closed) |
| AC4: renovação falha (refresh revogado/expirado) → limpa SecureStore e navega para login | `SecureStore` limpo; app navega para `/login` | `apps/mobile/src/lib/auth/authenticated-request.test.ts:75-92` — 401 on retry, refresh itself rejects with `HttpError(401)` → `expect(...).rejects.toBeInstanceOf(SessionExpiredError)`, `expect(mockDeleteItemAsync).toHaveBeenCalledWith("orbien.session")`. **Real navigation path confirmed**: `apps/mobile/src/lib/auth/auth-provider.tsx:45-50` subscribes `onSessionExpired` and sets `status` to `"unauthenticated"`; `apps/mobile/src/lib/auth/auth-provider.test.tsx:97-123` proves this transition fires the listener registered by `AuthProvider`, and `apps/mobile/src/app/_layout.tsx:22-24` (`AuthGate`) renders `<Redirect href="/login" />` whenever `status === "unauthenticated"` — proven independently by `_layout.test.tsx:58-67`. The chain (`refresh 401 fail → notifySessionExpired → AuthProvider.status → AuthGate.Redirect`) is fully connected across files, not just claimed in a comment | ✅ PASS (gap from round 1 closed) |
| AC5: "sair" → chama logout, apaga tokens antes de navegar | `POST /auth/logout` best-effort + `SecureStore` limpo mesmo em falha de rede | `apps/mobile/src/lib/auth/auth-client.test.ts:84-108` — success case (`expect(mockPost).toHaveBeenCalledWith("/auth/logout",...)`, `expect(mockDeleteItemAsync).toHaveBeenCalledWith(...)`) and failure case (`mockPost.mockRejectedValue(new Error("Erro de rede"))` → `expect(logout()).resolves.toBeUndefined()`, delete still called) | ✅ PASS |

### P1: Tema por tenant (white-label dinâmico)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: login concluído → busca `branding_configs`, aplica cor+logo no shell | `GET /settings` chamado (via `authenticatedRequest`); `primaryColor`/`logoUrl` aplicados no header | `apps/mobile/src/app/_layout.test.tsx:93-115` (tenant A) e `:117-141` (tenant B) — `expect(screen.getByTestId("header-color").props.children).toBe("#111111")`, `expect(screen.getByTestId("header-logo").props.source.uri).toBe("https://a.example/logo.png")` | ✅ PASS |
| AC2: tenant sem branding customizado → tema padrão, sem erro visível | Campos `null` → fallback ao `DEFAULT_THEME`, nenhum erro exposto | `apps/mobile/src/lib/theme/theme-provider.test.tsx:111-132` — `expect(...primaryColor).toBe(DEFAULT_THEME.primaryColor)`; `apps/mobile/src/app/_layout.test.tsx:143-162` — `expect(screen.queryByTestId("header-logo")).toBeNull()`; network-failure path also covered at `theme-provider.test.tsx:134-168` and `:170-188` | ✅ PASS |
| AC3: app reaberto com sessão válida → reaplica tema cacheado antes de qualquer chamada de rede completar | Cache lido de `AsyncStorage` e aplicado **antes** de `GET /settings` resolver | `apps/mobile/src/lib/theme/theme-provider.test.tsx:47-109` — delay-controlled Promise (`releaseNetwork`), asserts cached values render before `releaseNetwork(...)` is called: genuine temporal-order proof | ✅ PASS |

### Infra: Identidade de app configurável (MOB-12)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: identidade vem de `app.config.js` dinâmico, nunca `app.json` estático | Nenhum `app.json`; `app.config.js` exporta função | `apps/mobile/app.config.js:26` — `module.exports = ({config}) => {...}`; confirmed no `app.json` in the tree (`find apps/mobile -name app.json` → empty) | ✅ PASS |
| AC2: sem env de tenant → identidade genérica Orbien | `name:"Orbien"`, `bundleIdentifier/package:"com.orbien.app"`, `oneSignalAppId` default | `apps/mobile/app.config.test.js:31-42` — `expect(resolved.name).toBe("Orbien")`, `expect(resolved.ios.bundleIdentifier).toBe("com.orbien.app")`, `expect(resolved.extra.oneSignalAppId).toBe("REPLACE_WITH_ONESIGNAL_APP_ID")` | ✅ PASS |
| AC3: novo profile de build não exige mudança em código-fonte fora de `app.config.js`/`eas.json` | Profiles só variam `extends`/env; código não muda | `apps/mobile/eas.json:6-28` — `development`/`preview`/`production` all `"extends":"generic"`; `app.config.test.js:44-62` proves the same `app.config.js` responds to arbitrary env with no code change | ✅ PASS (design-level; AC explicitly disclaims implementing a real Premium profile) |
| AC4: código do app referencia identidade só via config resolvida em runtime, nunca literal | Nenhum literal de identidade fora de `app.config.js`/`eas.json`/testes | `apps/mobile/src/lib/config/no-hardcoded-identity.test.ts:63-84` — recursively walks all of `src/` (excluding `*.test.*`), derives the reference literals from `app.config.js` itself, fails on any reintroduction | ✅ PASS |

**Status**: ✅ All 12 ACs covered with precise, spec-matching assertions — **0 gaps** (round 1's 2 gaps, MOB-01 AC3/AC4, are now closed).

---

## Edge Cases (scoped to MOB-01/02/03/11/12)

- [x] **"duas abas/telas disparam refresh de token ao mesmo tempo → serializa em uma única renovação"**: mechanism proven at `apps/mobile/src/lib/auth/refresh-queue.test.ts:50-65` (`getValidAccessToken()` called twice concurrently → `mockPost` called once); the mechanism is now the one actually invoked by `authenticatedRequest`/`ThemeProvider` (see AC3 above) — no longer isolated dead code.
- [x] **"conta desativada no meio de uma sessão → próxima chamada autenticada recebe 401 → app trata como sessão encerrada"**: `apps/mobile/src/lib/auth/authenticated-request.test.ts:75-92` exercises exactly this shape generically — any 401 on a live request that survives a forced renewal attempt (refresh itself also rejecting) produces `SessionExpiredError` + `notifySessionExpired()` + `AuthProvider` transitioning to `unauthenticated` + `AuthGate` redirecting to `/login`. The spec doesn't require the app to special-case "deactivated" vs. "revoked refresh" — both surface as the same 401→refresh-fails→session-ended path, and that path is real and tested end-to-end.
- N/A (out of scope for this round — deferred to MOB-04+ per the spec's own traceability table, no domain screens/tabs exist yet): "dispositivo sem internet ao abrir o app", "papel insuficiente → oculta aba", "push despublicado → estado 'não encontrado'".

---

## Discrimination Sensor

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `apps/mobile/src/lib/auth/auth-client.ts:189` | Changed the reactive-401 guard in `authenticatedRequest` from `error.status === 401` to `error.status === 402` | ✅ Killed — `authenticated-request.test.ts`: AC3 test failed (`Received promise resolved instead of rejected... Resolved to value: {"ok": true}` never happened — actually the retry/renewal never fired, original 401 propagated unhandled) and AC4 test failed (expected rejection with `SessionExpiredError`, got resolved `{ok:true}`) — 2/3 tests in the file failed |
| 2 | `apps/mobile/src/lib/auth/auth-client.ts:77` | Removed the `notifySessionExpired();` call inside `performRefresh`'s failure branch | ✅ Killed — `authenticated-request.test.ts` AC4 test failed: `expect(listener).toHaveBeenCalledTimes(1)` received `0` |
| 3 | `apps/mobile/src/lib/auth/auth-provider.tsx:45-50` | Made the `onSessionExpired` subscription a no-op (dropped `setSession(null)`/`setStatus("unauthenticated")` from the listener body) | ✅ Killed — `auth-provider.test.tsx` AC4 test failed: `expect(...).toBe("unauthenticated")` received `"authenticated"` |

**Sensor depth**: lightweight (default tier — non-payment/non-P0 feature), targeted specifically at the F1 fix's new code (the exact surface round 1 flagged as untested/dead).
**Result**: 3/3 killed — ✅ PASS

All mutations were injected and reverted inside the disposable worktree
`/tmp/claude-0/-home-user-orbien/29a26d0b-9919-5de4-a936-f99081b0e70a/scratchpad/verify-mobile`
(created via `git worktree add` from the fix commit `d5512ef`, never `git
stash`, never touching the shared checkout at `/home/user/orbien` or any
other agent's worktree). Each mutation was applied, the relevant test files
were run, the failure was confirmed, and `git checkout --` restored the file
before the next mutation — `git status --porcelain` confirmed a clean tree
after each revert and after the full run.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — the fix is additive: `performRefresh` extraction, one pub-sub pair, one wrapper function; no unrelated refactor |
| Surgical changes | ✅ — diff confined to `apps/mobile/src/lib/auth/*`, `apps/mobile/src/lib/theme/theme-provider.tsx` (1-line call-site swap), `apps/mobile/src/app/_layout.test.tsx` (mock update), plus `.specs/**` |
| No scope creep | ✅ — no domain screens attempted; the fix does exactly what F1 in `tasks.md` scoped, nothing more |
| Matches patterns | ✅ — `authenticatedRequest` reuses the existing `isRefreshing`/`failedQueue` state machine rather than inventing a second one; pub-sub for `onSessionExpired` is a small, idiomatic addition consistent with the rest of the module's style |
| Spec-anchored outcome check | ✅ — every assertion checked above targets the exact value/state the spec names (call counts, header values, specific error types), not a vague "was called" |
| Per-layer Coverage Expectation met | ✅ — domain logic (`AuthClient`/`authenticatedRequest`) has 1:1 AC mapping (AC3/AC4 both directly tested); the integration point the design calls for ("ApiClient intercepta 401 e delega ao AuthClient") is now real and proven at the one live call site that exists this round (`ThemeProvider`) |
| Every test maps to a spec AC/edge case/Done-when | ✅ — no unclaimed tests found; `authenticated-request.test.ts`'s header comment cites AC3/AC4 explicitly, and this held up |
| Documented guidelines followed | `apps/mobile/AGENTS.md` (Expo SDK 57 conventions) — respected; monorepo `CLAUDE.md` rules (single lockfile, `argsIgnorePattern: "^_"`, deploys independent) — followed |

One minor design-level observation, non-blocking: `design.md`'s Components
section describes the interception as living in `ApiClient` ("intercepta
401 e delega ao `AuthClient`"), but the actual implementation puts the
interception in `AuthClient.authenticatedRequest` (which calls `apiClient`
internally), not in `ApiClient` itself. This is a reasonable and arguably
cleaner placement — it avoids the circular-import problem T9's own "Reuses"
note already flagged (`ApiClient` cannot depend on `AuthClient` if
`AuthClient` depends on `ApiClient`) — and the resulting behavior matches
every AC precisely. Not treated as a gap; flagging only because the module
boundary differs slightly from the design doc's prose.

---

## Gate Check

- **Gate command**: `npm run test -w orbien-mobile && npx turbo run build --filter=orbien-mobile --force && npx turbo run lint --filter=orbien-mobile --force` (Full gate, per `tasks.md` Gate Check Commands; build/lint force-rerun to bypass turbo's cache and get a live result)
- **Result**: Tests — **43 passed, 0 failed, 0 skipped, 10 suites**. Build (`tsc --noEmit`) — 0 errors. Lint (`eslint .`) — 0 errors, 23 warnings (all cosmetic: `import/first` ordering in test files, `no-redeclare` on RTL globals `screen`/`Text` re-imported in tests, `array-type` style nits in `auth-client.ts:21,38` — same categories as round 1, count grew from 19→23 in proportion to the new test file and the extracted queue state, not a new class of issue).
- **Test count before this round's fix**: 39 (round 1 baseline, confirmed in round-1's own report)
- **Test count after this round's fix**: 43
- **Delta**: +4 new tests (3 in `authenticated-request.test.ts`, 1 new AC4 case in `auth-provider.test.tsx`) — matches the F1 commit message's own claim exactly
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

None. Round 1's single Blocker gap (MOB-01 AC3/AC4 not wired into any real
request path) is closed, verified against real code paths (not just the
isolated `AuthClient` function), and survives targeted mutation testing on
exactly the new code. No new gap was found in this round's re-derivation of
all 12 ACs, the 5 edge cases in scope, the gate check, or the code-quality
pass.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| MOB-01 | ❌ Needs Fix (round 1) | ✅ Verified |
| MOB-02 | ❌ Needs Fix (round 1) | ✅ Verified |
| MOB-03 | ✅ Verified (round 1) | ✅ Verified (re-confirmed) |
| MOB-11 | ✅ Verified (round 1) | ✅ Verified (re-confirmed) |
| MOB-12 | ✅ Verified (round 1) | ✅ Verified (re-confirmed) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 12/12 ACs matched the spec's precise outcome with genuine (non-shallow) assertions; 0 spec-precision gaps.
**Sensor**: 3/3 mutations killed (targeted specifically at this round's new F1 code — the reactive-401 guard, the session-expired notification, and the `AuthProvider` subscription that turns it into a navigation redirect).
**Gate**: 43/43 tests passed, build clean (0 errors), lint clean (0 errors, 23 cosmetic warnings unchanged in kind from round 1).

**What works**: the entire scope (MOB-01, MOB-02, MOB-03, MOB-11, MOB-12) is
now solid end-to-end, including the piece round 1 flagged as dead code:
`ThemeProvider`'s one live authenticated call now goes through
`authenticatedRequest`, which drives the serialized refresh queue on a
reactive 401 and notifies `AuthProvider` on a hard session-expiry, which in
turn drives `AuthGate`'s redirect to `/login`. Workspace scaffold, dynamic
`app.config.js`/`eas.json` (including the anti-hardcode regression test),
login/logout with a genuinely-generic error message, session hydration,
and theme fetch/cache/fallback with a real temporal-order proof all remain
solid as independently re-verified in this round.

**Issues found**: none.

**Next steps**: No further fix→re-verify iteration needed for this batch.
MOB-01, MOB-02, MOB-03, MOB-11, MOB-12 can be marked ✅ Verified in
`spec.md`'s Requirement Traceability table. The next Design/Tasks round can
proceed to the domain modules (MOB-04 through MOB-10) building on this
foundation.

---
---

# App Mobile Validation — Rodada 2 (MOB-04, MOB-05)

**Date**: 2026-09-08
**Spec**: `.specs/features/app-mobile/spec.md`, story "P1: Membros e Voluntários" (AC 1-4)
**Diff range**: `eb70790..HEAD` (`a39a495`..`5de9092`)
**Verifier**: independent sub-agent (author ≠ verifier), fresh eyes, re-derived from `spec.md`/`design.md`/`tasks.md` without trusting prior implementation notes.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 — migration `checked_in_at` | ✅ Done | `apps/api/prisma/schema.prisma:1267`, migration `20260908150827_add_checked_in_at_to_celebration_assignments/migration.sql` — nullable column on existing table, no new RLS script (correct per AD-001: only new tables need `00N_rls_*.sql`) |
| T2 — `checkInAssignment` service | ✅ Done | `apps/api/src/celebrations/celebration-assignment.service.ts:315-346` |
| T3 — `PATCH /assignments/:id/check-in` controller | ✅ Done | `apps/api/src/celebrations/celebration-volunteer.controller.ts:37-41` |
| T4 — mobile types | ✅ Done | `apps/mobile/src/lib/escala/types.ts` |
| T5 — `EscalaClient` list/respond/checkIn | ✅ Done | `apps/mobile/src/lib/escala/escala-client.ts:9-38` |
| T6 — `EscalaClient` unavailability | ✅ Done | `apps/mobile/src/lib/escala/escala-client.ts:41-65` |
| T7 — tela Escala | ✅ Done | `apps/mobile/src/app/index.tsx` |
| T8 — tela Indisponibilidade | ✅ Done | `apps/mobile/src/app/indisponibilidade.tsx` |

All 8 tasks done; commit trail (`git log --oneline eb70790..HEAD`) shows one commit per task pair, matching the `tasks.md` Commit annotations exactly (T1-T3 → `feat(api)`, T4-T8 → `feat(mobile)`).

---

## Spec-Anchored Acceptance Criteria

### P1: Membros e Voluntários

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| -------------------------- | --------------------- | ------------------------ | ------ |
| AC1: WHEN abre "Escala" THEN lista as próximas escalas | `Assignment[]` renderizado a partir de `getMyAssignments()` (endpoint já existente, reuso confirmado) | `apps/mobile/src/app/index.test.tsx:46-57` — `expect(screen.getByTestId("assignment-a1")).toBeTruthy()` após `getMyAssignments` mockado | ✅ PASS |
| AC2: WHEN slot pendente THEN permite confirmar/recusar, mesma regra da API | `respondToAssignment(id, "confirmed"\|"declined")` chamado e lista atualizada localmente sem refetch | `apps/mobile/src/app/index.test.tsx:59-79` — `expect(mockRespondToAssignment).toHaveBeenCalledWith("a1","confirmed")` + `expect(mockGetMyAssignments).toHaveBeenCalledTimes(1)` (prova a ausência de refetch); variante recusar em `:81-98` | ✅ PASS |
| AC3: WHEN faz check-in THEN envia check-in e mostra confirmação visual imediata | Backend persiste `checked_in_at`; mobile chama a rota e o botão de check-in some | Backend: `apps/api/src/celebrations/celebration-assignment.service.spec.ts:651-678` — `expect(client.celebrationAssignment.update).toHaveBeenCalledWith({where:{id:'a1'},data:{checked_in_at: expect.any(Date)}})`. Controller: `apps/api/src/celebrations/celebration-volunteer.controller.spec.ts:56-76` — `expect(assignmentService.checkInAssignment).toHaveBeenCalledWith('a1','user-1','tenant-1')` + role check. Mobile: `apps/mobile/src/app/index.test.tsx:100-117` — `expect(mockCheckIn).toHaveBeenCalledWith("a2")` + `expect(screen.queryByTestId("check-in-a2")).toBeNull()` (confirmação visual = botão some) | ✅ PASS |
| AC4: WHEN edita indisponibilidade THEN reflete na tela sem reload manual | `saveUnavailability` chamado com mês/ano/datas; troca de mês aplica a resposta do mês certo mesmo fora de ordem (sem exigir reload) | Carrega: `apps/mobile/src/app/indisponibilidade.test.tsx:26-37` — `expect(mockGetUnavailability).toHaveBeenCalledWith(9,2026)` + `expect(screen.getByText("10 ✓")).toBeTruthy()`. Salva: `:39-62` — `expect(mockSaveUnavailability).toHaveBeenCalledWith(9,2026,["2026-09-15"],"viagem")`. Race de mês: `:64-94` — resposta obsoleta de setembro resolvida depois da troca para outubro, `expect(screen.getByTestId("current-month").props.children).toBe("10/2026")` (não sobrescrita) | ✅ PASS |

**Status**: ✅ All 4 ACs covered with precise, non-shallow evidence. 0 spec-precision gaps — the spec's outcomes for this story are all precise enough to target directly (no vague criteria to flag).

**Backend gap-fill (design.md, Knowledge Verification Chain)**: the design round found AC3 had no backend at all (`checked_in_at` didn't exist on `CelebrationAssignment` — the old `schedule_assignments`/`checked_in_at` was dropped when the schema migrated). T1-T3 closed that gap correctly and minimally: one nullable column, one service method mirroring `respondToAssignment`'s exact structure (403 wrong owner → 422 wrong status → 409 already checked-in → update), one controller method reusing the same guards/roles as `:id/respond`. No `SPEC_DEVIATION` markers found in the diff.

---

## Discrimination Sensor

Ran in a throwaway `git worktree` at `/tmp/.../scratchpad/verify-wt` (never touched the real working tree; `node_modules` symlinked in from the root and `apps/mobile/node_modules` for `jest-expo`). All 3 mutations targeted the highest-risk new logic of this round (backend check-in guard + the mobile confirmation UI it drives).

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ------------ | ------- |
| 1 | `apps/api/src/celebrations/celebration-assignment.service.ts:334` | Flipped status guard `assignment.status !== AssignmentStatus.confirmed` → `!== AssignmentStatus.pending` (would let check-in fire on the wrong status and block it on the right one) | ✅ Killed — 3 tests failed (`UnprocessableEntityException` thrown/not-thrown at the wrong times) |
| 2 | `apps/api/src/celebrations/celebration-assignment.service.ts:338-340` | Removed the `checked_in_at` idempotency guard (`ConflictException` on double check-in) entirely | ✅ Killed — 1 test failed (`lança ConflictException quando o check-in já foi feito`) |
| 3 | `apps/mobile/src/app/index.tsx:93` | Changed check-in button visibility condition `status === "confirmed" && !checked_in_at` → `status === "confirmed"` (button would never disappear after a successful check-in) | ✅ Killed — 1 test failed (`check-in em slot confirmado ... o botão desaparece após sucesso`) |

**Sensor depth**: lightweight (3 targeted mutations, default tier — this round is not a P0/critical path).
**Result**: 3/3 killed — ✅ PASS. The tests genuinely discriminate the new behavior; none of the mutations survived.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ — T2/T3 mirror `respondToAssignment`'s existing structure line-for-line in shape; no new abstraction introduced for a single caller |
| Surgical changes | ✅ — diff touches only the 8 files `tasks.md` names (plus the 3 spec docs); no adjacent code, comments, or formatting touched |
| No scope creep | ✅ — no tab bar introduced despite only one mobile module existing (design.md explicitly calls this out as deferred until a 2nd domain module justifies it) |
| Matches patterns | ✅ — `EscalaClient` follows the `*-client.ts` split already established by `auth-client.ts`/`theme-provider.tsx`; DTO-less endpoint matches the stated rationale (server-only timestamp) |
| Spec-anchored outcome check | ✅ — see AC table above, all assertions target the exact value/state |
| Per-layer coverage (domain 1:1 AC; routes happy+edge+error) | ✅ — `checkInAssignment` has 1:1 tests for all 4 error branches + happy path; controller has delegation + role tests |
| Every test maps to a spec AC/edge case/Done-when — no unclaimed tests | ✅ — spot-checked; every test in the 4 new/changed spec files traces to a Done-when line in T2/T3/T5/T6/T7/T8 |
| Documented guidelines followed | ✅ — `apps/api/jest.config.js` (project `unit`, colocated specs), `apps/mobile/jest.config.js` (`jest-expo` + Testing Library) — both matched exactly as `tasks.md`'s Test Coverage Matrix names them |

**Would a senior engineer approve?** Yes for T1-T7. **One reservation on T7/T8 — see Issues Found below**: the design's own Error Handling Strategy table (Rodada 2) commits to generic error handling for `respond`/`check-in`/`unavailability` network failures, but `handleRespond`, `handleCheckIn` (`index.tsx`) and `handleSave` (`indisponibilidade.tsx`) have no `try/catch` at all — only the initial `getMyAssignments()` load in `index.tsx` catches and surfaces an error state. A senior engineer would flag this before calling T7/T8 fully done against their own design doc.

---

## Edge Cases

From `spec.md` Edge Cases relevant to this round, cross-checked against `design.md`'s Rodada 2 "Error Handling Strategy" table:

- [x] Network error on initial escala list load → clear error state, not empty list: `apps/mobile/src/app/index.tsx:56-62` (`escala-error` testID), tested at `index.test.tsx:119-130`.
- [ ] **NOT handled**: network/business error on `respondToAssignment`/`checkIn`/`saveUnavailability` action calls. `design.md`'s own Rodada 2 Error Handling Strategy table states these should get "mesmo tratamento genérico de erro de rede que o resto do app" for the `NetworkError` row — but `handleRespond`/`handleCheckIn` (`apps/mobile/src/app/index.tsx:46-54`) and `handleSave` (`apps/mobile/src/app/indisponibilidade.tsx:74-78`) call the client functions with no `try/catch`, so a rejected promise (network failure, or an unexpected 403/422/409) is an unhandled rejection with zero user-visible feedback — not "generic error treatment," no treatment at all. No test in `index.test.tsx` or `indisponibilidade.test.tsx` covers this path either (evidence-or-zero: not covered).
  - Note: the design's 409-duplicate-check-in row explicitly says "no-op silencioso" is acceptable for that one specific race (button already hidden) — that row is not a gap. It is specifically the `NetworkError` row (and, by the same "no active handling" pattern, the implicit 403 unexpected-error row) that has no implementation at all, not even the silent-no-op the 409 row got.
  - Also note `getUnavailability`'s failure path (`indisponibilidade.tsx:36-39`) *does* catch and falls back to an empty set — but shows no error indicator, so a network failure on load is visually indistinguishable from "no unavailability set this month," which is exactly the "tela vazia interpretável como sem dado" pattern `spec.md`'s Edge Cases section says to avoid (stated there for the app-open case, but the same principle applies here and the design's own strategy table extends it explicitly to this screen).

---

## Gate Check

- **Gate commands**: `npm run test -w orbien-backend`, `npm run build:api`, `npx turbo run lint --filter=orbien-backend`, `npm run test -w orbien-mobile`, `npm run build:mobile`, `npx turbo run lint --filter=orbien-mobile` — all run from repo root.
- **Backend**: 215 suites / 2000 tests passed, 0 failed. `build:api` (turbo, content-hash cache hit — inputs unchanged since last successful build in this session) passed. `lint` (turbo cache hit) — 0 errors.
- **Mobile**: 13 suites / 61 tests passed, 0 failed. `build:mobile` (`tsc --noEmit`, turbo cache hit) passed. `lint` — 0 errors, 28 pre-existing warnings (all `import/first`, `array-type`, `no-redeclare` on files untouched by this round — none in the new `escala/` files' production code; one `import/first` warning in the new `escala-client.test.ts` at line 9, same style already present in every other `*-client.test.ts` in the mobile app, not a regression).
- **Skipped tests**: none.
- **Failures**: none.

---

## Fix Plans

### Fix 1: Action calls in Escala/Indisponibilidade screens have no error handling

- **Root cause**: `handleRespond`/`handleCheckIn` (`apps/mobile/src/app/index.tsx:46-54`) and `handleSave` (`apps/mobile/src/app/indisponibilidade.tsx:74-78`) `await` the client call with no `try/catch`. Only the initial list load in `index.tsx` has a `.catch()`. `design.md`'s Rodada 2 Error Handling Strategy table commits to "mesmo tratamento genérico de erro de rede que o resto do app" for these calls, and that commitment was not carried into `tasks.md`'s T7/T8 Done-when lists (which only require the error test for the initial load), so it fell through in implementation.
- **Fix task**: Wrap `handleRespond`, `handleCheckIn`, and `handleSave` in `try/catch`, surface a visible error message (reuse the `escala-error` pattern already in `index.tsx`, or an inline equivalent), and add one component test per handler proving the error surfaces (mock rejects → assert the error UI appears, not a silent no-op or crash).
- **Priority**: Major (not Blocker — happy path for all 4 ACs works and is tested; this is a real but secondary gap against the round's own design commitment, not a failed acceptance criterion).

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ----------- |
| MOB-04 | In Tasks | ✅ Verified |
| MOB-05 | In Tasks | ✅ Verified |

(Both ACs are fully met with real evidence and the gate/sensor pass cleanly — the Fix 1 gap above is a design-commitment shortfall in error UX, not a failed acceptance criterion, so it does not block marking MOB-04/MOB-05 Verified. It is recorded as a fix task for a follow-up round rather than blocking this one.)

---

## Summary

**Overall**: ✅ Ready (with 1 Major issue flagged, non-blocking)

**Spec-anchored check**: 4/4 ACs matched the spec's precise outcome with genuine (non-shallow) assertions; 0 spec-precision gaps.
**Sensor**: 3/3 mutations killed.
**Gate**: 2061/2061 tests passed (2000 backend + 61 mobile), builds clean, lint clean (0 errors).

**What works**: listing escala (AC1), confirm/decline with local optimistic update and no refetch (AC2), check-in end-to-end including the backend gap-fill this round added (`checked_in_at` column + service + route, AC3), and editing unavailability with correct stale-response handling on rapid month changes (AC4). The backend correctly built on the current `CelebrationAssignment` model rather than resurrecting the orphaned `schedule_assignments`/`checked_in_at` from the discarded migration, matching `design.md`'s Tech Decisions.

**Issues found**: Fix 1 above — no error handling on `respondToAssignment`/`checkIn`/`saveUnavailability` action calls, despite `design.md`'s own Error Handling Strategy table committing to it. Major, non-blocking.

**Next steps**: Route Fix 1 to an implementer as a small follow-up (3 `try/catch` blocks + error UI + 3 tests). Re-verification of just this fix is a Quick-gate check (`npm run test -w orbien-mobile`), not a full re-verify of MOB-04/MOB-05.

---

## Fix 1 — Resolved (commit `4cec930`)

`handleRespond`/`handleCheckIn` (`apps/mobile/src/app/index.tsx`) e
`handleSave` (`apps/mobile/src/app/indisponibilidade.tsx`) agora têm
`try/catch`, com mensagem de erro visível (`escala-action-error`/
`save-error`) em vez de rejection não tratada. Check-in duplicado (409)
continua no-op silencioso, distinguido explicitamente do erro de rede
genérico (`err instanceof HttpError && err.status === 409`). O
carregamento de indisponibilidade (`getUnavailability`) também passou a
expor `load-error` em vez de cair silenciosamente num estado
indistinguível de "sem indisponibilidade cadastrada".

5 testes novos (2 em `index.test.tsx`, 2 em `indisponibilidade.test.tsx`,
1 cobrindo o no-op do 409) — 66/66 testes mobile passam, `build:mobile` e
`turbo run lint --filter=orbien-mobile` limpos (0 erros). Quick-gate
re-verificado; sem necessidade de re-rodar o sensor completo (a mudança é
tratamento de erro em código já coberto pelas mutações 1-3, não lógica
nova de negócio).

---

# App Mobile Validation — Rodada 3 (MOB-06)

**Date**: 2026-09-08
**Spec**: `.specs/features/app-mobile/spec.md`, story "P1: Conteúdos e
Notificações", AC2 (listar posts publicados). AC1/3/4 dessa história são
MOB-07 (registro OneSignal, push ponta a ponta, deep link) — fora desta
rodada.
**Diff range**: `8180528..HEAD` (branch `claude/proxima-funcionalidade-mobile-kpc54g`)
**Verifier**: independent sub-agent (author ≠ verifier) — fresh-eyes, não
participou da implementação.

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1: `(tabs)/_layout.tsx` — introduz Tabs, move Escala | ✅ Done | `git diff` confirma rename puro `app/index.tsx` → `app/(tabs)/index.tsx` (similarity 96%), única mudança são os imports relativos (`../lib` → `../../lib`); zero mudança de comportamento. |
| T2: Tipos `Post`/`PostsPage` | ✅ Done | `apps/mobile/src/lib/content/types.ts` — bate com o Data Models do `design.md` (Rodada 3). |
| T3: `ContentClient — getPosts` | ✅ Done | `apps/mobile/src/lib/content/content-client.ts` — wrapper fino sobre `authenticatedRequest`, mesmo padrão de `escala-client.ts`. |
| T4: Tela Conteúdo — lista, vazio, erro, carregar mais | ✅ Done | `apps/mobile/src/app/(tabs)/conteudo.tsx` — placeholder de T1 substituído pela tela real; commit `f323b1e`. |

Todos os 4 commits do range (`bfd77e0`, `14c06dd`, `347a8d9`, `561ae6a`,
`f323b1e` — 5 commits para 4 tasks, o primeiro é o `docs(specs)` de
design+tasks) correspondem 1:1 ao `tasks.md`. Nenhuma task bloqueada ou
parcial.

---

## Spec-Anchored Acceptance Criteria

### P1: Conteúdos e Notificações — AC2

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| -------------------------- | --------------------- | ------------------------ | ------ |
| WHEN o usuário abre a aba "Conteúdo" THEN o app SHALL listar os posts publicados | Posts da página 1 (`GET /content/posts`) renderizados na tela | `apps/mobile/src/app/(tabs)/conteudo.test.tsx:22-33` — `expect(screen.getByTestId("post-p1")).toBeTruthy()` + `expect(mockGetPosts).toHaveBeenCalledWith(1, 20)` | ✅ PASS |
| ...lista vazia (outcome não literal na spec, decidido no `design.md` Rodada 3) | Estado vazio explícito, distinto de erro | `apps/mobile/src/app/(tabs)/conteudo.test.tsx:35-46` — `expect(screen.getByTestId("conteudo-empty")).toBeTruthy()` + `expect(screen.queryByTestId("conteudo-error")).toBeNull()` | ⚠️ Spec-precision gap (decidido no design.md desta rodada, não na spec original) — tratado como critério de aceite operacional per instrução; teste bate exatamente com o que o design decidiu. |
| ...erro de rede no load inicial (Edge Case da spec, ver abaixo) | Estado de erro visível, distinto de lista vazia | `apps/mobile/src/app/(tabs)/conteudo.test.tsx:48-60` — `expect(screen.getByTestId("conteudo-error")).toBeTruthy()` + `queryByTestId("conteudo-list")`/`("conteudo-empty")` ambos `null` | ✅ PASS |
| ..."carregar mais" concatena sem perder os já carregados (decidido no design.md Rodada 3, Tech Decisions) | Página 2 concatenada à página 1, request com `page=2&limit=20` | `apps/mobile/src/app/(tabs)/conteudo.test.tsx:62-83` — `expect(screen.getByTestId("post-p2")).toBeTruthy()` + `expect(screen.getByTestId("post-p1")).toBeTruthy()` (ambos presentes) + `expect(mockGetPosts).toHaveBeenNthCalledWith(2, 2, 20)` | ⚠️ Spec-precision gap (decisão de design, spec original não especifica paginação) — mesma ressalva acima; teste é preciso e não-raso. |
| ..."carregar mais" falha não limpa a lista (design.md, Error Handling Strategy) | Posts já carregados continuam visíveis; erro pontual visível | `apps/mobile/src/app/(tabs)/conteudo.test.tsx:85-103` — `expect(screen.getByTestId("load-more-error")).toBeTruthy()` + `expect(screen.getByTestId("post-p1")).toBeTruthy()` | ⚠️ Spec-precision gap (mesma origem — design, não spec.md original) |
| `ContentClient.getPosts` monta path/query corretamente (base de AC2) | `GET /content/posts` sem query por default; `?page=2&limit=10` quando informado | `apps/mobile/src/lib/content/content-client.test.ts:17-31` — `expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/content/posts")` e `...toHaveBeenCalledWith("get", "/content/posts?page=2&limit=10")` | ✅ PASS |

**Nota sobre "segmentos de audiência"**: a redação literal do AC2 na spec
diz "listar os posts publicados **visíveis para os segmentos de
audiência do usuário**". O `design.md` desta rodada (seção "Achado
importante — segmentação de audiência não filtra a listagem") documenta
que a rota `GET /content/posts` não filtra por segmento — só por
`published_at IS NOT NULL` — e que isso foi **confirmado com o usuário**
como comportamento pretendido (replicar exatamente o que `apps/web` já
faz contra a mesma rota; segmento é conceito só de push/MOB-07, não de
feed). A implementação (`ContentClient.getPosts` sem nenhum parâmetro de
segmento) é fiel a essa decisão documentada — mas ela é, na letra, um
desvio do texto do AC2 original. Isso não é um gap de teste (o teste
prova exatamente o que foi decidido); é uma nota para quem ler só o
`spec.md` sem o `design.md` — a spec.md em si não foi atualizada para
refletir a decisão. Marcado como spec-precision gap, não como falha,
seguindo a instrução desta rodada de tratar decisões do `design.md` como
parte do critério de aceite operacional.

**Status**: ✅ Todos os outcomes com evidência real (`file:line` +
assertion não-rasa). 3 spec-precision gaps flagged — todos rastreáveis a
decisões explícitas e confirmadas no `design.md` desta rodada, nenhum é
comportamento não-especificado silenciosamente aceito.

---

## Edge Cases (spec.md)

| Edge Case | Aplica a esta rodada? | Resultado |
| --------- | ---------------------- | --------- |
| WHEN o dispositivo está sem internet ao abrir o app THEN o app SHALL mostrar estado de erro de rede claro (não tela vazia interpretável como "sem dado") | Sim — mesmo princípio já usado em Escala (Rodada 2) | ✅ Coberto — `conteudo.test.tsx:48-60` prova que o erro de rede no load inicial produz `conteudo-error` e que nem `conteudo-list` nem `conteudo-empty` aparecem simultaneamente — não há ambiguidade entre "erro" e "lista vazia". |
| WHEN o usuário não tem papel suficiente para um módulo THEN o app SHALL ocultar a aba, nunca lista vazia como "nada cadastrado" | Não — aba Conteúdo é `member`-wide (`ALL_ROLES` inclui `member`, per `design.md`); não há papel insuficiente possível para esta rota | N/A — fora do escopo de teste desta rodada, consistente com o achado do design.md |
| Demais edge cases (conta desativada, push de post despublicado, refresh concorrente) | Não — pertencem a MOB-01/02 (já verificados) ou MOB-07 (push, fora de escopo) | N/A |

---

## Gate Check

- **Gate command (Full)**: `npm run test -w orbien-mobile` && `npm run build:mobile` && `turbo run lint --filter=orbien-mobile` — todos rodados a partir da raiz (`/home/user/orbien`), como a instrução desta rodada exigiu.
- **`npm run test -w orbien-mobile`**: 16 test suites, **75/75 testes passaram**, 0 falhas.
- **`npm run build:mobile -- --force`** (bypass de cache para confirmar execução real, não hit de cache): `tsc --noEmit` limpo, 0 erros.
- **`turbo run lint --filter=orbien-mobile --force`**: **0 erros**, 34 warnings — todos pré-existentes em padrões já presentes no restante da base (`@typescript-eslint/no-redeclare` em `screen`/`Text` globais do RN, `import/first` em mocks antes de import, `@typescript-eslint/array-type` em `auth-client.ts` que não foi tocado nesta rodada). Nenhum warning novo introduzido pelos arquivos desta rodada além dos mesmos padrões (`(tabs)/_layout.test.tsx`, `(tabs)/conteudo.test.tsx`, `(tabs)/index.test.tsx` têm os mesmos 2 warnings estruturais que todo `*.test.tsx` do repo já carrega).
- **Test count antes da feature** (checkout `8180528` em worktree descartável): 13 suites, **66 testes**.
- **Test count depois da feature**: 16 suites, **75 testes**.
- **Delta**: **+9 testes** (1 `_layout.test.tsx` + 5 `conteudo.test.tsx` + 3 `content-client.test.ts`), nenhum teste removido ou enfraquecido — `(tabs)/index.test.tsx` (Escala movida) preserva as 6 asserções originais de `index.test.tsx`, só path/import mudou (confirmado por `git diff`, similarity 98%).
- **Skipped tests**: nenhum.
- **Failures**: nenhuma.

---

## Discrimination Sensor

Sensor rodado em `git worktree add` descartável (`/tmp/.../mob06-sensor`,
checkout de `HEAD`/`f323b1e`), `node_modules` de cada workspace
symlinkado do repo real para evitar reinstalação; destruído com
`git worktree remove --force` ao final. A working tree real nunca foi
tocada.

| # | File:line | Mutação | Killed? |
| - | --------- | ------- | ------- |
| 1 | `apps/mobile/src/app/(tabs)/conteudo.tsx:72` | `const hasMore = posts !== null && page * LIMIT < total;` → `const hasMore = false;` (nunca mostra "Carregar mais") | ✅ Killed — 2 testes falharam (`load-more-button` nunca aparece: os testes de concatenação de página 2 e de erro pontual em "carregar mais" quebram, pois ambos dependem do botão existir). |
| 2 | `apps/mobile/src/app/(tabs)/conteudo.tsx:48` | `setPosts((current) => (current ?? []).concat(result.data))` → `setPosts(result.data)` (substitui em vez de concatenar) | ✅ Killed — 1 teste falhou (`post-p1` não é mais encontrado após "carregar mais": a asserção `expect(screen.getByTestId("post-p1")).toBeTruthy()` que prova concatenação, não substituição, falha). |
| 3 | `apps/mobile/src/lib/content/content-client.ts:17` | `` `/content/posts${query ? ...}` `` → `` `/content/posts-x${query ? ...}` `` (path errado) | ✅ Killed — 2 testes falharam (ambas as asserções de path exato `toHaveBeenCalledWith("get", "/content/posts...")` quebram). |

**Sensor depth**: lightweight (3 mutações, padrão de feature P1 não-crítica).
**Result**: 3/3 killed — ✅ PASS. As suítes cobrem de fato o comportamento
novo, não só a existência de asserção.

---

## Code Quality

| Check | Pass? |
| ----- | ----- |
| No features beyond what was asked | ✅ — `(tabs)/_layout.tsx` tem só 2 abas (Escala, Conteúdo) com `title`, nenhum ícone/estilo elaborado, nenhuma tela extra. `conteudo.tsx` não tem nada além de lista/vazio/erro/carregar-mais (nenhum pull-to-refresh, filtro, busca — não pedidos). |
| No abstractions for single-use code | ✅ — `ContentClient` é uma função (`getPosts`), não uma classe/factory desnecessária; `types.ts` são interfaces puras sem generics não usados. |
| No unnecessary "flexibility" added | ✅ — `LIMIT` é uma constante fixa (20), sem prop de configuração não pedida. |
| Only touched files required for task | ✅ — `git diff --name-only` lista exatamente os arquivos de T1-T4 + os 3 docs de `.specs/`; nenhum arquivo de outro app (`web`/`api`/`admin`/`site`) tocado; `package.json`/`package-lock.json` sem diff (nenhuma dependência nova — `expo-router/js-tabs` já vem do `expo-router` existente). |
| Didn't "improve" unrelated code | ✅ — o move de `index.tsx` só ajustou os 3 imports relativos que o novo caminho exige; nenhuma linha de lógica da tela Escala foi tocada. |
| Matches existing patterns/style | ✅ — `conteudo.tsx` replica byte-a-byte o padrão de `(tabs)/index.tsx` (Rodada 2): `useEffect` no mount com `cancelled` flag, `View testID="...-error"` para erro, `FlatList` com `testID`, mensagens de erro como `const` no topo do arquivo. |
| Would senior engineer approve? | ✅ |
| Tests map to acceptance criteria and are non-shallow (spot-check one story) | ✅ — spot-checked "carregar mais" concatena: a asserção prova concatenação por checar que `post-p1` (página 1) *continua* presente após carregar a página 2, não só que `post-p2` apareceu — não é um teste raso que passaria com substituição. Confirmado empiricamente pela Mutação 2 acima. |
| Spec-anchored outcome check (asserted values match spec) | ✅ — ver tabela acima; 3 itens marcados como spec-precision gap (decisão do design.md, não da spec.md original), nenhum FAIL. |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ — `ContentClient` (domain) tem 1:1 com o Test Coverage Matrix do `tasks.md` (path sem query, path com query, retorno); tela (component) cobre caminho feliz + vazio + erro + carregar-mais + erro de carregar-mais, batendo exatamente com o Test Coverage Matrix de `tasks.md` linha "`(tabs)/conteudo.tsx`". |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — todos os 9 testes novos mapeiam a uma linha do Test Coverage Matrix (`tasks.md`, Rodada 3) ou ao Done-when de T1/T3/T4; nenhum teste órfão encontrado. |
| Documented guidelines followed | ✅ — `apps/mobile/AGENTS.md` (Expo mudou de versão — código usa `expo-router/js-tabs`, não `expo-router`, com comentário explícito no `_layout.tsx` citando o motivo); `CLAUDE.md` raiz (branch já existia da rodada, commits atômicos por task, 1 commit por task exceto T2+T3 que compartilham commit `docs(specs)`... na verdade cada task tem seu próprio commit: `14c06dd`=T1, `347a8d9`=T2, `561ae6a`=T3, `f323b1e`=T4 — 1:1). |

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ----------- |
| MOB-06 | In Tasks | ✅ Verified |

(Aplicado em `spec.md` por este Verifier — ver commit/edit desta rodada.)

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 6/6 outcomes com evidência real; 3 spec-precision
gaps flagged (todos rastreáveis a decisões explícitas do `design.md`
desta rodada — paginação/estado vazio/carregar-mais não estavam
detalhados na spec original, conforme já esperado pela instrução desta
rodada).
**Sensor**: 3/3 mutações mortas.
**Gate**: 75/75 testes passaram (+9 novos, 0 removidos/enfraquecidos),
build limpo, lint 0 erros.

**What works**: tab bar introduzida sem regressão na tela Escala (move
puro, testes originais intactos); `ContentClient.getPosts` monta
path/query corretamente; tela Conteúdo cobre os 4 estados exigidos
(lista, vazio, erro, carregar mais) com separação clara entre "erro" e
"lista vazia" — mesmo princípio já estabelecido nas rodadas anteriores.

**Issues found**: nenhum. A única nota é a divergência entre a redação
literal do AC2 ("visíveis para os segmentos de audiência") e o
comportamento implementado (sem filtro de segmento na listagem) — mas
essa divergência é uma decisão de produto documentada e confirmada no
`design.md` desta rodada, não um gap de implementação. Recomendação não-
bloqueante: considerar atualizar a redação do AC2 em `spec.md` numa
próxima revisão para refletir a decisão já tomada, evitando que um
leitor futuro do `spec.md` isolado (sem o `design.md`) presuma
filtragem por segmento que não existe.

**Next steps**: nenhum fix task necessário. MOB-06 pode ser marcado
✅ Verified na tabela de Requirement Traceability.

---

# App Mobile Validation — Rodada 4 (MOB-07)

**Date**: 2026-09-08
**Spec**: `.specs/features/app-mobile/spec.md`, história "P1: Conteúdos e
Notificações" — AC1, AC3, AC4 (AC2 é MOB-06, já verificado na Rodada 3).
**Design/Tasks**: `.specs/features/app-mobile/design.md` § "Rodada 4 —
MOB-07"; `.specs/features/app-mobile/tasks.md` § "Rodada 4 — Tasks: MOB-07"
(T1-T8).
**Diff range**: `2ba2a95..HEAD` (9 commits — do commit de docs até
`b9044ae`).
**Verifier**: independent sub-agent (author ≠ verifier).

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1 — `PostsService.findOne` filtra rascunho para member | ✅ Done | Commit `1e073f1`. Implementação bate com o design; **porém quebrou um teste pré-existente não coberto pela task** (`posts.controller.spec.ts:97`) — ver Gate Check. |
| T2 — `decodeJwtPayload` | ✅ Done | Commit `558bad0`. |
| T3 — SDK OneSignal + config plugin | ✅ Done | Commit `f9540c0`. `plugins` é o primeiro item do array, conforme exigência do plugin. |
| T4 — `onesignal-client` | ✅ Done | Commit `e6aca25`. |
| T5 — `NotificationsProvider` + wiring | ✅ Done | Commit `64049bd`. Wiring em `_layout.tsx` confere: dentro de `AuthGate`, envolvendo `ThemeProvider`. |
| T6 — `ContentClient.getPost` | ✅ Done | Commit `ee2253d`. |
| T7 — Tela "Post" | ✅ Done | Commit `06a5fd1`. |
| T8 — Item da lista navega para o post | ✅ Done | Commit `b9044ae`. |

Todas as 8 tasks têm commit atômico correspondente, na ordem das fases do
`tasks.md` (Phase 1→4). Nenhuma task parcial ou bloqueada.

---

## Spec-Anchored Acceptance Criteria

### P1: Conteúdos e Notificações

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion expression | Result |
| --- | --- | --- | --- |
| AC1: app inicializa após login THEN registra dispositivo no OneSignal com `external_id` = id da pessoa autenticada | `OneSignal.login(sub)` chamado com o `sub` do JWT | `apps/mobile/src/lib/notifications/onesignal-client.ts:38` — `OneSignal.login(payload.sub)`; testado em `apps/mobile/src/lib/notifications/onesignal-client.test.ts:64-81` — `expect(mockLogin).toHaveBeenCalledWith("user-1")` | ✅ PASS |
| AC1 (tags de segmentação, decisão do design.md — não literal da spec mas necessária para a spec funcionar): `tenant_id`/`congregation_id`/`role` gravados como tags | `OneSignal.User.addTags({tenant_id, congregation_id, role: roles[0]})` | `apps/mobile/src/lib/notifications/onesignal-client.ts:39-43`; testado em `onesignal-client.test.ts:76-80` — `expect(mockAddTags).toHaveBeenCalledWith({tenant_id: "tenant-1", congregation_id: "cong-1", role: "member"})` (token com `roles: ["member","volunteer"]` → só o primeiro papel, conforme design.md Risks & Concerns — **decisão registrada, não gap**) | ✅ PASS |
| AC1 (wiring: registro ocorre "após login", ligado à sessão) | `registerDevice` chamado quando `session` passa de `null` para um objeto; `unregisterDevice` no de-registro | `apps/mobile/src/lib/notifications/notifications-provider.tsx:37-41`; testado em `notifications-provider.test.tsx:54-68` (registra) e `:84-100` (de-registra, via desmonte do provider — ver nota abaixo) | ✅ PASS (com nota) |
| AC3: post publicado + dispositivo no segmento THEN push chega (ponta a ponta) | Backend já dispara (`notifications.service.ts`, pré-existente); app só precisa estar registrado com as tags certas — **não há novo código de "recebimento" a testar no app**, é infra do SO/OneSignal | Coberto indiretamente por AC1 (registro correto é a única responsabilidade do app aqui) — nenhuma nova asserção a fazer além do já citado em AC1. Teste real end-to-end (device físico) está fora do alcance deste Verifier (ambiente sem device/simulador); tratado como ⚠️ abaixo. | ⚠️ Spec-precision gap (não testável neste ambiente — ver nota) |
| AC4: usuário toca numa push THEN app abre diretamente o post relacionado, não a lista | `router.push('/post/'+postId)` chamado com o `post_id` do payload da notificação | `apps/mobile/src/lib/notifications/onesignal-client.ts:67-77` (extrai `post_id`) + `notifications-provider.tsx:23-27` (`router.push(\`/post/${postId}\`)`); testado ponta a ponta em `notifications-provider.test.tsx:102-117` — `expect(mockPush).toHaveBeenCalledWith("/post/post-1")` — e a tela de destino (`app/post/[id].tsx`) existe e renderiza o post carregado (`__tests__/app/post/[id].test.tsx:21-40`) | ✅ PASS |
| Edge Case (spec.md): post despublicado entre disparo e toque THEN app mostra "não encontrado" | Tela mostra "Post não encontrado.", não trava | `apps/api/src/content/posts.service.ts:108-124` (`findOne` filtra `published_at: {not: null}` quando `isMember`) — confirmado com **teste real rodado** (não só leitura): `apps/api/src/content/posts.service.spec.ts:210-223` PASSOU isoladamente (`npx jest posts.service.spec.ts` → 24/25 passed, a 1 falha é de outro describe, ver Gate Check); `apps/mobile/src/app/post/[id].tsx:34-36` mapeia 404→"Post não encontrado."; testado em `apps/mobile/src/__tests__/app/post/[id].test.tsx:42-52` — `expect(screen.getByText("Post não encontrado.")).toBeTruthy()`, PASSOU | ✅ PASS |

**Nota sobre AC3**: a spec pede o fluxo ponta a ponta observável em
device físico/simulador ("Independent Test: publicar um post... confirmar
que a push chega no device"). Este Verifier rodou apenas testes
automatizados (sem device/simulador disponível no ambiente) — o registro
de dispositivo (AC1) e o disparo do backend (pré-existente, fora do
diff desta rodada) estão cada um cobertos por teste automatizado, mas a
integração real "push chega no aparelho" não foi exercida por este
Verifier. Marcado como spec-precision gap por falta de meio de teste, não
como falha de implementação — consistente com o próprio texto do AC3
("o app só precisa estar registrado e tratar o toque", que são AC1/AC4,
ambos cobertos).

**Nota sobre a linha "AC1 (wiring)"**: o `tasks.md` (T5, Done-when) pede
um teste em que "sessão some (`session` muda para `null`)" dispara
`unregisterDevice`. O teste real (`notifications-provider.test.tsx:84-100`)
exercita esse mesmo caminho de código (a cleanup function do
`useEffect([session])`) via desmontagem do componente, não via
re-render com `session: null` mantendo o componente montado. Como o
próprio `notifications-provider.tsx` documenta em comentário (linhas
30-36), o `AuthGate` real sempre desmonta o provider quando a sessão
some (nunca re-renderiza com `session: null` mantendo-o montado) — então
o teste cobre o caminho que de fato acontece em produção. Não é um gap:
é uma interpretação levemente diferente, mas equivalente em cobertura,
do Done-when literal.

**Status**: ⚠️ 5/6 outcomes com evidência real e PASS; 1 spec-precision
gap (AC3, sem device disponível neste ambiente — cobertura indireta via
AC1 é real e testada).

---

## Discrimination Sensor

Executado em `git worktree` descartável (`/tmp/.../mob07-mutant-wt`,
`node_modules` linkado por symlink a partir do repo real só para rodar os
testes — nenhuma escrita na árvore de trabalho real). Removido com
`git worktree remove --force` ao final; `git status` confirmou árvore
real limpa antes e depois.

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `apps/mobile/src/lib/notifications/onesignal-client.ts:42` | Trocado `role: payload.roles[0] ?? ""` por valor fixo `role: "admin_congregation"` | ✅ Killed — `onesignal-client.test.ts` (1 falha: `registerDevice › chama login com o sub e addTags...`) |
| 2 | `apps/api/src/content/posts.service.ts:114` | Removida a condição real de `isMember` em `findOne` (`const isMember = false;` — nunca filtra rascunho) | ✅ Killed — `posts.service.spec.ts` (1 falha: `findOne › membro comum recebe NotFoundException para post despublicado`) |
| 3 | `apps/mobile/src/app/post/[id].tsx:35` | Trocado `err.status === 404` por `err.status === 500` na checagem que decide "Post não encontrado" | ✅ Killed — `[id].test.tsx` (1 falha: `404: mostra 'Post não encontrado', sem travar`) |

**Sensor depth**: lightweight (3 mutações, proporcional ao risco — cobre
o AC1/tag, o Edge Case do backend e o Edge Case do app, os três pontos
de maior risco comportamental desta rodada).
**Result**: 3/3 killed — ✅ PASS. Os testes desta rodada discriminam de
verdade as três mudanças de comportamento mais arriscadas.

---

## Code Quality

| Check | Pass? |
| --- | --- |
| No features beyond what was asked | ✅ — escopo bate com T1-T8 |
| No abstractions for single-use code | ✅ — `onesignal-client.ts` centraliza o SDK (mesmo princípio de `auth-client.ts`), não introduz camada nova |
| No unnecessary "flexibility" added | ✅ |
| Only touched files required for task | ✅ — 24 arquivos no diff, todos rastreáveis a alguma task (T1-T8) ou aos docs da própria rodada |
| Didn't "improve" unrelated code | ✅ |
| Matches existing patterns/style | ✅ — `NotificationsProvider` segue a forma de `theme-provider.tsx`; `jwt.ts` segue o mesmo algoritmo de `apps/web/src/lib/auth.ts`; tela Post segue o padrão de erro/loading das telas anteriores |
| Would senior engineer approve? | ⚠️ — sim, com uma ressalva: T1 alterou a assinatura de `PostsController.findOne` sem atualizar o teste pré-existente que fixava a chamada antiga (`posts.controller.spec.ts:97`), quebrando o gate. O `tasks.md` previu isso ("já coberto por e2e/spec existente se houver") mas a previsão estava errada — havia spec existente, e ele não foi ajustado. |
| Tests map to acceptance criteria and are non-shallow (spot-check one story) | ✅ — spot-check em `onesignal-client.test.ts`: asserções são sobre valores exatos (`sub`, tags), não só "foi chamado" |
| Spec-anchored outcome check (asserted values match spec) | ✅ — ver tabela acima |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ — `findOne` (domínio) tem os 2 branches (member/não-member) cobertos; tela Post (rota) cobre happy+404+erro de rede |
| Every test maps to a spec requirement — no unclaimed tests | ✅ |
| Documented guidelines followed | `apps/mobile/AGENTS.md` (Expo docs versionados) — sem uso de API nova do Expo nesta rodada além do já existente; `CLAUDE.md` raiz (branch antes de editar, install pela raiz) — ambos seguidos |

❌ **Um "No" real**: o item "Would senior engineer approve?" tem
ressalva — a tabela de Gate Check abaixo detalha o teste pré-existente
quebrado.

---

## Edge Cases

- [x] "post despublicado entre disparo e toque → app mostra 'não
  encontrado'": handled correctly — confirmado com teste real rodado
  (`posts.service.spec.ts` + `[id].test.tsx`), não só leitura de código.
- [x] "toque na push abre o post, não a lista": handled correctly —
  `onNotificationClick` → `router.push` → `app/post/[id].tsx`, fluxo
  completo confirmado por teste (`notifications-provider.test.tsx`).

---

## Gate Check

- **Gate command (mobile)**: `npm run test -w orbien-mobile` &&
  `npx tsc --noEmit` && `npx eslint .` (rodados em `apps/mobile`)
- **Resultado (mobile)**: ✅ 101/101 testes passaram (20 suites), `tsc
  --noEmit` sem erros, `eslint .` 0 erros / 41 warnings (todos
  pré-existentes — `no-redeclare` em `screen`/`Text` e `import/first`,
  mesmo padrão de todas as rodadas anteriores, nenhum novo introduzido
  por esta rodada além dos arquivos novos seguirem o mesmo padrão)
- **Gate command (backend)**: `npm run test -w orbien-backend -- content`
  (equivalente a `posts.service.spec.ts posts.controller`, ajustado
  porque o nome literal do arquivo do controller é
  `posts.controller.spec.ts`)
- **Resultado (backend)**: ❌ **1 falha em 128 testes** (`content`
  project) — `posts.controller.spec.ts:97`, teste `findOne delega ao
  service`, esperava `service.findOne` chamado com 3 argumentos
  (`'t1', 'g1', 'p1'`); T1 mudou o controller para passar `user.roles`
  como 4º argumento (correto, conforme design.md), mas este teste
  pré-existente (de uma rodada anterior, fora do diff desta rodada) não
  foi atualizado para refletir a nova assinatura. **Isso é uma
  regressão real de gate, não um "gap de spec"**: o comando de gate que
  o próprio `tasks.md` desta rodada define (T1, Done-when: "Gate check
  passa: `npm run test -w orbien-backend`") não passa hoje.
- **Test count before feature (mobile)**: 78 — **medido diretamente**,
  rodando `npm run test -w orbien-mobile` num `git worktree` descartável
  no commit `2ba2a95` (início do diff range), depois removido
  (`git worktree remove --force`; `git stash` evitado de propósito, é
  operação global e foi bloqueado pelo classificador de permissões ao
  ser tentado por engano — a árvore de trabalho real nunca foi tocada,
  confirmado por `git status --short` antes/depois)
- **Test count after feature (mobile)**: 101 (medido, seção Gate acima)
- **Delta (mobile)**: +23 novos testes, 0 removidos/enfraquecidos
- **Test count before feature (backend, `content` project)**: 126 —
  medido no mesmo worktree do commit `2ba2a95`
- **Test count after feature (backend, `content` project)**: 128 (127
  passando + 1 falhando — ver Failures abaixo)
- **Delta (backend, `content`)**: +2 novos testes (os dois cenários de
  `findOne`/member em `posts.service.spec.ts`), 0 removidos
- **Skipped tests**: nenhum
- **Failures**: `apps/api/src/content/posts.controller.spec.ts:97` —
  `findOne delega ao service` espera
  `service.findOne` chamado com `('t1', 'g1', 'p1')`, recebe
  `('t1', 'g1', 'p1', ['admin_congregation'])`. Root cause: T1 mudou a
  assinatura de chamada no controller (correto e intencional, conforme
  design.md) mas não atualizou este teste pré-existente. Fix é
  mecânico (uma linha: adicionar `USER.roles` à expectativa), mas está
  fora do meu mandato como Verifier corrigir — reportado como gap.

---

## Fix Plans (if issues found)

### Fix 1: Teste pré-existente do controller não reflete a nova assinatura de `findOne`

- **Root cause**: T1 (`design.md`/`tasks.md`, Rodada 4) mudou
  `PostsController.findOne` para passar `user.roles` como 4º argumento
  a `PostsService.findOne` (mudança correta e intencional — é o que
  faz o Edge Case funcionar). O `tasks.md` assumiu "já coberto por
  e2e/spec existente se houver; mudança de 1 linha" e não previu
  atualizar `posts.controller.spec.ts:97`, que fixa a chamada com 3
  argumentos.
- **Fix task**: em `apps/api/src/content/posts.controller.spec.ts:97`,
  trocar `expect(service.findOne).toHaveBeenCalledWith('t1', 'g1',
  'p1')` por `expect(service.findOne).toHaveBeenCalledWith('t1', 'g1',
  'p1', USER.roles)` (ou o valor literal de `USER.roles` já definido no
  topo do arquivo).
- **Priority**: Blocker — é o próprio gate check que a task definiu
  (`npm run test -w orbien-backend`) e ele não passa hoje.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| MOB-07 | Implementing | ❌ Needs Fix — gate do backend falha (`posts.controller.spec.ts:97`); todos os ACs (AC1/AC4/Edge Case) têm evidência real e passam quando testados isoladamente, mas o gate check formal da task T1 não passa hoje |

---

## Summary

**Overall**: ⚠️ Issues — implementação e cobertura de AC estão corretas
e comprovadas por teste real; a única pendência é um teste pré-existente
não atualizado, que quebra o gate formal do backend.

**Spec-anchored check**: 5/6 outcomes com evidência real e PASS; 1
spec-precision gap (AC3, sem device/simulador disponível neste
ambiente — mitigado pela cobertura real de AC1, que é o que o app
controla).
**Sensor**: 3/3 mutações mortas.
**Gate**: mobile 101/101 passou, `tsc`/`eslint` limpos; backend 127/128
passou (1 falha, ver Fix 1).

**What works**: registro de dispositivo com `external_id` + tags
(`tenant_id`/`congregation_id`/`role`, limitação de papel único
documentada e aceita); wiring completo do clique-em-push até a tela de
detalhe (`onNotificationClick` → `router.push` → `app/post/[id].tsx`);
o Edge Case mais crítico da spec (post despublicado → "não encontrado")
tem correção real no backend, testada e confirmada por teste rodado,
não só lido; item da lista de Conteúdo agora navega para o mesmo
destino da push, sem duplicar lógica.

**Issues found**: 1 (Fix 1 acima) — `posts.controller.spec.ts:97`
desatualizado depois de T1 mudar a assinatura de `findOne` no
controller. Fix é de uma linha, mecânico, sem ambiguidade de root
cause.

**Next steps**: rodar Fix 1 (fora do mandato deste Verifier — reportado
para quem orquestra decidir corrigir agora ou registrar como pendência
conhecida) e então re-rodar `npm run test -w orbien-backend` para
confirmar 128/128 antes de marcar MOB-07 como ✅ Verified na tabela de
Requirement Traceability do `spec.md`.

---

## Fix 1 — Aplicado

`posts.controller.spec.ts:97` atualizado para
`expect(service.findOne).toHaveBeenCalledWith('t1', 'g1', 'p1', USER.roles)`,
mesmo fix mecânico de uma linha apontado acima — commit `0568697`.
Re-rodado `npm run test -w orbien-backend` (216 suites, 2006 testes) e
`npm run test -w orbien-mobile` (20 suites, 101 testes): **todos
passando**, gate formal de T1 (tasks.md) agora satisfeito.

**Overall (atualizado)**: ✅ Ready — os 6 outcomes do Spec-Anchored
Check continuam válidos (5 PASS + 1 spec-precision gap documentado em
AC3, que depende de device/simulador fora deste ambiente), o sensor de
mutação seguiu 3/3 morto (a mudança em Fix 1 é só a expectativa do
teste, não muda o comportamento mutado), e o gate agora passa nas duas
apps. `spec.md` (Requirement Traceability) atualizado para MOB-07 ✅
Verified.
