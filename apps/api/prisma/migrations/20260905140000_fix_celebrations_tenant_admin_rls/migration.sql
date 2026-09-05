-- =============================================================================
-- ORBIEN — fix_celebrations_tenant_admin_rls
--
-- `20260612090100_alter_celebration_columns_rls` recriou a policy de
-- `celebrations`/`celebration_instances` como Padrão A (tenant + congregação
-- exatos, sem exceção nenhuma), quando o resto do sistema já tinha migrado
-- para o Padrão B em `20260608144811_fix_congregation_isolation_policies`:
-- tenant + (congregação exata OU tenant_admin OU denomination_admin) na
-- leitura, tenant + congregação exatos na escrita.
--
-- Como a policy ficou com o nome `tenant_isolation` (não
-- `tenant_congregation_isolation`), nem `003_rls_admin_write.sql` nem o passo
-- 4 do `bootstrap-db.sh` — que só mexem em policies com esse segundo nome —
-- nunca a alcançaram. Efeito: um `tenant_admin` lendo o dashboard ou a agenda
-- via `/celebrations` e `/celebrations/instances` só vê a própria congregação,
-- ao contrário de `persons` e `financial_transactions`, onde ele vê o tenant
-- inteiro. Mesma classe de bug que `003_rls_admin_write.sql` já corrigiu para
-- as outras tabelas — aqui é o caso que ficou de fora por causa do nome da
-- policy.
-- =============================================================================

DROP POLICY IF EXISTS tenant_isolation ON "celebrations";
CREATE POLICY tenant_isolation ON "celebrations"
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND (
      congregation_id = app_current_congregation()
      OR app_has_role('tenant_admin')
      OR app_has_role('denomination_admin')
    )
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );

DROP POLICY IF EXISTS tenant_isolation ON "celebration_instances";
CREATE POLICY tenant_isolation ON "celebration_instances"
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND (
      congregation_id = app_current_congregation()
      OR app_has_role('tenant_admin')
      OR app_has_role('denomination_admin')
    )
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );
