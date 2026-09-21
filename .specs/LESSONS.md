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

### L-010 — Quando a tabela de Assumptions já registra que nenhum write path existe para um campo, remova ou mova pra Out of Scope qualquer AC/Edge Case que declare SHALL sobre a escrita desse campo — não deixe as duas seções se contradizerem.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `specs/reten-dados` · harmful: 0
- features: reten-dados-fim-contrato
- evidence: spec.md P1 AC1 / Edge Cases (reativação) (specs/reten-dados)
- last seen: 2026-09-11T17:29:24Z

### L-011 — Teste unitário que mocka $queryRaw inteiro não pega cláusula WHERE errada (ex.: exclusão de doador removida) — para SQL de retenção/exclusão sensível, adicione ao menos um teste de integração contra o SQL real ou asserte o texto da query.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `apps/api/src/persons` · harmful: 0
- features: reten-dados-fim-contrato
- evidence: apps/api/src/persons/persons.service.ts:321-323 (purgeMinorsAfterContractEnd) (apps/api/src/persons)
- last seen: 2026-09-11T17:29:24Z

### L-012 — When a task description contradicts an already-registered architecture decision (AD-NNN), implement and test the AD-compliant behavior and record a SPEC_DEVIATION instead of forcing the task's literal wording.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `rls` · harmful: 0
- features: preferencias-notificacao-mobile
- evidence: tasks.md T3 / apps/api/test/rls/isolation.spec.ts:1384 (rls)
- last seen: 2026-09-11T18:12:52Z

### L-013 — When an AC's outcome depends on an external provider's documented-but-unverifiable-locally semantics (e.g. a filter operator's behavior on absent values), cite the provider doc in design.md and flag the AC as a spec-precision gap instead of writing a unit test that only re-asserts the code's own logic.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `content` · harmful: 0
- features: preferencias-notificacao-mobile
- evidence: spec.md MOB-10b AC4 / apps/api/src/content/notifications.service.ts:43 (content)
- last seen: 2026-09-11T18:12:57Z

### L-014 — Quando um AC pede explicitamente rodar a migration contra dado duplicado fabricado ('Independent Test'), não aceite validar só a sintaxe da query manual — escreva o teste real que aplica a migration sobre a duplicata, mesmo que o mecanismo pareça garantido pelo banco.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `apps/api/prisma/migrations` · harmful: 0
- features: login-email-global
- evidence: spec.md P1 'E-mail único no banco' AC2 (apps/api/prisma/migrations)
- last seen: 2026-09-13T18:58:23Z

### L-015 — Quando um AC descreve o que 'a tela SHALL mostrar', confirme que existe uma task que constrói/atualiza essa tela ou endpoint de leitura — um AC pode ficar totalmente satisfeito na escrita (campo gravado, resolvido) e sem nenhum consumidor de leitura, o que não fecha o critério.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `.specs/features` · harmful: 0
- features: login-email-global
- evidence: spec.md P2 'Transferência de pessoa entre tenants' AC5 (.specs/features)
- last seen: 2026-09-13T18:58:23Z

### L-016 — Ao trocar uma constraint de unicidade de escopo por-tenant para global, procure mensagens de erro hardcoded que citam o escopo antigo (ex.: '...neste tenant') em código não tocado pelo diff — o comportamento pode continuar correto por acidente do catch genérico, mas o texto fica enganoso.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `apps/api/src` · harmful: 0
- features: login-email-global
- evidence: apps/api/src/users/users.service.ts:98 (apps/api/src)
- last seen: 2026-09-13T18:58:23Z

### L-017 — Ao testar um agregado percentual com múltiplas categorias que contam a favor (ex.: green+yellow como 'não vermelho'), inclua ao menos um caso de fixture com cada categoria não-trivial presente simultaneamente — senão um teste com só duas categorias mascara a fórmula errada.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `apps/api/src/small-groups` · harmful: 0
- features: prod-20-multiplicacao-celula
- evidence: apps/api/src/small-groups/networks.service.ts:107 — mutação (green+yellow)→(green) sobreviveu em networks.service.spec.ts e networks.spec.ts (apps/api/src/small-groups)
- last seen: 2026-09-15T02:10:01Z

### L-018 — Ao testar validação de intervalo (verse_end < verse_start ou similar), inclua sempre o caso-limite igual (verse_start === verse_end) — não só valores distintos.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `apps/api/src/bible` · harmful: 0
- features: biblia-nvi-marcacoes-mobile
- evidence: apps/api/src/bible/bible-verse-marks.service.ts:70 (apps/api/src/bible)
- last seen: 2026-09-21T11:57:47Z

### L-019 — Campo de texto livre validado só por MinLength/MaxLength aceita string whitespace-only — some @Transform(trim) antes do MinLength quando a spec disser 'tratar espaços em branco como vazio'.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `apps/api/src/bible/dto` · harmful: 0
- features: biblia-nvi-marcacoes-mobile
- evidence: apps/api/src/bible/dto/create-bible-verse-mark.dto.ts:comment (apps/api/src/bible/dto)
- last seen: 2026-09-21T11:57:47Z

### L-020 — When an AC says another entry point (mobile, a different route) must keep working unaffected by a change confined to one file, add a test that exercises that other entry point directly, not just a comment noting the code path is separate.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: restricao-acesso-piso-member
- evidence: ACC-02 spec.md (testing)
- last seen: 2026-09-21T22:54:57Z

### L-021 — When spec.md asks design.md to explicitly confirm two flows never cross, add that confirmation as a written section in design.md and a dedicated test — do not let it stay an implicit assumption.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `auth` · harmful: 0
- features: restricao-acesso-piso-member
- evidence: spec.md Edge Cases (support_session) / design.md missing confirmation (auth)
- last seen: 2026-09-21T22:54:57Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
