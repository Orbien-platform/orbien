-- =============================================================================
-- 007_rls_songs.sql — RLS do catálogo de músicas (feature repertorio-louvor)
--
-- Roda DEPOIS de 003_rls_admin_write.sql, que já define app_congregation_allowed().
-- Fora do histórico do Prisma, como os seis anteriores.
--
-- AD-001 (.specs/STATE.md): toda tabela nova de congregação nasce usando
-- app_congregation_allowed(congregation_id) diretamente no USING e no WITH
-- CHECK, desde a primeira versão do script — nunca replicando o padrão
-- pré-003 (OR tenant_admin OR denomination_admin inline, que exigiu o ciclo
-- criar-errado→corrigir documentado em docs/PENDENCIAS.md nº 1).
-- =============================================================================

ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON songs;
CREATE POLICY tenant_congregation_isolation ON songs
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  );
