-- =============================================================================
-- limpar-tenant.sql — esvazia os dados operacionais de UM tenant, preservando
-- o que o sistema precisa para continuar funcionando e as contas indicadas.
--
-- NÃO rode este arquivo direto. Use `scripts/limpar-tenant.sh`, que é quem
-- exige o `--aplicar` explícito, confirma o banco alvo e mostra o dry-run
-- antes. Rodar por fora é como chamar `DELETE` sem `WHERE` com mais passos.
--
-- Parâmetros (o wrapper os injeta com `-v`):
--   slug      slug do tenant (ex.: doca-church)
--   emails    e-mails das contas a preservar, separados por vírgula
--   aplicar   'true' apaga; qualquer outra coisa é dry-run (só conta)
--
-- ── O que é preservado ──────────────────────────────────────────────────────
--
-- O tenant continua utilizável depois desta limpeza — essa é a diferença
-- entre "esvaziar" e "dropar". Ficam de pé:
--
--   tenants, tenant_plans, branding_configs  — a igreja, o plano e a marca
--   congregations                            — sem congregação o produto não
--                                              funciona: papel é atribuído
--                                              POR congregação, e toda tabela
--                                              de dado tem congregation_id
--   group_types                              — configuração, não dado
--   financial_categories WHERE is_system     — o plano de contas padrão; sem
--                                              ele o módulo financeiro abre
--                                              sem categoria nenhuma
--   user_accounts / persons / role_assignments das contas listadas em `emails`
--
-- `password_hash` não é tocado em lugar nenhum deste arquivo: quem é
-- preservado entra com a mesma senha de antes.
--
-- ── Como as tabelas são descobertas ─────────────────────────────────────────
--
-- Do catálogo (`information_schema`), não de uma lista escrita à mão: toda
-- tabela com coluna `tenant_id` entra. São 66 tabelas no schema de hoje e a
-- lista cresce a cada migration — uma enumeração manual envelheceria em
-- silêncio, deixando dado para trás justamente na tabela nova.
--
-- ── Ordem de FK ─────────────────────────────────────────────────────────────
--
-- Não há ordenação topológica aqui. O laço tenta apagar todas as tabelas,
-- engole a violação de FK e repete: o que não saiu numa passada sai na
-- seguinte, quando o que dependia dele já foi. Converge em poucas passadas e
-- para de propósito em MAX_PASSES — se sobrar tabela, o script FALHA em vez de
-- fingir que terminou.
-- =============================================================================

\set ON_ERROR_STOP on

SELECT set_config('limpeza.slug', :'slug', false);
SELECT set_config('limpeza.emails', :'emails', false);
SELECT set_config('limpeza.aplicar', :'aplicar', false);

DO $$
DECLARE
  MAX_PASSES  CONSTANT int := 12;

  -- Tabelas preservadas por inteiro.
  keep_whole  CONSTANT text[] := ARRAY[
    'tenants', 'tenant_plans', 'branding_configs', 'congregations', 'group_types'
  ];

  v_slug      text := current_setting('limpeza.slug');
  v_emails    text[] := string_to_array(current_setting('limpeza.emails'), ',');
  v_aplicar   boolean := current_setting('limpeza.aplicar') = 'true';

  -- `text`, não `uuid`: as chaves deste schema são TEXT. O Prisma gera o UUID
  -- na aplicação (`@default(uuid())`) e a coluna nasce `TEXT NOT NULL`.
  -- Declarar como uuid aqui faria o `id <> ALL(...)` estourar por tipo.
  v_tenant    text;
  v_accounts  text[];
  v_persons   text[];
  v_found     text[];
  v_missing   text[];

  v_pending   text[];
  v_next      text[];
  v_table     text;
  v_where     text;
  v_count     bigint;
  v_total     bigint := 0;
  v_pass      int := 0;
BEGIN
  -- ── 1. Tenant ────────────────────────────────────────────────────────────
  SELECT id INTO v_tenant FROM tenants WHERE slug = v_slug;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant com slug "%" não existe neste banco.', v_slug;
  END IF;
  RAISE NOTICE 'tenant % (%)', v_slug, v_tenant;

  -- ── 2. Contas preservadas ────────────────────────────────────────────────
  -- Falhar quando um e-mail da lista não existe é o ponto: um slug trocado ou
  -- um e-mail digitado errado apagaria a igreja inteira sem preservar nada, e
  -- o script não tem como desfazer.
  SELECT array_agg(id), array_agg(email)
    INTO v_accounts, v_found
    FROM user_accounts
   WHERE tenant_id = v_tenant AND email = ANY(v_emails);

  SELECT array_agg(e) INTO v_missing
    FROM unnest(v_emails) AS e
   WHERE e <> ALL(COALESCE(v_found, ARRAY[]::text[]));

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Contas não encontradas no tenant %: %', v_slug, array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(person_id) INTO v_persons
    FROM user_accounts
   WHERE id = ANY(v_accounts) AND person_id IS NOT NULL;

  v_persons := COALESCE(v_persons, ARRAY[]::text[]);
  RAISE NOTICE 'preservando % conta(s): %', array_length(v_accounts, 1), array_to_string(v_found, ', ');

  -- ── 3. Tabelas alvo ──────────────────────────────────────────────────────
  SELECT array_agg(table_name::text ORDER BY table_name)
    INTO v_pending
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND column_name = 'tenant_id'
     AND table_name <> ALL(keep_whole);

  RAISE NOTICE '% tabela(s) com tenant_id a processar', array_length(v_pending, 1);

  -- ── 4. Laço até o ponto fixo ─────────────────────────────────────────────
  WHILE array_length(v_pending, 1) > 0 AND v_pass < MAX_PASSES LOOP
    v_pass := v_pass + 1;
    v_next := ARRAY[]::text[];

    FOREACH v_table IN ARRAY v_pending LOOP
      -- Os recortes por linha. Fora destes, a tabela inteira do tenant sai.
      v_where := CASE v_table
        WHEN 'user_accounts'        THEN format('id <> ALL(%L::text[])', v_accounts)
        WHEN 'persons'              THEN format('id <> ALL(%L::text[])', v_persons)
        WHEN 'role_assignments'     THEN format('user_account_id <> ALL(%L::text[])', v_accounts)
        WHEN 'financial_categories' THEN 'is_system IS NOT TRUE'
        ELSE 'true'
      END;

      BEGIN
        IF v_aplicar THEN
          EXECUTE format('DELETE FROM %I WHERE tenant_id = %L AND (%s)', v_table, v_tenant, v_where);
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSE
          EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id = %L AND (%s)', v_table, v_tenant, v_where)
            INTO v_count;
        END IF;

        IF v_count > 0 THEN
          RAISE NOTICE '  % % → % linha(s)', CASE WHEN v_aplicar THEN 'apagado' ELSE 'apagaria' END, v_table, v_count;
          v_total := v_total + v_count;
        END IF;
      EXCEPTION
        -- Só a violação de FK volta para a próxima passada. Qualquer outro
        -- erro sobe: é bug no script, não ordem de dependência.
        WHEN foreign_key_violation THEN
          v_next := array_append(v_next, v_table);
      END;
    END LOOP;

    -- No dry-run nada é apagado, então nenhuma FK se resolve entre passadas:
    -- o que ficou pendente ficaria pendente para sempre. Uma passada basta.
    EXIT WHEN NOT v_aplicar;
    v_pending := v_next;
  END LOOP;

  IF v_aplicar AND array_length(v_pending, 1) > 0 THEN
    RAISE EXCEPTION 'Não convergiu em % passadas. Restaram: %',
      MAX_PASSES, array_to_string(v_pending, ', ');
  END IF;

  RAISE NOTICE '── total: % linha(s) %', v_total,
    CASE WHEN v_aplicar THEN 'apagadas' ELSE 'seriam apagadas (dry-run)' END;
END $$;
