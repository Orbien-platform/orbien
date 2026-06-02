#!/usr/bin/env bash
# migrate-resolve.sh — corrige drift marcando migrations pendentes como aplicadas
#
# Quando usar:
#   `migrate status` mostra migration como "not yet applied" mas a tabela
#   já existe no banco (foi aplicada diretamente via SQL fora do Prisma).
#
# Uso:
#   npm run db:migrate:resolve
#   bash scripts/migrate-resolve.sh

set -euo pipefail

echo ""
echo "▶ Verificando migrations pendentes..."
echo ""

STATUS=$(npx prisma migrate status 2>&1)
echo "$STATUS"
echo ""

# Extrai nomes de migrations não aplicadas
PENDING=$(echo "$STATUS" | grep -oE '[0-9]{14}_[a-z0-9_]+' | sort -u || true)

if [ -z "$PENDING" ]; then
  echo "✓ Nenhum drift detectado. Tudo sincronizado."
  exit 0
fi

echo "Migrations a marcar como aplicadas:"
echo "$PENDING"
echo ""

for MIGRATION in $PENDING; do
  echo "→ Resolvendo: $MIGRATION"
  npx prisma migrate resolve --applied "$MIGRATION" 2>&1
done

echo ""
echo "✓ Drift corrigido. Rodando migrate status para confirmar..."
echo ""
npx prisma migrate status 2>&1
