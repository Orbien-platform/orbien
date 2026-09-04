-- ===========================================================================
-- 005 — o plano de plataforma passa a enxergar o próprio rastro
--
-- Roda DEPOIS de 004: depende de `app_platform_access()`, criada lá. Como os
-- outros scripts 00N, este fica FORA do histórico do Prisma — `prisma migrate
-- deploy` não o aplica. Quem aplica é `scripts/bootstrap-db.sh`, e a ordem
-- entre eles importa.
--
-- Por que existe
-- --------------
-- O `AuditInterceptor` grava `support_access` e `platform_access` em
-- `audit_logs` desde a Fase 2, e ninguém nunca olhou — não havia como. A
-- policy `tenant_read` de 001 diz `tenant_id = app_current_tenant()`, e uma
-- rota de plataforma roda sem tenant no contexto por definição. O suporte
-- leria zero linhas, sem erro nenhum: exatamente o modo de falha silenciosa
-- que 004 já documenta.
--
-- Por que o ramo é estreito
-- -------------------------
-- As seis policies de 004 abrem a tabela inteira para o plano de plataforma,
-- e ali isso é o certo: `tenants`, `congregations` e afins são dado da
-- plataforma. `audit_logs` não é. Cada linha carrega `before`/`after` com o
-- dado da igreja no momento da mudança — abrir a tabela inteira daria ao
-- suporte, sem impersonar ninguém e sem deixar rastro de sessão, uma janela
-- para o histórico de alterações de todas as igrejas.
--
-- O ramo se limita às ações que a própria plataforma gerou. O suporte enxerga
-- o que o suporte fez. Para ver o resto de uma igreja continua sendo preciso
-- abrir uma sessão de suporte — que é pontual, dura 5 minutos, é somente
-- leitura e deixa a sua própria linha aqui.
--
-- Sem WITH CHECK porque a policy é `FOR SELECT`. Escrita em `audit_logs`
-- continua exclusiva de `audit_insert()`, que é SECURITY DEFINER e não passa
-- por RLS. Por isso este script não entra na checagem de simetria do passo 7
-- do bootstrap, que só vale para as policies `tenant_isolation`.
-- ===========================================================================

DROP POLICY IF EXISTS tenant_read ON audit_logs;
CREATE POLICY tenant_read ON audit_logs
  AS PERMISSIVE FOR SELECT TO app_user
  USING (
    tenant_id = app_current_tenant()
    OR (
      app_platform_access()
      AND action IN ('support_access', 'platform_access')
    )
  );

COMMENT ON POLICY tenant_read ON audit_logs IS
  'Dois ramos: a igreja lê o próprio log; o plano de plataforma lê apenas as '
  'linhas que ele mesmo gerou (support_access, platform_access). Ver '
  '005_rls_audit_platform.sql.';
