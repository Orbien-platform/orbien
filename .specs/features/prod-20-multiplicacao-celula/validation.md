# PROD-20 Validation

**Date**: 2026-09-15
**Spec**: `.specs/features/prod-20-multiplicacao-celula/spec.md`
**Diff range**: `f27ab6f..HEAD` (23 feature commits, `7d1f187`..`e1e7e50`, on branch `claude/dreamy-mayer-nl7lvs`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | `Network` model + `SmallGroup.network_id` + `@@index([tenant_id, network_id])` in `schema.prisma`; migration `20260915004121_add_network` |
| T2   | ✅ Done | `016_rls_networks.sql` created, registered in `bootstrap-db.sh` right after 015 (before step 4), symmetric USING/WITH CHECK per AD-001 |
| T3   | ✅ Done | `test/rls/networks.spec.ts` — cross-tenant read/write isolation |
| T4   | ✅ Done | `MultiplySmallGroupDto` + spec |
| T5   | ✅ Done | `SmallGroupsService.multiply` — validation, scope check, transaction |
| T6   | ✅ Done | `POST /small-groups/:id/multiply` route |
| T7   | ✅ Done | `test/integration/small-groups-multiply.spec.ts` |
| T8   | ✅ Done | `classifyHealth` pure function |
| T9   | ✅ Done | `SmallGroupsService.getHealth` |
| T10  | ✅ Done | `GET /small-groups/:id/health`, `PlanGuard` on controller class |
| T11  | ✅ Done | `getAncestors` iterative |
| T12  | ✅ Done | `getHierarchy` returns `{ancestors, tree}`; hierarchy test rewritten |
| T13  | ✅ Done | `@RequiresPlan('premium')` on `:id/hierarchy` |
| T14  | ✅ Done | `CreateNetworkDto` / `UpdateNetworkDto` |
| T15  | ✅ Done | `NetworksService` CRUD |
| T16  | ✅ Done | `NetworksService.getGoalStatus` |
| T17  | ✅ Done | `NetworksController` + module registration |
| T18  | ✅ Done | `network_id` in `UpdateSmallGroupDto` + congregation validation |
| T19  | ✅ Done | `test/integration/networks.spec.ts` |
| T20  | ✅ Done | `MultiplyGroupModal.tsx` + test |
| T21  | ✅ Done | `GroupHealthBadge.tsx` + test |
| T22  | ✅ Done | `GroupGenealogyTree.tsx` + test |
| T23  | ✅ Done | `apps/web/src/app/(admin)/redes/page.tsx` + test |

All 23 tasks present as atomic commits (`git log --oneline f27ab6f..HEAD`), each touching exactly the files its task body names. No task is missing, partial, or blocked.

**Known, accepted scope decisions** (not gaps):
- No sidebar nav link to `/redes` — consciously out of T23's "Where"/"Done when".
- `SPEC_DEVIATION` inline comment in `multiply()` (spec.md AC2 = 400 for both invalid `leader_person_id` and invalid `member_ids`, vs. design.md's 404-for-leader) — verified below, resolved correctly in favor of spec.md.

---

## Spec-Anchored Acceptance Criteria

### P1: Multiplicar célula

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: multiply cria filha + move membros + garante líder, em 1 transação | filha com `parent_group_id`, membros movidos, líder com membership `leader` | `apps/api/src/small-groups/small-groups.service.spec.ts:198-237` — `expect(client.smallGroup.create).toHaveBeenCalledWith({data:{parent_group_id:'mother-1',...}})`, `expect(client.groupMembership.updateMany)...`, `expect(client.groupMembership.upsert)...role:'leader'`; end-to-end: `apps/api/test/integration/small-groups-multiply.spec.ts:149-193` — `expect(child.parent_group_id).toBe(motherId)`, membros movidos/remanescente confirmados contra Postgres real | ✅ PASS |
| AC2: `leader_person_id`/`member_ids` inválidos → 400, nada criado | `400` (não `404`) nos dois casos — confirma o `SPEC_DEVIATION` | `small-groups.service.spec.ts:239-263` (leader de outro tenant / inexistente) e `:265-276` (member_id não pertence à mãe) — todos `rejects.toBeInstanceOf(BadRequestException)`; código real em `small-groups.service.ts:246-248,258-261` lança `BadRequestException` (não `NotFoundException`) em ambos os ramos | ✅ PASS — SPEC_DEVIATION confirmado consistente com spec.md |
| AC3: `member_ids` vazio é permitido | filha nasce só com o líder, sem erro | `small-groups.service.spec.ts:278-296` — `expect(client.groupMembership.count).not.toHaveBeenCalled()`, `upsert` chamado com `role:'leader'` | ✅ PASS |
| AC4: sem `MANAGE_ROLES` e sem ser `cell_leader` desta célula → 403 | `403` | `small-groups.service.spec.ts:298-308` — `rejects.toBeInstanceOf(ForbiddenException)` | ✅ PASS |
| AC5: célula filha aparece na lista de filhas da mãe (web) | nova filha visível em `GroupDetailSheet` | `apps/web/src/components/groups/MultiplyGroupModal.test.tsx` (submissão feliz fecha + recarrega); `GroupDetailSheet.tsx` usa `childGroups` já retornado por `findOne` — não há teste de integração de UI ponta-a-ponta que renderize a lista pós-multiplicação, mas o dado (`childGroups`) já é servido por `findOne` e o modal dispara reload | ⚠️ Spec-precision gap (fraco) — a asserção prova "modal recarrega a célula", não "a filha aparece visualmente na lista"; comportamento correto por inspeção de código, mas não coberto por assertion direta |
| AC6: tenant sem Premium continua funcionando (sem `PlanGuard`) | rota `multiply` sem `@RequiresPlan` | `apps/api/src/small-groups/small-groups.controller.ts:112-120` — decorator ausente na rota; `small-groups.controller.spec.ts:99` "multiply aceita cell_leader" prova só `@Roles`, não a ausência de `@RequiresPlan` diretamente | ⚠️ Spec-precision gap — nenhum teste afirma explicitamente "ausência de RequiresPlan nesta rota"; verificado por leitura de código, correto |

### P2: Semáforo de saúde da célula

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: `GET .../health` retorna `{status,last_meeting_at,days_since_last_meeting}` | shape exato | `apps/api/test/integration/small-groups-health.spec.ts:101-106` — `res.status===200`, corpo com `status:'red'` (nunca se reuniu) | ✅ PASS |
| AC2: <14 dias → green | `green` | `small-groups.service.spec.ts:66` — `expect(classifyHealth(treze, NOW)).toBe('green')` | ✅ PASS |
| AC3: 14–27 dias → yellow | `yellow` | `small-groups.service.spec.ts:67,74` — `classifyHealth(catorze,...)`→`'yellow'`, `classifyHealth(vinteSete,...)`→`'yellow'` | ✅ PASS |
| AC4: ≥28 dias ou nunca → red | `red` | `small-groups.service.spec.ts:59,75` — `classifyHealth(null,...)`→`'red'`, `classifyHealth(vinteOito,...)`→`'red'` | ✅ PASS |
| AC5: sem Premium → 403 | `403` | `small-groups-health.spec.ts:93-98` — `expect(res.status).toBe(403)` | ✅ PASS |
| AC6: bolinha no `GroupDetailSheet`, oculta sem Premium | indicador visual condicional | `apps/web/src/components/groups/GroupHealthBadge.test.tsx` — casos "Premium exibe bolinha" / "403 não renderiza nada" | ✅ PASS |

### P2: Árvore genealógica

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: `hierarchy` retorna ancestrais + árvore, cada nó com `id/name/leader_person_name/generation/health_status` | shape exato, `generation` negativo/0/positivo | `apps/api/test/integration/small-groups-hierarchy.spec.ts:102-147` — `result.tree?.generation` 0/1/2, `result.ancestors[0]/[1]` com `generation:-1/-2` (linhas 139-145) | ✅ PASS |
| AC2: célula raiz isolada → ancestrais e árvore de descendentes vazios | `ancestors:[]`, sem erro | `small-groups-hierarchy.spec.ts:150-155` — `expect(result).toEqual({ancestors:[],tree:null})` para grupo inexistente/outro tenant (nota: raiz-com-filhos tem `tree` não-null por definição; o caso "raiz sem pai e sem filhos" não tem um teste isolado explícito, mas a lógica de `buildGenealogyTree`/`getAncestors` cobre ambos os ramos independentemente) | ✅ PASS (com nota) |
| AC3: sem Premium → 403 | `403` | `apps/api/test/integration/small-groups-hierarchy-plan-gate.spec.ts:89-94` — `expect(res.status).toBe(403)` | ✅ PASS |
| AC4: mesma cor do semáforo por nó | reuso de `classifyHealth` | `small-groups.service.ts:589,635,642` chamam `classifyHealth` diretamente; teste: `small-groups-hierarchy.spec.ts:110` `expect(result.tree?.health_status).toBe('red')` | ✅ PASS |
| Independent Test: A→B→C, genealogia de B = ancestrais [A], descendentes [C] | | `small-groups-hierarchy.spec.ts:120-131` (nó intermediário) e `:134-147` (neto, 2 ancestrais) | ✅ PASS |

### P3: Rede e meta de saúde

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: `POST /networks` com `MANAGE_ROLES` cria `Network` no tenant/congregação | criação vinculada | `apps/api/test/integration/networks.spec.ts:111-145` — cria/lê/atualiza/remove contra Postgres real | ✅ PASS |
| AC2: `PATCH /small-groups/:id` com `network_id` (mesma congregação ou `null`) associa/desassocia | associação/desassociação | `small-groups.service.spec.ts:512-533` (vincula), `:567-585` (desvincula, `null`) | ✅ PASS |
| AC3: `goal-status` com meta definida → `{goal_pct,current_pct,met,green,yellow,red,total}`, `current_pct` = % green+yellow | fórmula exata `(green+yellow)/total` | `networks.service.spec.ts:143-192` e `networks.spec.ts:146-189` — **ambos os cenários usam só green+red (yellow sempre 0)**; a fórmula real (`networks.service.ts:107`, `(green+yellow)/total`) não é diferenciada de uma fórmula errada `(green)/total` por nenhum teste — **ver Discrimination Sensor, mutação 3, sobrevivente** | ⚠️ GAP — AC3 coberto para green/red, não para a contribuição de `yellow` ao `current_pct` |
| AC4: sem meta → `goal_pct:null, met:null`, contagens úteis | valores exatos | `networks.service.spec.ts:193-213` — `toEqual({goal_pct:null,current_pct:100,met:null,...})` | ✅ PASS |
| AC5: sem células → `total:0, current_pct:null` | sem divisão por zero | `networks.service.spec.ts:215-227` (`toEqual({...,total:0})`) e `networks.spec.ts:194-224` (`AC4/AC5` integração) | ✅ PASS |
| AC6: sem Premium → 403 em todas as rotas de Network | `403` | `apps/api/src/small-groups/networks.controller.spec.ts:46-47` — `expect(requiredPlanForClass()).toBe('premium')` (prova o decorator de classe; o comportamento do `PlanGuard` em si já é coberto por `small-groups-health.spec.ts`/`small-groups-hierarchy-plan-gate.spec.ts` no mesmo guard) | ⚠️ Spec-precision gap (fraco) — nenhum teste de integração HTTP real bate 403 direto em `/networks/*`; a prova é por metadata do decorator + comportamento do guard testado em outra rota |
| AC7: vincular célula a rede de outra congregação → 400 | `400` | `small-groups.service.spec.ts:536-550` — `rejects.toBeInstanceOf(BadRequestException)`, `expect(client.smallGroup.update).not.toHaveBeenCalled()` | ✅ PASS |
| Independent Test: 5 células (4v/1r), meta 80% → 80%/met; +1 vermelha → 66.67%/not met | | `networks.service.spec.ts:143-192`, `networks.spec.ts:146-189` — valores exatos batem | ✅ PASS (mas não discrimina yellow — mesma ressalva do AC3) |

**Status**: ⚠️ Gaps present — 1 confirmed GAP (AC3 yellow-contribution untested/undiscriminated), 3 weak spec-precision notes (AC5 web-visual, AC6-multiply plan-absence, AC6-networks direct-403). Todos os demais 22 critérios: ✅ PASS com evidência direta.

---

## Discrimination Sensor

Executado em `git worktree add /tmp/orbien-mutate HEAD` (descartável, removido ao final — `git worktree remove --force`). Árvore real nunca tocada.

| # | File:line | Description | Killed? |
| - | --------- | ------------ | ------- |
| 1 | `small-groups.service.ts:119` | `classifyHealth`: `daysSince < 14` → `daysSince <= 14` | ✅ Killed — `small-groups.service.spec.ts:67` (`classifyHealth(catorze)` esperado `'yellow'`, mutante devolve `'green'`) |
| 2 | `small-groups.service.ts:233` | `multiply`: checagem de escopo do `cell_leader` (`if (!(await this.canMultiply(...)))`) substituída por `if (false)` — remove o `ForbiddenException` | ✅ Killed — `small-groups.service.spec.ts:298-308` (AC4, `ForbiddenException` esperado) e `:324-341` (RoleAssignment nunca é consultado, assinatura mudou) — 2 testes falharam |
| 3 | `networks.service.ts:107` | `getGoalStatus`: `(green + yellow) / total` → `(green) / total` | ❌ **Survived** — `networks.service.spec.ts` e `networks.spec.ts` passaram inalterados; nenhum fixture usado tem uma célula `yellow` simultânea a `green`/`red`, então a fórmula errada produz o mesmo resultado numérico nos casos testados |

**Sensor depth**: lightweight (3 mutações, default tier — feature não é P0/pagamento/auth)
**Result**: 2/3 killed — ❌ FAIL nessa dimensão (mutante sobrevivente = fix task abaixo)

---

## Interactive UAT Results

Pulado por instrução explícita do orquestrador — fluxo autônomo, sem usuário disponível para UAT interativo. Backend + componentes web foram validados por automação (unit/integration/component tests) apenas.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ — cada task toca só os arquivos que o design/tasks previu |
| Surgical changes | ✅ — `getHierarchy` estendido no lugar, não duplicado; `PATCH /small-groups/:id` reusado para vínculo de rede em vez de rota nova |
| No scope creep | ✅ — sem link de navegação para `/redes` (decisão consciente, documentada); sem critério de saúde alternativo (fora de escopo, respeitado) |
| Matches patterns | ✅ — `useEffect`+axios+`isForbidden` em todo componente web novo (`GroupHealthBadge.tsx`, `GroupGenealogyTree.tsx`, `redes/page.tsx`); `<Button>` para ação primária; `classifyHealth` como função pura exportada (não método), exatamente como o design pediu |
| Spec-anchored outcome check (asserted values match spec) | ✅ para 22/26 linhas da matriz acima; ⚠️ para os 4 marcados |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ — `classifyHealth` tem os 4 casos de fronteira exatos da spec; rotas Premium têm teste de 403 e 200 |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — nenhum teste novo achado fora do escopo de CEL20-01..08 |
| Documented guidelines followed | `docs/TESTES.md` (100% coverage, 3 projects jest), `CLAUDE.md` (RLS USING/WITH CHECK simétricos, ordem do bootstrap, `<Button>` vs `<button>`, `useEffect`+axios) — todos seguidos |

---

## Edge Cases (spec.md)

- [x] `member_ids` inclui o próprio `leader_person_id` da mãe → permitido — `small-groups.service.spec.ts:343-361`
- [x] `leader_person_id` já lidera outra célula → permitido — `small-groups.service.spec.ts:363-374`
- [x] Corrida de duas `multiply` movendo o mesmo `person_id` → segunda falha 400 — `small-groups.service.spec.ts:376-389` (unit) e `small-groups-multiply.spec.ts:221-245` (integração real, contra Postgres)
- [x] Célula deletada com `childGroups` → comportamento existente (`SetNull`), não alterado — nenhuma regressão introduzida (fora do escopo desta feature, não há teste novo nem era esperado)
- [x] `Network` deletada com células vinculadas → `network_id` vira `null` — schema `onDelete: SetNull` (`schema.prisma`), coberto implicitamente pelo Prisma; sem teste de integração explícito para este caso específico (delete de rede com células vinculadas), mas o comportamento é garantido pelo FK do Postgres, não por lógica de aplicação — risco baixo

---

## Gate Check

- **Gate command**: `npm run test:unit -w orbien-backend`, `npm run test:integration -w orbien-backend`, `npm run test:rls -w orbien-backend`, `npm run test -w orbien-web`, `npm run build:api`, `npm run lint`
- **Result**: todos passaram, 0 falhas
  - Unit (API): 262 suites / 2533 testes ✅
  - Integration (API): 15 suites / 72 testes ✅
  - RLS (API): 7 suites / 125 testes ✅
  - Web (Vitest): 105 arquivos / 1216 testes ✅
  - `build:api`: sucesso (cache hit) ✅
  - `lint` (turbo, 5 apps): sucesso, só warnings pré-existentes em `orbien-mobile` (nada relacionado a esta feature) ✅
- **Test count before feature** (medido agora, worktree `f27ab6f`, não confiando nos números relatados pelos batches):
  - Unit (API): 257 suites / 2452 testes
  - Integration (API): 11 suites / 61 testes
  - RLS (API): 6 suites / 118 testes
  - Web (Vitest): 100 arquivos / 1181 testes
- **Test count after feature**: 262/2533 (unit), 15/72 (integration), 7/125 (rls), 105/1216 (web)
- **Delta**: +5 suites/+81 testes (unit API), +4 suites/+11 testes (integration API), +1 suite/+7 testes (rls API), +5 arquivos/+35 testes (web) — todos positivos, nenhuma perda de cobertura
- **Skipped tests**: nenhum
- **Failures**: nenhuma
- **`npm run build:web`**: NÃO rodado como gate desta validação — falha pré-existente confirmada pelo orquestrador tanto nesta branch quanto em `origin/main` limpo (erro de prerender em `/_global-error`/`/_not-found`, `useContext` null, não relacionado a este código). Tratado como gate ignorado por instrução explícita, não como PASS silencioso.
- **Teste flaky conhecido** (`CostCentersModal.test.tsx > dismisses the delete confirmation on escape`, módulo financeiro, não tocado por esta feature): não observado em nenhuma das execuções de `npm run test -w orbien-web` feitas nesta validação (1216/1216 verde). Não investigado com reexecuções adicionais por não ter aparecido.

---

## Fix Plans

### Fix 1: `NetworksService.getGoalStatus` — fórmula `(green+yellow)/total` não discriminada de `(green)/total` pelos testes

- **Root cause**: `networks.service.spec.ts` (AC3, 2 casos) e `networks.spec.ts` (Independent Test P3) sempre fixam `yellow: 0` nos fixtures — nenhuma célula com encontro entre 14–27 dias é incluída na rede testada. A implementação (`networks.service.ts:107`, `(green + yellow) / total`) está correta e bate com o AC3 da spec ("`current_pct` é o percentual de células... com status `green` ou `yellow`"), mas a suíte não prova isso — uma regressão que trocasse `+yellow` por nada passaria despercebida (confirmado pelo Discrimination Sensor, mutação 3).
- **Fix task**:
  - **What**: adicionar um caso de teste (unit em `networks.service.spec.ts` e, opcionalmente, integração em `networks.spec.ts`) com uma rede de N células incluindo pelo menos 1 `green`, 1 `yellow` e 1 `red`, confirmando que `current_pct` conta `green`+`yellow` e exclui `red`.
  - **Where**: `apps/api/src/small-groups/networks.service.spec.ts` (mínimo obrigatório); `apps/api/test/integration/networks.spec.ts` (recomendado, mesmo padrão do Independent Test já existente, com uma célula reunida há ~20 dias para cair em `yellow`)
  - **Verify**: reaplicar a mutação `(green+yellow)→(green)` em `networks.service.ts:107` e confirmar que o novo teste falha (mata o mutante)
  - **Done when**: `npm run test:unit -w orbien-backend` cobre o caso misto; mutação re-testada e morta
- **Priority**: Minor — a implementação está correta (não é um bug em produção), é uma lacuna de cobertura de teste que permitiria uma futura regressão silenciosa nesse cálculo específico.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ---------- |
| CEL20-01 | Pending | ✅ Verified |
| CEL20-02 | Pending | ✅ Verified |
| CEL20-03 | Pending | ✅ Verified |
| CEL20-04 | Pending | ✅ Verified |
| CEL20-05 | Pending | ✅ Verified |
| CEL20-06 | Pending | ✅ Verified |
| CEL20-07 | Pending | ✅ Verified |
| CEL20-08 | Pending | ⚠️ Verified com ressalva (Fix 1 — cobertura de `yellow` no cálculo de `current_pct`) |

---

## Summary

**Overall**: ⚠️ Issues (não bloqueante — 1 gap de cobertura de teste, minor; implementação correta)

**Spec-anchored check**: 22/26 linhas de critério com PASS direto; 3 spec-precision gaps fracos (AC5-web-P1, AC6-multiply-ausência-de-guard, AC6-networks-403-direto); 1 GAP real (AC3-P3, cobertura de `yellow`)
**Sensor**: 2/3 mutações mortas — 1 sobrevivente (Fix 1)
**Gate**: 6/6 comandos obrigatórios passaram, 0 falhas, contagem de testes cresceu em todas as camadas

**What works**: as 23 tasks estão implementadas, commitadas atomicamente, e batem com spec.md/design.md/tasks.md. O `SPEC_DEVIATION` documentado está correto (400 nos dois casos de AC2, como a spec.md pede). O reshape de `getHierarchy` para `{ancestors, tree}` preservou toda asserção anterior e ainda somou o teste de 2 gerações de ancestrais. RLS de `networks` segue o template AD-001 à risca, com `USING`/`WITH CHECK` simétricos, registrado no lugar certo do `bootstrap-db.sh` (antes do passo 4), e coberto pelo catch-all genérico do passo 7 (RLS habilitado em toda tabela `public` fora da lista de exceções) — não tem uma verificação bespoke de predicado como 009/010/012/015 têm, mas isso não é exigido pelo `CLAUDE.md` (que só exige "passo 7 falha se faltar", o que o catch-all garante).

**Issues found**:
1. `NetworksService.getGoalStatus` — cálculo de `current_pct` correto no código, mas não discriminado de uma fórmula que ignorasse `yellow`, por nenhum teste (unit ou integração). Ver Fix 1.

**Next steps**: rotear Fix 1 como fix task ao implementador (adicionar 1-2 casos de teste com célula `yellow` na mistura); depois disso, PASS completo. Não é bloqueante para uso em produção — o comportamento real já está correto, é lacuna de rede de segurança de teste.
