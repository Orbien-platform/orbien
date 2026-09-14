-- =============================================================================
-- 012_rls_group_messages.sql — RLS do chat fechado da célula (PROD-09)
--
-- Roda DEPOIS de 003_rls_admin_write.sql, que já define app_congregation_allowed().
-- Fora do histórico do Prisma, como os onze anteriores.
--
-- AD-001 (.specs/STATE.md): tabela nova de congregação nasce com
-- app_congregation_allowed(congregation_id) no USING e no WITH CHECK, dizendo
-- a mesma coisa — mesmo caminho de 007/008, sem o ciclo criar-errado→corrigir
-- que 002/003 precisaram.
--
-- Diferente de 009/010: `group_messages` não existe em 001, então não há
-- `tenant_isolation` fraca para o passo 4 do bootstrap derrubar. O que o RLS
-- garante aqui é o piso — tenant e congregação. O fechamento do chat na
-- célula (só quem tem `GroupMembership` lê e escreve) é do service, como em
-- `prayer_requests`: a policy não conhece participação em grupo.
-- =============================================================================

ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON group_messages;
CREATE POLICY tenant_congregation_isolation ON group_messages
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  );
