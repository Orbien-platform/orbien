-- =============================================================================
-- 006_rls_platform_provisioning.sql — Person e FinancialCategory no provisionamento
--
-- Roda DEPOIS de 004 (define app_platform_access()). Fora do histórico do
-- Prisma, como os cinco anteriores.
--
-- O QUE MUDA
--
-- DT-04 (docs/produto/orbien-debitos-tecnicos-v2.md): ao provisionar um tenant
-- novo, `ProvisionTenantService.provision()` passou a criar também o `Person`
-- do admin (para ele aparecer em listagens, poder ser escalado como
-- voluntário e ter histórico de doações) e as 12 categorias financeiras
-- padrão — tudo na mesma transação atômica de sempre, sem tenant fixado no
-- contexto (é assim que `platform_support` provisiona: `app_platform_access()`
-- exige `app_current_tenant() IS NULL`).
--
-- `persons` e `financial_categories` usam `tenant_congregation_isolation`
-- (ver 20260608144811_fix_congregation_isolation_policies e
-- 003_rls_admin_write.sql), não a `tenant_isolation` simples que 004 já abre.
-- Sem esta migration, o INSERT falha com 42501 no meio da transação de
-- provisionamento — depois de já ter criado tenant, plano, branding,
-- congregação, conta admin e papel.
--
-- POR QUE SÓ ESSAS DUAS TABELAS, E NÃO O LOOP DE 003
--
-- `tenant_congregation_isolation` é o nome de policy compartilhado por 22
-- tabelas (ver docs/PENDENCIAS.md, item 1). `003_rls_admin_write.sql` itera
-- por `pg_policies` de propósito, porque a correção dele (alinhar USING e
-- WITH CHECK) vale para todas elas igualmente. Aqui não: abrir o ramo de
-- plataforma é uma abertura de acesso, e só faz sentido nas duas tabelas que
-- o provisionamento de fato escreve. `ALTER POLICY nome ON tabela` identifica
-- a policy pelo par (nome, tabela) — alterar só `persons` e
-- `financial_categories` não toca as outras 20 que compartilham o nome.
--
-- O ALCANCE PRÁTICO
--
-- `app_platform_access()` continua exigindo platform_support (resolvido no
-- banco) SEM tenant fixado. Na prática só `ProvisionTenantService.provision()`
-- cai nesse ramo — qualquer outra rota autenticada roda com tenant fixado
-- (o `TenantContextInterceptor` sempre faz `set_config` de tenant), então o
-- primeiro termo do OR já resolve e o ramo de plataforma nunca é avaliado. Não
-- abre leitura ou escrita de pessoas de tenants já existentes para o suporte.
-- =============================================================================

ALTER POLICY tenant_congregation_isolation ON persons
  USING (
    (tenant_id = app_current_tenant() AND app_congregation_allowed(congregation_id))
    OR app_platform_access()
  )
  WITH CHECK (
    (tenant_id = app_current_tenant() AND app_congregation_allowed(congregation_id))
    OR app_platform_access()
  );

ALTER POLICY tenant_congregation_isolation ON financial_categories
  USING (
    (tenant_id = app_current_tenant() AND app_congregation_allowed(congregation_id))
    OR app_platform_access()
  )
  WITH CHECK (
    (tenant_id = app_current_tenant() AND app_congregation_allowed(congregation_id))
    OR app_platform_access()
  );

-- ---------------------------------------------------------------------------
-- Verificação — mesmo espírito do passo 4 de 004_rls_platform_plane.sql.
-- ---------------------------------------------------------------------------

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE policyname = 'tenant_congregation_isolation'
     AND tablename IN ('persons', 'financial_categories')
     AND qual LIKE '%app_platform_access%'
     AND with_check IS NOT DISTINCT FROM qual;

  RAISE NOTICE '006_rls_platform_provisioning: % policies com o ramo de plataforma', n;

  IF n <> 2 THEN
    RAISE EXCEPTION '006_rls_platform_provisioning: esperava 2 policies simétricas (persons, financial_categories), encontrei %', n;
  END IF;

  -- Nenhuma outra das 22 tabelas de tenant_congregation_isolation pode ter
  -- ganhado o ramo por engano (ex.: rodar 003 depois de 006 sobrescreveria
  -- persons/financial_categories sem app_platform_access — este script não
  -- protege contra isso sozinho, só contra um ALTER POLICY mal direcionado).
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE policyname = 'tenant_congregation_isolation'
     AND tablename NOT IN ('persons', 'financial_categories')
     AND qual LIKE '%app_platform_access%';

  IF n > 0 THEN
    RAISE EXCEPTION '006_rls_platform_provisioning: % tabela(s) fora de persons/financial_categories ganharam o ramo de plataforma por engano', n;
  END IF;
END $$;
