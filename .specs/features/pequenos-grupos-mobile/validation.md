# Pequenos Grupos no Mobile (MOB-09) Validation

**Date**: 2026-09-09
**Spec**: `.specs/features/pequenos-grupos-mobile/spec.md`
**Diff range**: `origin/main..HEAD` (branch `feat/pequenos-grupos-mobile`, first code commit `803f3de`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | `GET /small-groups/mine` — service + controller, commit `803f3de` |
| T2   | ✅ Done | `member` liberado em `findByGroup`, `findOne` intacto, commit `7ee7a0d` |
| T3   | ✅ Done | tipos do domínio, commit `e275e5e` |
| T4   | ✅ Done | `pequenos-grupos-client.ts`, commit `c252021` |
| T5   | ✅ Done | aba "Grupos" na tab bar, commit `4405c70` |
| T6   | ⚠️ Done com gap | tela lista grupos — retry de erro não implementado (ver AC3 abaixo) |
| T7   | ⚠️ Done com gap | tela de encontros — retry de erro não implementado |
| T8   | ✅ Done | material do encontro |
| T9   | ✅ Done | presença — roster, marcar, enviar, erro preserva seleção |

All 9 commits present on the branch, one per task, atomic, matching `tasks.md` commit messages.

---

## Spec-Anchored Acceptance Criteria

### P1: Ver meus grupos

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| -------------------------- | --------------------- | ------------------------ | ------ |
| WHEN o usuário abre "Grupos" THEN lista grupos com nome, horário/recorrência, papel | Nome, `meeting_time`/`recurrence`, `role` mapeados de `GroupMembership` | `apps/mobile/src/__tests__/app/(tabs)/grupos.test.tsx:23-34` — `expect(screen.getByText("Grupo do Bairro — Líder — 19:30")).toBeTruthy()`; backend: `apps/api/src/small-groups/small-groups.service.spec.ts:451-477` — `expect(result).toEqual([{ id: 'sg1', ..., role: 'leader' }, ...])` | ✅ PASS |
| WHEN o usuário não participa de nenhum grupo THEN estado vazio explícito, nunca indistinguível de erro | Mensagem de estado vazio dedicada, distinta do estado de erro | `apps/mobile/src/__tests__/app/(tabs)/grupos.test.tsx:48-57` — `expect(screen.getByTestId("grupos-empty")).toBeTruthy(); expect(screen.getByText("Você não participa de nenhum grupo.")).toBeTruthy()` | ✅ PASS |
| WHEN a busca falha (rede/servidor) THEN estado de erro **com opção de tentar novamente** | Erro visível **e ação de retry** disponível ao usuário | `apps/mobile/src/app/(tabs)/grupos.tsx:43-49` — bloco de erro renderiza só `<Text>{error}</Text>`, sem `onPress`/botão de retry; `apps/mobile/src/__tests__/app/(tabs)/grupos.test.tsx:59-70` só verifica a mensagem, nunca uma ação de retry | ❌ GAP — não implementado, não testado (ver Fix Plans) |

### P1: Ver e abrir o material do grupo

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| -------------------------- | --------------------- | ------------------------ | ------ |
| WHEN abre um grupo THEN lista encontros (mais recentes primeiro) via `GET /small-groups/:groupId/meetings` | Ordenação desc por `occurred_at` | `apps/mobile/src/__tests__/app/grupo/[id].test.tsx:23-35` — `expect(list.props.data.map(m => m.id)).toEqual(["m2", "m1"])` (m2 é 2026-09, m1 é 2026-08) | ✅ PASS |
| WHEN abre um encontro THEN lista materiais visíveis pro papel (`GET .../materials`) | Materiais filtrados por `visibility`/role já no backend; mobile só exibe o que a API devolve | `apps/mobile/src/__tests__/app/grupo/encontro/[id].test.tsx:48-63` — `expect(Linking.openURL)…`; backend já cobre o filtro em `meetings.controller.spec.ts:71-73` (roles) — mobile não re-filtra, comportamento correto por design | ✅ PASS |
| WHEN toca material `pdf`/`doc` THEN abre `file_url` no navegador do sistema | `Linking.openURL(file_url)` chamado com a URL exata | `apps/mobile/src/__tests__/app/grupo/encontro/[id].test.tsx:48-63` — `expect(Linking.openURL).toHaveBeenCalledWith("https://x.test/a.pdf")` | ✅ PASS |
| WHEN toca material `rich_text` THEN mostra `rich_content` na própria tela | Texto renderizado inline, sem sair do app | `apps/mobile/src/__tests__/app/grupo/encontro/[id].test.tsx:84-99` — `expect(screen.getByTestId("material-gm1-rich-content")).toHaveTextContent("Texto do estudo"); expect(screen.queryByTestId("material-gm1-abrir")).toBeNull()` | ✅ PASS |
| WHEN o encontro não tem material visível THEN estado vazio explícito, sem confundir com erro | Mensagem de vazio distinta de erro | `apps/mobile/src/__tests__/app/grupo/encontro/[id].test.tsx:101-110` — `expect(screen.getByTestId("encontro-materials-empty")).toBeTruthy()` | ✅ PASS |

### P1: Líder registra presença de um encontro

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| -------------------------- | --------------------- | ------------------------ | ------ |
| WHEN líder abre um encontro do próprio grupo THEN lista roster, marcando quem já tem `AttendanceRecord` | Roster de `getGroupRoster(group_id)`, cruzado com `attendanceRecords` de `getMeeting`, e **`getMeeting` chamado primeiro** (é dele que vem o `small_group_id`) | `apps/mobile/src/app/grupo/encontro/[id]/presenca.tsx:29-35` — `getMeeting(meetingId).then((meeting) => getGroupRoster(meeting.small_group_id)...)`; `apps/mobile/src/__tests__/app/grupo/encontro/[id]/presenca.test.tsx:32-50` — `expect(mockGetGroupRoster).toHaveBeenCalledWith("sg1")` (o `"sg1"` só existe porque veio de `getMeeting`, não é um valor fixo do teste — prova a ordem/dependência real, não só que as duas funções foram chamadas) | ✅ PASS |
| WHEN líder marca 1+ membros e confirma THEN `POST .../attendance` com os `person_ids`, refletido sem reload manual | `recordAttendance(meetingId, personIds)` chamado com os ids exatos selecionados; UI atualiza sem novo fetch | `apps/mobile/src/__tests__/app/grupo/encontro/[id]/presenca.test.tsx:71-98` — `expect(mockRecordAttendance).toHaveBeenCalledWith("m1", ["p2", "p3"]); await waitFor(() => expect(screen.getByTestId("roster-p2-marcado")).toBeTruthy())` | ✅ PASS |
| WHEN o envio falha THEN erro E seleção preservada | Erro visível + `selected` não é limpo no catch | `apps/mobile/src/app/grupo/encontro/[id]/presenca.tsx:65-67` — comentário + `setSubmitError` sem `setSelected(new Set())`; `apps/mobile/src/__tests__/app/grupo/encontro/[id]/presenca.test.tsx:100-125` — `expect(screen.getByTestId("roster-p2-toggle")).toHaveTextContent("Selecionado")` após falha | ✅ PASS |
| WHEN membro já tinha presença (outra via) THEN mostrado marcado desde a abertura, sem opção de desmarcar | `alreadyMarked` inicializado do `attendanceRecords` da API, sem UI de toggle pra quem já está marcado | `apps/mobile/src/app/grupo/encontro/[id]/presenca.tsx:90-104` — `isMarked` renderiza só `<Text>Presente</Text>` sem `onPress`; `apps/mobile/src/__tests__/app/grupo/encontro/[id]/presenca.test.tsx:32-50` — `expect(screen.queryByTestId("roster-p1-toggle")).toBeNull()` | ✅ PASS |

### Backend (MOB-09-09/10)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| `GET /small-groups/mine` resolve `person_id`, lança 404 sem vínculo | `NotFoundException` quando `person_id` é nulo | `apps/api/src/small-groups/small-groups.service.spec.ts:432-438` — `.rejects.toBeInstanceOf(NotFoundException)` | ✅ PASS |
| `GET /small-groups/mine` devolve `[]` sem membership | Lista vazia, não erro | `small-groups.service.spec.ts:440-449` — `expect(result).toEqual([])` | ✅ PASS |
| `GET /small-groups/mine` mapeia role corretamente por grupo | `role` = `GroupMemberRole` daquele `GroupMembership`, não um valor fixo | `small-groups.service.spec.ts:451-477` — 2 grupos, roles `leader`/`member` distintos no mesmo resultado | ✅ PASS |
| `GET /small-groups/mine` exige `MINE_ROLES` (7 papéis, incluindo `member`) | Array de roles exato | `small-groups.controller.spec.ts:79-81` — `expect(rolesFor('findMine')).toEqual(MINE_ROLES)` (array de 7 elementos comparado por igualdade, não `toContain`) | ✅ PASS |
| `findByGroup` ganha `member`; `findOne` (`GET .../meetings/:meetingId`) continua SEM `member` | Roles exatos por rota, regressão explícita no `findOne` | `meetings.controller.spec.ts:53-60` — `expect(rolesFor('findOne')).toEqual(MEETING_READ_ROLES); expect(rolesFor('findOne')).not.toContain('member')` e `expect(rolesFor('findByGroup')).toEqual(MEETING_LIST_READ_ROLES)` | ✅ PASS |

**Status**: ❌ Gap presente (1 AC sem cobertura — retry de erro, replicado em 4 telas)

---

## Discrimination Sensor

Executado em `git worktree add` descartável (`/tmp/orbien-verify-wt`, depois `/tmp/orbien-verify-wt2`), nunca no diretório real. `node_modules` (raiz + `apps/api`/`apps/mobile` aninhados) symlinkados pro worktree só pra rodar os testes; nenhuma escrita no repositório de verdade — `git status --short` confirmado limpo antes e depois.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ------------ | ------- |
| 1 | `apps/api/src/small-groups/small-groups.service.ts:186` | `findMine`: removido `person_id` do `where` de `groupMembership.findMany` (devolveria grupos de qualquer pessoa) | ✅ Killed — `small-groups.service.spec.ts` falhou 1/30 (`toHaveBeenCalledWith` do `where`) |
| 2 | `apps/mobile/src/app/(tabs)/grupos.tsx:51` | Invertida a condição do estado vazio: `groups.length === 0` → `groups.length !== 0` | ✅ Killed — `grupos.test.tsx` falhou 4/5 |
| 3 | `apps/mobile/src/app/grupo/encontro/[id]/presenca.tsx:90` | `alreadyMarked.has(item.person_id)` → sempre `false` (nunca mostraria "Presente") | ✅ Killed — `presenca.test.tsx` falhou 2/5 |

**Sensor depth**: lightweight (3 mutações, feature padrão)
**Result**: 3/3 killed — PASS ✅

**Extra (plausibility check, não é mutação do sensor)**: pra validar a alegação do commit `6b9e3a2` ("`Button` quebrava... no ambiente de teste"), troquei `<Text onPress>` por `<Button>` real em `presenca.tsx` num segundo worktree descartável e rodei `presenca.test.tsx`: reproduziu exatamente `"Unable to locate attached view in the native tree"` em `TouchableOpacity._opacityInactive` (2/5 testes falharam com o mesmo erro citado no commit). A explicação é plausível e verificada empiricamente, não uma forma de evitar cobertura real — a suíte de `presenca.test.tsx` continua exercitando toggle, seleção, envio e erro via `fireEvent.press` normalmente, só sobre `<Text>` em vez de `<Button>`.

---

## Code Quality

| Principle        | Status |
| ---------------- | ------ |
| Minimum code     | ✅ |
| Surgical changes | ✅ — T1/T2 tocam só o necessário; `findOne` do `MeetingsController` provadamente intocado |
| No scope creep   | ✅ — nenhum endpoint de criar/editar grupo/encontro/material, nenhuma UI de desmarcar presença, nenhum QR/geo — todos corretamente fora do escopo |
| Matches patterns | ⚠️ — ver nota abaixo |
| Spec-anchored outcome check (asserted values match spec) | ⚠️ — 1 AC sem outcome coberto (retry) |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ⚠️ — mobile "erro" é happy-path-de-erro (mostra mensagem) mas falta o "retry" que o AC pede |
| Every test maps to a spec requirement — no unclaimed tests | ✅ |
| Documented guidelines followed: `apps/api/jest.config.js`, `apps/mobile/jest.config.js`, `docs/TESTES.md`, `apps/mobile/AGENTS.md` (Expo v57 — nenhuma API deprecated usada; `expo-router/js-tabs` confirmado, não `expo-router`) | ✅ |

**Nota — "Matches patterns" (não bloqueante)**: as 4 telas novas usam `<Text onPress>` pra navegação de item de lista (`grupos.tsx`, `grupo/[id].tsx`) e pra ações (`encontro/[id].tsx`, `presenca.tsx`). Pra ações com `disabled` dinâmico (`presenca-confirmar`), a justificativa é sólida e verificada (ver Discrimination Sensor, plausibility check). Mas pra navegação simples de item de lista (`grupo-${item.id}`, `encontro-${item.id}`), o padrão já existente no app é `<Pressable>` (`apps/mobile/src/app/(tabs)/conteudo.tsx:96` — `<Pressable testID={...} onPress={...}>`), não `Text`. Não é um bug — `Text` com `onPress` funciona e é testado — só uma pequena divergência de estilo do padrão mais próximo disponível no repo (o design.md cita `celebracoes.tsx` do MOB-08 como referência de reuse, mas esse arquivo não existe ainda nesta branch — MOB-08 não está mesclado em `origin/main` — então a referência real mais próxima seria `conteudo.tsx`, que não foi seguida no ponto do `Pressable`). Não abre fix task; registrado como nota de estilo.

---

## Edge Cases

- [x] Usuário sem papel de PG nenhum: aba nunca é ocultada — `apps/mobile/src/app/(tabs)/_layout.tsx` não tem nenhuma condicional de papel sobre `Tabs.Screen name="grupos"`; a aba está sempre presente e o comportamento cai no AC2 (estado vazio) coberto acima. Sem teste dedicado a esse edge case especificamente (é uma consequência estrutural — ausência de código condicional —, não comportamento testado ponto-a-ponto), mas evidência de código é direta.
- [ ] Dois grupos com o mesmo nome: **sem evidência de teste**. O código não deduplica (`FlatList` usa `keyExtractor={(item) => item.id}`, sempre únicos por grupo, e nunca filtra por nome), então o comportamento correto decorre da ausência de lógica de dedup — mas nenhum teste em `grupos.test.tsx` exercita esse cenário explicitamente (dois itens no mock com o mesmo `name`, líderes/horários diferentes). Evidence-or-zero: não coberto.
- [x] Encontro sem `AttendanceRecord` nenhum: roster inteiro não marcado, sem erro — `apps/mobile/src/__tests__/app/grupo/encontro/[id]/presenca.test.tsx:52-69` — `expect(screen.queryByTestId("presenca-error")).toBeNull(); expect(screen.getByTestId("roster-p1-toggle")).toBeTruthy()` (e p2, p3)
- [x] Material com `file_url` nulo: ação desabilitada, nunca `Linking.openURL(null)` — `apps/mobile/src/__tests__/app/grupo/encontro/[id].test.tsx:65-82` — `expect(action.props.accessibilityState).toEqual({ disabled: true }); fireEvent.press(action); expect(Linking.openURL).not.toHaveBeenCalled()`

---

## Gate Check

- **Gate command**: `npm run test -w orbien-backend` + `npm run test -w orbien-mobile` + `npm run lint` + `npm run build:api` + `cd apps/mobile && npx tsc --noEmit`
- **Result**:
  - Backend: 216 suítes, 2021 testes — todos passaram
  - Mobile: 25 suítes, 131 testes — todos passaram (inclui os 6 arquivos de teste novos/alterados desta feature)
  - Lint: 0 erros, 52 warnings (nenhum novo tipo de warning introduzido pela feature além de `@typescript-eslint/array-type` em `pequenos-grupos-client.ts:39` e `types.ts:25` — mesma classe de warning pré-existente em outros arquivos do mobile, ex. `theme-provider.test.tsx`)
  - `npm run build:api`: sucesso
  - `cd apps/mobile && npx tsc --noEmit`: sucesso, sem erros
- **Test count before feature**: não medido diretamente (sem baseline registrado antes do primeiro commit de código `803f3de`); a feature adicionou 6 arquivos de teste novos (`small-groups.service.spec.ts`/`.controller.spec.ts`/`meetings.controller.spec.ts` alterados com casos novos; `pequenos-grupos-client.test.ts`, `_layout.test.tsx` alterado, `grupos.test.tsx`, `grupo/[id].test.tsx`, `grupo/encontro/[id].test.tsx`, `grupo/encontro/[id]/presenca.test.tsx` novos)
- **Test count after feature**: 216 suítes/2021 testes (backend) + 25 suítes/131 testes (mobile)
- **Delta**: nenhum teste removido/enfraquecido identificado nos arquivos tocados
- **Skipped tests**: nenhum
- **Failures**: nenhuma no estado real (gaps abaixo são de cobertura ausente, não de teste falhando)

---

## Fix Plans

### Fix 1: Retry ausente no estado de erro das 4 telas (`grupos.tsx`, `grupo/[id].tsx`, `grupo/encontro/[id].tsx`, `grupo/encontro/[id]/presenca.tsx`)

- **Root cause**: o estado de erro de cada tela renderiza só a mensagem (`<Text>{error}</Text>` / `<Text>{loadError}</Text>`), sem nenhum elemento acionável (`onPress`) que refaça a chamada. O AC3 da primeira história P1 (`spec.md:69-70`) exige explicitamente "estado de erro **com opção de tentar novamente**"; o `design.md` (Error Handling Strategy) generaliza isso pra "qualquer tela": "erro genérico com retry"; e os Done-when de T6 (`tasks.md:258`) e T7 (`tasks.md:286`) dizem literalmente "com retry". Nenhuma das 4 telas implementa isso, e nenhum teste tenta localizar um botão/ação de retry — o gap é tanto de implementação quanto de teste.
- **Fix task**: adicionar uma ação de retry (ex.: `<Text onPress={refetch}>Tentar novamente</Text>` ou reaproveitar o padrão que a tela mais próxima do repo usa hoje pra esse caso) em `grupos.tsx`, `grupo/[id].tsx`, `grupo/encontro/[id].tsx` e `grupo/encontro/[id]/presenca.tsx`, refazendo o fetch correspondente ao tocar; adicionar teste por tela que dispare o retry e confirme nova chamada ao client.
- **Priority**: Major — é um AC explícito de uma história P1 (MVP), não um nice-to-have; sem ele o usuário preso num erro de rede precisa sair da tela e voltar pra tentar de novo.

### Fix 2 (opcional, menor): Edge case "dois grupos com o mesmo nome" sem teste dedicado

- **Root cause**: nenhum teste em `grupos.test.tsx` usa dois grupos com `name` idêntico. O comportamento correto (mostrar ambos, sem dedup) decorre da ausência de qualquer lógica de agrupamento por nome, mas não está provado por um teste — evidence-or-zero conta como não coberto.
- **Fix task**: adicionar um caso em `grupos.test.tsx` com 2 grupos de mesmo `name` e `id`/`role`/`meeting_time` diferentes, confirmando que ambos aparecem na lista.
- **Priority**: Minor — comportamento já correto por construção, é só uma lacuna de prova.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ----------- |
| MOB-09-01   | Implementing | ✅ Verified |
| MOB-09-02   | Implementing | ⚠️ Needs Fix (retry ausente) |
| MOB-09-03   | Implementing | ✅ Verified |
| MOB-09-04   | Implementing | ✅ Verified |
| MOB-09-05   | Implementing | ✅ Verified |
| MOB-09-06   | Implementing | ✅ Verified |
| MOB-09-07   | Implementing | ✅ Verified |
| MOB-09-08   | Implementing | ✅ Verified |
| MOB-09-09   | Implementing | ✅ Verified |
| MOB-09-10   | Implementing | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues

**Spec-anchored check**: 15/16 ACs matched spec outcome (1 GAP: retry de erro, replicado em 4 telas — contado uma vez como AC, mas a implementação está ausente nas 4 telas igualmente)
**Sensor**: 3/3 mutations killed
**Gate**: 216 (backend) + 131 (mobile) tests passed, 0 failed, lint 0 erros, build:api ok, tsc --noEmit ok

**What works**: Backend (`GET /small-groups/mine`, `member` em `findByGroup`) totalmente coberto e correto; as 3 histórias P1 do mobile cobrem lista de grupos, material do encontro (link/rich text/vazio/file_url nulo) e presença (roster, marcar, enviar, erro preserva seleção, encontro sem attendance) com evidência precisa file:line; a ordem real `getMeeting` → `getGroupRoster` é provada pelo dado que atravessa as duas chamadas, não só pela contagem de chamadas; a justificativa de `Text` em vez de `Button` na tela de presença foi verificada empiricamente (reproduziu o erro relatado no commit ao trocar de volta pra `Button`); 3/3 mutações do sensor foram mortas.

**Issues found**: Nenhuma das 4 telas do mobile implementa a ação de "tentar novamente" no estado de erro, apesar de ser um AC explícito (P1 história 1, AC3), estar generalizado no `design.md` pra "qualquer tela", e estar nos Done-when de T6 e T7. Sem lógica de retry nem teste que a exercite — gap real de implementação e de cobertura, não um "spec-precision gap" (o outcome esperado está bem definido na spec).

**Next steps**: Rotear Fix 1 (retry ausente, Major) como fix task pro implementador antes de considerar a feature pronta pra PR; Fix 2 (edge case duplicado, Minor) é opcional a critério do orquestrador/usuário.
