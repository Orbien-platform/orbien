# App Mobile Validation (MOB-01, MOB-02, MOB-03, MOB-11, MOB-12)

**Date**: 2026-09-08
**Spec**: `.specs/features/app-mobile/spec.md`
**Diff range**: `5595981..b3a25c5` (i.e. `91ba6dc^..b3a25c5`), path `apps/mobile`, root `package.json`/`package-lock.json`, `.specs/features/app-mobile/**`, `.specs/STATE.md`
**Verifier**: independent sub-agent (author ≠ verifier). Ran from a dedicated
worktree (`/home/user/orbien/.claude/worktrees/agent-a1dbe68cb90c61d8d`,
branch `verifier/app-mobile-mob-01-02-03-11-12`, checked out at `b3a25c5`,
the tip of `apps/mobile`'s history at validation time).

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | Workspace scaffold present, builds, no lockfile in `apps/mobile`. |
| T2   | ✅ Done | Expo Router + jest-expo configured; `@testing-library/jest-native` intentionally dropped (documented `SPEC_DEVIATION`, no coverage impact — `@testing-library/react-native@14` embeds the matchers). |
| T3   | ✅ Done | `dev:mobile`/`build:mobile` in root `package.json`; `turbo run lint --filter=orbien-mobile` runs. |
| T4   | ✅ Done | `apps/mobile/eslint.config.mjs` present, `typescript-eslint` recommended + `eslint-config-expo`, `no-unused-vars` with `argsIgnorePattern: "^_"`. |
| T5   | ✅ Done | `apps/mobile/app.config.js` dynamic, resolves Orbien defaults with no env set. |
| T6   | ✅ Done | `apps/mobile/eas.json` — `development`/`preview`/`production` all `extends: "generic"`; `README.md` documents build profiles. |
| T7   | ✅ Done | `no-hardcoded-identity.test.ts` greps all of `src/` (generic, not case-specific) against the 4 resolved identity literals. |
| T8   | ✅ Done | `types.ts` (auth, theme) match `design.md` Data Models exactly. |
| T9   | ✅ Done | `ApiClient` implemented; `NetworkError`/`HttpError` contract tested. **Note**: does not itself intercept 401 (see Gap 1 below) — that is on AuthClient/ApiClient boundary, tracked as design intent in `design.md` but never wired. |
| T10  | ✅ Done | `login`/`logout`/`getSession` implemented and tested (AC1, AC2, AC5). |
| T11  | ✅ Done (mechanism), ⚠️ **not integrated** | `getValidAccessToken` (serialized refresh queue) is implemented correctly and its own unit tests are strong (concurrency + failure paths both proven) — but the function is never called from any production code path (see Gap 1). |
| T12  | ✅ Done | `AuthProvider` hydration + status transitions tested. |
| T13  | ✅ Done | Login screen, generic error message tested against 3 distinct simulated causes. |
| T14  | ✅ Done | Root layout guard (`loading`/`unauthenticated`/`authenticated`) tested. |
| T15  | ✅ Done | `ThemeProvider` — cache-before-network (delay-controlled promise), fallback-on-null-branding, fallback-on-network-error, all with real component tests. |
| T16  | ✅ Done | Two-tenant wiring test in `_layout.test.tsx` proves distinct header color/logo per branding payload. |

Note: `tasks.md` itself still shows the per-task `Done when` checkboxes as
unticked (`[ ]`) for T8–T16 even though `Status` says ✅ Done and commits
exist — a documentation inconsistency in `tasks.md`, not a code gap (I
independently re-derived each checkbox from the actual test files above).

---

## Spec-Anchored Acceptance Criteria

### P1: Autenticação e sessão

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: credenciais corretas → autentica, grava tokens no SecureStore, navega para tela inicial | `POST /auth/login` chamado com `{tenant_slug, email, password}`; `Session` gravada via `SecureStore.setItemAsync`; navegação para rota inicial | `apps/mobile/src/lib/auth/auth-client.test.ts:32-56` — `expect(mockPost).toHaveBeenCalledWith("/auth/login", {...})`, `expect(mockSetItemAsync).toHaveBeenCalledWith("orbien.session", ...)`; `apps/mobile/src/app/login.test.tsx:22-35` — `expect(mockReplace).toHaveBeenCalledWith("/")` | ✅ PASS |
| AC2: credenciais erradas → mensagem genérica, sem distinguir motivo | Mesma mensagem de erro para qualquer causa (senha errada, tenant não encontrado, etc. — a API já responde indistinguível) | `apps/mobile/src/app/login.test.tsx:37-56` — `it.each([["senha errada", ...], ["tenant não encontrado", ...], ["erro de rede", ...]])` all assert `expect(screen.getByTestId("login-error").props.children).toBe("Não foi possível entrar. Confira os dados e tente novamente.")` — **genuinely proves the message doesn't vary by cause**, not just a single-case check | ✅ PASS |
| AC3: access token expira em chamada autenticada → dispara exatamente uma renovação (fila serializada) e reenvia a chamada original | Uma única `POST /auth/refresh` disparada por N chamadas concorrentes; a chamada HTTP original é reenviada após sucesso | `apps/mobile/src/lib/auth/refresh-queue.test.ts:50-65` proves `getValidAccessToken()` called twice concurrently triggers `mockPost` once — **but this only tests the isolated `AuthClient` function directly**. Nothing in `apps/mobile/src/lib/api/client.ts` (grepped: zero references to `AuthClient`/`getValidAccessToken`) calls this function, intercepts a 401, or retries a failed request. The only production authenticated call in this round (`ThemeProvider`, `apps/mobile/src/lib/theme/theme-provider.tsx:77`) passes `session.accessToken` raw, bypassing the queue entirely. | ❌ **GAP** (integration) — see Gap 1 |
| AC4: renovação falha (refresh revogado/expirado) → limpa SecureStore e navega para login | `SecureStore` limpo; navegação para `/login` | `apps/mobile/src/lib/auth/refresh-queue.test.ts:67-77` proves `getValidAccessToken()` failure clears `SecureStore` and rejects with `SessionExpiredError` — again, isolated-function-only; no call site in the app ever awaits `getValidAccessToken()` before/around a real request, so a real 401 from an expired/revoked refresh currently surfaces as an unhandled `HttpError`, not a navigate-to-login | ❌ **GAP** (integration) — see Gap 1 |
| AC5: "sair" → chama logout, apaga tokens antes de navegar | `POST /auth/logout` (best-effort) + `SecureStore` limpo mesmo em falha de rede | `apps/mobile/src/lib/auth/auth-client.test.ts:84-108` — success case (`expect(mockPost).toHaveBeenCalledWith("/auth/logout", ...)`, `expect(mockDeleteItemAsync).toHaveBeenCalledWith("orbien.session")`) **and** failure case (`mockPost.mockRejectedValue(new Error("Erro de rede"))` → `expect(logout()).resolves.toBeUndefined()`, `expect(mockDeleteItemAsync).toHaveBeenCalledWith(...)`) — genuinely covers the failure path the spec calls out, not just the happy path | ✅ PASS |

### P1: Tema por tenant (white-label dinâmico)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: login concluído → busca `branding_configs`, aplica cor+logo no shell | `GET /settings` chamado; `primaryColor`/`logoUrl` aplicados no header | `apps/mobile/src/app/_layout.test.tsx:93-115` (tenant A) and `:117-141` (tenant B) — `expect(screen.getByTestId("header-color").props.children).toBe("#111111")`, `expect(screen.getByTestId("header-logo").props.source.uri).toBe("https://a.example/logo.png")` | ✅ PASS |
| AC2: tenant sem branding customizado → tema padrão, sem erro visível | Campos `null` → fallback ao `DEFAULT_THEME`, nenhum estado de erro | `apps/mobile/src/lib/theme/theme-provider.test.tsx:111-132` — `expect(...primaryColor).toBe(DEFAULT_THEME.primaryColor)`; `apps/mobile/src/app/_layout.test.tsx:143-162` — `expect(screen.queryByTestId("header-logo")).toBeNull()`, `expect(screen.getByTestId("header-app-name")).toBeTruthy()`; failure-of-`GET /settings` path also covered at `theme-provider.test.tsx:134-168` and `:170-188` | ✅ PASS |
| AC3: app reaberto com sessão válida → reaplica tema cacheado antes de qualquer chamada de rede completar | Cache lido de `AsyncStorage` e aplicado **antes** de `GET /settings` resolver | `apps/mobile/src/lib/theme/theme-provider.test.tsx:47-109` — uses a **delay-controlled Promise** (`mockGet.mockReturnValue(new Promise((resolve) => { releaseNetwork = resolve; }))`) and asserts the cached values are rendered **before** `releaseNetwork(...)` is ever called — this is a genuine temporal-order proof, not merely "the function was called" | ✅ PASS |

### Infra: Identidade de app configurável (MOB-12)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: identidade (nome, ícone, bundle id/applicationId, scheme) vem de `app.config.js` dinâmico, nunca `app.json` estático | Nenhum `app.json` no workspace; `app.config.js` exporta função | `apps/mobile/app.config.js:26` (`module.exports = ({ config }) => {...}`); confirmed no `apps/mobile/app.json` exists in the tree | ✅ PASS |
| AC2: sem env de tenant setada → resolve identidade genérica Orbien | `name: "Orbien"`, `bundleIdentifier/package: "com.orbien.app"`, `oneSignalAppId` default | `apps/mobile/app.config.test.js:31-42` — `expect(resolved.name).toBe("Orbien")`, `expect(resolved.ios.bundleIdentifier).toBe("com.orbien.app")`, `expect(resolved.extra.oneSignalAppId).toBe("REPLACE_WITH_ONESIGNAL_APP_ID")` | ✅ PASS |
| AC3: novo profile de build não exige mudança em código-fonte fora de `app.config.js`/`eas.json` | `eas.json` profiles só variam `extends`; nenhum código muda | `apps/mobile/eas.json:6-28` — `development`/`preview`/`production` all `"extends": "generic"`, only `generic.env` carries values; `app.config.test.js:44-62` proves the same `app.config.js` responds to arbitrary env without code change | ✅ PASS (design-level; the AC explicitly disclaims implementing a real Premium profile) |
| AC4: código do app referencia identidade só via config resolvida em runtime, nunca literal | Nenhum literal de nome/bundle id/OneSignal app id fora de `app.config.js`/`eas.json`/testes | `apps/mobile/src/lib/config/no-hardcoded-identity.test.ts:63-84` — genuinely generic: recursively walks all of `src/` (excluding `*.test.*`), derives the 4 reference literals from `app.config.js` itself, and fails if **any** new file reintroduces one. Confirmed as a real regression test, not a single hardcoded assertion — this is the exact mechanism the task asked me to scrutinize, and it holds up | ✅ PASS |

**Status**: ⚠️ 2 gaps present (MOB-01 AC3, AC4 — integration, not the isolated mechanism) out of 12 ACs checked; the isolated refresh-queue mechanism and all MOB-03/MOB-12 ACs are solidly covered with precise, spec-matching assertions.

---

## Edge Cases (scoped to MOB-01/02/03/11/12 only)

- [ ] **"duas abas/telas disparam refresh de token ao mesmo tempo → serializa em uma única renovação"**: the underlying mechanism is correct and unit-proven (`refresh-queue.test.ts:50-65`), but nothing in the app currently drives two real concurrent authenticated requests through it (see Gap 1) — **NOT wired**, same root cause as AC3/AC4 above.
- [ ] **"conta desativada no meio de uma sessão → próxima chamada autenticada recebe 401 → app trata como sessão encerrada"**: no code path catches an `HttpError(401)` from a live request and converts it into a `SessionExpiredError`/logout/navigate-to-login. `ApiClient` (`client.ts`) treats 401 identically to any other HTTP error status. **NOT handled** — part of the same integration gap.
- N/A (out of scope for this round, no domain screens/tabs exist yet): "dispositivo sem internet ao abrir o app → estado de erro de rede claro", "papel insuficiente → oculta aba", "push despublicado → estado 'não encontrado'". These require domain screens (MOB-04+), correctly deferred per `spec.md`'s own traceability table.

---

## Discrimination Sensor

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `apps/mobile/src/lib/auth/auth-client.ts:102` | Flipped `if (isRefreshing)` → `if (!isRefreshing)` in the refresh queue | ✅ Killed — `refresh-queue.test.ts` "duas chamadas concorrentes..." and "refresh falha..." both timed out/failed (2 tests failed) |
| 2 | `apps/mobile/src/lib/theme/theme-provider.tsx:86-89` | Changed the `GET /settings` failure handler to reset `theme` to `DEFAULT_THEME` instead of leaving it untouched (violates AC2 "mantém o branding cacheado") | ✅ Killed — `theme-provider.test.tsx` "GET /settings falha (erro de rede)" failed: expected `"#abcdef"`, received `"#1e3a7b"` |
| 3 | `apps/mobile/app.config.js:13` | Changed `DEFAULT_BUNDLE_ID` from `"com.orbien.app"` to `"com.orbien.mutant"` | ✅ Killed — `app.config.test.js` "resolve para a identidade padrão Orbien..." failed: expected `"com.orbien.app"`, received `"com.orbien.mutant"` |

**Sensor depth**: lightweight (default tier — non-payment/non-P0 feature)
**Result**: 3/3 killed — ✅ PASS

All mutations were injected and reverted inside a disposable `git worktree`
(`/tmp/.../scratchpad/mutant-scratch`, created from this worktree's own
`HEAD`, `node_modules` symlinked from this worktree — never `git stash`,
never touching the real tree). The scratch worktree was removed
(`git worktree remove --force`) after the sensor run.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — each file does one thing (client, auth-client, theme-provider, types) |
| Surgical changes | ✅ — diff is entirely inside `apps/mobile`, root `package.json`/`package-lock.json`, and `.specs/**` |
| No scope creep | ✅ — no domain screens (MOB-04+) attempted; `app.config.js`/`eas.json` deliberately single-profile |
| Matches patterns | ✅ — refresh-queue state machine explicitly mirrors `apps/web/src/lib/api.ts:34-64` (isRefreshing/failedQueue); SecureStore vs. AsyncStorage split follows the same sensitive/non-sensitive principle as web's cookie/localStorage split |
| Spec-anchored outcome check | ⚠️ — see Gap 1: the assertions that exist are precise, but two ACs have no assertion at the level the spec actually requires (a real authenticated call triggering the queue) |
| Per-layer Coverage Expectation met | ⚠️ — domain logic (AuthClient/ApiClient) has unit tests, but the *integration* between the two layers the design explicitly calls for is untested because it doesn't exist |
| Every test maps to a spec AC/edge case/Done-when | ✅ — no unclaimed tests found; every test file's own header comment cites the AC/task it derives from, and this held up under review |
| Documented guidelines followed | `apps/mobile/AGENTS.md` ("Expo HAS CHANGED — read v57 docs before writing code") — respected (SDK 57 packages pinned consistently); monorepo `CLAUDE.md` rules (single lockfile, `argsIgnorePattern: "^_"`, deploys independent) — followed |

---

## Gate Check

- **Gate command**: `npm run test -w orbien-mobile && npm run build:mobile && turbo run lint --filter=orbien-mobile` (Full gate, per `tasks.md` Gate Check Commands)
- **Result**: Tests — 39 passed, 0 failed, 0 skipped, 9 suites. Build (`tsc --noEmit`) — 0 errors. Lint (`eslint .`) — 0 errors, 19 warnings (all cosmetic: `import/first` ordering in test files, `no-redeclare` on RTL globals `screen`/`Text` re-imported, one `array-type` style nit in `auth-client.ts:20`).
- **Test count before feature**: 0 (new workspace, per `tasks.md`: "workspace novo, sem testes existentes para amostrar")
- **Test count after feature**: 39
- **Delta**: +39 new tests
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

### Fix 1: Wire `ApiClient` → `AuthClient` for 401 interception and refresh-and-retry

- **Root cause**: `design.md`'s `ApiClient` component explicitly specifies "intercepta 401 e delega ao `AuthClient` para renovar + repetir a request original", and MOB-01 AC3/AC4 require this end-to-end. `apps/mobile/src/lib/api/client.ts` was built deliberately without a dependency on `AuthClient` (to avoid a circular import, per T9's own "Reuses" note), and no other module closes the loop — `getValidAccessToken()` (T11) exists and is well-tested in isolation but is dead code from the app's perspective (only referenced by its own tests). The one live authenticated call (`ThemeProvider`'s `GET /settings`) reads `session.accessToken` directly and never calls it.
- **Fix task**: Add a thin authenticated-request helper (e.g. `apiClient.authenticated<T>(...)` or an `AuthClient`-owned wrapper) that calls `getValidAccessToken()` before the request, and on a `401 HttpError` from that request, triggers exactly one retry after a fresh `getValidAccessToken()` (or converts a `SessionExpiredError` into a navigable state). Route `ThemeProvider` (and any future MOB-04+ domain call) through it instead of raw `session.accessToken`. Add: (a) a test proving a live `apiClient` call that receives 401 with an expired token triggers one refresh and retries the original request; (b) a test proving two concurrent live calls under the same condition still trigger only one refresh; (c) a test proving a 401 with a revoked/expired refresh token surfaces as a `SessionExpiredError` that the `AuthProvider`/navigation guard can act on (session-ended edge case).
- **Priority**: **Blocker** — this is the exact behavior the story's "Independent Test" describes ("forçar expiração do access token... confirmar que a chamada seguinte renova sozinha sem deslogar o usuário") and it does not hold today for any real API call in the app.

### Fix 2 (minor, non-blocking): Tick the `Done when` checkboxes in `tasks.md` for T8–T16

- **Root cause**: Presumably an oversight — commits and `Status: ✅ Done` markers exist, but the individual `- [ ]` items under "Done when" for T8 through T16 were never checked off.
- **Fix task**: Update `tasks.md` checkboxes to `[x]` for T8–T16 now that this validation independently re-confirmed each one (except the two folded into Gap 1 above, which should stay `[ ]` until Fix 1 lands).
- **Priority**: Cosmetic.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| MOB-01 | Implementing | ❌ Needs Fix (AC3, AC4 — refresh-queue not wired to real requests) |
| MOB-02 | Implementing | ❌ Needs Fix (the mechanism itself is correct and tested; it's just never invoked outside its own test file) |
| MOB-03 | In Tasks | ✅ Verified |
| MOB-11 | Implementing | ✅ Verified |
| MOB-12 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues — one integration gap (Blocker) spanning MOB-01/MOB-02; everything else (MOB-03, MOB-11, MOB-12, and the isolated refresh-queue/login/logout mechanics of MOB-01/02) is solid.

**Spec-anchored check**: 10/12 ACs matched the spec's precise outcome with genuine (non-shallow) assertions; 2 ACs (MOB-01 AC3, AC4) have strong unit coverage of the underlying mechanism but no coverage — because no code path exists — for the end-to-end behavior the spec actually asks for.
**Sensor**: 3/3 mutations killed.
**Gate**: 39/39 tests passed, build clean, lint clean (0 errors).

**What works**: workspace scaffold, dynamic `app.config.js`/`eas.json` (MOB-12, including the anti-hardcode regression test, which is a real generic grep, not a narrow case check), login/logout with a genuinely-generic error message across simulated causes, session hydration, theme fetch/cache/fallback with a real temporal-order proof for the "no flash" AC, and a correctly-implemented (if wired-in-isolation) refresh-queue state machine that survives 3/3 targeted mutations.

**Issues found**:
1. **Blocker** — `ApiClient` never calls `AuthClient.getValidAccessToken()`; no 401 from any real request is intercepted, refreshed, or retried; a revoked/expired refresh does not currently navigate the user to login. See Fix 1.
2. **Cosmetic** — `tasks.md` "Done when" checkboxes not ticked for T8–T16. See Fix 2.

**Next steps**: Route Fix 1 back as an implementer task (it's additive — no existing test needs to change, only new ones); re-verify after it lands, focused specifically on a live `apiClient` call exercising the 401→refresh→retry path end-to-end (not just the isolated `AuthClient` function). MOB-03/MOB-11/MOB-12 do not need re-verification.
