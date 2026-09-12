-- =============================================================================
-- 009_rls_prayer_requests.sql — RLS dos pedidos de oração da célula (PROD-01)
--
-- Roda DEPOIS de 003_rls_admin_write.sql, que já define app_congregation_allowed().
-- Fora do histórico do Prisma, como os oito anteriores.
--
-- Por que esta tabela precisa de script novo, sendo antiga: `prayer_requests`
-- nasceu em 001 com `tenant_isolation` (só `tenant_id`), porque nenhuma rota a
-- usava — a tabela existia no schema e nada escrevia nela. Com a feature no ar,
-- o conteúdo passa a ser dado de saúde, família e conflito: isolamento por
-- tenant deixaria a célula de uma congregação legível pela congregação irmã do
-- mesmo tenant.
--
-- AD-001 (.specs/STATE.md): `app_congregation_allowed(congregation_id)` nos
-- dois lados, USING e WITH CHECK, dizendo a mesma coisa — divergir é o defeito
-- que a pendência nº 1 documentou (admin lê a linha e falha ao gravar, 42501).
--
-- O `tenant_isolation` de 001 sai sozinho: o passo 4 do bootstrap-db.sh
-- derruba a policy de tenant em toda tabela que tenha
-- `tenant_congregation_isolation`, e ele roda depois deste arquivo. Policies
-- PERMISSIVE se combinam com OR — deixar as duas manteria a fraca valendo.
-- =============================================================================

ALTER TABLE prayer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE prayer_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON prayer_requests;
CREATE POLICY tenant_congregation_isolation ON prayer_requests
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  );
