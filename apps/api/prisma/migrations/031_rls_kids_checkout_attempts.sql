-- =============================================================================
-- 031_rls_kids_checkout_attempts.sql — contador de tentativas de código (R3-2)
--
-- Sem tabela nova: a coluna `kids_checkins.checkout_failed_attempts` vem da
-- migration `add_kids_checkout_attempts`, e a RLS dela é a de 029. O que este
-- script cria é a função que incrementa o contador.
--
-- Por que função SECURITY DEFINER: a recusa do check-out responde 403, e a
-- requisição inteira roda numa transação que o 403 desfaz (rollback). Um
-- UPDATE feito dentro dela sumiria junto — justamente quando o contador mais
-- importa. A função é chamada pelo client BASE (`orbien_app`), fora da
-- transação, no mesmo desenho de `audit_insert()` (001) e `pix_webhook_scope()`
-- (024). O UPDATE `coluna = coluna + 1` é atômico: N tentativas simultâneas
-- somam N, sem perda.
--
-- Escopo fechado: a função só toca a linha cujo id, tenant e congregação
-- batem com os argumentos e que ainda está aberta; devolve o novo valor (ou
-- NULL se nada casou). `search_path` fixo é obrigatório em SECURITY DEFINER.
-- `EXECUTE` só para `orbien_app` — `app_user` e PUBLIC não chamam.
--
-- Roda DEPOIS das migrations do Prisma (precisa da coluna), fora do histórico
-- delas, como os demais 0NN.
-- =============================================================================

CREATE OR REPLACE FUNCTION kids_register_checkout_failure(
  p_checkin_id      TEXT,
  p_tenant_id       TEXT,
  p_congregation_id TEXT
)
RETURNS INTEGER
LANGUAGE SQL SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE kids_checkins
     SET checkout_failed_attempts = checkout_failed_attempts + 1
   WHERE id = p_checkin_id
     AND tenant_id = p_tenant_id
     AND congregation_id = p_congregation_id
     AND checked_out_at IS NULL
  RETURNING checkout_failed_attempts;
$$;

REVOKE ALL ON FUNCTION kids_register_checkout_failure(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kids_register_checkout_failure(TEXT, TEXT, TEXT) TO orbien_app;

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace AND ns.nspname = 'public'
   WHERE p.proname = 'kids_register_checkout_failure'
     AND p.prosecdef
     AND p.proconfig IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
     AND has_function_privilege('orbien_app', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('app_user', p.oid, 'EXECUTE');

  RAISE NOTICE '031_rls_kids_checkout_attempts: % função(ões) conforme(s)', n;

  IF n <> 1 THEN
    RAISE EXCEPTION '031_rls_kids_checkout_attempts: esperava kids_register_checkout_failure SECURITY DEFINER, search_path fixo, EXECUTE só para orbien_app; encontrei %', n;
  END IF;
END $$;
