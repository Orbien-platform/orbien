# Bíblia NVI — Marcações (Mobile) Validation

**Date**: 2026-09-21 (rodada 2 — fix→re-verify iteração 1/3)
**Spec**: `.specs/features/biblia-nvi-marcacoes-mobile/spec.md`
**Diff range**: `ae72604^..c7e1b18` (branch `claude/nvi-bible-marks-comments-t50njd`) — 23 tasks de feature (T1–T23, commits `00d8046..01bd343`) + 2 commits de fix da rodada 1 (`5b3807b`, `df779e7`) + 1 commit de relatório/lições da rodada 1 (`c7e1b18`)
**Verifier**: independente, segunda rodada — não herda contexto da primeira validação (releu spec.md e validation.md anterior do zero)

---

## Rodada anterior — gaps e status de fechamento

| Gap (rodada 1) | Fix commit | Status nesta rodada |
| --- | --- | --- |
| 1. `CreateBibleVerseMarkDto`/`UpdateBibleVerseMarkDto` aceitavam comentário só com espaço em branco (`MinLength(3)` sem trim) | `5b3807b` — `@Transform(trim)` antes do `MinLength` nos dois DTOs + 3 testes novos (`comment: '     '` rejeitado nos dois DTOs; `'  abc  '` aceito e trimado) | ✅ **Fechado** — confirmado por leitura do diff, pela suíte de DTO passando (22 testes, incl. os 3 novos) e por mutação de controle (ver Sensor, mutação extra) |
| 2. Mutante sobrevivente `verse_end < verse_start` → `<=` não pego por nenhum teste (faltava caso `verse_start === verse_end`) | `df779e7` — novo teste `aceita marcação de um único versículo (verse_start === verse_end)` em `bible-verse-marks.service.spec.ts` | ✅ **Fechado** — re-injetei a MESMA mutação em worktree descartável; o teste novo falha com a mutação ativa e passa sem ela |

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1–T23 | ✅ Done | Inalterado desde a rodada 1 — todos os 23 commits de feature presentes |
| Fix 1 (whitespace trim) | ✅ Done | `5b3807b` |
| Fix 2 (teste verse_start===verse_end) | ✅ Done | `df779e7` |

---

## Spec-Anchored Acceptance Criteria

Re-derivado do zero (evidence-or-zero), não copiado da rodada 1. As 22 linhas que já passavam direto na rodada 1 foram reconferidas por leitura de spec + re-execução dos testes; as 2 linhas com gap/spec-precision-gap foram fechadas ou permanecem como decisão registrada.

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion expression | Result |
| --- | --- | --- | --- |
| BIB-01.1 seletor livro→capítulo | Modal com 66 livros, depois capítulos válidos | `apps/mobile/src/__tests__/components/BookChapterPickerModal.test.tsx` — livros→capítulos, `onSelect` com valores certos | ✅ PASS |
| BIB-01.2 texto NVI numerado, cache-first | Cache hit não chama provider; cache miss chama e persiste | `apps/api/src/bible/bible-reader.service.spec.ts:39-56` + `apps/api/test/integration/bible.spec.ts:111-131` — `expect(getChapterCalls).toBe(1)` após 2ª leitura | ✅ PASS |
| BIB-01.3 deep link livro+capítulo+versículo já rolado/destacado | Rota aceita `verse_start`/`verse_end` e aplica destaque | `apps/mobile/src/__tests__/app/biblia/[book]/[chapter].test.tsx:274-290` | ✅ PASS |
| BIB-01.4 falha externa sem cache → erro com retry | `StatusMessage` com retry, sem quebrar navegação | `bible-reader.service.spec.ts` (502 sem cache) + `[chapter].test.tsx` (erro+retry) | ✅ PASS |
| BIB-01.5 capítulo já buscado por qualquer tenant serve do cache | Segunda leitura não chama API externa | `apps/api/test/integration/bible.spec.ts:151-156` | ✅ PASS |
| BIB-02 cache global sem isolamento | RLS `USING(true)/WITH CHECK(true)`, 2 tenants leem a mesma linha | `apps/api/prisma/migrations/021_rls_bible_chapter_cache.sql:22-29` + `apps/api/test/rls/bible-chapter-cache.spec.ts:69-84` | ✅ PASS |
| BIB-03 erro de API mapeado | 502, sem quebrar navegação | `bible-reader.service.spec.ts` + `bible-reader.controller.spec.ts` | ✅ PASS |
| BIB-04.1 marcar intervalo com comentário grava `tenant_id`/`congregation_id`/`person_id`/versão/livro/capítulo/intervalo | Grava exatamente os campos do JWT/DTO | `bible-verse-marks.service.spec.ts:87-109` — `expect(...create).toHaveBeenCalledWith({ data: {...} })` | ✅ PASS |
| BIB-04.1 intervalo de 1 versículo é permitido | "um só, ou vários consecutivos" (spec.md P1 story 2, AC1) | `bible-verse-marks.service.spec.ts:145-157` (commit `df779e7`) — `create` com `verse_start: 16, verse_end: 16` resolve, `expect(...create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ verse_start: 16, verse_end: 16 }) }))` | ✅ PASS (gap da rodada 1 fechado) |
| BIB-04.3 marcação salva aparece no feed | Próxima carga do feed reflete a marcação | `apps/api/test/integration/bible.spec.ts:159-166` | ✅ PASS |
| BIB-04.4 intervalo cruzando capítulos é rejeitado | DTO só aceita 1 `chapter`; validação garante intervalo dentro do total de versículos daquele capítulo | `bible-verse-marks.service.spec.ts:123-132` — `verse_end` acima do total de versículos rejeita com `BadRequestException` | ⚠️ Spec-precision gap (mantido da rodada 1) — impossível por construção do schema (payload não aceita 2 `chapter`s), não é regressão nem foi pedido fix |
| BIB-05 comentário vazio/<3/>2000 rejeita sem gravar | 400 de validação | `apps/api/src/bible/dto/create-bible-verse-mark.dto.spec.ts:69-83` | ✅ PASS |
| BIB-05 edge case: comentário só espaço em branco tratado como vazio | "SHALL tratar como vazio e rejeitar" (spec.md, Edge Cases) | `create-bible-verse-mark.dto.spec.ts:90-93` — `comment: '     '` → `errors.some(e => e.property === 'comment')` é `true`; `update-bible-verse-mark.dto.spec.ts:39-42` idem para update; confirmado por re-execução (22 testes de DTO passam) + mutação de controle (Transform virado no-op) matando o teste | ✅ PASS (gap da rodada 1 fechado) |
| BIB-06.1 feed ordenado `created_at desc`, mesma congregação | Mais recente primeiro | `bible-verse-marks.service.spec.ts:197-209` | ✅ PASS |
| BIB-07 isolamento cross-congregação/cross-tenant | RLS nega leitura/escrita fora do escopo | `apps/api/test/rls/bible-verse-marks.spec.ts:110-166` (5 casos) | ✅ PASS |
| BIB-08 paginação por cursor (`before`) | `take: limit+1`, corta em `limit`, `nextCursor` | `bible-verse-marks.service.spec.ts:222-235` | ✅ PASS |
| BIB-06.5 feed vazio mostra `EmptyState` | Estado vazio, não erro | `apps/mobile/src/__tests__/app/biblia/feed.test.tsx` | ✅ PASS |
| BIB-09.1 autor edita, `updated_at` muda, `created_at` mantido | Mantém posição no feed | `bible-verse-marks.service.spec.ts:251-278` | ✅ PASS |
| BIB-09.2 autor apaga = soft delete, some do feed | `deleted_at` setado, exclusão de `findFeed` | `bible-verse-marks.service.spec.ts:305-318` + `:184-195` | ✅ PASS |
| BIB-09.3 não-autor sem moderação → 403 | Nega edição/exclusão | `bible-verse-marks.service.spec.ts:280-290` + `:334-341` | ✅ PASS |
| BIB-10.1 moderador apaga com `deleted_by_person_id` preenchido | Distinto de auto-remoção | `bible-verse-marks.service.spec.ts:320-332` | ✅ PASS |
| BIB-10.2 sem papel de moderação → 403 | Nega | `bible-verse-marks.service.spec.ts:334-341` | ✅ PASS |
| Edge: usuário sem `congregation_id` → 403 ao marcar | 403, não 500/silêncio | `bible-verse-marks.service.spec.ts:63-74` | ✅ PASS |
| Edge: livro/capítulo inexistente → 400 sem chamar API externa | 400, provider não chamado | `bible-reader.service.spec.ts:39-56` + `apps/api/test/integration/bible.spec.ts:169-178` | ✅ PASS |

**Status**: 24/25 linhas de critério em PASS direto (2 antes eram gap — ambas fechadas nesta rodada); **1 spec-precision gap remanescente** (BIB-04.4 — impossível por construção do schema, mesma decisão registrada na rodada 1, não bloqueante).

---

## Discrimination Sensor

Executado em `git worktree add` descartável (removido ao final de cada checagem — a árvore principal (`/home/user/orbien`) nunca foi tocada; nenhum `git stash` usado).

| # | File:line | Description | Purpose | Killed? |
| --- | --- | --- | --- | --- |
| 1 | `apps/api/src/bible/bible-verse-marks.service.ts:70` | `dto.verse_end < dto.verse_start` → `dto.verse_end <= dto.verse_start` | Re-injeta a MESMA mutação sobrevivente da rodada 1, para confirmar que o fix (`df779e7`) fecha o gap | ✅ **Killed** — `bible-verse-marks.service.spec.ts` (21 testes rodados, 1 falhou): "aceita marcação de um único versículo (verse_start === verse_end)..." lança `BadRequestException` com a mutação ativa |
| 2 (extra) | `apps/api/src/bible/dto/create-bible-verse-mark.dto.ts:32` | `@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))` → `@Transform(({ value }) => value)` (neutraliza o trim) | Confirma que o teste novo de whitespace (`5b3807b`) realmente prova o comportamento, não só existe | ✅ **Killed** — `create-bible-verse-mark.dto.spec.ts` (15 testes rodados, 1 falhou): "rejeita comentário só com espaço em branco..." — `errors.some(...)` esperado `true`, recebido `false` |

Mutações adicionais de baixo custo não foram consideradas necessárias além destas duas: a rodada 1 já cobriu 3 mutações de alto risco (can_delete, filtro deleted_at, verse_end<verse_start) com 2/3 mortas na época; esta rodada foca especificamente em provar os 2 fixes, que é o escopo do fix→re-verify. Regressão ampla nas demais ACs foi coberta por re-execução completa dos 4 gates (ver abaixo), não por mutação repetida.

**Sensor depth**: lightweight (2 mutações direcionadas aos 2 fixes desta rodada)
**Result**: 2/2 killed — **PASS**

---

## Regressão — comentário válido com espaço nas bordas continua aceito

Checagem explícita pedida na tarefa: o trim não pode virar rejeição de comentário legítimo com espaço nas bordas.

- `create-bible-verse-mark.dto.spec.ts:95-97` (commit `5b3807b`) — `comment: '  abc  '` → 0 erros (trimado para `'abc'`, válido)
- `create-bible-verse-mark.dto.spec.ts:85-88` (pré-existente, não tocado) — `comment: 'abc'` → 0 erros; `comment: 'a'.repeat(2000)` → 0 erros
- Confirmado por re-execução: suíte de DTO 22/22 passou (14 create + 8 update, incluindo os 4 novos testes dos 2 commits de fix)

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — fix 1 é `@Transform` de 1 linha × 2 DTOs; fix 2 é 1 teste novo. Nenhum código de produção mudou no fix 2 (correto — o código já estava certo) |
| Surgical changes | ✅ — só os 4 arquivos de DTO/spec (`create-bible-verse-mark.dto.{ts,spec.ts}`, `update-bible-verse-mark.dto.{ts,spec.ts}`) + `bible-verse-marks.service.spec.ts`; nenhum arquivo fora do escopo do fix |
| No scope creep | ✅ — nenhuma mudança em `apps/admin`, `apps/site`, `apps/web`, nem em rotas/schema/RLS |
| Matches patterns | ✅ — `@Transform(trim)` é padrão idiomático de `class-transformer`, já usado em outros DTOs do repo (verificado por padrão de código, sem introduzir abstração nova) |
| Spec-anchored outcome check | ✅ — os 2 gaps concretos da rodada 1 fechados; outcome dos testes novos bate exatamente com o texto do Edge Case da spec |
| Per-layer Coverage Expectation met | ✅ — DTO ganhou os 2 casos que faltavam (whitespace-only + bordas), service ganhou o caso-limite de intervalo de 1 versículo |
| Every test maps to a spec requirement | ✅ — os 4 testes novos mapeiam diretamente a BIB-05 (edge case) e BIB-04.1 (AC1, "um só... versículo") |
| Documented guidelines followed | `CLAUDE.md` raiz (branch reaproveitada, commits atômicos em português, sem `git stash` no sensor — worktree descartável usado corretamente) |

---

## Gate Check

| Gate | Command | Result |
| --- | --- | --- |
| Unit (backend) | `npm run test:unit -w orbien-backend` | ✅ 280 suites, **2791** tests passed |
| RLS (backend) | `npm run test:rls -w orbien-backend` | ✅ 13 suites, 157 tests passed |
| Integration (backend) | `npm run test:integration -w orbien-backend` | ✅ 17 suites, 80 tests passed |
| Mobile | `npm run test -w orbien-mobile` | ✅ 47 suites, 341 tests passed |

- **Test count before esta rodada** (rodada 1, unit backend): 2787
- **Test count depois** (unit backend): 2791
- **Delta**: +4 (2 testes de whitespace no create DTO + 1 no update DTO + 1 teste de verse_start===verse_end no service) — bate exatamente com os 2 commits de fix
- RLS (157) e integration (80) sem mudança de contagem — esperado, os fixes não tocaram RLS/integração
- Mobile (341) sem mudança — esperado, fixes são 100% backend

**Todos os 4 gates passaram.** Nenhuma falha, nenhum skip, nenhuma regressão de contagem.

---

## Requirement Traceability Update

| Requirement | Status rodada 1 | Status rodada 2 |
| --- | --- | --- |
| BIB-01 | ✅ Verified | ✅ Verified (inalterado) |
| BIB-02 | ✅ Verified | ✅ Verified (inalterado) |
| BIB-03 | ✅ Verified | ✅ Verified (inalterado) |
| BIB-04 | ⚠️ Verified com gap | ✅ **Verified** — gap do intervalo de 1 versículo fechado (`df779e7`); spec-precision gap do BIB-04.4 mantido como decisão registrada, não bloqueante |
| BIB-05 | ❌ Needs Fix | ✅ **Verified** — whitespace-only fechado (`5b3807b`) |
| BIB-06 | ✅ Verified | ✅ Verified (inalterado) |
| BIB-07 | ✅ Verified | ✅ Verified (inalterado) |
| BIB-08 | ✅ Verified | ✅ Verified (inalterado) |
| BIB-09 | ✅ Verified | ✅ Verified (inalterado) |
| BIB-10 | ✅ Verified | ✅ Verified (inalterado) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 24/25 critérios batem o outcome exato da spec; 1 spec-precision gap aceitável e não-bloqueante (BIB-04.4, mesma decisão da rodada 1 — impossível por construção do schema, registrado, não é uma regressão)
**Sensor**: 2/2 mutações mortas (as 2 direcionadas ao fechamento dos gaps da rodada 1)
**Gate**: 4/4 passed (unit, RLS, integration, mobile) — 0 failed, 0 skipped, +4 testes novos no unit (esperado)

**What works**: Os 2 gaps da rodada 1 estão fechados e comprovados por evidência direta (leitura de diff + re-execução de teste + reinjeção de mutação em estado descartável). Isolamento RLS por tenant+congregação inalterado e ainda coberto. Cache global deliberado (AD-005) inalterado. Nenhuma regressão em nenhuma das 10 ACs que já passavam na rodada 1 — confirmado por contagem de testes e não apenas por presunção.

**Issues found**: Nenhum gap novo. O único item remanescente do relatório é o mesmo spec-precision gap não-bloqueante da rodada 1 (BIB-04.4), que não foi pedido como fix e continua sendo uma decisão de design válida (schema não permite payload cross-capítulo por construção).

**Next steps**: Nenhuma fix task pendente. Feature pronta para PR — recomendo seguir para a skill `pull-request` quando o usuário quiser abrir o PR.
