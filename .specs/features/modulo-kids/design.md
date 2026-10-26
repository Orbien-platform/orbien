# Módulo Kids Design

**Spec**: `.specs/features/modulo-kids/spec.md`
**Status**: Draft

---

## Architecture Overview

Kids vive dentro do módulo de celebrações da API (`apps/api/src/kids/`, importado
por `CelebrationsModule` só onde precisa da instância) e em três superfícies:
`apps/web` (gestão e balcão do check-in), `apps/mobile` (responsável e equipe).
Nada no `apps/admin` — é dado de igreja.

Abordagens consideradas para "0..N culto kids por celebração":

| Abordagem | Prós | Contras |
|---|---|---|
| **A. `KidsRoom` + `KidsSession` por instância (escolhida)** | 0/1/N natural; turma é catálogo reutilizável; escala e check-in penduram na sessão | duas tabelas novas |
| B. `Celebration` kids irmã por faixa | zero schema novo de turma | duplica agenda e recorrência; "mesma celebração" some |
| C. Flag + JSON de contagem | trivial | sem escala nem check-in nominal |

```mermaid
graph TD
    CI[CelebrationInstance] -->|0..N| KS[KidsSession]
    KR[KidsRoom turma] --> KS
    KS --> KC[KidsCheckin]
    P[Person criança] --> KC
    P --> KG[KidsGuardian]
    GP[Person responsável] --> KG
    KS --> CM[CelebrationMinistry escala]
    KC -->|COUNT distinct| CA[CelebrationAttendance.children sugerido]
    GP --> CR[ConsentRecord origin=kids]
```

Fluxo do dia: responsável abre o app → seleciona criança → **check-in** (gera
`code`) → etiqueta impressa no balcão → ao buscar, informa o código →
equipe confere → **check-out**.

---

## Code Reuse Analysis

### Existing Components to Leverage

| Component | Location | How to Use |
|---|---|---|
| `CelebrationAttendanceService` | `apps/api/src/celebrations/celebration-attendance.service.ts` | `children` segue como está; ganha `suggested_children` lido de `KidsCheckin` |
| Padrão de controller (`JwtAuthGuard`, `RolesGuard`, `PlanGuard`, `TenantContextInterceptor`, `@RequiresPlan('premium')`) | `celebration-attendance.controller.ts` | Copiar a pilha de guards |
| `CelebrationMinistry` / `CelebrationAssignment` | `prisma/schema.prisma` | Escala por sessão: coluna opcional `kids_session_id` |
| `Household` / `HouseholdMember(role=child)` | `schema.prisma` | Criança entra no Household do responsável |
| `ConsentRecord` | `schema.prisma` | Consentimento do responsável, `origin='kids'` |
| `QrToken` / `MeetingCheckinToken` | `schema.prisma` | Padrão de token curto e expiração; não reutilizar a tabela |
| RLS `026_rls_celebration_attendance.sql` | `prisma/migrations/` | Molde do script novo |
| `bootstrap-db.sh` passo 7 | `apps/api/scripts/bootstrap-db.sh:208` | Registrar script e verificação |
| `AuditInterceptor` | `apps/api/src/audit` | Leitura de saúde e exceção de retirada |
| Anonimização de pessoa | `persons.service.ts`, `me-privacy.service.ts` | Criança segue o fluxo existente |
| `DataTable`, `Modal`, `Sheet`, `StatusBadge` | `apps/web/src/components/ui/` | Telas de gestão |
| `pdf-export.service.ts` | `apps/api/src/celebrations/` | Etiqueta em PDF pequeno (fase 2 da etiqueta) |

### Integration Points

| System | Integration Method |
|---|---|
| Escala (`my-celebration-assignments`) | Item ganha `kids_session` (turma, horário) |
| `/pessoas/indicadores` | Cartão "Kids" lê novo `GET /kids/attendance/summary` |
| Push (OneSignal, AD-003) | "Criança retirada" ao responsável primário; categoria própria |
| Importação de pessoas | Não importa crianças no MVP |

---

## Components

### KidsRoomsModule (API)

- **Purpose**: catálogo de turmas da congregação.
- **Location**: `apps/api/src/kids/rooms/`
- **Interfaces**:
  - `POST /kids/rooms`, `GET /kids/rooms`, `PATCH /kids/rooms/:id`, `DELETE` = desativar (`is_active=false`)
- **Reuses**: padrão `ministries.controller.ts`.

### KidsSessionsService (API)

- **Purpose**: abrir/cancelar sessões por instância, em lote por modelo.
- **Location**: `apps/api/src/kids/sessions/`
- **Interfaces**:
  - `GET /celebrations/instances/:id/kids-sessions`
  - `POST /celebrations/instances/:id/kids-sessions` `{ room_ids[] }`, 409 no par repetido
  - `DELETE /kids/sessions/:id` (cancela; com check-in aberto → 422)
  - `GET /celebrations/:id/kids-template` → `{ celebration_id, room_ids, rooms }`
  - `POST /celebrations/:id/kids-template` `{ room_ids[] }` substitui o modelo (vazio limpa); guardado em `celebrations.kids_default_room_ids` (sem FK, sem RLS nova)
  - `POST /celebrations/:id/kids-template/apply` `{ date_from?, date_to? }` abre as turmas ativas do modelo nas instâncias futuras não canceladas; idempotente → `{ instances, created, already_open, skipped_rooms }`
- **Reuses**: `CelebrationInstancesService` para status e cancelamento.

### KidsChildrenService (API)

- **Purpose**: criança, responsáveis, consentimento, dado de saúde.
- **Location**: `apps/api/src/kids/children/`
- **Interfaces**:
  - `GET /kids/children` (do responsável: seus filhos; da equipe: busca na congregação)
  - `POST /kids/children`, `PATCH /kids/children/:id`
  - `POST /kids/children/:id/guardians`, `DELETE /kids/guardians/:id`
  - `POST /kids/consent` (cria `ConsentRecord origin='kids'` com versão do termo)
- **Reuses**: `PersonsService.create`, `ConsentRecord`.

### KidsCheckinService (API)

- **Purpose**: check-in/out com código e exceções.
- **Location**: `apps/api/src/kids/checkin/`
- **Interfaces**:
  - `POST /kids/sessions/:id/checkins` `{ child_id, guardian_id, confirm_out_of_range? }` → `{ code, label }`; `guardian_id` é obrigatório (quem entrega) e `checked_in_by` vem do usuário (quem recebe); 422 se fora da faixa e a turma não aceita; pede `confirm_out_of_range` se aceita
  - `POST /kids/checkins/:id/checkout` `{ code }` (QR fica para o futuro)
  - `POST /kids/checkins/:id/checkout-override` `{ reason, picked_up_by_name }` (líder kids)
  - `GET /kids/sessions/:id/roster` (quem está presente, alergias em destaque)
- **Dependencies**: índice único parcial, geração de código único por sessão.

### Web: Kids (gestão e balcão)

- **Location**: `apps/web/src/app/(admin)/kids/` (`page.tsx` sessões do dia, `turmas/`, `criancas/`) e `apps/web/src/components/kids/`
- **Reuses**: `DataTable`, `Modal`, `Sheet`, cores `brand`/`teal`/`amber`.
- Busca de dados por `useEffect` + axios (`src/lib/api.ts`); sem react-query.

### Mobile: Kids (responsável e equipe)

- **Location**: `apps/mobile/src/app/kids/` e `apps/mobile/src/lib/kids/`
- Tokens de `src/lib/theme/tokens.ts`; ícones em `src/lib/theme/icons.ts`; alvo de toque ≥ 48px.

---

## Direção visual (skill `frontend-design`; o design system do app vence)

O brief é o design system existente: Geist, cor da igreja (`brand`, nome histórico `navy`), teal/amber da Orbien, cards `rounded-xl`, botão/badge pill. Aqui o "distinto" fica nas escolhas livres:

- **Plano de tokens (sem hex novo):** `brand` para ação principal, `teal` para presente/retirado com sucesso, `amber` para alerta de alergia e de capacidade, `crimson` só para recusa de retirada. Alergia nunca depende só de cor: ícone + texto "Alergia: amendoim".
- **Elemento memorável (um só):** o **código de retirada** — 4 caracteres em tamanho grande, tipografia tabular e espaçamento largo, igual na tela do responsável, na etiqueta da criança e na do responsável. É o objeto que a equipe e o pai reconhecem a 3 metros.
- **Tudo ao redor quieto:** lista de presentes em tabela simples, sem ilustração infantilizada nem cantos exagerados; kids é operação de segurança, o tom é calmo e legível.
- **Layout web — balcão (tablet em paisagem):**

```
┌ Culto 10h · domingo ───────────── [Maternal 8/12] [Júnior 14/20] ┐
│ Buscar criança ou código  [____________]        [Check-in]       │
│ ─ Presentes (14) ───────────────────────────────────────────────│
│  Ana Souza    Júnior   ⚠ Alergia: amendoim     código 7K2M  [Sair]│
└──────────────────────────────────────────────────────────────────┘
```

- **Mobile — responsável:** lista de filhos como linhas largas (não grade de cards); toque na criança → escolher turma sugerida pela idade → confirmação com o código grande. Alinhamento à esquerda; ação primária fixa no rodapé.
- **Copy:** verbos exatos e consistentes: "Fazer check-in" → toast "Check-in feito"; "Entregar criança" → "Criança entregue". Recusa: "Este código não é de quem está buscando. Chame o líder kids." (sem dizer quem pode retirar).
- **Qualidade mínima:** foco visível, `prefers-reduced-motion`, contraste AA, sem animação de entrada; a única animação é a confirmação do check-in.
- **Etiqueta (impressão):** CSS `@page` 62×29 mm no web; no mobile compartilha PDF. Nome, turma, alergia em faixa `amber` e o código.

---

## Data Models

```prisma
model KidsRoom {
  id String @id @default(uuid())
  tenant_id String; congregation_id String
  name String
  min_age_months Int; max_age_months Int
  allows_out_of_range Boolean @default(false)
  capacity Int?; min_volunteers Int @default(0)
  is_active Boolean @default(true)
  sessions KidsSession[]
  @@index([tenant_id, congregation_id]) @@map("kids_rooms")
}
model KidsSession {
  id String @id @default(uuid())
  tenant_id String; congregation_id String
  celebration_instance_id String; room_id String
  status KidsSessionStatus @default(open) // open | cancelled
  @@unique([celebration_instance_id, room_id])
  @@map("kids_sessions")
}
model KidsGuardian {
  id String @id @default(uuid())
  tenant_id String; congregation_id String
  child_id String; guardian_person_id String
  relationship String; can_pickup Boolean @default(true); is_primary Boolean @default(false)
  @@unique([child_id, guardian_person_id]) @@map("kids_guardians")
}
model KidsCheckin {
  id String @id @default(uuid())
  tenant_id String; congregation_id String
  session_id String; child_id String; guardian_person_id String
  code String; age_override Boolean @default(false)
  celebration_instance_id String // desnormalizado: o índice parcial (child_id, celebration_instance_id) WHERE checked_out_at IS NULL não atravessa join; FK composta com kids_sessions(id, celebration_instance_id) o mantém igual ao da sessão
  checked_in_at DateTime @default(now()); checked_in_by String // quem recebe na turma (obrigatório)
  checked_out_at DateTime?; picked_up_by_person_id String?; picked_up_by_name String?
  override_reason String?; checked_out_by String?
  @@unique([session_id, code])
  @@map("kids_checkins")
}
```

Mais: `Person.is_child Boolean @default(false)` (lista de pessoas exclui por padrão) e `CelebrationMinistry.kids_session_id String?`.
Índice único parcial na migration: `kids_checkins(child_id, (session.celebration_instance_id))` onde `checked_out_at IS NULL` — como o Prisma não expressa isso, vai em SQL na migration, como no pedido de troca (`AssignmentSwapRequest`).

**Relationships**: toda tabela carrega `tenant_id` + `congregation_id` e RLS `app_congregation_allowed(congregation_id)` em `USING` e `WITH CHECK` idênticos (AD-001). Script `028_rls_kids.sql` entra no `bootstrap-db.sh` no bloco dos de tabela (antes do passo 4) com verificação no passo 7.

---

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
|---|---|---|
| Check-in duplicado | 409 por índice parcial | "Esta criança já está presente" |
| Sem consentimento vigente | 422 com versão do termo | Pede aceite antes de seguir |
| Código inválido no check-out | 403 genérico + evento de auditoria + aviso ao líder | "Chame o líder kids" |
| Sessão cancelada | 422 | Mensagem clara, sem check-in |
| Conexão cai no balcão | Retry idempotente por `(session, child)`; sem fila offline no MVP | Botão tenta de novo; sem duplicar |
| Colisão de código | Re-gera até 5 vezes, depois 500 logado | Imperceptível |

---

## Risks & Concerns

| Concern | Location | Impact | Mitigation |
|---|---|---|---|
| Criança aparece em listas, indicadores e exportações de pessoas | `apps/api/src/persons/persons.service.ts:85` | Vazamento de dado de menor; contagem de membros inflada | `Person.is_child` e filtro padrão `is_child=false`; teste dedicado em cada listagem |
| Retirada por pessoa errada | `kids/checkin` (novo) | Dano real a menor | Código + `can_pickup` + override com motivo e auditoria; teste de recusa |
| Anonimização de check-in |  `apps/api/src/persons/persons-retention-notifier.service.ts` | Apagar histórico de quem ainda é membro ativo | Job de 12 meses pula check-in cujo `guardian_person_id` é membro ativo (`classification=member`, `deleted_at` nulo) e volta a valer ao deixar de ser | 
| Dado de saúde em log | `AuditInterceptor` global | Alergia em texto em `audit_logs` | Auditar o acesso (quem/quando), nunca o conteúdo |
| `children` manual vs sugerido divergem | `celebration-attendance.service.ts:80` | Número duplo confunde | Mostrar os dois lado a lado; só o manual é gravado (AC 4) |
| Menor sem conta e RLS por congregação | `app_congregation_allowed()` | Responsável de outra congregação do tenant não vê o filho | Ficha restrita à congregação da criança; troca de congregação fora do MVP |
| LGPD diz "MVP não trata criança" | `docs/produto/orbien-lgpd-mapping.md:60` | Documento contradiz o produto | Tarefa de atualizar o mapeamento e o termo antes do lançamento |

---

## Tech Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Código de retirada | 4 caracteres de `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (sem 0/O/1/I/L) | Legível em etiqueta; único por sessão |
| Etiqueta | HTML/CSS impresso (web), PDF (mobile) | Sem impressora térmica nem dependência nova |
| Check-out | Só por código no MVP; QR é futuro | Decisão do dono do produto; leitor de câmera do check-in de PG fica para depois |
| Plano | `premium` | Decisão do dono do produto |
| Criança sem login | `Person` sem `UserAccount`, `is_child=true` | Menor não autentica |

> **AD-013** (convenção para futuras features): dado de criança é `Person` com `is_child=true`, sem conta, fora de listas por padrão. Ver `.specs/STATE.md`.
