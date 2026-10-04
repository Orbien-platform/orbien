-- =============================================================================
-- remover-tenants-nao-permitidos.sql — remove POR INTEIRO todo tenant cujo slug
-- não está na lista de permitidos (padrão: doca-church, teste1-church,
-- teste2-church — a mesma lista de docs/AMBIENTES.md §1).
--
-- Diferença para limpar-tenant.sql: aquele esvazia UM tenant e o preserva
-- utilizável; este apaga o tenant inteiro — linha de `tenants` incluída — para
-- quem sobrou de teste antigo fora da lista permitida. Não preserva nada do
-- tenant removido: nenhuma conta, nenhuma congregação, nenhum dado.
--
-- NÃO rode este arquivo direto. Use `scripts/remover-tenants-nao-permitidos.sh`,
-- que exige `--aplicar` explícito, mostra o dry-run antes e confirma o banco.
--
-- Parâmetros (o wrapper os injeta com `-v`):
--   manter    slugs a preservar, separados por vírgula
--   aplicar   'true' apaga; qualquer outra coisa é dry-run (só conta)
--
-- ── Como as tabelas são descobertas ─────────────────────────────────────────
--
-- Do catálogo (`information_schema`), não de uma lista escrita à mão — mesma
-- técnica de limpar-tenant.sql. Toda tabela com coluna `tenant_id` entra; a
-- própria `tenants` é apagada por último, por id, depois que todas as
-- dependentes convergiram a zero.
--
-- ── Ordem de FK ─────────────────────────────────────────────────────────────
--
-- Sem ordenação topológica: o laço tenta apagar todas as tabelas, engole a
-- violação de FK e repete — o que não saiu numa passada sai na seguinte, já
-- sem o que dependia dele. Converge em poucas passadas; se sobrar tabela em
-- MAX_PASSES, o script FALHA em vez de fingir que terminou.
-- =============================================================================

\set ON_ERROR_STOP on

SELECT set_config('remocao.manter', :'manter', false);
SELECT set_config('remocao.aplicar', :'aplicar', false);

DO $$
DECLARE
  MAX_PASSES  CONSTANT int := 12;

  v_manter    text[] := string_to_array(current_setting('remocao.manter'), ',');
  v_aplicar   boolean := current_setting('remocao.aplicar') = 'true';

  v_targets   text[];
  v_slugs     text[];

  v_pending   text[];
  v_next      text[];
  v_table     text;
  v_count     bigint;
  v_total     bigint := 0;
  v_pass      int := 0;
BEGIN
  -- ── 1. Tenants alvo ──────────────────────────────────────────────────────
  SELECT array_agg(id), array_agg(slug)
    INTO v_targets, v_slugs
    FROM tenants
   WHERE slug <> ALL(v_manter);

  IF v_targets IS NULL OR array_length(v_targets, 1) = 0 THEN
    RAISE NOTICE 'nenhum tenant fora de % — nada a fazer.', array_to_string(v_manter, ', ');
    RETURN;
  END IF;

  -- Rede de segurança redundante: se por engano um slug da lista de permitidos
  -- não bater com nenhuma linha (ex.: erro de digitação em --manter), o filtro
  -- acima já os teria excluído do alvo — mas confirma aqui de novo, explícito.
  IF EXISTS (SELECT 1 FROM unnest(v_slugs) s WHERE s = ANY(v_manter)) THEN
    RAISE EXCEPTION 'tenant permitido apareceu na lista de remoção — abortando.';
  END IF;

  RAISE NOTICE '% tenant(s) fora da lista permitida (%): %',
    array_length(v_targets, 1), array_to_string(v_manter, ', '), array_to_string(v_slugs, ', ');

  -- ── 2. Tabelas alvo (tudo com tenant_id) ────────────────────────────────
  SELECT array_agg(table_name::text ORDER BY table_name)
    INTO v_pending
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND column_name = 'tenant_id';

  RAISE NOTICE '% tabela(s) com tenant_id a processar', array_length(v_pending, 1);

  -- ── 3. Laço até o ponto fixo ─────────────────────────────────────────────
  WHILE array_length(v_pending, 1) > 0 AND v_pass < MAX_PASSES LOOP
    v_pass := v_pass + 1;
    v_next := ARRAY[]::text[];

    FOREACH v_table IN ARRAY v_pending LOOP
      BEGIN
        IF v_aplicar THEN
          EXECUTE format('DELETE FROM %I WHERE tenant_id = ANY(%L::text[])', v_table, v_targets);
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSE
          EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id = ANY(%L::text[])', v_table, v_targets)
            INTO v_count;
        END IF;

        IF v_count > 0 THEN
          RAISE NOTICE '  % % → % linha(s)', CASE WHEN v_aplicar THEN 'apagado' ELSE 'apagaria' END, v_table, v_count;
          v_total := v_total + v_count;
        END IF;
      EXCEPTION
        WHEN foreign_key_violation THEN
          v_next := array_append(v_next, v_table);
      END;
    END LOOP;

    EXIT WHEN NOT v_aplicar;
    v_pending := v_next;
  END LOOP;

  IF v_aplicar AND array_length(v_pending, 1) > 0 THEN
    RAISE EXCEPTION 'Não convergiu em % passadas. Restaram: %',
      MAX_PASSES, array_to_string(v_pending, ', ');
  END IF;

  -- ── 4. Os tenants em si ──────────────────────────────────────────────────
  IF v_aplicar THEN
    DELETE FROM tenants WHERE id = ANY(v_targets);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    v_count := array_length(v_targets, 1);
  END IF;
  RAISE NOTICE '  % tenants → % linha(s)', CASE WHEN v_aplicar THEN 'apagado' ELSE 'apagaria' END, v_count;
  v_total := v_total + v_count;

  RAISE NOTICE '── total: % linha(s) %', v_total,
    CASE WHEN v_aplicar THEN 'apagadas' ELSE 'seriam apagadas (dry-run)' END;
END $$;
