# Pequenos Grupos no Mobile (MOB-09) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and follow
its Execute flow and Critical Rules.** Do not search for skill files by
filesystem path. The skill is the source of truth for the full flow
(per-task cycle, sub-agent delegation, adequacy review, Verifier,
discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed
without it.**

---

**Design**: `.specs/features/pequenos-grupos-mobile/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Guidelines found: `apps/api/jest.config.js` (unit em `src/**/*.spec.ts`,
> threshold global 100/100/100/100), `apps/mobile/jest.config.js`
> (`jest-expo`), `docs/TESTES.md`. Padrão de localização inferido por amostra
> de `small-groups.controller.spec.ts`/`meetings.controller.spec.ts` (API,
> teste de `@Roles` via `Reflector` + delegação mockada) e
> `celebracoes-client.test.ts`/`__tests__/app/**` (mobile, rodada MOB-08).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| `SmallGroupsService.findMine` (API, novo) | unit | 1:1 com MOB-09-09: pessoa sem conta vinculada (404), sem grupos (lista vazia), com grupos (mapeamento correto de `role`) | `apps/api/src/small-groups/small-groups.service.spec.ts` | `npm run test -w orbien-backend` |
| `SmallGroupsController.findMine` (API, novo) | unit | roles corretas (`MINE_ROLES`) + delegação ao service | `apps/api/src/small-groups/small-groups.controller.spec.ts` | `npm run test -w orbien-backend` |
| `MeetingsController.findByGroup` roles (API, alteração) | unit | regressão: `findByGroup` aceita `member` a mais; `findOne` continua SEM `member` (não pode vazar por engano) | `apps/api/src/small-groups/meetings.controller.spec.ts` | `npm run test -w orbien-backend` |
| `lib/pequenos-grupos/types.ts` (mobile, novo) | none | tipo puro — coberto indiretamente pelos testes que os consomem | — | build gate (`npm run test -w orbien-mobile`, roda `tsc`) |
| `lib/pequenos-grupos/pequenos-grupos-client.ts` (mobile, novo) | unit | 1:1 com as 6 funções, mesmo padrão de `celebracoes-client.test.ts` | `apps/mobile/src/lib/pequenos-grupos/pequenos-grupos-client.test.ts` | `npm run test -w orbien-mobile` |
| `(tabs)/_layout.tsx` (mobile, alteração — nova tab) | component | regressão: as 4 tabs presentes | `apps/mobile/src/__tests__/app/(tabs)/_layout.test.tsx` | `npm run test -w orbien-mobile` |
| `app/(tabs)/grupos.tsx` (mobile, novo) | component | 1:1 com MOB-09-01/02, mesmo padrão de `(tabs)/celebracoes.test.tsx` | `apps/mobile/src/__tests__/app/(tabs)/grupos.test.tsx` | `npm run test -w orbien-mobile` |
| `app/grupo/[id].tsx` (mobile, novo) | component | 1:1 com MOB-09-03 (lista de encontros) + estado vazio/erro | `apps/mobile/src/__tests__/app/grupo/[id].test.tsx` | `npm run test -w orbien-mobile` |
| `app/grupo/encontro/[id].tsx` (mobile, novo) | component | 1:1 com MOB-09-04/05 (materiais, abrir link/rich text) + condicional de ação de presença por papel | `apps/mobile/src/__tests__/app/grupo/encontro/[id].test.tsx` | `npm run test -w orbien-mobile` |
| `app/grupo/encontro/[id]/presenca.tsx` (mobile, novo) | component | 1:1 com MOB-09-06/07/08 (roster, marcar, enviar, erro preserva seleção) | `apps/mobile/src/__tests__/app/grupo/encontro/[id]/presenca.test.tsx` | `npm run test -w orbien-mobile` |

## Gate Check Commands

| Gate Level | When to Use | Command |
|---|---|---|
| Quick (API) | Depois de qualquer task de `apps/api` | `npm run test -w orbien-backend` |
| Quick (mobile) | Depois de qualquer task de `apps/mobile` | `npm run test -w orbien-mobile` |
| Build | Fim de cada fase | `npm run lint` + `npm run build:api` (só Fase 1) + `cd apps/mobile && npx tsc --noEmit` |

---

## Execution Plan

### Phase 1: Backend — `GET /small-groups/mine` e `member` em `findByGroup`

```
T1 → T2
```

### Phase 2: Mobile — tipos e client do módulo Pequenos Grupos

```
T3 → T4
```

### Phase 3: Mobile — navegação e lista de grupos

```
T5 → T6
```

### Phase 4: Mobile — encontros do grupo e material

```
T7 → T8
```

### Phase 5: Mobile — presença

```
T9
```

---

## Task Breakdown

### T1: `GET /small-groups/mine` — service + controller

**What**: `SmallGroupsService.findMine(userId, tenantId, congregationId)`
resolve `person_id` (mesmo padrão de `resolvePersonId` do
`CelebrationAssignmentService`, replicado aqui — módulos não compartilham
service base), busca `GroupMembership` da pessoa com o `SmallGroup`
associado, mapeia pra `{id, name, meeting_time, recurrence, role}[]`.
`SmallGroupsController.findMine` expõe `GET /small-groups/mine` com
`@Roles(...MINE_ROLES)`.
**Where**: `apps/api/src/small-groups/small-groups.service.ts`,
`apps/api/src/small-groups/small-groups.controller.ts`
**Depends on**: None
**Reuses**: shape de `SmallGroup`/`GroupMembership` já existentes; nenhuma
tabela nova
**Requirement**: MOB-09-09

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `findMine` lança `NotFoundException` quando a conta não tem
      `person_id` (mesmo padrão do módulo de celebrações)
- [ ] `findMine` devolve `[]` quando a pessoa não tem `GroupMembership`
- [ ] `findMine` devolve um item por `GroupMembership`, com `role` igual ao
      `GroupMemberRole` da pessoa naquele grupo (`leader`/`trainee`/`member`)
- [ ] `GET /small-groups/mine` exige `MINE_ROLES = ['member', 'cell_leader',
      'treasurer', 'secretary', 'pastor', 'admin_congregation', 'tenant_admin']`
- [ ] `npm run test -w orbien-backend` verde, cobertura global 100/100/100/100

**Tests**: unit
**Gate**: quick (API)

**Commit**: `feat(api): GET /small-groups/mine (MOB-09-09)`

---

### T2: `member` liberado em `findByGroup`, sem afetar `findOne`

**What**: Introduz `MEETING_LIST_READ_ROLES = [...MEETING_READ_ROLES,
'member']` em `meetings.controller.ts` e aplica só ao `@Roles` de
`findByGroup` — `findOne` continua com `MEETING_READ_ROLES` (sem `member`),
de propósito (ver design.md, Component "MeetingsController.findByGroup").
**Where**: `apps/api/src/small-groups/meetings.controller.ts`
**Depends on**: T1 (mesma área de código; evita conflito de merge entre
tasks paralelas, ainda que não haja dependência funcional real)
**Reuses**: `findByGroup`/`MeetingsService.findByGroup` já existentes, sem
mudança de lógica — só a role
**Requirement**: MOB-09-10

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `findByGroup` aceita `member` além dos papéis já existentes
- [ ] `findOne` (`GET /small-groups/meetings/:meetingId`) continua SEM
      `member` — teste de regressão explícito prova que o array de roles
      dessa rota não mudou
- [ ] `npm run test -w orbien-backend` verde, cobertura global 100/100/100/100

**Tests**: unit
**Gate**: quick (API)

**Commit**: `feat(api): libera member em GET /small-groups/:groupId/meetings (MOB-09-10)`

---

### T3: Tipos do domínio Pequenos Grupos (mobile)

**What**: Cria `SmallGroupMine`, `GroupMeetingSummary`, `GroupMeetingDetail`,
`MeetingMaterial`, `GroupRosterMember` em `lib/pequenos-grupos/types.ts`,
espelhando os shapes reais das rotas (ver design.md, Data Models).
**Where**: `apps/mobile/src/lib/pequenos-grupos/types.ts` (novo)
**Depends on**: T1, T2 (contratos da API precisam existir antes do tipo
espelhar)
**Reuses**: nenhum tipo existente duplicado
**Requirement**: MOB-09-01, MOB-09-03, MOB-09-04, MOB-09-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Tipos definidos batendo campo a campo com o design.md
- [ ] Sem erro de TypeScript

**Tests**: none (tipo puro — ver matrix)
**Gate**: quick (mobile)

**Commit**: `feat(mobile): tipos do domínio Pequenos Grupos (MOB-09)`

---

### T4: `pequenos-grupos-client.ts`

**What**: Cliente tipado com as 6 funções sobre `authenticatedRequest`:
`listMyGroups`, `listMeetings`, `getMeeting`, `listMaterials`,
`getGroupRoster`, `recordAttendance`.
**Where**: `apps/mobile/src/lib/pequenos-grupos/pequenos-grupos-client.ts` (novo)
**Depends on**: T3
**Reuses**: `authenticatedRequest`, mesmo padrão de `celebracoes-client.ts`/
`escala-client.ts`
**Requirement**: MOB-09-01, MOB-09-03, MOB-09-04, MOB-09-06, MOB-09-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `listMyGroups()` chama `GET /small-groups/mine`
- [ ] `listMeetings(groupId)` chama `GET /small-groups/:groupId/meetings`
- [ ] `getMeeting(meetingId)` chama `GET /small-groups/meetings/:meetingId`
- [ ] `listMaterials(meetingId)` chama `GET /small-groups/meetings/:meetingId/materials`
- [ ] `getGroupRoster(groupId)` chama `GET /small-groups/:groupId`
- [ ] `recordAttendance(meetingId, personIds)` chama `POST /small-groups/meetings/:meetingId/attendance`
      com body `{person_ids: personIds}`
- [ ] Testes cobrem as 6 funções (URL/verbo/body exatos, retorno tipado)
- [ ] `npm run test -w orbien-mobile` verde

**Tests**: unit
**Gate**: quick (mobile)

**Commit**: `feat(mobile): pequenos-grupos-client (MOB-09)`

---

### T5: Nova aba "Grupos" na tab bar

**What**: Adiciona `Tabs.Screen name="grupos"` em `(tabs)/_layout.tsx`,
entre "celebracoes" e "conteudo" (ver design.md, Tech Decisions — ordem
cronológica de entrega).
**Where**: `apps/mobile/src/app/(tabs)/_layout.tsx`
**Depends on**: None
**Reuses**: mesmo padrão de `Tabs.Screen` já usado
**Requirement**: MOB-09-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Quarta tab "Grupos" presente, na ordem Escala/Celebrações/Grupos/Conteúdo
- [ ] Teste de regressão de `_layout.test.tsx` atualizado para 4 tabs
- [ ] `npm run test -w orbien-mobile` verde

**Tests**: component
**Gate**: quick (mobile)

**Commit**: `feat(mobile): adiciona aba Grupos à tab bar (MOB-09)`

---

### T6: Tela `(tabs)/grupos.tsx` — lista "meus grupos"

**What**: Busca `listMyGroups()`, lista nome/horário/papel; toque num grupo
navega pra `/grupo/[id]`.
**Where**: `apps/mobile/src/app/(tabs)/grupos.tsx` (novo)
**Depends on**: T4, T5
**Reuses**: layout de lista/erro de `(tabs)/celebracoes.tsx` (MOB-08)
**Requirement**: MOB-09-01, MOB-09-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Lista mostra nome, `meeting_time`/`recurrence` e `role` de cada grupo
- [ ] Lista vazia mostra "Você não participa de nenhum grupo"
- [ ] Erro de rede mostra estado de erro com retry, nunca lista vazia
- [ ] Toque num grupo navega pra `/grupo/${id}`
- [ ] Testes cobrem os 3 estados + navegação
- [ ] `npm run test -w orbien-mobile` verde

**Tests**: component
**Gate**: quick (mobile)

**Commit**: `feat(mobile): tela Grupos — lista meus grupos (MOB-09)`

---

### T7: Tela `grupo/[id].tsx` — encontros do grupo

**What**: Busca `listMeetings(groupId)`, lista por `occurred_at` desc (mais
recente primeiro); toque num encontro navega pra `/grupo/encontro/[id]`.
**Where**: `apps/mobile/src/app/grupo/[id].tsx` (novo)
**Depends on**: T4
**Reuses**: estrutura de 3 estados de `celebracao/[id].tsx` (MOB-08)
**Requirement**: MOB-09-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Lista os encontros ordenados por `occurred_at` desc
- [ ] Lista vazia mostra estado explícito ("Nenhum encontro registrado")
- [ ] Erro de rede mostra estado de erro com retry
- [ ] Toque num encontro navega pra `/grupo/encontro/${id}`
- [ ] Testes cobrem os 3 estados + navegação
- [ ] `npm run test -w orbien-mobile` verde

**Tests**: component
**Gate**: quick (mobile)

**Commit**: `feat(mobile): tela de encontros do grupo (MOB-09)`

---

### T8: Tela `grupo/encontro/[id].tsx` — material + ação de presença

**What**: Busca `listMaterials(meetingId)`; mostra cada material, com ação
de abrir (`Linking.openURL(file_url)` para `pdf`/`doc`, texto de
`rich_content` inline para `rich_text`). Se `decodeJwtPayload` indicar papel
de liderança (`cell_leader`+), mostra botão "Registrar presença" que
navega pra `/grupo/encontro/${id}/presenca`.
**Where**: `apps/mobile/src/app/grupo/encontro/[id].tsx` (novo)
**Depends on**: T4
**Reuses**: `decodeJwtPayload` (mesmo uso não-autoritativo do MOB-08),
`HttpError` pra diferenciar erro
**Requirement**: MOB-09-04, MOB-09-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Material `pdf`/`doc` com `file_url` chama `Linking.openURL` ao tocar
- [ ] Material `pdf`/`doc` com `file_url` nulo mostra a ação desabilitada
      (edge case da spec — nunca chama `Linking.openURL(null)`)
- [ ] Material `rich_text` mostra `rich_content` como texto na própria tela
- [ ] Sem material visível mostra estado vazio distinto de erro
- [ ] Botão "Registrar presença" aparece só pra papel `cell_leader`+ (roles
      do design.md), ausente para `member`
- [ ] Testes cobrem os cenários acima
- [ ] `npm run test -w orbien-mobile` verde

**Tests**: component
**Gate**: quick (mobile)

**Commit**: `feat(mobile): tela de material do encontro (MOB-09)`

---

### T9: Tela `grupo/encontro/[id]/presenca.tsx` — roster e registrar presença

**What**: Busca roster (`getGroupRoster`) e presença atual (`getMeeting`),
cruza pra saber quem já está marcado; permite selecionar membros não
marcados e enviar via `recordAttendance`; erro preserva a seleção.
**Where**: `apps/mobile/src/app/grupo/encontro/[id]/presenca.tsx` (novo)
**Depends on**: T4
**Reuses**: guard de duplo toque de `(tabs)/index.tsx` (MOB-04), adaptado
pra envio em lote
**Requirement**: MOB-09-06, MOB-09-07, MOB-09-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Roster mostra todo membro do grupo; quem já tem `AttendanceRecord`
      aparece marcado desde a abertura, sem opção de desmarcar (Out of Scope)
- [ ] Selecionar membros não marcados e confirmar chama `recordAttendance`
      com os `person_ids` selecionados
- [ ] Sucesso reflete a marcação na tela sem exigir reload manual
- [ ] Falha de rede/servidor mostra erro E preserva a seleção já feita
      (estado local não é limpo no catch)
- [ ] Encontro sem `AttendanceRecord` nenhum mostra todo o roster não
      marcado, sem erro (edge case da spec)
- [ ] Testes cobrem os cenários acima
- [ ] `npm run test -w orbien-mobile` verde

**Tests**: component
**Gate**: quick (mobile)

**Commit**: `feat(mobile): tela de presença do encontro (MOB-09)`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ──→ T2
Phase 2:  T3 ──→ T4
Phase 3:  T5 ──→ T6
Phase 4:  T7 ──→ T8
Phase 5:  T9
```

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1: `GET /small-groups/mine` | 1 endpoint (service + controller) | ✅ Granular |
| T2: `member` em `findByGroup` | 1 mudança de role, 1 arquivo | ✅ Granular |
| T3: tipos do domínio | 1 arquivo de tipos puros, cohesivos | ✅ Granular |
| T4: `pequenos-grupos-client.ts` | 1 arquivo, 6 funções cohesivas (mesmo client) | ✅ Granular |
| T5: nova tab | 1 arquivo, 1 linha de mudança | ✅ Granular |
| T6: tela de lista de grupos | 1 componente | ✅ Granular |
| T7: tela de encontros | 1 componente | ✅ Granular |
| T8: tela de material | 1 componente | ✅ Granular |
| T9: tela de presença | 1 componente | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | (raiz da Fase 1) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T1, T2 | T1/T2 (Fase 1) → T3 (Fase 2) | ✅ Match — backward cross-phase |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | None | (raiz da Fase 3) | ✅ Match |
| T6 | T4, T5 | T4 (Fase 2) e T5 → T6 (Fase 3) | ✅ Match |
| T7 | T4 | T4 (Fase 2) → T7 (Fase 4) | ✅ Match — backward cross-phase |
| T8 | T4 | T4 (Fase 2) → T8 (Fase 4) | ✅ Match — backward cross-phase |
| T9 | T4 | T4 (Fase 2) → T9 (Fase 5) | ✅ Match — backward cross-phase |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1 | `SmallGroupsService.findMine`, `SmallGroupsController.findMine` | unit | unit | ✅ OK |
| T2 | `MeetingsController` roles | unit | unit | ✅ OK |
| T3 | `lib/pequenos-grupos/types.ts` | none | none | ✅ OK |
| T4 | `lib/pequenos-grupos/pequenos-grupos-client.ts` | unit | unit | ✅ OK |
| T5 | `(tabs)/_layout.tsx` | component | component | ✅ OK |
| T6 | `app/(tabs)/grupos.tsx` | component | component | ✅ OK |
| T7 | `app/grupo/[id].tsx` | component | component | ✅ OK |
| T8 | `app/grupo/encontro/[id].tsx` | component | component | ✅ OK |
| T9 | `app/grupo/encontro/[id]/presenca.tsx` | component | component | ✅ OK |

---

## Task Verification Standards

Cada task fecha com o `Done when` completo, o comando de gate da task
rodando verde, e um commit atômico só daquela task — nunca agrupar.
