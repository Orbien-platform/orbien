# Login por e-mail único (global) — Specification

## Problem Statement

Hoje `POST /auth/login` (usado por `apps/web` e `apps/mobile`) exige `tenant_slug`
porque `user_accounts` é única por `(tenant_id, email)` — sem o slug não há
como encontrar a conta. Isso obriga o usuário a saber/lembrar o identificador
da própria igreja pra logar, o que não faz sentido do ponto de vista dele (ele
não pensa em "tenant", pensa em "minha conta"). `POST /auth/platform/login`
já resolve esse problema para o console de plataforma buscando por e-mail sem
slug, restrito a quem tem `platform_support`; queremos o mesmo princípio para
o login comum, mas isso exige e-mail **globalmente único** no banco — hoje uma
pessoa só pertence a um tenant por vez (mudança de igreja é uma transferência,
não uma segunda conta simultânea), então a constraint pode apertar sem
quebrar esse invariante.

## Goals

- [ ] `POST /auth/login` (web e mobile) aceita `email` + `password`, sem
      `tenant_slug`, e resolve a conta e o tenant sozinho.
- [ ] `user_accounts.email` passa a ser único em todo o banco
      (`@@unique([email])`), substituindo `@@unique([tenant_id, email])`.
- [ ] Existe uma operação de transferência de pessoa entre tenants
      (mudança de igreja), restrita a `platform_support` no console de
      plataforma, que atualiza a conta existente em vez de duplicá-la —
      condição necessária para o e-mail único não colidir com o caso real de
      alguém que muda de tenant.
- [ ] Histórico gravado antes da transferência (registros com `tenant_id`
      próprio: financeiro, presença, auditoria) continua visível para o
      tenant de origem depois da transferência.

## Out of Scope

| Feature | Reason |
| --- | --- |
| `POST /auth/platform/login` | Já resolve por busca sem slug; não muda nesta feature. |
| Autoatendimento de transferência pelo `tenant_admin` | Definido como ação exclusiva de `platform_support` (decisão do usuário) — abrir para tenant_admin é feature separada, se algum dia for necessário. |
| Múltiplas contas simultâneas para a mesma pessoa em tenants diferentes | Invariante do produto (confirmado pelo usuário): uma pessoa está em um tenant por vez. Não desenhamos suporte a isso. |
| Mudar `Person.tenant_id` de forma independente da conta, ou histórico de mudanças de nome/dados cadastrais | Fora do recorte — a transferência move a conta e a pessoa juntas (ver PERS-06); não há necessidade de granularidade adicional aqui. |
| Migração de dados de outras entidades tenant-scoped que hoje já denormalizam `tenant_id` na criação (`FinancialTransaction`, `AttendanceRecord`, `AuditLog`, etc.) | Já preservam isolamento por período sem mudança — confirmado por leitura do schema. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Duplicidade de e-mail hoje em produção | Tratada como anomalia a resolver manualmente antes da migration (ver AUTH-08); a migration falha alto se encontrar duplicata, nunca escolhe uma em silêncio | Usuário confirmou que o caso "normal" é uma pessoa por tenant; qualquer duplicata real é dado a corrigir, não comportamento a suportar | y |
| Chave do rate limit de login | Passa a ser só `email` (sem tenant) | Escolha explícita do usuário; mesmo padrão já usado em `platformLogin` | y |
| Atribuição de auditoria após transferência | `AuditLog` ganha `actor_name_snapshot` (nome da pessoa congelado no momento do registro), porque depois da transferência o RLS de `user_accounts`/`persons` do tenant de origem não resolve mais o autor atual pelo FK — sem o snapshot, o tenant de origem veria "autor desconhecido" em auditorias antigas | Decisão técnica derivada da escolha "atualiza tenant_id no lugar" — não foi perguntada explicitamente ao usuário, mas é consequência direta dela | n |
| `Person` da pessoa transferida | Move junto com a conta (mesmo `person_id`, `tenant_id`/`congregation_id` atualizados) — não cria um `Person` novo por tenant | Consistente com "atualiza no lugar" escolhido para `user_accounts`; evita duas fichas cadastrais para a mesma pessoa | n |
| `RoleAssignment` da pessoa transferida | É zerado (revogado) na transferência — a pessoa chega ao tenant novo sem papel, e alguém do tenant novo atribui de novo | Papéis são específicos de congregação/tenant (exceto `platform_support`, que é global e não se perde); herdar papéis do tenant antigo automaticamente seria conceder acesso não avaliado por quem administra o tenant novo | n |
| Sessões ativas no tenant antigo no momento da transferência | Refresh tokens da conta são revogados (mesma família toda, como já acontece hoje para conta/tenant inativado) — a pessoa precisa logar de novo depois da transferência | Reaproveita o mecanismo que `AuthService.refresh` já tem para "família cai junto"; evita token com `tenant_id` antigo sobrevivendo à mudança | n |

**Open questions:** nenhuma sem resposta registrada — os quatro itens sem
confirmação explícita (`n`) são decisões técnicas derivadas das escolhas já
feitas pelo usuário; ficam para validação no Design, não bloqueiam o Specify.

---

## User Stories

### P1: Login sem informar a igreja ⭐ MVP

**User Story**: Como usuário do `apps/web` ou `apps/mobile`, quero logar só
com e-mail e senha, sem escolher/digitar minha igreja, porque eu não penso em
"tenant" — eu só quero entrar.

**Why P1**: É o pedido original; sem isso a feature não existe.

**Acceptance Criteria**:

1. WHEN o usuário envia `POST /auth/login` com `email` e `password` válidos
   (sem `tenant_slug`) THEN a API SHALL localizar a conta única por e-mail,
   validar a senha e devolver `access_token`/`refresh_token` com o
   `tenant_id` da conta, exatamente como o fluxo atual devolve hoje.
2. WHEN a senha está errada, ou o e-mail não existe, ou a conta está inativa,
   ou o tenant da conta está inativo THEN a API SHALL devolver o mesmo 401
   genérico (`INVALID_CREDENTIALS`) usado hoje — sem distinguir os casos na
   mensagem, mesmo princípio já aplicado em `login` e `platformLogin`.
3. WHEN a request chega sem `tenant_slug` no corpo THEN a API SHALL aceitar
   (campo removido do DTO) — clientes antigos que ainda enviarem o campo
   SHALL ter o campo ignorado, não rejeitado (compatibilidade durante o
   rollout dos apps).

**Independent Test**: chamar `POST /auth/login` com `{ email, password }` de
uma conta existente e confirmar que o token retornado carrega o `tenant_id`
correto — sem passar `tenant_slug`.

---

### P1: E-mail único no banco ⭐ MVP

**User Story**: Como sistema, preciso garantir que nunca existam duas contas
com o mesmo e-mail, para que a busca do AC anterior seja sempre determinística
(zero ou uma conta, nunca "qual das duas").

**Why P1**: Pré-condição para a história anterior funcionar sem ambiguidade —
é o que `platformLogin` tem que tratar como erro (`PLATFORM_ACCOUNT_AMBIGUOUS`)
por não ter essa garantia; aqui a garantia vem do schema, não de uma checagem
em runtime.

**Acceptance Criteria**:

1. WHEN a migration é aplicada THEN o banco SHALL ter `@@unique([email])` em
   `user_accounts`, substituindo `@@unique([tenant_id, email])`.
2. WHEN a migration encontra e-mails duplicados entre tenants já existentes
   THEN ela SHALL falhar alto (não aplicar a constraint, listar as duplicatas
   encontradas) — nunca escolher uma conta em silêncio e desativar/renomear a
   outra.
3. WHEN um `INSERT`/`UPDATE` em `user_accounts` tentaria gravar um e-mail já
   usado por outra conta THEN o banco SHALL rejeitar com violação de
   unicidade, e a camada de serviço (criação de conta, edição de e-mail em
   qualquer app) SHALL traduzir isso numa mensagem de erro específica
   ("e-mail já em uso"), não um 500.

**Independent Test**: tentar criar duas contas com o mesmo e-mail em tenants
diferentes e confirmar rejeição; rodar a migration contra uma base com
duplicata fabricada e confirmar que ela falha em vez de aplicar.

---

### P2: Transferência de pessoa entre tenants

**User Story**: Como `platform_support`, quero mover uma pessoa de um tenant
para outro (ela mudou de igreja-cliente) mantendo a mesma conta e o mesmo
histórico de login, e preservando a visibilidade dos dados do período antigo
para quem administra o tenant de origem.

**Why P2**: Não é o pedido original, mas é pré-condição de correção para o
e-mail único não travar o caso real de mudança de igreja — sem essa operação,
uma pessoa que muda de tenant ficaria sem caminho (a conta não pode ser
recriada no tenant novo com o mesmo e-mail, e não pode ficar presa ao tenant
antigo).

**Acceptance Criteria**:

1. WHEN `platform_support` chama a rota de transferência com
   `user_account_id` + `tenant_id` de destino (+ `congregation_id` de
   destino) THEN a API SHALL atualizar `user_accounts.tenant_id` e
   `congregation_id` e `persons.tenant_id`/`congregation_id` da mesma pessoa,
   na mesma linha (sem criar conta nova).
2. WHEN a transferência ocorre THEN a API SHALL revogar todos os
   `refresh_tokens` ativos da conta (mesma família), exigindo novo login.
3. WHEN a transferência ocorre THEN a API SHALL remover os
   `role_assignments` da pessoa no tenant de origem (papéis não migram
   automaticamente para o tenant novo) — exceto `platform_support`, que é
   global e nunca é afetado por esta operação.
4. WHEN a transferência ocorre THEN a API SHALL gravar `audit_logs` com
   `entity = 'user_account'`, `action = 'tenant_transfer'`, `before`/`after`
   contendo tenant/congregação de origem e destino, no tenant de origem
   (mesma convenção do `AuditInterceptor` para ações de plataforma).
5. WHEN a transferência ocorre THEN `audit_logs.actor_name_snapshot` SHALL
   gravar o nome do autor no momento do registro, resolvido pelo
   `AuditInterceptor` (não por busca ao vivo em `user_accounts`/`persons`,
   que já não resolve mais o autor depois da transferência — RLS do tenant
   de origem não alcança o novo tenant da conta). **Não existe hoje** uma
   tela de audit log escopada a tenant que leia essa coluna — a única
   listagem de auditoria do produto (`ListAuditLogsService`) é do console
   de plataforma, escopada a `support_access`. Este AC garante que o dado
   está correto e disponível para quando essa tela existir; construir a
   tela é capability nova, registrada como `PROD-21` em `docs/PLANO.md`,
   fora do escopo desta feature (achado do Verifier, corrigido em
   `validation.md`).
6. WHEN alguém do tenant de origem consulta registros históricos com
   `tenant_id` próprio já gravado (`financial_transactions`,
   `attendance_records`, etc.) referentes ao período anterior à
   transferência THEN esses registros SHALL continuar visíveis e
   inalterados — nenhuma dessas tabelas depende do `tenant_id` atual da
   conta/pessoa.

**Independent Test**: transferir uma conta de teste do tenant A para o tenant
B; confirmar que a conta migrada loga só no tenant B, que o tenant A não a vê
mais em listagens de pessoas/contas, que os registros financeiros antigos do
tenant A continuam lá com o nome do autor correto, e que a sessão antiga foi
derrubada.

---

### P3: Front-ends param de pedir/mostrar o seletor de igreja no login

**User Story**: Como usuário do `apps/web` e `apps/mobile`, não quero ver
nenhum campo de "igreja"/slug na tela de login.

**Why P3**: Consequência direta de P1, mas é trabalho de UI separado o
suficiente para rastrear como item próprio (2 telas, 2 apps).

**Acceptance Criteria**:

1. WHEN a tela de login do `apps/web` renderiza THEN ela SHALL mostrar apenas
   e-mail e senha.
2. WHEN a tela de login do `apps/mobile` renderiza THEN ela SHALL mostrar
   apenas e-mail e senha.

**Independent Test**: abrir as duas telas e confirmar ausência do campo.

---

## Edge Cases

- WHEN a busca por e-mail em `login` encontra uma conta cujo tenant está
  inativo THEN a API SHALL devolver o mesmo 401 genérico (não "tenant não
  encontrado" — mensagem já é essa hoje via `TENANT_NOT_FOUND`, mas o cliente
  não deve conseguir diferenciar; revisar se o code `TENANT_NOT_FOUND` deve
  desaparecer da resposta, já que ele já era só informativo e nunca mudava o
  texto mostrado ao usuário final).
- WHEN a migration de unicidade global encontra `NULL` ou string vazia em
  `email` (não deveria existir, mas o schema permite tecnicamente) THEN ela
  SHALL tratar como caso a listar/corrigir manualmente, nunca aplicar a
  constraint por cima.
- WHEN `platform_support` tenta transferir uma conta para o mesmo tenant em
  que ela já está THEN a API SHALL rejeitar como no-op inválido (400), não
  silenciosamente "funcionar" gravando um audit log vazio.
- WHEN a conta a transferir tem uma sessão de suporte ativa apontando pra ela
  (impersonation) no momento da transferência THEN isso é irrelevante — sessão
  de suporte não tem refresh e expira em 5 minutos por natureza; não precisa
  tratamento especial.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| AUTH-01 | P1: Login sem informar a igreja | Design | Pending |
| AUTH-02 | P1: Login sem informar a igreja | Design | Pending |
| AUTH-03 | P1: Login sem informar a igreja | Design | Pending |
| AUTH-04 | P1: E-mail único no banco | Design | Pending |
| AUTH-05 | P1: E-mail único no banco | Design | Pending |
| AUTH-06 | P1: E-mail único no banco | Design | Pending |
| AUTH-07 | P2: Transferência entre tenants | Design | Pending |
| AUTH-08 | P2: Transferência entre tenants | Design | Pending |
| AUTH-09 | P2: Transferência entre tenants | Design | Pending |
| AUTH-10 | P2: Transferência entre tenants | Design | Pending |
| AUTH-11 | P2: Transferência entre tenants | Design | Pending |
| AUTH-12 | P2: Transferência entre tenants | Design | Pending |
| AUTH-13 | P3: Front-ends sem seletor de igreja | Design | Pending |
| AUTH-14 | P3: Front-ends sem seletor de igreja | Design | Pending |

**ID format:** `AUTH-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 14 total, 0 mapped to tasks, 14 unmapped ⚠️ (aguardando Design/Tasks)

---

## Success Criteria

- [ ] `apps/web` e `apps/mobile` logam com e-mail+senha, sem `tenant_slug`, em
      staging e produção.
- [ ] `user_accounts.email` é `@@unique` no schema e no banco, sem duplicata
      residual.
- [ ] Existe rota de transferência funcional, exclusiva de `platform_support`,
      testada com o cenário de auditoria/histórico do AC5/AC6 da história P2.
- [ ] Zero regressão nos testes existentes de `auth.service.spec.ts`,
      `auth.controller.spec.ts`, `jwt.strategy.spec.ts`.
