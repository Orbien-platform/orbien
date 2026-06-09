-- =============================================================================
-- ORBIEN — fix_orbien_app_auth_policies
--
-- PROBLEMA: orbien_app (NOBYPASSRLS) herda app_user e fica sujeito às
-- políticas RLS durante o login — quando ainda não há SET LOCAL.
-- Resultado: queries em tenants/user_accounts/congregations retornam vazio
-- durante autenticação → login falha com 401.
--
-- SOLUÇÃO: adicionar política PERMISSIVE FOR orbien_app com USING(true) nas
-- tabelas de auth. Como políticas PERMISSIVE se combinam com OR, o resultado
-- final para orbien_app é: (tenant_id = context OR true) = true.
-- Ou seja: orbien_app vê TUDO nessas tabelas (necessário para auth).
--
-- TRADE-OFF: a isolação de auth tables fica no nível de aplicação (JWT),
-- não no nível de DB. As data tables continuam com RLS completo.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'orbien_app') THEN
    CREATE ROLE orbien_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

-- Permite que orbien_app leia todas as tabelas de auth sem contexto de tenant
-- (necessário para login, JWT validation, e bootstrap público)

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

DROP POLICY IF EXISTS orbien_app_auth ON user_accounts;
CREATE POLICY orbien_app_auth ON user_accounts
  AS PERMISSIVE FOR ALL TO orbien_app
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS orbien_app_auth ON role_assignments;
CREATE POLICY orbien_app_auth ON role_assignments
  AS PERMISSIVE FOR ALL TO orbien_app
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS orbien_app_auth ON refresh_tokens;
CREATE POLICY orbien_app_auth ON refresh_tokens
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

-- audit_logs: orbien_app pode inserir sem contexto (fire-and-forget)
DROP POLICY IF EXISTS orbien_app_auth ON audit_logs;
CREATE POLICY orbien_app_auth ON audit_logs
  AS PERMISSIVE FOR ALL TO orbien_app
  USING (true)
  WITH CHECK (true);
