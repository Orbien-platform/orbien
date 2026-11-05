-- =============================================================================
-- 035_rls_public_tables_close.sql — contrai a ação C do PEND-04
--
-- Derruba `orbien_app_auth ... USING (true) WITH CHECK (true)` de `tenants`,
-- `congregations`, `branding_configs` e `tenant_plans`. Depois deste script,
-- `orbien_app` sem `app.tenant_id` lê 0 linhas das quatro; o que as rotas
-- públicas e o `impersonate` precisam vem das funções de
-- `034_rls_public_lookup.sql`, por slug/token/host/id exato.
--
-- Com `app.tenant_id` fixado (rota pública que já resolveu o tenant, ou o
-- callback OAuth com o `state` assinado), `orbien_app` ainda enxerga o PRÓPRIO
-- tenant: ele herda `app_user` (GRANT ... WITH SET TRUE) e as policies
-- `tenant_isolation`/`public_discovery_read` são `TO app_user`. Não é o
-- `OR true` que sai aqui — é só o acesso sem contexto.
--
-- CONTRAIR — release à parte. Só roda depois de a release que traz 034 e o
-- código que usa as funções (EXPANDIR) estar estável em produção. Derrubar a
-- policy antes disso deixa a doação pública, as células públicas, o QR de
-- visitante, o domínio próprio e a sessão de suporte sem leitura.
--
-- ROLLBACK: reverter o commit que liga este script no `bootstrap-db.sh` (e o
-- trecho de 017 que o acompanha) e redeployar — o 017 antigo recria a policy
-- nas quatro tabelas. Nada de dado se perde; as funções de 034 ficam.
--
-- ORDEM: depois de 034 (as funções precisam existir) e de 017. Fica fora do
-- 017 de propósito: a emenda de 017 que tira a declaração das quatro tabelas
-- e este script formam um par que se reverte junto.
--
-- Idempotente.
-- =============================================================================

DROP POLICY IF EXISTS orbien_app_auth ON tenants;
DROP POLICY IF EXISTS orbien_app_auth ON congregations;
DROP POLICY IF EXISTS orbien_app_auth ON branding_configs;
DROP POLICY IF EXISTS orbien_app_auth ON tenant_plans;

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE policyname = 'orbien_app_auth'
     AND tablename IN ('tenants', 'congregations', 'branding_configs', 'tenant_plans');
  IF n <> 0 THEN
    RAISE EXCEPTION '035: orbien_app_auth ainda existe em % das 4 tabelas publicas', n;
  END IF;
END $$;
