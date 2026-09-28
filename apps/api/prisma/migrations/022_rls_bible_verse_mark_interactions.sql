-- =============================================================================
-- 022_rls_bible_verse_mark_interactions.sql — RLS das curtidas e respostas
-- das marcações de versículo (feed da Bíblia)
--
-- Roda DEPOIS de 003_rls_admin_write.sql, que define app_congregation_allowed().
-- Fora do histórico do Prisma, como os anteriores.
--
-- Tabelas novas (migration `add_bible_verse_mark_likes_and_replies`), mesmo
-- caso de 020: não há `tenant_isolation` de 001 para derrubar, e o que
-- importa é elas nascerem já com a policy certa — sem isto, `app_user` tem
-- GRANT por ALTER DEFAULT PRIVILEGES e toda igreja leria as curtidas e
-- respostas das outras.
--
-- Escopo de CONGREGAÇÃO, igual à marcação a que pertencem. Cada linha carrega
-- tenant_id+congregation_id próprios (copiados da marcação pelo service) para
-- a policy não depender de JOIN com `bible_verse_marks`.
--
-- `USING` e `WITH CHECK` dizem a MESMA coisa (AD-001). FOR ALL: o autor
-- descurte/apaga a própria resposta, a moderação apaga a de outra pessoa da
-- mesma congregação — quem recorta por papel é o service.
-- =============================================================================

ALTER TABLE bible_verse_mark_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bible_verse_mark_likes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON bible_verse_mark_likes;
CREATE POLICY tenant_congregation_isolation ON bible_verse_mark_likes
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND app_congregation_allowed(congregation_id)
  );

ALTER TABLE bible_verse_mark_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE bible_verse_mark_replies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON bible_verse_mark_replies;
CREATE POLICY tenant_congregation_isolation ON bible_verse_mark_replies
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
     AND tablename IN ('bible_verse_mark_likes', 'bible_verse_mark_replies')
     AND qual LIKE '%app_congregation_allowed%'
     AND with_check IS NOT DISTINCT FROM qual;

  RAISE NOTICE '022_rls_bible_verse_mark_interactions: % policy(s) simétrica(s)', n;

  IF n <> 2 THEN
    RAISE EXCEPTION '022_rls_bible_verse_mark_interactions: esperava 2 policies tenant_congregation_isolation simétricas (likes, replies), encontrei %', n;
  END IF;
END $$;
