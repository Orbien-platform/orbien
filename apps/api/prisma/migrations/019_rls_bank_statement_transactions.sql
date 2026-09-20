-- =============================================================================
-- 019_rls_bank_statement_transactions.sql — RLS da conciliação bancária OFX (PROD-07)
--
-- Fora do histórico do Prisma, como os dezoito anteriores. Tabela nova
-- (migration `add_bank_statement_transactions`), então não há
-- `tenant_isolation` de 001 para o passo 4 do bootstrap derrubar.
--
-- Padrão B, o mesmo de `export_jobs`/`import_jobs`
-- (20260613000000_add_export_import_jobs): isolamento simples de
-- tenant + congregação por `current_setting`, SEM a exceção de
-- `tenant_admin` que `app_congregation_allowed()` (003) concede em
-- `financial_transactions`/`cost_centers`. Deliberado (docs/PLANO.md,
-- PROD-07): esta tabela é artefato de importação, não o livro-caixa em
-- si, e nada no produto pede que `tenant_admin` veja conciliação de outra
-- congregação sem entrar nela — por isso não depende de 003, só de 001
-- (roles base).
--
-- AD-001 (.specs/STATE.md): `USING` e `WITH CHECK` dizem a MESMA coisa.
-- =============================================================================

ALTER TABLE bank_statement_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_transactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_statement_transactions_tenant_isolation ON bank_statement_transactions;
CREATE POLICY bank_statement_transactions_tenant_isolation ON bank_statement_transactions
  USING (
    tenant_id       = current_setting('app.tenant_id', true)
    AND congregation_id = current_setting('app.congregation_id', true)
  )
  WITH CHECK (
    tenant_id       = current_setting('app.tenant_id', true)
    AND congregation_id = current_setting('app.congregation_id', true)
  );

-- ---------------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------------

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE policyname = 'bank_statement_transactions_tenant_isolation'
     AND tablename  = 'bank_statement_transactions'
     AND with_check IS NOT DISTINCT FROM qual;

  RAISE NOTICE '019_rls_bank_statement_transactions: % policy(s) simétrica(s) em bank_statement_transactions', n;

  IF n <> 1 THEN
    RAISE EXCEPTION '019_rls_bank_statement_transactions: esperava 1 policy bank_statement_transactions_tenant_isolation simétrica em bank_statement_transactions, encontrei %', n;
  END IF;
END $$;
