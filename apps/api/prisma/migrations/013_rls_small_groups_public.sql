-- =============================================================================
-- 013_rls_small_groups_public.sql — leitura pública de células (PROD-13)
--
-- Roda DEPOIS de 003_rls_admin_write.sql, como 007–010 e 012: as três tabelas aqui
-- já têm `tenant_congregation_isolation`, e este arquivo NÃO a toca — só
-- acrescenta um segundo caminho, estreito, para o plano público.
--
-- O PROBLEMA: "Encontre uma célula" é uma página sem login. Não há JWT, logo
-- o TenantContextInterceptor não roda e o serviço fixa só `app.tenant_id`,
-- resolvido no servidor a partir do slug da igreja (mesmo padrão do cadastro
-- de visitante por QR, que fixa o contexto a partir do token). Sem
-- congregação no contexto, `app_congregation_allowed()` devolve false para
-- toda linha e a listagem pública sai vazia — a mesma falha silenciosa que o
-- cabeçalho de 001 descreve. E a tela é justamente a que precisa cruzar
-- congregações: quem procura célula procura por bairro, não por campus.
--
-- AS POLICIES: todas `FOR SELECT`, nunca ALL — o plano público lê e não
-- escreve nenhuma das três. Em todas, duas condições se repetem:
--
--   tenant_id = app_current_tenant()  → a igreja é a do slug pedido, e o slug
--     é resolvido no servidor; o visitante não escolhe tenant_id nenhum.
--   app_current_user() IS NULL        → o ramo só existe FORA de sessão
--     autenticada. Toda requisição com JWT passa pelo interceptor, que fixa
--     `app.user_id`; então estas policies são inalcançáveis de dentro do
--     produto e não afrouxam em nada o isolamento por congregação de quem
--     está logado.
--
-- Policies PERMISSIVE se combinam com OR: para o usuário autenticado o
-- resultado continua sendo exatamente `tenant_congregation_isolation`.
--
-- `group_types` e `congregations` entram porque a listagem os traz junto (o
-- tipo é o filtro da tela; a congregação é o campus que aparece no card), e
-- porque sem eles a consulta do Prisma estoura — relação obrigatória que a
-- policy esconde volta como `null` e vira erro, não lista vazia. As duas são
-- recortadas pela própria célula pública: tipo que nenhuma célula pública usa,
-- e congregação que não tem célula pública, seguem invisíveis. `congregations`
-- também é alcançável pela policy `orbien_app_auth ... USING (true)`, que
-- existe para login e bootstrap; não é nela que esta tela se apoia — o ramo
-- abaixo diz, no próprio banco, o que a página pode ver.
-- =============================================================================

DROP POLICY IF EXISTS public_discovery_read ON small_groups;
CREATE POLICY public_discovery_read ON small_groups
  AS PERMISSIVE FOR SELECT TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND is_public
    AND app_current_user() IS NULL
  );

DROP POLICY IF EXISTS public_discovery_read ON group_types;
CREATE POLICY public_discovery_read ON group_types
  AS PERMISSIVE FOR SELECT TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND app_current_user() IS NULL
    AND id IN (
      SELECT sg.group_type_id
      FROM small_groups sg
      WHERE sg.tenant_id = app_current_tenant()
        AND sg.is_public
    )
  );

DROP POLICY IF EXISTS public_discovery_read ON congregations;
CREATE POLICY public_discovery_read ON congregations
  AS PERMISSIVE FOR SELECT TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND app_current_user() IS NULL
    AND id IN (
      SELECT sg.congregation_id
      FROM small_groups sg
      WHERE sg.tenant_id = app_current_tenant()
        AND sg.is_public
    )
  );
