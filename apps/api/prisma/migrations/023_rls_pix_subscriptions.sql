-- =============================================================================
-- 023_rls_pix_subscriptions.sql — RLS de `pix_subscriptions`
-- (PROD-27, PIX recorrente / dízimo automático via Asaas, Premium)
--
-- Roda DEPOIS de 003_rls_admin_write.sql, que define app_congregation_allowed().
-- Fora do histórico do Prisma, como os anteriores.
--
-- Tabela nova (migration `add_pix_subscriptions`), mesmo caso de 012/014/015/
-- 016/018/020/022: não há `tenant_isolation` de 001 para o passo 4 derrubar —
-- ela já nasce com a policy de congregação (AD-001), diferente de
-- `pix_payments`, que é de 001 e ficou só no isolamento de tenant. Sem isto,
-- `app_user` tem GRANT por ALTER DEFAULT PRIVILEGES e toda igreja leria (e
-- cancelaria) a assinatura de dízimo automático das outras.
--
-- `USING` e `WITH CHECK` dizem a MESMA coisa (AD-001). FOR ALL: quem cria a
-- assinatura (tesoureiro/admin) também cancela; o gate de Premium é do
-- controller (`@RequiresPlan('premium')`), não do RLS — a policy só isola
-- tenant e congregação, como as demais tabelas financeiras.
-- =============================================================================

ALTER TABLE pix_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pix_subscriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON pix_subscriptions;
CREATE POLICY tenant_congregation_isolation ON pix_subscriptions
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  );

-- ---------------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------------

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE policyname = 'tenant_congregation_isolation'
     AND tablename  = 'pix_subscriptions'
     AND qual LIKE '%app_congregation_allowed%'
     AND with_check IS NOT DISTINCT FROM qual;

  RAISE NOTICE '023_rls_pix_subscriptions: % policy(s) simétrica(s)', n;

  IF n <> 1 THEN
    RAISE EXCEPTION '023_rls_pix_subscriptions: esperava 1 policy tenant_congregation_isolation simétrica em pix_subscriptions, encontrei %', n;
  END IF;
END $$;
