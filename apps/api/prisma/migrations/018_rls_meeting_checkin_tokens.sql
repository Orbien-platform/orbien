-- =============================================================================
-- 018_rls_meeting_checkin_tokens.sql — RLS do check-in de encontro por QR (PROD-12)
--
-- Roda DEPOIS de 003_rls_admin_write.sql, que define app_congregation_allowed().
-- Fora do histórico do Prisma, como os dezessete anteriores.
--
-- Tabela nova (migration `add_meeting_checkin_tokens`), então não há
-- `tenant_isolation` de 001 para o passo 4 do bootstrap derrubar — mesmo caso
-- de 012/014/015/016. O que importa é ela nascer já com a policy certa: sem
-- isto, `app_user` tem GRANT por ALTER DEFAULT PRIVILEGES e toda igreja leria
-- (e giraria) o token de check-in de qualquer outra. O portão do passo 7
-- falha alto se este arquivo não rodar.
--
-- Escopo de CONGREGAÇÃO, não de tenant — Padrão B, o mesmo de
-- 012_rls_group_messages.sql, a policy já usada no módulo de pequenos grupos.
-- O piso aqui é tenant + congregação; quem decide se o token ainda vale
-- (`expires_at`) e se quem escaneia tem `GroupMembership` real na célula do
-- encontro é o `MeetingsService`, não a policy — mesma divisão de
-- responsabilidade que `group_messages` já documenta.
--
-- AD-001 (.specs/STATE.md): `USING` e `WITH CHECK` dizem a MESMA coisa.
-- =============================================================================

ALTER TABLE meeting_checkin_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_checkin_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON meeting_checkin_tokens;
CREATE POLICY tenant_congregation_isolation ON meeting_checkin_tokens
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
     AND tablename  = 'meeting_checkin_tokens'
     AND qual LIKE '%app_congregation_allowed%'
     AND with_check IS NOT DISTINCT FROM qual;

  RAISE NOTICE '018_rls_meeting_checkin_tokens: % policy(s) simétrica(s) em meeting_checkin_tokens', n;

  IF n <> 1 THEN
    RAISE EXCEPTION '018_rls_meeting_checkin_tokens: esperava 1 policy tenant_congregation_isolation simétrica em meeting_checkin_tokens, encontrei %', n;
  END IF;
END $$;
