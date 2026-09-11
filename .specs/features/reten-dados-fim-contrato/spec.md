# Retenção de dados pós-fim-de-contrato — Specification

## Problem Statement

`docs/ROADMAP.md` listava "Job de retenção de dados... hoje descrito como
plano, sem confirmação de que existe como cron" — achado obsoleto: o job
(`PersonsRetentionScheduler`, DT-05/DT-07) já roda em produção para 2 das 4
categorias da tabela de retenção (`orbien-lgpd-mapping.md` seção 5): visitante
sem evolução (1 ano) e membro sem vínculo financeiro (2 anos). Faltam as duas
categorias restantes — dado financeiro (5 anos após fim do contrato) e dado de
menor de 18 anos (30 dias após fim do contrato) — e o item 4 da seção 5.1
(notificação semanal ao admin sobre dados perto do limite).

Nenhuma delas depende de inatividade da pessoa: dependem do **fim do
contrato do tenant**, evento que hoje não existe no código — `TenantPlan.status`
tem o enum `cancelled`, mas nada no `apps/api` o define.

## Goals

- [ ] Marcar o momento em que o contrato de um tenant termina, de forma que o
      job de retenção consiga calcular as duas janelas (5 anos / 30 dias) sem
      depender de `updated_at`.
- [ ] Anonimizar o doador (`Person` via `financial_transaction.donor_person_id`)
      5 anos após o fim do contrato do seu tenant — mantendo
      `financial_transaction` intacta (obrigação fiscal).
- [ ] Anonimizar `Person` menor de 18 anos 30 dias após o fim do contrato do
      seu tenant.
- [ ] Notificar semanalmente o `admin_congregation` de cada congregação sobre
      pessoas cujo prazo de retenção vence nos próximos 7 dias.

## Out of Scope

| Feature | Reason |
|---|---|
| UI/billing/downgrade de cancelamento de tenant | Fora desta entrega: `POST /platform/tenants/:id/cancel` e `/reactivate` (adicionados após achado do Verifier) são o mínimo pra `cancelled_at` ter um escritor — não uma jornada de billing completa. |
| Retenção de "logs de acesso e auditoria" (2 anos) e "registros de consentimento" (5 anos pós-revogação) | Fora do pedido do usuário para esta entrega; ficam para uma próxima iteração da seção 5. |
| Correção do texto de `docs/ROADMAP.md`/débitos técnicos | O usuário optou por não incluir nesta entrega (perguntado e recusado). |
| Cadastro de ministério infantil | MVP não trata isso (`orbien-lgpd-mapping.md` 2.4); a regra de menor aqui vale para qualquer `Person` com `birth_date` indicando <18 anos, cadastrada por qualquer fluxo existente. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Marco do "fim do contrato" | Novo campo `TenantPlan.cancelled_at: DateTime?`, setado quando `status` vira `cancelled` | Discutido com o usuário — evita que qualquer outro update em `TenantPlan` de um tenant já cancelado reinicie a janela (risco do `updated_at`) | y |
| Quem escreve `cancelled_at` | `POST /platform/tenants/:id/cancel` e `POST /platform/tenants/:id/reactivate` (`CancelTenantPlanService`, rota de plataforma) — fluxo mínimo, sem billing/UI atrás. Achado pelo Verifier: a AC1 original pedia esse comportamento como SHALL atual sem nenhum código que o implementasse; o usuário optou por implementar em vez de mover para Out of Scope. | Resolvido — ver commit que adiciona `cancel-tenant-plan.service.ts` | y |
| Ação sobre dado financeiro após 5 anos | Anonimizar a `Person` doadora (`anonymizedFields()`), sem tocar `financial_transaction` | Discutido com o usuário — mesmo padrão de DT-05/DT-07; a transação em si é a obrigação fiscal, não o cadastro da pessoa | y |
| Quem preenche `cancelled_at` (histórico) | ~~Nenhum fluxo de cancelamento existe ainda~~ — superado pela linha acima após o achado do Verifier. Mantido aqui só para registrar a mudança de decisão. | — | Superseded |
| "Menor de 18 anos" — como calcular | `birth_date` não nulo e idade < 18 no momento em que o job roda (não na data do fim do contrato) | Não há campo de "idade no fim do contrato"; recalcular a cada execução é o comportamento natural de um cron diário e nunca teria um falso-negativo tardio | Assumido |
| `Person` sem `birth_date` | Não é elegível à categoria "menor" (não dá para provar idade) | Mesma cautela que outras categorias já aplicam (ex.: sem sinal de atividade vira `created_at`) — mas aqui não há fallback seguro, então exclui | Assumido |
| Doador menor de idade | Exclui da eliminação de menor (mesma exclusão de `purgeInactivePersons`) | Preserva a retenção fiscal de 5 anos sobre quem tem `donor_person_id`; evita que a regra dos 30 dias apague um doador antes do prazo fiscal | Assumido |
| Forma de "eliminação" do dado de menor | `anonymizedFields()`, mesmo padrão das outras 3 categorias (mantém a linha por integridade referencial) | Consistente com como o código já interpreta "eliminação" nas outras categorias (nunca DELETE físico) | Assumido |
| Canal da notificação semanal | Push via `NotificationsService.sendPush()`, filtro por tag `role=admin_congregation` + `tenant_id`/`congregation_id`, um envio por congregação com pessoas próximas do limite | Reaproveita a infra existente (OneSignal via `NotificationsService`); não há canal de e-mail para admin implementado no `apps/api` hoje | Assumido |
| "Próximo do limite" | Pessoa cuja próxima ação de retenção (qualquer uma das 4 categorias) vence nos próximos 7 dias, ainda não processada | Janela curta o bastante para ser acionável, alinhada ao cron ser semanal | Assumido |
| Horário dos novos crons | Financeiro 5h, menor 6h, notificação semanal segunda 8h | Segue o padrão já usado (`PersonsRetentionScheduler`: 3h e 4h, escalonado para não concorrer) | Assumido |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Retenção de dado financeiro (5 anos pós-contrato) ⭐ MVP

**User Story**: Como responsável por conformidade LGPD da Orbien, quero que o
cadastro do doador seja anonimizado 5 anos após o fim do contrato do tenant,
para que a plataforma não retenha dado pessoal além do prazo legal.

**Why P1**: É a categoria mais citada pelo usuário e a que tem base legal
tributária mais concreta (Resolução CFC 1.330/2011).

**Acceptance Criteria**:

1. WHEN `TenantPlan.status` de um tenant vira `cancelled` THEN o sistema
   SHALL registrar `cancelled_at = now()` nesse `TenantPlan`.
2. WHEN um cron diário roda E existe `Person` com
   `financial_transaction.donor_person_id` apontando pra ela E o `TenantPlan`
   do tenant tem `cancelled_at` há 5 anos ou mais E a `Person` ainda não foi
   anonimizada THEN o sistema SHALL aplicar `anonymizedFields()` nela,
   preservando `financial_transaction` intacta.
3. WHEN a `Person` já está anonimizada (`anonymized_at` não nulo) THEN o
   cron SHALL ignorá-la (idempotente).
4. WHEN o `TenantPlan.cancelled_at` é nulo (tenant ativo/trial/suspenso)
   THEN nenhuma `Person` desse tenant SHALL ser elegível a este job.

**Independent Test**: Setar `cancelled_at` de um tenant de teste para 6 anos
atrás, rodar `purgeFinancialDonorsAfterContractEnd()`, verificar que o doador
foi anonimizado e a transação permanece com o mesmo `id`/`amount`.

---

### P2: Eliminação de dado de menor (30 dias pós-contrato)

**User Story**: Como responsável por conformidade LGPD, quero que o cadastro
de uma pessoa menor de 18 anos seja eliminado 30 dias após o fim do contrato
do tenant, já que não há base legal para retê-lo depois disso.

**Why P2**: Prazo mais curto e categoria com menor volume esperado
(cadastro infantil direto não é fluxo do MVP), mas ainda exigida pela tabela
da seção 5.

**Acceptance Criteria**:

1. WHEN um cron diário roda E existe `Person` com `birth_date` indicando
   idade < 18 anos no tenant E o `TenantPlan` desse tenant tem
   `cancelled_at` há 30 dias ou mais E a `Person` não é doadora
   (`financial_transaction.donor_person_id`) E ainda não foi anonimizada
   THEN o sistema SHALL aplicar `anonymizedFields()` nela.
2. WHEN a `Person` não tem `birth_date` THEN o cron SHALL ignorá-la (não
   elegível a esta categoria).
3. WHEN a `Person` é doadora THEN o cron SHALL ignorá-la (prevalece a
   retenção fiscal de 5 anos da categoria financeira).

**Independent Test**: Setar `cancelled_at` de um tenant de teste para 31 dias
atrás, criar uma `Person` com 10 anos de idade, rodar
`purgeMinorsAfterContractEnd()`, verificar anonimização.

---

### P3: Notificação semanal ao admin sobre dados perto do limite

**User Story**: Como admin de congregação, quero ser avisado quando pessoas
do meu cadastro estão perto do prazo de retenção, para poder agir antes da
eliminação automática se fizer sentido.

**Why P3**: É o item que fecha o loop operacional da seção 5.1, mas depende
das três categorias já existentes/novas estarem calculáveis — não bloqueia
a conformidade em si (a eliminação acontece de qualquer forma).

**Acceptance Criteria**:

1. WHEN o cron semanal roda E uma congregação tem 1+ `Person` elegível a
   qualquer uma das 4 categorias de retenção nos próximos 7 dias E ainda não
   anonimizada THEN o sistema SHALL disparar um push (`NotificationsService.sendPush`)
   pro papel `admin_congregation` daquela congregação, com a contagem.
2. WHEN nenhuma `Person` da congregação está a 7 dias ou menos de qualquer
   prazo THEN o sistema SHALL não disparar notificação pra ela.
3. WHEN o disparo falha (ex.: `ONESIGNAL_APP_ID` ausente) THEN o cron SHALL
   logar o erro e seguir para a próxima congregação, sem interromper o job.

**Independent Test**: Criar `Person` a 3 dias do prazo de inatividade (1
ano), rodar o cron semanal, verificar que `NotificationsService.sendPush`
foi chamado com filtro de `role=admin_congregation` daquela congregação.

---

## Edge Cases

- WHEN o mesmo tenant tem `Person` elegível a mais de uma categoria (ex.:
  doadora E menor) THEN a exclusão de doador na categoria "menor" garante que
  só a categoria financeira (5 anos) processe essa pessoa.
- WHEN um tenant nunca foi cancelado (`cancelled_at` nulo) THEN os dois jobs
  novos SHALL retornar `{ purged: 0 }` sem erro.
- WHEN `TenantPlan.status` sai de `cancelled` para outro valor (reativação)
  THEN o sistema SHALL zerar `cancelled_at` — reativação cancela a janela de
  retenção em andamento.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| RET-01 | P1 | Design | Pending |
| RET-02 | P1 | Design | Pending |
| RET-03 | P2 | Design | Pending |
| RET-04 | P3 | Design | Pending |

**Coverage:** 4 total, 4 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] `purgeFinancialDonorsAfterContractEnd()` e `purgeMinorsAfterContractEnd()`
      rodam diariamente via `PersonsRetentionScheduler`, cobertos por teste.
- [ ] Notificação semanal implementada e coberta por teste.
- [ ] `npm run test -w orbien-backend` (ou equivalente) passa com os novos
      testes.
