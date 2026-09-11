# Preferências de notificação (mobile) — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and follow
its Execute flow and Critical Rules.** Do not search for skill files by
filesystem path. The skill is the source of truth for the full flow
(per-task cycle, sub-agent delegation, adequacy review, Verifier,
discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed
without it.**

---

**Design**: `.specs/features/preferencias-notificacao-mobile/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Gerado por amostragem do repositório (`apps/api/test/rls/isolation.spec.ts`,
> `apps/api/test/integration/songs.spec.ts`, `apps/api/src/songs/*.spec.ts`,
> `apps/api/src/volunteers/unavailability.*.spec.ts`,
> `apps/mobile/src/lib/notifications/onesignal-client.test.ts`,
> `apps/mobile/src/lib/content/content-client.test.ts`,
> `apps/mobile/src/__tests__/app/indisponibilidade.test.tsx`) e do
> `CLAUDE.md` raiz (RLS: `USING`/`WITH CHECK` simétricos, `bootstrap-db.sh`
> valida nos dois sentidos). Nenhum `AGENTS.md` de `apps/api` foi encontrado
> (não existe); convenções vieram só da amostragem de código. Confirmar antes
> do Execute.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| Prisma schema/migration (`NotificationPreference`) | none | build gate only (`prisma generate`/`migrate dev` sem erro) | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/**` | `npm run build:api` |
| RLS (`008_rls_notification_preferences.sql`) | RLS | Leitura/escrita cross-tenant negada; cross-congregação negada em leitura e escrita (AD-001, `USING`==`WITH CHECK`); mesma conta em congregação própria lê/escreve | `apps/api/test/rls/isolation.spec.ts` (novo describe numerado) | `npm run test:rls -w orbien-backend` |
| `notification-categories.ts` (mapeamento) | unit | Todo valor de `ContentPostType` mapeado numa categoria válida | `apps/api/src/content/*.spec.ts` (`testMatch` do jest da API é `<rootDir>/test/**/*.spec.ts` — **não** roda `src/**/*.spec.ts` por padrão; confirmar config antes do Execute, ver Risco T4) | `npm run test:unit -w orbien-backend` |
| `NotificationPreferencesService` | unit | 1:1 com AC de MOB-10a: default 4×`true` sem linha, upsert cria/atualiza, `tenant_id`/`congregation_id` do contexto | mesmo padrão de `apps/api/src/volunteers/unavailability.service.spec.ts` | `npm run test:unit -w orbien-backend` |
| `NotificationPreferencesController` | unit | Rotas GET/PATCH chamam o service com `user.sub`/`tenant_id`/`congregation_id` corretos, sem `@Roles` | mesmo padrão de `apps/api/src/volunteers/unavailability.controller.spec.ts` | `npm run test:unit -w orbien-backend` |
| `ContentModule` (wiring) | unit | Novo controller/service resolvem via DI | mesmo padrão de `apps/api/src/volunteers/volunteers.module.spec.ts` | `npm run test:unit -w orbien-backend` |
| Rota HTTP completa (GET/PATCH `/me/notification-preferences`) | integration | Caminho feliz (GET default, PATCH persiste, GET reflete) + isolamento entre contas | mesmo padrão de `apps/api/test/integration/songs.spec.ts` | `npm run test:integration -w orbien-backend` |
| `NotificationsService.notifyPost` (filtro de categoria) | unit | Categoria ligada não muda o filtro existente; categoria desligada gera o `!=` correto; `sendManualNotification` não ganha o filtro | `apps/api/test/**/notifications.service.spec.ts` (mesmo arquivo, novos casos) | `npm run test:unit -w orbien-backend` |
| `notification-preferences-client.ts` (mobile) | unit | GET/PATCH chamam `authenticatedRequest` com method/path/body corretos | mesmo padrão de `apps/mobile/src/lib/content/content-client.test.ts` | `npm run test -w orbien-mobile` |
| `onesignal-client.syncNotificationPreferenceTags` | unit | `addTags` chamado com as 4 chaves `pref_*` como string `"true"`/`"false"` | mesmo padrão de `apps/mobile/src/lib/notifications/onesignal-client.test.ts` | `npm run test -w orbien-mobile` |
| `NotificationsProvider` (sync no login) | unit | Após `registerDevice`, busca preferências e sincroniza tags; falha de rede não propaga | mesmo padrão de `apps/mobile/src/lib/notifications/notifications-provider.test.tsx` | `npm run test -w orbien-mobile` |
| Tela `notificacoes.tsx` | unit (component) | 4 toggles, estado inicial do GET, otimista+revert no erro, chama sync ao salvar | mesmo padrão de `apps/mobile/src/__tests__/app/indisponibilidade.test.tsx` | `npm run test -w orbien-mobile` |
| `perfil.tsx` (navegação nova) | unit (component) | Linha "Notificações" navega para `/notificacoes` | arquivo de teste existente da tela (se houver) ou novo colocado ao lado | `npm run test -w orbien-mobile` |

**Coverage Expectation** segue o piso "1:1 com spec AC + casos de borda
listados" para camada de domínio/serviço e "feliz + borda + erro" para
rota/e2e — mesmo piso que as tabelas já entregues do projeto (nenhuma
tabela nova nasce com menos verificação que `songs`).

## Gate Check Commands

| Gate Level | When to Use | Command |
|---|---|---|
| Quick (API, unit) | Após tasks de service/controller/mapeamento/módulo | `npm run test:unit -w orbien-backend` |
| RLS | Após a task da migration/RLS/teste de isolamento | `npm run test:rls -w orbien-backend` (requer `bootstrap-db.sh` já rodado nesta sessão — confirmado no hook de start) |
| Integration | Após a task de teste HTTP | `npm run test:integration -w orbien-backend` |
| Mobile (unit) | Após qualquer task em `apps/mobile` | `npm run test -w orbien-mobile` |
| Build | Ao fechar cada fase | `npm run build:api && npm run build:web` (build do mobile fica fora do `turbo run build` — ver Assumptions de `app-mobile/spec.md`) e `turbo run lint` |

---

## Execution Plan

### Phase 1: Schema, migration e RLS (backend, fundação)

```
T1 → T2 → T3
```

### Phase 2: Domínio e API (backend)

```
T4 → T5 → T6 → T7 → T8
```

### Phase 3: Disparo respeita preferência (backend)

```
T9
```

### Phase 4: Cliente mobile e sincronização OneSignal

```
T10 → T11 → T12
```

### Phase 5: Tela de preferências (mobile)

```
T13 → T14
```

---

## Task Breakdown

### T1: Modelo `NotificationPreference` no schema Prisma + migration

**What**: adicionar o model `NotificationPreference` a `schema.prisma`
(campos `id`, `tenant_id`, `congregation_id`, `user_account_id` único,
`avisos`/`oracao`/`eventos`/`devocional` boolean default `true`,
`created_at`/`updated_at`), relações inversas em `Tenant`, `Congregation`,
`UserAccount` (1:1 nesta última), e gerar a migration Prisma
(`npx prisma migrate dev --name add_notification_preferences`, rodada a
partir de `apps/api`).
**Where**: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_add_notification_preferences/`
**Depends on**: None
**Reuses**: `model Song` (`schema.prisma:1207`) como template de tabela
tenant+congregação nova
**Requirement**: MOB-10a, MOB-10b (fundação de ambas)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Model e relações inversas adicionados, `npx prisma generate` sem erro
- [ ] Migration criada e aplicável (`npx prisma migrate deploy` local sem erro)
- [ ] `npm run build:api` passa

**Tests**: none (schema/migration — build gate only)
**Gate**: build

**Commit**: `feat(api): adiciona modelo NotificationPreference`

---

### T2: Script de RLS `008_rls_notification_preferences.sql` + `bootstrap-db.sh`

**What**: criar o script de RLS (AD-001: `app_congregation_allowed()` em
`USING` e `WITH CHECK`, `ENABLE`+`FORCE ROW LEVEL SECURITY`), adicioná-lo ao
passo 3 do `bootstrap-db.sh` (mesmo guard `if [ -f ... ]` de `002`-`007`) e
a uma nova asserção no passo de verificação (policy existe e é simétrica —
mesmo formato das de `004`/`006`).
**Where**: `apps/api/prisma/migrations/008_rls_notification_preferences.sql`, `apps/api/scripts/bootstrap-db.sh`
**Depends on**: T1
**Reuses**: `apps/api/prisma/migrations/007_rls_songs.sql` (template quase
literal — troca só o nome da tabela)
**Requirement**: MOB-10a, MOB-10b

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `bash apps/api/scripts/bootstrap-db.sh` roda do zero sem erro, com a
      nova policy relatada na verificação
- [ ] Asserção nova falha propositalmente ao quebrar a simetria `USING`/
      `WITH CHECK` (testado nos dois sentidos, mesmo princípio das
      asserções de `003`/`006`)

**Tests**: none (validado pelo RLS test em T3, que depende do bootstrap já
rodar limpo)
**Gate**: build

**Commit**: `feat(api): habilita RLS de notification_preferences (AD-001)`

---

### T3: Teste de isolamento RLS de `notification_preferences`

**What**: novo describe numerado em `isolation.spec.ts` (seguindo o padrão
do bloco "23. Songs — isolamento por congregação"): Tenant B não lê
`NotificationPreference` do Tenant A; dentro do mesmo tenant, congregação
irmã não lê nem escreve (nem com `tenant_admin`, que aqui não tem exceção —
é dado de conta, não dado administrável entre congregações); a própria
conta, no próprio tenant/congregação, lê e escreve.
**Where**: `apps/api/test/rls/isolation.spec.ts`
**Depends on**: T1, T2
**Reuses**: bloco "23. Songs" como template de estrutura/fixtures
**Requirement**: MOB-10a

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `npm run test:rls -w orbien-backend` passa com os casos novos
- [ ] Removendo a policy do `008`, os testes novos falham (verificado nos
      dois sentidos, mesmo princípio já exigido no resto do arquivo)

**Tests**: RLS
**Gate**: RLS (`npm run test:rls -w orbien-backend`)

**Commit**: `test(api): isolamento RLS de notification_preferences`

---

### T4: `notification-categories.ts` — mapeamento compartilhado

**What**: criar `NOTIFICATION_CATEGORIES`, `NotificationCategory` e
`CATEGORY_BY_POST_TYPE` (os 8 valores de `ContentPostType` → 4 categorias,
conforme Assumptions da spec) + teste que trava cobertura total do enum.
**Where**: `apps/api/src/content/notification-categories.ts`
**Depends on**: None (independe da Fase 1 — é constante pura)
**Reuses**: nenhum código existente; espelha o espírito de
`roles-invariant.spec.ts` (invariante que barra enum crescendo sem entrar
em algum grupo)
**Requirement**: MOB-10a, MOB-10b

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Os 8 valores de `ContentPostType` cobertos, teste falha se um valor
      novo do enum não estiver mapeado (adicionar um valor fake ao mock e
      confirmar falha, depois reverter)
- [ ] **Risco de config a confirmar antes deste task rodar**: o `jest` da
      API usa `testMatch: ['<rootDir>/test/**/*.spec.ts']` (nota já
      registrada em `app-mobile`/outras specs) — um `.spec.ts` dentro de
      `src/content/` pode não ser coletado. Confirmar `jest.config` do
      projeto `unit` antes de escrever o arquivo; se `src/**/*.spec.ts` não
      roda, colocar o teste em `apps/api/test/unit/notification-categories.spec.ts`
      em vez de ao lado do arquivo-fonte — **decisão a tomar no início desta
      task, não suposição do design**

**Tests**: unit
**Gate**: quick

**Commit**: `feat(api): mapeamento de categoria de notificação por tipo de post`

---

### T5: `NotificationPreferencesService`

**What**: `get(userId)` (default 4×`true` sem linha) e
`update(userId, tenantId, congregationId, patch)` (`upsert`).
**Where**: `apps/api/src/content/notification-preferences.service.ts`
**Depends on**: T1, T4
**Reuses**: `apps/api/src/volunteers/unavailability.service.ts` como
esqueleto (`this.prisma.client`, sem `resolveProfile` — aqui a FK já é
`UserAccount.id` direto)
**Requirement**: MOB-10a

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `get` sem linha existente devolve os 4 `true` sem criar registro
- [ ] `update` cria na primeira chamada e atualiza nas seguintes
      (`upsert`), preservando os campos não incluídos no patch

**Tests**: unit
**Gate**: quick

**Commit**: `feat(api): NotificationPreferencesService`

---

### T6: `NotificationPreferencesController` + DTO

**What**: `GET /me/notification-preferences` e
`PATCH /me/notification-preferences` (DTO `UpdateNotificationPreferencesDto`
com os 4 campos boolean opcionais, `class-validator`), sem `@Roles` (rota
de dado da própria conta).
**Where**: `apps/api/src/content/notification-preferences.controller.ts`, `apps/api/src/content/dto/update-notification-preferences.dto.ts`
**Depends on**: T5
**Reuses**: `apps/api/src/volunteers/unavailability.controller.ts` (guard
`JwtAuthGuard`+`RolesGuard` sem `@Roles`, `@UseInterceptors(TenantContextInterceptor)`,
`@CurrentUser() user: JwtPayload`)
**Requirement**: MOB-10a

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] GET chama `service.get(user.sub)`
- [ ] PATCH chama `service.update(user.sub, user.tenant_id, user.congregation_id, dto)`
- [ ] DTO rejeita campo não-boolean com 400 (`class-validator` já aplicado
      globalmente no projeto — confirmar `ValidationPipe` global antes de
      assumir)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(api): rota /me/notification-preferences`

---

### T7: Wiring no `ContentModule`

**What**: registrar `NotificationPreferencesController`/`Service` em
`content.module.ts`.
**Where**: `apps/api/src/content/content.module.ts`
**Depends on**: T6
**Reuses**: `apps/api/src/volunteers/volunteers.module.spec.ts` como
template de teste de DI
**Requirement**: MOB-10a

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `moduleRef.get(NotificationPreferencesService)` resolve no teste
- [ ] `npm run build:api` passa

**Tests**: unit
**Gate**: quick

**Commit**: `feat(api): registra NotificationPreferences no ContentModule`

---

### T8: Teste de integração HTTP

**What**: `GET`/`PATCH /me/notification-preferences` ponta a ponta (sobe
`AppModule`, fala HTTP) — default 4×`true`, PATCH persiste, GET seguinte
reflete, conta B não lê/edita preferência de conta A pelo id (ainda que a
rota nem aceite id — teste documenta que a rota é sempre "a própria conta").
**Where**: `apps/api/test/integration/notification-preferences.spec.ts`
**Depends on**: T1–T7
**Reuses**: `apps/api/test/integration/songs.spec.ts` como esqueleto de
setup (app, tokens, cleanup)
**Requirement**: MOB-10a

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `npm run test:integration -w orbien-backend` passa com os casos novos
- [ ] Cobre AC1 (default ligado), AC2 (persistência), AC4 (mesma conta,
      lido de novo) da história "Escolher categorias de notificação"

**Tests**: integration
**Gate**: integration

**Commit**: `test(api): fluxo HTTP de /me/notification-preferences`

---

### T9: `NotificationsService.notifyPost` respeita a categoria

**What**: estender `OneSignalFilter` (`relation: '=' | '!='`), e em
`notifyPost` empilhar
`{ field: 'tag', key: 'pref_' + CATEGORY_BY_POST_TYPE[post.type], relation: '!=', value: 'false' }`
ao array que `buildFilters` devolve, antes do `dispatch`.
`sendManualNotification` fica inalterado (fora do escopo, ver design.md).
**Where**: `apps/api/src/content/notifications.service.ts`
**Depends on**: T4
**Reuses**: `buildFilters`/`dispatch` existentes, sem reescrevê-los
**Requirement**: MOB-10b

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `notifyPost` de um post `type: 'event'` inclui
      `{field:'tag',key:'pref_eventos',relation:'!=',value:'false'}` no
      payload enviado ao fetch mockado
- [ ] `sendManualNotification` não ganha filtro de categoria (teste que
      afirma ausência)
- [ ] Testes existentes de `buildFilters` continuam passando sem alteração
      (a mudança é aditiva, não toca `buildFilters`)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(api): disparo de push respeita preferência de categoria`

---

### T10: `notification-preferences-client.ts` (mobile)

**What**: `getNotificationPreferences()` e
`updateNotificationPreferences(patch)` sobre `authenticatedRequest`.
**Where**: `apps/mobile/src/lib/notifications/notification-preferences-client.ts`
**Depends on**: None (independe do backend para o teste — mocka
`authenticatedRequest`; integração real só no Execute manual/QA)
**Reuses**: `apps/mobile/src/lib/content/content-client.ts` como template
**Requirement**: MOB-10a

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `getNotificationPreferences` chama `authenticatedRequest("get", "/me/notification-preferences")`
- [ ] `updateNotificationPreferences(patch)` chama
      `authenticatedRequest("patch", "/me/notification-preferences", { body: patch })`

**Tests**: unit
**Gate**: quick (`npm run test -w orbien-mobile`)

**Commit**: `feat(mobile): cliente de /me/notification-preferences`

---

### T11: `onesignal-client.syncNotificationPreferenceTags`

**What**: nova função que chama `OneSignal.User.addTags` com as 4 chaves
`pref_avisos`/`pref_oracao`/`pref_eventos`/`pref_devocional`, valores
convertidos para string `"true"`/`"false"`.
**Where**: `apps/mobile/src/lib/notifications/onesignal-client.ts`
**Depends on**: None
**Reuses**: mesmo arquivo, mesmo estilo de `registerDevice`
**Requirement**: MOB-10b

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `addTags` chamado com as 4 chaves como string, nunca boolean (tags
      OneSignal são sempre string — mesma checagem que `role` já faz hoje)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(mobile): sincroniza preferência de notificação como tag OneSignal`

---

### T12: `NotificationsProvider` sincroniza no login

**What**: no `useEffect([session])`, depois de `registerDevice`, buscar
`getNotificationPreferences()` e chamar `syncNotificationPreferenceTags`;
falha (rede/erro) é engolida, sem propagar.
**Where**: `apps/mobile/src/lib/notifications/notifications-provider.tsx`
**Depends on**: T10, T11
**Reuses**: mesmo efeito já existente, só estendido
**Requirement**: MOB-10b

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Sessão válida → `registerDevice` e, na sequência,
      `syncNotificationPreferenceTags` chamados com o resultado do GET
- [ ] GET falhando (rede) não lança erro não tratado nem impede a
      navegação (mesmo padrão de `registerDevice` com token indecodificável)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(mobile): sincroniza tags de preferência ao autenticar`

---

### T13: Tela `notificacoes.tsx`

**What**: tela com os 4 toggles (Avisos, Pedidos de oração, Eventos,
Conteúdo devocional); GET no mount; toggle dispara PATCH otimista da
categoria isolada, com fila por categoria (não uma fila global — Edge Case
da spec); erro reverte o toggle e mostra mensagem; sucesso chama
`syncNotificationPreferenceTags` com o estado completo resultante.
**Where**: `apps/mobile/src/app/notificacoes.tsx`
**Depends on**: T10, T11
**Reuses**: `apps/mobile/src/app/indisponibilidade.tsx` (esqueleto de tela
solta), `Card`/`SectionLabel`/tokens de `perfil.tsx`
**Requirement**: MOB-10a, MOB-10b

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Mount sem preferência salva mostra as 4 ligadas (AC1)
- [ ] Toggle bem-sucedido persiste e chama sync de tag (AC2, AC1 da
      segunda história)
- [ ] Toggle com falha reverte visualmente e mostra erro (AC3)
- [ ] Duas categorias tocadas em sequência rápida não se atropelam
      (Edge Case)

**Tests**: unit (component)
**Gate**: quick

**Commit**: `feat(mobile): tela de preferências de notificação`

---

### T14: Entrada de navegação em `perfil.tsx`

**What**: nova linha "Notificações" na seção "Conta" de `perfil.tsx`,
navegando para `/notificacoes`.
**Where**: `apps/mobile/src/app/(tabs)/perfil.tsx`
**Depends on**: T13
**Reuses**: padrão visual já usado nas outras linhas da tela
**Requirement**: MOB-10a

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Tocar "Notificações" chama `router.push("/notificacoes")`
- [ ] Teste existente de `perfil.tsx` (se houver) continua passando +
      caso novo cobrindo a navegação

**Tests**: unit (component)
**Gate**: quick

**Commit**: `feat(mobile): acesso a preferências de notificação em Perfil`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ──→ T2 ──→ T3
Phase 2:  T4 ──→ T5 ──→ T6 ──→ T7 ──→ T8
Phase 3:  T9
Phase 4:  T10 ──→ T11 ──→ T12
Phase 5:  T13 ──→ T14
```

Execução estritamente sequencial — sem paralelismo intra-fase.

**Nota de dependência real vs. diagrama**: T9 depende só de T4 (não de T5–T8),
e T10/T11 não dependem de nada do backend — ficam em fases separadas por
coesão (a Fase 3 é "o disparo respeita a preferência", a Fase 4 é "o cliente
sincroniza"), não porque a ordem de execução exija. Se o batching de
sub-agentes tratar cada fase como unidade, isso é aceitável: a ordem
numérica (1→5) ainda é uma ordem válida de execução, só não é a única.

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1: Model + migration | 1 arquivo de schema + 1 migration gerada | ✅ Granular |
| T2: Script RLS + bootstrap | 2 arquivos, uma unidade coesa (script + wiring do mesmo script) | ✅ Granular |
| T3: Teste RLS | 1 arquivo (novo describe) | ✅ Granular |
| T4: Mapeamento de categoria | 1 arquivo + teste | ✅ Granular |
| T5: Service | 1 arquivo (2 métodos) | ✅ Granular |
| T6: Controller + DTO | 2 arquivos, uma unidade coesa (rota + seu DTO) | ✅ Granular |
| T7: Wiring de módulo | 1 arquivo | ✅ Granular |
| T8: Teste de integração | 1 arquivo | ✅ Granular |
| T9: Filtro de categoria no disparo | 1 arquivo (função existente estendida) | ✅ Granular |
| T10: Cliente mobile | 1 arquivo | ✅ Granular |
| T11: Tag OneSignal | 1 função, mesmo arquivo existente | ✅ Granular |
| T12: Provider | 1 arquivo (efeito existente estendido) | ✅ Granular |
| T13: Tela | 1 arquivo (1 tela) | ✅ Granular |
| T14: Navegação em Perfil | 1 arquivo (1 linha nova) | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | — (início) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T1, T2 | T2 → T3 (T1 transitivo via T2) | ✅ Match |
| T4 | None | — (início de cadeia própria) | ✅ Match |
| T5 | T1, T4 | T4 → T5 (T1 é de fase anterior, já concluída) | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T1–T7 | T7 → T8 (cadeia completa das fases 1–2) | ✅ Match |
| T9 | T4 | Fase 3 isolada, mas T4 já concluído na Fase 2 | ✅ Match |
| T10 | None | — (início de cadeia própria) | ✅ Match |
| T11 | None | — (início de cadeia própria) | ✅ Match |
| T12 | T10, T11 | T10 → T11 → T12 | ✅ Match |
| T13 | T10, T11 | Fase 5, mas T10/T11 já concluídos na Fase 4 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |

Nenhuma dependência aponta para uma fase posterior — todas apontam para trás
ou para a mesma fase, mesmo quando a fase "dona" da dependência já fechou
antes (T5→T1, T9→T4, T13→T10/T11).

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1 | Schema/migration | none | none | ✅ OK |
| T2 | RLS script | none (verificado por T3) | none | ✅ OK |
| T3 | Teste RLS | RLS | RLS | ✅ OK |
| T4 | Mapeamento de categoria | unit | unit | ✅ OK |
| T5 | Service | unit | unit | ✅ OK |
| T6 | Controller + DTO | unit | unit | ✅ OK |
| T7 | Módulo | unit | unit | ✅ OK |
| T8 | Rota HTTP completa | integration | integration | ✅ OK |
| T9 | Service (notifyPost) | unit | unit | ✅ OK |
| T10 | Cliente mobile | unit | unit | ✅ OK |
| T11 | onesignal-client | unit | unit | ✅ OK |
| T12 | Provider | unit | unit | ✅ OK |
| T13 | Tela | unit (component) | unit (component) | ✅ OK |
| T14 | Tela (perfil) | unit (component) | unit (component) | ✅ OK |

Nenhuma violação — nenhuma task usa "testado em outra task" como
justificativa para pular teste.
