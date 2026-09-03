-- =============================================================================
-- 004_rls_platform_plane.sql — o plano de plataforma passa a existir no RLS
--
-- Roda DEPOIS de 001, 002 e 003, e depois do passo que remove as policies
-- redundantes de tenant. Fora do histórico do Prisma, como os três anteriores.
--
-- O QUE MUDA
--
-- Até aqui toda policy dizia a mesma coisa: `tenant_id = app_current_tenant()`.
-- Com `app_current_tenant()` nulo — que é a situação de qualquer rota de
-- plataforma, cujo JWT não carrega tenant — a comparação é NULL, a policy nega
-- e a API devolve lista vazia sem erro. Não existia caminho para o suporte da
-- plataforma ler os N tenants.
--
-- Este script abre exatamente um caminho: `app_platform_access()`, que só é
-- verdadeiro quando NÃO há tenant no contexto E o usuário corrente tem
-- `platform_support`. As duas condições juntas, sempre.
--
-- POR QUE NÃO UM ROLE SEPARADO
--
-- A alternativa seria um `orbien_platform` com policies próprias (ou, pior,
-- BYPASSRLS). É mais fácil de escrever e mais fácil de vazar: a partir do
-- momento em que existe um segundo role de aplicação, o erro de conectar com
-- o role errado deixa de ser detectável por RLS. `orbien_app` continua sendo o
-- único role da aplicação, e nenhum caminho de requisição tem BYPASSRLS.
--
-- O PAPEL VEM DO BANCO, NÃO DO JWT
--
-- `app_is_platform_support()` lê `role_assignments`, não `app.role_codes`. O
-- interceptor escreve `app.role_codes` a partir do token, e o token é
-- assinado — mas o predicado que abre TODOS os tenants é o último lugar do
-- sistema onde vale a pena depender de um valor que veio de fora do banco.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Predicado de acesso da plataforma
-- ---------------------------------------------------------------------------

-- Diferente de `app_has_role()`, esta função NÃO filtra por tenant: o papel de
-- plataforma é global por definição, e é justamente no contexto sem tenant que
-- ela precisa responder. SECURITY DEFINER porque `role_assignments` tem RLS.
--
-- Não recursiona: a policy de `role_assignments` também chama este predicado,
-- mas o corpo roda como o dono da função (`postgres`), e `role_assignments`
-- não tem FORCE ROW LEVEL SECURITY — o dono não passa pelas policies.
CREATE OR REPLACE FUNCTION app_is_platform_support()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM role_assignments ra
    WHERE ra.user_account_id = app_current_user()
      AND ra.role_code       = 'platform_support'
  );
$$;

COMMENT ON FUNCTION app_is_platform_support() IS
  'Verdadeiro se o usuário em app.user_id tem platform_support em qualquer '
  'tenant. Resolve pelo banco (role_assignments), não por app.role_codes.';

-- O `IS NULL` não é detalhe: é ele que garante que uma sessão de suporte com
-- tenant fixado (o token de POST /auth/impersonate) continue vendo um tenant
-- só. Suporte só enxerga a plataforma inteira quando escolheu não estar dentro
-- de nenhuma igreja.
CREATE OR REPLACE FUNCTION app_platform_access()
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT app_current_tenant() IS NULL AND app_is_platform_support();
$$;

COMMENT ON FUNCTION app_platform_access() IS
  'Predicado único do plano de plataforma, usado no USING e no WITH CHECK das '
  'policies de tenants, tenant_plans, branding_configs, congregations e '
  'waitlist_subscribers. Divergir entre os dois lados faz o suporte ler e '
  'falhar ao gravar com 42501 — foi o defeito que 003 corrigiu no plano do '
  'tenant, e não vamos repeti-lo aqui.';

-- ---------------------------------------------------------------------------
-- 2. Tabelas de plataforma — a policy passa a ter dois ramos
--
-- `tenants` compara por `id`; as demais por `tenant_id`. Fora isso o formato é
-- o mesmo, e USING e WITH CHECK dizem a mesma coisa.
-- ---------------------------------------------------------------------------

ALTER POLICY tenant_isolation ON tenants
  USING      (id = app_current_tenant() OR app_platform_access())
  WITH CHECK (id = app_current_tenant() OR app_platform_access());

ALTER POLICY tenant_isolation ON tenant_plans
  USING      (tenant_id = app_current_tenant() OR app_platform_access())
  WITH CHECK (tenant_id = app_current_tenant() OR app_platform_access());

ALTER POLICY tenant_isolation ON branding_configs
  USING      (tenant_id = app_current_tenant() OR app_platform_access())
  WITH CHECK (tenant_id = app_current_tenant() OR app_platform_access());

ALTER POLICY tenant_isolation ON congregations
  USING      (tenant_id = app_current_tenant() OR app_platform_access())
  WITH CHECK (tenant_id = app_current_tenant() OR app_platform_access());

-- `user_accounts` e `role_assignments` também precisam do ramo de plataforma:
-- é o ProvisionTenantService que cria a conta admin inicial do tenant novo,
-- numa transação sem tenant no contexto. Sem isto o provisionamento falha com
-- 42501 no meio, depois de já ter criado tenant, plano e branding.
ALTER POLICY tenant_isolation ON user_accounts
  USING      (tenant_id = app_current_tenant() OR app_platform_access())
  WITH CHECK (tenant_id = app_current_tenant() OR app_platform_access());

ALTER POLICY tenant_isolation ON role_assignments
  USING      (tenant_id = app_current_tenant() OR app_platform_access())
  WITH CHECK (tenant_id = app_current_tenant() OR app_platform_access());

-- ---------------------------------------------------------------------------
-- 3. waitlist_subscribers — nunca teve RLS
--
-- A tabela é da plataforma (`tenant_id` é nulo até a ativação) e ficou de fora
-- de 001 inteiro: sem ENABLE, sem policy. Hoje qualquer conexão lê a lista
-- inteira de leads.
--
-- São dois caminhos legítimos, e eles são bem diferentes:
--
--   a) cadastro público do site — sem JWT, sem contexto nenhum, rodando como
--      `orbien_app`. Só INSERT.
--   b) admin da waitlist — `platform_support` sem tenant, rodando como
--      `app_user` (o TenantContextInterceptor faz SET LOCAL ROLE).
--
-- O SELECT liberado em (a) incomoda e é proposital: `prisma.create()` emite
-- INSERT ... RETURNING, e o RETURNING é avaliado pela policy de SELECT. O que
-- o limita é o `app_current_user() IS NULL`: qualquer requisição autenticada
-- passou pelo interceptor, virou `app_user` e não alcança estas duas policies.
-- Se um dia uma rota pública precisar LER waitlist, este é o ponto a revisar.
-- ---------------------------------------------------------------------------

ALTER TABLE waitlist_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_access ON waitlist_subscribers;
CREATE POLICY platform_access ON waitlist_subscribers
  AS PERMISSIVE FOR ALL TO app_user
  USING      (app_platform_access())
  WITH CHECK (app_platform_access());

DROP POLICY IF EXISTS public_signup ON waitlist_subscribers;
CREATE POLICY public_signup ON waitlist_subscribers
  AS PERMISSIVE FOR INSERT TO orbien_app
  WITH CHECK (app_current_user() IS NULL);

DROP POLICY IF EXISTS public_signup_returning ON waitlist_subscribers;
CREATE POLICY public_signup_returning ON waitlist_subscribers
  AS PERMISSIVE FOR SELECT TO orbien_app
  USING (app_current_user() IS NULL);

-- ---------------------------------------------------------------------------
-- 4. Verificação
--
-- Falha alto se o script rodou fora de ordem ou se alguma policy ficou
-- assimétrica. Mesmo espírito do passo 6 do bootstrap-db.sh.
-- ---------------------------------------------------------------------------

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE policyname = 'tenant_isolation'
     AND tablename IN ('tenants', 'tenant_plans', 'branding_configs',
                       'congregations', 'user_accounts', 'role_assignments')
     AND qual LIKE '%app_platform_access%'
     AND with_check IS NOT DISTINCT FROM qual;

  RAISE NOTICE '004_rls_platform_plane: % policies com o ramo de plataforma', n;

  IF n <> 6 THEN
    RAISE EXCEPTION '004_rls_platform_plane: esperava 6 policies de plataforma simétricas, encontrei %', n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
     WHERE c.relname = 'waitlist_subscribers' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION '004_rls_platform_plane: waitlist_subscribers ficou sem RLS';
  END IF;
END $$;
