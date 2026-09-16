-- =============================================================================
-- 017_rls_auth_tables.sql — aperta `orbien_app_auth` (PEND-04, ações A e B)
--
-- `20260608175621_fix_orbien_app_auth_policies` criou `orbien_app_auth ...
-- AS PERMISSIVE FOR ALL TO orbien_app USING (true) WITH CHECK (true)` em oito
-- tabelas. A policy existe porque o caminho pré-autenticação roda como
-- `orbien_app`, sem contexto: o `TenantContextInterceptor` sai cedo quando não
-- há `req.user`, e o `JwtStrategy` roda no ciclo de Guard, antes do
-- interceptor — os dois usam o client base, nunca a transação onde acontece o
-- `SET LOCAL ROLE app_user`.
--
-- O mapeamento de 2026-09-16 percorreu quem de fato depende dela. Duas coisas
-- ficaram claras, e são o que este script fecha:
--
--   A. `audit_logs` não tem consumidor nenhum. A escrita de auditoria vai por
--      `audit_insert()` (SECURITY DEFINER, ignora RLS) e o nome do ator por
--      `resolve_actor_name()`, também SECURITY DEFINER — ver
--      `src/common/interceptors/audit.interceptor.ts`. A leitura da tela de
--      auditoria roda como `app_user`, pela policy `tenant_read` de
--      `005_rls_audit_platform_read.sql`. Nada alcança `orbien_app_auth` aqui:
--      a policy sai inteira.
--
--   B. `user_accounts` e `role_assignments` só são LIDAS por esse caminho
--      (`auth.service.ts:110,190,361`, `jwt.strategy.ts:22`, e
--      `role_assignments` sempre por relação). Toda escrita nas duas roda em
--      outro lugar: `provision-tenant.service.ts` e
--      `transfer-user-account.service.ts` rodam como `app_user` dentro da
--      transação do interceptor (policies de 004/006/011), e o reset de senha
--      (`auth.service.ts:456`) usa `prisma.system`, que conecta como o dono e
--      passa por cima do RLS. O `WITH CHECK (true)` das duas é permissão sem
--      chamador — `FOR ALL` vira `FOR SELECT`.
--
-- O que este script deliberadamente NÃO faz:
--
--   * Não mexe em `refresh_tokens`. Ali a escrita por `orbien_app` é VIVA:
--     `auth.service.ts` cria e revoga token no refresh, no logout e no login
--     (`:254`, `:283`, `:293`, `:327`, `:478`), tudo pelo client base. Trocar
--     por `FOR SELECT` derruba login e refresh em produção.
--   * Não mexe em `tenants`, `congregations`, `branding_configs` e
--     `tenant_plans`. As quatro são lidas pelo mesmo caminho e também por rota
--     pública já existente — `public-small-groups.service.ts:163,168` resolve
--     a igreja pelo slug e lê o `app_name` do branding sem JWT nenhum.
--     Apertá-las é a ação C do PEND-04, e ela depende de trocar os `include:`
--     do `auth.service.ts` por `select:` explícito antes: `include` faz o
--     Prisma pedir TODAS as colunas escalares do model, então um GRANT por
--     coluna quebraria o login com 42501. Não cabe aqui.
--
-- Restringir por LINHA (e não só fechar a escrita) continua fora: exigiria
-- mover essas leituras para funções SECURITY DEFINER, que é mudança de
-- arquitetura. É a ação D, ainda em aberto no PLANO.
--
-- Ordem: roda no passo 5 do bootstrap-db.sh, depois de 004/005/006/011. Não
-- há dependência funcional entre eles — `orbien_app_auth` não é tocada por
-- nenhum outro script, e a checagem confirma isso no passo 7 —, mas estas são
-- as tabelas do plano de plataforma e o script é o último a falar delas.
--
-- Idempotente: DROP IF EXISTS antes de cada CREATE, como os demais — e, ao
-- declarar as oito tabelas, é também o caminho de REPARO da policy num banco
-- onde a migration datada já rodou. Ver o bloco abaixo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Este script declara a policy INTEIRA, nas oito tabelas — não só as três que
-- ele muda.
--
-- O motivo é de restauração, não de estilo. A policy nasceu numa migration
-- DATADA, que `prisma migrate deploy` aplica uma vez e nunca mais: num banco
-- já provisionado, `bootstrap-db.sh` não tem por onde recriá-la se ela for
-- derrubada. Enquanto 017 só falasse das três tabelas que aperta, rodar o
-- bootstrap num banco com `orbien_app_auth` faltando em `refresh_tokens`
-- passava direto pelo passo 5 e só falhava no portão do passo 7, sem conserto
-- possível a não ser SQL manual. Declarando as oito, o bootstrap volta a ser
-- o caminho de reparo — que é o que "idempotente" tem que significar aqui.
-- -----------------------------------------------------------------------------

-- As cinco que continuam FOR ALL. São os consumidores vivos: leitura no login
-- e nas rotas públicas, e — em `refresh_tokens` — escrita também.
DROP POLICY IF EXISTS orbien_app_auth ON tenants;
CREATE POLICY orbien_app_auth ON tenants
  AS PERMISSIVE FOR ALL TO orbien_app
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS orbien_app_auth ON congregations;
CREATE POLICY orbien_app_auth ON congregations
  AS PERMISSIVE FOR ALL TO orbien_app
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS orbien_app_auth ON branding_configs;
CREATE POLICY orbien_app_auth ON branding_configs
  AS PERMISSIVE FOR ALL TO orbien_app
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS orbien_app_auth ON tenant_plans;
CREATE POLICY orbien_app_auth ON tenant_plans
  AS PERMISSIVE FOR ALL TO orbien_app
  USING (true)
  WITH CHECK (true);

-- `refresh_tokens` é a única das oito onde a ESCRITA por `orbien_app` sem
-- contexto tem chamador: `auth.service.ts` cria e revoga token no login, no
-- refresh e no logout (`:254`, `:283`, `:293`, `:327`, `:478`), tudo pelo
-- client base. Apertar aqui derruba a autenticação inteira.
DROP POLICY IF EXISTS orbien_app_auth ON refresh_tokens;
CREATE POLICY orbien_app_auth ON refresh_tokens
  AS PERMISSIVE FOR ALL TO orbien_app
  USING (true)
  WITH CHECK (true);

-- A. audit_logs: policy sem consumidor, sai inteira.
--
-- Depois disto, `orbien_app` sem `SET LOCAL ROLE` não lê nem escreve
-- `audit_logs` por RLS. O INSERT da auditoria continua funcionando porque
-- `audit_insert()` é SECURITY DEFINER — se alguém trocar a função por um
-- `prisma.auditLog.create()` no client base, o INSERT passa a falhar em
-- silêncio (o `.catch()` do interceptor engole), e é por isso que a
-- verificação do passo 7 confere que a função segue SECURITY DEFINER.
DROP POLICY IF EXISTS orbien_app_auth ON audit_logs;

-- B. user_accounts e role_assignments: FOR ALL → FOR SELECT.
--
-- `USING` continua `true`: fechar por linha é a ação D. O que muda é que
-- `WITH CHECK` deixa de existir — em policy `FOR SELECT` não há cláusula de
-- escrita, então INSERT por `orbien_app` sem contexto passa a falhar com
-- 42501, e UPDATE/DELETE deixam de alcançar linha alguma (afetam 0 linhas,
-- sem erro — o modo silencioso, coberto por test/rls/auth-tables.spec.ts).
DROP POLICY IF EXISTS orbien_app_auth ON user_accounts;
CREATE POLICY orbien_app_auth ON user_accounts
  AS PERMISSIVE FOR SELECT TO orbien_app
  USING (true);

DROP POLICY IF EXISTS orbien_app_auth ON role_assignments;
CREATE POLICY orbien_app_auth ON role_assignments
  AS PERMISSIVE FOR SELECT TO orbien_app
  USING (true);
