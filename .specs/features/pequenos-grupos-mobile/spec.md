# Pequenos Grupos no Mobile (MOB-09) — Specification

## Problem Statement

O app mobile (`apps/mobile`) cobre escala (MOB-04/05), conteúdo (MOB-06/07)
e celebrações/OC (MOB-08), mas nada de Pequenos Grupos (PG) — quem participa
ou lidera um PG só acompanha encontro, presença e material pelo navegador.
Esta é a próxima peça do escopo P2 já registrado em
`.specs/features/app-mobile/spec.md` (MOB-09, Pending): ver os grupos em que
participa, o líder registrar presença de um encontro, e acessar o material
agendado — numa rodada só, por decisão do usuário.

## Goals

- [ ] Membro ou líder de PG vê, pelo celular, os grupos em que participa.
- [ ] Líder de PG registra presença de um encontro sem abrir o navegador.
- [ ] Membro ou líder acessa o material agendado do PG (abrir link ou ler
      conteúdo rico) pelo celular.
- [ ] Nenhuma role nova é criada; a visibilidade segue as regras que a API já
      aplica, estendidas apenas onde falta caminho de leitura para `member`
      (mesmo princípio do MOB-08).

## Out of Scope

| Feature | Reason |
|---|---|
| Criar/editar grupo, encontro ou material pelo mobile | Gestão de PG continua no `apps/web`; mobile é a visão do participante/líder de campo |
| Remover presença já registrada | `DELETE .../attendance/:personId` é `MEETING_ADMIN_ROLES`, sem `cell_leader` — fora do que o líder faz em campo |
| Alertas de ausência (`GET /small-groups/:id/absence-alerts`) | Ferramenta de gestão, não de uso em campo |
| Hierarquia de grupos (`GET /small-groups/:id/hierarchy`) | Não faz parte de nenhuma das 3 ACs do MOB-09 original |
| Presença via QR/geolocalização | Fora do que o ADR original (ver `app-mobile/spec.md`, Problem Statement) prometeu para o v1 — lá é só "câmera para QR" como motivação geral, não um AC desta feature |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Como listar "meus grupos" | Endpoint novo `GET /small-groups/mine`, que resolve `person_id` do usuário (mesmo padrão de `resolvePersonId` em `CelebrationAssignmentService`) e lista `GroupMembership` dele, com o `SmallGroup` de cada uma | `GET /small-groups` (existente) não filtra por membro nem libera role `member`; criar um grupo já grava uma `GroupMembership` do líder (`small-groups.service.ts:103-110`), então "meus grupos" é a mesma consulta pra líder e pra membro — sem endpoint novo, mobile não tem por onde começar. Mesmo padrão de `GET /volunteers/my-celebration-assignments` do MOB-08 | n |
| Como o membro enxerga as reuniões do seu grupo (pra achar o material) | Adiciona `member` a `MEETING_READ_ROLES` de `GET /small-groups/:groupId/meetings` (`findByGroup`) | É a única rota que lista os encontros de um grupo; sem ela o mobile não tem `meetingId` pra chamar `GET .../materials` (que já libera `member` com filtro de `visibility`, `meetings.service.ts:193-198`). Mesma malha de segurança que já existe hoje: `findByGroup` não confere se o chamador participa do grupo (nem `listMaterials` confere — é o comportamento atual do módulo, não uma regressão introduzida aqui) | n |
| Roteiro de presença do líder | `GET /small-groups/mine` → grupo → `GET /small-groups/:groupId/meetings` (`cell_leader` já liberado) → `GET /small-groups/meetings/:meetingId` (já devolve `attendanceRecords`, `cell_leader` já liberado) para saber quem já foi marcado, cruzado com o roster de `GET /small-groups/:id` (`memberships`, `cell_leader` já liberado) para saber quem falta marcar → `POST .../attendance` com os `person_ids` marcados (já existe) | Nenhum endpoint novo além de `GET /small-groups/mine` — tudo que falta já existe pra `cell_leader`, só faltava o ponto de entrada (a lista dos próprios grupos) | y |
| Mobile não cria encontro | O líder só registra presença de um encontro **já existente** (criado no `apps/web`) | AC2 da spec original diz "registrar presença de um encontro", não "criar um encontro". Reduz a superfície da primeira entrega e casa com "gestão continua no web" (Out of Scope) | y |
| Abrir/baixar material | `source_type: pdf/doc` → abre `file_url` no navegador do sistema (`Linking.openURL`, sem download nativo — mesmo nível de "abrir" que o mobile já faz pra link de música no MOB-08/setlist); `source_type: rich_text` → renderiza `rich_content` como texto na própria tela | Não há mecanismo de download nativo em nenhuma tela existente do mobile pra reaproveitar; abrir por link é a extensão mínima do padrão já usado (ex.: `Abrir link` da setlist no web, adaptado pra `Linking` no mobile) | n |
| Papéis que podem chamar `GET /small-groups/mine` | `member`, `cell_leader`, `treasurer`, `secretary`, `pastor`, `admin_congregation`, `tenant_admin` — mesmo padrão de `VOLUNTEER_ROLES` do MOB-08 (lista explícita, nunca omitir `@Roles`) | Endpoint é autoescopado pelo `person_id` do token — não existe "role de mais" que amplie o que ele devolve, só quem pode perguntar | y |

**Open questions:** nenhuma sem default registrado acima.

---

## User Stories

### P1: Ver meus grupos ⭐ MVP

**User Story**: Como membro ou líder de PG, quero ver pelo celular os
grupos em que participo, para não depender do navegador pra saber onde e
quando meu grupo se reúne.

**Why P1**: É o ponto de entrada de tudo — sem lista de grupos não há como
chegar em presença nem material.

**Acceptance Criteria**:

1. WHEN o usuário abre a aba "Grupos" THEN o app SHALL listar os grupos em
   que ele tem `GroupMembership` (líder, treinando ou membro), com nome,
   horário/recorrência do encontro e papel do usuário no grupo.
2. WHEN o usuário não participa de nenhum grupo THEN o app SHALL mostrar
   estado vazio explícito ("Você não participa de nenhum grupo"), nunca
   indistinguível de erro.
3. WHEN a busca falha (rede/servidor) THEN o app SHALL mostrar estado de
   erro com opção de tentar novamente.

**Independent Test**: conta com uma `GroupMembership` — abrir "Grupos" e
ver o grupo listado com nome e papel corretos.

---

### P1: Ver e abrir o material do grupo

**User Story**: Como membro ou líder de PG, quero ver o material agendado
do meu grupo e abri-lo, para me preparar pro encontro sem abrir o
navegador.

**Why P1**: É leitura, sem risco de gestão indevida, e entrega valor mesmo
pra quem não é líder.

**Acceptance Criteria**:

1. WHEN o usuário abre um grupo da lista THEN o app SHALL listar os
   encontros do grupo (mais recentes primeiro) via
   `GET /small-groups/:groupId/meetings`.
2. WHEN o usuário abre um encontro THEN o app SHALL listar os materiais
   visíveis pro seu papel (`GET /small-groups/meetings/:meetingId/materials`,
   que já filtra `leaders_only` pra quem não é líder).
3. WHEN o usuário toca um material com `source_type` `pdf`/`doc` THEN o app
   SHALL abrir `file_url` no navegador do sistema.
4. WHEN o usuário toca um material com `source_type` `rich_text` THEN o app
   SHALL mostrar `rich_content` na própria tela, sem sair do app.
5. WHEN o encontro não tem material visível pro papel do usuário THEN o app
   SHALL mostrar estado vazio explícito, sem confundir com erro.

**Independent Test**: grupo com um encontro com material `visibility: all` —
abrir o grupo, o encontro, e o material; conta `member` não vê material
`leaders_only` no mesmo encontro.

---

### P1: Líder registra presença de um encontro

**User Story**: Como líder de PG, quero marcar quem esteve no encontro
pelo celular, no próprio encontro, sem precisar abrir o navegador depois.

**Why P1**: É o motivo original do ADR mobile (uso em campo) — decisão do
usuário de entregar as 3 ACs juntas nesta rodada, não é menos importante
que as outras duas.

**Acceptance Criteria**:

1. WHEN o líder abre um encontro do próprio grupo THEN o app SHALL listar
   o roster do grupo (`GET /small-groups/:groupId`, campo `memberships`),
   marcando quem já tem `AttendanceRecord` nesse encontro
   (`GET /small-groups/meetings/:meetingId`, campo `attendanceRecords`).
2. WHEN o líder marca um ou mais membros como presentes e confirma THEN o
   app SHALL enviar `POST /small-groups/meetings/:meetingId/attendance`
   com os `person_ids` marcados e refletir a marcação sem exigir reload
   manual.
3. WHEN o envio falha (rede/servidor) THEN o app SHALL mostrar erro e
   preservar a seleção feita, sem perder o que o líder já marcou.
4. WHEN um membro já tinha presença registrada (por outra via, ex.: web)
   THEN o app SHALL mostrá-lo como já marcado desde a abertura da tela, sem
   permitir "desmarcar" (o mobile só adiciona, nunca remove — Out of Scope).

**Independent Test**: conta `cell_leader` de um grupo com um encontro e ao
menos 2 membros — abrir o encontro, marcar 1 membro, confirmar, reabrir e
ver os 2 (o novo e um pré-existente, se houver) marcados.

---

## Edge Cases

- WHEN o usuário não tem papel de PG nenhum (nem `member` de nenhum grupo)
  THEN a aba SHALL mostrar o estado vazio da primeira história, nunca
  ocultar a aba inteira (mesmo princípio da pendência nº 10 já citado no
  `spec.md` do app-mobile e reaplicado no MOB-08).
- WHEN dois grupos têm o mesmo nome THEN a lista SHALL mostrar ambos,
  distinguíveis por líder/horário, sem deduplicar.
- WHEN um encontro não tem nenhum `AttendanceRecord` ainda THEN a tela de
  presença SHALL mostrar todo o roster como não marcado, sem erro.
- WHEN o material tem `file_url` nulo (dado inconsistente) THEN o app SHALL
  desabilitar a ação de abrir em vez de tentar `Linking.openURL(null)`.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| MOB-09-01 | P1: Lista "meus grupos" | Design | Implementing |
| MOB-09-02 | P1: Estado vazio / erro da lista de grupos | Design | Implementing |
| MOB-09-03 | P1: Lista de encontros do grupo | Design | Implementing |
| MOB-09-04 | P1: Lista de materiais do encontro, filtrada por papel | Design | Implementing |
| MOB-09-05 | P1: Abrir material (link ou rich text) | Design | Implementing |
| MOB-09-06 | P1: Roster + presença já registrada na tela do líder | Design | Implementing |
| MOB-09-07 | P1: Registrar presença (líder) | Design | Implementing |
| MOB-09-08 | P1: Erro ao registrar presença preserva seleção | Design | Implementing |
| MOB-09-09 | Backend: `GET /small-groups/mine` (novo) | Design | Implementing |
| MOB-09-10 | Backend: `member` liberado em `GET /small-groups/:groupId/meetings` | Design | Implementing |

**ID format:** `MOB-09-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 10 total, 0 mapeados a tasks ainda, 10 aguardando Design/Tasks ⚠️

---

## Success Criteria

- [ ] Membro ou líder abre "Grupos" e vê os próprios grupos sem passar pelo
      navegador.
- [ ] Líder registra presença de um encontro do próprio grupo em menos de
      3 toques a partir da lista de grupos.
- [ ] Zero chamada a endpoint que a role do usuário não tem acesso.
- [ ] `npm run test -w orbien-mobile` e `npm run test -w orbien-backend`
      verdes com os testes novos desta feature.
