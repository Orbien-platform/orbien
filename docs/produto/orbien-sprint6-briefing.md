# BRIEFING — Orbien Backend · Sprint 6 — Conteúdo e Notificações

## Contexto do projeto

Estou construindo o Orbien, um SaaS white-label de gestão de igrejas, multi-tenant em 3 níveis (plataforma → denominação → congregação). Sou o único desenvolvedor, usando Claude Chat/Projects para spec e decisões, Claude Code para implementação.

### Stack decidida (não questionar)

- Backend: NestJS + Prisma 6 + Postgres (Supabase us-west-1, migrar para sa-east-1 antes do go-live)
- Auth: JWT próprio (15min) + Argon2 + refresh token rotation + impersonation auditada
- Multi-tenancy: tabela compartilhada com tenant_id + congregation_id + RLS no Postgres
- Infra: Render (backend) + Vercel (frontend) + Cloudflare R2 (storage)
- PIX: Asaas (3 cenários)
- Notificações: OneSignal (ADR-009)
- Frontend: Next.js + Tailwind + Shadcn/UI (ainda não iniciado)
- Mobile: React Native + Expo (ainda não iniciado)

### Credenciais de teste

- `fvargaspf@gmail.com` / `A3dodfemf` → roles `tenant_admin` + `admin_congregation` (Doca Church)
- `fernando.vargas@fill.tech` / `A3dodfemf` → role `platform_support`
- tenant_slug: `doca-church`
- Prefixo de rotas: `/api`

### Conexão do banco

- `DATABASE_URL` aponta para role `orbien_app` (NOBYPASSRLS) via pooler Supabase (porta 6543)
- `DIRECT_URL` aponta para `postgres` via conexão direta (porta 5432) — só para migrations
- FORCE ROW LEVEL SECURITY ativo em 22 tabelas
- Policies seguem Padrão B (tenant + congregation com exceção para tenant_admin/denomination_admin)

### O que está implementado e testado

| Sprint | Módulo | Status |
|---|---|---|
| 1 | Schema Prisma 43+ tabelas + RLS + Auth JWT + seed | ✅ |
| 2 | Pessoas + Household + Deduplicação + Visitas + Reclassificação automática + QR público + Waitlist + Dashboard demográfico | ✅ |
| 3 | Pequenos Grupos + Reuniões + Presença nominal + Hierarquia + Alertas de ausência | ✅ |
| 4 | Biblioteca de Materiais + Scheduler (polling 5min) + Upload R2 + OneSignal | ✅ |
| 5 | Financeiro: Categorias (12 seed) + Transações CRUD + PIX 3 cenários + Dashboard semanal + Forecast | ✅ |
| DT-01 | RLS Isolation Test Suite — 14/14 testes passando | ✅ |

---

## Sprint 6 — Conteúdo e Notificações

### Escopo

CRUD de conteúdos multi-tipo, segmentação de audiência, agendamento de publicação e disparo de push via OneSignal com métricas.

### Tabelas do schema (já existem no Prisma)

```
CONTENT_POST {
  uuid id PK
  uuid tenant_id FK
  uuid congregation_id FK
  uuid created_by_user_id FK
  enum type "post|sermon_video|audio|devotional|study|event|notice|prayer"
  string title
  text body
  string media_url
  timestamp publish_at
  timestamp published_at
  boolean is_draft
  timestamp created_at
  timestamp updated_at
}

AUDIENCE_SEGMENT {
  uuid id PK
  uuid tenant_id FK
  uuid congregation_id FK
  string name
  jsonb criteria  // { congregation_ids?, group_ids?, ministry_ids?, age_range?, roles? }
}

NOTIFICATION_DISPATCH {
  uuid id PK
  uuid tenant_id FK
  uuid congregation_id FK
  uuid post_id FK
  string channel  // "push" | "email"
  string onesignal_notification_id
  timestamp sent_at
  int reached
  int opened
}
```

Relação: `CONTENT_POST }o--o{ AUDIENCE_SEGMENT : targets` (tabela intermediária `content_post_audience_segments` ou similar).

### Estrutura de arquivos

```
src/content/
  content.module.ts
  posts.controller.ts
  posts.service.ts
  segments.controller.ts
  segments.service.ts
  notifications.service.ts
  scheduler.service.ts
  dto/
    create-post.dto.ts
    update-post.dto.ts
    list-posts-query.dto.ts
    create-segment.dto.ts
    update-segment.dto.ts
    send-notification.dto.ts
```

### Sequência de implementação (6 passos)

---

#### Passo 1 — Scaffold + DTOs + AudienceSegment CRUD

**Prompt para Claude Code:**
```
Sprint 6 · Passo 1 — Scaffold do módulo Content + AudienceSegment CRUD

Contexto: Orbien backend NestJS. Sprints 1-5 completos. Multi-tenant com tenant_id
+ congregation_id em cada registro. TenantContextInterceptor injeta SET LOCAL.
Auth: JwtAuthGuard + @Roles(). Prefixo global: /api.

IMPLEMENTAR:

1. Criar estrutura de arquivos em src/content/ (scaffold mínimo compilável):
   content.module.ts, posts.controller.ts, posts.service.ts,
   segments.controller.ts, segments.service.ts, notifications.service.ts,
   scheduler.service.ts, dto/ com todos os DTOs listados abaixo.

2. DTOs:
   - create-segment.dto.ts:
     name: string (required)
     criteria: object (required) — { congregation_ids?: uuid[], group_ids?: uuid[],
       ministry_ids?: uuid[], age_range?: { min: number, max: number }, roles?: string[] }
   - update-segment.dto.ts: PartialType

   - create-post.dto.ts:
     type: enum post|sermon_video|audio|devotional|study|event|notice|prayer (required)
     title: string (required)
     body: string (optional)
     media_url: string (optional — URL do R2 ou YouTube/Vimeo/Spotify)
     publish_at: ISO datetime (optional — se null, publica imediatamente)
     is_draft: boolean (default true)
     segment_ids: uuid[] (optional — audiências-alvo)
   - update-post.dto.ts: PartialType
   - list-posts-query.dto.ts:
     type: enum (optional), is_draft: boolean (optional), since: ISO date (optional),
     page: number (default 1), limit: number (default 20, max 100)

3. AudienceSegment CRUD completo:
   - SegmentsService: create, findAll, findOne, update, remove
   - SegmentsController: @Controller('content/segments')
     POST / → @Roles('admin_congregation', 'pastor', 'tenant_admin')
     GET / → mesmos + secretary
     GET /:id → mesmos
     PATCH /:id → mesmos (sem secretary)
     DELETE /:id → admin_congregation, tenant_admin

4. Registrar ContentModule no AppModule.

5. Testar:
   TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"fvargaspf@gmail.com","password":"A3dodfemf","tenant_slug":"doca-church"}' \
     | jq -r '.access_token')

   # Criar segmento
   curl -s -X POST http://localhost:3000/api/content/segments \
     -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
     -d '{"name":"Jovens 18-30","criteria":{"age_range":{"min":18,"max":30}}}' | jq .

   # Listar segmentos
   curl -s http://localhost:3000/api/content/segments \
     -H "Authorization: Bearer $TOKEN" | jq .

Siga os padrões dos módulos anteriores (FinancialModule, PersonsModule).
Não implemente posts ainda — só segments neste passo.
```

---

#### Passo 2 — ContentPost CRUD (sem agendamento/notificação)

**Prompt para Claude Code:**
```
Sprint 6 · Passo 2 — ContentPost CRUD

Contexto: ContentModule scaffoldado. AudienceSegment CRUD funcionando.

IMPLEMENTAR:

1. PostsService:
   - create(dto, user):
     Criar ContentPost com tenant_id, congregation_id, created_by_user_id.
     Se segment_ids informado, vincular aos AudienceSegments (relação M:N).
     Se is_draft = false e publish_at é null ou no passado → setar published_at = now().
     Se is_draft = false e publish_at é futuro → manter published_at null (scheduler publica depois).
     Criar AuditLog action: 'created'.

   - findAll(query, user):
     Paginado. Filtros: type, is_draft, published_at >= since.
     Incluir: segments (names), creator (user name).
     Posts com is_draft = true só visíveis para quem tem role de criação.

   - findOne(id, user): com segments e creator.

   - update(id, dto, user):
     Se mudou is_draft de true → false: aplicar mesma lógica de publicação do create.
     AuditLog com before/after.

   - remove(id, user): AuditLog action: 'deleted'.

   - publish(id, user):
     Endpoint dedicado para publicar um draft.
     Setar is_draft = false, published_at = now().
     Retornar o post publicado.

2. PostsController: @Controller('content/posts')
   - POST / → @Roles('admin_congregation', 'pastor', 'tenant_admin')
   - GET / → mesmos + secretary + member (member vê só publicados da sua audiência)
   - GET /:id → mesmos
   - PATCH /:id → admin_congregation, pastor, tenant_admin
   - DELETE /:id → admin_congregation, tenant_admin
   - POST /:id/publish → admin_congregation, pastor, tenant_admin

3. Testar:
   TOKEN=...

   # Criar post draft
   curl -s -X POST http://localhost:3000/api/content/posts \
     -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
     -d '{"type":"notice","title":"Culto especial sexta","body":"Venha participar do culto de louvor.","is_draft":true}' | jq .

   # Publicar
   POST_ID=<id do post acima>
   curl -s -X POST http://localhost:3000/api/content/posts/$POST_ID/publish \
     -H "Authorization: Bearer $TOKEN" | jq .

   # Listar publicados
   curl -s "http://localhost:3000/api/content/posts?is_draft=false" \
     -H "Authorization: Bearer $TOKEN" | jq '{total: .total}'

Não implementar notificação push nem agendamento ainda.
```

---

#### Passo 3 — Scheduler de publicação automática

**Prompt para Claude Code:**
```
Sprint 6 · Passo 3 — Scheduler de publicação automática

Contexto: ContentPost CRUD funcionando. Posts com publish_at futuro ficam com
published_at = null até o momento chegar.

IMPLEMENTAR:

1. SchedulerService (src/content/scheduler.service.ts):
   Usar @Cron('*/5 * * * *') do @nestjs/schedule (mesmo padrão do Sprint 4 — materiais).

   processScheduledPosts():
   - Buscar ContentPost onde:
     is_draft = false AND published_at IS NULL AND publish_at <= now()
   - Para cada post encontrado:
     - Setar published_at = now()
     - Disparar notificação (chamar NotificationsService.notifyPost — implementar no passo 4)
     - Logar em AuditLog action: 'auto_published'

   Usar lock otimista ou skip-if-already-processing para evitar duplicação
   (mesmo padrão do scheduler de materiais do Sprint 4).

2. Testar:
   # Criar post com publish_at 1 minuto no futuro
   FUTURE=$(date -u -d '+1 minute' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+1M +%Y-%m-%dT%H:%M:%SZ)
   curl -s -X POST http://localhost:3000/api/content/posts \
     -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
     -d "{\"type\":\"notice\",\"title\":\"Post agendado\",\"body\":\"Teste de agendamento\",\"is_draft\":false,\"publish_at\":\"$FUTURE\"}" | jq .

   # Esperar 5 minutos, depois verificar que published_at foi preenchido
   # Ou: disparar manualmente o cron para teste

Não implementar OneSignal ainda — o notifyPost pode ser um stub que loga no console.
```

---

#### Passo 4 — Integração OneSignal (disparo de push)

**Prompt para Claude Code:**
```
Sprint 6 · Passo 4 — Integração OneSignal para push notifications

Contexto: Posts e Scheduler funcionando. NotificationsService existe como stub.

VARIÁVEIS DE AMBIENTE (adicionar ao .env.example):
ONESIGNAL_APP_ID=<app id>
ONESIGNAL_API_KEY=<rest api key>

IMPLEMENTAR:

1. NotificationsService (src/content/notifications.service.ts):

   notifyPost(post: ContentPost, segments: AudienceSegment[]):
   - Montar payload OneSignal:
     {
       app_id: process.env.ONESIGNAL_APP_ID,
       headings: { en: post.title },
       contents: { en: truncar body em 200 chars },
       filters: montar filtros baseados nos segments (ver lógica abaixo),
       data: { post_id: post.id, type: post.type }
     }
   - POST https://onesignal.com/api/v1/notifications
   - Headers: { "Authorization": "Basic <ONESIGNAL_API_KEY>" }
   - Criar NotificationDispatch: channel 'push', onesignal_notification_id, sent_at
   - Se ONESIGNAL_APP_ID não configurado → logar warning, não falhar

   Lógica de filtros OneSignal baseada em segments.criteria:
   - congregation_ids → filter: { field: "tag", key: "congregation_id", value: id }
   - group_ids → filter: { field: "tag", key: "pg_ids", relation: "=", value: id }
   - roles → filter: { field: "tag", key: "role", value: role }
   - Se múltiplos critérios: combinar com OR entre groups, AND entre types
   - Se segment vazio (sem critérios) → enviar para todos do tenant

   LGPD: nunca enviar nome, email ou dado financeiro como tag.
   Tags permitidas: tenant_id, congregation_id, role, pg_ids, language.

   sendManualNotification(dto, user):
   - Endpoint para envio manual (não vinculado a post)
   - dto: { title, body, segment_ids }
   - Mesmo fluxo do notifyPost mas sem post vinculado

2. Controller — adicionar ao PostsController ou criar NotificationsController:
   - POST /content/notifications/send → @Roles('admin_congregation', 'pastor', 'tenant_admin')
     Body: { title, body, segment_ids }

3. Atualizar SchedulerService:
   - Após published_at = now(), chamar notificationsService.notifyPost()

4. Testar:
   # Sem OneSignal configurado → deve logar warning e criar dispatch com onesignal_notification_id = null
   curl -s -X POST http://localhost:3000/api/content/notifications/send \
     -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
     -d '{"title":"Teste push","body":"Mensagem de teste","segment_ids":[]}' | jq .

   # Verificar que NotificationDispatch foi criado
   # Verificar que não houve erro (graceful degradation sem OneSignal)

Se ONESIGNAL_APP_ID não estiver no .env, implementar tudo mas testar cenários
de erro (log warning, dispatch criado com id null). Integração real testada depois.
```

---

#### Passo 5 — Métricas de notificação (callback OneSignal)

**Prompt para Claude Code:**
```
Sprint 6 · Passo 5 — Métricas de notificação (webhook/polling OneSignal)

Contexto: Push notifications sendo disparadas via OneSignal.
NotificationDispatch criado com onesignal_notification_id.

IMPLEMENTAR:

1. NotificationsService.updateMetrics():
   - Cron job a cada 30 minutos: @Cron('*/30 * * * *')
   - Buscar NotificationDispatch com onesignal_notification_id != null
     e sent_at nos últimos 7 dias e (reached IS NULL ou opened IS NULL)
   - Para cada dispatch:
     GET https://onesignal.com/api/v1/notifications/{onesignal_notification_id}
     ?app_id=<ONESIGNAL_APP_ID>
   - Atualizar reached (successful), opened (converted)
   - Rate limit: máx 10 requests por execução do cron

2. Endpoint de consulta de métricas:
   GET /content/notifications/:dispatch_id/metrics
   → @Roles('admin_congregation', 'pastor', 'tenant_admin')
   Retorna: { sent_at, reached, opened, open_rate_pct }

3. Testar (sem OneSignal — mock):
   # Criar dispatch fake via seed ou via passo anterior
   # Verificar que o cron não falha sem credenciais (graceful)
   # Verificar endpoint de métricas retorna dados do dispatch

Se ONESIGNAL_APP_ID não configurado, o cron simplesmente skipa.
```

---

#### Passo 6 — Testes consolidados

**Prompt para Claude Code:**
```
Sprint 6 · Passo 6 — Testes consolidados

Rodar a bateria completa de validação do Sprint 6:

TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fvargaspf@gmail.com","password":"A3dodfemf","tenant_slug":"doca-church"}' \
  | jq -r '.access_token')

echo "=== 1. Criar segmento ==="
SEG=$(curl -s -X POST http://localhost:3000/api/content/segments \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Todos","criteria":{}}' | jq .)
echo $SEG | jq .
SEG_ID=$(echo $SEG | jq -r '.id')

echo "=== 2. Criar post draft ==="
POST=$(curl -s -X POST http://localhost:3000/api/content/posts \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d "{\"type\":\"notice\",\"title\":\"Aviso importante\",\"body\":\"Culto especial nesta sexta.\",\"is_draft\":true,\"segment_ids\":[\"$SEG_ID\"]}" | jq .)
echo $POST | jq .
POST_ID=$(echo $POST | jq -r '.id')

echo "=== 3. Publicar post ==="
curl -s -X POST http://localhost:3000/api/content/posts/$POST_ID/publish \
  -H "Authorization: Bearer $TOKEN" | jq '{id, published_at, is_draft}'

echo "=== 4. Listar posts publicados ==="
curl -s "http://localhost:3000/api/content/posts?is_draft=false" \
  -H "Authorization: Bearer $TOKEN" | jq '{total: .total}'

echo "=== 5. Enviar notificação manual ==="
curl -s -X POST http://localhost:3000/api/content/notifications/send \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d "{\"title\":\"Teste push\",\"body\":\"Mensagem de teste\",\"segment_ids\":[\"$SEG_ID\"]}" | jq .

echo "=== 6. Criar post agendado (5 min futuro) ==="
FUTURE=$(date -u -d '+5 minutes' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+5M +%Y-%m-%dT%H:%M:%SZ)
curl -s -X POST http://localhost:3000/api/content/posts \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d "{\"type\":\"post\",\"title\":\"Post agendado\",\"body\":\"Vai publicar sozinho\",\"is_draft\":false,\"publish_at\":\"$FUTURE\"}" | jq '{id, publish_at, published_at}'

echo "=== 7. Regressão Sprint 5 ==="
curl -s http://localhost:3000/api/financial/categories \
  -H "Authorization: Bearer $TOKEN" | jq '{total: (.data | length)}'
curl -s http://localhost:3000/api/financial/transactions \
  -H "Authorization: Bearer $TOKEN" | jq '{total: .total}'

echo "=== 8. Testes RLS ==="
npm test -- --testPathPattern=rls --runInBand --forceExit

Confirma:
(1) Segmento criado
(2) Post draft criado com segmento vinculado
(3) Post publicado com published_at preenchido
(4) Listagem retorna posts publicados
(5) Notificação dispatch criado (mesmo sem OneSignal)
(6) Post agendado com published_at = null (scheduler publica depois)
(7) Sprint 5 sem regressão
(8) RLS 14/14 passando
```

---

### Matriz de permissões · Sprint 6

| Endpoint | Roles | Notas |
|---|---|---|
| `POST /content/segments` | admin_congregation, pastor, tenant_admin | Criar audiência |
| `GET /content/segments` | + secretary | Leitura ampla |
| `POST /content/posts` | admin_congregation, pastor, tenant_admin | Criar conteúdo |
| `GET /content/posts` | + secretary, member | Member vê só publicados da sua audiência |
| `POST /content/posts/:id/publish` | admin_congregation, pastor, tenant_admin | Publicar draft |
| `DELETE /content/posts/:id` | admin_congregation, tenant_admin | Restrito |
| `POST /content/notifications/send` | admin_congregation, pastor, tenant_admin | Push manual |
| `GET /content/notifications/:id/metrics` | admin_congregation, pastor, tenant_admin | Métricas |

### Decisões técnicas para o Sprint 6

1. **OneSignal tags** — nunca enviar PII. Tags permitidas: `tenant_id`, `congregation_id`, `role`, `pg_ids`, `language` (ADR-009 + orbien-lgpd-mapping.md).

2. **Filtros de segmento** — traduzidos para filtros OneSignal no momento do disparo. Se o segmento não tem critérios, envia para todos com `tag: tenant_id = X`.

3. **Graceful degradation** — se `ONESIGNAL_APP_ID` não está configurado, o sistema cria o `NotificationDispatch` com `onesignal_notification_id = null` e loga warning. Nenhum endpoint falha por falta de OneSignal.

4. **Scheduler** — mesmo padrão do Sprint 4 (polling 5min via `@Cron`). Posts com `publish_at <= now()` e `published_at IS NULL` são publicados automaticamente.

5. **Media** — `media_url` é uma URL direta (R2 para uploads, YouTube/Vimeo/Spotify para links externos). O upload em si usa o mesmo fluxo do Sprint 4 (R2 presigned URL). Não recriar upload — reusar.

6. **RLS** — `content_posts`, `audience_segments` e `notification_dispatches` seguem Padrão B (tenant + congregation). Policies já devem existir das migrations de FORCE RLS. Se não existirem, criar na primeira migration do Sprint 6.

### Débitos técnicos em aberto (não bloqueia Sprint 6)

| ID | Débito | Status |
|---|---|---|
| DT-02 | Migração Supabase sa-east-1 | 🔴 Pendente — go-live blocker |
| DT-03 | Timeout 30s | 🟡 Some com DT-02 |
| DT-04 | Onboarding de tenant | 🟡 Desbloqueado |
| DT-05 | Soft delete + anonimização LGPD | 🟡 Desbloqueado |
| DT-06 | Importação CSV/Excel | ⚪ Sprint 9 |

### Após Sprint 6, os próximos sprints são

- **Sprint 7** — Voluntariado e Escalas (Ministry, VolunteerProfile, Assignment)
- **Sprint 8** — Celebrações e Ordem de Celebração (Celebration, ServiceOrder, Setlist)
- **Sprint 9** — Exportação contábil e relatórios avançados (DRE, fluxo de caixa, Excel/PDF)

---

*Gerado em 2026-06-08 · Baseado nos arquivos do Project Orbien e no briefing do Sprint 5.*

