-- =============================================================================
-- 025_rls_assignment_swap_requests.sql — RLS dos pedidos de troca de escala
--
-- Roda DEPOIS de 003_rls_admin_write.sql, que define app_congregation_allowed().
-- Fora do histórico do Prisma, como os anteriores.
--
-- Tabela nova (migration `add_assignment_swap_requests`), mesmo caso de
-- 020/022/023: não há `tenant_isolation` de 001 para derrubar, e o que importa
-- é ela nascer já com a policy certa — sem isto, `app_user` tem GRANT por
-- ALTER DEFAULT PRIVILEGES e toda igreja leria (e aceitaria) as trocas das
-- outras.
--
-- Escopo de CONGREGAÇÃO, igual à atribuição a que o pedido pertence
-- (`celebration_assignments`). Cada linha carrega tenant_id+congregation_id
-- próprios (copiados da atribuição pelo service) para a policy não depender de
-- JOIN.
--
-- `USING` e `WITH CHECK` dizem a MESMA coisa (AD-001). FOR ALL: quem pede
-- cancela, quem recebe aceita ou recusa — quem recorta por pessoa é o service
-- (`CelebrationSwapService`), como nas atribuições.
-- =============================================================================

ALTER TABLE assignment_swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_swap_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON assignment_swap_requests;
CREATE POLICY tenant_congregation_isolation ON assignment_swap_requests
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
     AND tablename = 'assignment_swap_requests'
     AND qual LIKE '%app_congregation_allowed%'
     AND with_check IS NOT DISTINCT FROM qual;

  RAISE NOTICE '025_rls_assignment_swap_requests: % policy(s) simétrica(s)', n;

  IF n <> 1 THEN
    RAISE EXCEPTION '025_rls_assignment_swap_requests: esperava 1 policy tenant_congregation_isolation simétrica, encontrei %', n;
  END IF;
END $$;
