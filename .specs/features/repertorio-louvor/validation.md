# Repertório do Time de Louvor — Validation

**Date**: 2026-09-08
**Spec**: `.specs/features/repertorio-louvor/spec.md`
**Diff range**: `23965f2^..933021e` (base `9478996` → HEAD `933021e`, branch `claude/product-roadmap-web-api-admin-q41fy3`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status | Notes |
|---|---|---|
| T1 | ✅ Done | `model Song` at `apps/api/prisma/schema.prisma:1198-1217`, `SetlistSong.song_id` optional with `onDelete: SetNull` at `:1178,1191`. Migration `20260907233843_add_songs_catalog` present. Checkbox in tasks.md left unticked (`[ ]`) despite evidence of completion — doc-only inconsistency, not a functional gap. |
| T2 | ✅ Done | `apps/api/prisma/migrations/007_rls_songs.sql` uses `app_congregation_allowed()` on both `USING`/`WITH CHECK` (AD-001). Wired into `bootstrap-db.sh:75-77`, after 003. Checkbox unticked in tasks.md (same doc-only note as T1). |
| T3 | ✅ Done | `apps/api/test/rls/isolation.spec.ts:1294-1346` — cross-congregation deny for `admin_congregation`, sibling read+write for `tenant_admin`, USING=WITH CHECK. Checkbox unticked (doc-only). |
| T4 | ✅ Done | `CreateSongDto`/`UpdateSongDto` at `apps/api/src/celebrations/dto/{create,update}-song.dto.ts`; tests in `.spec.ts` siblings. One spec-edge-case gap found — see Edge Cases section. |
| T5 | ✅ Done | `apps/api/src/celebrations/songs.service.ts` — CRUD + `last_played_at` via join+MAX. `songs.service.spec.ts` 100%-branch. |
| T6 | ✅ Done | `apps/api/src/celebrations/songs.controller.ts` — roles verified via `Reflector` in `songs.controller.spec.ts`. |
| T7 | ✅ Done | `song_id?: string` `@IsOptional() @IsUUID()` in `create-setlist-song.dto.ts:9`; accept/reject tests present. |
| T8 | ✅ Done | `setlist-songs.service.ts:20-45` resolves `song_id`, defaults key/bpm/link from catalog, `NotFoundException` cross-tenant. Discrimination sensor confirms this logic is well-tested (mutation killed, see below). |
| T9 | ✅ Done, with a weak spot | `celebration-assignment.service.ts:319-422`, `attachSetlists` private method, single batched `serviceOrder.findMany`. Discrimination sensor found the "item without `ministry_id` is ignored" guard is **not actually exercised** by its own test (see Discrimination Sensor). |
| T10 | ✅ Done | `SongCatalogPanel.tsx` + `.test.tsx`, 15 tests covering list/empty/loading/canEdit/CRUD/error states. |
| T11 | ✅ Done, with a gap | Tab wired in `celebracoes/page.tsx:219,373-374`. **Gap**: `canAddSongs` (reused variable) omits `tenant_admin`, contradicting the edit gate spec.md explicitly assigns to the catalog. See Spec-Anchored table, P1 Story 1 AC2. |
| T12 | ✅ Done | Catalog selector in `ServiceOrderView.tsx`'s `AddSongForm`, plus the pre-existing-bug fix (see "Achados fora do escopo" below) needed to make the POST work at all. Tests in `ServiceOrderView.test.tsx:696-790`. |
| T13 | ✅ Done | `voluntarios/page.tsx:381-419` — repertoire section per assignment card, `<button>` puro for the link (per CLAUDE.md convention), "ainda não publicado" fallback. |
| T14 | ✅ Present, not executable in this environment | `apps/web/e2e/repertorio.spec.ts` — full happy path + absence case, documents Achado 2 in its own header comment. Playwright browser binary not installed in this sandbox (see Gate Check). |

---

## Spec-Anchored Acceptance Criteria

### P1: Cadastrar e listar músicas do catálogo

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC1: cria música com papel autorizado | persiste `Song` com `tenant_id`/`congregation_id` do usuário, 201 | `apps/api/src/celebrations/songs.service.spec.ts:25-42` — `expect(client.song.create).toHaveBeenCalledWith({ data: { tenant_id: 't1', congregation_id: 'g1', ... } })`; controller returns service result (201 implicit via Nest default) `songs.controller.spec.ts:37-47` | ✅ PASS |
| AC2: papel não autorizado tenta criar/editar/remover | 403 | `apps/api/src/celebrations/songs.controller.spec.ts:46,68,78` — `expect(rolesFor('create'/'update'/'remove')).toEqual(EDIT_ROLES)`, enforced by global `RolesGuard` (not re-tested here, reused infra) | ✅ PASS (backend). ⚠️ **Front gap**: `canAddSongs` in `apps/web/src/app/(admin)/celebracoes/page.tsx:65-67` = `['admin_congregation','pastor','ministry_leader']`, **omitting `tenant_admin`** — spec.md Assumptions row "Permissão de editar catálogo" lists `tenant_admin` as authorized. A `tenant_admin` visiting `/celebracoes` will not see create/edit/delete controls on the Repertório tab even though the backend allows the calls. Not a security hole (backend still 403s correctly for real unauthorized roles and allows `tenant_admin`), but a functional/UX gap against the spec's explicit role list. No test exercises `tenant_admin` on this tab (`celebracoes/page.test.tsx:259-266` only covers `volunteer`→false and `pastor`→true). |
| AC3: qualquer papel autenticado lista o catálogo (RLS, ordenado por título) | apenas músicas da própria congregação, ordenadas por título | `apps/api/src/celebrations/songs.service.ts:38` — `orderBy: { title: 'asc' }`; RLS: `apps/api/test/rls/isolation.spec.ts:1295-1306`; controller gate: `songs.controller.spec.ts:56` — `expect(rolesFor('findAll')).toBeUndefined()` | ✅ PASS |
| AC4: edita tom/bpm/link/notas sem alterar `SetlistSong` já existentes | `update` só toca a linha de `Song`; `SetlistSong` denormalizada não muda | `apps/api/src/celebrations/songs.service.ts:76-94` — `update()` only calls `song.update`, never touches `setlistSong`; `songs.service.spec.ts` covers partial updates | ✅ PASS (structural — no code path from `SongsService.update` reaches `SetlistSong`) |
| AC5: remove música referenciada, `SetlistSong.song_id` vira NULL | permite remoção, mantém `SetlistSong` com `song_id: NULL` e campos livres | `apps/api/prisma/schema.prisma:1191` — `onDelete: SetNull`; `songs.service.ts:96-99` — `remove()` does a plain `song.delete`, relying on DB-level `SetNull` | ✅ PASS (DB constraint, not app logic — matches design's "Postgres cuida, sem lógica extra") |

**Status**: ⚠️ 4/5 clean PASS, 1 AC (AC2) has a front-end gap flagged above (backend enforcement is correct).

---

### P1: Reaproveitar música do catálogo numa setlist

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC1: `song_id` sem overrides copia title/key/bpm/link | campos herdam do catálogo | `apps/api/src/celebrations/setlist-songs.service.spec.ts:87-119` — `expect(client.setlistSong.create).toHaveBeenCalledWith({ data: expect.objectContaining({ song_id: 'song-catalog', key: ..., bpm: ..., link: ... }) })`. ⚠️ **Spec-precision nuance**: `title` is NOT defaulted from the catalog in `setlist-songs.service.ts:38` (`title: dto.title` — always required, unconditional). `CreateSetlistSongDto.title` remains `@IsString()` mandatory (pre-existing, unchanged by this feature). So at the API layer, `title` is never actually copied from `Song` — the frontend pre-fills it via `handleSelectSong` (`ServiceOrderView.tsx:120-129`) before submit. The spec text literally lists `title` among the fields the "system SHALL copy," but the copy for `title` happens client-side, not server-side. | ⚠️ Spec-precision gap (title copy is a front-end behavior, not enforced/testable at the API layer as literally written) |
| AC2: `song_id` + override em campo mantém valor do body, `song_id` ainda setado | override wins, `song_id` preserved | `setlist-songs.service.spec.ts:120-140` — `expect(...).toHaveBeenCalledWith(expect.objectContaining({ song_id: 'song-catalog', key: 'E', bpm: 80, link: '...' }))` | ✅ PASS — confirmed by discrimination sensor (mutation flipping precedence was killed, see below) |
| AC3: sem `song_id`, aceita texto livre normalmente | comportamento idêntico a hoje | `setlist-songs.service.spec.ts:40-63` — `song_id: null` in the created record when omitted | ✅ PASS |
| AC4: `song_id` de outro tenant/congregação → 400/404 | rejeita | `setlist-songs.service.spec.ts:142-159` — `await expect(service.create(...)).rejects.toThrow(NotFoundException)` | ✅ PASS (404, matching design's Error Handling Strategy) |

**Status**: ✅ 3/4 clean PASS, 1 spec-precision gap flagged (title copy).

---

### P1: Visão do músico — meu repertório na minha escala

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC1: assignment com `ServiceOrderItem`/`Setlist` correspondente traz músicas, ordenadas por sequência | songs list ordered by `sequence` | `apps/api/src/celebrations/celebration-assignment.service.spec.ts:699-730` — `expect(result[0].setlist).toEqual({ songs: [ {sequence:2,...}, {sequence:1,...} ] })` matching mock's `orderBy` at `celebration-assignment.service.ts:399` | ✅ PASS |
| AC2: sem `ServiceOrder`/item/setlist correspondente → `setlist: null`, sem erro | `null`, no exception | `celebration-assignment.service.spec.ts:732-743` — `expect(result[0].setlist).toBeNull()` | ✅ PASS |
| AC3: acesso direto (fora de `my-assignments`) segue a regra de acesso já existente | nenhuma mudança de gate em `Setlist`/`SetlistSong` diretos | No new route/controller was added exposing `Setlist` by id to non-management roles; `setlists.controller.ts`/`setlist-songs.controller.ts` `@Roles` unchanged in this diff (`git diff` shows no changes to those controllers' guards) | ✅ PASS (verified by absence of change — evidence is the diff itself showing no touch to those controllers' auth) |
| AC4: front exibe seção somente leitura acessível a qualquer usuário autenticado | UI shows read-only repertoire, no gating | `apps/web/src/app/(admin)/voluntarios/page.tsx:381-419` — rendered unconditionally inside the "Meus Turnos" card, which itself is reachable by `volunteer`/`member` (pre-existing gate, unchanged) | ✅ PASS |

**Status**: ✅ 4/4 PASS. One discrimination-sensor weak spot found in the underlying implementation of AC1's "item sem `ministry_id` é ignorado" clause — see Discrimination Sensor.

---

### P2: "Última vez tocada" no catálogo

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC1: lista o catálogo inclui a data da instância mais recente em que a música apareceu | `last_played_at` = MAX(scheduled_date) across usages | `apps/api/src/celebrations/songs.service.spec.ts` (test "usa a data mais recente entre duas instâncias" — confirmed via discrimination sensor: flipping `date > current` → `date < current` broke the assertion `expect(result).toEqual([{..., last_played_at: newer}])`) | ✅ PASS |
| AC2: música nunca usada → `null` | `last_played_at: null` | `songs.service.ts:60-73` — `lastPlayedBySong.get(song.id) ?? null`; covered in `songs.service.spec.ts` | ✅ PASS |

**Status**: ✅ 2/2 PASS.

---

## Edge Cases (from spec.md)

| Edge case | Handled? | Evidence |
|---|---|---|
| Título vazio/só espaço → 400 | ❌ **GAP** | `CreateSongDto.title` is `@IsString()` only (`create-song.dto.ts:4-5`), no `@IsNotEmpty()`/trim check. Empty string `''` and whitespace `'   '` pass validation. `create-song.dto.spec.ts` has no test for empty/whitespace title. Note: the spec text claims this should work "mesma validação que já existe em `CreateSetlistSongDto.title`" — but that pre-existing DTO (`create-setlist-song.dto.ts:16`) has the exact same gap (`@IsString()` only, no non-empty check), confirmed by its own spec file having no such test either. So this is a genuine, if inherited, gap: neither the reused pattern nor the new DTO actually rejects blank titles at the API layer. |
| `bpm` ≤ 0 → 400 | ✅ | `create-song.dto.ts:11-14` `@Min(1)`; `create-song.dto.spec.ts:39-42` "rejeita bpm menor que 1" |
| `link` inválido → 400 | ✅ | `create-song.dto.ts:16-18` `@IsUrl()`; `create-song.dto.spec.ts:48-51` |
| Duas criações concorrentes com mesmo título → ambas permitidas | ✅ (by design — no uniqueness constraint) | No unique index on `songs.title` in `schema.prisma:1198-1217`; no dedup logic in `songs.service.ts` |
| `tenant_admin`/`admin_congregation` acessa catálogo de congregação irmã (leitura permitida, escrita restrita) | ✅ | `apps/api/test/rls/isolation.spec.ts:1308-1345` — `tenant_admin` reads AND writes sibling congregation (per existing `app_congregation_allowed` exception pattern used elsewhere in the codebase for this role); `admin_congregation` denied read of sibling (`:1315-1327`) |

**Status**: ⚠️ 4/5 handled; 1 gap (empty/whitespace title), inherited from a pre-existing pattern gap the spec assumed was already solved.

---

## Discrimination Sensor

Performed in a disposable `git worktree` (`git worktree add … HEAD`, `node_modules` symlinked from the main tree for speed), mutated, tested, reverted, then `git worktree remove --force`. No changes touched the real working tree.

| # | File:line | Description | Killed? |
|---|---|---|---|
| 1 | `apps/api/src/celebrations/setlist-songs.service.ts:39` | Flipped precedence `dto.key ?? catalogSong?.key ?? null` → `catalogSong?.key ?? dto.key ?? null` (catalog always wins over explicit override) | ✅ Killed — `setlist-songs.service.spec.ts:120` ("song_id com override em key…") failed with `Received {"key": "D", ...}` vs expected `"key": "E"` |
| 2 | `apps/api/src/celebrations/celebration-assignment.service.ts:408` | Removed the `!item.ministry_id \|\|` half of the guard, leaving only `if (!item.setlist) continue;` | ❌ **Survived** — `celebration-assignment.service.spec.ts` (36/36 tests) all still passed. Root cause: the existing "item sem ministry_id é ignorado" test (`:745-766`) uses `ministry_id: null` on the item, which produces map key `"inst1:null"`; the assignment's own key is always `"inst1:min1"` (a `CelebrationMinistry.ministry_id` is a required FK, never null) — so the lookup already misses regardless of whether the `!item.ministry_id` guard exists. The guard is currently **not exercisable** by any assignment-shaped test data, because a null-ministry item can structurally never collide with a real assignment's key. → **Fix task recommended**: strengthen this test to actually prove the guard matters (e.g., assert that `setlistByKey` does not gain a spurious entry for the null-ministry item, or restructure so an item's ministry_id could realistically coincide with an assignment key if the guard were absent — e.g. testing the `attachSetlists` return value directly rather than only through `getMyAssignments`'s narrower key lookup). |
| 3 | `apps/api/src/celebrations/songs.service.ts:65` | Flipped comparison `date > current` → `date < current` in the `last_played_at` MAX reduction | ✅ Killed — `songs.service.spec.ts` failed with `last_played_at: 2026-01-05...` vs expected `2026-03-10...` (the older date won instead of the newer one) |

**Sensor depth**: lightweight (default tier — 3 targeted mutations on the highest-risk new logic: catalog-override precedence, ministry-scoped repertoire matching, last-played MAX).
**Result**: 2/3 killed, 1 survived → recorded as a gap (test-quality, not a production defect — manual code review confirms the guard's *intended* behavior is structurally guaranteed by the data model, but the test that claims to prove it does not actually exercise the removal of the guard).

---

## Code Quality

| Principle | Status | Notes |
|---|---|---|
| No features beyond what was asked | ✅ | Scope matches T1-T14 exactly; no extra endpoints/fields found |
| No abstractions for single-use code | ✅ | `attachSetlists` is a private method, not a new class/module |
| No unnecessary "flexibility" added | ✅ | |
| Only touched files required for task | ⚠️ | `ServiceOrderView.tsx`'s `AddSongForm` POST route/payload was touched beyond REPERT-02's literal scope — but this was necessary (T12 cannot land a working `song_id` payload against a route that doesn't exist) and is explicitly declared as `SPEC_DEVIATION` in both code comment and commit message (`be644c5`). Judged acceptable — see "Achados fora do escopo" below. |
| Didn't "improve" unrelated code | ✅ | The `AddItemModal.tsx`/OC-routes mismatch (Achado 2) was explicitly left untouched, exactly as it should be per CLAUDE.md's "achado vira pergunta, não decisão unilateral" |
| Matches existing patterns/style | ✅ | `SongCatalogPanel` mirrors `TemplatesPanel`; `useEffect`+axios throughout, no react-query introduced |
| Would senior engineer approve? | ✅ | Yes, with the two flagged gaps (empty-title validation, `tenant_admin` front gate) as follow-ups |
| Tests map to acceptance criteria, non-shallow | ✅ | Spot-checked P1 Story 2 (`setlist-songs.service.spec.ts`) — assertions target exact field values, not just "no error" |
| Spec-anchored outcome check | ⚠️ | See gaps: title-copy precision (Story 2 AC1), empty-title edge case, `tenant_admin` front gate (Story 1 AC2) |
| Per-layer Coverage Expectation met | ✅ | Domain logic 1:1 with ACs; `songs.service.ts`/`setlist-songs.service.ts`/`celebration-assignment.service.ts` all 100%-branch per `test:cov` run |
| Every test maps to a spec requirement | ✅ | No stray/unclaimed tests found in the diff |
| Documented guidelines followed | ✅ | 100% coverage threshold (`apps/api/jest.config.js`) met; CLAUDE.md's `<button>` vs `<Button>` convention followed in `voluntarios/page.tsx:402-409` |

---

## Gate Check

- **Gate command**: `npm run build:api && npm run build:web && npx turbo run lint && npm run test:cov -w orbien-backend && npm run test -w orbien-web`
- **Result**:
  - `build:api` — ✅ pass (cached)
  - `build:web` — ❌ **fails**, but confirmed **pre-existing and unrelated to this feature**: reproduced the identical failure (`TypeError: Cannot read properties of null (reading 'useContext')` prerendering `/_global-error`) on the commit immediately *before* the feature started (`9478996`, `23965f2^`), in a disposable worktree with a fresh `npm ci`. This is an environment/Next.js-16 issue orthogonal to REPERT-01..04. Not counted as a feature gap.
  - `npx turbo run lint` — ✅ pass, 4/4 packages (orbien-web, orbien-backend, orbien-site, orbien-admin)
  - `npm run test:cov -w orbien-backend` — ✅ pass, **2015/2015 tests**, **100% statements/branches/functions/lines** (5246/5246, 1748/1748, 886/886, 4659/4659)
  - `npm run test -w orbien-web` — ✅ pass, **913/913 tests**, 87 suites
- **Test count before feature**: 2015 (per worker 1's report at T9 close — API tests only; T10-T14 are web-only so no further API test count change expected)
- **Test count after feature (API)**: 2015 — matches baseline exactly, no regression, no unexplained deletion
- **Test count after feature (web)**: 913 (no pre-feature web baseline was given to compare against, but no failures or skips found)
- **Delta**: 0 new API tests beyond baseline count is *not* the case — the 2015 baseline already includes T1-T9's new tests (RLS, DTO, service, controller); this run reconfirms the same total, i.e. no regression introduced by T10-T14 (which are web-only, as expected)
- **Skipped tests**: none found
- **Failures**: `orbien-web` production build only, pre-existing (see above) — no test failures

**E2E (T14)**: `apps/web/e2e/repertorio.spec.ts` could not be executed — Playwright's Chromium binary is not installed in this sandbox (`Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1234/...`, requires `npx playwright install`, which requires network access this environment does not have). This matches the environment limitation the implementing worker also reported. Validated instead by full code review of the spec file: it covers the complete happy path (create song in catalog → verify in Repertório tab → build schedule via direct API calls → verify "ainda não publicado" before a setlist exists → attach the catalog song to a `SetlistSong` via the real `/celebrations/setlists/songs` route → verify it appears correctly in "Meus Turnos" with title/key/bpm/link-button → assert no unexpected HTTP responses or console errors → cleanup in a `finally` block), matching the Independent Tests described for all three P1 stories in spec.md. Treated as an **environment limitation of this verification session**, not a feature gap.

---

## Achados fora do escopo desta feature (não corrigidos, registrados por pedido)

### Achado 1 — bug pré-existente em `AddSongForm`, corrigido dentro do escopo de T12 (confirmado real e coerente)

**O que era**: `ServiceOrderView.tsx`'s `AddSongForm.handleSubmit` posted to `/celebrations/setlists/${setlistId}/songs` with a `position` field. The real controller for `SetlistSong` creation is `SetlistSongsController` at `@Controller('celebrations/setlists/songs')` (`apps/api/src/celebrations/setlist-songs.controller.ts:26`), expecting `setlist_id` in the body and `sequence`, not `position`. The old call would have 404'd against every real backend.

**Confirmed fix** (`apps/web/src/components/celebrations/ServiceOrderView.tsx:137-151`): now posts to `/celebrations/setlists/songs` with `{ setlist_id, song_id, sequence, title, key, bpm, link }` — matches the real controller/DTO exactly. The code carries a `SPEC_DEVIATION` comment (`:137-142`) explaining the fix and its scope, and the commit `be644c5` ("feat(web): seletor de música do catálogo no formulário de setlist (T12)") repeats the same `SPEC_DEVIATION` note in its message body. **This correction is real, necessary (T12 cannot deliver a working `song_id` payload otherwise), and properly documented per the monorepo's "achado vira pergunta" convention** (declared, not silently done).

### Achado 2 — a tela inteira de "Ordem de Celebração" chama rotas/campos que não existem na API real (MAIOR, não corrigido, fora do escopo desta feature)

**Confirmed real.** Evidence gathered directly from the two frontend files and the real backend controllers/DTOs:

| Frontend call | File:line | Real backend route/field | File:line |
|---|---|---|---|
| `POST /celebrations/service-orders` | `ServiceOrderView.tsx:321` | `POST /celebrations/orders` | `service-orders.controller.ts:15,24` (`@Controller('celebrations/orders')`) |
| `DELETE /celebrations/service-orders/items/:id`, `PATCH .../items/:id` with `{ position }` | `ServiceOrderView.tsx:337,363-364` | `DELETE/PATCH /celebrations/items/:id` | `service-order-items.controller.ts:26` (`@Controller('celebrations/items')`) — and the field is `sequence`, not `position` (`reorder-items.dto.ts`/`update-service-order-item.dto.ts`) |
| `POST /celebrations/service-orders/:id/items` with `{ type, position, start_time, responsible_person_id }` | `AddItemModal.tsx:93-102` | `POST /celebrations/items` expecting `{ service_order_id, sequence, name, start_offset_minutes, duration_minutes, responsible_type, person_id \| ministry_id \| responsible_label, notes }` | `create-service-order-item.dto.ts:4-41` |

None of the field names or routes the two components call match the real API surface — every one of these calls would 404 or 400 against the real backend today. This means the "Ordem de Celebração" screen (item CRUD/reordering) is broken end-to-end, independent of and pre-dating this feature; only the one `SetlistSong`-creation POST (Achado 1) was touched and fixed because T12 needed it working.

**Corroborating evidence**: the feature's own E2E spec (`apps/web/e2e/repertorio.spec.ts:1-17`) explicitly documents this same finding in its file header and works around it by driving the OC/item/setlist setup through direct API calls (using the *real* routes: `/celebrations/orders`, `/celebrations/items`, `/celebrations/setlists`) instead of clicking through `ServiceOrderView`/`AddItemModal`, specifically because those components "chamam rotas que não existem no backend atual."

**Scope call**: per CLAUDE.md's rule that a review finding becomes a question, not a unilateral fix, this is reported here as evidence only — **not corrected**. It blocks the "Ordem de Celebração" screen (item management specifically) from working against the real backend today, which in turn means the Setlist section of that screen cannot be reached through the UI (a user could not create an OC item, hence never reach the "add setlist song" step) except via the one already-fixed catalog-song POST path once a `Setlist` already exists. This is a **pre-existing, out-of-scope defect** — recommend a follow-up ticket to fix `ServiceOrderView.tsx` (service-order and item endpoints/fields) and `AddItemModal.tsx` (item endpoint/fields) to match the real API.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
|---|---|---|
| REPERT-01 | Implementing | ⚠️ Verified with gaps (empty-title validation edge case; `tenant_admin` missing from front edit gate) |
| REPERT-02 | Implementing | ⚠️ Verified with spec-precision gap (title copy is front-end only, not literally server-side as spec text implies) |
| REPERT-03 | Implementing | ✅ Verified (one test-quality weak spot in the discrimination sensor, not a production defect) |
| REPERT-04 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues (all minor/moderate, no Blocker-severity defect; core feature functions correctly end-to-end where its own scope is concerned)

**Spec-anchored check**: 15/15 ACs traced to file:line evidence across all 4 requirements. 13 clean PASS, 1 spec-precision gap (REPERT-02 AC1 title-copy), 1 functional front-gate gap (REPERT-01 AC2, `tenant_admin`).
**Sensor**: 2/3 mutations killed, 1 survived (test-quality gap in the "item sem ministry_id" guard — the underlying behavior is still correct by construction, since the data model makes a real collision impossible, but the test does not prove it).
**Gate**: 2015/2015 API tests passed (100% coverage, no regression from the 2015 baseline), 913/913 web tests passed, lint clean, `build:api` clean; `build:web` fails but is a confirmed pre-existing, feature-unrelated environment issue (reproduced on the pre-feature base commit).

**What works**: Full catalog CRUD with correct RLS isolation and role gating (backend); setlist reuse with correct override semantics for key/bpm/link and cross-tenant rejection; musician's read-only repertoire view via `my-assignments`, batched and null-safe; last-played-at derivation with correct MAX-by-date semantics; e2e spec covers the complete real path end-to-end (verified by review, not execution, due to environment sandboxing).

**Issues found**:
1. Empty/whitespace `title` is not rejected by `CreateSongDto` (or by the pre-existing `CreateSetlistSongDto` it mirrors) — add `@IsNotEmpty()` (or equivalent trim+length check) to both DTOs.
2. `canAddSongs` in `apps/web/src/app/(admin)/celebracoes/page.tsx:65-67` omits `tenant_admin`, so the Repertório tab hides edit controls from a role the backend explicitly authorizes — add `tenant_admin` to that role list (or introduce a dedicated `canEditCatalog` list matching spec.md's Assumptions row exactly, if reusing `canAddSongs` for both purposes is undesirable).
3. `celebration-assignment.service.spec.ts`'s "item sem ministry_id é ignorado" test does not actually exercise the removal of that guard (survived mutant) — strengthen it, e.g. by testing `attachSetlists`'s returned map directly, or by asserting no map key is created at all for such an item.
4. (Documentation-only) T1-T9 checkboxes in `tasks.md` remain unticked despite being done and commit-verified; T10-T14 are ticked. Cosmetic — recommend ticking T1-T9 to keep the file consistent with the "Status" line at the top.

**Next steps**: Route issues 1-3 as fix tasks to an implementer (issue 4 is a doc-only touch-up, not a fix cycle). Achados 1 and 2 (pre-existing, out-of-scope) are informational only per this session's instructions — do not fix without an explicit go-ahead, per CLAUDE.md's review-finding-becomes-a-question rule; Achado 2 in particular blocks the "Ordem de Celebração" item-management UI end-to-end and is worth a dedicated ticket regardless of this feature's disposition.

---

## Segunda rodada — fix→re-verify (2026-09-08)

**Diff desta rodada**: três commits atômicos sobre a HEAD da primeira rodada, `dae4a56..2d42484` — `b672a0a`, `4c7d14e`, `2d42484`. Branch `claude/product-roadmap-web-api-admin-q41fy3`, working tree limpa, `nothing to commit`.

### Gap 1 — título vazio/só espaço em `CreateSongDto`

**Fechado.** `apps/api/src/celebrations/dto/create-song.dto.ts:1-8` agora tem `@Transform` (trim) + `@IsString()` + `@IsNotEmpty()` no campo `title`. Testes em `apps/api/src/celebrations/dto/create-song.dto.spec.ts`:
- `:30-33` — `errorsFor({ title: '' })` → `expect(errors.some(e => e.property === 'title')).toBe(true)`
- `:35-38` — `errorsFor({ title: '   ' })` → mesma asserção (o `@Transform` faz o trim virar string vazia antes do `@IsNotEmpty()`, então espaço-só também é rejeitado)
- `:40-42` — título válido continua aceito (não-regressão)

Confirmado com `npm run test:cov -w orbien-backend` (100% branches, os testes do DTO passam).

**Escopo confirmado limpo**: `git diff dae4a56 2d42484 -- apps/api/src/celebrations/dto/create-setlist-song.dto.ts apps/api/src/celebrations/dto/create-setlist-song.dto.spec.ts` retorna vazio — `CreateSetlistSongDto` não foi tocado, como esperado (era explicitamente fora de escopo do gap). `git show --stat b672a0a` toca só `create-song.dto.ts` e seu `.spec.ts`.

### Gap 2 — `tenant_admin` ausente de `canAddSongs`

**Fechado.** `apps/web/src/app/(admin)/celebracoes/page.tsx:65-67`:
```
const canAddSongs = roles.some((r) =>
  ["admin_congregation", "pastor", "tenant_admin", "ministry_leader"].includes(r)
);
```
Agora alinhado (mesmo conjunto de papéis) com `EDIT_ROLES` em `apps/api/src/celebrations/songs.controller.ts:12` — `['admin_congregation', 'pastor', 'tenant_admin', 'ministry_leader']`.

Teste novo em `apps/web/src/app/(admin)/celebracoes/page.test.tsx:270-279` — "dá permissão de edição do repertório para tenant_admin", `setup(["tenant_admin"])` seguido de asserção de que os controles de edição aparecem (mesmo padrão do teste irmão de `:260-269` para `pastor`).

### Gap 3 — mutante sobrevivente do guard `!item.ministry_id` em `attachSetlists`

**Fechado, verificado de forma independente nesta rodada** (não apenas aceito o relato do implementador de que ele "comentou e restaurou").

1. Confirmei primeiro que o service em si não foi tocado pelos 3 commits de fix: `git diff dae4a56 2d42484 -- apps/api/src/celebrations/celebration-assignment.service.ts` retorna **vazio** — ou seja, o implementador de fato restaurou o arquivo ao original, sem deixar a mutação no lugar por engano. Só `celebration-assignment.service.spec.ts` mudou (+57 linhas), no commit `2d42484`.
2. Repeti o sensor de mutação eu mesmo, em worktree descartável (`git worktree add`, nunca stash, em `/tmp/.../scratchpad/wt-verify`): removi manualmente o `!item.ministry_id ||` da checagem em `celebration-assignment.service.ts` (linha ~408), deixando só `if (!item.setlist) continue;`.
3. Rodei `npm run test -w orbien-backend -- celebration-assignment.service.spec.ts` na worktree → **FALHOU**, exatamente no teste novo:
   ```
   ● CelebrationAssignmentService › getMyAssignments › attachSetlists exclui especificamente o item sem ministry_id...
   expect(received).toBe(expected) // Object.is equality
   Expected: false
   Received: true
     817 |  expect(setlistByKey.has('inst1:null')).toBe(false);
   ```
   Os outros 36 testes do arquivo continuaram passando — só o teste alvo detectou a mutação, como esperado (mutação proporcional/pontual, sensor discriminante).
4. Removi a worktree (`git worktree remove --force`) e confirmei `git status` limpo na árvore real.

O novo teste (`celebration-assignment.service.spec.ts:768-823`) chama `attachSetlists` diretamente (via cast + `bind`, contornando `private`) em vez de só via `getMyAssignments`, o que resolve o problema estrutural identificado na rodada 1 (a chave `inst1:null` de um item sem ministério nunca colide com a chave de um assignment real). Mutante morto, comprovado de forma independente pelo Verifier.

### Gate completo desta rodada

- `npm run build:api` — ✅ pass (cache hit)
- `npm run build:web` — ❌ falha, **mesma assinatura exata** da rodada 1: `Error occurred prerendering page "/_global-error"` → `TypeError: Cannot read properties of null (reading 'useContext')`, mesmo digest de erro (`116620949`). Ambiental/pré-existente, não relacionado à feature — já investigado e isolado à `main` antes da feature na rodada 1 (reproduzido no commit `9478996`); nesta rodada só confirmei que a assinatura permanece idêntica.
- `npx turbo run lint` — ✅ pass, 4/4 pacotes (orbien-admin, orbien-backend, orbien-web, orbien-site)
- `npm run test:cov -w orbien-backend` — ✅ pass, **2019/2019 testes**, 221 suites, **100% statements/branches/functions/lines** (5248/5248, 1750/1750, 887/887, 4661/4661)
- `npm run test -w orbien-web` — ✅ pass, **914/914 testes**, 87 suites

**Contagem de testes**: API 2015 → **2019** (+4 líquidos — o commit `b672a0a` soma 3 testes novos ao `create-song.dto.spec.ts` e o commit `2d42484` soma 1 teste novo direto ao `celebration-assignment.service.spec.ts`, mas o total final confirmado pela execução real é 2019, batendo exatamente com o esperado no prompt desta rodada). Web 913 → **914** (+1, o teste de `tenant_admin` em `page.test.tsx`). Nenhuma queda de teste, nenhuma asserção enfraquecida — todas as novas são mais estritas que antes.

### Veredito final

**✅ PASS.** Os 3 gaps da rodada 1 foram corrigidos de forma real e verificável — não apenas declarada pelo implementador. Cada um foi reproduzido/confirmado de forma independente nesta rodada, incluindo repetir o sensor de mutação do zero em worktree isolada (gap 3) e conferir escopo de arquivo tocado via `git diff`/`git show --stat` (gaps 1 e 3). Nenhuma regressão introduzida: gate 100% verde exceto o `build:web` pré-existente e ambiental (mesma assinatura da rodada 1). Achados fora de escopo (Achado 1 e 2, ambos pré-existentes, já registrados na rodada 1) permanecem não corrigidos por decisão consciente — sem mudança nesta rodada.

Nenhuma lição nova a registrar — os 3 gaps fecharam limpo, sem sinal adicional além do que a rodada 1 já capturou.
