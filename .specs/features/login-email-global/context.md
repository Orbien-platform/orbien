# Login por e-mail único (global) Context

**Gathered:** 2026-09-13
**Spec:** `.specs/features/login-email-global/spec.md`
**Status:** Ready for design

---

## Feature Boundary

`POST /auth/login` passa a aceitar e-mail+senha sem `tenant_slug`, resolvendo
a conta por e-mail globalmente único. Isso exige apertar
`user_accounts.email` para `@@unique([email])` e criar uma operação de
transferência de pessoa entre tenants, restrita a `platform_support`, para
que "mudar de igreja" continue possível sem violar a unicidade nem perder
histórico.

---

## Implementation Decisions

### Invariante de tenant por pessoa

- Uma pessoa pertence a um único tenant por vez. Mudar de congregação dentro
  do mesmo tenant é normal e já suportado; mudar de tenant é uma
  transferência (evento raro, administrativo), não uma segunda conta
  simultânea.
- Dados transacionais com `tenant_id` próprio gravado no momento da criação
  (`financial_transactions`, `attendance_records`, etc.) já preservam o
  histórico do período antigo independente de qualquer mudança posterior na
  conta — confirmado lendo o schema, não é algo que a feature precisa
  construir.

### Alcance da mudança de schema

- E-mail único de verdade no schema (`@@unique([email])`), não só uma busca
  cross-tenant em runtime — decisão explícita do usuário, mais estrutural
  que a alternativa mínima (deixar `@@unique([tenant_id, email])` e replicar
  a lógica de busca ambígua do `platformLogin`).

### Rate limit

- Chave por e-mail (sem tenant) é suficiente — mesmo padrão que
  `platformLogin` já usa.

### Mecanismo da transferência de tenant

- Atualiza a mesma linha (`user_accounts.tenant_id`/`congregation_id` no
  lugar) em vez de encerrar a conta antiga e criar uma nova. Implica que o
  tenant de origem perde visibilidade de listagens ao vivo da conta/pessoa
  (RLS filtra pelo tenant atual), mas mantém os registros históricos que já
  gravaram `tenant_id` próprio na época.
- `Person` da pessoa move junto com a conta (mesmo `person_id`) — não cria
  ficha cadastral duplicada por tenant.
- `role_assignments` no tenant de origem são revogados na transferência
  (exceto `platform_support`, que é global); o tenant novo atribui papel de
  novo.
- Sessões/refresh tokens ativos da conta são revogados na transferência,
  mesmo mecanismo já usado para conta/tenant inativado.

### Quem dispara a transferência

- Só `platform_support`, pelo console de plataforma (`apps/admin`) — mesmo
  princípio de `@PlatformRoute()` + `@Roles('platform_support')` +
  `AuditInterceptor` já usado para outras ações acima de tenant. Não é
  autoatendimento do `tenant_admin`.

### Agent's Discretion

- Formato exato da rota (`PATCH /platform/user-accounts/:id/transfer` ou
  similar), payload e onde a UI de transferência mora dentro do
  `apps/admin` — Design decide, seguindo o padrão de `EditTenantModal`/rotas
  de tenant já existentes.
- Se o code `TENANT_NOT_FOUND` deve deixar de existir na resposta de erro do
  `login` normal, já que ele nunca mudava a mensagem mostrada — decisão de
  limpeza, sem impacto funcional; Design resolve.

### Declined / Undiscussed Gray Areas → Assumptions

- Atribuição de autor em `audit_logs` depois que a conta que gravou o log é
  transferida de tenant: não foi perguntado diretamente, mas é consequência
  técnica direta de "atualiza no lugar" — resolvido como assumption no
  spec.md (`actor_name_snapshot`), a confirmar no Design.

---

## Specific References

Nenhuma referência visual/de produto externa — o desenho segue o padrão já
existente no próprio código (`platformLogin` para busca sem slug,
`EditTenantModal`/rotas de `@PlatformRoute()` para a UI e a autoridade da
transferência, `AuthService.refresh` para revogação de família de tokens).

---

## Deferred Ideas

- Autoatendimento de transferência pelo `tenant_admin` (sem passar por
  `platform_support`) — descartado explicitamente para esta feature; anotar
  em `docs/PLANO.md` como `PROD-`/`PEND-` se a demanda aparecer depois.
