# Restrição de acesso do piso (`member`) Validation

**Date**: 2026-09-21
**Spec**: `.specs/features/restricao-acesso-piso-member/spec.md`
**Diff range**: code commits `388cdab..2791cf8` (T1–T8); docs-only `8e35fd6`, `451f2dc`, `ec1ee91` excluded
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | `revokeRefreshToken` extracted to `apps/web/src/lib/session.ts:183-193`; `DELETE` in `route.ts:119-124` uses it |
| T2   | ✅ Done | Block in `apps/web/src/app/api/session/route.ts:95-105` |
| T3   | ✅ Done | Specific message in `apps/web/src/app/(public)/login/page.tsx:39-46` |
| T4   | ✅ Done | `apps/mobile/src/lib/permissions/permissions-client.ts` |
| T5   | ✅ Done | `areas` state in `apps/mobile/src/lib/auth/auth-provider.tsx` |
| T6   | ✅ Done | `showEscala` gate in `apps/mobile/src/app/(tabs)/_layout.tsx:70-73,112` |
| T7   | ✅ Done | `SemAcesso` guard in `apps/mobile/src/app/indisponibilidade.tsx:59-62,101-113` |
| T8   | ✅ Done | New scenario in `apps/mobile/src/__tests__/app/navigation-boot.test.tsx:87-107` |

All 8 tasks implemented and committed as tasks.md states.

---

## Spec-Anchored Acceptance Criteria

### P1: Bloquear login web do piso

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| ACC-01: conta só-`member` loga pelo `apps/web` | 403, `code: 'WEB_ACCESS_DENIED'`, nenhum cookie gravado | `apps/web/src/app/api/session/route.test.ts:201-232` — `expect(res.status).toBe(403); expect(await res.json()).toEqual({code:'WEB_ACCESS_DENIED', message:'Este acesso é apenas pelo aplicativo Orbien.'}); expect(res.cookies.get(ACCESS_COOKIE)).toBeUndefined()` (+ REFRESH/IDENTITY) | ✅ PASS |
| ACC-02: mesma conta loga pelo `apps/mobile` (mesmo `POST /auth/login`) → autentica normal | 200 normal, bloqueio exclusivo do broker web | `apps/mobile/src/lib/auth/auth-client.test.ts` (novo teste "ACC-02 (restricao-acesso-piso-member): conta com só o papel member autentica normalmente pelo mobile...") — `expect(mockPost).toHaveBeenCalledWith("/auth/login", {...}); expect(session).toEqual({accessToken: memberOnlyToken, ...}); expect(mockSetItemAsync).toHaveBeenCalledWith("orbien.session", JSON.stringify(session))`, com um token codificando `roles: ["member"]` | ✅ PASS (fix aplicado pós-Verifier, ver Fix 1) |
| ACC-03: `member` + outro papel loga pelo web → normal | Login normal, cookies gravados | `route.test.ts:253-274` — `expect(res.status).toBe(200); expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe(token)` | ✅ PASS |
| ACC-04: bloqueio revoga o refresh token recém-emitido antes de responder | `POST /auth/logout` chamado com o refresh recém-emitido | `route.test.ts:201-232` — `expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/auth/logout"), expect.objectContaining({body: JSON.stringify({refresh_token:"r1"})}))` | ✅ PASS |
| ACC-05: tela de login mostra mensagem específica pro 403 `WEB_ACCESS_DENIED` | Texto "Este acesso é apenas pelo aplicativo Orbien." | `apps/web/src/app/(public)/login/page.test.tsx:97-110` — `expect(await screen.findByText("Este acesso é apenas pelo aplicativo Orbien.")).toBeInTheDocument()` | ✅ PASS |

**Status**: ✅ 5/5 ACs cobertos com evidência precisa (ACC-02 fechado pós-Verifier, ver Fix 1).

### P1: Esconder Escala/Indisponibilidade de quem não tem `volunteers`

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| ACC-06: login ou boot busca `GET /me/permissions` e guarda as áreas | `areas` refletido no contexto após login e após boot | `apps/mobile/src/lib/auth/auth-provider.test.tsx:166-180` (boot) e `:226-268` (login) — `expect(mockFetchAreas).toHaveBeenCalledTimes(1)`, `expect(screen.getByTestId("areas").props.children).toBe("volunteers,content")` | ✅ PASS |
| ACC-07: áreas sem `volunteers` → tab bar omite "Escala" | Aba Escala some, rota `index` continua declarada | `apps/mobile/src/__tests__/app/(tabs)/_layout.test.tsx:75-89` — `expect(screen.queryByTestId("tab-index")).toBeNull(); expect(screen.getByTestId("hidden-tab-index").props.children).toBe("Escala")` | ✅ PASS |
| ACC-08: sem `volunteers` + navegação direta a `indisponibilidade.tsx` → estado "sem acesso" | Tela mostra guard, nunca crash/branco | `apps/mobile/src/__tests__/app/indisponibilidade.test.tsx:146-156` — `expect(screen.getByTestId("sem-acesso")).toBeTruthy(); expect(mockGetUnavailability).not.toHaveBeenCalled()` | ✅ PASS |
| ACC-09: busca de áreas falha → fail-open (aba normal) | `areas: null` mostra tudo | `apps/mobile/src/lib/auth/auth-provider.test.tsx:197-224` (`status` não trava esperando `fetchAreas`) + `apps/mobile/src/__tests__/app/(tabs)/_layout.test.tsx:52-62` (`areas: null` → 5 abas) + `.../navigation-boot.test.tsx:87-107` (e2e boot member-only) | ✅ PASS |
| áreas incluem `volunteers` → normal, sem regressão | Aba e tela aparecem normalmente | `_layout.test.tsx:64-73` e `indisponibilidade.test.tsx:171-183` | ✅ PASS |

**Status**: ✅ Todos os 5 critérios (incluindo o quinto, sem ID formal na tabela de rastreabilidade) cobertos com evidência precisa.

**Consolidado**: 9/9 ACs com evidência exata que bate com a spec (pós-fix; ver Fix 1 e Fix 2 abaixo).

---

## Discrimination Sensor

Worktree descartável: `/tmp/orbien-mutant-verify` (checkout de `ec1ee91`, `node_modules` symlinkado da árvore real, removido ao final com `git worktree remove --force`).

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ------------ | ------- |
| 1 | `apps/web/src/app/api/session/route.ts:95` | `payload.roles.some((role) => role !== "member")` → `=== "member"` (inverte `hasNonMemberRole`) | ✅ Killed — 3 testes falharam em `route.test.ts` (login normal virou 403, bloqueio virou 200) |
| 2 | `apps/mobile/src/app/(tabs)/_layout.tsx:73` | `areas.includes("volunteers")` → `areas.includes("content")` | ✅ Killed — `(tabs)/_layout.test.tsx` ("esconde a aba Escala...") e `navigation-boot.test.tsx` (cenário member-only) falharam |
| 3 | `apps/web/src/app/api/session/route.ts:97` | Removida a chamada `await revokeRefreshToken(pair.refresh_token)` | ✅ Killed — teste "recusa login de conta cujo único papel é member..." falhou (esperava `fetch(/auth/logout)`, recebeu só a chamada de `/auth/login`) |

**Sensor depth**: lightweight (default, 3 mutações)
**Result**: 3/3 killed — PASS ✅

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — sem tabela nova, sem migration, reuso de `decodeJwtPayload`, `fetchAreas`, `Stack.Protected`/`Tabs.Screen` existentes |
| Surgical changes | ✅ — 13 arquivos tocados, todos previstos no design.md |
| No scope creep | ✅ — nada em `PRODUCT_AREA_READ_ROLES`, nem na aba Celebrações, nem tabela de override, como o Out of Scope pedia |
| Matches patterns | ✅ — `revokeRefreshToken` espelha o `try/catch` silencioso já existente no `DELETE`; `fetchAreas` do mobile espelha o do web; `href: null` é o padrão documentado do Expo Router |
| Spec-anchored outcome check (asserted values match spec) | ✅ para 8/9 ACs — ver tabela acima (ACC-02 é o único gap) |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ — `route.ts` cobre roles vazio, member+outro papel, revogação falhando, além do caminho feliz |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — nenhum teste novo fora do que a Test Coverage Matrix de tasks.md previa |
| Documented guidelines followed | `apps/web/CLAUDE.md`/`AGENTS.md`, `apps/mobile/CLAUDE.md`/`AGENTS.md`, `apps/mobile/STYLE-GUIDE.md` §7 (máximo 5 abas — mantido, teste em `_layout.test.tsx:95-103` conta rotas declaradas) — seguidos |

---

## Edge Cases

- [x] `role_assignments` vazio → tratado como bloqueado — `route.test.ts:234-251`
- [x] Falha na revogação do refresh token (`POST /auth/logout`) não trava o 403 — `route.test.ts:276-297`
- [x] Sessão de suporte (`support_session: true`) nunca dispara o bloqueio — confirmado em
      `design.md` (parágrafo "Sessão de suporte não cruza com o bloqueio", adicionado pós-Verifier)
      e testado em `route.test.ts` ("sessão de suporte nunca teria só member: rolesForToken
      sempre inclui platform_support..." — `expect(res.status).toBe(200)` com
      `roles: ['member', 'platform_support'], support_session: true`). Ver Fix 2.

---

## Gate Check

- **Gate commands (após Fix 1 e Fix 2)**:
  - `npx tsc -p apps/web/tsconfig.json --noEmit` → exit 0
  - `npx tsc -p apps/mobile/tsconfig.json --noEmit` → exit 0
  - `npm run test -w orbien-web` → 107 arquivos, 1282 testes, 0 falhas (+1 do Fix 2)
  - `cd apps/mobile && npx jest` → 49 suites, 368 testes, 0 falhas (+1 do Fix 1)
  - `npx turbo run lint --filter=orbien-web --filter=orbien-mobile` → 0 erros (95 warnings pré-existentes em `orbien-mobile`, nenhum nos arquivos desta feature)
- **Test count before feature** (nos 7 arquivos tocados/criados, contagem de `it(`): 44
- **Test count after feature (incluindo os 2 fixes)**: 70
- **Delta**: +26 novos testes, nenhuma remoção
- **Skipped tests**: nenhum
- **Failures**: nenhuma

---

## Fix Plans (issues found and fixed)

### Fix 1: ACC-02 sem evidência de teste — ✅ Corrigido

- **Root cause**: o bloqueio vive só em `apps/web/src/app/api/session/route.ts`, então nenhum teste do diff exercita o caminho "mesma conta member-only autentica via `POST /auth/login` direto". `apps/api` não foi tocado (correto — é reuso), mas isso deixou a AC sem asserção própria.
- **Fix aplicado**: novo teste em `apps/mobile/src/lib/auth/auth-client.test.ts` ("ACC-02 (restricao-acesso-piso-member): conta com só o papel member autentica normalmente pelo mobile...") — monta um token com `roles: ['member']`, chama `login()`, confirma `POST /auth/login` chamado normalmente e sessão gravada no SecureStore, provando que o `AuthClient` do mobile não inspeciona papel nenhum.
- **Priority**: Minor — o comportamento já era correto por construção; o fix fecha só a rede de segurança contra regressão futura.

### Fix 2: Edge case "sessão de suporte nunca bloqueia" sem confirmação em design.md nem teste — ✅ Corrigido

- **Root cause**: a spec pediu explicitamente para o Design confirmar que os dois fluxos (login normal vs. `POST /auth/impersonate`) não se cruzam; `design.md` não tinha essa seção, e não havia teste que simulasse `payload.support_session === true` passando pelo `POST /api/session` do web.
- **Fix aplicado**: (a) parágrafo novo em `design.md`, seção Risks & Concerns ("Sessão de suporte não cruza com o bloqueio"), explicando que `route.ts` só chama `/auth/login`, nunca `/auth/impersonate`, e que `rolesForToken()` sempre inclui `platform_support` num token de suporte; (b) teste novo em `route.test.ts` com `roles: ['member', 'platform_support'], support_session: true` confirmando 200 — documenta e trava essa suposição.
- **Priority**: Minor — mesma razão do Fix 1.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| ACC-01 | Verified | ✅ Verified |
| ACC-02 | Verified | ✅ Verified (Fix 1 aplicado) |
| ACC-03 | Verified | ✅ Verified |
| ACC-04 | Verified | ✅ Verified |
| ACC-05 | Verified | ✅ Verified |
| ACC-06 | Verified | ✅ Verified |
| ACC-07 | Verified | ✅ Verified |
| ACC-08 | Verified | ✅ Verified |
| ACC-09 | Verified | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready — os 2 gaps que o Verifier independente reportou (ambos Minor, gaps de evidência de teste/documentação, nunca bugs de comportamento) foram corrigidos logo em seguida e revalidados com o gate completo.

**Spec-anchored check**: 9/9 ACs com evidência exata que bate com a spec
**Sensor**: 3/3 mutações mortas
**Gate (pós-fix)**: tsc (web+mobile) 0 erros, 1282 testes web + 368 testes mobile passando, lint 0 erros

**What works**: Bloqueio de login web (`route.ts`) recusa corretamente conta só-`member` e lista vazia, libera `member`+outro papel e os demais 9 papéis, revoga o refresh token com try/catch silencioso, e a tela de login mostra a mensagem certa. No mobile, `permissions-client.ts` busca `/me/permissions` com fail-open correto, `auth-provider.tsx` guarda `areas` sem travar a transição de status, a tab bar esconde a aba Escala com `href: null` (sem remover a rota, mantendo o teto de 5 abas do style guide), e `indisponibilidade.tsx` mostra o guard "sem acesso" sem chamar a API. O sensor de mutação confirma que os testes realmente detectam regressão nos três pontos de maior risco (inversão da condição de bloqueio, troca da string de área, remoção da revogação).

**Issues found e corrigidos**:
1. ACC-02 (mobile autentica normalmente via mesmo `POST /auth/login`) não tinha teste que o provasse — fechado com um teste em `auth-client.test.ts`.
2. Edge case "sessão de suporte nunca dispara o bloqueio" não estava confirmado em `design.md` nem testado — fechado com um parágrafo em `design.md` e um teste em `route.test.ts`.

**Nota de processo**: os dois fixes acima foram aplicados pelo mesmo agente orquestrador desta sessão (não por um segundo Verifier independente) — são adições puramente aditivas (um teste cada, um parágrafo de design), sem mudança de lógica em código já verificado pelo sensor de mutação. O gate completo (tsc + lint + toda a suíte, web e mobile) foi re-executado do zero após os dois fixes e está verde. Um novo round de Verifier independente fica a critério do dev, se quiser essa camada extra antes do PR.

**Next steps**: Feature pronta para a skill `pull-request`, se o dev quiser abrir o PR.
