#!/usr/bin/env bash
# =============================================================================
# remover-tenants-nao-permitidos.sh — apaga POR INTEIRO todo tenant fora da
# lista permitida para uso (docs/AMBIENTES.md §1): doca-church, teste1-church
# e teste2-church. Pensado para a limpeza pré-go-live de tenants de teste
# antigos que sobraram no banco.
#
# Apaga tudo que tem tenant_id desses tenants — pessoas, contas, congregações,
# financeiro, o que for — e por fim a linha de `tenants`. Não preserva nada.
#
# Uso:
#   scripts/remover-tenants-nao-permitidos.sh                # dry-run
#   scripts/remover-tenants-nao-permitidos.sh --aplicar       # apaga de verdade
#
# Sem --aplicar é DRY-RUN: conta o que sairia e não apaga nada. É assim de
# propósito, e é assim que se usa na primeira vez.
#
# Exige DIRECT_URL apontando para o banco alvo (conexão direta, usuário
# postgres — o seed usa a mesma). Não há como desfazer: TIRE BACKUP ANTES.
# =============================================================================
set -euo pipefail

MANTER="doca-church,teste1-church,teste2-church"
APLICAR=false

while [ $# -gt 0 ]; do
  case "$1" in
    --manter)  MANTER="${2:-}"; shift 2 ;;
    --aplicar) APLICAR=true;    shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

[ -n "${DIRECT_URL:-}" ] || { echo "falta DIRECT_URL no ambiente" >&2; exit 2; }

if [ "$MANTER" != "doca-church,teste1-church,teste2-church" ]; then
  echo "AVISO: --manter foge da lista padrão de docs/AMBIENTES.md §1 (doca-church,teste1-church,teste2-church)." >&2
fi

HOST=$(printf '%s' "$DIRECT_URL" | sed -E 's#.*@([^/?]*).*#\1#')

echo "─────────────────────────────────────────────"
echo "  preservar: $MANTER"
echo "  banco:     $HOST"
echo "  modo:      $([ "$APLICAR" = true ] && echo 'APLICAR (apaga de verdade)' || echo 'dry-run (não apaga)')"
echo "─────────────────────────────────────────────"

# A confirmação digitada existe porque o alvo é banco de produção e o erro
# aqui não tem volta. Só no modo --aplicar: o dry-run é livre.
if [ "$APLICAR" = true ]; then
  printf 'Digite REMOVER para confirmar: '
  read -r CONFIRMA
  if [ "$CONFIRMA" != "REMOVER" ]; then
    echo "não confere — abortado." >&2
    exit 1
  fi
fi

psql "$DIRECT_URL" \
  -v ON_ERROR_STOP=1 \
  -v "manter=$MANTER" \
  -v "aplicar=$([ "$APLICAR" = true ] && echo true || echo false)" \
  -f "$(dirname "$0")/sql/remover-tenants-nao-permitidos.sql"

if [ "$APLICAR" = false ]; then
  echo
  echo "Dry-run. Para apagar de verdade, repita com --aplicar (e com backup feito)."
fi
