# PROD-20 — Multiplicação de célula, árvore genealógica, semáforo de saúde, metas por rede — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/prod-20-multiplicacao-celula/design.md`
**Status**: Draft — aguardando aprovação do usuário

---

## Test Coverage Matrix

> Gerado a partir de `docs/TESTES.md` (meta declarada: **100% de cobertura**,
> `global: 100` travado no CI para `orbien-backend`) e de amostragem de
> `apps/api/test/**` e `apps/web/src/app/(admin)/grupos/page.test.tsx`.
> Guidelines encontradas: `docs/TESTES.md`, `apps/api/jest.config.*` (3
> projects: unit/integration/rls), `apps/web` usa Vitest colocalizado.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| Serviço API (`SmallGroupsService`, `NetworksService`, `classifyHealth`) | unit | Toda branch nova; 1:1 com os ACs de CEL20-01 a 08; todo edge case listado na spec | `apps/api/src/small-groups/*.spec.ts` | `npm run test:unit -w orbien-backend` |
| Controller (rotas novas/gate de plano) | unit | Toda rota nova: decorator de `@Roles`/`@RequiresPlan` presente, delegação correta ao service | `apps/api/src/small-groups/*.controller.spec.ts` | `npm run test:unit -w orbien-backend` |
| RLS (tabela `networks`) | rls | Isolamento cross-tenant (leitura e escrita negadas), `USING`/`WITH CHECK` simétricos por AD-001 | `apps/api/test/rls/networks.spec.ts` | `npm run test:rls -w orbien-backend` |
| Integração (`$queryRaw` recursivo, transação de multiplicar, CRUD de rede contra Postgres real) | integration | Caminho feliz + edge cases de concorrência/RLS listados na spec, contra banco efêmero | `apps/api/test/integration/*.spec.ts` | `npm run test:integration -w orbien-backend` |
| Componente/página web (`apps/web`) | unit (Vitest, colocado) | Caminho feliz + estado sem Premium (`NoAccessState`) para toda tela nova | `apps/web/src/**/*.test.tsx` | `npm run test -w orbien-web` |
| DTO / schema Prisma | none | build gate apenas | — | build gate |

## Gate Check Commands

| Gate Level | When to Use | Command |
|---|---|---|
| Quick | Após task só de unit (API ou web) | `npm run test:unit -w orbien-backend` **ou** `npm run test -w orbien-web` |
| Full | Após task com integration/RLS | Quick da API **+** `npm run test:integration -w orbien-backend` **+** (se tocou RLS) `npm run test:rls -w orbien-backend` |
| Build | Fim de fase / mudança de schema | `npm run build:api`, `npm run lint` (cobre os 5 apps via turbo) |

---

## Execution Plan

### Phase 1: Schema e RLS (fundação)
```
T1 → T2 → T3
```

### Phase 2: Multiplicação de célula (Starter)
```
T4 → T5 → T6 → T7
```

### Phase 3: Semáforo de saúde (Premium)
```
T8 → T9 → T10
```

### Phase 4: Árvore genealógica (Premium)
```
T11 → T12 → T13
```

### Phase 5: Rede e meta de saúde (Premium)
```
T14 → T15 → T16 → T17 → T18 → T19
```

### Phase 6: Telas (`apps/web`)
```
T20 → T21 → T22 → T23
```

Fases rodam em sequência (2 depende do schema da 1; 3 e 4 dependem só da 1,
mas seguem em sequência porque compartilham `small-groups.service.ts`; 5
depende de 3 pelo reuso de `classifyHealth`; 6 depende de 2-5 pelas rotas
que consome).

---

## Task Breakdown

### T1: Adicionar modelo `Network` e `SmallGroup.network_id` ao schema

**What**: Editar `apps/api/prisma/schema.prisma` acrescentando o modelo `Network` (campos do Design) e os campos `network_id`/`network` + `@@index([tenant_id, network_id])` em `SmallGroup`; gerar a migration com `npx prisma migrate dev --name add_network` a partir de `apps/api`.
**Where**: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_add_network/`
**Depends on**: None
**Reuses**: Padrão de modelo tenant+congregação já usado por `GroupType`/`SmallGroup`
**Requirement**: CEL20-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `Network` e `SmallGroup.network_id` no schema, migration gerada e aplicada localmente sem erro
- [ ] `npx prisma validate` (ou `generate`) passa
- [ ] Gate: `npm run build:api`

**Tests**: none (schema/config)
**Gate**: build

---

### T2: RLS de `networks` + registro no bootstrap

**What**: Criar `apps/api/prisma/migrations/016_rls_networks.sql` (template do Design, igual a `014`: `ENABLE`/`FORCE ROW LEVEL SECURITY` + uma policy `tenant_congregation_isolation` com `app_congregation_allowed`, AD-001); registrar no `apps/api/scripts/bootstrap-db.sh` no passo 3, junto de `012`-`015`; confirmar que o passo 7 (verificação) cobre a tabela nova.
**Where**: `apps/api/prisma/migrations/016_rls_networks.sql`, `apps/api/scripts/bootstrap-db.sh`
**Depends on**: T1
**Reuses**: `014_rls_small_group_visit_requests.sql` como template exato
**Requirement**: CEL20-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Script criado, registrado no passo 3 do bootstrap
- [ ] `bash apps/api/scripts/bootstrap-db.sh` roda os 8 passos sem falhar, passo 7 confirma RLS de `networks`

**Tests**: none (script de infra, validado pelo próprio bootstrap)
**Gate**: build

---

### T3: Teste de RLS de `networks`

**What**: `apps/api/test/rls/networks.spec.ts` — criar `Network` em tenant A, confirmar que uma sessão de tenant B não lê nem escreve (mesmo padrão de `test/rls/small-groups-public.spec.ts`/`isolation.spec.ts`).
**Where**: `apps/api/test/rls/networks.spec.ts`
**Depends on**: T2
**Reuses**: `test/helpers/rls.ts` (`prismaAdmin`, `runAsTenant`)
**Requirement**: CEL20-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Teste cobre: leitura cross-tenant vazia, escrita cross-tenant rejeitada (42501 ou 0 linhas afetadas), leitura/escrita no próprio tenant funciona
- [ ] Gate: `npm run test:rls -w orbien-backend` passa

**Tests**: rls
**Gate**: full

---

### T4: `MultiplySmallGroupDto`

**What**: Criar o DTO (`name`, `leader_person_id: string @IsUUID()`, `member_ids: string[] @IsUUID(4,{each:true})` default `[]`, `meeting_time?`, `recurrence?`, `address?`), mais o spec de validação (`*.dto.spec.ts`, mesmo padrão de `create-small-group.dto.spec.ts`).
**Where**: `apps/api/src/small-groups/dto/multiply-small-group.dto.ts`
**Depends on**: None (não depende do schema — usa `SmallGroup`/`GroupMembership` já existentes)
**Reuses**: `CreateSmallGroupDto` (mesmos validators para os campos opcionais)
**Requirement**: CEL20-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] DTO com todos os validators; `member_ids` vazio é válido (AC3 da spec)
- [ ] Gate: `npm run test:unit -w orbien-backend`

**Tests**: unit
**Gate**: quick

---

### T5: `SmallGroupsService.multiply`

**What**: Implementar `multiply(motherId, dto, user)` — validação pré-transação (líder existe no tenant, `member_ids` são memberships ativas da mãe), checagem de escopo `cell_leader` (líder da própria célula, per Design "Permissões de multiply"), transação (`create` filha + `updateMany` memberships + `upsert` do líder), com recontagem dentro da transação (edge case de concorrência).
**Where**: `apps/api/src/small-groups/small-groups.service.ts`
**Depends on**: T4
**Reuses**: padrão de validação de FK de `create()` (`small-groups.service.ts:86-93`), `prisma.client.$transaction`
**Requirement**: CEL20-01, CEL20-02, CEL20-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Cobre ACs 1-4 da história P1 e os 3 edge cases relacionados (líder também em `member_ids`, líder de duas células, corrida de duas multiplicações)
- [ ] Unit tests com Prisma mockado (padrão do arquivo) cobrindo toda branch nova
- [ ] Gate: `npm run test:unit -w orbien-backend`

**Tests**: unit
**Gate**: quick

---

### T6: `POST /small-groups/:id/multiply`

**What**: Rota no controller com `@Roles(...ALERT_ROLES)` (abre para `cell_leader`, escopo real checado no service per Design) delegando a `smallGroupsService.multiply`.
**Where**: `apps/api/src/small-groups/small-groups.controller.ts`
**Depends on**: T5
**Reuses**: padrão das rotas existentes do controller
**Requirement**: CEL20-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Rota registrada, `@Roles` correto, delega ao service com `@CurrentUser()`
- [ ] `small-groups.controller.spec.ts` cobre a nova rota (delegação + roles)
- [ ] Gate: `npm run test:unit -w orbien-backend`

**Tests**: unit
**Gate**: quick

---

### T7: Teste de integração de `multiply`

**What**: `apps/api/test/integration/small-groups-multiply.spec.ts` contra Postgres real — multiplicar célula com membros, verificar filha criada, membros movidos, líder com membership `leader`; RLS isola entre tenants; corrida (duas chamadas concorrentes movendo o mesmo `person_id`) resulta numa falha `400`.
**Where**: `apps/api/test/integration/small-groups-multiply.spec.ts`
**Depends on**: T6
**Reuses**: `test/integration/small-groups-hierarchy.spec.ts` como template de setup (tenant/congregação/pessoas efêmeras) e `test/helpers/rls.ts`
**Requirement**: CEL20-01, CEL20-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Independent Test da spec (P1) implementado ponta a ponta
- [ ] Gate: `npm run test:integration -w orbien-backend`

**Tests**: integration
**Gate**: full

**Commit**: `feat(small-groups): multiplicação de célula (PROD-20)`

---

### T8: `classifyHealth` (função pura)

**What**: Função `classifyHealth(lastMeetingAt: Date | null, now?: Date): 'green'|'yellow'|'red'` com os limiares CEL20-04/05 (green `<14` dias, yellow `14-27`, red `>=28` ou `null`).
**Where**: `apps/api/src/small-groups/small-groups.service.ts` (exportada, função livre — Design)
**Depends on**: None
**Reuses**: nada — lógica nova, mas isolada e pura
**Requirement**: CEL20-04, CEL20-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Testa os 4 casos de fronteira: 13/14 dias (green/yellow), 27/28 dias (yellow/red), `null` (red)
- [ ] Gate: `npm run test:unit -w orbien-backend`

**Tests**: unit
**Gate**: quick

---

### T9: `SmallGroupsService.getHealth`

**What**: `getHealth(groupId)` — `groupMeeting.aggregate({_max: {occurred_at}})` + `classifyHealth`, retorna `{status, last_meeting_at, days_since_last_meeting}` (`days_since_last_meeting: null` quando nunca houve encontro).
**Where**: `apps/api/src/small-groups/small-groups.service.ts`
**Depends on**: T8
**Reuses**: `classifyHealth`
**Requirement**: CEL20-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit test cobre célula sem encontro e com encontro recente/antigo
- [ ] Gate: `npm run test:unit -w orbien-backend`

**Tests**: unit
**Gate**: quick

---

### T10: `GET /small-groups/:id/health` (Premium)

**What**: Adicionar `PlanGuard` ao `@UseGuards` de classe do `SmallGroupsController` (no-op nas rotas sem `@RequiresPlan`, per Design/precedente `dashboard.controller.ts`); nova rota com `@Roles(...READ_ROLES)` + `@RequiresPlan('premium')` delegando a `getHealth`.
**Where**: `apps/api/src/small-groups/small-groups.controller.ts`
**Depends on**: T9
**Reuses**: `@RequiresPlan`/`PlanGuard` (padrão de `dashboard.controller.ts:41-43`)
**Requirement**: CEL20-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Rota criada; controller spec cobre delegação e presença do decorator
- [ ] Novo teste de integração (ou extensão de um existente) confirma `403` sem Premium e `200` com Premium — reaproveitar o padrão de teste de gate já usado em alguma rota Premium existente (ex. `financial-forecast.spec.ts` para o formato do teste)
- [ ] Gate: `npm run test:unit -w orbien-backend` + `npm run test:integration -w orbien-backend`

**Tests**: unit (controller) + integration (gate de plano)
**Gate**: full

**Commit**: `feat(small-groups): semáforo de saúde da célula (PROD-20)`

---

### T11: `getAncestors` (cadeia linear, iterativo)

**What**: Método/`função` que sobe por `parent_group_id` a partir de uma célula, teto de profundidade 4 (mesmo teto de `getHierarchy`), retornando a lista de ancestrais mais próximo primeiro.
**Where**: `apps/api/src/small-groups/small-groups.service.ts`
**Depends on**: None
**Reuses**: nenhuma query recursiva SQL — iterativo, per Design (Tech Decisions)
**Requirement**: CEL20-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit test cobre: sem ancestral (raiz), 1 ancestral, 3 ancestrais (teto)
- [ ] Gate: `npm run test:unit -w orbien-backend`

**Tests**: unit
**Gate**: quick

---

### T12: Estender `getHierarchy` (ancestrais + saúde por nó)

**What**: `getHierarchy` passa a retornar `{ ancestors: GenealogyNode[], tree: GenealogyNode | null }`, juntando `getAncestors` + a árvore de descendentes já existente, com `health_status` calculado por nó via uma única consulta agregada (`groupBy` de `GroupMeeting` por `small_group_id`, não N chamadas a `getHealth`). **Atualizar `test/integration/small-groups-hierarchy.spec.ts`** para o novo formato de retorno (quebra o formato atual, per Design).
**Where**: `apps/api/src/small-groups/small-groups.service.ts`, `apps/api/test/integration/small-groups-hierarchy.spec.ts`
**Depends on**: T11, T9 (reusa o cálculo de saúde)
**Reuses**: CTE existente de `getHierarchy` (`small-groups.service.ts:317`), `classifyHealth`
**Requirement**: CEL20-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `test/integration/small-groups-hierarchy.spec.ts` atualizado e verde com o novo shape (ancestrais + árvore + `health_status`), sem perder nenhuma asserção que já existia (mesmos 4 `it()`, adaptados)
- [ ] Novo teste de integração cobre ancestrais em 2+ gerações (mãe → filha → neta, consultando pela filha)
- [ ] Gate: `npm run test:integration -w orbien-backend`

**Tests**: integration
**Gate**: full

---

### T13: `@RequiresPlan('premium')` em `GET /small-groups/:id/hierarchy`

**What**: Adicionar o decorator na rota existente (guard de classe já ganhou `PlanGuard` em T10).
**Where**: `apps/api/src/small-groups/small-groups.controller.ts`
**Depends on**: T12, T10
**Reuses**: mesmo guard já habilitado
**Requirement**: CEL20-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Controller spec confirma o decorator na rota
- [ ] Teste de integração confirma `403` sem Premium
- [ ] Gate: `npm run test:unit -w orbien-backend` + `npm run test:integration -w orbien-backend`

**Tests**: unit + integration
**Gate**: full

**Commit**: `feat(small-groups): árvore genealógica com ancestrais e saúde (PROD-20)`

---

### T14: `CreateNetworkDto` / `UpdateNetworkDto`

**What**: DTOs de `Network` (`name`, `leader_person_id?`, `health_goal_pct?: number` `@Min(0) @Max(100)`), com specs de validação.
**Where**: `apps/api/src/small-groups/dto/create-network.dto.ts`, `update-network.dto.ts`
**Depends on**: T1
**Reuses**: `PartialType` do Nest para `UpdateNetworkDto` (mesmo padrão de `UpdateSmallGroupDto`)
**Requirement**: CEL20-07, CEL20-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] DTOs com validators, `health_goal_pct` fora de 0-100 rejeitado
- [ ] Gate: `npm run test:unit -w orbien-backend`

**Tests**: unit
**Gate**: quick

---

### T15: `NetworksService` — CRUD

**What**: `create`, `findAll`, `findOne`, `update`, `remove` — mesmo padrão de `SmallGroupsService` (tenant/congregação do `JwtPayload`, `NotFoundException` em `findOne`/`update`/`remove`).
**Where**: `apps/api/src/small-groups/networks.service.ts`
**Depends on**: T14
**Reuses**: padrão CRUD de `SmallGroupsService`
**Requirement**: CEL20-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Toda branch coberta (unit, Prisma mockado)
- [ ] Gate: `npm run test:unit -w orbien-backend`

**Tests**: unit
**Gate**: quick

---

### T16: `NetworksService.getGoalStatus`

**What**: Agregação por rede (`groupBy` de última reunião por célula da rede, `classifyHealth` por célula, contagens `green/yellow/red/total`, `current_pct`, `met`), cobrindo os 3 casos de AC3-5 (com meta, sem meta, sem células).
**Where**: `apps/api/src/small-groups/networks.service.ts`
**Depends on**: T15, T8
**Reuses**: `classifyHealth`
**Requirement**: CEL20-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests cobrem os 3 casos do AC + divisão por zero (`total: 0` → `current_pct: null`)
- [ ] Gate: `npm run test:unit -w orbien-backend`

**Tests**: unit
**Gate**: quick

---

### T17: `NetworksController` + registro no módulo

**What**: Controller com `@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard) @RequiresPlan('premium')` de classe (100% Premium, per Design); `@Roles(...MANAGE_ROLES)` em create/update/remove, `@Roles(...READ_ROLES)` em findAll/findOne/goal-status; registrar `NetworksController`+`NetworksService` no `SmallGroupsModule` existente.
**Where**: `apps/api/src/small-groups/networks.controller.ts`, `apps/api/src/small-groups/small-groups.module.ts`
**Depends on**: T16
**Reuses**: `AuditController`/`DreController` como precedente de `@RequiresPlan` de classe
**Requirement**: CEL20-07, CEL20-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Controller spec cobre roles + delegação de cada rota
- [ ] `small-groups.module.spec.ts` atualizado se ele testa a lista de providers/controllers do módulo
- [ ] Gate: `npm run test:unit -w orbien-backend`

**Tests**: unit
**Gate**: quick

---

### T18: `network_id` em `UpdateSmallGroupDto` + validação de congregação

**What**: Adicionar `network_id?: string | null` ao DTO; em `SmallGroupsService.update`, validar que a `Network` referenciada é da mesma `congregation_id` da célula (`BadRequestException` senão), per AC7 da história de rede.
**Where**: `apps/api/src/small-groups/dto/update-small-group.dto.ts`, `apps/api/src/small-groups/small-groups.service.ts`
**Depends on**: T17
**Reuses**: padrão de validação de FK já usado em `create()`
**Requirement**: CEL20-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit test cobre: vínculo válido, vínculo de rede de outra congregação (400), desvínculo (`network_id: null`)
- [ ] Gate: `npm run test:unit -w orbien-backend`

**Tests**: unit
**Gate**: quick

---

### T19: Teste de integração — rede e meta de saúde

**What**: `apps/api/test/integration/networks.spec.ts` — criar rede, vincular células com saúde variada, confirmar `goal-status` (com meta atingida/não atingida, sem meta, sem células), e isolamento por tenant.
**Where**: `apps/api/test/integration/networks.spec.ts`
**Depends on**: T18
**Reuses**: `test/integration/small-groups-hierarchy.spec.ts` como template de setup
**Requirement**: CEL20-07, CEL20-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Independent Test da história P3 implementado ponta a ponta (rede com meta 80%, 5 células, 4 verdes/1 vermelha → 80%/met; +1 vermelha → 66.67%/not met)
- [ ] Gate: `npm run test:integration -w orbien-backend`

**Tests**: integration
**Gate**: full

**Commit**: `feat(small-groups): rede de células e meta de saúde (PROD-20)`

---

### T20: Wizard de multiplicação (`apps/web`)

**What**: Botão "Multiplicar célula" (`<Button>`) no `GroupDetailSheet`, abrindo um modal que lista membros atuais (checkbox por membro) e um select de novo líder (pessoas do tenant), chamando `POST /small-groups/:id/multiply` via `api` (axios), fechando e recarregando a célula (nova filha aparece na lista de filhas) ao sucesso.
**Where**: `apps/web/src/components/groups/MultiplyGroupModal.tsx`, integração em `apps/web/src/components/groups/GroupDetailSheet.tsx`
**Depends on**: T7
**Reuses**: padrão de modal existente (`CreateGroupModal`), `useEffect`+axios, `<Button>`
**Requirement**: CEL20-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Modal funcional, submissão chama a API, trata erro 400 (mensagem de validação) e sucesso (fecha + recarrega)
- [ ] Teste de componente cobre: submissão feliz e erro de validação
- [ ] Gate: `npm run test -w orbien-web`

**Tests**: unit (Vitest)
**Gate**: quick

---

### T21: Indicador de saúde (bolinha colorida)

**What**: No `GroupDetailSheet`, buscar `GET /small-groups/:id/health` (`useEffect`+axios) e exibir uma bolinha verde/amarela/vermelha com tooltip de "última reunião há N dias"; em `403` (`isForbidden`), ocultar a seção silenciosamente (sem `NoAccessState` — é um indicador secundário dentro de uma tela que o usuário já acessa, não uma tela inteira bloqueada).
**Where**: `apps/web/src/components/groups/GroupDetailSheet.tsx` (ou subcomponente `GroupHealthBadge.tsx`)
**Depends on**: T10
**Reuses**: padrão `useEffect`+axios+`isForbidden` de `grupos/page.tsx`
**Requirement**: CEL20-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Bolinha exibida nos 3 status quando Premium; oculta (sem erro visível) quando não Premium
- [ ] Teste de componente cobre os dois casos
- [ ] Gate: `npm run test -w orbien-web`

**Tests**: unit (Vitest)
**Gate**: quick

---

### T22: Tela de árvore genealógica

**What**: Nova aba/seção no `GroupDetailSheet` (ou rota própria) chamando `GET /small-groups/:id/hierarchy`, renderizando ancestrais (lista) + árvore de descendentes (indentada, recursiva), cada nó com a bolinha de saúde (reuso do T21); `403` → `<NoAccessState>` (tela cheia, diferente do indicador secundário do T21).
**Where**: `apps/web/src/components/groups/GroupGenealogyTree.tsx`
**Depends on**: T13, T21
**Reuses**: `isForbidden`+`<NoAccessState>` (mesmo padrão de `grupos/page.tsx`)
**Requirement**: CEL20-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Renderiza ancestrais + árvore com cor de saúde por nó; estado sem Premium mostra `NoAccessState`
- [ ] Teste de componente cobre os dois casos
- [ ] Gate: `npm run test -w orbien-web`

**Tests**: unit (Vitest)
**Gate**: quick

---

### T23: Tela de gestão de redes

**What**: Nova rota `apps/web/src/app/(admin)/redes/page.tsx` — listar redes (nome, líder, meta, status atual), criar/editar rede, vincular/desvincular células (select de célula sem rede da mesma congregação); `403` → `<NoAccessState>`.
**Where**: `apps/web/src/app/(admin)/redes/page.tsx` (+ modal de criar/editar, mesmo padrão de `CreateGroupModal`)
**Depends on**: T19
**Reuses**: `useEffect`+axios+`isForbidden`, `<Button>`, padrão de página de `grupos/page.tsx`
**Requirement**: CEL20-07, CEL20-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Lista, cria, edita rede; vincula/desvincula célula; mostra status da meta; estado sem Premium
- [ ] `page.test.tsx` cobre: listagem, criação, vínculo de célula, estado sem Premium
- [ ] Gate: `npm run test -w orbien-web`

**Tests**: unit (Vitest)
**Gate**: quick

**Commit**: `feat(web): telas de multiplicação, saúde, árvore e redes de célula (PROD-20)`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1 → T2 → T3
Phase 2:  T4 → T5 → T6 → T7
Phase 3:  T8 → T9 → T10
Phase 4:  T11 → T12 → T13
Phase 5:  T14 → T15 → T16 → T17 → T18 → T19
Phase 6:  T20 → T21 → T22 → T23
```

23 tasks totais → **3 batches** de ~7-8 tasks cada, cortando em fronteira de
fase (Phase 1+2 = 7 tasks; Phase 3+4 = 6 tasks; Phase 5+6 = 10 tasks — fase 5
sozinha já tem 6, então 5+6 fica no limite superior aceitável como bloco
único por serem a cauda dependente uma da outra).

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1 | 1 schema change | ✅ Granular |
| T2 | 1 script SQL + 1 registro | ✅ Granular |
| T3 | 1 arquivo de teste | ✅ Granular |
| T4 | 1 DTO | ✅ Granular |
| T5 | 1 método de service | ✅ Granular |
| T6 | 1 rota | ✅ Granular |
| T7 | 1 arquivo de teste | ✅ Granular |
| T8 | 1 função pura | ✅ Granular |
| T9 | 1 método de service | ✅ Granular |
| T10 | 1 rota + 1 guard de classe | ✅ Granular |
| T11 | 1 método | ✅ Granular |
| T12 | 1 método (edição) + 1 teste existente atualizado | ⚠️ OK — cohesivo, mesma mudança de contrato |
| T13 | 1 decorator + testes | ✅ Granular |
| T14 | 2 DTOs pequenos e cohesivos | ⚠️ OK — mesmo par Create/Update de sempre |
| T15 | 1 service (5 métodos CRUD cohesivos) | ⚠️ OK — mesmo padrão de `SmallGroupsService` |
| T16 | 1 método de service | ✅ Granular |
| T17 | 1 controller + registro de módulo | ✅ Granular |
| T18 | 1 campo de DTO + 1 validação | ✅ Granular |
| T19 | 1 arquivo de teste | ✅ Granular |
| T20 | 1 componente (modal) | ✅ Granular |
| T21 | 1 componente pequeno | ✅ Granular |
| T22 | 1 componente | ✅ Granular |
| T23 | 1 página (+ 1 modal reaproveitando padrão) | ⚠️ OK — página única é a unidade natural no `apps/web` existente |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | — | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T2 | T2→T3 | ✅ Match |
| T4 | None | — | ✅ Match |
| T5 | T4 | T4→T5 | ✅ Match |
| T6 | T5 | T5→T6 | ✅ Match |
| T7 | T6 | T6→T7 | ✅ Match |
| T8 | None | — | ✅ Match |
| T9 | T8 | T8→T9 | ✅ Match |
| T10 | T9 | T9→T10 | ✅ Match |
| T11 | None | — | ✅ Match |
| T12 | T11, T9 | T11→T12 (T9 é dependência cross-phase, fase 3 já concluída antes da 4 rodar) | ✅ Match |
| T13 | T12, T10 | T12→T13 (T10 idem, fase anterior) | ✅ Match |
| T14 | T1 | fase 5 depende da 1 (schema); dentro da fase, T14 é o início | ✅ Match |
| T15 | T14 | T14→T15 | ✅ Match |
| T16 | T15, T8 | T15→T16 (T8 é dependência cross-phase) | ✅ Match |
| T17 | T16 | T16→T17 | ✅ Match |
| T18 | T17 | T17→T18 | ✅ Match |
| T19 | T18 | T18→T19 | ✅ Match |
| T20 | T7 | fase 6 depende da 2 | ✅ Match |
| T21 | T10 | fase 6 depende da 3 | ✅ Match |
| T22 | T13, T21 | fase 6 depende da 4; T21→T22 dentro da fase | ✅ Match |
| T23 | T19 | fase 6 depende da 5 | ✅ Match |

Nenhuma dependência aponta para uma fase posterior — todas as setas voltam
para trás ou ficam dentro da mesma fase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1 | Entity/schema | none | none | ✅ OK |
| T2 | Script RLS | none (validado pelo bootstrap) | none | ✅ OK |
| T3 | Teste RLS | rls | rls | ✅ OK |
| T4 | DTO | none (mas segue padrão do repo de ter spec) → tratado como unit | unit | ✅ OK |
| T5 | Serviço | unit | unit | ✅ OK |
| T6 | Controller | unit | unit | ✅ OK |
| T7 | Teste integração | integration | integration | ✅ OK |
| T8 | Serviço (função pura) | unit | unit | ✅ OK |
| T9 | Serviço | unit | unit | ✅ OK |
| T10 | Controller + gate de plano | unit + integration (rota nova cruza camada) | unit + integration | ✅ OK |
| T11 | Serviço | unit | unit | ✅ OK |
| T12 | Serviço ($queryRaw) | integration (per comentário do arquivo: CTE recursiva não se testa com mock) | integration | ✅ OK |
| T13 | Controller | unit + integration | unit + integration | ✅ OK |
| T14 | DTO | unit | unit | ✅ OK |
| T15 | Serviço | unit | unit | ✅ OK |
| T16 | Serviço | unit | unit | ✅ OK |
| T17 | Controller | unit | unit | ✅ OK |
| T18 | DTO + serviço | unit | unit | ✅ OK |
| T19 | Teste integração | integration | integration | ✅ OK |
| T20 | Componente web | unit (Vitest) | unit | ✅ OK |
| T21 | Componente web | unit (Vitest) | unit | ✅ OK |
| T22 | Componente web | unit (Vitest) | unit | ✅ OK |
| T23 | Página web | unit (Vitest) | unit | ✅ OK |

Nenhuma violação — todo task com camada testável inclui o teste na própria
task, nenhum "testado depois".
