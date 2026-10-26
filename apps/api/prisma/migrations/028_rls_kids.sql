-- =============================================================================
-- 028_rls_kids.sql — RLS das tabelas do módulo Kids (AD-001, AD-013)
--
-- Roda DEPOIS de 003_rls_admin_write.sql (app_congregation_allowed()). Fora do
-- histórico do Prisma. Quatro tabelas novas (migration `add_kids_module`), mesmo
-- caso de 026/027: nascem já com a policy de congregação, sem `tenant_isolation`
-- de 001 para derrubar. `USING` e `WITH CHECK` dizem a MESMA coisa em todas.
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['kids_rooms', 'kids_sessions', 'kids_guardians', 'kids_checkins']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_congregation_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY tenant_congregation_isolation ON %I
        AS PERMISSIVE FOR ALL TO app_user
        USING (
          tenant_id = app_current_tenant()
          AND app_congregation_allowed(congregation_id)
        )
        WITH CHECK (
          tenant_id = app_current_tenant()
          AND app_congregation_allowed(congregation_id)
        )
    $p$, t);
  END LOOP;
END $$;

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE policyname = 'tenant_congregation_isolation'
     AND tablename IN ('kids_rooms', 'kids_sessions', 'kids_guardians', 'kids_checkins')
     AND qual LIKE '%app_congregation_allowed%'
     AND with_check IS NOT DISTINCT FROM qual;

  RAISE NOTICE '028_rls_kids: % policy(s) simétrica(s)', n;

  IF n <> 4 THEN
    RAISE EXCEPTION '028_rls_kids: esperava 4 policies tenant_congregation_isolation simétricas, encontrei %', n;
  END IF;
END $$;
