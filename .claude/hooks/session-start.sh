#!/bin/bash
# session-start.sh — prepara sessões remotas (Claude Code on the web/CLI) para
# rodar `npm run test:integration -w orbien-backend` e
# `npm run test:rls -w orbien-backend` sem intervenção manual.
#
# Problema que isso resolve: em sessão remota, DATABASE_URL/DIRECT_URL vêm
# configuradas nas env vars do ambiente apontando para o Supabase de
# **produção** (projeto hyoundxedeqvjufbnvae) — rodar as suítes ali escreveria
# em produção. Não há Docker disponível (sem daemon), então
# apps/api/scripts/bootstrap-db.sh, pensado para o Postgres efêmero do CI
# (postgres:17-alpine via services do GitHub Actions), não tinha onde rodar.
#
# Solução: a imagem da sessão remota já traz postgresql-16 nativo (via
# postgresql-common, pg_ctlcluster) — não precisa de Docker nem de projeto
# extra no Supabase. Sobe esse Postgres local e efêmero (dados morrem com o
# container), roda o bootstrap-db.sh nele, e sobrescreve DATABASE_URL/
# DIRECT_URL da sessão para apontar pra ele. Isso é deliberado: sessão remota
# aqui é para automação sem supervisão (ver docs/TESTES.md), então o padrão
# seguro é nunca deixar essas variáveis resolverem para produção depois que
# este hook rodou. Ver docs/TESTES.md, Fase 0, e o cabeçalho do
# bootstrap-db.sh.
set -euo pipefail

# Só faz sentido em sessão remota — numa sessão local o dev já tem seu próprio
# Postgres (ou roda contra o que quiser) e não deve ter isso decidido por ele.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

echo "→ Instalando dependências (raiz, lockfile único)..."
npm install

echo "→ Garantindo Postgres 16 local..."
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  # Rede da sessão permite apt para os pacotes do próprio SO da imagem; isso
  # não é uma chamada a serviço externo do projeto.
  apt-get update -qq
  apt-get install -y -qq postgresql-16
fi

if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  pg_ctlcluster 16 main start
  for _ in $(seq 1 30); do
    pg_isready -h localhost -p 5432 >/dev/null 2>&1 && break
    sleep 1
  done
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER postgres PASSWORD 'ci';" >/dev/null
sudo -u postgres psql -v ON_ERROR_STOP=1 -tc "SELECT 1 FROM pg_database WHERE datname = 'orbien'" \
  | grep -q 1 || sudo -u postgres createdb orbien

# Senha nova a cada sessão — nunca a senha de produção do app_user. O
# bootstrap-db.sh é idempotente: reseta a senha do orbien_app pra essa aqui
# toda vez que o hook roda (inclusive em "resume"), então não há estado velho
# para sincronizar.
ORBIEN_APP_PASSWORD="$(openssl rand -hex 24)"
DIRECT_URL="postgresql://postgres:ci@localhost:5432/orbien"
DATABASE_URL="postgresql://orbien_app:${ORBIEN_APP_PASSWORD}@localhost:5432/orbien"

echo "→ Provisionando schema e RLS no banco local (bootstrap-db.sh)..."
(
  cd apps/api
  ORBIEN_APP_PASSWORD="$ORBIEN_APP_PASSWORD" DIRECT_URL="$DIRECT_URL" bash scripts/bootstrap-db.sh
)

{
  echo "export DIRECT_URL=\"$DIRECT_URL\""
  echo "export DATABASE_URL=\"$DATABASE_URL\""
  echo "export ORBIEN_APP_PASSWORD=\"$ORBIEN_APP_PASSWORD\""
  # AppModule exige JWT_SECRET no boot (suíte integration sobe o app inteiro,
  # e o próprio JwtStrategy usa getOrThrow). Sempre sobrescreve: o hook roda
  # antes de qualquer outra coisa na sessão, então não há nada que já
  # dependa do valor anterior — e deixar "só se não tiver" é frágil, testado
  # e comprovadamente quebra quando a env da sessão não carrega essa
  # variável em particular.
  echo 'export JWT_SECRET="local-session-jwt-secret"'
} >> "$CLAUDE_ENV_FILE"

echo "✓ Postgres local pronto em localhost:5432/orbien — isolado de produção."
