# Reconciliação — Ordem de Culto lendo do sistema novo de escala

> Etapa 1 da consolidação (antes da remoção do sistema antigo). Só as 3
> queries abaixo foram alteradas. Nada do sistema antigo (`ServiceSchedule`,
> `ScheduleSlot`, `ScheduleAssignment`, controllers, DTOs, schema, migration)
> foi tocado. `npx tsc --noEmit` e `npm run build` passam limpos após a
> mudança.
>
> **Atualização (Etapa 2 — consolidação da escala por instância):** o
> vínculo `celebration_id` em `CelebrationSchedule` descrito abaixo (e a
> ressalva da seção 4) foi **substituído** por `celebration_instance_id`
> numa reconciliação de 4 blocos: (1) migration movendo `CelebrationSchedule`
> para `CelebrationInstance` + `Celebration.anchor_date`; (2) Fatia 3
> (estrutura da escala) e materialização por período com recorrência
> ancorada; (3) Fatia 4 (assignments/publish/my-assignments) por instância,
> com `checkUnavailability` e filtro de passado usando a data real; (4) este
> documento — as mesmas 3 queries abaixo, migradas de novo para
> `celebration_instance_id`. Ver seção 8 para o antes/depois final e a
> seção 4 para o fechamento da ressalva. O corpo original (seções 1-7)
> foi mantido como registro histórico do porquê da escolha por
> `celebration_id` na Etapa 1.

## 0. Caminho de relação confirmado no schema

```
ServiceOrder.celebration_instance_id
  → CelebrationInstance.celebration_id
    → Celebration.schedule           (CelebrationSchedule, 1:1 — @@unique(celebration_id))
      → CelebrationSchedule.ministries (CelebrationMinistry[], filtra por ministry_id)
        → CelebrationMinistry.assignments (CelebrationAssignment[], filtra por status)
          → CelebrationAssignment.volunteerProfile → VolunteerProfile.person
```

**Achado que muda a semântica da query**: `CelebrationSchedule` tem
`celebration_id` `@unique` — ou seja, é **uma escala por celebração**, não
uma escala por instância/data (diferente do `ServiceSchedule` antigo, que
era criado um por data). Não existe filtro de data no model novo entre
`CelebrationSchedule` e seus `assignments`; é um roster permanente (times
fixos por ministério dentro de uma celebração recorrente), não um "quem
está escalado nesse culto específico".

Confirmado lendo `celebration-schedule.service.ts::createOrGet()` —
`findUnique({ where: { celebration_id } })` — e o resto do módulo
(`celebration-assignment.service.ts`) trata a data separadamente (via
`CelebrationInstance` mais próxima) exatamente porque o assignment em si
não carrega data.

**Decisão tomada nesta etapa**: preferi o vínculo por `celebration_id`
(mais correto, é o vínculo real que a OC já tinha e você confirmou que não
quer mudar) em vez de tentar recriar um filtro de data solto que não existe
mais no model novo. Ver seção 4 para o efeito colateral disso.

---

## 1. `src/celebrations/service-orders.service.ts` — `notifyOrderPublished()`

**Antes:**
```ts
const ministryIds = [...new Set(ministryItems.map((i) => i.ministry_id!))];
const dayStart = new Date(instance.scheduled_date);
dayStart.setUTCHours(0, 0, 0, 0);
const dayEnd = new Date(instance.scheduled_date);
dayEnd.setUTCHours(23, 59, 59, 999);

// Find confirmed assignments for those ministries on the celebration date
const assignments = await this.prisma.client.scheduleAssignment.findMany({
  where: {
    tenant_id: tenantId,
    status: 'confirmed',
    slot: {
      schedule: {
        ministry_id: { in: ministryIds },
        scheduled_date: { gte: dayStart, lte: dayEnd },
      },
    },
  },
  include: { volunteerProfile: { select: { person_id: true } } },
});
```

**Depois:**
```ts
const ministryIds = [...new Set(ministryItems.map((i) => i.ministry_id!))];

// Find confirmed assignments for those ministries in the celebration's
// standing schedule (CelebrationSchedule is 1:1 per Celebration, not per
// instance/date — assignments are the current roster, not a historical
// snapshot of who was scheduled on this specific date).
const assignments = await this.prisma.client.celebrationAssignment.findMany({
  where: {
    tenant_id: tenantId,
    status: 'confirmed',
    celebrationMinistry: {
      ministry_id: { in: ministryIds },
      schedule: { celebration_id: instance.celebration_id },
    },
  },
  include: { volunteerProfile: { select: { person_id: true } } },
});
```

`instance.celebration_id` já vinha disponível de graça — `instance` é
carregado com `include: { celebration: {...} }`, e `include` sempre traz
todos os escalares do próprio model (`CelebrationInstance`) junto, incluindo
`celebration_id`. Não precisou de query extra.

Saída consumida a seguir (`assignments.map((a) => a.volunteerProfile.person_id)`)
tem exatamente o mesmo shape (`{ volunteerProfile: { person_id } }`) — nenhum
código downstream mudou.

---

## 2. `src/celebrations/pdf-export.service.ts` — PDF da Ordem de Culto

**Antes:**
```ts
const volunteersByMinistry: Record<string, string[]> = {};
if (ministryIds.length) {
  const schedDate = order.celebrationInstance.scheduled_date;
  const dayStart = new Date(schedDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(schedDate);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const assignments = await this.prisma.client.scheduleAssignment.findMany({
    where: {
      tenant_id: tenantId,
      status: 'confirmed',
      slot: {
        schedule: {
          ministry_id: { in: ministryIds },
          scheduled_date: { gte: dayStart, lte: dayEnd },
        },
      },
    },
    include: {
      volunteerProfile: { include: { person: { select: { full_name: true } } } },
      slot: { include: { schedule: { select: { ministry_id: true } } } },
    },
  });

  for (const a of assignments) {
    const mid = a.slot.schedule.ministry_id;
    if (!volunteersByMinistry[mid]) volunteersByMinistry[mid] = [];
    volunteersByMinistry[mid].push(a.volunteerProfile.person.full_name);
  }
}
```

**Depois:**
```ts
const volunteersByMinistry: Record<string, string[]> = {};
if (ministryIds.length) {
  // CelebrationSchedule is 1:1 per Celebration (standing roster, not
  // per-instance) — this reflects who is *currently* assigned, not a
  // historical snapshot of the celebration date being exported.
  const assignments = await this.prisma.client.celebrationAssignment.findMany({
    where: {
      tenant_id: tenantId,
      status: 'confirmed',
      celebrationMinistry: {
        ministry_id: { in: ministryIds },
        schedule: { celebration_id: order.celebrationInstance.celebration_id },
      },
    },
    include: {
      volunteerProfile: { include: { person: { select: { full_name: true } } } },
      celebrationMinistry: { select: { ministry_id: true } },
    },
  });

  for (const a of assignments) {
    const mid = a.celebrationMinistry.ministry_id;
    if (!volunteersByMinistry[mid]) volunteersByMinistry[mid] = [];
    volunteersByMinistry[mid].push(a.volunteerProfile.person.full_name);
  }
}
```

`order.celebrationInstance.celebration_id` também já vinha de graça pelo
mesmo motivo (a inclusão de `celebrationInstance` usa `include`, não
`select`). A variável `schedDate` que sobrava só para esse bloco foi
removida; a outra declaração de `schedDate` mais abaixo no arquivo (usada
pra formatar `dateLabel` do PDF) é independente e não foi tocada.
`volunteersByMinistry: Record<string, string[]>` continua com o mesmo
shape — o restante do arquivo (`formatResponsible()`, montagem da tabela do
PDF) não precisou mudar.

---

## 3. `src/celebrations/service-order-items.service.ts` — `findAll()`

**Antes:**
```ts
private async resolveOrder(tenantId: string, congregationId: string, serviceOrderId: string) {
  const order = await this.prisma.client.serviceOrder.findFirst({
    where: { id: serviceOrderId, tenant_id: tenantId, congregation_id: congregationId },
    include: {
      celebrationInstance: { select: { scheduled_date: true } },
    },
  });
  if (!order) throw new NotFoundException('Ordem de culto não encontrada');
  return order;
}

async findAll(tenantId: string, congregationId: string, serviceOrderId: string) {
  const order = await this.resolveOrder(tenantId, congregationId, serviceOrderId);
  const scheduleDate = order.celebrationInstance.scheduled_date;

  const dayStart = new Date(scheduleDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(scheduleDate);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const items = await this.prisma.client.serviceOrderItem.findMany({ /* ... */ });

  // ...
  if (ministryIds.length > 0) {
    const scheduleAssignments = await this.prisma.client.scheduleAssignment.findMany({
      where: {
        tenant_id: tenantId,
        status: 'confirmed',
        slot: {
          schedule: {
            ministry_id: { in: ministryIds },
            scheduled_date: { gte: dayStart, lte: dayEnd },
          },
        },
      },
      include: {
        volunteerProfile: { include: { person: { select: { id: true, full_name: true } } } },
        slot: { include: { schedule: { select: { ministry_id: true } } } },
      },
    });

    for (const a of scheduleAssignments) {
      const minId = a.slot.schedule.ministry_id;
      if (!volunteersByMinistry[minId]) volunteersByMinistry[minId] = [];
      volunteersByMinistry[minId].push(a.volunteerProfile.person);
    }
  }
  // ...
}
```

**Depois:**
```ts
private async resolveOrder(tenantId: string, congregationId: string, serviceOrderId: string) {
  const order = await this.prisma.client.serviceOrder.findFirst({
    where: { id: serviceOrderId, tenant_id: tenantId, congregation_id: congregationId },
    include: {
      celebrationInstance: { select: { celebration_id: true } },
    },
  });
  if (!order) throw new NotFoundException('Ordem de culto não encontrada');
  return order;
}

async findAll(tenantId: string, congregationId: string, serviceOrderId: string) {
  const order = await this.resolveOrder(tenantId, congregationId, serviceOrderId);
  const celebrationId = order.celebrationInstance.celebration_id;

  const items = await this.prisma.client.serviceOrderItem.findMany({ /* ... */ });

  // ...
  if (ministryIds.length > 0) {
    // CelebrationSchedule is 1:1 per Celebration (standing roster, not
    // per-instance) — this reflects who is *currently* assigned to the
    // ministry, not a historical snapshot of this specific instance's date.
    const assignments = await this.prisma.client.celebrationAssignment.findMany({
      where: {
        tenant_id: tenantId,
        status: 'confirmed',
        celebrationMinistry: {
          ministry_id: { in: ministryIds },
          schedule: { celebration_id: celebrationId },
        },
      },
      include: {
        volunteerProfile: { include: { person: { select: { id: true, full_name: true } } } },
        celebrationMinistry: { select: { ministry_id: true } },
      },
    });

    for (const a of assignments) {
      const minId = a.celebrationMinistry.ministry_id;
      if (!volunteersByMinistry[minId]) volunteersByMinistry[minId] = [];
      volunteersByMinistry[minId].push(a.volunteerProfile.person);
    }
  }
  // ...
}
```

Esta era a única query, das três, que precisou de um ajuste no `select` de
uma função auxiliar (`resolveOrder`): trocado `scheduled_date` por
`celebration_id`, já que `scheduled_date` não era usado em mais nenhum
outro lugar do arquivo (confirmado por grep antes de remover). O shape de
retorno de `findAll()` — `{ ...item, scheduled_volunteers: [...] }` — não
mudou.

---

## 4. Diferença de comportamento introduzida (leia antes de aprovar)

Isso é uma **mudança de semântica real**, não um detalhe de implementação, e
vem diretamente da decisão de manter o vínculo `celebration_id` que você
confirmou:

- **Antes**: cada `ServiceSchedule` era criado para uma data específica.
  A OC (PDF, notificação de publicação, listagem de itens) mostrava
  literalmente "quem estava escalado *naquele culto daquele dia*" — uma
  foto histórica que não mudava depois.
- **Depois**: `CelebrationAssignment` não tem data — é o time permanente
  daquele ministério dentro da celebração recorrente. A OC agora mostra
  "quem está *atualmente* escalado nesse ministério da celebração", não
  quem estava escalado especificamente na data do culto.

Efeito prático: se alguém for trocado no time do Ministério de Louvor numa
celebração recorrente, um PDF de uma Ordem de Culto **já publicada** de
duas semanas atrás, se gerado novamente hoje, vai mostrar o time atual, não
o time de duas semanas atrás. Isso é inerente ao modelo novo (roster
permanente por celebração, sem instância) e não algo que dá pra "consertar"
nestas 3 queries sem reabrir a modelagem — que você decidiu não mexer.

Não bloqueei a implementação por causa disso porque (a) é consequência
direta da decisão de manter `celebration_id` como vínculo, e (b) o sistema
novo já opera assim em todo o resto do módulo (`getMyAssignments`,
`checkUnavailability` etc. — nenhum deles versiona por data, todos tratam
data via `CelebrationInstance` separadamente). Mas é uma mudança de produto
visível (PDFs e notificações deixam de ser "foto do dia" e passam a ser
"estado atual"), então documento aqui para você decidir se quer aceitar
como está ou registrar como item de atenção para a Fatia 5 / backlog.

> **RESOLVIDO (Etapa 2):** `CelebrationSchedule` foi movida para
> `celebration_instance_id` (1:1 por instância/data, não mais por
> celebração recorrente) e as 3 queries desta seção foram reapontadas de
> `schedule.celebration_id` para `schedule.celebration_instance_id` (seção
> 8). A semântica "foto do dia" está restaurada: cada `CelebrationSchedule`
> — e portanto cada `CelebrationAssignment` — pertence exatamente à
> instância/data para a qual foi montada. Um PDF gerado hoje de uma OC de
> duas semanas atrás volta a mostrar o time daquela data específica, não o
> roster atual do ministério.

---

## 5. O que NÃO mudou

- Nenhum arquivo do sistema antigo (`src/volunteers/schedules.*`,
  `assignments.controller.ts`, `swap-requests.*`, `checkin.controller.ts`)
  foi tocado.
- `prisma/schema.prisma` não foi tocado.
- Nenhuma migration foi gerada.
- Os shapes de saída de `notifyOrderPublished`, do PDF e de
  `ServiceOrderItemsService.findAll()` são idênticos aos anteriores — só a
  fonte dos dados mudou.

## 6. Verificação

- `npx tsc --noEmit` — sem erros.
- `npm run build` (`nest build`) — sem erros.
- Não havia teste automatizado cobrindo essas 3 queries (confirmado no
  inventário anterior, seção 3) — recomendo um teste manual/e2e de "publicar
  OC → notificação chega pros voluntários confirmados do ministério" e
  "gerar PDF → nomes aparecem corretamente" antes de prosseguir pra remoção
  do sistema antigo.

## 7. Próximo passo

Com as 3 queries migradas e o build limpo, o sistema antigo
(`ServiceSchedule`/`ScheduleSlot`/`ScheduleAssignment`/
`VolunteerSwapRequest`/`Assignment` órfão) não tem mais nenhum consumidor
fora de si mesmo. A remoção completa (controllers, services, DTOs, module,
schema, migration de drop) descrita em
`docs/remocao-escala-antiga-plano.md` pode prosseguir com segurança.

---

## 8. Etapa 2 — reapontamento final para `celebration_instance_id`

Reconciliação em 4 blocos, nesta ordem: (1) migration
`move_schedule_to_instance_and_anchor` — `CelebrationSchedule.celebration_id`
→ `celebration_instance_id` (`@unique`, `onDelete: Cascade` pra
`CelebrationInstance`) + `Celebration.anchor_date`; (2) Fatia 3 (estrutura
da escala por instância + materialização por período com recorrência
ancorada em `anchor_date`); (3) Fatia 4 (`checkUnavailability`,
`createAssignment`, `removeAssignment`, `publish`, `getMyAssignments` por
instância — `checkUnavailability` passou a usar a `scheduled_date` real da
instância em vez de aproximar pela "próxima instância futura",
`getMyAssignments` ganhou `scheduled_date` exata por assignment e filtro
`includePast`); (4) este bloco — as mesmas 3 queries das seções 1-3 acima,
reapontadas de novo.

Caminho de relação atualizado:

```
ServiceOrder.celebration_instance_id
  → CelebrationInstance.id
    → CelebrationSchedule.celebration_instance_id (1:1, @@unique)
      → CelebrationSchedule.ministries (CelebrationMinistry[], filtra por ministry_id)
        → CelebrationMinistry.assignments (CelebrationAssignment[], filtra por status)
          → CelebrationAssignment.volunteerProfile → VolunteerProfile.person
```

A OC e a escala agora vivem no mesmo nível (instância) — filtro direto por
`celebration_instance_id`, sem precisar mais do `celebration_id` da
instância para essa finalidade.

### 8.1 `service-orders.service.ts` — `notifyOrderPublished()`

**Antes (Etapa 1):**
```ts
schedule: { celebration_id: instance.celebration_id },
```

**Depois (Etapa 2):**
```ts
schedule: { celebration_instance_id: instanceId },
```

`instance.celebration_id` não é mais necessário para este filtro (ainda é
buscado, sem uso, como parte do include padrão de `celebrationInstance`,
mas `instance.celebration.name` continua sendo usado no corpo da
notificação). Shape de saída de `assignments.map((a) => a.volunteerProfile.person_id)`
inalterado.

### 8.2 `pdf-export.service.ts` — `volunteersByMinistry`

**Antes (Etapa 1):**
```ts
schedule: { celebration_id: order.celebrationInstance.celebration_id },
```

**Depois (Etapa 2):**
```ts
schedule: { celebration_instance_id: order.celebrationInstance.id },
```

`order.celebrationInstance.id` já vinha de graça (mesmo include existente).
`volunteersByMinistry: Record<string, string[]>` e o restante do arquivo
(`formatResponsible`, montagem da tabela do PDF) inalterados.

### 8.3 `service-order-items.service.ts` — `findAll()`

**Antes (Etapa 1):**
```ts
private async resolveOrder(...) {
  ...
  include: { celebrationInstance: { select: { celebration_id: true } } },
  ...
}

async findAll(...) {
  const celebrationId = order.celebrationInstance.celebration_id;
  ...
  schedule: { celebration_id: celebrationId },
  ...
}
```

**Depois (Etapa 2):**
```ts
private async resolveOrder(...) {
  ...
  include: { celebrationInstance: { select: { id: true } } },
  ...
}

async findAll(...) {
  const instanceId = order.celebrationInstance.id;
  ...
  schedule: { celebration_instance_id: instanceId },
  ...
}
```

`select` do `resolveOrder` trocado de `celebration_id` para `id` — nenhum
outro método usa `resolveOrder`/`celebrationInstance` além de `findAll`,
confirmado por grep antes de trocar. Shape de retorno de `findAll()`
(`{ ...item, scheduled_volunteers: [...] }`) inalterado.

### 8.4 Verificação (Etapa 2)

- `npx tsc --noEmit` — 0 erros (fecha a reconciliação completa dos 4
  blocos; os 26 erros iniciais do Bloco 1 zeraram progressivamente).
- `npm run build` (`nest build`) — sem erros.
- Nenhum shape de saída dos 3 consumidores mudou — só a fonte dos dados
  (e agora a fonte é a correta: a escala daquela instância específica, não
  o roster atual da celebração).
