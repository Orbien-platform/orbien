-- =============================================================================
-- 016_rls_networks.sql — RLS de redes de células (PROD-20)
--
-- Tabela nova (20260915004121_add_network): a migration do Prisma cria a
-- tabela, RLS é sempre daqui — 001 nunca a viu, e tabela nova nasce SEM row
-- level security no Postgres.
--
-- Roda DEPOIS de 003_rls_admin_write.sql, que define
-- `app_congregation_allowed()`. Mesmo padrão de 007/008/012/014: já nasce com
-- o predicado certo (AD-001, .specs/STATE.md) nos DOIS lados, USING e
-- WITH CHECK, dizendo a mesma coisa.
--
-- Uma única policy, sem ramo público — nada em `networks` é consultado sem
-- sessão autenticada (ao contrário de `small_groups`/`small_group_visit_
-- requests`, que têm o plano público de PROD-13).
-- =============================================================================

ALTER TABLE networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE networks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON networks;
CREATE POLICY tenant_congregation_isolation ON networks
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
