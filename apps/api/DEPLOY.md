# Deploy no Render

## Primeiro deploy

1. Acessar https://dashboard.render.com
2. New → Web Service → conectar repositório GitHub orbien-api
3. Branch: main
4. Runtime: Docker
5. Plan: Free

## Variáveis de ambiente (configurar no dashboard)

Criar Environment Group "orbien-secrets" com:

| Variável | Descrição | Onde encontrar |
|---|---|---|
| DATABASE_URL | Supabase pooler (porta 6543, role orbien_app) | Supabase → Settings → Database → Connection string (pooler) |
| DIRECT_URL | Supabase direto (porta 5432, role postgres) | Supabase → Settings → Database → Connection string (direct) |
| JWT_SECRET | Segredo do access token | Gerar: `openssl rand -hex 32` |
| JWT_REFRESH_SECRET | Segredo do refresh token | Gerar: `openssl rand -hex 32` |
| ONESIGNAL_APP_ID | OneSignal App ID | Dashboard OneSignal |
| ONESIGNAL_API_KEY | OneSignal REST API Key | Dashboard OneSignal → Keys |
| ASAAS_API_KEY | API key Asaas (sandbox ou produção) | Dashboard Asaas |
| ASAAS_WEBHOOK_SECRET | Secret do webhook Asaas | Dashboard Asaas → Webhooks |
| R2_ACCOUNT_ID | Cloudflare account ID | Dashboard Cloudflare |
| R2_ACCESS_KEY_ID | R2 access key | Cloudflare → R2 → API Tokens |
| R2_SECRET_ACCESS_KEY | R2 secret key | Cloudflare → R2 → API Tokens |
| R2_BUCKET_NAME | Nome do bucket R2 | Cloudflare → R2 |
| R2_PUBLIC_URL | URL pública do bucket R2 | Cloudflare → R2 → Settings |
| ALLOWED_ORIGINS | Origens CORS permitidas | https://orbien-web.vercel.app,https://app.useorbien.com |

## Após deploy

1. Copiar a URL do Render (ex: https://orbien-api.onrender.com)
2. Testar: `curl https://orbien-api.onrender.com/api/health`
3. Atualizar `NEXT_PUBLIC_API_URL` no Vercel para a URL do Render
4. Testar login: `POST /api/auth/login` com credenciais de teste

## Cold start

O free tier dorme após 15min sem requests. Primeiro request após sleep leva ~30-50s.
Para manter o serviço acordado (opcional): usar UptimeRobot (free) para pingar /api/health a cada 14min.

## Testar localmente

```bash
# Build da imagem
docker build -t orbien-api .

# Rodar com variáveis do .env local
docker run -p 3000:3000 --env-file .env orbien-api

# Verificar health check
curl http://localhost:3000/api/health
# Esperado: {"status":"ok","timestamp":"..."}
```
