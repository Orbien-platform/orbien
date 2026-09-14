-- =============================================================================
-- 014_rls_small_group_visit_requests.sql — RLS dos pedidos de visita (PROD-13)
--
-- Tabela nova (20260914182840_add_small_group_visit_requests): a migration do
-- Prisma cria a tabela, RLS é sempre daqui — 001 nunca a viu, e tabela nova
-- nasce SEM row level security no Postgres.
--
-- Roda DEPOIS de 003_rls_admin_write.sql, que define
-- `app_congregation_allowed()`. Mesmo padrão de 007/008/010/012: já nasce com o
-- predicado certo (AD-001, .specs/STATE.md) nos DOIS lados, USING e WITH
-- CHECK, dizendo a mesma coisa.
--
-- São DUAS policies porque os dois lados do fluxo são assimétricos:
--
--   `tenant_congregation_isolation` — o produto autenticado, como em qualquer
--     tabela de tenant, com um `app_current_user() IS NOT NULL` a mais. Esse
--     pedaço não restringe ninguém de dentro (toda requisição autenticada
--     passa pelo TenantContextInterceptor, que fixa `app.user_id`); ele existe
--     para que o plano público NÃO alcance esta policy, e portanto não leia,
--     não edite e não apague pedido nenhum.
--
--   `public_visit_request_insert` — só INSERT, só fora de sessão autenticada.
--     `PublicSmallGroupsService` lê a célula pelo ramo público de 012, tira
--     dela `tenant_id`/`congregation_id` e fixa os dois no contexto antes de
--     gravar: o pedido cai na congregação da célula, não numa escolhida por
--     quem preencheu o formulário.
--
-- Policies PERMISSIVE se combinam com OR, então dividir assim é a única forma
-- de o plano público poder escrever sem poder ler: um pedido de visita tem
-- nome e telefone de quem se interessou, e isso só sai daqui para dentro do
-- produto autenticado.
-- =============================================================================

ALTER TABLE small_group_visit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE small_group_visit_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON small_group_visit_requests;
CREATE POLICY tenant_congregation_isolation ON small_group_visit_requests
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    app_current_user() IS NOT NULL
    AND tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  )
  WITH CHECK (
    app_current_user() IS NOT NULL
    AND tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  );

DROP POLICY IF EXISTS public_visit_request_insert ON small_group_visit_requests;
CREATE POLICY public_visit_request_insert ON small_group_visit_requests
  AS PERMISSIVE FOR INSERT TO app_user
  WITH CHECK (
    app_current_user() IS NULL
    AND tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );
