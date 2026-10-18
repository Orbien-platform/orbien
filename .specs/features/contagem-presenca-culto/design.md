# Contagem de presença por culto — Design

## API (`apps/api`)

- **Prisma**: `model CelebrationAttendance` (`celebration_attendance`): `id`, `tenant_id`,
  `congregation_id`, `celebration_instance_id @unique`, `children`, `members`, `attendees`,
  `visitors` (Int), `updated_by` (user id), timestamps; FK cascade para instância. Mais
  `Ministry.counts_attendance Boolean @default(false)`. Uma migration.
- **RLS**: `026_rls_celebration_attendance.sql` no molde do 025 (`tenant_congregation_isolation`,
  USING = WITH CHECK, `app_congregation_allowed`), entrada no `bootstrap-db.sh` (passo 3 + verificação do passo 7) e
  teste de RLS.
- **Service** `CelebrationAttendanceService` (módulo `celebrations`):
  `upsert(instanceId, user, dto)`, `summary(query)`, `list(query)`.
  Elegibilidade deriva a pessoa de `user_accounts.person_id` no banco (não da claim) → `VolunteerProfile`
  → `CelebrationAssignment` em `CelebrationMinistry` com `ministry.counts_attendance`, status ∈ {pending, confirmed}.
  "Dia chegou": compara `scheduled_date` com a data local da congregação (`timezone`).
- **Rotas** (rotas fixas antes de `:id`): `PUT celebrations/instances/:id/attendance`
  (roles: `VOLUNTEER_ROLES` + WRITE_ROLES, elegibilidade no service),
  `GET celebrations/attendance/summary` e `GET celebrations/attendance` (`READ_ROLES`).
- **my-assignments**: acrescenta `attendance` e `can_count_attendance` (campo aditivo).
- Média: `AVG`/`SUM` por Prisma `aggregate` sobre contagens de instâncias não canceladas no período; casas decimais no service (`round1`).

## Web (`apps/web`)
- Detalhe da celebração (`CelebrationDetailSheet`): bloco "Presença" com 4 campos + total.
- Ministérios: checkbox "Responsável pela contagem de presença".
- Nova tela `/celebracoes/presenca` (aba/atalho na página de celebrações; sem novo item de menu): filtros período + celebração, KPIs de média, lista por culto (P2). Padrão `useEffect` + axios. Passa por `frontend-design`.

## Mobile (`apps/mobile`)
- `escala-client.ts`: `saveAttendance(instanceId, counts)`; tipos em `types.ts`.
- Tela `celebracao/[id].tsx` e/ou card da Escala: formulário só com `can_count_attendance`. Tokens do tema, alvo ≥48px.

## Tasks (alto nível, ~8; cabe em um batch)
1 modelo+migration+RLS+bootstrap · 2 service+rotas+testes (100% cobertura) · 3 flag de ministério (API+web) · 4 my-assignments · 5 web formulário · 6 web média+lista · 7 mobile · 8 teste de RLS + docs/PLANO.md
