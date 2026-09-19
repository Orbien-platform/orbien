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
# As senhas das contas de teste são sorteadas pelo script e impressas uma única
# vez no fim, prontas para colar nos secrets. Passe TESTE1_PASSWORD /
# TESTE2_PASSWORD só se quiser escolher a sua.
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

# Senha não é argumento obrigatório de propósito: quando não vem do ambiente, o
# script sorteia uma e a imprime no fim. Assim ninguém precisa inventar senha —
# nem escrevê-la num arquivo, num commit ou numa conversa para depois colar no
# secret. 32 hex = 128 bits de urandom, bem acima do MinLength(8) do DTO.
senha_nova() { openssl rand -hex 16; }

TESTE1_PASSWORD="${TESTE1_PASSWORD:-$(senha_nova)}"
TESTE2_PASSWORD="${TESTE2_PASSWORD:-$(senha_nova)}"

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
Pronto. Cadastre estes quatro secrets em
https://github.com/Orbien-platform/orbien/settings/secrets/actions
— é o que falta para o job \`e2e-prod\` rodar:

  E2E_PROD_EMAIL            fvargaspf+teste1@gmail.com
  E2E_PROD_PASSWORD         $TESTE1_PASSWORD
  E2E_PROD_SUPPORT_EMAIL    $PLATFORM_EMAIL
  E2E_PROD_SUPPORT_PASSWORD (a senha de plataforma que você usou acima)

Senha do teste2-church (guarde, não vai para secret nenhum hoje):
  $TESTE2_PASSWORD

Esta é a única vez que as senhas aparecem. Não há como relê-las depois — o
banco guarda só o hash (argon2). Perdeu? Rode de novo com um slug novo, ou
troque pela tela de recuperação: os dois e-mails são alias de
fvargaspf@gmail.com, então a mensagem chega na sua caixa de verdade.
─────────────────────────────────────────────────────────────
FIM
