-- =============================================================================
-- 024_rls_pix_webhook_scope.sql — `pix_webhook_scope()` (doação pública Premium)
--
-- O webhook da Asaas (`POST /financial/pix/webhook`) é rota pública: roda como
-- `orbien_app`, sem `app.tenant_id`. `pix_payments`, `pix_subscriptions` e
-- `financial_transactions` só aparecem para quem tem contexto de tenant e
-- congregação (policy `tenant_congregation_isolation`, `TO app_user`), então
-- `PixService.handleWebhook` achava 0 linhas e respondia 200 "recebido" sem
-- confirmar nada — dinheiro pago, nenhum lançamento, nenhum erro à vista.
--
-- O webhook só conhece o id do pagamento (ou da assinatura) na Asaas. Esta
-- função é o único caminho de "id da Asaas → escopo" que existe sem contexto:
-- SECURITY DEFINER (mesmo padrão de `audit_insert()` e `resolve_actor_name()`,
-- AD-004) devolve SÓ `tenant_id` e `congregation_id` — nunca a linha. Com o
-- escopo, o service abre a transação, fixa `app.tenant_id`/`app.congregation_id`
-- e todo o resto roda sob a RLS normal.
--
-- Sem policy nova: nenhuma policy de `pix_payments` é tocada, então `USING` e
-- `WITH CHECK` continuam dizendo a mesma coisa.
--
-- `search_path` fixo é obrigatório em SECURITY DEFINER (impede sequestro por
-- objeto homônimo em schema anterior no caminho). `EXECUTE` só para
-- `orbien_app` — `app_user` e PUBLIC não chamam: requisição autenticada não
-- precisa resolver escopo por id da Asaas.
--
-- Roda DEPOIS das migrations do Prisma (precisa das tabelas), fora do
-- histórico delas, como os demais 0NN.
-- =============================================================================

CREATE OR REPLACE FUNCTION pix_webhook_scope(
  p_asaas_payment_id      TEXT,
  p_asaas_subscription_id TEXT DEFAULT NULL
)
RETURNS TABLE (scope_tenant_id TEXT, scope_congregation_id TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.tenant_id, s.congregation_id
    FROM (
      SELECT pp.tenant_id, pp.congregation_id, 1 AS prio
        FROM pix_payments pp
       WHERE pp.asaas_payment_id = p_asaas_payment_id
      UNION ALL
      SELECT ps.tenant_id, ps.congregation_id, 2 AS prio
        FROM pix_subscriptions ps
       WHERE p_asaas_subscription_id IS NOT NULL
         AND ps.asaas_subscription_id = p_asaas_subscription_id
    ) s
   ORDER BY s.prio
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION pix_webhook_scope(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pix_webhook_scope(TEXT, TEXT) TO orbien_app;

-- ---------------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------------

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace AND ns.nspname = 'public'
   WHERE p.proname = 'pix_webhook_scope'
     AND p.prosecdef
     AND p.proconfig IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
     AND has_function_privilege('orbien_app', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('app_user', p.oid, 'EXECUTE');

  RAISE NOTICE '024_rls_pix_webhook_scope: % função(ões) pix_webhook_scope conforme', n;

  IF n <> 1 THEN
    RAISE EXCEPTION '024_rls_pix_webhook_scope: esperava pix_webhook_scope SECURITY DEFINER, com search_path fixo, EXECUTE só para orbien_app; encontrei %', n;
  END IF;
END $$;
