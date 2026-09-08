# App Mobile Validation (MOB-01, MOB-02, MOB-03, MOB-11, MOB-12)

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
