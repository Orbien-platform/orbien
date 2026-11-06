-- =============================================================================
-- 036_rls_refresh_lookup.sql — leitura de refresh token por hash exato
-- (PEND-04, `refresh_tokens`, release 1: expandir)
--
-- `refresh_tokens` é a última tabela com `orbien_app_auth ... USING (true)`:
-- login, refresh e logout escrevem nela como `orbien_app`, sem contexto, e por
-- isso a policy deixa a credencial ler, gravar e apagar token de QUALQUER conta.
--
-- O desenho que a fecha tem duas metades:
--
--   1. A LEITURA sem contexto é esta função. O refresh entra com um hash, não
--      com o usuário, então uma policy por `user_account_id` não serve: é
--      preciso saber o dono para fixar o contexto. Um parâmetro exato, no máximo
--      uma linha, e SEM o `token_hash` na resposta.
--   2. A ESCRITA roda numa transação `SET LOCAL ROLE app_user` com `app.user_id`
--      e `app.tenant_id` fixados no dono do token (`withRefreshContext`, em
--      `auth-lookup.ts`). A policy `own_tokens` (001/011) já amarra `app_user`
--      àquele usuário; com o tenant fixado o ramo `app_platform_access()` fica
--      desligado.
--
-- Mesmo molde de 033/034: SECURITY DEFINER (o corpo roda como o dono, que não
-- passa pelo RLS), `search_path` fixo, EXECUTE só para `orbien_app`.
--
-- ESTE SCRIPT SÓ ADICIONA UMA FUNÇÃO. A policy `orbien_app_auth` de
-- `refresh_tokens` continua no 017 — quem a derruba é a release 2 (`037`), num
-- commit/PR à parte, depois desta estar estável em produção. Rodar este script
-- sozinho não muda comportamento nenhum.
-- =============================================================================

CREATE OR REPLACE FUNCTION auth_refresh_lookup(p_token_hash TEXT)
RETURNS TABLE (
  id              TEXT,
  user_account_id TEXT,
  expires_at      TIMESTAMP,
  revoked_at      TIMESTAMP
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT rt.id, rt.user_account_id, rt.expires_at, rt.revoked_at
    FROM refresh_tokens rt
   WHERE rt.token_hash = p_token_hash
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION auth_refresh_lookup(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_refresh_lookup(TEXT) TO orbien_app;
