# Plano de remoção — sistema antigo de escalas (`volunteers/schedules`)

> Inventário apenas. Nada foi alterado ou deletado. Serve de checklist para uma
> execução posterior (código + migration separadas).

## 0. Contexto

Existem hoje **dois sistemas paralelos** de escala de voluntários no domínio de
congregação:

| | Sistema antigo (sprint 7) | Sistema novo (sprint 11.2) |
|---|---|---|
| Escala pessoas em | slots de um `ServiceSchedule` (ex.: técnico de som num culto específico) | ministérios dentro de uma `CelebrationSchedule` (`CelebrationSchedule → CelebrationMinistry → CelebrationAssignment`) |
| Módulo | `src/volunteers/` (schedules, assignments, swap-requests, checkin) | `src/celebrations/` (celebration-schedule, celebration-assignment, celebration-volunteer) |
| Rotas base | `/volunteers/schedules`, `/volunteers/assignments/:id/*`, `/volunteers/my-assignments`, `/volunteers/swaps`, `/volunteers/checkin/:token` | `/celebrations/:id/schedule/*`, `/assignments/:id/respond`, `/volunteers/my-celebration-assignments` |
| Confirmado como legado morto? | **Ainda não** — é o alvo desta remoção | Fica |

Isso já estava documentado em `docs/sprint11.2-fatia4.md` (seções 3–4), que
confirma que o sistema antigo não foi tocado pela sprint nova e que os dois
não compartilham recurso — só nome de rota parecido (`my-assignments` vs
`my-celebration-assignments`).

⚠️ **Achado importante**: três arquivos que **ficam** (pertencem ao módulo de
Ordem de Culto, não ao sistema antigo de escalas) fazem query direta no model
antigo `ScheduleAssignment` para montar a lista de "voluntários escalados" de
um item de ministério. Ver seção 3 — isso vai quebrar a build se as tabelas
forem dropadas sem antes migrar essas três queries.

---

## 1. Arquivos que pertencem ao sistema antigo (remover por completo)

Todos em `src/volunteers/`:

### Controllers
- `src/volunteers/schedules.controller.ts` — CRUD de `ServiceSchedule`, slots, assignments, publish, suggest (rodízio automático)
- `src/volunteers/assignments.controller.ts` — `POST /volunteers/assignments/:id/confirm`, `POST /volunteers/assignments/:id/decline`, `GET /volunteers/my-assignments`
- `src/volunteers/swap-requests.controller.ts` — `/volunteers/swaps` (create/accept/reject/cancel/list)
- `src/volunteers/checkin.controller.ts` — `POST /volunteers/checkin/:token` (endpoint público, sem guard)

### Services
- `src/volunteers/schedules.service.ts` — inclui:
  - CRUD de `ServiceSchedule` / `ScheduleSlot` / `ScheduleAssignment`
  - `publish()` (notificação push aos escalados)
  - **algoritmo de rodízio** (`suggestAssignments()` — sorteio justo por menor nº de confirmações nos últimos 60 dias + disponibilidade semanal)
  - `confirm()` / `decline()` / `getMyAssignments()`
  - `checkIn()` (usado pelo `CheckinController`)
  - **cron** `sendConfirmationReminders()` (`@Cron('0 8 * * *')`) — lembrete de confirmação 48h antes do prazo
- `src/volunteers/swap-requests.service.ts` — fluxo de troca de escala (`VolunteerSwapRequest`): create/accept/reject/cancel/findAll, com busca de substitutos compatíveis

### DTOs (`src/volunteers/dto/`)
- `create-schedule.dto.ts`
- `update-schedule.dto.ts`
- `create-slot.dto.ts`
- `create-assignment.dto.ts`
- `list-schedules-query.dto.ts`
- `create-swap-request.dto.ts`

### Guards / interceptors específicos
Nenhum. `schedules.controller.ts`, `assignments.controller.ts`,
`swap-requests.controller.ts` usam `JwtAuthGuard`, `RolesGuard`,
`TenantContextInterceptor` — todos compartilhados com o resto do app
(`src/auth/`, `src/common/`). **Não remover.**

### Crons específicos
- `SchedulesService.sendConfirmationReminders()` (dentro do service acima — some junto). O `@nestjs/schedule` `ScheduleModule` em si é usado por outros 5 módulos (`content`, `financial`, `study-materials`, `celebrations`) — **não remover**.

---

## 2. `prisma/schema.prisma` — models a remover

| Model | Linha atual | Tabela (`@@map`) | Observação |
|---|---|---|---|
| `ServiceSchedule` | 1054–1076 | `service_schedules` | |
| `ScheduleSlot` | 1078–1097 | `schedule_slots` | |
| `ScheduleAssignment` | 1099–1122 | `schedule_assignments` | referenciado por `VolunteerSwapRequest.assignment` |
| `VolunteerSwapRequest` | 1124–1144 | `volunteer_swap_requests` | |
| `Assignment` (o "antigo antigo" — sprint pré-7, tabela `assignments`, **campos**: `person_id`, `ministry_id`, `scheduled_date`, `role_in_ministry`, `status`) | 1146–1168 | `assignments` | **Já órfão hoje**: zero controllers/services referenciam este model no código atual. Só existe no schema + relações reversas. Confirmar com o time se pode ir junto (parece dead code de uma iteração ainda mais antiga que `ServiceSchedule`), mas está dentro do escopo que você descreveu ("Assignment (o antigo)"). |

### Enums

| Enum | Ação | Motivo |
|---|---|---|
| `SwapStatus` (1628–1633) | **remover** | Usado só por `VolunteerSwapRequest`. |
| `ScheduleStatus` (1615–1619) | **manter** | Também usado por `CelebrationSchedule` (linha 1313, sistema novo). |
| `AssignmentStatus` (1621–1626) | **manter** | Também usado por `CelebrationAssignment` (linha 1348, sistema novo) e pelo model órfão `Assignment` (linha 1154) — se `Assignment` for removido junto, ainda assim `CelebrationAssignment` continua usando o enum. |

### Relações reversas em models que FICAM (precisam ser removidas)

- **`Tenant`** (linha ~69, ~outras) — campo `assignments Assignment[]` e, a checar no bloco completo do model `Tenant`, os campos reversos para `serviceSchedules`, `scheduleSlots` (via cascata, confirmar se existem campos explícitos), `scheduleAssignments`, `volunteerSwapRequests`. **Ação**: abrir o model `Tenant` (linha 23) e `Congregation` (linha 85) por completo e remover toda relação reversa apontando para os 5 models da tabela acima.
- **`Congregation`** — mesmo caso do `Tenant` (linha 131 tem `assignments Assignment[]`, mais as reversas dos outros 4 models).
- **`Person`** (linha 332) — `assignments Assignment[]` (reversa do model órfão `Assignment`).
- **`Ministry`** (linha 978–1005):
  - `assignments Assignment[]` (linha 994)
  - `serviceSchedules ServiceSchedule[]` (linha 997)
  - **manter** `celebrationMinistries` e `scheduleTemplateMinistries` (sistema novo / templates — não fazem parte deste escopo)
- **`VolunteerProfile`** (linha 1007–1032):
  - `scheduleAssignments ScheduleAssignment[]` (linha 1023)
  - `swapRequestsAsRequester VolunteerSwapRequest[] @relation("SwapRequester")` (linha 1024)
  - `swapRequestsAsSubstitute VolunteerSwapRequest[] @relation("SwapSubstitute")` (linha 1025)
  - **manter** `celebrationAssignments` e `unavailabilities` (sistema novo)

> Ação recomendada na execução: grep por `Assignment[]`, `ServiceSchedule[]`,
> `ScheduleSlot[]`, `ScheduleAssignment[]`, `VolunteerSwapRequest[]` no
> schema inteiro antes de rodar `prisma format`/`prisma validate`, porque
> campo reverso órfão quebra a geração do client.

---

## 3. Referências cruzadas fora do sistema antigo (import/uso a corrigir)

Estas ficam, mas **usam models do sistema antigo hoje** — precisam ser
migradas para o model novo (`CelebrationAssignment`/`CelebrationMinistry`/
`CelebrationSchedule`) ou terão import quebrado assim que as tabelas forem
dropadas e o Prisma Client regenerado:

1. **`src/celebrations/service-orders.service.ts`** (linha 161) — método
   `notifyOrderPublished()`: busca `prisma.client.scheduleAssignment.findMany()`
   filtrando por `slot.schedule.ministry_id` + `scheduled_date` para montar a
   lista de pessoas a notificar quando a Ordem de Culto é publicada.
2. **`src/celebrations/pdf-export.service.ts`** (linha 93) — monta
   `volunteersByMinistry` para o PDF da OC a partir de
   `prisma.client.scheduleAssignment.findMany()` (mesmo padrão de filtro).
3. **`src/celebrations/service-order-items.service.ts`** (linha 102) — método
   `findAll()`: mesmo padrão, popula `scheduled_volunteers` de cada item de
   ministério na listagem de itens da OC.

Todas as três fazem essencialmente a mesma query: "quem está confirmado
(`status: 'confirmed'`) num `ScheduleAssignment` cujo `slot.schedule` bate
com `ministry_id` + data do culto". Isso precisa virar uma query equivalente
em cima de `CelebrationAssignment` → `CelebrationMinistry` →
`CelebrationSchedule` → `Celebration`/`CelebrationInstance` antes (ou junto)
da remoção — senão a funcionalidade "voluntários escalados" na Ordem de
Culto some silenciosamente (e o `prisma.client.scheduleAssignment` nem vai
mais existir no client gerado, então é erro de compilação, não só
funcional).

Nenhuma outra referência cruzada encontrada:
- DTOs do sistema antigo (`CreateScheduleDto`, `UpdateScheduleDto`,
  `CreateSlotDto`, `CreateAssignmentDto`, `ListSchedulesQueryDto`,
  `CreateSwapRequestDto`) só são importados dentro do próprio
  controller/service correspondente.
- `SchedulesService` e `SwapRequestsService` não são injetados em nenhum
  outro módulo (não estão no array `exports` sendo consumidos fora de
  `VolunteersModule`; o grep pegou apenas os próprios arquivos do módulo e um
  comentário em `notifications.service.ts` mencionando `SchedulesService`,
  sem import real).
- As strings de tipo de notificação (`'schedule_assignment'`,
  `'schedule_reminder'`, `'swap_request'`, `'swap_accepted'`) só existem
  dentro do próprio `schedules.service.ts`/`swap-requests.service.ts` — não
  há um enum compartilhado de tipos de notificação para atualizar.
- Nenhum teste automatizado (`*.spec.ts`/`*.e2e-spec.ts`) cobre o sistema
  antigo hoje — não há suíte para atualizar/remover.
- Nenhum seed script referencia os models antigos.

⚠️ Fora do backend: rotas antigas (`/volunteers/schedules/*`,
`/volunteers/assignments/:id/confirm|decline`, `/volunteers/my-assignments`,
`/volunteers/swaps/*`, `/volunteers/checkin/:token`) podem estar em uso por
app mobile/frontend fora deste repositório — não verificável a partir daqui,
mas vale confirmar com o time antes de remover os endpoints.

---

## 4. Módulos a limpar

### `src/volunteers/volunteers.module.ts`
Remover:
- imports: `SchedulesController`, `SchedulesService`, `AssignmentsController`, `SwapRequestsController`, `SwapRequestsService`, `CheckinController`
- do array `controllers`: `SchedulesController`, `AssignmentsController`, `SwapRequestsController`, `CheckinController`
- do array `providers`: `SchedulesService`, `SwapRequestsService`
- do array `exports`: `SchedulesService`, `SwapRequestsService`

Ficam intactos: `MinistriesController/Service`, `VolunteerProfilesController/Service`,
`VolunteerMinistriesController/Service`, `UnavailabilityController/Service`.

### `src/celebrations/celebrations.module.ts`
Nenhuma mudança estrutural aqui — mas depois de migrar as 3 queries da
seção 3, este módulo é onde a query nova (`CelebrationAssignment`-based)
vai morar, já que `ServiceOrdersService`, `PdfExportService` e
`ServiceOrderItemsService` já estão registrados aqui.

### `src/app.module.ts`
Nenhuma mudança — `VolunteersModule` e `CelebrationsModule` continuam sendo
importados, só o conteúdo interno do primeiro muda.

---

## 5. Migration de remoção — o que precisará entrar (NÃO gerar ainda)

Tabelas a dropar (`DROP TABLE`, respeitando ordem de FK — filhas antes das
mães):

1. `volunteer_swap_requests` (depende de `schedule_assignments`, `volunteer_profiles`)
2. `schedule_assignments` (depende de `schedule_slots`, `volunteer_profiles`)
3. `schedule_slots` (depende de `service_schedules`)
4. `service_schedules` (depende de `ministries`)
5. `assignments` (model órfão — depende de `persons`, `ministries`; confirmar inclusão, ver nota na seção 2)

Tipos a dropar:
- `SwapStatus` (enum Postgres, criado em `20260611135344_add_swap_requests_checkin`)

Tipos a **manter** (usados pelo sistema novo, não remover mesmo estando
ligados às tabelas antigas):
- `ScheduleStatus`
- `AssignmentStatus`

RLS/policies associadas a remover junto (ficam órfãs se as tabelas somem
sem isso, mas o `DROP TABLE` já leva a policy junto — só citar para
referência, não é passo separado):
- Policies criadas em `20260611130800_add_schedule_rls` (`service_schedules`, `schedule_slots`, `schedule_assignments`)
- Policy criada em `20260611135344_add_swap_requests_checkin` (`volunteer_swap_requests`)
- Policy de `assignments` em `001_rls_setup.sql` (linha ~326)

Migrations de origem (histórico, só para referência — não mexer nelas):
- `prisma/migrations/20260611130707_add_service_schedules_slots_assignments/migration.sql`
- `prisma/migrations/20260611130800_add_schedule_rls/migration.sql`
- `prisma/migrations/20260611135344_add_swap_requests_checkin/migration.sql`
- `prisma/migrations/20260526121732_init/migration.sql` (tabela `assignments` órfã, criada aqui junto com o resto do schema inicial)

---

## 6. Ordem sugerida de execução (quando for aprovado)

1. Migrar as 3 queries da seção 3 (`service-orders.service.ts`,
   `pdf-export.service.ts`, `service-order-items.service.ts`) para o model
   novo — **antes** de tocar no schema, para poder testar cada lado
   isoladamente.
2. Remover os 4 controllers + 2 services + 6 DTOs da seção 1.
3. Limpar `volunteers.module.ts` (seção 4).
4. Remover os models/enum/relações reversas do `schema.prisma` (seção 2).
5. Gerar a migration Prisma de drop (`prisma migrate dev`) — nome sugerido:
   `remove_legacy_schedule_system`.
6. Rodar `prisma generate` + build para confirmar que não sobrou nenhum
   `prisma.client.scheduleAssignment`/`.serviceSchedule`/`.scheduleSlot`/
   `.volunteerSwapRequest`/`.assignment` esquecido em algum lugar.
