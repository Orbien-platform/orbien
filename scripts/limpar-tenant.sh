#!/usr/bin/env bash
# =============================================================================
# limpar-tenant.sh — esvazia os dados operacionais de um tenant.
#
# Preserva o tenant, o plano, a marca, as congregações, os tipos de grupo, o
# plano de contas de sistema e as contas indicadas em --manter (com a pessoa,
# os papéis e a MESMA senha). Apaga o resto: pessoas, células, financeiro,
# celebrações, escalas, posts, eventos, auditoria — tudo que tem tenant_id.
#
# Uso:
#   scripts/limpar-tenant.sh --slug doca-church \
#     --manter fvargaspf@gmail.com,oldenburgjohnny@gmail.com
#
# Sem --aplicar é DRY-RUN: conta o que sairia e não apaga nada. É assim de
# propósito, e é assim que se usa na primeira vez.
#
# Exige DIRECT_URL apontando para o banco alvo (conexão direta, usuário
# postgres — o seed usa a mesma). Não há como desfazer: TIRE BACKUP ANTES.
# =============================================================================
set -euo pipefail

SLUG=""
MANTER=""
APLICAR=false

while [ $# -gt 0 ]; do
  case "$1" in
    --slug)    SLUG="${2:-}";   shift 2 ;;
    --manter)  MANTER="${2:-}"; shift 2 ;;
    --aplicar) APLICAR=true;    shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

[ -n "$SLUG" ]   || { echo "falta --slug" >&2; exit 2; }
[ -n "$MANTER" ] || { echo "falta --manter (e-mails separados por vírgula)" >&2; exit 2; }
[ -n "${DIRECT_URL:-}" ] || { echo "falta DIRECT_URL no ambiente" >&2; exit 2; }

HOST=$(printf '%s' "$DIRECT_URL" | sed -E 's#.*@([^/?]*).*#\1#')

echo "─────────────────────────────────────────────"
echo "  tenant:    $SLUG"
echo "  preservar: $MANTER"
echo "  banco:     $HOST"
echo "  modo:      $([ "$APLICAR" = true ] && echo 'APLICAR (apaga de verdade)' || echo 'dry-run (não apaga)')"
echo "─────────────────────────────────────────────"

# A confirmação digitada existe porque o alvo é banco de produção e o erro
# aqui não tem volta. Só no modo --aplicar: o dry-run é livre.
if [ "$APLICAR" = true ]; then
  printf 'Digite o slug do tenant para confirmar: '
  read -r CONFIRMA
  if [ "$CONFIRMA" != "$SLUG" ]; then
    echo "não confere — abortado." >&2
    exit 1
  fi
fi

psql "$DIRECT_URL" \
  -v ON_ERROR_STOP=1 \
  -v "slug=$SLUG" \
  -v "emails=$MANTER" \
  -v "aplicar=$([ "$APLICAR" = true ] && echo true || echo false)" \
  -f "$(dirname "$0")/sql/limpar-tenant.sql"

if [ "$APLICAR" = false ]; then
  echo
  echo "Dry-run. Para apagar de verdade, repita com --aplicar (e com backup feito)."
fi
