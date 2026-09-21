# Bíblia NVI — Marcações (Mobile) Validation

**Date**: 2026-09-21
**Spec**: `.specs/features/biblia-nvi-marcacoes-mobile/spec.md`
**Diff range**: `ae72604^..01bd343` (branch `claude/nvi-bible-marks-comments-t50njd`) — commits `00d8046..01bd343`, 23 tasks (T1–T23)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1–T23 | ✅ Done | All 23 commits present in range, one per task, matching `tasks.md` titles |

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| BIB-01.1 seletor livro→capítulo | Modal abre lista de 66 livros, depois capítulos válidos | `apps/mobile/src/__tests__/components/BookChapterPickerModal.test.tsx` (livros → capítulos, `onSelect` chamado com valores certos) | ✅ PASS |
| BIB-01.2 exibe texto NVI numerado, cache-first | Cache hit não chama provider; cache miss chama e persiste | `apps/api/src/bible/bible-reader.service.spec.ts:39-56` (não chama provider/cache em erro de validação) + testes de cache-hit/miss no mesmo arquivo; `apps/api/test/integration/bible.spec.ts:111-131` — `expect(getChapterCalls).toBe(1)` após cache-miss, segunda leitura não incrementa | ✅ PASS |
| BIB-01.3 deep link livro+capítulo+versículo, chapter já rolado/destacado | Rota aceita `verse_start`/`verse_end` na query e aplica destaque | `apps/mobile/src/__tests__/app/biblia/[book]/[chapter].test.tsx:274-290` — "chega com verse_start/verse_end na query... e já abre com o intervalo em destaque" | ✅ PASS |
| BIB-01.4 falha externa sem cache → erro com retry | 502 do backend, `StatusMessage` com retry no mobile | `apps/api/src/bible/bible-reader.service.spec.ts` (provider falha, sem cache → `BadGatewayException`); tela mobile testa "erro+retry" (`[chapter].test.tsx`) | ✅ PASS |
| BIB-01.5 capítulo já buscado por qualquer congregação/tenant serve do cache | Segunda leitura não chama a API externa | `apps/api/test/integration/bible.spec.ts:151-156` — `expect(getChapterCalls).toBe(1)` após repetir a leitura | ✅ PASS |
| BIB-02 (cache global, sem isolamento) | RLS habilitado com `USING(true)/WITH CHECK(true)`, dois tenants leem a mesma linha | `apps/api/prisma/migrations/021_rls_bible_chapter_cache.sql:22-29` + `apps/api/test/rls/bible-chapter-cache.spec.ts:69-84` — tenant A e tenant B (totalmente diferentes) leem `cacheRowId` com sucesso | ✅ PASS |
| BIB-03 (erro de API, mensagem tratável) | 502 mapeado, sem quebrar navegação | `bible-reader.service.spec.ts` (erro tratável) + `bible-reader.controller.spec.ts` (mapeamento a 502) | ✅ PASS |
| BIB-04.1 marcar intervalo com comentário salva `tenant_id`/`congregation_id`/`person_id`/versão/livro/capítulo/intervalo | Grava exatamente os campos do JWT/DTO | `apps/api/src/bible/bible-verse-marks.service.spec.ts:87-109` — `expect(client.bibleVerseMark.create).toHaveBeenCalledWith({ data: { tenant_id: 't1', congregation_id: 'g1', person_id: 'p1', book_code: 'JHN', chapter: 3, verse_start: 16, verse_end: 18, comment }})` | ✅ PASS |
| BIB-04.1 (intervalo de 1 versículo é permitido) | "um só, ou vários consecutivos" (spec.md P1 story 2, AC1) | **Nenhum teste cria uma marcação com `verse_start === verse_end`** — todos os fixtures usam 16-18/35-36/1-1(RLS apenas) | ⚠️ Gap — ver Sensor, mutação 3 |
| BIB-04.3 marcação salva aparece no feed | Próxima carga do feed reflete a marcação | `apps/api/test/integration/bible.spec.ts:159-166` — cria marca, `GET /bible/feed` retorna o item criado (`toMatchObject({id: markId, comment})`) | ✅ PASS |
| BIB-04.4 intervalo cruzando capítulos é rejeitado | Modelo não permite `chapter` duplo — DTO só aceita 1 `chapter`; validação contra o capítulo resolvido garante que o intervalo não ultrapassa o total de versículos daquele único capítulo | `bible-verse-marks.service.spec.ts:123-132` — verse_end (40) > total de versículos (36) rejeita com `BadRequestException` | ⚠️ Spec-precision gap — a spec fala em "cruzar capítulos", mas o schema (design.md) já torna essa forma de erro impossível por construção (um único `chapter` no payload); o teste cobre o equivalente prático (fora do total de versículos), não um payload com dois `chapter`s distintos, porque a DTO não aceita isso |
| BIB-05 comentário vazio/<3/>2000 rejeita sem gravar | 400 de validação | `apps/api/src/bible/dto/create-bible-verse-mark.dto.spec.ts:69-83` — comentário ausente, <3, >2000 rejeitam | ✅ PASS |
| BIB-05 (edge case: comentário só espaços em branco tratado como vazio) | "SHALL tratar como vazio e rejeitar" (spec.md, Edge Cases) | **Nenhuma validação server-side de whitespace-only** — `CreateBibleVerseMarkDto` usa `@MinLength(3)` sem `trim()`; confirmado empiricamente: `plainToInstance(CreateBibleVerseMarkDto, {...VALID, comment: '   '})` → `validate()` retorna **0 erros** | ❌ GAP — ver Fix Plans |
| BIB-06.1 feed lista da mais recente para mais antiga, mesma congregação | Ordenação `created_at desc` | `bible-verse-marks.service.spec.ts:197-209` — `expect(result.items.map(i=>i.id)).toEqual(['m1','m2'])` (m1 criado depois de m2) | ✅ PASS |
| BIB-07 isolamento cross-congregação/cross-tenant | RLS nega leitura/escrita fora do escopo | `apps/api/test/rls/bible-verse-marks.spec.ts:110-166` — 5 casos (própria, irmã nega, listagem filtrada, outro tenant nada, escrita cross-congregação rejeitada) | ✅ PASS |
| BIB-08 paginação por cursor (`before`) | `take: limit+1`, corta em `limit`, expõe `nextCursor` | `bible-verse-marks.service.spec.ts:222-235` — `take: 3` para `limit:2`, `nextCursor: 'm2'` | ✅ PASS |
| BIB-06.5 feed vazio mostra `EmptyState` | Estado vazio, não erro | `apps/mobile/src/__tests__/app/biblia/feed.test.tsx` (estado vazio testado, ver Test Coverage Matrix) | ✅ PASS |
| BIB-09.1 autor edita, `updated_at` muda, `created_at` mantido | Mantém posição por `created_at` | `bible-verse-marks.service.spec.ts:251-278` — `data: { comment }` sem `created_at`; `result.created_at` intocado | ✅ PASS |
| BIB-09.2 autor apaga = soft delete, some do feed | `deleted_at` setado, `deleted_by_person_id` nulo, exclusão de `findFeed` | `bible-verse-marks.service.spec.ts:305-318` (delete próprio) + `:184-195` (findFeed exclui `deleted_at IS NOT NULL`) | ✅ PASS |
| BIB-09.3 não-autor sem moderação → 403 | Nega edição/exclusão | `bible-verse-marks.service.spec.ts:280-290` (edição, mesmo sendo pastor) + `:334-341` (exclusão) | ✅ PASS |
| BIB-10.1 moderador apaga com `deleted_by_person_id` preenchido | Distinto de auto-remoção | `bible-verse-marks.service.spec.ts:320-332` — `data: {..., deleted_by_person_id: 'p1'}` (moderador != autor) | ✅ PASS |
| BIB-10.2 sem papel de moderação → 403 | Nega | `bible-verse-marks.service.spec.ts:334-341` | ✅ PASS |
| Edge: usuário sem `congregation_id` → 403 ao marcar | 403, não 500/silêncio | `bible-verse-marks.service.spec.ts:63-74` — `create`/`findFeed` com `congregation_id: ''` rejeitam com `ForbiddenException`, `create` não chamado | ✅ PASS |
| Edge: livro/capítulo inexistente → 400 sem chamar API externa | 400, provider não chamado | `bible-reader.service.spec.ts:39-56` + integração `apps/api/test/integration/bible.spec.ts:169-178` | ✅ PASS |

**Status**: 22/24 linhas de critério em PASS direto; **1 GAP** (comentário whitespace-only não rejeitado no backend) e **1 Spec-precision gap** (intervalo cross-capítulo é impossível por construção do schema, não testado como tal — aceitável, mas registrado).

---

## Discrimination Sensor

Executado em `git worktree add /tmp/bible-verify-wt 01bd343` (descartável, removido ao final — a árvore principal nunca foi tocada).

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ------------ | ------- |
| 1 | `apps/api/src/bible/bible-verse-marks.service.ts:240` | `can_delete: is_mine \|\| isModerator` → `is_mine && isModerator` | ✅ Killed (`bible-verse-marks.service.spec.ts` — 2 testes falharam: "ordena... marca is_mine/can_delete" e "moderador (pastor) pode apagar item alheio") |
| 2 | `apps/api/src/bible/bible-verse-marks.service.ts:112-114` | Removido o filtro `deleted_at: null` do `where` de `findFeed` | ✅ Killed (`bible-verse-marks.service.spec.ts:184-195` — "exclui marcações apagadas" falhou, `where` recebido sem `deleted_at`) |
| 3 | `apps/api/src/bible/bible-verse-marks.service.ts:70` | `dto.verse_end < dto.verse_start` → `dto.verse_end <= dto.verse_start` (rejeita, por engano, marcação de 1 versículo só) | ❌ **Survived** — suíte inteira `src/bible/**` (75 testes, 9 suítes) passou com a mutação ativa; nenhum teste cria/valida um intervalo `verse_start === verse_end` |

**Sensor depth**: lightweight (3 mutações, feature não é P0/pagamento)
**Result**: 2/3 killed — **FAIL** (mutante sobrevivente vira gap ranqueado)

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ — nenhuma mudança fora de `apps/api/src/bible/**`, `apps/api/test/{rls,integration}/bible-*`, `apps/api/prisma/{schema.prisma,migrations/02{0,1}_*}`, `apps/api/scripts/bootstrap-db.sh`, `apps/mobile/src/{app/biblia,lib/bible,components/BookChapterPickerModal.tsx,app/(tabs)/perfil.tsx,app/_layout.tsx,lib/theme/icons.ts}`, `apps/mobile/src/__tests__/**` correspondentes |
| No scope creep | ✅ — nenhuma alteração em `apps/admin`, `apps/site`, `apps/web` |
| Matches patterns | ✅ — `PrayerRequestsService`/`GroupMessagesController` reaproveitados conforme design.md |
| Spec-anchored outcome check | ⚠️ — 1 gap concreto (whitespace-only comment), ver acima |
| Per-layer Coverage Expectation met | ✅ (com a ressalva do gap) — domain 1:1 com ACs, RLS com os 5+2 casos previstos, controller com guards+happy+erro, integração ponta a ponta |
| Every test maps to a spec requirement | ✅ — sem testes órfãos encontrados |
| Documented guidelines followed | `CLAUDE.md` raiz (branch-antes-de-editar: branch já existia e foi reaproveitada corretamente pelo autor) + `tasks.md` (Test Coverage Matrix, Gate Check Commands) |

---

## AD-005 — confirmação independente

Lido pessoalmente:
- `apps/api/prisma/migrations/021_rls_bible_chapter_cache.sql:22-29` — `ENABLE`/`FORCE ROW LEVEL SECURITY` + policy `shared_read_write` `PERMISSIVE FOR ALL TO app_user USING (true) WITH CHECK (true)`, com bloco `DO $$` que falha se não houver exatamente 1 policy simétrica.
- `apps/api/test/rls/bible-chapter-cache.spec.ts:30-85` — dois tenants totalmente distintos (`tenantA`/`tenantB`, sem relação nenhuma), cada um lendo, via `runAsTenantWithRole` (mesmo caminho de produção — `SET LOCAL ROLE app_user`), a MESMA linha (`cacheRowId`) inserida por `prismaAdmin` sem tenant. Os dois testes passam.

Confirmado: não é "RLS ausente" — é RLS habilitado com abertura deliberada e testada, exatamente como `.specs/STATE.md:107` (AD-005) documenta.

## AJU-04 (build do `orbien-admin`) — confirmação independente

`git diff --stat ae72604^..01bd343 -- apps/admin` retorna **vazio** — nenhuma linha tocada em `apps/admin` neste range. A falha de pré-renderização do `orbien-admin` (`/_global-error`) é, portanto, pré-existente e não relacionada a esta feature, confirmado por leitura direta do diff, não por segunda mão.

---

## Gate Check

| Gate | Command | Result |
| --- | --- | --- |
| Unit (backend) | `npm run test:unit -w orbien-backend` | ✅ 280 suites, 2787 tests passed |
| RLS (backend) | `npm run test:rls -w orbien-backend` | ✅ 13 suites, 157 tests passed (inclui `bible-verse-marks.spec.ts` e `bible-chapter-cache.spec.ts`) |
| Integration (backend) | `npm run test:integration -w orbien-backend` | ✅ 17 suites, 80 tests passed (inclui `bible.spec.ts`) |
| Mobile | `npm run test -w orbien-mobile` | ✅ 47 suites, 341 tests passed (inclui todos os testes de `biblia/**` e `BookChapterPickerModal`) |

**Todos os 4 gates passaram.** Nenhuma falha, nenhum skip.

---

## Fix Plans

### Fix 1: comentário só de espaços em branco não é rejeitado pelo backend

- **Root cause**: `CreateBibleVerseMarkDto.comment` usa `@MinLength(3)`/`@MaxLength(2000)` sem `@Transform(trim)` nem `@IsNotEmpty` combinado com trim — `class-validator` conta caracteres brutos, então `"   "` (3+ espaços) passa a validação. O mobile faz `comment.trim()` antes de chamar `createMark` (`apps/mobile/src/app/biblia/[book]/[chapter].tsx:134-135`, `feed.tsx:131-132`), então a UI não expõe o bug — mas a API, chamada diretamente (ou por qualquer cliente futuro), aceita.
- **Fix task**: Adicionar `@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)` (de `class-transformer`) antes das validações de tamanho em `CreateBibleVerseMarkDto.comment` (e `UpdateBibleVerseMarkDto.comment`, mesmo risco), + teste de DTO cobrindo `comment: '   '` rejeitado.
- **Priority**: Minor (o app mobile, único cliente hoje, já trima; mas é o outcome explícito de um Edge Case da spec, não coberto por trás do proxy).

### Fix 2: mutante sobrevivente — nenhum teste cobre marcação de UM único versículo (`verse_start === verse_end`)

- **Root cause**: Todos os fixtures de `bible-verse-marks.service.spec.ts` e do teste de integração usam intervalos com `verse_start !== verse_end` (16-18, 35-36, 35-40). A condição `verse_end < verse_start` (que existe para rejeitar intervalo invertido) nunca é exercitada no caso-limite permitido pela spec ("um só... versículo").
- **Fix task**: Adicionar um teste em `bible-verse-marks.service.spec.ts` — `create` com `verse_start === verse_end` (ex. `16,16`) resolve com sucesso (não lança).
- **Priority**: Minor (o código está correto — `<` não `<=` — é a suite que não prova isso; risco real é baixo, mas é exatamente o tipo de refatoração futura que quebraria silenciosamente sem esse teste).

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| BIB-01 | In Tasks | ✅ Verified |
| BIB-02 | In Tasks | ✅ Verified |
| BIB-03 | In Tasks | ✅ Verified |
| BIB-04 | In Tasks | ⚠️ Verified com gap (ver Fix 2 — não bloqueante, correção sugerida) |
| BIB-05 | In Tasks | ❌ Needs Fix (whitespace-only comment, Fix 1) |
| BIB-06 | In Tasks | ✅ Verified |
| BIB-07 | In Tasks | ✅ Verified |
| BIB-08 | In Tasks | ✅ Verified |
| BIB-09 | In Tasks | ✅ Verified |
| BIB-10 | In Tasks | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues (gates 100% verdes, feature funcionalmente completa e corretamente isolada por RLS; 2 gaps pontuais de robustez de validação/teste, nenhum bloqueante de segurança/isolamento)

**Spec-anchored check**: 22/24 critérios batem o outcome exato da spec; 1 gap real (BIB-05 whitespace) + 1 spec-precision gap aceitável (BIB-04.4, impossível por construção do schema)
**Sensor**: 2/3 mutações mortas, 1 sobrevivente (Fix 2)
**Gate**: 4/4 passed (unit, RLS, integration, mobile) — 0 failed

**What works**: Isolamento RLS por tenant+congregação (`bible_verse_marks`) e visibilidade compartilhada deliberada e testada (`bible_chapter_cache`, AD-005); proxy obrigatório (mobile nunca fala com a API externa); cache-first com upsert idempotente sob corrida; `is_mine`/`can_delete`/`deleted_by_person_id` corretos e testados por valor, não só por chamada; paginação por cursor; deep-link com destaque de versículo; moderação por papel restrita e testada com 403 nos dois sentidos (editar/apagar).

**Issues found**:
1. Comentário só-espaço passa a validação do backend (Fix 1 acima) — Minor, mitigado na prática pelo único cliente hoje (mobile), mas viola o outcome literal da spec no proxy.
2. Mutante sobrevivente em `verse_end < verse_start` para o caso `verse_start === verse_end` — nenhum teste prova que marcar 1 único versículo funciona (Fix 2) — Minor, comportamento correto, cobertura insuficiente.

**Next steps**: Duas fix tasks pequenas e independentes (DTO transform + 1 teste de DTO; 1 teste de service). Nenhuma requer mudança de schema, RLS ou contrato de API. Recomendo tratá-las antes de considerar a feature 100% fechada, mas nenhuma bloqueia demo nem representa risco de segurança/vazamento de dado.
