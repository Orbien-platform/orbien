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
# Uso:
#   ORBIEN_API_URL=https://orbien-api.onrender.com/api \
#   PLATFORM_EMAIL=... PLATFORM_PASSWORD=... \
#   TESTE1_PASSWORD=... TESTE2_PASSWORD=... \
#     scripts/provisionar-tenants-teste.sh
# =============================================================================
set -euo pipefail

API="${ORBIEN_API_URL:?falta ORBIEN_API_URL}"
PLATFORM_EMAIL="${PLATFORM_EMAIL:?falta PLATFORM_EMAIL}"
PLATFORM_PASSWORD="${PLATFORM_PASSWORD:?falta PLATFORM_PASSWORD}"
TESTE1_PASSWORD="${TESTE1_PASSWORD:?falta TESTE1_PASSWORD}"
TESTE2_PASSWORD="${TESTE2_PASSWORD:?falta TESTE2_PASSWORD}"

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
  "Conta de Teste 1" "teste1@useorbien.com.br" "$TESTE1_PASSWORD"
provisionar teste2-church "Teste 2 Church" "Teste 2 - Sede" \
  "Conta de Teste 2" "teste2@useorbien.com.br" "$TESTE2_PASSWORD"

echo
echo "Pronto. Guarde as senhas nos secrets do GitHub (ver docs/AMBIENTES.md §5)."
