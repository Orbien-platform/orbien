-- =============================================================================
-- 033_rls_auth_lookup.sql — leituras pré-autenticação por função SECURITY
-- DEFINER (PEND-04, ação D)
--
-- A API conecta como `orbien_app`. Login, refresh, impersonate, `JwtStrategy`
-- e o webhook público da Asaas rodam ANTES de haver contexto de tenant (ou sem
-- trocar para `app_user`), e por isso liam `user_accounts` e `role_assignments`
-- pela policy `orbien_app_auth ... FOR SELECT USING (true)` — que mostra as
-- linhas de TODOS os tenants, hash de senha incluído.
--
-- Estas três funções são o único caminho de leitura que sobra para essas duas
-- tabelas sem contexto. Cada uma responde por UM parâmetro exato (e-mail ou id)
-- e devolve no máximo uma linha; nenhuma lista, nenhuma aceita padrão (`LIKE`).
-- Mesmo molde de `024_rls_pix_webhook_scope.sql`:
--
--   * SECURITY DEFINER — o corpo roda como o dono das tabelas (sem FORCE RLS);
--   * `search_path` fixo — impede sequestro por objeto homônimo em schema
--     anterior no caminho;
--   * EXECUTE só para `orbien_app`. `app_user` (requisição autenticada) e
--     PUBLIC não chamam: quem já tem contexto lê pelo RLS normal.
--
-- O que cada uma devolve, e por quê:
--
--   auth_login_lookup(email)  — login e login de plataforma. É a ÚNICA que
--     devolve `password_hash`, porque o argon2 é verificado na API.
--   auth_session_lookup(id)   — JwtStrategy, refresh, impersonate. SEM hash.
--   auth_tenant_admin_user_id(tenant) — webhook Pix. Devolve um id opaco.
--
-- `tenant_is_active` e `plan` vêm no mesmo retorno de propósito: tiram
-- `tenants`/`tenant_plans` do caminho de auth (um passo a menos para a ação C)
-- e mantêm UMA consulta por requisição no JwtStrategy.
--
-- Este script só ADICIONA funções. A policy `orbien_app_auth` cai em 017, que
-- roda DEPOIS deste — a policy só pode sair quando as funções já existem.
-- Rodar este script sozinho não muda comportamento nenhum.
-- =============================================================================

CREATE OR REPLACE FUNCTION auth_login_lookup(p_email TEXT)
RETURNS TABLE (
  user_id          TEXT,
  tenant_id        TEXT,
  congregation_id  TEXT,
  password_hash    TEXT,
  is_active        BOOLEAN,
  tenant_is_active BOOLEAN,
  plan             TEXT,
  roles            JSONB
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    ua.id,
    ua.tenant_id,
    ua.congregation_id,
    ua.password_hash,
    ua.is_active,
    t.is_active,
    tp.plan::text,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'role_code', ra.role_code,
                'congregation_id', ra.congregation_id))
         FROM role_assignments ra
        WHERE ra.user_account_id = ua.id),
      '[]'::jsonb
    )
  FROM user_accounts ua
  JOIN tenants t ON t.id = ua.tenant_id
  LEFT JOIN tenant_plans tp ON tp.tenant_id = ua.tenant_id
  WHERE ua.email = p_email
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION auth_session_lookup(p_user_id TEXT)
RETURNS TABLE (
  user_id          TEXT,
  tenant_id        TEXT,
  congregation_id  TEXT,
  is_active        BOOLEAN,
  tenant_is_active BOOLEAN,
  plan             TEXT,
  roles            JSONB
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    ua.id,
    ua.tenant_id,
    ua.congregation_id,
    ua.is_active,
    t.is_active,
    tp.plan::text,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'role_code', ra.role_code,
                'congregation_id', ra.congregation_id))
         FROM role_assignments ra
        WHERE ra.user_account_id = ua.id),
      '[]'::jsonb
    )
  FROM user_accounts ua
  JOIN tenants t ON t.id = ua.tenant_id
  LEFT JOIN tenant_plans tp ON tp.tenant_id = ua.tenant_id
  WHERE ua.id = p_user_id
  LIMIT 1;
$$;

-- Webhook Pix: o tenant vem do escopo que `pix_webhook_scope()` resolve pelo id
-- da Asaas, nunca do payload. `ORDER BY` torna determinístico o que o
-- `findFirst` sem ordem deixava ao acaso.
CREATE OR REPLACE FUNCTION auth_tenant_admin_user_id(p_tenant_id TEXT)
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ra.user_account_id
    FROM role_assignments ra
   WHERE ra.tenant_id = p_tenant_id
     AND ra.role_code = 'tenant_admin'
   ORDER BY ra.created_at, ra.id
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION auth_login_lookup(TEXT)          FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_session_lookup(TEXT)        FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_tenant_admin_user_id(TEXT)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_login_lookup(TEXT)         TO orbien_app;
GRANT EXECUTE ON FUNCTION auth_session_lookup(TEXT)       TO orbien_app;
GRANT EXECUTE ON FUNCTION auth_tenant_admin_user_id(TEXT) TO orbien_app;

-- ---------------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------------

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace AND ns.nspname = 'public'
   WHERE p.proname IN ('auth_login_lookup', 'auth_session_lookup', 'auth_tenant_admin_user_id')
     AND p.prosecdef
     AND p.proconfig IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
     AND has_function_privilege('orbien_app', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('app_user', p.oid, 'EXECUTE');
  IF n <> 3 THEN
    RAISE EXCEPTION '033: esperava 3 funcoes auth_* SECURITY DEFINER com search_path fixo e EXECUTE so para orbien_app, encontrei %', n;
  END IF;
END $$;
