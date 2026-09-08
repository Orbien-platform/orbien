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

### L-004 — Critério de layout na spec precisa nomear o observável que o teste vai afirmar (classe, atributo ou limite), porque jsdom não mede layout renderizado
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `apps/web` · harmful: 0
- features: setlist-repertorio-conexao
- evidence: .specs/features/setlist-repertorio-conexao/validation.md — Edge Case 'título longo trunca sem quebrar o layout'; asserção em apps/web/src/components/repertorio/SongPicker.test.tsx:165 (apps/web)
- last seen: 2026-09-08T18:21:42Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
