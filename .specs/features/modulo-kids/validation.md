# Módulo Kids Validation

**Date**: 2026-10-26
**Spec**: `.specs/features/modulo-kids/spec.md`
**Diff range**: `origin/main..HEAD` = `b7b3e4cd2d79e45fe15bd078e5d23ba07fa3fd77..5d80d6d1ba3d754b7ddf7522cb480e7030b3d9c8` (50 commits, branch `feat/modulo-kids`)
**Verifier**: independente (autor ≠ verificador). Só leitura na árvore real; mutações em git worktree descartável (removido ao fim).

## Veredito: FAIL ❌

Todos os gates passam e 31 dos 32 ACs têm teste que assere o resultado da spec. O FAIL vem de quatro coisas: (1) o código de retirada ainda pode ser relido pela equipe por `GET /kids/checkins/:id/labels`, o que contradiz o AC 7 de Check-in/out, e um teste assere esse comportamento; (2) um mutante de comportamento sobreviveu (terceiro autorizado como visitante, decisão do dono, sem teste); (3) `GET /persons/households/:id` devolve a criança; (4) a lacuna na checagem de quem altera responsáveis. Nada foi corrigido (regra do Verifier).

| Resumo | Resultado |
|---|---|
| Spec-anchored | 31/32 ACs confirmados (AC 7 de Check-in/out: parcial); 7 edge cases: 5 confirmados, 2 parciais |
| Lacunas de precisão da spec | 6 (abaixo) |
| Gate | build, lint, unit 4067, integration 384, rls 237, web 2131, mobile 1029: 0 falhas |
| Sensor | 35 mutações distintas (+11 reexecuções só no integration): 33 mortas, 2 sobreviventes (M6 equivalente em HTTP; M12 real) |
| Segurança | 1 alto, 3 médios, 3 baixos |

---

## Task Completion

`tasks.md`: T1 a T36 (inclui T19b-e, T32b, T34b, T35b) marcadas `[x]`. Nenhuma bloqueada. Nenhum teste removido: 792 `it(` adicionados e 2 renomeados (5 para 6 categorias de notificação), sem enfraquecimento. A contagem de testes de `origin/main` não foi medida (baseline não rodado).

---

## Spec-Anchored Acceptance Criteria

Caminhos relativos a `apps/api/` salvo indicação. `I:` = `test/integration/`, `S:` = `src/kids/`.

### P1: Turmas e sessões por culto

| AC | Resultado definido na spec | `file:line` + assertion | Resultado |
|---|---|---|---|
| 1 cria turma e lista por idade mínima | grava na congregação; ordenada por min | `I:kids-rooms.spec.ts:41-56` `toMatchObject({min_age_months:24,max_age_months:47,allows_out_of_range:false,congregation_id:h.t2.congregationId})`; `:114-121` `names.indexOf('Bebês') < indexOf('Maternal') < indexOf('Júnior')` | ✅ |
| 2 faixa ausente, min>max ou negativo | 400 | `I:kids-rooms.spec.ts:68-76` `it.each(faixa ausente, só o mínimo, min>max, negativo)` `expect(res.status).toBe(400)`; DTO `S:rooms/dto/kids-room.dto.spec.ts` | ✅ |
| 3 abre sessão única por instância×turma | `KidsSession` única | `I:kids-sessions.spec.ts:73-80` `status 201`, `toHaveLength(2)`, `toMatchObject({status:'open',celebration_instance_id:first.id,...})`; `:85` ordem por idade | ✅ |
| 4 par repetido | 409, sem duplicar | `I:kids-sessions.spec.ts:101-102` `toBe(409)`, `kidsSession.count(...)).toBe(1)`; `:109` `[201,409]` em corrida | ✅ |
| 5 instância sem sessões | sem erro | `I:kids-sessions.spec.ts:91-92` `status 200`, `body toEqual([])` | ✅ |
| 6 instância cancelada | sessões canceladas, sem check-in | `I:kids-sessions.spec.ts:231-233` `every(s => s.status==='cancelled')`; `I:kids-checkin.spec.ts:372-373` 422 `kids_session_cancelled`; `S:checkin/kids-checkin.service.spec.ts:222` instância cancelada 422 | ✅ |
| 7 lote por modelo | abre turmas do modelo em várias instâncias | `I:kids-template.spec.ts:128` `toEqual({instances:3,created:6,already_open:0,skipped_rooms:0})`; `:141` idempotente; `:154` janela | ✅ |

### P1: Cadastro de criança e responsáveis

| AC | Resultado definido | `file:line` + assertion | Resultado |
|---|---|---|---|
| 1 cria Person + HouseholdMember(child) | `is_child`, sem conta, Household do responsável | `I:kids-children.spec.ts:200-209` `child.is_child toBe(true)`, `userAccounts toHaveLength(0)`, `householdMemberships ... role:'child'`, `kidsHealth.allergies toBe(ALERGIA)` | ✅ |
| 2 sem consentimento | 422 + texto do termo | `I:kids-children.spec.ts:153-156` `toBe(422)`, `toMatchObject({code:'kids_consent_required',term_version})`, `typeof term_text toBe('string')` | ✅ (texto só checado como string) |
| 3 terceiro autorizado | grava nome, telefone, `can_pickup` | `I:kids-children.spec.ts:401-408` `toMatchObject({can_pickup:true,...})`, `rosa toMatchObject({full_name,phone,is_child:false})` | ✅ com ressalva: "fica como visitante" (decisão do dono) não é asserido (mutante M12 sobreviveu) |
| 4 remover último primário | 422 | `I:kids-children.spec.ts:462-463` `refused.status toBe(422)`, `count toBe(1)` | ✅ |
| 5 ficha da equipe | alergias + responsáveis; leitura auditada | `I:kids-children.spec.ts:325,333-335` `allergies toBe(ALERGIA)`, `rows.length toBe(before+1)`, `JSON.stringify(rows) not.toContain(ALERGIA)` | ✅ |
| 6 revoga consentimento | impede check-in, mantém histórico | `I:kids-children.spec.ts:587-595` `{revoked:1}`, `revoked_at not null`, `valid false`, criar 422; `I:kids-checkin.spec.ts:361-363` check-in 422 `kids_consent_required` | ✅ |
| 7 secretaria cadastra | exige consentimento `secretaria` | `I:kids-children.spec.ts:230-232` 422 e `consentRecord.count toBe(0)`; `:243` `toMatchObject({origin:'secretaria',version:KIDS_TERM_VERSION,revoked_at:null})` | ✅ |

### P1: Check-in e check-out seguros

| AC | Resultado definido | `file:line` + assertion | Resultado |
|---|---|---|---|
| 1 | `KidsCheckin` com horário, quem entrega, quem recebe, `code` de 4 caracteres | `I:kids-checkin.spec.ts:219-234` `code toMatch(CODE)`, `row toMatchObject({guardian_person_id:mae,checked_in_by:leaderAccountId,celebration_instance_id:ids.i1})` | ✅ ressalva: no check-in pelo app `checked_in_by` é a conta do próprio responsável (`:409`), não "membro da equipe" |
| 1b | 400 sem entrega ou sem quem recebe | `I:kids-checkin.spec.ts:246` `for body of bad: toBe(400)` (sem `guardian_person_id`, sem `child_id`, uuid inválido, `checked_in_by` forçado); sem quem recebe: só unit `S:checkin/kids-checkin.service.spec.ts:185` (usuário sem id) | ✅ (metade só em unit; HTTP não tem como omitir quem recebe) |
| 2 | 409 | `I:kids-checkin.spec.ts:269-271` mesma sessão e outra turma `toBe(409)`, `openCount toBe(1)`; `:293` corrida `[201,409]` | ✅ |
| 3 | avisa, confirma, `age_override=true` | `I:kids-checkin.spec.ts:323-329` `OUT_OF_RANGE_CONFIRM, requires_confirmation, age_months:36,min:0,max:11`; `:334-335` `age_override toBe(true)` | ✅ |
| 3b | 422 "fora da faixa etária da turma", sem confirmação | `I:kids-checkin.spec.ts:312-314` `toBe(422)`, `message toBe('Criança fora da faixa etária da turma')`, `code 'kids_out_of_range'` (com `confirm_out_of_range` true e false) | ✅ (mensagem tem prefixo "Criança"; spec cita em minúsculas) |
| 4 | avisa ao atingir, nunca bloqueia | `I:kids-checkin.spec.ts:351-353` `capacity_warning toEqual({capacity:1,present:1})`, 2º `201` com `{capacity:1,present:2}` | ✅ |
| 5 | etiqueta criança (nome, turma, alergia, código) + responsável (código) | `I:kids-checkin.spec.ts:670-679` `child_label toMatchObject({room_name,has_allergy:true,allergy:ALERGIA,code})`, `guardian_label toEqual({child_name,room_name,code})`, sem `qr` | ✅ |
| 6 | fecha com horário e quem retirou | `I:kids-checkin.spec.ts:444-447` `toMatchObject({picked_up_by_person_id:mae,checked_out_by})`, `checked_out_at not null` | ✅ |
| 7 | 403 sem revelar motivo e avisa líder; código no check-in e ao responsável (`GET /kids/children/:id/checkin`); **não** no roster **nem relido pela equipe depois** | `I:kids-checkin.spec.ts:482-486` `toBe(403)`, `message toBe(GENERIC)`, `noPickup.body toEqual(wrongCode.body)`; `:505-511` auditoria sem código/saúde; aviso ao líder só em unit `S:checkin/kids-checkout.service.spec.ts:142`; roster sem `code` `:619-620` | ⚠️ **PARCIAL**: recusa, auditoria, aviso e roster confirmados. A parte "nem pode ser relido pela equipe depois" é contrariada por `GET /kids/checkins/:id/labels` (ver S1) e o teste assere o contrário (`:690`, `:710`) |
| 8 | override do líder exige motivo, grava | `I:kids-checkin.spec.ts:559-567` `override_reason`, `picked_up_by_name`, `checked_out_by`, `audit toHaveLength(1)`; `:573-575` 400 sem motivo/branco/sem nome | ✅ |
| 9 | 403 a quem não é equipe | `I:kids-checkin.spec.ts:645-649` volunteer fora da sessão, member, visitor, cell_leader `toBe(403)`; `:400-401` check-in | ✅ |

### P2: Escala e contagem

| AC | Resultado definido | `file:line` + assertion | Resultado |
|---|---|---|---|
| 1 escala ligada à sessão | atribuição ligada, reaproveita confirmação e troca | `I:kids-schedule.spec.ts:159` `cm.body.kids_session_id toBe(ids.sMat)`; `:192-194` confirmar mantém acesso | ✅ confirmação; **troca** só estrutural (`celebration-swap.service.ts` reusa `celebration_ministry_id`; `S:sessions/kids-staffing.spec.ts:37` exclui `swapped`), sem teste ponta a ponta |
| 2 falta de voluntários | sinaliza | `I:kids-schedule.spec.ts:212,218-221` `volunteers_missing toBe(1)`; `volunteers_scheduled:1, volunteers_missing:1`; cancelada `0` | ✅ |
| 3 `children` inicial = distintos | total como valor inicial | API `I:kids-attendance.spec.ts:133-136` `checkin_total toBe(3)/(1)/(0)/(0)`; web `AttendanceFormModal.test.tsx` `getByLabelText("Crianças") toHaveValue("5")` | ✅ (o contrato entrega `checkin_total`; `children` fica manual e o front usa o total como valor inicial) |
| 4 valor manual + total ao lado | guarda o lançado | `I:kids-attendance.spec.ts:148,151` `children:5,total:48`; `toMatchObject({checkin_total:3,attendance:{children:5}})` | ✅ |
| 5 Minhas escalas | turma e horário | `I:kids-schedule.spec.ts:201-204` `kids_session toEqual({id,room_id,room_name,status:'open'})`, `celebration.start_time toBe('10:00')` | ✅ |

### P3: Visão da liderança

| AC | Resultado definido | `file:line` + assertion | Resultado |
|---|---|---|---|
| 1 média por turma, só sessões com check-in | média | `I:kids-attendance.spec.ts:195-200` `toEqual({sessions_counted:2,total_children:3,average_children:1.5})`; web `KidsAttendanceCard.test.tsx:32-41` | ✅ |
| 2 sem check-in | estado vazio, nunca zero | `I:kids-attendance.spec.ts:219-223` `toEqual({period,sessions_counted:0,rooms:[]})`; web `KidsAttendanceCard.test.tsx:43-48` "Sem check-in neste período", `queryByText("0")` ausente | ✅ |

**Status**: 31/32 confirmados; AC 7 de Check-in/out parcial.

### Edge cases

- [x] Check-in simultâneo da mesma criança: `I:kids-checkin.spec.ts:293` `[201,409]`, 3 rodadas, sem 500; `I:../rls/kids.spec.ts:353` P2002 do índice parcial.
- [x] Criança sem `birth_date`: `I:kids-checkin.spec.ts:341-342` 422 `kids_birth_date_required`.
- [x] Colisão de código: unit `S:checkin/kids-checkin.service.spec.ts:314` (sorteia de novo) e `:322` (500 depois de 5 tentativas); `S:checkin/kids-checkin-code.spec.ts`; `I:kids-checkin.spec.ts:304` 4 simultâneos, `Set(...).size toBe(4)`.
- [~] Culto termina com check-in aberto: o roster lista quem está presente e o override fecha (`I:kids-checkin.spec.ts:559`), e cancelar sessão com presente dá 422 (`I:kids-sessions.spec.ts:208`). Falta teste do cenário "instância cancelada/encerrada com criança presente: roster lista e override fecha".
- [x] Esqueceu o código: override AC 8 (`I:kids-checkin.spec.ts:553`).
- [x] Duas turmas no mesmo culto: 409 enquanto aberta (`:270`), permitida após check-out (`:284`).
- [~] Turma desativada: nova sessão 422 (`I:kids-sessions.spec.ts:115`); "sessões abertas permanecem" não é asserido (o código simplesmente não toca nas sessões).

**Success criteria**: RLS cruzado ✅ (`test/rls/kids.spec.ts:298-340`); nenhuma retirada sem código ou override com motivo ✅ (`:475-488`, `:573-575`); "check-in em menos de 15 s no celular" sem evidência (requisito não funcional sem teste mensurável).

### Lacunas de precisão da spec

1. AC 1: "membro da equipe que recebe" não vale no check-in pelo app (`checked_in_by` = o próprio responsável).
2. AC 7 versus AC 8 e design: a spec diz que a equipe não relê o código, mas o design deixa `GET /kids/children/:id/checkin` para "responsável do Household ou gestão". Com isso a gestão (secretary, pastor, ministry_leader) relê o código e o override com motivo deixa de ser o único caminho.
3. 3b: a mensagem citada é "fora da faixa etária da turma"; o código devolve "Criança fora da faixa etária da turma".
4. P2 AC 3: "children = total" na prática é `checkin_total` ao lado de `children` manual.
5. "Líder kids" é implementado como qualquer `ministry_leader` (não só o do ministério Kids): `kids.roles.ts:5` (`KIDS_MANAGE_ROLES`).
6. P2 AC 1: "reaproveitando troca de escala" sem critério testável.

---

## Discrimination Sensor

Worktree descartável em `git worktree` (removido), `node_modules` por symlink, banco local, só `teste1-church`/`teste2-church`. Cada mutação rodou o unit e depois o integration do arquivo relevante; um runner por vez; árvore real intocada (`git status` limpo ao fim).

| # | File:line (HEAD) | Mutação | Resultado |
|---|---|---|---|
| M1 | `src/kids/checkin/kids-checkin.service.ts:250` `findPicker` | remover `can_pickup: true` (check-out aceita quem não retira) | ✅ Morta (unit `kids-checkout.service` AC 6; integration `kids-checkin.spec` AC 7 "tio") |
| M2 | `kids-checkin.service.ts:192` `checkOut` | `codeOk = true` (200 com código errado) | ✅ Morta (unit AC 7; integration idem) |
| M3 | `kids-checkin.service.ts:409` `checkAgeRange` | check-in fora da faixa passa com `allows_out_of_range=false` | ✅ Morta (unit 3b; integration `:308`) |
| M4 | `kids-roster.service.ts:70` | incluir `code` no roster | ✅ Morta (unit `:65`; integration `:619`) |
| M5 | `src/persons/persons.service.ts:78` | remover `is_child:false` de `findAll` | ✅ Morta (3 unit) |
| M6 | `kids-guardians.service.ts:97` | `runInTx` vira passagem direta | ❌ Sobreviveu (unit e integration). **Equivalente em HTTP**: `runInTx` reaproveita a transação da requisição (`prisma.service.ts:65-66`); só mudaria para chamada fora de requisição |
| M6b | `kids-guardians.service.ts:98` | remover o `FOR UPDATE` | ✅ Morta, mas só por unit que prende a chamada (`marcar outro como primário rebaixa...`); nenhum teste de PATCH concorrente |
| M6c | `kids-guardians.service.ts:115-118` | promover primário sem rebaixar o anterior | ✅ Morta (unit; integration `:567-573` no M35) |
| M7 | `kids-rooms.service.ts:39` `findAll` | remover filtro tenant/congregação (RLS cobriria) | ✅ Morta (unit prende o `where`) |
| M8 | `kids-checkin.service.ts:151` | `getOpenForChild` sem `assertCanAccess` | ✅ Morta (unit e integration `:755`) |
| M9 | `kids-roster.service.ts:64` | roster não audita leitura de saúde | ✅ Morta (unit `:95`) |
| M10 | `kids-checkin.service.ts:120` | check-in ignora consentimento | ✅ Morta (unit `:266`) |
| M11 | `kids-checkin.service.ts:127` | capacidade passa a bloquear | ✅ Morta (unit AC 4) |
| **M12** | `kids-guardians.service.ts:205` | terceiro autorizado criado como `member` em vez do default `visitor` | ❌ **Sobreviveu** (unit e integration): nenhum teste asserta a classificação do terceiro |
| M13 | `kids-retention.service.ts:54` | anonimizar também responsável membro ativo | ✅ Morta (unit e integration) |
| M14 | `kids-checkin.service.ts:407` | fronteira da faixa (`>=` vira `>`) | ✅ Morta (unit "dentro da faixa") |
| M15 | `kids-checkin.service.ts:106` | instância cancelada deixa de recusar check-in | ✅ Morta (unit `:222`) |
| M16 | `kids-sessions.service.ts:60` | voluntário vê todas as sessões abertas | ✅ Morta (unit) |
| M17 | `kids-checkin.service.ts:212` | override sem checagem de gestão | ✅ Morta (unit `:232`) |
| M18 | `kids-checkin.service.ts:317` | recusa não é auditada | ✅ Morta (unit AC 7) |
| M19 | `kids-children.service.ts:141` | alergia gravada em `audit_logs` | ✅ Morta (unit AC 5) |
| M20 | `kids-checkin.service.ts:373` | check-in de criança de outra família pelo app | ✅ Morta (unit) |
| M21 | `kids-checkin.controller.ts:76` | `GET /kids/children/:id/checkin` aberto ao volunteer | ✅ Morta (unit de papéis; integration `:752`) |
| M22 | `kids-consent.service.ts:42-44` | responsável aceita termo por outra pessoa | ✅ Morta (unit; integration `:115`) |
| M23 | `kids-sessions.service.ts:181` | cancelar sessão com criança presente | ✅ Morta (unit; integration `:208`) |
| M24 | `celebration-instances.service.ts:134` | cancelar instância não cancela sessões | ✅ Morta (unit; integration `:231`) |
| M25 | `kids-retention.service.ts:53` | limite de 12 meses (`lt` vira `lte`) | ✅ Morta (unit "exatamente 12 meses") |
| M26 | `kids-staffing.ts:3` | `declined` conta como escalado | ✅ Morta (unit) |
| M27 | `kids-checkin.service.ts:196` | mensagem diferente para "sem can_pickup" (revela motivo) | ✅ Morta (unit e integration) |
| M28 | `kids-checkin.service.ts:323` | recusa não avisa o líder | ✅ Morta (unit `:142`; sem teste de integração do aviso) |
| M29 | `kids-checkin.service.ts:279` | push "Criança entregue" some | ✅ Morta (unit; integration `:797`) |
| M30 | `persons.service.ts:120` | `GET /persons/:id` devolve criança | ✅ Morta (unit; integration `:354`) |
| M31 | `demographics.service.ts:87` | indicadores contam criança | ✅ Morta (unit) |
| M32 | `member-cap.service.ts:41` | teto de membros conta criança | ✅ Morta (unit) |
| M33 | `kids-checkin.service.ts:239` | `loadCheckin` sem filtro de congregação | ✅ Morta (unit prende o `where`) |
| M34 | `kids-roster.service.ts:34` | roster sem filtro de congregação | ✅ Morta (unit) |
| M35 | `kids-guardians.service.ts:95` | PATCH sem `assertIsPrimaryGuardian` | ✅ Morta (unit; integration `:521`) |

Reexecução só no integration (sem unit, para provar que a camada HTTP mata sozinha) de M1, M2, M3, M4, M8, M21, M22, M24, M30 e M35: todas mortas. M6 sobreviveu também aí.

**Sensor depth**: P0 completo (≥ 5; aqui 35). **Resultado**: 33 mortas, 2 sobreviventes. M12 é fix task (assertar `classification === 'visitor'`). M6 é equivalente em HTTP; se o dono quiser o lock testado, falta um teste de PATCH concorrente (M6b só é pego por unit que prende a chamada).

Observação sobre M7, M33 e M34: são pegos por unit que prende o `where`; sozinha, a camada HTTP não os distingue do RLS (que é a rede de segurança real, coberta em `test/rls/kids.spec.ts`).

---

## Segurança: revisão adversarial

### S1 (alto): equipe relê o código de retirada pela etiqueta

`GET /kids/checkins/:id/labels` (`kids-checkin.controller.ts:49`, `@Roles(...KIDS_FAMILY_ROLES, 'volunteer')`) devolve `child_label.code` e `guardian_label.code` para a equipe a qualquer momento enquanto o check-in estiver aberto (`kids-labels.service.ts:42-66`; só devolve 409 depois da retirada). Os testes asseguram isso (`I:kids-checkin.spec.ts:690` `child_label.code toBe(inn.body.code)`, `:710` `labels(tokenVol, ...)` = 200). Contradiz o AC 7 ("não ... pode ser relido por ela depois"). Com o roster (nome do responsável que entregou) e o `checkin_id`, um voluntário escalado reúne tudo para fechar o check-out sozinho: o código deixa de ser o segundo fator. Reimprimir etiqueta pode ser desejado, mas então a spec precisa dizer, ou a reimpressão da equipe sai sem o código.

### S2 (médio): `GET /persons/households/:id` devolve a criança

`persons.service.ts:429-433` (`members: { include: { person: true } }`) e `persons.controller.ts:55` (`READ_ROLES` inclui `treasurer`). A linha completa da `Person` da criança (nome, nascimento) sai para papéis que não são de gestão Kids, contrariando o AD-013. Sem alergia (saúde fica em `kids_child_health`). Sem teste.

### S3 (médio): gestão relê o código por `GET /kids/children/:id/checkin`

`kids-checkin.controller.ts:76` com `KIDS_FAMILY_ROLES` (inclui `secretary`, `pastor`, `ministry_leader`); teste afirma (`I:kids-checkin.spec.ts:751`). Está no design, mas torna o override (AC 8) opcional para esses papéis e deixa a leitura sem auditoria. Ver precisão 2 e 5.

### S4 (médio): adicionar e remover responsável não exigem ser o primário

`KidsGuardiansService.add` (`:39`) e `remove` (`:132`) só chamam `assertCanAccess` (qualquer adulto do Household); `update` (`:95`) exige o primário. Um adulto da casa que não é responsável (e que podia ser só `member`) consegue incluir um novo autorizado com `can_pickup` ou marcar `is_primary`. Nenhum teste prende o comportamento.

### Baixos

- L1: `PersonsService.update/remove/anonymize` e `PATCH /persons/:id/classification` (`persons.service.ts:138,216,245`) aceitam id de criança (papéis de gestão; sem alergia).
- L2: sem teste de sessão de suporte (`impersonate`) nas rotas kids. Por leitura: `auth`/`common`/`audit` intactos no diff; o token de suporte carrega os `roles` do `platform_support`, então os services kids devolvem 404/403 para dado de criança (`isManager` falso, `requireOwnPersonId`) e o `AuditInterceptor` registra `support_access`. Rotas sem checagem de papel no service (turmas, sessões, resumo) ficam abertas à sessão de suporte, sem dado de criança.
- L3: nenhum limite de tentativas de código no check-out (cada recusa é auditada e avisa o líder, mas não há bloqueio). Escopo de equipe autenticada.

### Itens confirmados sem problema

- (a) RLS 028/029 com `USING` = `WITH CHECK` e `app_congregation_allowed()` (`028_rls_kids.sql`, `029_rls_kids_child_health.sql`); bootstrap com passo 7 para as 5 tabelas (`bootstrap-db.sh` +37 linhas); todo service kids filtra tenant + congregação do token (M7, M33, M34 provam o `where`). `test/rls/kids.spec.ts` cobre cruzado, `USING`/`WITH CHECK`, índice parcial e FK composta.
- (b) Alergia só em `kids_child_health`; `audit_logs` guarda quem/quando/qual criança, nunca o conteúdo (M19 morta; `I:kids-children.spec.ts:335`, `I:kids-checkin.spec.ts:511,624,693`). Respostas de PATCH/lista não trazem saúde (`kids-children.service.ts:12-20`). Roster e etiqueta pela equipe auditam (M9 morta). Anonimizar a pessoa apaga a saúde por trigger (`20261026130100_kids_child_health_erase_on_anonymize`, `test/rls/kids.spec.ts:403`).
- (c) Check-out: código errado e sem `can_pickup` dão o mesmo 403 e a mesma mensagem (M1, M2, M27 mortas; `I:kids-checkin.spec.ts:485-486` `toEqual`).
- (d) Fora o S1 e o S3, o código só aparece na resposta do check-in (a quem o fez) e no endpoint do responsável. Roster sem `code` (M4 morta).
- (e) `is_child=false`: tratados `findAll`, duplicados, `findOne`, demografia (4 consultas), teto de membros, retenção por inatividade (2 consultas), import, visitante (3 pontos). Não tratados, listados em S2 e L1; as demais consultas de `Person` (financeiro, small-groups, eventos) partem de id explícito e não listam criança.
- (f) `@RequiresPlan('premium')` no nível de classe em todos os 8 controllers kids; `@Roles` em todos os métodos (checkin, sessões, template, rooms, attendance) ou no nível de classe (children, guardians, consent). Teste Starter 403 em cada área.
- (g) `GET /kids/children/:id/checkin`: `assertCanAccess` (M8 morta), 404 para criança alheia, 404 sem check-in aberto, volunteer 403. `GET /kids/sessions/open`: só turma e culto de hoje, sem dado de criança (`I:kids-sessions-open.spec.ts:145` regex), voluntário só as escaladas (M16 morta), declarada antes de `:id`.
- (h) `AuditInterceptor`, `RolesGuard`, auth e impersonate sem alteração no diff (`git diff --stat -- src/auth src/common src/audit`: só `app.module.ts` +2 linhas).
- Dados de teste só em `teste1-church`/`teste2-church`; nenhuma referência a `doca-church` além de avisos "nunca".

---

## Code Quality

| Princípio | Status |
|---|---|
| Sem recurso além do pedido | ✅ |
| Segue padrões (guards, `runInTx`, `writeAuditLog`) | ✅ |
| Testes mapeiam para ACs e não são rasos (conferido por mutação) | ✅ exceto M12 |
| Valor asserido = resultado da spec | ⚠️ AC 7 (labels) e 3b (mensagem com prefixo) |
| Cobertura por camada (domínio 1:1 com ACs; rotas feliz/borda/erro) | ✅ |
| Diretrizes seguidas | `CLAUDE.md` (RLS, `app_user`, premium, testes só em teste1/teste2, `is_child`); `tasks.md` matriz de testes |

---

## Gate Check

Rodados na árvore real, em sequência, sem alterá-la.

| Gate | Resultado |
|---|---|
| `npm run build:api` | exit 0 (turbo "cache hit", replay) |
| `npm run lint -w orbien-backend` | exit 0 |
| `npm run test:unit -w orbien-backend` | 347 suites, 4067 passed, 0 failed |
| `npm run test:integration -w orbien-backend` | 34 suites, 384 passed, 0 failed |
| `npm run test:rls -w orbien-backend` | 19 suites, 237 passed, 0 failed |
| `npm run test -w orbien-web` | 1ª rodada: 2130 passed, 1 failed (`CostCentersModal.test.tsx` "dismisses the delete confirmation on escape"); 2ª rodada: 173 files, 2131 passed, 0 failed |
| `npm run test -w orbien-mobile` | 98 suites, 1029 passed, 0 failed |

O teste do `CostCentersModal` é intermitente e **não é do Kids**: arquivo fora do diff, falha ora em `HEAD` ora em `origin/main` (reproduzido nos dois: 1 falha em 3 rodadas cada), timing do foco do base-ui ao apertar Escape.

Não rodados: `npm run e2e -w orbien-web` (Playwright) e `scripts/pre-push.sh` (fora do pedido).

---

## Fix Plans (não executados)

1. **Blocker/Major, S1**: tirar `code` de `child_label`/`guardian_label` no `GET .../labels` para a equipe (ou fechar a rota para a equipe depois do check-in) e inverter os asserts `:690` e `:710`; ou registrar na spec que a reimpressão revela o código à equipe.
2. **Major, M12**: asserir `classification === 'visitor'` no terceiro autorizado (`I:kids-children.spec.ts:407`).
3. **Major, S2**: filtrar `is_child` em `findHousehold` (ou reduzir o `person` do membro `child`) + teste.
4. **Major, S4**: decidir se `add`/`remove` de responsável exigem o primário (ou a gestão) e testar.
5. **Minor**: decidir S3 (gestão relê o código) e a precisão 5 (`ministry_leader` de qualquer ministério); testes para "culto encerrado com criança presente", "turma desativada mantém sessões abertas", troca de escala de sessão kids e sessão de suporte; L1 e L3.

## Requirement Traceability Update

`spec.md` ainda marca KIDS-01 a KIDS-12 como Pending; não foi alterado (o Verifier não edita a spec).

| Requisito | Novo status |
|---|---|
| KIDS-01..07, 10, 11, 12 | ✅ Verificado |
| KIDS-08 (check-in, etiquetas) | ✅ Verificado |
| KIDS-09 (check-out seguro) | ❌ Precisa de correção (S1) |

## Summary

**Overall**: ❌ Not Ready (1 ajuste de segurança bloqueante, S1, e 3 de nível médio).
**Spec-anchored check**: 31/32 ACs; 6 lacunas de precisão.
**Sensor**: 33/35 mortas (M6 equivalente; M12 real).
**Gate**: tudo verde (web com 1 falha intermitente pré-existente na 1ª rodada).

**What works**: RLS por congregação, 409 em corrida, recusa genérica auditada, faixa etária e capacidade, consentimento, roster sem código, anonimização que preserva membro ativo, `is_child` nas listagens principais, escala por sessão, contagem sugerida, indicadores, premium e papéis em todas as rotas.

**Next steps**: aplicar os fix plans 1 a 4 e re-verificar (iteração 1 de no máximo 3).

---

# Rodada 2

Verifier independente (autor ≠ verificador). Escopo: `git diff 8feff3a..HEAD` (commits `5cd91cf`, `83b61e3`, `6ff58ef`). Nada foi corrigido pelo Verifier.

## Veredito: PASS

S1 e M12 fechados. S2, S3 e S4 estão aceitos pelo dono (spec, "Decisões", 2026-10-26). Gates verdes.

## S1: reimpressão de etiquetas (`5cd91cf`)

| Regra (spec AC 7) | Evidência `file:line` + asserção | Resultado |
|---|---|---|
| Só atende quem fez o check-in (`checked_in_by` = usuário do token) | `kids-labels.service.ts:43` `if (checkin.checked_in_by !== actor.userId) throw new ForbiddenException(...)`; `I:kids-checkin.spec.ts` `labels(leader, inn.body.id).status` `toBe(200)` (líder fez o check-in) | PASS |
| Gestão que não fez o check-in: 403 | `I:kids-checkin.spec.ts` `labels(otherManager /*secretary*/, ...).status` `toBe(403)` | PASS |
| Volunteer escalado que não fez: 403 | `labels(tokenVol, ...).status` `toBe(403)` (comentário "escalado em sMat") | PASS |
| Member (outro responsável e a própria mãe quando o líder fez o check-in) e visitor: 403 | `labels(tokenMae|tokenOutra|visitor, ...)` `toBe(403)` | PASS |
| Só enquanto aberto | `kids-labels.service.ts:44` 409 se `checked_out_at`; teste existente "409 depois da retirada" mantido | PASS |
| Quem fez pelo app reimprime (200); outro depois não | `I:kids-checkin.spec.ts` novo teste: `labels(tokenMae)` `toBe(200)`, `labels(leader)` `toBe(403)` | PASS |
| POST de check-in segue devolvendo `labels` | `kids-checkin.controller.ts:45` `{ ...checkin, labels: await this.labelsService.forCheckin(actor, checkin.id) }`; `inn.body.labels.child_label` asserido no mesmo spec | PASS |
| Unit prende a regra | `kids-labels.service.spec.ts` "AC 7": para `outroLider`, `volunteer`, `parent`, `visitor` (com `canOperate` = true) `rejects.toBeInstanceOf(ForbiddenException)` e `kidsChildHealth.findUnique` `not.toHaveBeenCalled()` | PASS |

**Alteração dos testes antigos: APROVADA.** Os asserts anteriores (200 para volunteer escalado, gestão lendo `child_label.code`, 404 para outro responsável) eram exatamente o que a validação da rodada 1 apontou como contradição do AC 7. A spec foi emendada no mesmo ciclo (AC 7 e linha "Reimpressão de etiquetas") e os testes passaram a assertar o valor da spec (403) em vez de enfraquecer a asserção. Um caso passou de 404 para 403 para "outro responsável", coerente com a checagem que agora vem antes do acesso à criança e não revela a existência por papel.

**Contagem unit 4067 → 4066: justificada.** Removido em `kids-labels.service.spec.ts` o teste "responsável de outra criança: 404 do acesso, nada lido", que dependia do `KidsChildAccessService.assertCanAccess`, não mais injetado no service. Os outros dois ("403 para voluntário fora da sessão e papéis sem relação" e o do responsável) foram reescritos, não removidos. O cenário do outro responsável continua coberto: no loop do teste "AC 7" (`parent`, cujo `userId` ≠ `checked_in_by`) e na integração (`tokenOutra` 403). Integração subiu 384 → 385 (teste novo do responsável que fez o check-in).

**Web não depende do GET:** `CheckinDialog.tsx:155` imprime com `result.labels` (retorno do POST); `getLabels` (`apps/web/src/lib/kids.ts:395`) só é referenciado por `kids.test.ts:205`, nenhum componente ou página o chama. Resíduo baixo: função morta no web (ver abaixo).

## M12: classificação do terceiro autorizado (`83b61e3`)

Teste: `I:kids-children.spec.ts:407` `expect(rosa).toMatchObject({ ..., is_child: false, classification: 'visitor' })`. O valor `visitor` vem do default do banco (`createThirdParty`, `kids-guardians.service.ts:196-206`, não passa `classification`).

**Mutação refeita em worktree descartável** (removido ao final; árvore real intocada): `classification: 'member'` em `createThirdParty`. Resultado: **MORTA**: `Expected "classification": "visitor"`, `Received "member"`, falha em `kids-children.spec.ts:407` (1 failed, 44 passed). Discrimina.

## Gate (árvore real, um runner por vez, banco local, tenants teste1/teste2)

| Gate | Resultado |
|---|---|
| `npm run test:unit -w orbien-backend` | 347 suites, 4066 passed, 0 failed |
| `npm run test:integration -w orbien-backend` | 34 suites, 385 passed, 0 failed |
| `npm run test:rls -w orbien-backend` | 19 suites, 237 passed, 0 failed |

`git status` limpo antes do commit deste relatório.

## Continua aberto (baixo risco, não bloqueia)

- **L1**: `PersonsService.update/remove/anonymize` e `PATCH /persons/:id/classification` aceitam id de criança (papéis de gestão, sem alergia).
- **L2**: sem teste de sessão de suporte (`impersonate`) nas rotas kids; rotas sem checagem de papel no service (turmas, sessões, resumo) ficam abertas à sessão de suporte, sem dado de criança.
- **L3**: sem limite de tentativas de código no check-out (cada recusa é auditada e avisa o líder).
- **Precisões da spec** (rodada 1): itens ⚠️ de precisão ainda anotados (inclui a precisão 5, `ministry_leader` de qualquer ministério) e testes pendentes para "culto encerrado com criança presente", "turma desativada mantém sessões abertas" e troca de escala de sessão kids.
- **M6 equivalente em HTTP** (lock do PATCH concorrente só pego por unit).
- **Resíduo web**: `getLabels` em `apps/web/src/lib/kids.ts` ficou sem uso em produção; remover ou manter com teste é decisão do dev.
- **PROD-39** (pendência registrada em `docs/PLANO.md`): continua aberta; fora do escopo desta rodada.
- Fora do gate: `npm run e2e -w orbien-web` e `scripts/pre-push.sh` não rodados; teste intermitente do `CostCentersModal` (web, não é do Kids) segue pré-existente.

---

# Rodada 3

Verifier independente (autor ≠ verificador). Escopo: `git diff 003f66e..HEAD -- apps .specs docs scripts .github` (30 commits, até `b8d035c`). Nada foi corrigido pelo Verifier; mutações só em worktree descartável (removido ao final, sem `git stash`; árvore real limpa).

## Veredito: PASS

Nenhum bloqueio de segurança. Gates verdes, 29 mutações novas (27 mortas, 2 sobreviventes equivalentes). Lacunas abertas são de baixo risco.

## R3-1 · QR de check-in e de check-out

| Critério | `file:line` + asserção | Resultado |
|---|---|---|
| QR de check-in: 5 min, uso único, preso a criança + responsável, só o hash do segredo no banco | `kids-qr.service.ts:100-118` (`sha256(secret)`, `KIDS_QR_TTL_SECONDS = 300`); `I:kids-qr.spec.ts:166` (201, só o HASH vai ao banco) | PASS |
| Só responsável cadastrado + adulto do Household emite; 404 aos demais, 409 se presente, reemitir invalida o anterior | `I:kids-qr.spec.ts:182`, `:191`, `:199`; `kids-qr.service.ts:77-107` | PASS |
| Expirado, usado, forjado, malformado, inexistente: 403 idêntico, motivo só na auditoria `kids.checkin_qr_denied` | `I:kids-qr.spec.ts:233` (todos `toEqual` ao mesmo corpo), `:255` (motivo em `audit_logs`) | PASS |
| Uso único atômico (`UPDATE ... WHERE used_at IS NULL AND expires_at > now`) | `kids-qr.service.ts:148-152`; `I:kids-qr.spec.ts:224`, `:349` (duas leituras simultâneas: um 201, um 403) | PASS |
| Falha do check-in (409, 422 faixa/consentimento/responsável removido/sessão cancelada) NÃO consome o QR | `I:kids-qr.spec.ts:265`, `:273`, `:286`, `:300`, `:311` (QR segue válido) | PASS |
| Papéis: responsável não lê QR; voluntário não escalado também; outro tenant/congregação: 403 (RLS) | `I:kids-qr.spec.ts:323`, `:338` | PASS |
| Check-out por QR = código digitado: `can_pickup`, 403 idêntico, auditoria, contagem | `I:kids-qr.spec.ts:378` (fecha), `:388` (tio sem `can_pickup`: mesmo corpo), `:398` (forjado/outro check-in/adulterado: `toEqual(wrong.body)`, tentativas = 4, 4 auditorias) | PASS |
| `code` e `qr` juntos ou nenhum: 400; responsável não fecha o próprio check-in | `I:kids-qr.spec.ts:433`, `:440` | PASS |
| Vazamento do `qr` de check-out | Só `getOpenForChild` o monta (`kids-checkin.service.ts:212`), atrás de `access.assertCanAccess` e `KIDS_FAMILY_ROLES` (`kids-checkin.controller.ts:106`); o `select` do roster e das listagens não traz `code`/`qr`; `AuditInterceptor` só lê `tenant_id` do corpo (`audit.interceptor.ts:161`); `audit()` só grava ids e `reason`; `KidsQrService` não tem logger | PASS (por estrutura; ver lacuna 3) |

Observação de leitura: HMAC com chave derivada de `JWT_SECRET` (`kids-qr.service.ts:64-68`), comparação em tempo constante (`safeEqual`), checagem de que o QR é do check-in esperado antes da assinatura (`:47`).

## R3-2 · Limite de 5 tentativas

| Critério | Evidência | Resultado |
|---|---|---|
| Função `kids_register_checkout_failure`: `SECURITY DEFINER`, `search_path = public, pg_temp`, `REVOKE ... FROM PUBLIC`, `EXECUTE` só para `orbien_app`, escopo por id+tenant+congregação+aberto, `coluna + 1` atômico | `030_rls_kids_checkout_attempts.sql:27-47`; verificação com `RAISE EXCEPTION` no próprio script (`:49-66`) e no passo 7 (`bootstrap-db.sh:733`); sem escalada: só incrementa uma coluna de uma linha aberta, não executa SQL dinâmico, não recebe identificador de usuário | PASS |
| Teste de privilégio da função | `I:kids-checkout-lock.spec.ts:247` (`app_user` não chama; fora do escopo devolve NULL) | PASS |
| Contador sobrevive ao 403 (fora da transação) | `I:kids-checkout-lock.spec.ts:131` (3 erros = 3 no banco) | PASS |
| 4 falhas + código certo fecha; 5ª trava | `I:kids-checkout-lock.spec.ts:140`, `:149` | PASS |
| Travado devolve o MESMO 403 com código certo; check-in segue aberto; `kids.checkout_locked` uma vez | `I:kids-checkout-lock.spec.ts:149`; `kids-checkin.service.ts:237-244` | PASS |
| Só `checkout-override` destrava | `I:kids-checkout-lock.spec.ts:184`; `I:kids-qr.spec.ts:417` (nem o QR verdadeiro fecha) | PASS |
| Push ao líder: recusa nas 4 primeiras, `kids_checkout_locked` na 5ª, sem nome de criança | `I:kids-checkout-lock.spec.ts:173`; `kids-leader-alert.service.ts:41-56` | PASS |
| Concorrência: nenhuma perda, só um trava | `I:kids-checkout-lock.spec.ts:204` (8 simultâneos), `:218` (5 simultâneos) | PASS |
| Pessoa sem `can_pickup` com código certo não gasta tentativa | `I:kids-checkout-lock.spec.ts:237`; `kids-checkin.service.ts:~408` (`reason === 'code_mismatch'`) | PASS |

**Limite conhecido (tentativas em voo): aceitável.** O teto efetivo é 5 + as requisições já em voo quando a 5ª é gravada; o contador final é exato e a rota é só da equipe autenticada e escalada. Sobre um espaço de ~920 mil códigos, mesmo uma rajada de dezenas de requisições paralelas move a chance de acerto na ordem de 1e-5 a 1e-4. Fechar de vez exigiria condicionar o sucesso a `checkout_failed_attempts < 5` num UPDATE atômico (lacuna 1, baixa).

## R3-3 + FIX3 · Push

| Critério | Evidência | Resultado |
|---|---|---|
| Entregue: primário + demais com `can_pickup`, com conta ativa, exceto quem retirou | `U:kids-pickup-notice.service.spec.ts:58`, `:64`, `:74`, `:93`, `:99` | PASS |
| Recebida: só primário com conta; o primário que fez o check-in não recebe; dois primários: só o outro | `U:...spec.ts:146`, `:173`, `:179`, `:187`, `:193` | PASS |
| Texto: só primeiro nome e turma, ficha de saúde nunca consultada | `U:...spec.ts:80`; `kids-pickup-notice.service.ts:55-66` | PASS |
| `data` com `child_id` (strings; `toEqual` do objeto exato); alertas ao líder sem `child_id` | `kids-pickup-notice.service.ts:106`, `kids-leader-alert.service.ts:86`; `U:...spec.ts:36`, `:146` | PASS |
| Preferência `kids` (AD-003, `!= 'false'`) | `kids-pickup-notice.service.ts:104`; `U:...spec.ts:36`; coluna/migration `20261026150000_add_kids_to_notification_preferences` (anterior à rodada 2, sem alteração) | PASS |
| Best-effort: falha de push não desfaz o check-in/out | `U:...spec.ts:124`, `:137`, `:203` | PASS |

## R3-4 · Busca de adultos · R3-5 · `checkin_total` · R3-6 · RLS 028

| Critério | Evidência | Resultado |
|---|---|---|
| Só `KIDS_MANAGE_ROLES`; resposta mínima (id, nome, telefone mascarado); sem criança, removido, anonimizado, outro tenant/congregação; limite 20; mínimo 2 caracteres | `kids-guardians.controller.ts:47-51`; `I:kids-guardian-search.spec.ts:57`, `:65`, `:74`, `:83`, `:92`, `:99`, `:114`; `kids-guardian-search.service.ts:38-68` | PASS |
| `checkin_total` por instância em `GET /celebrations/instances`, mesmo número da contagem de público | `celebration-instances.service.ts:68-76`; `I:kids-attendance.spec.ts:133-136`, `:151`, `:162` | PASS |
| DEC-1: instância cancelada não conta nada | `celebration-attendance.service.ts:58-62` (filtro `status: { not: cancelled }`); mutante M10 morto | PASS |
| RLS 028 com `ENABLE`/`FORCE` explícitos por tabela, policies simétricas (`USING` = `WITH CHECK`), verificação no próprio script | `028_rls_kids.sql:10-74`; `T:rls/kids.spec.ts` (+39 linhas) | PASS |
| 030 e 031 no `bootstrap-db.sh` e no passo 7 | `bootstrap-db.sh:225-231`, `:716`, `:733` | PASS |

## COV-1..6, WEB, MOB, DEC-2/DEC-3

| Item | Evidência | Resultado |
|---|---|---|
| COV-1 sessão de suporte | `I:kids-support-session.spec.ts` (250 linhas, novo) | PASS |
| COV-2 `FOR UPDATE` em `kids-guardians` | **Correção real**: `kids-guardians.service.ts:97-105` relê o responsável depois do lock (`current`), em vez de decidir com `row` lido antes. `I:kids-guardians-concurrency.spec.ts:76`, `:87`, `:100`, `:113` (invariante de um primário). Mutantes M18 (sem `FOR UPDATE`, morto em integração) e M19 (sem releitura, morto em unit) | PASS |
| COV-3 culto encerrado com criança presente · COV-4 turma desativada · COV-5 troca de escala | `I:kids-ended-service.spec.ts`, `I:kids-room-deactivated.spec.ts`, `I:kids-swap.spec.ts` | PASS |
| WEB-1 leitor de QR (câmera, `kidsci1` faz check-in, `kidsco1` abre a entrega, escalada após 3 recusas) | `QrReader.test.tsx`, `QrDesk.test.tsx`, `CheckoutDialog.test.tsx`; e2e `apps/web/e2e/kids-balcao.spec.ts` (+44, não executado aqui) | PASS |
| WEB-2/3/5 busca de responsável no cadastro, sugestão de total no detalhe da celebração, `getLabels` removido | `ChildFormModal.test.tsx`, `CelebrationDetailSheet.test.tsx`; `grep getLabels apps/web/src` vazio no código de produção | PASS |
| MOB-1..4 QR do responsável, QR de retirada, leitura pela equipe, toque no push | `qr.test.tsx`, `codigo.test.tsx`, `sessao.test.tsx`, `KidsQrScanner.test.tsx`, `onesignal-client.test.ts` | PASS |
| DEC-3 `test:cov` com heap de 4096 | Único arquivo de configuração tocado: `apps/api/package.json` (script `test:cov` agora chama `node --max-old-space-size=4096 ../../node_modules/jest/bin/jest.js ...`, mesmos projetos e flags) e `docs/CI.md`. Nenhum `jest.config`, `vitest.config` ou `ci.yml` alterado | PASS |
| DEC-2 piso de cobertura do web | Nenhum arquivo de configuração do web alterado; só testes (`CostCentersModal`, `ChildrenPanel`, `RoomsPanel`, etc.). Piso intacto | PASS |

## Discrimination Sensor (rodada 3)

Worktree descartável em `scratchpad/wt` (removido); suítes: unit `src/kids src/celebrations` e, se sobrevivesse, integração `test/integration/kids*`.

| # | Mutação | Arquivo | Resultado |
|---|---|---|---|
| M1 | QR de check-in expirado aceito (pré-checagem e `expires_at > now` removidos) | `kids-qr.service.ts` | Morta |
| M2 | QR de check-in sem uso único | `kids-qr.service.ts` | Morta |
| M3 | HMAC inválido aceito no QR de check-out | `kids-qr.service.ts` | Morta |
| M3b | QR de outro check-in aceito | `kids-qr.service.ts` | Morta |
| M4 | QR errado não conta tentativa (variante com tipo novo) | `kids-checkin.service.ts` | Morta, mas por erro de tipo (compilação); refeita como M4b |
| M4b | QR errado vira `pickup_not_allowed` (não conta) | `kids-checkin.service.ts` | Morta (5 testes) |
| M5 / M5b | Trava na 6ª / na 4ª tentativa | `kids-checkin.service.ts` | Mortas |
| M6 | Pré-checagem `>=` vira `>` (6ª tentativa com código certo passa) | `kids-checkin.service.ts` | Morta |
| M7 / M7b | Travado destrava com código digitado certo / com QR certo | `kids-checkin.service.ts` | Mortas |
| M8 | Push de entrega ao próprio que retirou | `kids-pickup-notice.service.ts` | Morta |
| M8b | Push de recebida ao primário que fez o check-in | `kids-pickup-notice.service.ts` | Morta |
| M8c | Push de recebida também aos `can_pickup` | `kids-pickup-notice.service.ts` | Morta |
| M8d | Push sem filtro de preferência `kids` | `kids-pickup-notice.service.ts` | Morta |
| M8e | Push a responsável sem conta ativa | `kids-pickup-notice.service.ts` | Morta |
| M9 | `is_child` fora da busca (`findMany`) | `kids-guardian-search.service.ts` | Morta |
| M9b | `is_child` fora da busca (SQL de dígitos) | `kids-guardian-search.service.ts` | **Sobreviveu, equivalente**: os ids do SQL entram num `OR` do `findMany`, que reaplica `is_child: false` |
| M10 | Instância cancelada conta em `checkin_total` | `celebration-attendance.service.ts` | Morta |
| M11 | Busca sem filtro de congregação (`findMany`) | `kids-guardian-search.service.ts` | Morta |
| M11b | Busca sem filtro de congregação (SQL de dígitos) | `kids-guardian-search.service.ts` | **Sobreviveu, equivalente** (mesmo motivo de M9b) |
| M12 | QR emitido a quem não é `KidsGuardian` | `kids-qr.service.ts` | Morta |
| M13 | `pickup_not_allowed` gasta tentativa | `kids-checkin.service.ts` | Morta |
| M14 | Emitir não invalida QRs anteriores | `kids-qr.service.ts` | Morta |
| M15 | `kids.checkout_locked` na 4ª em vez da 5ª | `kids-checkin.service.ts` | Morta |
| M16 | Segredo do QR guardado em claro | `kids-qr.service.ts` | Morta |
| M17 | Push sem `child_id` no `data` | `kids-pickup-notice.service.ts` | Morta |
| M18 | PATCH de responsável sem `FOR UPDATE` | `kids-guardians.service.ts` | Morta (só em integração, 3 falhas) |
| M19 | PATCH de responsável sem releitura pós-lock | `kids-guardians.service.ts` | Morta |

**Profundidade**: P0 completa (segurança/dados de criança). **Resultado**: 29 injetadas, 27 mortas, 2 sobreviventes equivalentes (M9b, M11b: filtros redundantes no SQL, defesa em profundidade). Nenhum sobrevivente real.

## Gate (árvore real, um runner por vez, banco local, tenants teste1/teste2)

| Gate | Resultado |
|---|---|
| `npm run build:api` | OK |
| `npm run lint -w orbien-backend` | 0 problemas |
| `npm run test:unit -w orbien-backend` | 352 suites, 4202 passed, 0 failed (rodada 2: 4066) |
| `npm run test:integration -w orbien-backend` | 42 suites, 474 passed, 0 failed (rodada 2: 385) |
| `npm run test:rls -w orbien-backend` | 19 suites, 244 passed, 0 failed (rodada 2: 237) |
| `npm run test -w orbien-web` | 175 arquivos, 2209 passed, 0 failed |
| `npm run test -w orbien-mobile` | 100 suites, 1081 passed, 0 failed |

Nenhum teste removido do Kids na rodada (contagens só sobem). Não rodados: `npm run e2e -w orbien-web`, `test:cov` e `scripts/pre-push.sh`.

## Continua aberto (baixo risco, não bloqueia), por prioridade

1. **Travamento lê o contador carregado no início da requisição** (`kids-checkin.service.ts:237`): rajada paralela ainda avalia código a mais do que 5. Aceito no design (R3-2, "Limite conhecido"); fechar com `UPDATE ... WHERE checkout_failed_attempts < 5` no caminho de sucesso se o dono quiser.
2. **Contador falha aberto**: se `kids_register_checkout_failure` der erro, `registerCodeFailure` devolve `null` e a tentativa não conta nem trava (`kids-checkin.service.ts`, `registerCodeFailure`). Best-effort por decisão; gera log de erro.
3. **Sem asserção negativa de que `qr` não aparece** no roster, na resposta do POST de check-in nem no `after` da auditoria (hoje garantido por estrutura: `select` explícito e `audit()` só com ids). Um teste `not.toHaveProperty('qr')` travaria a regressão (`I:kids-qr.spec.ts:370` só cobre o caso positivo).
4. **Filtros redundantes no SQL da busca** (`kids-guardian-search.service.ts:48-49`): equivalentes, mantidos como defesa em profundidade.
5. **Contagem de recusas do balcão é do componente** (escala após 3, `CheckoutDialog.tsx`), o servidor trava em 5; a tela só orienta, a autoridade é o servidor.
6. **Limite aceito pelo design**: o QR de check-out vale enquanto o check-in estiver aberto e equivale ao código.
7. Herdado: L1 (`PersonsService` aceita id de criança), L2 parcial (rotas sem checagem de papel no service ficam abertas à sessão de suporte; COV-1 cobre o que expõe dado de criança), PROD-39 em `docs/PLANO.md`, intermitência do `CostCentersModal`.
8. L3 da rodada 2 (sem limite de tentativas) está **fechada** por R3-2.

## Summary

**Overall**: ✅ Ready.
**Spec-anchored check**: todos os ACs de R3-1 a R3-6 com `file:line` e asserção do valor da spec; 0 lacunas de precisão novas.
**Sensor**: 27/29 mortas, 2 equivalentes.
**Gate**: 4202 + 474 + 244 + 2209 + 1081 passed, build e lint limpos.
