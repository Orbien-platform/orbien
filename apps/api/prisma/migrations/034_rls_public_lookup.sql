-- =============================================================================
-- 034_rls_public_lookup.sql — leituras públicas de tenants/congregations/
-- branding_configs/tenant_plans por função SECURITY DEFINER (PEND-04, ação C)
--
-- `orbien_app` lê estas quatro tabelas pela policy `orbien_app_auth ... USING
-- (true)` (017) — as linhas de TODOS os tenants, inclusive `branding_configs`
-- com os tokens OAuth da Cloudflare cifrados. A policy existe porque rotas sem
-- JWT (doação pública, células públicas, autocadastro por QR, domínio próprio)
-- e a emissão do token de suporte precisam resolver a igreja ANTES de haver
-- contexto de tenant.
--
-- Mapeamento de consumidores (2026-11-05) — quem roda como `orbien_app` sem
-- `app.tenant_id` e lê estas tabelas:
--
--   public_tenant_by_slug(slug)      — PublicSmallGroupsService.resolveTenant
--   public_donation_target(slug)     — PixService.resolveTenant (PIX manual) e
--                                      PixService.resolvePublicDonationTenant
--                                      (categorias, doação e status públicos)
--   public_qr_church(token)          — VisitorService.describeQr / registerViaQr
--   public_domain_resolve(host)      — DomainProvisioningService.
--                                      resolveTenantSlugByHost (middleware web)
--   auth_impersonate_target(tenant)  — AuthService.impersonate
--
-- Fora desta lista, ficam sem função e sem mudança de comportamento:
--
--   * Requisição autenticada: roda como `app_user` (SET LOCAL ROLE), pelas
--     policies `tenant_isolation` — nunca passou por `orbien_app_auth`.
--   * Crons e `prisma.system`: dono do banco, ignoram RLS.
--   * Callback OAuth da Cloudflare: o tenant vem do `state` assinado; o service
--     fixa `app.tenant_id` antes de tocar `branding_configs`. `orbien_app`
--     HERDA `app_user` (GRANT ... WITH SET TRUE, INHERIT padrão), então as
--     policies `TO app_user` valem para ele assim que há contexto — é o mesmo
--     que `013_rls_small_groups_public.sql` já usa em `congregations`.
--
-- Cada função responde por UM parâmetro exato (slug, token, host, id) e
-- devolve no máximo uma linha, só com as colunas que o consumidor usa. Nenhuma
-- lista, nenhuma aceita padrão. Mesmo molde de 033 e de
-- `024_rls_pix_webhook_scope.sql`:
--
--   * SECURITY DEFINER — o corpo roda como o dono das tabelas (sem FORCE RLS);
--   * `search_path` fixo — impede sequestro por objeto homônimo;
--   * EXECUTE só para `orbien_app`. `app_user` e PUBLIC não chamam.
--
-- EXPANDIR: este script só ADICIONA funções. A policy `orbien_app_auth` das
-- quatro tabelas só cai em 035, que roda DEPOIS e é uma release à parte.
-- Rodar este script sozinho não muda comportamento nenhum.
-- =============================================================================

-- Células públicas: slug -> id, nome e nome de exibição da igreja.
-- `is_active` volta porque quem decide 404 é o service (tenant inativo = 404).
CREATE OR REPLACE FUNCTION public_tenant_by_slug(p_slug TEXT)
RETURNS TABLE (
  tenant_id   TEXT,
  name        TEXT,
  is_active   BOOLEAN,
  app_name    TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.id, t.name, t.is_active, b.app_name
    FROM tenants t
    LEFT JOIN branding_configs b ON b.tenant_id = t.id
   WHERE t.slug = p_slug
   LIMIT 1;
$$;

-- Doação pública e PIX manual: slug -> o que cobrar e para quem.
-- Devolve a linha mesmo sem branding/congregação (colunas NULL): cada consumidor
-- mantém a sua própria resposta de erro (400 vs 404), como antes. `plan` e
-- `plan_status` vêm no mesmo retorno para a doação pública decidir se abre
-- cobrança dinâmica. A congregação é a mais antiga do tenant, como o
-- `orderBy created_at asc` que o código tinha — com `id` de desempate.
CREATE OR REPLACE FUNCTION public_donation_target(p_slug TEXT)
RETURNS TABLE (
  tenant_id       TEXT,
  tenant_name     TEXT,
  app_name        TEXT,
  pix_key         TEXT,
  congregation_id TEXT,
  plan            TEXT,
  plan_status     TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    t.id,
    t.name,
    b.app_name,
    b.pix_key,
    (SELECT c.id FROM congregations c
      WHERE c.tenant_id = t.id
      ORDER BY c.created_at, c.id
      LIMIT 1),
    tp.plan::text,
    tp.status::text
  FROM tenants t
  LEFT JOIN branding_configs b ON b.tenant_id = t.id
  LEFT JOIN tenant_plans tp ON tp.tenant_id = t.id
  WHERE t.slug = p_slug
  LIMIT 1;
$$;

-- Autocadastro por QR: token -> nome da congregação e a marca da igreja.
-- `qr_tokens` não tem RLS; o token (único, aleatório) é a chave exata.
CREATE OR REPLACE FUNCTION public_qr_church(p_token TEXT)
RETURNS TABLE (
  church_name     TEXT,
  primary_color   TEXT,
  secondary_color TEXT,
  logo_url        TEXT,
  logo_url_dark   TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.name, b.primary_color, b.secondary_color, b.logo_url, b.logo_url_dark
    FROM qr_tokens q
    JOIN congregations c ON c.id = q.congregation_id
    LEFT JOIN branding_configs b ON b.tenant_id = q.tenant_id
   WHERE q.token = p_token
   LIMIT 1;
$$;

-- Domínio próprio: host -> slug, e SÓ quando o domínio está verificado.
CREATE OR REPLACE FUNCTION public_domain_resolve(p_host TEXT)
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.slug
    FROM branding_configs b
    JOIN tenants t ON t.id = b.tenant_id
   WHERE b.custom_domain = p_host
     AND b.custom_domain_status = 'verified'
   LIMIT 1;
$$;

-- Sessão de suporte (`POST /auth/impersonate`): tenant alvo -> plano e a
-- primeira congregação. O chamador já foi autorizado em `role_assignments`
-- (auth_session_lookup); isto só resolve o destino do token.
CREATE OR REPLACE FUNCTION auth_impersonate_target(p_tenant_id TEXT)
RETURNS TABLE (
  tenant_id       TEXT,
  plan            TEXT,
  congregation_id TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    t.id,
    tp.plan::text,
    (SELECT c.id FROM congregations c
      WHERE c.tenant_id = t.id
      ORDER BY c.created_at, c.id
      LIMIT 1)
  FROM tenants t
  LEFT JOIN tenant_plans tp ON tp.tenant_id = t.id
  WHERE t.id = p_tenant_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public_tenant_by_slug(TEXT)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public_donation_target(TEXT)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public_qr_church(TEXT)           FROM PUBLIC;
REVOKE ALL ON FUNCTION public_domain_resolve(TEXT)      FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_impersonate_target(TEXT)    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_tenant_by_slug(TEXT)   TO orbien_app;
GRANT EXECUTE ON FUNCTION public_donation_target(TEXT)  TO orbien_app;
GRANT EXECUTE ON FUNCTION public_qr_church(TEXT)        TO orbien_app;
GRANT EXECUTE ON FUNCTION public_domain_resolve(TEXT)   TO orbien_app;
GRANT EXECUTE ON FUNCTION auth_impersonate_target(TEXT) TO orbien_app;

-- ---------------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------------

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace AND ns.nspname = 'public'
   WHERE p.proname IN ('public_tenant_by_slug', 'public_donation_target',
                       'public_qr_church', 'public_domain_resolve',
                       'auth_impersonate_target')
     AND p.prosecdef
     AND p.proconfig IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
     AND has_function_privilege('orbien_app', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('app_user', p.oid, 'EXECUTE');
  IF n <> 5 THEN
    RAISE EXCEPTION '034: esperava 5 funcoes publicas SECURITY DEFINER com search_path fixo e EXECUTE so para orbien_app, encontrei %', n;
  END IF;
END $$;
