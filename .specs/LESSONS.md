# LESSONS — auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation — do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 — When a spec lists an explicit role set for a permission gate, grep every place that gate is reused on the frontend (not just the backend @Roles) and confirm the role list matches exactly, not an older adjacent gate.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `web/permissions` · harmful: 0
- features: repertorio-louvor
- evidence: REPERT-01 AC2 / apps/web/src/app/(admin)/celebracoes/page.tsx:65-67 (web/permissions)
- last seen: 2026-09-08T00:47:32Z

### L-002 — When a guard filters records that get merged into a keyed map, test it by asserting the map/result directly for the filtered case, not only through a caller whose own key structure already excludes the filtered record by construction.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `api/celebrations` · harmful: 0
- features: repertorio-louvor
- evidence: apps/api/src/celebrations/celebration-assignment.service.ts:408 (mutant 2) (api/celebrations)
- last seen: 2026-09-08T00:47:32Z

### L-003 — A spec's 'same validation as an existing field' claim must be verified against that field's actual DTO decorators, not assumed — @IsString() alone never rejects empty or whitespace-only strings; use @IsNotEmpty() or a trim check when the spec requires non-blank text.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api/dto` · harmful: 0
- features: repertorio-louvor
- evidence: Edge case: título vazio/só espaço / apps/api/src/celebrations/dto/create-song.dto.ts, create-setlist-song.dto.ts (api/dto)
- last seen: 2026-09-08T00:47:32Z

### L-004 — When spec.md leaves an operational detail (pagination, empty state, retry behavior) undefined for an AC, capture the concrete decision explicitly in design.md and treat it as the acceptance criterion for that round, rather than leaving it implicit in the implementation.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `mobile` · harmful: 0
- features: app-mobile
- evidence: spec.md AC2 (P1: Conteúdos e Notificações) — pagination/empty-state/load-more not detailed in spec.md (mobile)
- last seen: 2026-09-08T16:11:44Z

### L-005 — When an implementation intentionally diverges from an AC's literal wording based on a backend finding, update spec.md's AC text to match the confirmed decision, not just design.md — a reader of spec.md alone should not be misled.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `mobile` · harmful: 0
- features: app-mobile
- evidence: spec.md AC2 wording ('visíveis para os segmentos de audiência') vs. design.md finding (listing endpoint does not filter by segment) (mobile)
- last seen: 2026-09-08T16:11:44Z

### L-006 — Critério de layout na spec precisa nomear o observável que o teste vai afirmar (classe, atributo ou limite), porque jsdom não mede layout renderizado
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `apps/web` · harmful: 0
- features: setlist-repertorio-conexao
- evidence: .specs/features/setlist-repertorio-conexao/validation.md — Edge Case 'título longo trunca sem quebrar o layout'; asserção em apps/web/src/components/repertorio/SongPicker.test.tsx:165 (apps/web)
- last seen: 2026-09-08T20:52:20Z

### L-007 — When a spec AC lists multiple displayed fields (e.g. 'nome/horário/responsável'), verify each field is actually rendered in the component, not just the ones covered by the design.md data model — a field present in the type but never read in JSX is a silent AC gap.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `apps/mobile` · harmful: 0
- features: celebracoes-oc-mobile
- evidence: spec.md AC2/AC3 (P1) vs apps/mobile/src/app/celebracao/[id].tsx (apps/mobile)
- last seen: 2026-09-09T00:33:14Z

### L-008 — Every edge case listed in spec.md needs its own dedicated test assertion, even when the code path looks obviously correct by inspection — evidence-or-zero treats an unasserted edge case as uncovered regardless of code quality.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `apps/mobile` · harmful: 0
- features: celebracoes-oc-mobile
- evidence: spec.md Edge Cases (celebracoes-oc-mobile) vs apps/mobile/src/__tests__/app/celebracao/[id].test.tsx (apps/mobile)
- last seen: 2026-09-09T00:33:19Z

### L-009 — Quando o AC ou design.md exigem estado de erro 'com opção de tentar novamente', implemente uma ação de retry executável (onPress que refaz o fetch) em toda tela de erro da feature, e teste-a — não só a mensagem de erro.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `apps/mobile` · harmful: 0
- features: pequenos-grupos-mobile
- evidence: spec.md AC3 (P1: Ver meus grupos) / apps/mobile/src/app/(tabs)/grupos.tsx:43-49 (apps/mobile)
- last seen: 2026-09-09T02:02:45Z

### L-010 — When a task description contradicts an already-registered architecture decision (AD-NNN), implement and test the AD-compliant behavior and record a SPEC_DEVIATION instead of forcing the task's literal wording.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `rls` · harmful: 0
- features: preferencias-notificacao-mobile
- evidence: tasks.md T3 / apps/api/test/rls/isolation.spec.ts:1384 (rls)
- last seen: 2026-09-11T18:12:52Z

### L-011 — When an AC's outcome depends on an external provider's documented-but-unverifiable-locally semantics (e.g. a filter operator's behavior on absent values), cite the provider doc in design.md and flag the AC as a spec-precision gap instead of writing a unit test that only re-asserts the code's own logic.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `content` · harmful: 0
- features: preferencias-notificacao-mobile
- evidence: spec.md MOB-10b AC4 / apps/api/src/content/notifications.service.ts:43 (content)
- last seen: 2026-09-11T18:12:57Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
