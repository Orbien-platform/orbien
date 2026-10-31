-- =============================================================================
-- 032_rls_kids_checkin_qr_tokens.sql — RLS dos QRs de check-in do Kids (R3-1)
--
-- Roda DEPOIS de 003_rls_admin_write.sql (app_congregation_allowed()). Fora do
-- histórico do Prisma. Tabela nova (migration `add_kids_checkin_qr_tokens`),
-- mesmo caso de 029/030: nasce já com a policy de congregação. `USING` e
-- `WITH CHECK` dizem a MESMA coisa (AD-001).
-- =============================================================================

ALTER TABLE kids_checkin_qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE kids_checkin_qr_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON kids_checkin_qr_tokens;
CREATE POLICY tenant_congregation_isolation ON kids_checkin_qr_tokens
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
     AND tablename = 'kids_checkin_qr_tokens'
     AND qual LIKE '%app_congregation_allowed%'
     AND with_check IS NOT DISTINCT FROM qual;

  RAISE NOTICE '032_rls_kids_checkin_qr_tokens: % policy(s) simétrica(s)', n;

  IF n <> 1 THEN
    RAISE EXCEPTION '032_rls_kids_checkin_qr_tokens: esperava 1 policy tenant_congregation_isolation simétrica, encontrei %', n;
  END IF;
END $$;
