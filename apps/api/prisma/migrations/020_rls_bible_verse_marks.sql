-- =============================================================================
-- 020_rls_bible_verse_marks.sql — RLS das marcações de versículo da NVI
-- (biblia-nvi-marcacoes-mobile, BIB-07)
--
-- Roda DEPOIS de 003_rls_admin_write.sql, que define app_congregation_allowed().
-- Fora do histórico do Prisma, como os dezenove anteriores.
--
-- Tabela nova (migration `add_bible_verse_marks_and_cache`), então não há
-- `tenant_isolation` de 001 para derrubar depois — o passo 4 do bootstrap não
-- tem o que fazer aqui. O que importa é ela nascer já com a policy certa: sem
-- isto, `app_user` tem GRANT por ALTER DEFAULT PRIVILEGES e toda igreja leria
-- as marcações das outras.
--
-- Escopo de CONGREGAÇÃO, não de tenant: uma marcação é conteúdo da
-- congregação que a criou, mesmo padrão de `prayer_requests`/`group_messages`.
--
-- AD-001 (.specs/STATE.md): `USING` e `WITH CHECK` dizem a MESMA coisa —
-- divergir é o defeito que a pendência nº 1 documentou (o admin lê a linha e
-- toma 42501 ao gravar).
--
-- FOR ALL, e é de propósito: o próprio autor edita/apaga (soft delete) sua
-- marcação, e um moderador (`admin_congregation`/`pastor`/`tenant_admin`)
-- apaga a de outra pessoa da mesma congregação. Quem recorta por papel é o
-- `@Roles` e o service; o que esta policy garante é que nenhum papel alcança
-- a congregação alheia.
-- =============================================================================

ALTER TABLE bible_verse_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bible_verse_marks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_congregation_isolation ON bible_verse_marks;
CREATE POLICY tenant_congregation_isolation ON bible_verse_marks
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
     AND tablename  = 'bible_verse_marks'
     AND qual LIKE '%app_congregation_allowed%'
     AND with_check IS NOT DISTINCT FROM qual;

  RAISE NOTICE '020_rls_bible_verse_marks: % policy(s) simétrica(s) em bible_verse_marks', n;

  IF n <> 1 THEN
    RAISE EXCEPTION '020_rls_bible_verse_marks: esperava 1 policy tenant_congregation_isolation simétrica em bible_verse_marks, encontrei %', n;
  END IF;
END $$;
