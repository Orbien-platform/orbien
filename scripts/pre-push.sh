#!/usr/bin/env bash
#
# Portão antes de subir para o remoto.
#
# No modelo trunk-based, o CI dispara depois do push — ele detecta, não impede.
# Este script é o portão que falta: roda o que o CI rodaria, mais as checagens
# específicas do Orbien que dão para verificar por script, e falha antes de o
# commit sair da máquina.
#
#   bash scripts/pre-push.sh              # portão determinístico
#   bash scripts/pre-push.sh --e2e        # inclui a suíte de tela (mais lento)
#   bash scripts/pre-push.sh --review     # inclui revisão por IA, com veredito
#
# Racional e alternativas: docs/CI.md

set -uo pipefail
cd "$(dirname "$0")/.."

WITH_E2E=false
WITH_REVIEW=false
for arg in "$@"; do
  case "$arg" in
    --e2e) WITH_E2E=true ;;
    --review) WITH_REVIEW=true ;;
    *) echo "argumento desconhecido: $arg"; exit 2 ;;
  esac
done

BLOCKS=()
WARNS=()
bloqueia() { BLOCKS+=("$1"); echo "  ✗ $1"; }
alerta()   { WARNS+=("$1");  echo "  ! $1"; }
passa()    { echo "  ✓ $1"; }

# Base de comparação: o que ainda não está no remoto.
BASE=$(git rev-parse --verify --quiet origin/main || echo "")
if [ -z "$BASE" ]; then
  echo "origin/main não encontrado — rode 'git fetch origin' primeiro."; exit 2
fi
CHANGED=$(git diff --name-only "$BASE"...HEAD)
if [ -z "$CHANGED" ]; then
  echo "Nada a subir em relação a origin/main."; exit 0
fi

echo "Arquivos alterados: $(echo "$CHANGED" | wc -l | tr -d ' ')"
toca() { echo "$CHANGED" | grep -qE "$1"; }

# ── Checagens do Orbien que dão para verificar por script ─────────────────
echo
echo "▶ Regras do monorepo"

# Import cruzando app quebra a independência dos deploys — inequívoco.
if grep -rnE "from ['\"].*apps/(api|web|site)/" apps/*/src 2>/dev/null | grep -v "^apps/\([a-z]*\)/src.*apps/\1/" | head -3 | grep -q .; then
  bloqueia "import cruzando app — os deploys precisam ser independentes"
  grep -rnE "from ['\"].*apps/(api|web|site)/" apps/*/src 2>/dev/null | head -3 | sed 's/^/      /'
else
  passa "nenhum import cruzando app"
fi

# A raiz é a única fonte de lockfile.
if echo "$CHANGED" | grep -qE "^apps/[^/]+/package-lock\.json$"; then
  bloqueia "package-lock.json dentro de apps/ — o lockfile vive só na raiz"
else
  passa "lockfile só na raiz"
fi

echo
echo "▶ Banco e isolamento"

MIGS=$(echo "$CHANGED" | grep -E "^apps/api/prisma/migrations/.*\.sql$" || true)
SCHEMA_CHANGED=$(echo "$CHANGED" | grep -cE "^apps/api/prisma/schema\.prisma$" || true)

if [ "$SCHEMA_CHANGED" != "0" ] && [ -z "$MIGS" ]; then
  alerta "schema.prisma mudou sem migration nova — schema e banco vão divergir"
elif [ -n "$MIGS" ] && [ "$SCHEMA_CHANGED" = "0" ]; then
  alerta "migration nova sem mudança no schema.prisma — confirme se é intencional"
elif [ -n "$MIGS" ]; then
  passa "migration e schema mudaram juntos"
fi

# Tabela nova exige RLS e teste de isolamento. Alerta, não bloqueio: o RLS pode
# estar nos scripts manuais (001/002), que são arquivos separados.
if [ -n "$MIGS" ]; then
  NOVAS=$(grep -hoE 'CREATE TABLE (IF NOT EXISTS )?"?[a-z_]+"?' $MIGS 2>/dev/null \
          | grep -oE '"[a-z_]+"|[a-z_]+$' | tr -d '"' | sort -u | grep -vE '^(CREATE|TABLE|IF|NOT|EXISTS)$' || true)
  for t in $NOVAS; do
    grep -qE "ALTER TABLE \"?$t\"? ENABLE ROW LEVEL SECURITY" $MIGS apps/api/prisma/migrations/00*.sql 2>/dev/null \
      || alerta "tabela '$t' criada sem ENABLE ROW LEVEL SECURITY em nenhum script"
    grep -q "$t" apps/api/test/rls/isolation.spec.ts 2>/dev/null \
      || alerta "tabela '$t' sem caso em test/rls/isolation.spec.ts — policy existir não prova que isola"
  done
  [ -z "$NOVAS" ] && passa "nenhuma tabela nova"

  # CREATE POLICY sem DROP antes quebra reexecução do script.
  if grep -hE "^CREATE POLICY" $MIGS 2>/dev/null | grep -q . ; then
    for f in $MIGS; do
      np=$(grep -cE "^CREATE POLICY" "$f" || true)
      nd=$(grep -cE "^DROP POLICY IF EXISTS" "$f" || true)
      [ "$np" -gt "$nd" ] && alerta "$f: $np CREATE POLICY para $nd DROP POLICY IF EXISTS — reexecução vai falhar"
    done
  fi
fi

# ── Portões determinísticos ───────────────────────────────────────────────
echo
echo "▶ Build, tipos e lint"
npx turbo run build >/tmp/prepush-build.log 2>&1 && passa "build dos 3 apps" \
  || { bloqueia "build falhou — veja /tmp/prepush-build.log"; tail -15 /tmp/prepush-build.log | sed 's/^/      /'; }
npx tsc --noEmit -p apps/api/tsconfig.json >/tmp/prepush-tsc.log 2>&1 && passa "tipos da API, incluindo test/" \
  || { bloqueia "tsc falhou — veja /tmp/prepush-tsc.log"; head -10 /tmp/prepush-tsc.log | sed 's/^/      /'; }
npx turbo run lint >/tmp/prepush-lint.log 2>&1 && passa "lint" \
  || { bloqueia "lint falhou — veja /tmp/prepush-lint.log"; grep -E "problems|error" /tmp/prepush-lint.log | tail -8 | sed 's/^/      /'; }
node scripts/check-skills.mjs >/dev/null 2>&1 && passa "skills consistentes" \
  || bloqueia "skills inconsistentes — rode 'node scripts/check-skills.mjs'"

if toca "^apps/api/(src|prisma)/"; then
  echo
  echo "▶ Isolamento multi-tenant (o diff toca a API)"
  echo "  … a suíte leva ~2,5 min contra o Supabase"
  npm run test:rls -w orbien-backend >/tmp/prepush-rls.log 2>&1 && passa "39 testes de RLS" \
    || { bloqueia "testes de RLS falharam — veja /tmp/prepush-rls.log"; grep -E "✕|SECURITY GAP|Tests:" /tmp/prepush-rls.log | tail -6 | sed 's/^/      /'; }
fi

if [ "$WITH_E2E" = true ] && toca "^apps/web/src/"; then
  echo
  echo "▶ E2E (--e2e, e o diff toca tela)"
  npm run e2e -w orbien-web >/tmp/prepush-e2e.log 2>&1 && passa "suíte de tela" \
    || { bloqueia "e2e falhou — veja /tmp/prepush-e2e.log"; grep -E "✘|passed|failed" /tmp/prepush-e2e.log | tail -6 | sed 's/^/      /'; }
elif toca "^apps/web/src/"; then
  alerta "o diff toca tela e o e2e não rodou — use --e2e"
fi

# ── Revisão por IA, opcional ──────────────────────────────────────────────
if [ "$WITH_REVIEW" = true ]; then
  echo
  echo "▶ Revisão por IA (--review)"
  if ! command -v claude >/dev/null; then
    alerta "claude CLI não encontrado — revisão pulada"
  else
    # Somente leitura: a revisão não altera arquivo.
    VEREDITO=$(claude -p --output-format text \
      --allowedTools "Read,Grep,Glob,Bash(git diff:*),Bash(git log:*)" \
      "Revise as mudanças de origin/main..HEAD usando a skill pr-review deste repositório.
Reporte só achados com evidência no diff e confiança alta.
Termine a resposta com uma última linha contendo exatamente
VEREDITO: APROVADO   (se não houver nada crítico)
ou
VEREDITO: BLOQUEADO  (se houver achado crítico que deva impedir o push)" 2>/tmp/prepush-review.log)
    echo "$VEREDITO" | sed 's/^/      /'
    if echo "$VEREDITO" | tail -3 | grep -q "VEREDITO: BLOQUEADO"; then
      bloqueia "revisão apontou achado crítico"
    elif echo "$VEREDITO" | tail -3 | grep -q "VEREDITO: APROVADO"; then
      passa "revisão sem achado crítico"
    else
      alerta "revisão não devolveu veredito reconhecível — leia acima e decida"
    fi
  fi
fi

# ── Resultado ─────────────────────────────────────────────────────────────
echo
if [ ${#WARNS[@]} -gt 0 ]; then
  echo "${#WARNS[@]} alerta(s) — não bloqueiam, mas leia antes de subir:"
  for w in "${WARNS[@]}"; do echo "  ! $w"; done
  echo
fi

if [ ${#BLOCKS[@]} -gt 0 ]; then
  echo "BLOQUEADO — ${#BLOCKS[@]} problema(s):"
  for b in "${BLOCKS[@]}"; do echo "  ✗ $b"; done
  exit 1
fi

echo "Liberado para push."
