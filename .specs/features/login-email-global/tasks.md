# Login por e-mail único (global) Tasks

## Execution Protocol (MANDATORY — do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and
follow its Execute flow and Critical Rules.** Do not search for skill files
by filesystem path. The skill is the source of truth for the full flow
(per-task cycle, sub-agent delegation, adequacy review, Verifier,
discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed
without it.**

---

**Design**: `.specs/features/login-email-global/design.md`
**Status**: Draft

---

## Pré-requisito manual (fora do fillsd, antes da Task 5)

Antes da migration de `@@unique([email])` (Task 5), alguém com acesso ao
Postgres de produção precisa rodar e resolver qualquer resultado:

```sql
SELECT email, count(*) AS contas, array_agg(tenant_id) AS tenants
FROM user_accounts
GROUP BY email
HAVING count(*) > 1;
```

Se vier alguma linha: decidir manualmente (transferir uma das contas via
rota nova da Task 8, ou trocar o e-mail de uma delas) antes de aplicar a
migration em produção — a migration não resolve isso por conta própria
(AUTH-05/06).

---

## Test Coverage Matrix

> Gerado por amostragem do repositório (`apps/api/jest.config.js`,
> `apps/api/src/auth/*.spec.ts`, `apps/api/src/platform/*.spec.ts`) e da
> spec. Sem `AGENTS.md` de teste dedicado na API — `apps/api/AGENTS.md` não
> existe; convenção inferida do `jest.config.js` e dos specs existentes.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Serviço de domínio (`AuthService`, `TransferUserAccountService`) | unit | 1:1 com os ACs da spec; todo edge case listado (401 genérico, conta ambígua impossível, no-op de transferência, revogação de família) | `apps/api/src/**/*.spec.ts` (projeto `unit` do jest) | `npm run test -w orbien-backend` |
| Controller (`AuthController`, `PlatformController`) | unit | Guards/decorators corretos (`ThrottlerGuard`, `@PlatformRoute`, `@Roles`), DTO sem `tenant_slug` | `apps/api/src/**/*.controller.spec.ts` | `npm run test -w orbien-backend` |
| RLS / isolamento entre tenants | rls | Transferência move dado sem abrir acesso indevido; tenant de origem não lê `user_accounts`/`persons` pós-transferência | `apps/api/test/rls/**/*.spec.ts` | `npm run test:rls -w orbien-backend` |
| Migration de schema (`@@unique([email])`, `audit_logs.actor_name_snapshot`) | none | build gate only — a migration em si não tem teste unitário, a Task 5 documenta a checagem manual | — | build gate only |
| Front-end (`apps/web`, `apps/mobile` — remoção do campo de tenant) | unit (vitest) | Formulário sem campo de igreja; submit sem `tenant_slug` | `apps/web/src/**/*.test.tsx` | `npm run test -w orbien-web` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Depois de tasks só com teste unit (API) | `npm run test -w orbien-backend` |
| Full | Depois de tasks com RLS ou integração | `npm run test -w orbien-backend && npm run test:integration -w orbien-backend && npm run test:rls -w orbien-backend` |
| Build | Fim de fase / mudança de schema | `npm run lint && npm run build:api && npm run test -w orbien-backend` |

---

## Execution Plan

### Phase 1: Auditoria — base para o snapshot de nome

```
T1 → T2
```

### Phase 2: Migration de e-mail único

```
T3 → T4 → T5
```

### Phase 3: Login sem tenant_slug

```
T6 → T7
```

### Phase 4: Transferência de tenant (API)

```
T8 → T9 → T10 → T11
```

### Phase 5: Front-ends

```
T12 → T13
```

---

## Task Breakdown

### T1: `AuditLog.actor_name_snapshot` no schema + migration Prisma

**What**: Adiciona `actor_name_snapshot String?` a `AuditLog` no
`schema.prisma` e gera a migration Prisma correspondente (`prisma migrate
dev --name add_actor_name_snapshot_to_audit_log`).
**Where**: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_add_actor_name_snapshot_to_audit_log/`
**Depends on**: None
**Reuses**: padrão de migration simples já usado por `20260911172047_add_is_active_to_tenant`.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] Campo existe no schema e na migration gerada
- [x] `npx prisma migrate dev` roda limpo localmente
- [x] Gate: `npm run build:api`

**Tests**: none (schema/config)
**Gate**: build

**Status**: ✅ Concluída — commit `b45fb69`.

---

### T2: `AuditInterceptor` resolve e passa `actor_name_snapshot`

**What**: Antes do `audit_insert()`, resolve `person.full_name` a partir de
`user.sub` (join `user_accounts → persons`) e passa como novo argumento;
altera `audit_insert()` em `001_rls_setup.sql` (`CREATE OR REPLACE
FUNCTION`, 11º parâmetro `p_actor_name_snapshot TEXT`) para gravar o campo.
**Where**: `apps/api/src/common/interceptors/audit.interceptor.ts`,
`apps/api/prisma/migrations/001_rls_setup.sql`
**Depends on**: T1
**Reuses**: a própria estrutura do `tap()` já existente; `PrismaService`.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [x] `audit_insert()` grava `actor_name_snapshot` em toda chamada (interceptor)
- [x] Registro sem `person` (caso raro) grava `NULL`, não quebra o insert
- [x] `bash scripts/bootstrap-db.sh` local aplica o `CREATE OR REPLACE` sem erro
- [x] Gate: `npm run test -w orbien-backend`

**Tests**: unit (`audit.interceptor.spec.ts` — casos: com pessoa, sem pessoa, `audit_insert` chamado com o argumento novo)
**Gate**: quick

**Commit**: `feat(api): audit_logs.actor_name_snapshot, resolvido no AuditInterceptor`

**Status**: ✅ Concluída — commit `28bd5bb`.

**SPEC_DEVIATION**: o design previa resolver o nome com uma query simples
(`user.sub` → join até `persons`). Na prática isso sempre voltaria vazio: a
tabela `persons` não tem policy de bypass para `orbien_app` (só
`user_accounts` tem, via `orbien_app_auth` em
`20260608175621_fix_orbien_app_auth_policies`), e o `AuditInterceptor` lê
fora de qualquer transação com `SET LOCAL ROLE app_user`/contexto de tenant.
**Reason**: acrescentei `resolve_actor_name(p_actor_user_id)` em
`001_rls_setup.sql`, `SECURITY DEFINER` como `audit_insert()` — só resolve o
nome, não decide o que auditar — para bypassar essa RLS pontual. Confirmado
manualmente via `psql` como `orbien_app` sem contexto antes de escrever o
TypeScript (SELECT direto em `persons` devolve 0 linhas; a função devolve o
nome certo). Não altera o acordo do AD-004 (resolvido uma vez, no
interceptor, nunca dentro de `audit_insert()`).

---

### T3: Query de verificação de duplicata (documentação, sem código)

**What**: Confirma que o SQL do "Pré-requisito manual" acima está correto
contra o schema atual (roda contra o Postgres local, que não tem seed —
validar só a sintaxe/plan, não o resultado) e cola o mesmo bloco em
`docs/PENDENCIAS.md` como nota de deploy para esta migration.
**Where**: `docs/PENDENCIAS.md`
**Depends on**: None (pode rodar em paralelo com T1/T2)
**Reuses**: nenhum.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Query documentada em `docs/PENDENCIAS.md` com instrução "rodar antes do deploy desta migration"
- [ ] Gate: nenhum (documentação)

**Tests**: none
**Gate**: build (só para não deixar markdown quebrado — não há gate real aqui)

---

### T4: `@@unique([email])` em `UserAccount` — schema + migration Prisma

**What**: Troca `@@unique([tenant_id, email])` por `@@unique([email])` em
`UserAccount` no `schema.prisma`, gera a migration Prisma.
**Where**: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_unique_email_global/`
**Depends on**: T3 (a checagem de duplicata precisa existir documentada antes de qualquer um rodar isto em produção, mesmo que localmente a migration rode sem depender de T3)
**Reuses**: nenhum — é a mudança estrutural central da feature.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Migration gerada, roda limpo localmente (`npx prisma migrate dev`)
- [ ] Constraint antiga (`tenant_id, email`) removida, nova (`email`) presente
- [ ] Gate: `npm run build:api`

**Tests**: none (schema)
**Gate**: build

**Commit**: `feat(api): user_accounts.email único globalmente (pré-condição do login sem tenant_slug)`

---

### T5: DTO `LoginDto` perde `tenant_slug`

**What**: Remove `tenant_slug` de `LoginDto`; adiciona teste garantindo que
o DTO aceita corpo sem o campo (`@IsEmail`/`@IsNotEmpty` continuam nos
outros dois).
**Where**: `apps/api/src/auth/dto/login.dto.ts`
**Depends on**: T4
**Reuses**: `PlatformLoginDto` como referência de forma (já não tem `tenant_slug`).

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `tenant_slug` removido do DTO
- [ ] Gate: `npm run test -w orbien-backend`

**Tests**: unit (validação do DTO)
**Gate**: quick

---

### T6: `AuthService.login` busca por e-mail (sem tenant), rate limit por e-mail

**What**: Reescreve `login()` para `findUnique({ where: { email } })`
(equivalente ao `findMany` de `platformLogin`, mas sem branch de
ambiguidade — a unicidade já é garantida pelo schema), resolve `tenant`
a partir da conta encontrada, verifica `is_active`/senha/tenant ativo e
mantém o mesmo erro 401 genérico. Troca a chave do rate limit para
`LoginRateLimitService.key('login', dto.email)`.
**Where**: `apps/api/src/auth/auth.service.ts`
**Depends on**: T5
**Reuses**: `platformLogin` como modelo direto; `rolesForToken`; `rateLimit.assert/clear/register` já existentes.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `login()` autentica sem `tenant_slug`, token carrega `tenant_id` correto
- [ ] E-mail inexistente, senha errada, conta inativa e tenant inativo devolvem o mesmo 401 `INVALID_CREDENTIALS`
- [ ] Rate limit por e-mail (5 falhas / 15 min) preservado
- [ ] Testes antigos de `login` reescritos (assinatura do DTO mudou) — nenhum teste apagado sem substituto equivalente
- [ ] Gate: `npm run test -w orbien-backend`

**Tests**: unit — 1:1 com AUTH-01/02/03 + edge cases (conta inexistente, senha errada, conta inativa, tenant inativo, rate limit)
**Gate**: quick

**Commit**: `feat(api): POST /auth/login sem tenant_slug — resolve conta por e-mail único`

---

### T7: `AuthController` — remove qualquer referência residual a `tenant_slug`

**What**: Confirma que `login()` no controller não passa nada além do DTO
alterado; atualiza `auth.controller.spec.ts` se algum teste ainda montar
payload com `tenant_slug`.
**Where**: `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.controller.spec.ts`
**Depends on**: T6
**Reuses**: nenhum — é limpeza pontual.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Nenhum teste ou código de produção referencia `tenant_slug` em `login`
- [ ] Gate: `npm run test -w orbien-backend`

**Tests**: unit (ajuste dos specs existentes do controller)
**Gate**: quick

---

### T8: `TransferUserAccountDto` + `TransferUserAccountService`

**What**: Cria o DTO (`destination_tenant_id`, `destination_congregation_id`)
e o serviço que, numa transação: atualiza `UserAccount.tenant_id`/
`congregation_id`, atualiza `Person.tenant_id`/`congregation_id` da mesma
pessoa, remove `RoleAssignment` do tenant de origem (mantém
`platform_support`), revoga a família de refresh tokens da conta, e chama
`audit_insert()` com `entity='user_account'`, `action='tenant_transfer'`,
`before`/`after` com tenant/congregação de origem e destino. Rejeita no-op
(mesmo tenant de destino) com 400.
**Where**: `apps/api/src/platform/transfer-user-account.service.ts`,
`apps/api/src/platform/dto/transfer-user-account.dto.ts`
**Depends on**: T2 (precisa do `actor_name_snapshot` já existente em
`audit_insert()`), T4 (schema já com email único, ainda que este serviço
não dependa diretamente da constraint)
**Reuses**: `SetTenantActiveService` (forma do serviço, tratamento de
`P2025`), `AuthService.refresh` (revogação de família de tokens),
`AuditInterceptor` (forma da chamada a `audit_insert()`).

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Transferência move conta+pessoa na mesma transação (AUTH-07)
- [ ] Refresh tokens da conta revogados (AUTH-08... na verdade AUTH-08 da spec é sobre migration; aqui é o AC2 da história P2 — revogação de sessão)
- [ ] `role_assignments` do tenant de origem removidos, `platform_support` preservado (AC3 da história P2)
- [ ] `audit_logs` gravado com `before`/`after` corretos e `actor_name_snapshot` presente (AC4/AC5 da história P2)
- [ ] Transferência para o mesmo tenant rejeitada com 400
- [ ] Tenant/congregação de destino inexistente ou inativo rejeitados (404/400)
- [ ] Gate: `npm run test -w orbien-backend`

**Tests**: unit — 1:1 com AC1-AC5 da história P2 + edge cases (no-op, destino inexistente, destino inativo, falha do audit_insert não desfaz a transferência)
**Gate**: quick

**Commit**: `feat(api): transferência de conta entre tenants (platform_support)`

---

### T9: Rota `PATCH /platform/user-accounts/:id/transfer`

**What**: Registra a rota no `PlatformController`, com as mesmas 3 marcas
(`@Roles('platform_support')`, `@PlatformRoute()`, herdadas do controller)
e injeta `TransferUserAccountService`.
**Where**: `apps/api/src/platform/platform.controller.ts`, `apps/api/src/platform/platform.module.ts`
**Depends on**: T8
**Reuses**: estrutura idêntica às rotas `tenants/:id/deactivate`/`activate` já no controller.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Rota registrada, protegida pelas mesmas guards/decorators do controller
- [ ] `platform.module.ts` provê o serviço novo
- [ ] Gate: `npm run test -w orbien-backend`

**Tests**: unit (`platform.controller.spec.ts` — rota chama o serviço certo, guards presentes)
**Gate**: quick

---

### T10: Teste de RLS — transferência não abre acesso indevido

**What**: Teste de integração/RLS confirmando que, após a transferência, o
tenant de origem não consegue mais `SELECT` a conta/pessoa via `app_user`
(RLS normal), mas continua lendo registros históricos com `tenant_id`
próprio (ex.: uma `financial_transaction` fabricada antes da
transferência).
**Where**: `apps/api/test/rls/user-account-transfer.spec.ts` (novo)
**Depends on**: T9
**Reuses**: padrão dos specs existentes em `apps/api/test/rls/`.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Teste roda contra Postgres real (`npm run test:rls -w orbien-backend`)
- [ ] Confirma AUTH-07/AUTH-12 (isolamento pós-transferência + histórico intacto)
- [ ] Gate: `npm run test:rls -w orbien-backend`

**Tests**: rls
**Gate**: full

**Commit**: `test(api): RLS de transferência de conta entre tenants`

---

### T11: `docs/PLANO.md` — registra a transferência como capability nova

**What**: Adiciona entrada `PROD-` em `docs/PLANO.md` documentando que a
transferência de tenant existe, é `platform_support`-only, e onde vive
(sem duplicar o design.md — só o registro de produto).
**Where**: `docs/PLANO.md`
**Depends on**: T9
**Reuses**: nenhum.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Entrada registrada com ID novo
- [ ] Gate: nenhum (documentação)

**Tests**: none
**Gate**: build

---

### T12: `apps/web` — login sem campo de tenant

**What**: Remove o campo/estado de `tenant_slug` da tela e do payload de
login do `apps/web`; atualiza o teste do componente.
**Where**: `apps/web/src/app/(public)/login/page.tsx` (ou caminho
equivalente — confirmar no código antes de editar), teste correspondente.
**Depends on**: T6
**Reuses**: nenhum específico — é a mesma tela, menos um campo.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Tela não mostra nem envia `tenant_slug`
- [ ] Gate: `npm run test -w orbien-web`

**Tests**: unit (vitest) — submit sem o campo, mensagem de erro genérica preservada
**Gate**: quick

**Commit**: `feat(web): login sem campo de igreja`

---

### T13: `apps/mobile` — login sem campo de tenant

**What**: Mesma remoção na tela de login do `apps/mobile`.
**Where**: tela de login do Expo Router (confirmar caminho antes de editar).
**Depends on**: T6
**Reuses**: nenhum específico.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Tela não mostra nem envia `tenant_slug`
- [ ] Gate: `npm run build --filter=orbien-mobile` (ou o gate que o app usa — confirmar no `apps/mobile/package.json`)

**Tests**: none (sem suíte de teste de UI configurada no mobile hoje — confirmar antes de assumir; se existir, tratar como o `apps/web`)
**Gate**: build

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ──→ T2
Phase 2:  T3 ──→ T4 ──→ T5
Phase 3:  T6 ──→ T7
Phase 4:  T8 ──→ T9 ──→ T10 ──→ T11
Phase 5:  T12 ──→ T13
```

Execução estritamente sequencial dentro de cada fase. T12/T13 dependem de
T6 (não de T7-T11) — poderiam rodar em paralelo com a Fase 4 se despachadas
como batch separado; mantidas como Fase 5 pela ordem natural de leitura,
não por dependência real.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: schema + migration `actor_name_snapshot` | 1 mudança de schema | ✅ Granular |
| T2: `AuditInterceptor` + `audit_insert()` | 1 função + 1 interceptor (mesma mudança, 2 arquivos acoplados) | ✅ Granular (coesos, mesma mudança) |
| T3: query de verificação documentada | 1 documento | ✅ Granular |
| T4: `@@unique([email])` | 1 mudança de schema | ✅ Granular |
| T5: `LoginDto` sem `tenant_slug` | 1 arquivo | ✅ Granular |
| T6: `AuthService.login` reescrito | 1 função | ✅ Granular |
| T7: limpeza do controller/specs | 1 arquivo + specs relacionados | ✅ Granular |
| T8: `TransferUserAccountService` + DTO | 1 serviço + 1 DTO (acoplados) | ✅ Granular |
| T9: rota no `PlatformController` | 1 endpoint | ✅ Granular |
| T10: teste RLS de transferência | 1 arquivo de teste | ✅ Granular |
| T11: `docs/PLANO.md` | 1 documento | ✅ Granular |
| T12: `apps/web` login | 1 componente | ✅ Granular |
| T13: `apps/mobile` login | 1 componente | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | Fase 1 início | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | None | Fase 2 início (paralelo a T1/T2 na prática, sequencial na fase por convenção) | ✅ Match |
| T4 | T3 | T3→T4 | ✅ Match |
| T5 | T4 | T4→T5 | ✅ Match |
| T6 | T5 | Fase 3 início, após Fase 2 | ✅ Match |
| T7 | T6 | T6→T7 | ✅ Match |
| T8 | T2, T4 | Fase 4 início, após Fases 1 e 2 | ✅ Match |
| T9 | T8 | T8→T9 | ✅ Match |
| T10 | T9 | T9→T10 | ✅ Match |
| T11 | T9 | T9→T11 (via T10 na ordem da fase) | ✅ Match |
| T12 | T6 | Fase 5, após Fase 3 | ✅ Match |
| T13 | T6 | Fase 5, após Fase 3 | ✅ Match |

Nenhuma tarefa depende de uma tarefa de fase posterior.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Entity/schema | none | none | ✅ OK |
| T2 | Serviço/interceptor (auditoria) | unit | unit | ✅ OK |
| T3 | Documentação | none | none | ✅ OK |
| T4 | Entity/schema | none | none | ✅ OK |
| T5 | DTO | unit (parte do controller layer) | unit | ✅ OK |
| T6 | Serviço de domínio | unit | unit | ✅ OK |
| T7 | Controller | unit | unit | ✅ OK |
| T8 | Serviço de domínio | unit | unit | ✅ OK |
| T9 | Controller | unit | unit | ✅ OK |
| T10 | RLS | rls | rls | ✅ OK |
| T11 | Documentação | none | none | ✅ OK |
| T12 | Front-end (web) | unit | unit | ✅ OK |
| T13 | Front-end (mobile) | none (sem suíte configurada — a confirmar) | none | ✅ OK (condicional — T13 deve virar `unit` se a checagem inicial da task encontrar suíte de teste já configurada no mobile) |

---

## Task Verification Standards

Cada task segue `Done when` + `Tests` + `Gate` como definido acima. Nenhuma
task apaga ou enfraquece teste existente para passar — onde a mudança de
assinatura (`LoginDto`, `login()`) quebra teste antigo, a task reescreve o
teste para o comportamento novo, nunca remove a cobertura.
