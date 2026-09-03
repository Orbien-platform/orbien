-- =============================================================================
-- 003_rls_admin_write.sql — a escrita passa a acompanhar a leitura
--
-- Roda DEPOIS de 001_rls_setup.sql e 002_rls_celebration_schedules.sql, e
-- ANTES do passo que remove as policies redundantes de tenant. Fora do
-- histórico do Prisma, como os dois anteriores.
--
-- Corrige dois defeitos das policies `tenant_congregation_isolation`:
--
-- 1. ASSIMETRIA LEITURA/ESCRITA. O `USING` abria exceção para `tenant_admin`,
--    o `WITH CHECK` não. Num UPDATE o Postgres avalia os dois — `USING` na
--    linha antiga, `WITH CHECK` na nova. Resultado: um tenant_admin logado na
--    congregação A lia uma linha da congregação B e falhava ao gravar com
--    42501 ("new row violates row-level security policy"). Reproduzido em
--    2026-09-03 contra banco provisionado do zero; ver docs/PENDENCIAS.md nº 1.
--
--    A decisão é que tenant é a fronteira do produto (white-label por cliente)
--    e `tenant_admin` é transversal às congregações por definição — é o que o
--    separa de `admin_congregation`. Então a exceção vale nos dois lados.
--
-- 2. `denomination_admin` NÃO EXISTE. O papel era citado em nove pontos de
--    001/002 e não está na tabela `roles`; `role_assignments.role_code` é FK
--    para `roles.code` com ON DELETE RESTRICT, então nenhuma atribuição podia
--    tê-lo. Cláusula morta, removida aqui.
--
-- Percorre `pg_policies` em vez de repetir 22 blocos: pega todas as policies
-- com esse nome, hoje e as que vierem depois. Idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION app_congregation_allowed(p_congregation_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT p_congregation_id = app_current_congregation()
      OR app_has_role('tenant_admin');
$$;

COMMENT ON FUNCTION app_congregation_allowed(TEXT) IS
  'Predicado único de congregação, usado no USING e no WITH CHECK das policies '
  'tenant_congregation_isolation. Divergir entre os dois faz o admin ler e não '
  'conseguir gravar — foi o defeito que 003_rls_admin_write.sql corrigiu.';

DO $$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_policies
    WHERE policyname = 'tenant_congregation_isolation'
  LOOP
    EXECUTE format(
      'ALTER POLICY tenant_congregation_isolation ON %I.%I
         USING (
           tenant_id = app_current_tenant()
           AND app_congregation_allowed(congregation_id)
         )
         WITH CHECK (
           tenant_id = app_current_tenant()
           AND app_congregation_allowed(congregation_id)
         )',
      r.schemaname, r.tablename
    );
    n := n + 1;
  END LOOP;

  RAISE NOTICE '003_rls_admin_write: % policies alinhadas', n;

  IF n = 0 THEN
    RAISE EXCEPTION '003_rls_admin_write: nenhuma policy tenant_congregation_isolation encontrada — 001/002 rodaram antes deste script?';
  END IF;
END $$;
