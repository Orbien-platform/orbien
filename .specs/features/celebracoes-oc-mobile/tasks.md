# Celebrações e OC no Mobile (MOB-08) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and follow
its Execute flow and Critical Rules.** Do not search for skill files by
filesystem path. The skill is the source of truth for the full flow
(per-task cycle, sub-agent delegation, adequacy review, Verifier,
discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed
without it.**

---

**Design**: `.specs/features/celebracoes-oc-mobile/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Guidelines found: `apps/api/jest.config.js` (unit em `src/**/*.spec.ts`,
> threshold global 100/100/100/100), `apps/mobile/jest.config.js`
> (`jest-expo`), `docs/TESTES.md`. Padrão de localização inferido por amostra
> de `celebration-assignment.service.spec.ts` (API) e
> `escala-client.test.ts`/`__tests__/app/**` (mobile, rodadas MOB-04/06/07).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| `CelebrationAssignmentService.getMyAssignments` (API, alteração) | unit | 1:1 com MOB-08-07/08; branches novos (serviceOrder null, checked_in_at presente/ausente) cobertos; mantém 100% global | `apps/api/src/celebrations/celebration-assignment.service.spec.ts` | `npm run test -w orbien-backend` |
| `lib/celebracoes/celebracoes-client.ts` (mobile, novo) | unit | 1:1 com as duas funções (`listUpcomingInstances`, `getServiceOrder`), mesmo padrão de `content-client.test.ts` | `apps/mobile/src/lib/celebracoes/celebracoes-client.test.ts` | `npm run test -w orbien-mobile` |
| `lib/escala/types.ts` (mobile, alteração — `service_order_id`/`checked_in_at` já tipado, só o segundo muda de opcional pra sempre presente) | none | tipo puro, sem lógica — coberto indiretamente pelos testes que consomem `Assignment` | — | build gate (tsc via `npm run test -w orbien-mobile`, que roda `tsc` antes) |
| `app/(tabs)/celebracoes.tsx` (mobile, novo) | component | 1:1 com MOB-08-01/06 + edge case de lista vazia por papel, mesmo padrão de `__tests__/app/(tabs)/index.test.tsx` | `apps/mobile/src/__tests__/app/(tabs)/celebracoes.test.tsx` | `npm run test -w orbien-mobile` |
| `app/celebracao/[id].tsx` (mobile, novo) | component | 1:1 com MOB-08-02/03/04/05, mesmo padrão de `__tests__/app/post/[id].test.tsx` | `apps/mobile/src/__tests__/app/celebracao/[id].test.tsx` | `npm run test -w orbien-mobile` |
| `(tabs)/_layout.tsx` (mobile, alteração — nova tab) | component | regressão: as 3 tabs presentes, mesmo padrão de `__tests__/app/(tabs)/_layout.test.tsx` | `apps/mobile/src/__tests__/app/(tabs)/_layout.test.tsx` | `npm run test -w orbien-mobile` |
| `no-hardcoded-identity.test.ts` (mobile, regressão) | unit | garante que a tela nova não introduz literal de identidade (AD-002) | `apps/mobile/src/lib/config/no-hardcoded-identity.test.ts` | `npm run test -w orbien-mobile` |

## Gate Check Commands

| Gate Level | When to Use | Command |
|---|---|---|
| Quick (API) | Depois de mudar `celebration-assignment.service.ts` | `npm run test -w orbien-backend` |
| Quick (mobile) | Depois de qualquer task de `apps/mobile` | `npm run test -w orbien-mobile` |
| Build | Fim de cada fase | `npm run lint` + `npm run build:api` (só Fase 1) |

---

## Execution Plan

### Phase 1: Backend — `getMyAssignments` ganha `service_order_id` e `checked_in_at`

```
T1
```

### Phase 2: Mobile — tipos e client do módulo Celebrações

```
T2 → T3
```

### Phase 3: Mobile — tela de lista (aba Celebrações)

```
T4 → T5
```

### Phase 4: Mobile — tela de detalhe (OC + setlist)

```
T6
```

---

## Task Breakdown

### T1: `getMyAssignments` devolve `service_order_id` e `checked_in_at`

**What**: Adiciona `serviceOrder: { select: { id: true } }` ao include de
`celebrationInstance` e `checked_in_at`/`service_order_id` ao objeto mapeado
em `result.map` de `getMyAssignments`.
**Where**: `apps/api/src/celebrations/celebration-assignment.service.ts:353-410`
**Depends on**: None
**Reuses**: a própria query já existente (um include a mais, dois campos a
mais no map) — não muda `attachSetlists` nem o filtro.
**Requirement**: MOB-08-07, MOB-08-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `result.map` inclui `service_order_id: string | null` e
      `checked_in_at: Date | null` (mesmo tipo do model)
- [ ] Teste cobre: assignment com `serviceOrder` presente → `service_order_id`
      igual ao id; assignment sem `serviceOrder` (instância sem OC ainda)
      → `service_order_id: null`; assignment com `checked_in_at` setado →
      valor propagado; sem check-in → `null`
- [ ] `npm run test -w orbien-backend` verde, cobertura global continua
      100/100/100/100

**Tests**: unit
**Gate**: quick (API)

**Commit**: `fix(api): getMyAssignments devolve service_order_id e checked_in_at`

---

### T2: Tipos do domínio Celebrações (mobile)

**What**: Cria `ServiceOrder`, `ServiceOrderItem`, `SetlistSongRef`,
`CelebrationInstanceSummary` em `lib/celebracoes/types.ts`, espelhando
`ServiceOrdersService.findOne`/`CelebrationInstancesService.findAll`
(ver design.md, Data Models). Atualiza `lib/escala/types.ts`:
`Assignment.service_order_id: string | null` (campo novo, T1 já o expõe na
API).
**Where**: `apps/mobile/src/lib/celebracoes/types.ts` (novo),
`apps/mobile/src/lib/escala/types.ts` (alteração)
**Depends on**: T1 (contrato da API precisa existir antes do tipo espelhar)
**Reuses**: nenhum tipo existente é duplicado — `SetlistSongRef` é
deliberadamente mais completo que `SetlistSong` de `escala/types.ts` (ver
design.md, Component `lib/celebracoes/types.ts`)
**Requirement**: MOB-08-02, MOB-08-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Tipos definidos batendo campo a campo com o design.md
- [ ] `Assignment.service_order_id` adicionado, sem quebrar `escala-client.test.ts`
      existente
- [ ] Sem erro de TypeScript

**Tests**: none (tipo puro — ver matrix)
**Gate**: quick (mobile)

**Commit**: `feat(mobile): tipos do domínio Celebrações (MOB-08)`

---

### T3: `celebracoes-client.ts` — `listUpcomingInstances` e `getServiceOrder`

**What**: Cliente tipado com as duas funções novas sobre
`authenticatedRequest`.
**Where**: `apps/mobile/src/lib/celebracoes/celebracoes-client.ts` (novo)
**Depends on**: T2
**Reuses**: `authenticatedRequest` (`lib/auth/auth-client.ts`), mesmo padrão
de `content-client.ts`/`escala-client.ts`
**Requirement**: MOB-08-01, MOB-08-02, MOB-08-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `listUpcomingInstances()` chama `GET /celebrations/instances?date_from=<hoje ISO>`
- [ ] `getServiceOrder(id)` chama `GET /celebrations/orders/:id`
- [ ] Testes cobrem as duas funções (URL/verbo exatos, retorno tipado),
      mesmo padrão de `content-client.test.ts`
- [ ] `npm run test -w orbien-mobile` verde

**Tests**: unit
**Gate**: quick (mobile)

**Commit**: `feat(mobile): celebracoes-client (MOB-08)`

---

### T4: Nova aba "Celebrações" na tab bar

**What**: Adiciona `Tabs.Screen name="celebracoes"` em `(tabs)/_layout.tsx`.
**Where**: `apps/mobile/src/app/(tabs)/_layout.tsx`
**Depends on**: None (independe do client — só declara a rota; T5 cria o
arquivo da tela)
**Reuses**: mesmo padrão de `Tabs.Screen` já usado para `index`/`conteudo`
**Requirement**: MOB-08-01, MOB-08-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Terceira tab "Celebrações" presente
- [ ] Teste de regressão de `_layout.test.tsx` atualizado para 3 tabs
- [ ] `npm run test -w orbien-mobile` verde

**Tests**: component
**Gate**: quick (mobile)

**Commit**: `feat(mobile): adiciona aba Celebrações à tab bar`

---

### T5: Tela `(tabs)/celebracoes.tsx` — lista por papel

**What**: Tela que decide a fonte de dados por `roles` do token
(`decodeJwtPayload`) — `getMyAssignments()` para `member`/`volunteer`,
`listUpcomingInstances()` para `ministry_leader`+ — e lista o resultado,
com link para o detalhe quando há OC (`service_order_id`/`serviceOrder.id`
não nulo).
**Where**: `apps/mobile/src/app/(tabs)/celebracoes.tsx` (novo)
**Depends on**: T3, T4
**Reuses**: layout de lista/erro de `(tabs)/index.tsx` (estados
loading/error/lista), `useAuth()` para pegar `session.accessToken`
**Requirement**: MOB-08-01, MOB-08-06, Edge Case "lista vazia por papel"

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `member`/`volunteer`: lista vem de `getMyAssignments()`, ordenada por
      `scheduled_date`; item sem `service_order_id` aparece sem link de
      abrir OC
- [ ] `ministry_leader`+: lista vem de `listUpcomingInstances()`; item sem
      `serviceOrder` aparece sem link
- [ ] Lista vazia mostra estado vazio explícito (texto diferente por papel:
      "Você não tem celebrações próximas" vs. "Nenhuma celebração agendada")
- [ ] Erro de rede mostra estado de erro com retry, nunca lista vazia
- [ ] Toque num item com OC navega para `/celebracao/[id]` passando `id`
      (service order) e `ministryId` (quando a origem é assignment)
- [ ] Testes cobrem os 4 estados (member com dado, leader com dado, vazio,
      erro) + a navegação com os params corretos
- [ ] `npm run test -w orbien-mobile` verde

**Tests**: component
**Gate**: quick (mobile)

**Commit**: `feat(mobile): tela Celebrações — lista por papel (MOB-08)`

---

### T6: Tela `celebracao/[id].tsx` — detalhe da OC + setlist

**What**: Busca `getServiceOrder(id)` e renderiza a OC (etapas, responsável,
horário) e a setlist de cada etapa, com destaque de "minha função" quando
`item.ministry.id === ministryId` (query param) e aviso quando
`published_at` é `null` ou `setlist` é `null`.
**Where**: `apps/mobile/src/app/celebracao/[id].tsx` (novo)
**Depends on**: T3
**Reuses**: estrutura de 3 estados (loading/error/detail) de `post/[id].tsx`,
`HttpError` para diferenciar 404
**Requirement**: MOB-08-02, MOB-08-03, MOB-08-04, MOB-08-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Mostra nome/horário/responsável de cada etapa da OC, em ordem de
      `sequence`
- [ ] Etapa com `ministry.id === ministryId` do param é destacada
      visualmente (`testID` distinto)
- [ ] Etapa com `setlist` mostra as músicas (título/tom/bpm); sem setlist
      mostra "Repertório ainda não publicado"
- [ ] `published_at === null` mostra aviso "Ordem de culto ainda não
      publicada" no topo, sem esconder os itens
- [ ] 404 mostra "Ordem de culto não encontrada."; outro erro mostra
      mensagem de rede genérica com retry
- [ ] Testes cobrem: OC completa com destaque, OC sem setlist, OC não
      publicada, 404, erro de rede
- [ ] `npm run test -w orbien-mobile` verde

**Tests**: component
**Gate**: quick (mobile)

**Commit**: `feat(mobile): tela de detalhe da OC + setlist (MOB-08)`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1
Phase 2:  T2 ──→ T3
Phase 3:  T4 ──→ T5
Phase 4:  T6
```

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1: `getMyAssignments` — 2 campos novos | 1 função, 1 arquivo | ✅ Granular |
| T2: tipos do domínio | 2 arquivos de tipos puros, cohesivos (mesmo domínio) | ✅ Granular |
| T3: `celebracoes-client.ts` | 1 arquivo, 2 funções cohesivas (mesmo client) | ✅ Granular |
| T4: nova tab | 1 arquivo, 1 linha de mudança | ✅ Granular |
| T5: tela de lista | 1 componente | ✅ Granular |
| T6: tela de detalhe | 1 componente | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | (raiz da Fase 1) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | None | (raiz da Fase 3) | ✅ Match |
| T5 | T3, T4 | T3 (Fase 2) e T4 → T5 (Fase 3) | ✅ Match — T5 depende de tarefa de fase anterior (T3) e da tarefa anterior na própria fase (T4), ambos backward |
| T6 | T3 | T3 (Fase 2) → T6 (Fase 4) | ✅ Match — backward cross-phase |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1 | `CelebrationAssignmentService.getMyAssignments` | unit | unit | ✅ OK |
| T2 | `lib/celebracoes/types.ts`, `lib/escala/types.ts` | none | none | ✅ OK |
| T3 | `lib/celebracoes/celebracoes-client.ts` | unit | unit | ✅ OK |
| T4 | `(tabs)/_layout.tsx` | component | component | ✅ OK |
| T5 | `app/(tabs)/celebracoes.tsx` | component | component | ✅ OK |
| T6 | `app/celebracao/[id].tsx` | component | component | ✅ OK |

---

## Task Verification Standards

Cada task fecha com o `Done when` completo, o comando de gate da task
rodando verde, e um commit atômico só daquela task — nunca agrupar.
