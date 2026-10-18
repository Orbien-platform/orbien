-- =============================================================================
-- 026_rls_celebration_attendance.sql — RLS da contagem de público do culto
--
-- Roda DEPOIS de 003_rls_admin_write.sql (app_congregation_allowed()). Fora do
-- histórico do Prisma. Tabela nova (migration `add_celebration_attendance`),
-- mesmo caso de 025: nasce já com a policy de congregação, sem `tenant_isolation`
-- de 001 para derrubar. `USING` e `WITH CHECK` dizem a MESMA coisa (AD-001);
-- quem decide quem pode lançar é o service.
-- =============================================================================

ALTER TABLE celebration_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE celebration_attendance FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON celebration_attendance;
CREATE POLICY tenant_congregation_isolation ON celebration_attendance
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
     AND tablename = 'celebration_attendance'
     AND qual LIKE '%app_congregation_allowed%'
     AND with_check IS NOT DISTINCT FROM qual;

  RAISE NOTICE '026_rls_celebration_attendance: % policy(s) simétrica(s)', n;

  IF n <> 1 THEN
    RAISE EXCEPTION '026_rls_celebration_attendance: esperava 1 policy tenant_congregation_isolation simétrica, encontrei %', n;
  END IF;
END $$;
