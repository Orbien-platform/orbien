-- =============================================================================
-- 015_rls_event_registrations.sql — RLS das inscrições em evento (PROD-16)
--
-- Roda DEPOIS de 003_rls_admin_write.sql, que define app_congregation_allowed().
-- Fora do histórico do Prisma, como os catorze anteriores.
--
-- Tabela nova (migration `add_event_registrations`), então não há
-- `tenant_isolation` de 001 para derrubar depois — o passo 4 do bootstrap não
-- tem o que fazer aqui. O que importa é ela nascer já com a policy certa: sem
-- isto, `app_user` tem GRANT por ALTER DEFAULT PRIVILEGES e toda igreja leria
-- a lista de inscritos das outras. O portão do passo 7 falha alto se este
-- arquivo não rodar.
--
-- Escopo de CONGREGAÇÃO, não de tenant: a inscrição pertence ao mesmo recorte
-- do `content_posts` que a originou, e um tenant com várias congregações não
-- tem por que expor a lista de presença de uma à outra. Padrão B, o mesmo de
-- 008, 009 e 010.
--
-- AD-001 (.specs/STATE.md): `USING` e `WITH CHECK` dizem a MESMA coisa —
-- divergir é o defeito que a pendência nº 1 documentou (o admin lê a linha e
-- toma 42501 ao gravar).
--
-- FOR ALL, e é de propósito: diferente de `audit_logs`, aqui a escrita é do
-- produto — o membro se inscreve e o organizador cancela, pelas rotas de
-- `content/posts/:id/registrations`. Quem recorta por papel é o `@Roles`; o
-- que esta policy garante é que nenhum papel alcança a congregação alheia.
-- =============================================================================

ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON event_registrations;
CREATE POLICY tenant_congregation_isolation ON event_registrations
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
     AND tablename  = 'event_registrations'
     AND qual LIKE '%app_congregation_allowed%'
     AND with_check IS NOT DISTINCT FROM qual;

  RAISE NOTICE '015_rls_event_registrations: % policy(s) simétrica(s) em event_registrations', n;

  IF n <> 1 THEN
    RAISE EXCEPTION '015_rls_event_registrations: esperava 1 policy tenant_congregation_isolation simétrica em event_registrations, encontrei %', n;
  END IF;
END $$;
