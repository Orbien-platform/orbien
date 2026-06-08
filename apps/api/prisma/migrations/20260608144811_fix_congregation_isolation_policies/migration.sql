-- =============================================================================
-- ORBIEN — fix_congregation_isolation_policies
-- Padrão B: isolamento por tenant_id + congregation_id,
-- com exceção de leitura cross-congregation para tenant_admin e denomination_admin.
--
-- USING (leitura):
--   tenant_id = current_tenant
--   AND (congregation_id = current_congregation
--        OR has_role('tenant_admin')
--        OR has_role('denomination_admin'))
--
-- WITH CHECK (escrita): sempre requer tenant+congregation corretos —
-- nem tenant_admin pode inserir dados em congregação diferente da sessão.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Pré-requisito: garantir que app_user role e funções helper existem.
-- A shadow database do Prisma não executa 001_rls_setup.sql, por isso
-- definimos aqui o mínimo necessário para as policies abaixo funcionarem.
-- No banco real estas definições já existem — CREATE OR REPLACE é idempotente.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

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

-- GRUPO: Pessoas
DROP POLICY IF EXISTS tenant_isolation ON persons;
CREATE POLICY tenant_congregation_isolation ON persons
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

DROP POLICY IF EXISTS tenant_isolation ON households;
CREATE POLICY tenant_congregation_isolation ON households
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

DROP POLICY IF EXISTS tenant_isolation ON classification_histories;
CREATE POLICY tenant_congregation_isolation ON classification_histories
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

DROP POLICY IF EXISTS tenant_isolation ON visit_records;
CREATE POLICY tenant_congregation_isolation ON visit_records
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

-- GRUPO: Pequenos Grupos
DROP POLICY IF EXISTS tenant_isolation ON small_groups;
CREATE POLICY tenant_congregation_isolation ON small_groups
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

DROP POLICY IF EXISTS tenant_isolation ON group_memberships;
CREATE POLICY tenant_congregation_isolation ON group_memberships
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

DROP POLICY IF EXISTS tenant_isolation ON group_meetings;
CREATE POLICY tenant_congregation_isolation ON group_meetings
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

DROP POLICY IF EXISTS tenant_isolation ON attendance_records;
CREATE POLICY tenant_congregation_isolation ON attendance_records
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

-- GRUPO: Conteúdo / Materiais
DROP POLICY IF EXISTS tenant_isolation ON study_materials;
CREATE POLICY tenant_congregation_isolation ON study_materials
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

DROP POLICY IF EXISTS tenant_isolation ON material_open_records;
CREATE POLICY tenant_congregation_isolation ON material_open_records
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

-- GRUPO: Financeiro
DROP POLICY IF EXISTS tenant_isolation ON financial_categories;
CREATE POLICY tenant_congregation_isolation ON financial_categories
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

DROP POLICY IF EXISTS tenant_isolation ON cost_centers;
CREATE POLICY tenant_congregation_isolation ON cost_centers
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

DROP POLICY IF EXISTS tenant_isolation ON financial_transactions;
CREATE POLICY tenant_congregation_isolation ON financial_transactions
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

-- transaction_attachments: sem congregation_id — mantém padrão A (tenant apenas)
DROP POLICY IF EXISTS tenant_isolation ON transaction_attachments;
CREATE POLICY tenant_isolation ON transaction_attachments
  AS PERMISSIVE FOR ALL TO app_user
  USING  (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

DROP POLICY IF EXISTS tenant_isolation ON recurring_rules;
CREATE POLICY tenant_congregation_isolation ON recurring_rules
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

DROP POLICY IF EXISTS tenant_isolation ON pix_payments;
CREATE POLICY tenant_congregation_isolation ON pix_payments
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

-- donation_receipts: sem congregation_id — mantém padrão A (tenant apenas)
DROP POLICY IF EXISTS tenant_isolation ON donation_receipts;
CREATE POLICY tenant_isolation ON donation_receipts
  AS PERMISSIVE FOR ALL TO app_user
  USING  (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
