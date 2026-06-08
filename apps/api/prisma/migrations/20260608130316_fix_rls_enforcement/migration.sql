-- =============================================================================
-- ORBIEN — fix_rls_enforcement
-- Corrects three RLS gaps identified by the isolation test suite:
--   1. Helper functions read wrong config keys (app.current_tenant_id vs app.tenant_id)
--   2. `postgres` role could not SET ROLE app_user (missing GRANT)
--   3. ENABLE ROW LEVEL SECURITY was bypassed by `postgres` (owner) — needs FORCE RLS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PART 1: Fix helper function key names
--
-- TenantContextInterceptor sets:
--   app.tenant_id, app.congregation_id, app.user_id, app.role_codes
--
-- But the original 001_rls_setup.sql functions read:
--   app.current_tenant_id, app.current_congregation_id, app.current_user_id
--
-- Result: app_current_tenant() always returned NULL → all policies evaluated
-- tenant_id = NULL (false) → all rows hidden when running as app_user.
-- With BYPASSRLS on postgres this was invisible; now it must be correct.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_current_tenant()
RETURNS TEXT
LANGUAGE SQL STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', TRUE), '')::TEXT;
$$;

CREATE OR REPLACE FUNCTION app_current_congregation()
RETURNS TEXT
LANGUAGE SQL STABLE
AS $$
  SELECT NULLIF(current_setting('app.congregation_id', TRUE), '')::TEXT;
$$;

CREATE OR REPLACE FUNCTION app_current_user()
RETURNS TEXT
LANGUAGE SQL STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', TRUE), '')::TEXT;
$$;

-- ---------------------------------------------------------------------------
-- PART 2: Allow postgres to assume app_user role
--
-- Without this, SET ROLE app_user fails with "permission denied".
-- Needed for runAsTenantWithRole in tests and for any future migration
-- to the app_user connection model.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_auth_members am
    JOIN pg_roles member_role ON member_role.oid = am.member
    JOIN pg_roles parent_role ON parent_role.oid  = am.roleid
    WHERE parent_role.rolname = 'app_user'
      AND member_role.rolname = 'postgres'
  ) THEN
    GRANT app_user TO postgres;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- PART 3: FORCE ROW LEVEL SECURITY on pure data tables
--
-- FORCE RLS makes the table owner (postgres) also subject to RLS policies,
-- so SET LOCAL app.tenant_id is actually enforced for every query.
--
-- Scope: tables that are ONLY accessed via TenantContextInterceptor
-- (i.e., always inside an authenticated, context-set transaction).
--
-- DEFERRED (require auth flow changes before applying FORCE RLS):
--   user_accounts    — JwtStrategy reads this before SET LOCAL on every request
--   congregations    — auth.service reads during login without SET LOCAL
--   branding_configs — PIX public endpoints read without SET LOCAL
--   role_assignments — read during JWT validation
--   refresh_tokens   — auth.service reads/writes without SET LOCAL
--   tenant_plans     — may be read during bootstrap
--   audit_logs       — fire-and-forget INSERT runs outside tenant transaction
-- ---------------------------------------------------------------------------

-- GRUPO: Pessoas
ALTER TABLE persons                  FORCE ROW LEVEL SECURITY;
ALTER TABLE households               FORCE ROW LEVEL SECURITY;
ALTER TABLE household_members        FORCE ROW LEVEL SECURITY;
ALTER TABLE classification_histories FORCE ROW LEVEL SECURITY;
ALTER TABLE visit_records            FORCE ROW LEVEL SECURITY;
ALTER TABLE consent_records          FORCE ROW LEVEL SECURITY;
ALTER TABLE person_tags              FORCE ROW LEVEL SECURITY;

-- GRUPO: Pequenos Grupos
ALTER TABLE small_groups             FORCE ROW LEVEL SECURITY;
ALTER TABLE group_memberships        FORCE ROW LEVEL SECURITY;
ALTER TABLE group_meetings           FORCE ROW LEVEL SECURITY;
ALTER TABLE attendance_records       FORCE ROW LEVEL SECURITY;
ALTER TABLE prayer_requests          FORCE ROW LEVEL SECURITY;

-- GRUPO: Conteúdo / Materiais
ALTER TABLE study_materials          FORCE ROW LEVEL SECURITY;
ALTER TABLE material_targets         FORCE ROW LEVEL SECURITY;
ALTER TABLE material_open_records    FORCE ROW LEVEL SECURITY;

-- GRUPO: Financeiro
ALTER TABLE financial_categories     FORCE ROW LEVEL SECURITY;
ALTER TABLE cost_centers             FORCE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions   FORCE ROW LEVEL SECURITY;
ALTER TABLE transaction_attachments  FORCE ROW LEVEL SECURITY;
ALTER TABLE recurring_rules          FORCE ROW LEVEL SECURITY;
ALTER TABLE pix_payments             FORCE ROW LEVEL SECURITY;
ALTER TABLE donation_receipts        FORCE ROW LEVEL SECURITY;

-- GRUPO: Notificações
ALTER TABLE notification_dispatches  FORCE ROW LEVEL SECURITY;
