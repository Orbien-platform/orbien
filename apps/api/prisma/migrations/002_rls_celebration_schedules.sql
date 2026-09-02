-- =============================================================================
-- ORBIEN — Migration 002: RLS para módulo de escalas em celebrações
-- Sprint 11.2 Fatia 1 — 7 novas tabelas
--
-- Padrão B (igual ao fix_congregation_isolation_policies):
--   USING  → tenant + congregation OR tenant_admin OR denomination_admin
--   WITH CHECK → tenant + congregation obrigatórios (sem exceção de leitura)
--
-- Role usado: app_user (role padrão da aplicação, NOBYPASSRLS)
-- GRANTs: cobertos pelos ALTER DEFAULT PRIVILEGES de 001_rls_setup.sql
-- Executar APÓS a migration 20260629000000_sprint112_celebration_schedules
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ENABLE / FORCE ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

ALTER TABLE celebration_schedules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE celebration_schedules          FORCE ROW LEVEL SECURITY;

ALTER TABLE celebration_ministries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE celebration_ministries         FORCE ROW LEVEL SECURITY;

ALTER TABLE celebration_assignments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE celebration_assignments        FORCE ROW LEVEL SECURITY;

ALTER TABLE volunteer_unavailabilities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_unavailabilities     FORCE ROW LEVEL SECURITY;

ALTER TABLE volunteer_unavailability_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_unavailability_dates FORCE ROW LEVEL SECURITY;

ALTER TABLE schedule_templates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_templates             FORCE ROW LEVEL SECURITY;

ALTER TABLE schedule_template_ministries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_template_ministries   FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- POLICIES — Padrão B: isolamento por tenant_id + congregation_id
-- ---------------------------------------------------------------------------

-- celebration_schedules
DROP POLICY IF EXISTS tenant_congregation_isolation ON celebration_schedules;
CREATE POLICY tenant_congregation_isolation ON celebration_schedules
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND (
      congregation_id = app_current_congregation()
      OR app_has_role('tenant_admin')
      OR app_has_role('denomination_admin')
    )
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );

-- celebration_ministries
DROP POLICY IF EXISTS tenant_congregation_isolation ON celebration_ministries;
CREATE POLICY tenant_congregation_isolation ON celebration_ministries
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND (
      congregation_id = app_current_congregation()
      OR app_has_role('tenant_admin')
      OR app_has_role('denomination_admin')
    )
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );

-- celebration_assignments
DROP POLICY IF EXISTS tenant_congregation_isolation ON celebration_assignments;
CREATE POLICY tenant_congregation_isolation ON celebration_assignments
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND (
      congregation_id = app_current_congregation()
      OR app_has_role('tenant_admin')
      OR app_has_role('denomination_admin')
    )
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );

-- volunteer_unavailabilities
DROP POLICY IF EXISTS tenant_congregation_isolation ON volunteer_unavailabilities;
CREATE POLICY tenant_congregation_isolation ON volunteer_unavailabilities
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND (
      congregation_id = app_current_congregation()
      OR app_has_role('tenant_admin')
      OR app_has_role('denomination_admin')
    )
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );

-- volunteer_unavailability_dates
DROP POLICY IF EXISTS tenant_congregation_isolation ON volunteer_unavailability_dates;
CREATE POLICY tenant_congregation_isolation ON volunteer_unavailability_dates
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND (
      congregation_id = app_current_congregation()
      OR app_has_role('tenant_admin')
      OR app_has_role('denomination_admin')
    )
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );

-- schedule_templates
DROP POLICY IF EXISTS tenant_congregation_isolation ON schedule_templates;
CREATE POLICY tenant_congregation_isolation ON schedule_templates
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND (
      congregation_id = app_current_congregation()
      OR app_has_role('tenant_admin')
      OR app_has_role('denomination_admin')
    )
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );

-- schedule_template_ministries
DROP POLICY IF EXISTS tenant_congregation_isolation ON schedule_template_ministries;
CREATE POLICY tenant_congregation_isolation ON schedule_template_ministries
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND (
      congregation_id = app_current_congregation()
      OR app_has_role('tenant_admin')
      OR app_has_role('denomination_admin')
    )
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );
