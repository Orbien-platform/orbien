-- =============================================================================
-- 021_rls_bible_chapter_cache.sql — RLS de `bible_chapter_cache` (AD-005)
-- (biblia-nvi-marcacoes-mobile, BIB-01, BIB-02)
--
-- Roda DEPOIS de 003_rls_admin_write.sql, mesma posição dos demais scripts de
-- tabela nova (junto de 012/014/015/016/018/020). Fora do histórico do
-- Prisma.
--
-- AD-005 (.specs/STATE.md): `bible_chapter_cache` é a primeira tabela do
-- repo que nasce SEM isolamento por tenant/congregação, de propósito — o
-- texto de um capítulo da NVI é o mesmo para toda igreja, não existe
-- "congregação dona" desse dado. Isto NÃO é "tabela sem RLS": a tabela
-- habilita RLS e ganha uma policy explícita `USING (true) WITH CHECK (true)`
-- — visibilidade total é uma escolha registrada e testada
-- (test/rls/bible-chapter-cache.spec.ts), não a ausência de policy que o
-- alerta do pre-push.sh (linhas ~93-110) existe para pegar.
--
-- Tabela nova, então não há `tenant_isolation` de 001 para o passo 4 do
-- bootstrap derrubar depois.
-- =============================================================================

ALTER TABLE bible_chapter_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE bible_chapter_cache FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shared_read_write ON bible_chapter_cache;
CREATE POLICY shared_read_write ON bible_chapter_cache
  AS PERMISSIVE FOR ALL TO app_user
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------------

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE policyname = 'shared_read_write'
     AND tablename  = 'bible_chapter_cache'
     AND qual = 'true'
     AND with_check = 'true';

  RAISE NOTICE '021_rls_bible_chapter_cache: % policy(s) USING(true)/WITH CHECK(true) em bible_chapter_cache', n;

  IF n <> 1 THEN
    RAISE EXCEPTION '021_rls_bible_chapter_cache: esperava 1 policy shared_read_write com USING(true)/WITH CHECK(true) em bible_chapter_cache, encontrei %', n;
  END IF;
END $$;
