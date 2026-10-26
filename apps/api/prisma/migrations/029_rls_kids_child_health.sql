-- =============================================================================
-- 029_rls_kids_child_health.sql — RLS do dado de saúde da criança (AD-001, AD-013)
--
-- Roda DEPOIS de 003_rls_admin_write.sql (app_congregation_allowed()). Fora do
-- histórico do Prisma. Tabela nova (migration `add_kids_child_health`), mesmo
-- caso de 028: nasce já com a policy de congregação. `USING` e `WITH CHECK`
-- dizem a MESMA coisa.
-- =============================================================================

ALTER TABLE kids_child_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE kids_child_health FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_congregation_isolation ON kids_child_health;
CREATE POLICY tenant_congregation_isolation ON kids_child_health
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
     AND tablename = 'kids_child_health'
     AND qual LIKE '%app_congregation_allowed%'
     AND with_check IS NOT DISTINCT FROM qual;

  RAISE NOTICE '029_rls_kids_child_health: % policy(s) simétrica(s)', n;

  IF n <> 1 THEN
    RAISE EXCEPTION '029_rls_kids_child_health: esperava 1 policy tenant_congregation_isolation simétrica, encontrei %', n;
  END IF;
END $$;
