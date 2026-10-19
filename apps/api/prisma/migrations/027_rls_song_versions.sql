-- =============================================================================
-- 027_rls_song_versions.sql — RLS das versões de música do repertório
--
-- Roda DEPOIS de 003_rls_admin_write.sql (app_congregation_allowed()). Fora do
-- histórico do Prisma. Tabela nova (migration `add_song_versions`), mesmo caso
-- de 007/026: nasce já com a policy de congregação, sem `tenant_isolation` de
-- 001 para derrubar. `USING` e `WITH CHECK` dizem a MESMA coisa (AD-001).
-- =============================================================================

ALTER TABLE song_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_versions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON song_versions;
CREATE POLICY tenant_congregation_isolation ON song_versions
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
     AND tablename = 'song_versions'
     AND qual LIKE '%app_congregation_allowed%'
     AND with_check IS NOT DISTINCT FROM qual;

  RAISE NOTICE '027_rls_song_versions: % policy(s) simétrica(s)', n;

  IF n <> 1 THEN
    RAISE EXCEPTION '027_rls_song_versions: esperava 1 policy tenant_congregation_isolation simétrica, encontrei %', n;
  END IF;
END $$;
