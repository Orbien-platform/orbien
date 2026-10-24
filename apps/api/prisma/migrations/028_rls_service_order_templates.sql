-- =============================================================================
-- 028_rls_service_order_templates.sql — RLS dos moldes de OC
--
-- Roda DEPOIS de 003_rls_admin_write.sql (app_congregation_allowed()). Fora do
-- histórico do Prisma. Tabelas novas (migration `add_service_order_templates`),
-- mesmo caso de 026/027: nascem já com a policy de congregação, sem
-- `tenant_isolation` de 001 para derrubar. `USING` e `WITH CHECK` dizem a MESMA
-- coisa (AD-001).
-- =============================================================================

ALTER TABLE service_order_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_order_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON service_order_templates;
CREATE POLICY tenant_congregation_isolation ON service_order_templates
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  );

ALTER TABLE service_order_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_order_template_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON service_order_template_items;
CREATE POLICY tenant_congregation_isolation ON service_order_template_items
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  );

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE policyname = 'tenant_congregation_isolation'
     AND tablename IN ('service_order_templates', 'service_order_template_items')
     AND qual LIKE '%app_congregation_allowed%'
     AND with_check IS NOT DISTINCT FROM qual;

  RAISE NOTICE '028_rls_service_order_templates: % policy(s) simétrica(s)', n;

  IF n <> 2 THEN
    RAISE EXCEPTION '028_rls_service_order_templates: esperava 2 policies tenant_congregation_isolation simétricas, encontrei %', n;
  END IF;
END $$;
