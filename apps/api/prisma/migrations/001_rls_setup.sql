-- =============================================================================
-- ORBIEN — Migration 001: Roles, Helper Functions & Row Level Security
-- Executar APÓS `prisma migrate deploy` ter criado as tabelas
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. PostgreSQL Roles
--    app_user  → role padrão da aplicação (NOBYPASSRLS = respeita RLS)
--    app_admin → role de administração da plataforma (BYPASSRLS)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Funções helper de contexto
--    Valores injetados pelo backend via SET LOCAL antes de cada query:
--      SET LOCAL app.current_tenant_id     = '<uuid>';
--      SET LOCAL app.current_congregation_id = '<uuid>';
--      SET LOCAL app.current_user_id       = '<uuid>';
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_current_tenant()
RETURNS TEXT
LANGUAGE SQL STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::TEXT;
$$;

CREATE OR REPLACE FUNCTION app_current_congregation()
RETURNS TEXT
LANGUAGE SQL STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_congregation_id', TRUE), '')::TEXT;
$$;

CREATE OR REPLACE FUNCTION app_current_user()
RETURNS TEXT
LANGUAGE SQL STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', TRUE), '')::TEXT;
$$;

-- Verifica se o usuário atual possui determinado role no tenant/congregação corrente
CREATE OR REPLACE FUNCTION app_has_role(p_role_code TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM role_assignments ra
    WHERE ra.user_account_id = app_current_user()
      AND ra.tenant_id       = app_current_tenant()
      AND ra.role_code       = p_role_code
      AND (
        ra.congregation_id = app_current_congregation()
        OR app_current_congregation() IS NULL
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Habilitar RLS em todas as tabelas com tenant_id
-- ---------------------------------------------------------------------------

ALTER TABLE tenants                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE congregations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE branding_configs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_plans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_assignments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens            ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE households                ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_histories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_records             ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records           ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_tags               ENABLE ROW LEVEL SECURITY;
ALTER TABLE small_groups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_memberships         ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_meetings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE prayer_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_materials           ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_targets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_open_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_attachments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pix_payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE donation_receipts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_posts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audience_segments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_dispatches   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ministries                ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE celebrations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE celebration_instances     ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_order_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE setlists                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE setlist_songs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Políticas RLS por tabela
--    Padrão: isolamento por tenant_id
--    app_admin tem BYPASSRLS, portanto não precisa de política explícita
-- ---------------------------------------------------------------------------

-- ---- GRUPO 1 — FUNDAÇÃO ----

-- O tenant só vê a si mesmo
CREATE POLICY tenant_isolation ON tenants
  AS PERMISSIVE FOR ALL TO app_user
  USING (id = app_current_tenant())
  WITH CHECK (id = app_current_tenant());

CREATE POLICY tenant_isolation ON congregations
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON branding_configs
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON tenant_plans
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---- GRUPO 2 — AUTH ----

CREATE POLICY tenant_isolation ON user_accounts
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON role_assignments
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- Cada usuário acessa apenas seus próprios refresh tokens
CREATE POLICY own_tokens ON refresh_tokens
  AS PERMISSIVE FOR ALL TO app_user
  USING (user_account_id = app_current_user())
  WITH CHECK (user_account_id = app_current_user());

-- ---- GRUPO 3 — PESSOAS ----

CREATE POLICY tenant_isolation ON persons
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON households
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- household_members: isolamento via household pai
CREATE POLICY tenant_isolation ON household_members
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    household_id IN (
      SELECT id FROM households WHERE tenant_id = app_current_tenant()
    )
  )
  WITH CHECK (
    household_id IN (
      SELECT id FROM households WHERE tenant_id = app_current_tenant()
    )
  );

CREATE POLICY tenant_isolation ON classification_histories
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON visit_records
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON consent_records
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON person_tags
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---- GRUPO 4 — PEQUENOS GRUPOS ----

CREATE POLICY tenant_isolation ON small_groups
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON group_memberships
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON group_meetings
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON attendance_records
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON prayer_requests
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON study_materials
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- material_targets: isolamento via study_material pai
CREATE POLICY tenant_isolation ON material_targets
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    study_material_id IN (
      SELECT id FROM study_materials WHERE tenant_id = app_current_tenant()
    )
  )
  WITH CHECK (
    study_material_id IN (
      SELECT id FROM study_materials WHERE tenant_id = app_current_tenant()
    )
  );

CREATE POLICY tenant_isolation ON material_open_records
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---- GRUPO 5 — FINANCEIRO ----

CREATE POLICY tenant_isolation ON financial_categories
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON cost_centers
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON financial_transactions
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON transaction_attachments
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON recurring_rules
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON pix_payments
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON donation_receipts
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---- GRUPO 6 — CONTEÚDO ----

CREATE POLICY tenant_isolation ON content_posts
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON audience_segments
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON notification_dispatches
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- ---- GRUPO 7 — VOLUNTARIADO E CELEBRAÇÕES ----

CREATE POLICY tenant_isolation ON ministries
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON volunteer_profiles
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON assignments
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON celebrations
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON celebration_instances
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON service_orders
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- service_order_items: isolamento via service_order pai
CREATE POLICY tenant_isolation ON service_order_items
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    service_order_id IN (
      SELECT id FROM service_orders WHERE tenant_id = app_current_tenant()
    )
  )
  WITH CHECK (
    service_order_id IN (
      SELECT id FROM service_orders WHERE tenant_id = app_current_tenant()
    )
  );

-- setlists: isolamento via service_order_item → service_order
CREATE POLICY tenant_isolation ON setlists
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    service_order_item_id IN (
      SELECT soi.id
      FROM service_order_items soi
      JOIN service_orders so ON so.id = soi.service_order_id
      WHERE so.tenant_id = app_current_tenant()
    )
  )
  WITH CHECK (
    service_order_item_id IN (
      SELECT soi.id
      FROM service_order_items soi
      JOIN service_orders so ON so.id = soi.service_order_id
      WHERE so.tenant_id = app_current_tenant()
    )
  );

-- setlist_songs: isolamento via setlist → service_order_item → service_order
CREATE POLICY tenant_isolation ON setlist_songs
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    setlist_id IN (
      SELECT s.id
      FROM setlists s
      JOIN service_order_items soi ON soi.id = s.service_order_item_id
      JOIN service_orders so ON so.id = soi.service_order_id
      WHERE so.tenant_id = app_current_tenant()
    )
  )
  WITH CHECK (
    setlist_id IN (
      SELECT s.id
      FROM setlists s
      JOIN service_order_items soi ON soi.id = s.service_order_item_id
      JOIN service_orders so ON so.id = soi.service_order_id
      WHERE so.tenant_id = app_current_tenant()
    )
  );

-- ---- GRUPO 8 — AUDITORIA ----

-- AuditLog: somente leitura pelo app_user; escrita exclusiva via SECURITY DEFINER
CREATE POLICY tenant_read ON audit_logs
  AS PERMISSIVE FOR SELECT TO app_user
  USING (tenant_id = app_current_tenant());

-- Função helper para inserção segura no audit_log (ignora RLS restrita)
CREATE OR REPLACE FUNCTION audit_insert(
  p_tenant_id         TEXT,
  p_congregation_id   TEXT,
  p_actor_user_id     TEXT,
  p_subject_person_id TEXT,
  p_entity            TEXT,
  p_action            TEXT,
  p_before            JSONB,
  p_after             JSONB,
  p_ip                TEXT,
  p_user_agent        TEXT
)
RETURNS VOID
LANGUAGE SQL SECURITY DEFINER
AS $$
  INSERT INTO audit_logs (
    tenant_id, congregation_id, actor_user_id, subject_person_id,
    entity, action, before, after, ip, user_agent, at
  ) VALUES (
    p_tenant_id, p_congregation_id, p_actor_user_id, p_subject_person_id,
    p_entity, p_action, p_before, p_after, p_ip, p_user_agent, now()
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants de schema e tabelas
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO app_user, app_admin;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_admin;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_admin;

-- Garante grants para tabelas criadas no futuro
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO app_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO app_admin;
