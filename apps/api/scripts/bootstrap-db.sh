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
echo "▶ 1/6 Criando roles base..."
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
echo "▶ 2/6 Aplicando migrations do Prisma..."
DATABASE_URL="$DIRECT_URL" npx --yes prisma migrate deploy

echo ""
echo "▶ 3/6 Aplicando scripts de RLS (fora do histórico do Prisma)..."
run_sql_file prisma/migrations/001_rls_setup.sql
if [ -f prisma/migrations/002_rls_celebration_schedules.sql ]; then
  run_sql_file prisma/migrations/002_rls_celebration_schedules.sql
fi

echo ""
echo "▶ 4/6 Configurando o role de aplicação orbien_app..."
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
echo "▶ 5/6 Verificando..."
run_sql <<'SQL'
DO $$
DECLARE
  n_tables  int;
  can_login bool;
  has_role  bool;
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
END $$;
SQL

echo ""
if [ "$SEED" = true ]; then
  echo "▶ 6/6 Populando com dados de seed..."
  DATABASE_URL="$DIRECT_URL" npx --yes ts-node prisma/seed.ts
else
  echo "▶ 6/6 Seed pulado (rode com --seed para popular)."
fi

echo ""
echo "✓ Banco provisionado."
echo ""
echo "Agora aponte as variáveis para ele:"
echo "  DATABASE_URL → pooler (6543), usuário orbien_app"
echo "  DIRECT_URL   → conexão direta (5432), usuário postgres"
