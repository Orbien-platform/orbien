# Sprint 11.2 — Fatia 4: Assignments, Publish e My-Assignments (Celebrações)

## 1. Arquivos criados/alterados

### `src/celebrations/`

| Arquivo | Status | Função |
|---|---|---|
| `celebration-assignment.controller.ts` | novo | Rotas `POST`/`DELETE` de assignment e `PATCH .../schedule/publish` |
| `celebration-assignment.service.ts` | novo | Criar/remover assignment, publicar escala + disparar notificação, responder (confirmar/recusar), listar "minhas atribuições" |
| `celebration-volunteer.controller.ts` | novo | Dois controllers: `CelebrationRespondController` (`PATCH /assignments/:id/respond`) e `CelebrationMyAssignmentsController` (`GET /volunteers/my-celebration-assignments`) |
| `celebration-schedule.controller.ts` | novo | CRUD da escala da celebração: criar/obter escala, adicionar/remover ministério, aplicar template |
| `celebration-schedule.service.ts` | novo | Implementação do CRUD acima |
| `dto/add-celebration-assignment.dto.ts` | novo | `{ volunteer_profile_id: UUID }` |
| `dto/respond-celebration-assignment.dto.ts` | novo | `{ status: 'confirmed' \| 'declined' }` |
| `dto/add-schedule-ministry.dto.ts` | novo | `{ ministry_id: UUID, slots: int ≥ 1 }` |
| `dto/apply-template.dto.ts` | novo | `{ template_id: UUID }` |
| `celebrations.module.ts` | alterado | Registra os novos controllers/services de schedule + assignment |
| `prisma/migrations/20260629000000_sprint112_celebration_schedules/` | novo | Cria as tabelas `celebration_schedules`, `celebration_ministries`, `celebration_assignments` |

### `src/volunteers/`

Nenhum arquivo novo pertence diretamente ao fluxo de assignment/publish/my-assignments de celebrações — toda essa lógica mora em `src/celebrations/`. O que existe alterado nesta pasta é uma feature paralela (indisponibilidade), consumida pelo novo assignment service:

| Arquivo | Status | Função |
|---|---|---|
| `unavailability.controller.ts` | novo | `POST`/`GET /volunteers/unavailability`, `GET /volunteers/ministries/:id/availability` |
| `unavailability.service.ts` | novo | Upsert de indisponibilidade mensal por voluntário; é a tabela consultada por `checkUnavailability()` no `celebration-assignment.service.ts` |
| `dto/create-unavailability.dto.ts`, `dto/unavailability-query.dto.ts`, `dto/ministry-availability-query.dto.ts` | novos | DTOs de validação |
| `volunteers.module.ts` | alterado | Registra `UnavailabilityController`/`UnavailabilityService` |
| `assignments.controller.ts` | **não alterado**, pré-existente (sprint 7) | Sistema antigo de escalas por slot (`ScheduleSlot`/`Assignment`), com seu próprio `GET /volunteers/my-assignments` e `POST /volunteers/assignments/:id/confirm\|decline`. Sistema paralelo, não relacionado ao novo módulo de celebrações. |

## 2. Endpoints implementados

| Método | Path completo | Controller / Handler |
|---|---|---|
| `POST` | `/celebrations/:id/schedule/ministries/:ministryId/assignments` | `CelebrationAssignmentController.createAssignment` |
| `DELETE` | `/celebrations/:id/schedule/ministries/:ministryId/assignments/:assignmentId` | `CelebrationAssignmentController.removeAssignment` |
| `PATCH` | `/celebrations/:id/schedule/publish` | `CelebrationAssignmentController.publish` |
| `PATCH` | `/assignments/:id/respond` | `CelebrationRespondController.respond` |
| `GET` | `/volunteers/my-celebration-assignments` | `CelebrationMyAssignmentsController.getMyAssignments` |

Endpoints auxiliares do mesmo módulo (schedule, não pedidos explicitamente mas parte da Fatia 4):

| Método | Path completo |
|---|---|
| `POST` | `/celebrations/:id/schedule` |
| `GET` | `/celebrations/:id/schedule` |
| `POST` | `/celebrations/:id/schedule/ministries` |
| `DELETE` | `/celebrations/:id/schedule/ministries/:ministryId` |
| `POST` | `/celebrations/:id/schedule/apply-template` |

Confirmação dos 5 endpoints pedidos: **os 5 existem**, mas o quinto **não é** `GET /volunteers/my-assignments` — é `GET /volunteers/my-celebration-assignments` (ver seção 3 abaixo).

## 3. Decisões-chave (lidas do código)

**(a) `:ministryId` na rota de assignments é `celebration_ministry_id` ou `ministry_id` global?**

É o **`CelebrationMinistry.id`** (celebration_ministry_id), não o ministry global. Confirmado em `celebration-assignment.service.ts:117-125`:

```ts
const cm = await this.prisma.client.celebrationMinistry.findFirst({
  where: {
    id: celebrationMinistryId,
    tenant_id: tenantId,
    congregation_id: congregationId,
    schedule: { celebration_id: celebrationId },
  },
  select: { id: true, ministry_id: true, slots: true },
});
```

O `ministry_id` global (`cm.ministry_id`) é derivado depois, usado só para checar liderança/membership.

**(b) Validação "líder só atribui no próprio ministério" existe?**

Sim, em `assertLeaderOrAdmin` (`celebration-assignment.service.ts:51-73`):

```ts
private async assertLeaderOrAdmin(userId, userRoles, tenantId, congregationId, ministryId) {
  if (userRoles.includes('admin_congregation') || userRoles.includes('tenant_admin')) return;

  const profile = await this.resolveProfile(userId, tenantId, congregationId);
  const membership = await this.prisma.client.volunteerMinistry.findUnique({
    where: {
      volunteer_profile_id_ministry_id: { volunteer_profile_id: profile.id, ministry_id },
    },
    select: { role: true },
  });
  if (!membership || membership.role !== VolunteerMinistryRole.leader) {
    throw new ForbiddenException('Você não é líder deste ministério');
  }
}
```

Chamada em `createAssignment` e `removeAssignment` com `cm.ministry_id` (ministério global, não o `celebration_ministry_id`).

**(c) O respond verifica que só o dono do assignment pode responder?**

Sim, `celebration-assignment.service.ts:300-302`:

```ts
if (assignment.volunteerProfile.person_id !== personId) {
  throw new ForbiddenException('Você não tem permissão para responder esta atribuição');
}
```

Também bloqueia resposta se a escala não estiver `published` (linha 304-306) e se o status não for mais `pending` (linha 308-310 — já respondido).

**(d) A chamada ao OneSignal no publish está fora do `runInTx`?**

Sim. Estrutura de `publish()` (linhas 211-277):

```ts
const toNotify = await this.prisma.runInTx(async (_tx) => {
  // update schedule → published
  // busca assignments pending com notified_at: null
  // updateMany → seta notified_at = now()
  return pending.map(...);   // sai da tx só com os dados coletados
});

for (const { assignmentId, personId } of toNotify) {
  this.notifications
    .sendPush({...})
    .catch((err) => this.logger.error(...));   // FORA da tx
}
```

Comentário no código confirma a intenção: `// Collect recipients inside the transaction; fire OneSignal outside (no DB conn during HTTP)`.

**(e) Republicação/re-notificação, filtro de passado em my-assignments, responder em draft:**

- **Republicação/re-notificação**: idempotente por design. A query de `pending` filtra por `notified_at: null`, então rodar `publish()` de novo só notifica assignments criados/pendentes após a primeira publicação (comentário linha 210: `// Idempotent: re-publish only notifies assignments with notified_at IS NULL`). Não há reenvio para quem já foi notificado.
- **Filtro de passado em my-assignments**: `getMyAssignments` **não filtra** os assignments em si por data — retorna todos os assignments de escalas `published`. O que é calculado com filtro de "hoje ou futuro" é o `next_date` (linhas 344-359, `scheduled_date: { gte: today }`); se não houver instância futura, `next_date` fica `null` e o item vai para o fim da lista (ordenação nulls-last, linhas 384-389) — mas o assignment continua aparecendo mesmo que a celebração já tenha passado.
- **Responder em draft**: bloqueado. `respondToAssignment` lança `UnprocessableEntityException('A escala ainda está em rascunho')` quando `schedule.status !== ScheduleStatus.published` (linhas 304-306).

## 4. Questão de contrato: `my-assignments` — sistema novo vs. sistema antigo

**Qual é o path exato do novo endpoint de my-assignments das celebrações?**

`GET /volunteers/my-celebration-assignments` (`CelebrationMyAssignmentsController.getMyAssignments`, em `celebration-volunteer.controller.ts:43`). Não é `/volunteers/my-assignments` — esse path já estava ocupado pelo sistema antigo.

**O sistema antigo (`GET /volunteers/my-assignments`, `assignments.controller.ts`) ainda está em uso, ou é legado morto?**

Está em uso — não é legado morto. Evidências no próprio backend (não há frontend neste repositório, que é só `orbien-backend`):

- O histórico de commits (sprint 7, 5 commits: `ServiceSchedule/ScheduleSlot/ScheduleAssignment CRUD`, `confirmação/recusa + push OneSignal + cron de lembrete`, `algoritmo de sugestão automática (rodízio justo)`, `SwapRequest peer-to-peer e check-in QR`, `ajustes de regressão e UX`) mostra que é um sistema maduro e recentemente trabalhado, não abandonado.
- Outras duas features ativas dependem diretamente do modelo `Assignment`/`ScheduleSlot` desse sistema:
  - `checkin.controller.ts` — check-in via QR code usa `assignment.checkin_token` (`SchedulesService.checkIn`).
  - `swap-requests.controller.ts`/`swap-requests.service.ts` — troca de turno peer-to-peer é relacionada a `Assignment` (`swapRequests: VolunteerSwapRequest[]` no schema).
- O modelo `Assignment` no `schema.prisma` (linha 1146) tem campos que a nova `CelebrationAssignment` não tem: `checkin_token`, `checked_in_at`, relação com `swapRequests` — funcionalidade real, não vestigial.
- É um domínio diferente do novo: o sistema antigo escala pessoas em **slots de um `ServiceSchedule`** (ex.: um técnico de som num culto específico), enquanto o novo escala pessoas em **ministérios dentro da escala de uma celebração** (`CelebrationSchedule` → `CelebrationMinistry` → `CelebrationAssignment`). Não são o mesmo recurso com nomes diferentes — são dois modelos de dados distintos.

**Recomendação: convivência dos dois paths, ou unificação?**

**Convivência**, pelo menos por agora. Razões:

1. Os dois sistemas modelam coisas diferentes (slot de culto vs. ministério de celebração) com esquemas de dados distintos (`ScheduleSlot`/`Assignment` vs. `CelebrationMinistry`/`CelebrationAssignment`). Unificar exigiria migrar dados reais e reconciliar features que só existem em um lado (check-in QR, swap requests, sugestão automática de rodízio) — risco alto para o tempo desta fatia.
2. O sistema antigo está ativo e tem features específicas não replicadas no novo; forçar unificação agora significa ou perder essas features ou replicá-las às pressas no modelo novo.
3. O custo real da divergência de nome (`my-assignments` vs. `my-celebration-assignments`) é só cosmético/contrato de API — não é um bloqueador técnico, e o nome mais específico (`my-celebration-assignments`) já deixa claro no client qual recurso está sendo consultado.

Sugestão de acompanhamento (fora do escopo desta fatia): se no futuro os dois domínios convergirem (ex.: `ServiceSchedule` for descontinuado em favor de `CelebrationSchedule`), avaliar um endpoint agregador (`GET /volunteers/my-assignments/all` ou similar) que combine as duas fontes para o app cliente, em vez de migrar o schema.
