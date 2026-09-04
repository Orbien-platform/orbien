#!/usr/bin/env bash
# bootstrap-db.sh — provisiona um banco Orbien do zero.
#
# Reproduz os passos que antes eram manuais no dashboard do Supabase:
# schema, scripts de RLS e o role de aplicação `orbien_app`.
#
# Uso:
#   DIRECT_URL=postgresql://postgres:...@host:5432/postgres \
#   ORBIEN_APP_PASSWORD='<senha>' \
#   bash scripts/bootstrap-db.sh [--seed]
#
# DIRECT_URL precisa ser a conexão direta (porta 5432) com um role capaz de
# criar roles — no Supabase, `postgres`. O pooler (6543) não serve aqui.
#
# É idempotente: pode rodar de novo num banco já provisionado.

set -euo pipefail
cd "$(dirname "$0")/.."

: "${DIRECT_URL:?Erro: defina DIRECT_URL (conexão direta, porta 5432)}"
: "${ORBIEN_APP_PASSWORD:?Erro: defina ORBIEN_APP_PASSWORD}"

SEED=false
[ "${1:-}" = "--seed" ] && SEED=true

run_sql_file() {
  echo "  → $1"
  npx --yes prisma db execute --url "$DIRECT_URL" --file "$1"
}

run_sql() {
  npx --yes prisma db execute --url "$DIRECT_URL" --stdin
}

echo ""
echo "▶ 1/8 Criando roles base..."
# Precisa vir ANTES do migrate deploy: a migration fix_rls_enforcement faz
# GRANT app_user TO postgres e falha se o role ainda nao existe. Num banco
# novo, 001_rls_setup.sql (que tambem cria os roles) so roda depois das
# tabelas existirem — dai a duplicacao proposital aqui.
run_sql <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'orbien_app') THEN
    CREATE ROLE orbien_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
SQL

echo ""
echo "▶ 2/8 Aplicando migrations do Prisma..."
DATABASE_URL="$DIRECT_URL" npx --yes prisma migrate deploy

echo ""
echo "▶ 3/8 Aplicando scripts de RLS (fora do histórico do Prisma)..."
run_sql_file prisma/migrations/001_rls_setup.sql
if [ -f prisma/migrations/002_rls_celebration_schedules.sql ]; then
  run_sql_file prisma/migrations/002_rls_celebration_schedules.sql
fi
# Precisa vir depois de 001 e 002: alinha o WITH CHECK ao USING em todas as
# policies tenant_congregation_isolation que os dois criaram, e tira a
# cláusula do papel inexistente denomination_admin. Ver o cabeçalho do arquivo.
if [ -f prisma/migrations/003_rls_admin_write.sql ]; then
  run_sql_file prisma/migrations/003_rls_admin_write.sql
fi

# Ordem invertida em relação à história do projeto: aqui as migrations rodam
# ANTES do 001 (que precisa das tabelas existindo), mas a migration
# fix_congregation_isolation_policies faz DROP da tenant_isolation e cria a
# tenant_congregation_isolation no lugar. Rodando o 001 depois, a policy fraca
# volta por cima da forte — e policies PERMISSIVE se combinam com OR, então a
# fraca ganha e o isolamento por congregação se perde. Restauramos o estado
# final correto: onde existe a de congregação, a de tenant sai.
echo ""
echo "▶ 4/8 Removendo policies redundantes de tenant onde há isolamento por congregação..."
run_sql <<'SQL'
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT c.relname
      FROM pg_class c
      JOIN pg_policy p ON p.polrelid = c.oid
      JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
     WHERE p.polname = 'tenant_congregation_isolation'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policy p2 JOIN pg_class c2 ON c2.oid = p2.polrelid
       WHERE c2.relname = r.relname AND p2.polname = 'tenant_isolation'
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', r.relname);
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'policies de tenant removidas: %', n;
END $$;
SQL

echo ""
echo "▶ 5/8 Abrindo o plano de plataforma (004)..."
# Precisa vir depois do passo 4: ele faz ALTER POLICY em `tenant_isolation`, e
# o passo 4 é quem decide se essa policy sobrevive em cada tabela. Nas seis
# tabelas que 004 toca não há isolamento por congregação, então ela sobrevive
# — mas rodar antes tornaria isso uma coincidência em vez de uma ordem.
if [ -f prisma/migrations/004_rls_platform_plane.sql ]; then
  run_sql_file prisma/migrations/004_rls_platform_plane.sql
fi
# Depende de app_platform_access(), criada em 004 — por isso vem depois, não
# junto do passo 5.
if [ -f prisma/migrations/005_rls_audit_platform_read.sql ]; then
  run_sql_file prisma/migrations/005_rls_audit_platform_read.sql
fi

echo ""
echo "▶ 6/8 Configurando o role de aplicação orbien_app..."
# orbien_app é criado NOLOGIN pelas migrations; aqui ele ganha senha e os
# privilégios de app_user. WITH SET TRUE permite o `SET LOCAL ROLE app_user`
# que o backend usa para forçar a avaliação das políticas de RLS.
run_sql <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'orbien_app') THEN
    CREATE ROLE orbien_app NOLOGIN NOBYPASSRLS;
  END IF;
END \$\$;

ALTER ROLE orbien_app LOGIN PASSWORD '${ORBIEN_APP_PASSWORD}';
GRANT app_user TO orbien_app WITH SET TRUE;
GRANT USAGE ON SCHEMA public TO orbien_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO orbien_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO orbien_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO orbien_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO orbien_app;
SQL

echo ""
echo "▶ 7/8 Verificando..."
run_sql <<'SQL'
DO $$
DECLARE
  n_tables  int;
  can_login bool;
  has_role  bool;
  n         int;
BEGIN
  SELECT count(*) INTO n_tables
    FROM information_schema.tables WHERE table_schema = 'public';
  SELECT rolcanlogin INTO can_login FROM pg_roles WHERE rolname = 'orbien_app';
  SELECT EXISTS (
    SELECT 1 FROM pg_auth_members m
    JOIN pg_roles r ON r.oid = m.roleid
    JOIN pg_roles g ON g.oid = m.member
    WHERE r.rolname = 'app_user' AND g.rolname = 'orbien_app'
  ) INTO has_role;

  RAISE NOTICE 'tabelas em public: %', n_tables;
  RAISE NOTICE 'orbien_app pode logar: %', can_login;
  RAISE NOTICE 'orbien_app herda app_user: %', has_role;

  IF n_tables = 0 THEN RAISE EXCEPTION 'nenhuma tabela criada'; END IF;
  IF NOT can_login THEN RAISE EXCEPTION 'orbien_app sem LOGIN'; END IF;
  IF NOT has_role THEN RAISE EXCEPTION 'orbien_app nao herda app_user'; END IF;

  -- Se uma tabela ficar com tenant_isolation E tenant_congregation_isolation,
  -- as duas combinam com OR e a fraca vence: o isolamento por congregação
  -- deixa de valer sem nada falhar. Falhar alto aqui é o que impede isso de
  -- passar em silêncio.
  SELECT count(*) INTO n FROM (
    SELECT c.relname
      FROM pg_class c
      JOIN pg_policy p ON p.polrelid = c.oid
      JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
     WHERE p.polname IN ('tenant_isolation', 'tenant_congregation_isolation')
     GROUP BY c.relname
    HAVING count(DISTINCT p.polname) = 2
  ) dup;
  RAISE NOTICE 'tabelas com policy de tenant sombreando a de congregacao: %', n;
  IF n > 0 THEN
    RAISE EXCEPTION 'ha % tabela(s) onde tenant_isolation anula o isolamento por congregacao', n;
  END IF;

  -- Leitura e escrita tem que dizer a mesma coisa. Enquanto o USING abria
  -- excecao para tenant_admin e o WITH CHECK nao, o admin lia a linha de outra
  -- congregacao e falhava ao gravar com 42501 — sintoma confuso, causa
  -- invisivel. Ver prisma/migrations/003_rls_admin_write.sql.
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE policyname = 'tenant_congregation_isolation'
     AND (with_check IS DISTINCT FROM qual);
  RAISE NOTICE 'policies de congregacao com USING != WITH CHECK: %', n;
  IF n > 0 THEN
    RAISE EXCEPTION 'ha % policy(s) tenant_congregation_isolation onde a escrita nao acompanha a leitura', n;
  END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE qual LIKE '%denomination_admin%' OR with_check LIKE '%denomination_admin%';
  IF n > 0 THEN
    RAISE EXCEPTION 'ha % policy(s) citando denomination_admin, papel que nao existe na tabela roles', n;
  END IF;

  -- O TenantContextInterceptor faz `SET LOCAL ROLE app_user` em toda
  -- requisicao autenticada. Sem ADMIN/SET option no GRANT acima, essa linha
  -- falha com 42501 e a API inteira para. Falhar aqui e' barato; descobrir em
  -- producao, nao.
  SELECT count(*) INTO n
    FROM pg_auth_members m
    JOIN pg_roles r ON r.oid = m.roleid
    JOIN pg_roles g ON g.oid = m.member
   WHERE r.rolname = 'app_user' AND g.rolname = 'orbien_app' AND m.set_option;
  RAISE NOTICE 'orbien_app pode SET ROLE app_user: %', n > 0;
  IF n = 0 THEN
    RAISE EXCEPTION 'orbien_app nao pode SET ROLE app_user (falta WITH SET TRUE no GRANT)';
  END IF;

  -- O ramo de plataforma tem que existir nas seis tabelas, e nos dois lados.
  -- Se 004 nao rodou, o suporte le lista vazia sem erro nenhum.
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE policyname = 'tenant_isolation'
     AND tablename IN ('tenants', 'tenant_plans', 'branding_configs',
                       'congregations', 'user_accounts', 'role_assignments')
     AND qual LIKE '%app_platform_access%'
     AND with_check IS NOT DISTINCT FROM qual;
  RAISE NOTICE 'policies com o ramo de plataforma: %', n;
  IF n <> 6 THEN
    RAISE EXCEPTION 'esperava 6 policies com app_platform_access simetrico, encontrei % — 004_rls_platform_plane.sql rodou?', n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
     WHERE c.relname = 'waitlist_subscribers' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'waitlist_subscribers sem RLS habilitado';
  END IF;

  -- 005: sem isto a tela de auditoria da Fase 5 lê lista vazia em silêncio,
  -- o mesmo sintoma que a checagem acima cobre para as seis tabelas de 004.
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE policyname = 'tenant_read'
     AND tablename  = 'audit_logs'
     AND qual LIKE '%app_platform_access%';
  RAISE NOTICE 'audit_logs com o ramo de plataforma: %', n;
  IF n <> 1 THEN
    RAISE EXCEPTION 'audit_logs sem o ramo de plataforma na policy tenant_read — 005_rls_audit_platform_read.sql rodou?';
  END IF;
END $$;
SQL

echo ""
if [ "$SEED" = true ]; then
  echo "▶ 8/8 Populando com dados de seed..."
  DATABASE_URL="$DIRECT_URL" npx --yes ts-node prisma/seed.ts
else
  echo "▶ 8/8 Seed pulado (rode com --seed para popular)."
fi

echo ""
echo "✓ Banco provisionado."
echo ""
echo "Agora aponte as variáveis para ele:"
echo "  DATABASE_URL → pooler (6543), usuário orbien_app"
echo "  DIRECT_URL   → conexão direta (5432), usuário postgres"
