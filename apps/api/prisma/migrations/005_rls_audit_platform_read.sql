-- =============================================================================
-- 005_rls_audit_platform_read.sql — o suporte lê a própria auditoria
--
-- Roda DEPOIS de 001, 002, 003 e 004. Fora do histórico do Prisma, como os
-- quatro anteriores.
--
-- O QUE MUDA
--
-- `audit_logs` só tinha `tenant_read`: `USING (tenant_id = app_current_tenant())`.
-- Numa rota de plataforma (`@PlatformRoute()`, sem tenant no contexto) essa
-- comparação é NULL contra NULL, a policy nega, e o suporte lia lista vazia
-- sem erro — o mesmo sintoma que 004 resolveu para `tenants`. `audit_logs`
-- ficou de fora de 004 porque a tela que a lê (Fase 5) ainda não existia.
--
-- O que a Fase 5 acrescenta é uma tela no `apps/admin` filtrando
-- `action = 'support_access'` — o próprio rastro que o `AuditInterceptor`
-- grava desde a Fase 1 e que ninguém tinha olhado. A policy não filtra por
-- `action`: o WHERE de quem lê já faz isso, e barrar por `action` aqui só
-- adicionaria uma segunda fonte de verdade para o mesmo filtro.
--
-- SÓ LEITURA, DE PROPÓSITO
--
-- Ao contrário das seis tabelas de 004, aqui não existe `WITH CHECK`: a
-- escrita em `audit_logs` continua reservada a `audit_insert()`
-- (SECURITY DEFINER, ver 001, grupo 8), e nenhuma rota de plataforma grava
-- nela diretamente. Abrir o ramo só no `USING` mantém essa garantia — mesmo
-- que alguém, no futuro, esqueça de proteger uma rota de escrita com
-- `@Roles`.
-- =============================================================================

ALTER POLICY tenant_read ON audit_logs
  USING (tenant_id = app_current_tenant() OR app_platform_access());

-- ---------------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------------

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE policyname = 'tenant_read'
     AND tablename  = 'audit_logs'
     AND qual LIKE '%app_platform_access%';

  RAISE NOTICE '005_rls_audit_platform_read: % policy(s) com o ramo de plataforma em audit_logs', n;

  IF n <> 1 THEN
    RAISE EXCEPTION '005_rls_audit_platform_read: esperava a policy tenant_read de audit_logs com app_platform_access, encontrei %', n;
  END IF;
END $$;
