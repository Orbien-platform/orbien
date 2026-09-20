#!/usr/bin/env bash
# =============================================================================
# provisionar-tenants-teste.sh — cria teste1-church e teste2-church.
#
# Os dois tenants que `docs/AMBIENTES.md` autoriza para teste, e os únicos.
#
# Vai pela rota de plataforma (`POST /platform/tenants`), não por SQL: ela é
# atômica — tenant, plano, branding, congregação e conta admin numa transação
# só — e roda sob RLS, pelo ramo `app_platform_access()`. O seed do repositório
# faz o equivalente com BYPASSRLS, e por isso só serve a banco local.
#
# Idempotente na prática: tenant que já existe volta 409 e o script segue,
# dizendo que pulou. Nada é sobrescrito.
#
# As contas de teste nascem com a senha pública `orbien-e2e-publica-2026`, a
# mesma que o `.github/workflows/ci.yml` manda no login do `e2e-prod`. Passe
# TESTE1_PASSWORD / TESTE2_PASSWORD só se quiser outra — e então ajuste o
# workflow junto, senão o job quebra no 401.
#
# Uso:
#   ORBIEN_API_URL=https://orbien-api.onrender.com/api \
#   PLATFORM_EMAIL=fvargaspf@gmail.com PLATFORM_PASSWORD=... \
#     scripts/provisionar-tenants-teste.sh
# =============================================================================
set -euo pipefail

API="${ORBIEN_API_URL:?falta ORBIEN_API_URL}"
PLATFORM_EMAIL="${PLATFORM_EMAIL:?falta PLATFORM_EMAIL}"
PLATFORM_PASSWORD="${PLATFORM_PASSWORD:?falta PLATFORM_PASSWORD}"

# Senha padrão das contas de teste, em texto claro e igual à do
# `.github/workflows/ci.yml`. **Os dois têm que casar**: o workflow não
# consulta nada, ele manda esta string no login — mudar aqui sem mudar lá
# deixa o `e2e-prod` vermelho com "Login falhou: HTTP 401".
#
# Ser pública é a escolha, não um descuido: a conta existe só para o e2e, só
# no tenant de teste, e não alcança dado de ninguém. O que a protege é o
# escopo, não o sigilo. Ver docs/AMBIENTES.md §5.
SENHA_TESTE_PUBLICA='orbien-e2e-publica-2026'

TESTE1_PASSWORD="${TESTE1_PASSWORD:-$SENHA_TESTE_PUBLICA}"
TESTE2_PASSWORD="${TESTE2_PASSWORD:-$SENHA_TESTE_PUBLICA}"

echo "API: $API"

# Login de plataforma: rota própria, SEM tenant_slug — quem administra a
# plataforma não está dentro de tenant nenhum, e só conta com
# `platform_support` em `role_assignments` é candidata.
echo "▶ login de plataforma ($PLATFORM_EMAIL)"
TOKEN=$(curl -sf -X POST "$API/auth/platform/login" \
  -H 'Content-Type: application/json' \
  -d "$(printf '{"email":"%s","password":"%s"}' "$PLATFORM_EMAIL" "$PLATFORM_PASSWORD")" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!j.access_token)throw new Error("resposta sem access_token");process.stdout.write(j.access_token)})')

[ -n "$TOKEN" ] || { echo "login falhou" >&2; exit 1; }
echo "  ok"

provisionar() {
  local slug="$1" nome="$2" congregacao="$3" admin_nome="$4" email="$5" senha="$6"

  echo "▶ $slug"
  local corpo status
  # Só campos do ProvisionTenantDto: o ValidationPipe global roda com
  # `forbidNonWhitelisted`, então qualquer chave a mais vira 400.
  corpo=$(printf '{"slug":"%s","name":"%s","congregation_name":"%s","admin_name":"%s","admin_email":"%s","admin_password":"%s"}' \
    "$slug" "$nome" "$congregacao" "$admin_nome" "$email" "$senha")

  status=$(curl -s -o /tmp/provisionar-$slug.json -w '%{http_code}' \
    -X POST "$API/platform/tenants" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $TOKEN" \
    -d "$corpo")

  case "$status" in
    20*) echo "  criado — $(cat /tmp/provisionar-$slug.json)" ;;
    409) echo "  já existe, pulando" ;;
    *)   echo "  FALHOU ($status): $(cat /tmp/provisionar-$slug.json)" >&2; return 1 ;;
  esac
}

provisionar teste1-church "Teste 1 Church" "Teste 1 - Sede" \
  "Conta de Teste 1" "fvargaspf+teste1@gmail.com" "$TESTE1_PASSWORD"
provisionar teste2-church "Teste 2 Church" "Teste 2 - Sede" \
  "Conta de Teste 2" "fvargaspf+teste2@gmail.com" "$TESTE2_PASSWORD"

cat <<FIM

─────────────────────────────────────────────────────────────
Pronto. Não há secret a cadastrar: o \`e2e-prod\` já carrega estas mesmas
credenciais em texto claro no workflow.

  fvargaspf+teste1@gmail.com / $TESTE1_PASSWORD   (teste1-church)
  fvargaspf+teste2@gmail.com / $TESTE2_PASSWORD   (teste2-church)

O \`suporte.spec.ts\` vai se pular no CI, de propósito: ele exige
E2E_SUPPORT_EMAIL/E2E_SUPPORT_PASSWORD, que são a conta de PLATAFORMA e não
entram num repositório público. Para rodar esse spec, passe as duas no
ambiente ao chamar a suíte na mão.
─────────────────────────────────────────────────────────────
FIM
