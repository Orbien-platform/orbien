#!/usr/bin/env bash
#
# Portão antes de subir para o remoto.
#
# No modelo trunk-based, o CI dispara depois do push — ele detecta, não impede.
# Este script é o portão que falta: roda o que o CI rodaria, mais as checagens
# específicas do Orbien que dão para verificar por script, e falha antes de o
# commit sair da máquina.
#
#   bash scripts/pre-push.sh              # portão completo (o que vale para subir)
#   bash scripts/pre-push.sh --review     # + revisão por IA, com veredito
#   bash scripts/pre-push.sh --rapido     # só build, tipos, lint e regras — NÃO libera PR
#   bash scripts/pre-push.sh --so=ETAPA   # só uma etapa, para iterar — NÃO libera PR
#                                         #   ETAPA: cobertura | rls | e2e | site
#
# O completo roda o que o CI roda, na mesma ordem de importância:
#   build, tipos, lint · testes e cobertura dos 5 apps (sempre) · RLS (se o
#   diff toca a API) · e2e do web só nos specs que o diff afeta · smoke do site
#   (se o diff toca o site).
# Banco, API e web sobem sozinhos, num Postgres local — nunca o do Supabase.
#
# Falhou? Corrija a causa e rode de novo até liberar; `--so=` encurta o ciclo,
# mas a liberação só vale com o completo verde. Ver "Antes de subir" no
# CLAUDE.md.
#
# Racional e alternativas: docs/CI.md

set -uo pipefail
cd "$(dirname "$0")/.."

WITH_REVIEW=false
RAPIDO=false
SO=""
for arg in "$@"; do
  case "$arg" in
    --e2e) echo "(--e2e não é mais preciso: o e2e do escopo afetado roda sempre)" ;;
    --review) WITH_REVIEW=true ;;
    --rapido) RAPIDO=true ;;
    --so=cobertura|--so=rls|--so=e2e|--so=site) SO="${arg#--so=}" ;;
    *) echo "argumento desconhecido: $arg"; exit 2 ;;
  esac
done
# `quer ETAPA`: a etapa roda? Sempre, a menos que --so tenha escolhido outra.
quer() { [ -z "$SO" ] || [ "$SO" = "$1" ]; }

BLOCKS=()
WARNS=()
bloqueia() { BLOCKS+=("$1"); echo "  ✗ $1"; }
alerta()   { WARNS+=("$1");  echo "  ! $1"; }
passa()    { echo "  ✓ $1"; }

# NODE_ENV=production SÓ no build: com `development` o prerender do Next 16
# cai em "Cannot read properties of null (reading 'useContext')" (AJU-04) —
# e sessão remota e muitos shells de dev exportam `development`. Vercel e CI
# não exportam nada, por isso lá nunca quebrou. Não vale exportar para o
# script todo: o Jest só põe `test` se NODE_ENV estiver vazio.
constroi() { # LOG, args do turbo...
  local log="$1"; shift
  NODE_ENV=production npx turbo run build "$@" >"$log" 2>&1
}

# Tempo por etapa, impresso no fim: o portão completo é lento (builds, cobertura
# dos 5 apps, e2e) e quem espera precisa ver onde o tempo vai antes de decidir
# o que encurtar.
TEMPOS=()
ETAPA_ATUAL=""
ETAPA_T0=$SECONDS
fecha_etapa() {
  [ -n "$ETAPA_ATUAL" ] && TEMPOS+=("$(( SECONDS - ETAPA_T0 ))|$ETAPA_ATUAL")
  ETAPA_ATUAL=""
}
etapa() { fecha_etapa; ETAPA_ATUAL="$1"; ETAPA_T0=$SECONDS; echo "▶ $1"; }
mmss() { printf '%dm%02ds' $(( $1 / 60 )) $(( $1 % 60 )); }

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

if [ -z "$SO" ]; then

# ── Checagens do Orbien que dão para verificar por script ─────────────────
echo
etapa "Regras do monorepo"

# Import cruzando app quebra a independência dos deploys — inequívoco.
if grep -rnE "from ['\"].*apps/(api|web|site|admin|mobile)/" apps/*/src 2>/dev/null | grep -v "^apps/\([a-z]*\)/src.*apps/\1/" | head -3 | grep -q .; then
  bloqueia "import cruzando app — os deploys precisam ser independentes"
  grep -rnE "from ['\"].*apps/(api|web|site|admin|mobile)/" apps/*/src 2>/dev/null | head -3 | sed 's/^/      /'
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
etapa "Banco e isolamento"

MIGS=$(echo "$CHANGED" | grep -E "^apps/api/prisma/migrations/.*\.sql$" || true)
SCHEMA_CHANGED=$(echo "$CHANGED" | grep -cE "^apps/api/prisma/schema\.prisma$" || true)

if [ "$SCHEMA_CHANGED" != "0" ] && [ -z "$MIGS" ]; then
  alerta "schema.prisma mudou sem migration nova — schema e banco vão divergir"
elif [ -n "$MIGS" ] && [ "$SCHEMA_CHANGED" = "0" ]; then
  alerta "migration nova sem mudança no schema.prisma — confirme se é intencional"
elif [ -n "$MIGS" ]; then
  passa "migration e schema mudaram juntos"
fi

# Nome da tabela como o Prisma Client a chama: `study_material_versions` vira
# `studyMaterialVersion`. O teste de isolamento fala por delegate
# (`tx.studyMaterialVersion`), não pelo nome da tabela — procurar só o
# snake_case dava alerta em tabela que TEM caso escrito, e alerta que mente
# é alerta que se aprende a ignorar. A singularização é ingênua de propósito
# (tira o `s` final): errar aqui volta ao comportamento antigo, o alerta
# falso, nunca o silêncio.
delegate_de() {
  echo "$1" | awk -F_ '{ s=$1; for (i=2;i<=NF;i++) s = s toupper(substr($i,1,1)) substr($i,2); print s }' \
             | sed 's/s$//'
}

# Tabela nova exige RLS e teste de isolamento. Alerta, não bloqueio: o RLS pode
# estar nos scripts manuais (001/002), que são arquivos separados.
if [ -n "$MIGS" ]; then
  NOVAS=$(grep -hoE 'CREATE TABLE (IF NOT EXISTS )?"?[a-z_]+"?' $MIGS 2>/dev/null \
          | grep -oE '"[a-z_]+"|[a-z_]+$' | tr -d '"' | sort -u | grep -vE '^(CREATE|TABLE|IF|NOT|EXISTS)$' || true)
  for t in $NOVAS; do
    grep -qE "ALTER TABLE \"?$t\"? ENABLE ROW LEVEL SECURITY" $MIGS apps/api/prisma/migrations/0*_rls_*.sql 2>/dev/null \
      || alerta "tabela '$t' criada sem ENABLE ROW LEVEL SECURITY em nenhum script"
    grep -qE "$t|$(delegate_de "$t")" apps/api/test/rls/*.spec.ts 2>/dev/null \
      || alerta "tabela '$t' sem caso em nenhum spec de test/rls/ — policy existir não prova que isola"
  done
  [ -z "$NOVAS" ] && passa "nenhuma tabela nova"
fi

# CREATE POLICY sem DROP antes quebra reexecução — e reexecução só existe nos
# scripts `0NN_rls_*.sql`, que o `bootstrap-db.sh` roda inteiros a cada deploy.
# Migration do Prisma é aplicada UMA vez, e editar uma já aplicada muda o
# checksum e derruba o `prisma migrate deploy` em produção: cobrar a regra ali
# pedia justamente a correção que não se pode fazer.
RLS_SCRIPTS=$(echo "$CHANGED" | grep -E "^apps/api/prisma/migrations/0[0-9]+_rls_.*\.sql$" || true)
if [ -n "$RLS_SCRIPTS" ]; then
  for f in $RLS_SCRIPTS; do
    np=$(grep -cE "^CREATE POLICY" "$f" || true)
    nd=$(grep -cE "^DROP POLICY IF EXISTS" "$f" || true)
    [ "$np" -gt "$nd" ] && alerta "$f: $np CREATE POLICY para $nd DROP POLICY IF EXISTS — reexecução vai falhar"
  done
fi

# ── Portões determinísticos ───────────────────────────────────────────────
echo
etapa "Build, tipos e lint"
# Estas duas entram no hash do build do web (turbo.json). Exportadas já aqui,
# o build do e2e reaproveita este em vez de refazer o web inteiro; precisam
# estar definidas no build E no start (ver o job `e2e` do ci.yml).
export API_BACKEND_URL="http://localhost:3000/api" NEXT_PUBLIC_API_URL="/api-proxy"
constroi /tmp/prepush-build.log && passa "build dos 5 apps" || {
  bloqueia "build falhou — veja /tmp/prepush-build.log"
  tail -15 /tmp/prepush-build.log | sed 's/^/      /'
}
npx tsc --noEmit -p apps/api/tsconfig.json >/tmp/prepush-tsc.log 2>&1 && passa "tipos da API, incluindo test/" \
  || { bloqueia "tsc falhou — veja /tmp/prepush-tsc.log"; head -10 /tmp/prepush-tsc.log | sed 's/^/      /'; }
npx turbo run lint >/tmp/prepush-lint.log 2>&1 && passa "lint" \
  || { bloqueia "lint falhou — veja /tmp/prepush-lint.log"; grep -E "problems|error" /tmp/prepush-lint.log | tail -8 | sed 's/^/      /'; }
node scripts/check-skills.mjs >/dev/null 2>&1 && passa "skills consistentes" \
  || bloqueia "skills inconsistentes — rode 'node scripts/check-skills.mjs'"

fi # -z "$SO"

# ── Banco local, testes, cobertura, RLS, e2e e smoke ─────────────────────
#
# Tudo abaixo roda num Postgres LOCAL. A DATABASE_URL do ambiente de dev e a
# da sessão remota podem apontar para o Supabase de produção; seed e testes
# que escrevem não podem ir parar lá. Se as variáveis não forem locais, este
# script usa localhost:5432 com as credenciais do CI (as mesmas do ci.yml) em
# vez de confiar nelas. Os tenants que os testes usam são só `teste1-church`
# e `teste2-church` (docs/AMBIENTES.md) — vêm do seed.

PIDS=()
encerra() {
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] || continue
    pkill -P "$pid" 2>/dev/null
    kill "$pid" 2>/dev/null
  done
}
trap encerra EXIT

url_local() { [[ "${1:-}" =~ @(localhost|127\.0\.0\.1)[:/] ]]; }
porta_aberta() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
espera_url() { # URL, tentativas de 2s
  for _ in $(seq 1 "$2"); do curl -sf "$1" >/dev/null 2>&1 && return 0; sleep 2; done
  return 1
}

# Sessão remota traz um Chromium em $PLAYWRIGHT_BROWSERS_PATH/chromium de outra
# versão que a do Playwright do repositório (`playwright install` não é
# permitido lá). Apontar para ele evita "Executable doesn't exist". Na máquina
# de dev e no CI o caminho não existe e nada muda.
if [ -z "${E2E_CHROMIUM_PATH:-}" ] && [ -x "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}/chromium" ]; then
  export E2E_CHROMIUM_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}/chromium"
fi

BANCO_PRONTO=false
prepara_banco() {
  $BANCO_PRONTO && return 0
  local reprovisiona=false
  if url_local "${DATABASE_URL:-}" && url_local "${DIRECT_URL:-}"; then
    echo "  banco: o Postgres local do ambiente"
  else
    if ! porta_aberta 5432; then
      bloqueia "sem Postgres local em localhost:5432 — suba um (docs/TESTES.md, Fase 0) ou rode com --rapido e declare que testes e e2e ficam para o CI"
      return 1
    fi
    export DIRECT_URL="postgresql://postgres:ci@localhost:5432/orbien"
    export DATABASE_URL="postgresql://orbien_app:ci_app@localhost:5432/orbien"
    export ORBIEN_APP_PASSWORD="ci_app"
    reprovisiona=true
    echo "  banco: DATABASE_URL do ambiente não é local — usando localhost:5432 com as credenciais do CI"
  fi
  export JWT_SECRET="${JWT_SECRET:-ci-jwt-secret}"
  export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-ci-jwt-refresh-secret}"

  # Migration ou script de RLS novo na branch: o banco local precisa recebê-los
  # antes de qualquer teste, senão o teste mede o schema antigo.
  if $reprovisiona || toca "^apps/api/prisma/"; then
    echo "  … provisionando schema e RLS (bootstrap-db.sh)"
    (cd apps/api && bash scripts/bootstrap-db.sh) >/tmp/prepush-bootstrap.log 2>&1 \
      || { bloqueia "bootstrap-db.sh falhou — veja /tmp/prepush-bootstrap.log"; tail -8 /tmp/prepush-bootstrap.log | sed 's/^/      /'; return 1; }
  fi
  echo "  … semeando os tenants de teste"
  (cd apps/api && DATABASE_URL="$DIRECT_URL" npx ts-node prisma/seed.ts) >/tmp/prepush-seed.log 2>&1 \
    || { bloqueia "seed falhou — veja /tmp/prepush-seed.log"; tail -8 /tmp/prepush-seed.log | sed 's/^/      /'; return 1; }
  BANCO_PRONTO=true
}

# Linhas que dizem o que quebrou, sem despejar o log inteiro.
resumo_falha() { grep -E "✕|✘|×|FAIL |threshold|●.*›|Error:|passed|failed|Tests:" "$1" | head -"${2:-12}" | sed 's/^/      /'; }

if ! $RAPIDO && quer cobertura; then
  echo
  etapa "Testes e cobertura (os 5 apps, sempre — é o que o CI cobra)"
  if prepara_banco; then
    for pkg in orbien-backend orbien-web orbien-site orbien-admin orbien-mobile; do
      log="/tmp/prepush-cov-$pkg.log"
      if npm run test:cov -w "$pkg" >"$log" 2>&1; then
        passa "$pkg — testes e piso de cobertura"
      else
        bloqueia "$pkg — testes ou cobertura abaixo do piso (veja $log)"
        resumo_falha "$log"
      fi
    done
  fi
fi

if ! $RAPIDO && quer rls && toca "^apps/api/(src|prisma)/"; then
  echo
  etapa "Isolamento multi-tenant (o diff toca a API)"
  if prepara_banco; then
    npm run test:rls -w orbien-backend >/tmp/prepush-rls.log 2>&1 && {
      # AJU-07: contagem lida da própria saída do Jest, não mais literal — o
      # literal desatualizou três vezes (39→118→125) a cada suíte nova de RLS.
      RLS_SUMMARY=$(grep -E "^Tests:" /tmp/prepush-rls.log | sed -E 's/^Tests:\s*//')
      passa "${RLS_SUMMARY:-testes de RLS} (veja /tmp/prepush-rls.log)"
    } || {
      # Distinguir banco inacessível de teste vermelho: bloquear por
      # infraestrutura ensina a ignorar o portão.
      if grep -qE "Exceeded timeout|Can't reach database|P1001|ECONNREFUSED" /tmp/prepush-rls.log; then
        alerta "testes de RLS não rodaram: o banco não respondeu a tempo (veja /tmp/prepush-rls.log)"
      else
        bloqueia "testes de RLS falharam — veja /tmp/prepush-rls.log"
        grep -E "✕|SECURITY GAP|Tests:" /tmp/prepush-rls.log | tail -6 | sed 's/^/      /'
      fi
    }
  fi
fi

# Escopo do e2e: só os specs que o diff pode afetar (scripts/e2e-escopo.mjs).
ESCOPO=$(echo "$CHANGED" | node scripts/e2e-escopo.mjs 2>/tmp/prepush-escopo.log)
WEB_SPECS=$(echo "$ESCOPO" | sed -n 's/^web://p')
SITE_NO_ESCOPO=$(echo "$ESCOPO" | grep -c '^site:1' || true)

if ! $RAPIDO && quer e2e; then
  echo
  etapa "E2E do web — só o escopo afetado"
  if [ -z "$WEB_SPECS" ]; then
    passa "nenhum spec do e2e é afetado por este diff"
    [ -s /tmp/prepush-escopo.log ] && sed 's/^/  /' /tmp/prepush-escopo.log
  else
    if [ "$WEB_SPECS" = "*" ]; then SPEC_ARGS=(); QUAIS="suíte inteira"; else
      SPEC_ARGS=(); for sp in $WEB_SPECS; do SPEC_ARGS+=("e2e/$sp"); done
      QUAIS="$(echo "$WEB_SPECS" | wc -w | tr -d ' ') spec(s): $(echo $WEB_SPECS | sed 's/\.spec\.ts//g')"
    fi
    echo "  escopo: $QUAIS"
    sed 's/^/  /' /tmp/prepush-escopo.log

    if porta_aberta 3000 || porta_aberta 3001; then
      bloqueia "porta 3000 ou 3001 ocupada — o e2e sobe a API e o web nelas; encerre o que estiver rodando"
    elif prepara_banco; then
      # API_BACKEND_URL / NEXT_PUBLIC_API_URL já exportados antes do build geral.
      echo "  … build da API e do web"
      if ! constroi /tmp/prepush-e2e-build.log --filter=orbien-backend --filter=orbien-web; then
        bloqueia "build para o e2e falhou — veja /tmp/prepush-e2e-build.log"
        tail -10 /tmp/prepush-e2e-build.log | sed 's/^/      /'
      else
        # Sem NODE_ENV, como no job `e2e` do ci.yml: a API muda de comportamento
        # com ele (cookies, CORS), e o ambiente de dev traz `development`.
        PORT=3000 ALLOWED_ORIGINS=http://localhost:3001 FRONTEND_URL=http://localhost:3001 \
          env -u NODE_ENV node apps/api/dist/src/main.js >/tmp/prepush-e2e-api.log 2>&1 &
        PIDS+=("$!")
        (cd apps/web && NODE_ENV=production exec node ../../node_modules/next/dist/bin/next start --port 3001) >/tmp/prepush-e2e-web.log 2>&1 &
        PIDS+=("$!")
        if ! espera_url http://localhost:3000/api/health 60; then
          bloqueia "a API não respondeu em 120s — veja /tmp/prepush-e2e-api.log"; tail -6 /tmp/prepush-e2e-api.log | sed 's/^/      /'
        elif ! espera_url http://localhost:3001/login 60; then
          bloqueia "o web não respondeu em 120s — veja /tmp/prepush-e2e-web.log"; tail -6 /tmp/prepush-e2e-web.log | sed 's/^/      /'
        else
          # Credenciais do seed, não segredo; as mesmas do job `e2e` do ci.yml.
          # teste2-church (Premium), nunca doca-church.
          E2E_BASE_URL=http://localhost:3001 E2E_API_URL=http://localhost:3000/api \
          E2E_EMAIL=fvargaspf+teste2@gmail.com E2E_PASSWORD=A3dodfemf E2E_TENANT=teste2-church \
          E2E_SUPPORT_EMAIL=fernando.vargas@fill.tech E2E_SUPPORT_PASSWORD=A3dodfemf \
            npm run e2e -w orbien-web -- "${SPEC_ARGS[@]}" >/tmp/prepush-e2e.log 2>&1 \
            && passa "e2e — $QUAIS" \
            || {
              bloqueia "e2e falhou — veja /tmp/prepush-e2e.log (traces em apps/web/test-results, relatório em apps/web/playwright-report)"
              grep -E "✘|^\s+[0-9]+\) |passed|failed|Executable doesn't exist" /tmp/prepush-e2e.log | tail -12 | sed 's/^/      /'
            }
        fi
      fi
      encerra; PIDS=()
    fi
  fi
fi

if ! $RAPIDO && quer site; then
  if [ "$SITE_NO_ESCOPO" != "0" ] || [ "$SO" = "site" ]; then
    echo
    etapa "Smoke do site (o diff toca o site)"
    if porta_aberta 3002; then
      bloqueia "porta 3002 ocupada — o smoke sobe o site nela; encerre o que estiver rodando"
    elif ! constroi /tmp/prepush-site-build.log --filter=orbien-site; then
      bloqueia "build do site falhou — veja /tmp/prepush-site-build.log"
    else
      (cd apps/site && NODE_ENV=production exec node ../../node_modules/next/dist/bin/next start --port 3002) >/tmp/prepush-site.log 2>&1 &
      PIDS+=("$!")
      if ! espera_url http://localhost:3002/ 60; then
        bloqueia "o site não respondeu em 120s — veja /tmp/prepush-site.log"
      else
        E2E_BASE_URL=http://localhost:3002 npm run e2e -w orbien-site >/tmp/prepush-site-smoke.log 2>&1 \
          && passa "smoke do site" \
          || { bloqueia "smoke do site falhou — veja /tmp/prepush-site-smoke.log"; grep -E "✘|^\s+[0-9]+\) |passed|failed|Executable doesn't exist" /tmp/prepush-site-smoke.log | tail -8 | sed 's/^/      /'; }
      fi
      encerra; PIDS=()
    fi
  fi
fi

# ── Revisão por IA, opcional ──────────────────────────────────────────────
if [ "$WITH_REVIEW" = true ]; then
  echo
  etapa "Revisão por IA (--review)"
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
fecha_etapa
if [ ${#TEMPOS[@]} -gt 0 ]; then
  echo
  echo "Tempo por etapa (total $(mmss $SECONDS)):"
  for t in "${TEMPOS[@]}"; do printf '  %7s  %s\n' "$(mmss "${t%%|*}")" "${t#*|}"; done
fi
echo
if [ ${#WARNS[@]} -gt 0 ]; then
  echo "${#WARNS[@]} alerta(s) — não bloqueiam. Decida: seguir assim, ou ajustar antes?"
  for w in "${WARNS[@]}"; do echo "  ! $w"; done
  echo
fi

if [ ${#BLOCKS[@]} -gt 0 ]; then
  echo "BLOQUEADO — ${#BLOCKS[@]} problema(s):"
  for b in "${BLOCKS[@]}"; do echo "  ✗ $b"; done
  echo
  echo "Corrija a causa (não o teste, o piso ou o escopo) e rode de novo até liberar."
  exit 1
fi

if $RAPIDO || [ -n "$SO" ]; then
  PARCIAL=$($RAPIDO && echo "--rapido" || echo "--so=$SO")
  echo "PARCIAL — $PARCIAL não libera PR. Rode 'bash scripts/pre-push.sh' inteiro antes de subir."
  exit 0
fi

echo "Liberado para push."
