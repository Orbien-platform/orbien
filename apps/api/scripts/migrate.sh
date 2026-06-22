#!/usr/bin/env bash
# migrate.sh — substitui `prisma migrate dev` para projetos Supabase
#
# Por que não usar `migrate dev`:
#   migrate dev detecta drift e exige reset do banco para corrigi-lo.
#   Com Supabase (banco remoto compartilhado) reset é inviável.
#   Este script usa migrate diff + migrate deploy, que não têm esse problema.
#
# Uso:
#   npm run db:migrate <nome>      ex: npm run db:migrate add_user_roles
#   bash scripts/migrate.sh <nome>

set -euo pipefail

NAME="${1:?Erro: informe o nome da migration. Ex: npm run db:migrate add_user_roles}"

# Remove espaços e caracteres inválidos
NAME=$(echo "$NAME" | tr ' ' '_' | tr -cd '[:alnum:]_')

TIMESTAMP=$(date +%Y%m%d%H%M%S)
FOLDER="prisma/migrations/${TIMESTAMP}_${NAME}"

echo ""
echo "▶ Gerando SQL da migration..."
mkdir -p "$FOLDER"

npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$FOLDER/migration.sql"

# Se o arquivo ficou vazio ou só com comentários, não há mudanças
if ! grep -qE '^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)' "$FOLDER/migration.sql" 2>/dev/null; then
  echo "✓ Nenhuma alteração no schema detectada."
  rm -rf "$FOLDER"
  exit 0
fi

echo ""
echo "SQL gerado em: $FOLDER/migration.sql"
echo "─────────────────────────────────────"
cat "$FOLDER/migration.sql"
echo "─────────────────────────────────────"
echo ""

echo "▶ Aplicando migration..."
npx prisma migrate deploy 2>&1

echo ""
echo "▶ Regenerando Prisma Client..."
npx prisma generate 2>&1 | grep -E '(Generated|Error|warn)' || true

echo ""
echo "✓ Migration concluída: $FOLDER"
