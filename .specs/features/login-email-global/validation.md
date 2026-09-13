# Login por e-mail único (global) Validation

**Date**: 2026-09-13
**Spec**: `.specs/features/login-email-global/spec.md`
**Diff range**: `9dc33d6..HEAD` (excluindo `e1d080a`, fix incidental de `esqueci-senha` sem AC correspondente — verificado apenas como gate, não como AC)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1–T13 (+T6b, T7b, T11b) | ✅ Done | Todas marcadas concluídas em `tasks.md`, hashes de commit confirmados em `git log`. Nenhuma bloqueada/parcial. |

---

## Spec-Anchored Acceptance Criteria

### P1: Login sem informar a igreja

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: login sem `tenant_slug` resolve conta única por e-mail, devolve tokens com `tenant_id` da conta | token com `tenant_id` correto, sem `tenant_slug` no body | `apps/api/src/auth/auth.service.spec.ts:174-198` — `expect(payload.tenant_id).toBe('t1')`, chamada sem `tenant_slug` | ✅ PASS |
| AC2: senha errada / e-mail inexistente / conta inativa / tenant inativo → mesmo 401 `INVALID_CREDENTIALS` | código exato `INVALID_CREDENTIALS`, indistinguível | `auth.service.spec.ts:117-123` (inexistente), `:132-141` (inativa), `:144-154` (tenant inativo), `:157-171` (senha errada) — todos `rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } })` | ✅ PASS |
| AC3: request sem `tenant_slug` aceita; cliente antigo que envia é ignorado, não rejeitado | DTO válido com/sem o campo | `apps/api/src/auth/dto/login.dto.spec.ts:11-15` (sem o campo, `errors` vazio) e `:29-36` (com o campo, ainda `errors` vazio) | ✅ PASS |

### P1: E-mail único no banco

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: `@@unique([email])` substitui `@@unique([tenant_id, email])` | constraint global no schema e no banco | `apps/api/prisma/schema.prisma:222` (`@@unique([email])`, chave composta ausente); migration `apps/api/prisma/migrations/20260913123836_unique_email_global/migration.sql:1-5` (`DROP INDEX ..._tenant_id_email_key` + `CREATE UNIQUE INDEX ..._email_key`) | ✅ PASS |
| AC2: migration com duplicata existente falha alto, nunca escolhe uma em silêncio | migration deve falhar contra base com duplicata fabricada | **Nenhum teste automatizado roda a migration contra uma base com duplicata fabricada.** O "Independent Test" do próprio AC ("rodar a migration contra uma base com duplicata fabricada e confirmar que ela falha") nunca foi executado — T3 só confirmou sintaxe da query manual contra banco vazio (`docs/PENDENCIAS.md:1470-1478`), e a garantia depende inteiramente do comportamento nativo do Postgres (`CREATE UNIQUE INDEX` falha por natureza sobre dado duplicado) | ❌ GAP (evidence-or-zero — mecanismo plausível, mas não coberto por evidência de teste) |
| AC3: `INSERT`/`UPDATE` com e-mail duplicado é rejeitado pelo banco e traduzido em erro específico pela camada de serviço | violação de unicidade → mensagem específica, não 500 | `apps/api/src/users/users.service.spec.ts:114-125` — `expect(err.code).toBe('P2002')` → serviço lança `ConflictException('Já existe uma conta com este e-mail neste tenant.')` (`users.service.ts:97-99`) | ⚠️ Spec-precision gap — comportamento correto (409, não 500), mas a mensagem ("...neste tenant") ficou desatualizada: a unicidade agora é global, não por tenant. `users.service.ts` não foi tocado por este diff (pré-existente), então continua funcionando por acidente da genericidade do catch `P2002`, não por uma decisão desta feature. |

### P2: Transferência de pessoa entre tenants

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: transferência atualiza `UserAccount`+`Person` (mesma linha, sem criar conta nova) | mesmo `person_id`, novos `tenant_id`/`congregation_id` | `apps/api/src/platform/transfer-user-account.service.spec.ts:115-144` — asserts em `userAccount.update`/`person.update` com os IDs de destino | ✅ PASS |
| AC2: revoga toda a família de refresh tokens ativos | `refreshToken.updateMany` com `revoked_at` setado | `transfer-user-account.service.spec.ts:161-172` | ✅ PASS |
| AC3: remove `role_assignments` do tenant de origem, exceto `platform_support` | `roleAssignment.deleteMany` com `role_code: { not: 'platform_support' }` | `transfer-user-account.service.spec.ts:173-184` | ✅ PASS |
| AC4: grava `audit_logs` com `entity='user_account'`, `action='tenant_transfer'`, `before`/`after` no tenant de origem | valores exatos gravados | `transfer-user-account.service.spec.ts:185-212` — `expect(values[5]).toBe('tenant_transfer')` + asserts de `before`/`after` | ✅ PASS |
| AC5: `audit_log` de autor transferido mostra `actor_name_snapshot` congelado, não busca ao vivo | a **tela** deve exibir o nome congelado em vez de resolver ao vivo | **Nenhuma evidência.** `actor_name_snapshot` é gravado (`transfer-user-account.service.ts:174-190`, testado em `transfer-user-account.service.spec.ts:185-212`) e resolvido pelo `AuditInterceptor` para toda auditoria (`audit.interceptor.spec.ts:186-196`), mas **não há tela nem endpoint no diff que leia `actor_name_snapshot` para exibição** — `ListAuditLogsService` (`apps/api/src/platform/list-audit-logs.service.ts`, pré-existente, não tocado por este diff) nem seleciona o campo, e é escopado a `action: 'support_access'`, não ao histórico geral de um tenant. Não existe visualizador de `audit_logs` no `apps/web` (confirmado por busca — só `SupportSessionBanner.tsx` referencia auditoria, e não lê logs). | ❌ GAP — a garantia do dado existe (gravação), a garantia de exibição (o "SHALL mostrar" do AC) não tem implementação nem teste. |
| AC6: registros históricos com `tenant_id` próprio continuam visíveis e inalterados para o tenant de origem | RLS não filtra por tenant atual da conta/pessoa | `apps/api/test/rls/user-account-transfer.spec.ts:194-210` — `financial_transaction` fabricada antes da transferência, `expect(transaction).not.toBeNull()` para o tenant de origem, `expect(transaction).toBeNull()` para o destino | ✅ PASS |

**Edge case da spec (P2)** — "transferir para o mesmo tenant" rejeitado como 400: `transfer-user-account.service.spec.ts:213-227` — `rejects.toBeInstanceOf(BadRequestException)`. ✅ PASS.

### P3: Front-ends param de pedir/mostrar o seletor de igreja

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: tela de login do `apps/web` mostra só e-mail e senha | ausência do campo de igreja | `apps/web/src/app/(public)/login/page.test.tsx:37-40` — `expect(screen.queryByLabelText("Código da sua igreja")).not.toBeInTheDocument()` | ✅ PASS |
| AC2: tela de login do `apps/mobile` mostra só e-mail e senha | ausência do campo de igreja | `apps/mobile/src/__tests__/app/login.test.tsx:24` — teste `'não mostra campo de igreja'` | ✅ PASS |

**Status**: ❌ Gaps presentes (AC2 de "E-mail único no banco" e AC5 de "Transferência" sem evidência de teste/implementação) — demais critérios ✅ PASS ou ⚠️ Spec-precision gap.

---

## Discrimination Sensor

Executado em `git worktree` descartável (`/tmp/verify-worktree`, removido ao final com `git worktree remove --force`) — a árvore de trabalho real nunca foi mutada.

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `apps/api/src/auth/auth.service.ts:123` | `if (!user \|\| !user.is_active \|\| !user.tenant.is_active)` → `if (!user \|\| user.is_active \|\| !user.tenant.is_active)` (inverte a checagem de conta ativa em `login()`) | ✅ Killed (3 testes falharam: `AuthService.login` — conta ativa passou a ser rejeitada) |
| 2 | `apps/api/src/platform/transfer-user-account.service.ts:115-121` | Removida a chamada `tx.roleAssignment.deleteMany(...)` (revogação de papéis no tenant de origem) | ✅ Killed (3 testes falharam — `calls` não contém `roleAssignment.deleteMany`) |
| 3 | `apps/api/src/platform/transfer-user-account.service.ts:126-129` | Removida a chamada `tx.refreshToken.updateMany(...)` (revogação de família de refresh tokens) | ✅ Killed (3 testes falharam — `calls` não contém `refreshToken.updateMany`) |

**Sensor depth**: lightweight (default) — feature não é P0 isolado (login é caminho crítico, mas a task já tem cobertura densa; 3 mutações no código de maior risco novo: checagem de credencial e os dois efeitos colaterais da transferência).
**Result**: 3/3 killed — ✅ PASS

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — cada task troca exatamente o necessário (DTO, service, 1 rota) |
| Surgical changes | ✅ — `apps/admin`/`apps/web`/`apps/mobile` só perdem o campo/parametro de tenant; nenhuma refatoração não pedida |
| No scope creep | ✅ — os 3 achados fora do plano original (`forgotPassword`, `seed.ts`, fixtures de integração, `platformLogin`) foram tratados como achados de portão, registrados como `SPEC_DEVIATION` e resolvidos em tasks próprias (T6b/T7b/T11b), não silenciosamente absorvidos em outra task |
| Matches patterns | ✅ — `TransferUserAccountService` reusa `PrismaService.runInTx` (padrão de `ProvisionTenantService`), `platformLogin`/`login` seguem o mesmo `findUnique`+401 genérico |
| Spec-anchored outcome check (asserted values match spec) | ⚠️ — ver AC2 ("E-mail único") e AC5 ("Transferência") acima; demais critérios com correspondência exata |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ para `AuthService`/`TransferUserAccountService`/`PlatformController`; ❌ para a camada de exibição do AC5 (não existe) |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — nenhum teste especulativo encontrado nos arquivos revisados |
| Documented guidelines followed | `apps/api/AGENTS.md` não existe (confirmado em `tasks.md`); convenção inferida de `jest.config.js` e specs vizinhos — seguida |

---

## Edge Cases

- [x] Senha errada / e-mail inexistente / conta inativa / tenant inativo → mesmo 401 genérico: `auth.service.spec.ts` (ver tabela AC acima)
- [x] `NULL`/string vazia em `email` na migration: fora do escopo de teste automatizado (documentação em `docs/PENDENCIAS.md`, mesma limitação do AC2 acima)
- [x] Transferir para o mesmo tenant → 400: `transfer-user-account.service.spec.ts:213-227`
- [x] Sessão de suporte ativa durante a transferência: sem tratamento especial, por design (confirmado na spec) — nada a testar

---

## Gate Check

- **Gate command**: `npm run lint && npm run build:api && npm run test -w orbien-backend` (build) + `npm run test:integration -w orbien-backend && npm run test:rls -w orbien-backend` (full) + `npm run test -w orbien-web && npm run test -w orbien-admin`
- **Result**:
  - `npm run lint`: 5/5 apps ok (só warnings pré-existentes em `orbien-mobile`, 0 erros)
  - `npm run build:api`: ok
  - `npm run test -w orbien-backend` (unit): **240 suites passed, 2255 tests passed**
  - `npm run test:integration -w orbien-backend`: **10 suites passed, 53 tests passed**
  - `npm run test:rls -w orbien-backend`: **3 suites passed, 85 tests passed**
  - `npm run test -w orbien-web`: **95 files passed, 1071 tests passed**
  - `npm run test -w orbien-admin`: **22 files passed, 186 tests passed**
- **Test count before feature**: unit 239 suites (registrado em T4 SPEC_DEVIATION, antes de T6/T6b); web 95 arquivos/1071 testes (contagem líquida igual, confirmado em T12); mobile 252 testes (não coberto pelo gate desta verificação, ver nota)
- **Test count after feature**: unit 240 suites/2255 testes; web 95/1071; admin 22/186
- **Delta**: +1 suite/backend (novo `transfer-user-account.service.spec.ts` + specs ajustados); web/admin líquido igual (testes obsoletos trocados por equivalentes, sem perda de cobertura)
- **Skipped tests**: nenhum
- **Failures**: nenhuma

**Nota de escopo**: `npm run test -w orbien-mobile` não estava na lista de comandos desta verificação e não foi executado por este Verifier; `tasks.md` (T13) registra 252/252 testes com 3 suítes pré-existentes e não relacionadas já falhando antes desta feature (`animated-splash.test.tsx`, `_layout.test.tsx`, `navigation-boot.test.tsx`) — não confirmado de forma independente aqui.

---

## Fix Plans (if issues found)

### Fix 1: AC2 de "E-mail único no banco" sem teste automatizado do cenário de falha

- **Root cause**: a garantia "a migration falha alto sobre duplicata" depende só do comportamento nativo do Postgres (`CREATE UNIQUE INDEX` sobre coluna com valor repetido); nenhuma task rodou isso contra dado fabricado — `T3` testou só a sintaxe da query de verificação contra um banco vazio.
- **Fix task**: escrever um teste de integração/script que aplica a migration `20260913123836_unique_email_global` contra um schema com duas `user_accounts` de e-mail igual em tenants diferentes e confirma que a aplicação da migration lança erro (ou, alternativamente, documentar explicitamente em `spec.md`/`tasks.md` que este AC é coberto por garantia estrutural do Postgres, sem teste, como decisão consciente do usuário).
- **Priority**: Minor — o mecanismo é confiável (unique index nativo), mas a spec pede o teste explicitamente ("Independent Test") e ele não foi feito.

### Fix 2: AC5 de "Transferência de pessoa entre tenants" sem tela/endpoint de exibição

- **Root cause**: nenhuma task do plano constrói o "consumidor" do `actor_name_snapshot` — ele é gravado e resolvido na escrita, mas não há endpoint/tela que leia `audit_logs` de um tenant comum (o único listador existente, `ListAuditLogsService`, é escopado a `support_access` da plataforma, não ao histórico geral de um tenant, e nem seleciona o campo).
- **Fix task**: confirmar com o usuário se existe hoje uma tela de auditoria para `tenant_admin` fora deste diff (pode já existir em outra feature não coberta por este escopo) — se não existir, este AC está descrevendo uma capability futura ainda não construída, e a spec deveria refletir isso (mover para Out of Scope ou abrir task nova), ou a task foi perdida no planejamento.
- **Priority**: Major — é um AC P2 explícito ("a tela SHALL mostrar"), não uma nota lateral; sem ele o comportamento descrito na spec não existe hoje no produto.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| AUTH-01/02/03 | Implementing | ✅ Verified |
| AUTH-04 | Implementing | ✅ Verified |
| AUTH-05 | Implementing | ❌ Needs Fix (sem teste do cenário de falha) |
| AUTH-06 | Implementing | ⚠️ Verified com spec-precision gap (mensagem de erro desatualizada, comportamento correto) |
| AUTH-07/08/09/10 | Implementing | ✅ Verified |
| AUTH-11 | Implementing | ❌ Needs Fix (sem tela/endpoint de exibição do `actor_name_snapshot`) |
| AUTH-12 | Implementing | ✅ Verified |
| AUTH-13/14 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues

**Spec-anchored check**: 12/14 ACs (por história, ver tabela) confirmados com evidência exata; 1 spec-precision gap (mensagem de erro de e-mail duplicado); 2 gaps reais (AC2 da história "e-mail único" sem teste do cenário de falha da migration; AC5 da história de transferência sem implementação/evidência de tela)
**Sensor**: 3/3 mutações mortas
**Gate**: lint 5/5, build ok, unit 240/240 (2255 testes), integration 10/10 (53), rls 3/3 (85), web 95/95 (1071), admin 22/22 (186) — 0 falhas

**What works**: login sem `tenant_slug` (web/mobile) resolvendo por e-mail único com o mesmo 401 genérico; e-mail globalmente único no schema/banco; transferência de conta entre tenants movendo conta+pessoa, revogando sessão e papéis, gravando auditoria com snapshot; RLS confirmando isolamento pós-transferência e preservação de histórico; telas de login sem campo de igreja.

**Issues found**:
1. AC2 ("e-mail único") — nenhum teste executa a migration contra dado duplicado fabricado, só a query de checagem manual foi validada sintaticamente. Ver Fix 1.
2. AC5 ("transferência") — o dado (`actor_name_snapshot`) existe e é gravado corretamente, mas não há tela/endpoint no diff que o exiba para o tenant de origem; o AC descreve um comportamento de UI que não tem implementação rastreável. Ver Fix 2.
3. (Cosmético, não bloqueante) Mensagem de erro em `users.service.ts:98` ("e-mail já existe **neste tenant**") ficou desatualizada pela unicidade global — arquivo pré-existente, fora do diff desta feature, funciona por acidente do catch genérico de `P2002`.

**Next steps**: decisão do usuário sobre os dois gaps — (1) aceitar a garantia estrutural do Postgres para AC2 sem teste dedicado, ou abrir uma fix task; (2) esclarecer se existe/deveria existir uma tela de auditoria tenant-scoped que consome `actor_name_snapshot`, ou se isso é uma capability futura fora deste recorte (e a spec deve ser ajustada).
