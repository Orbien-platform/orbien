# App Mobile — Design (MOB-01, MOB-02, MOB-03, MOB-11, MOB-12)

**Spec**: `.specs/features/app-mobile/spec.md`
**Status**: Draft
**Escopo desta rodada de Design**: autenticação (MOB-01), refresh serializado
(MOB-02), tema por tenant (MOB-03), scaffold do workspace (MOB-11) e
config dinâmica de identidade multi-variante (MOB-12). Os módulos de
domínio (escala, conteúdo/push, celebrações, PG — MOB-04 a MOB-10) ficam
para uma rodada de Design própria, quando entrarem em Tasks.

---

## Approach Exploration

A decisão que mais afeta o resto do app é **como o app fala com a API e
guarda sessão**, porque tema (MOB-03), OneSignal (MOB-07, fora desta rodada)
e todo módulo de domínio dependem disso.

### Opção A — Espelhar o padrão do `apps/web` (fila de refresh no cliente axios)

Réplica do interceptor de `apps/web/src/lib/api.ts`: instância axios com
interceptor de response, `isRefreshing`/`failedQueue`, 401 dispara refresh
único e reexecuta a fila. Único ajuste: o mobile fala **direto com a API**
(`Authorization: Bearer`), sem rota Next intermediária — o web usa
`/api/session/refresh` porque só o servidor Next vê o cookie; o mobile não
tem essa camada, então o próprio interceptor chama `POST /auth/refresh` e
regrava o `expo-secure-store` diretamente.

- **Prós**: mesmo princípio já validado em produção (`apps/web`); zero
  padrão novo a aprender; a spec (Assumptions, linha "Renovação de sessão")
  já aponta essa direção.
- **Contras**: nenhum specífico a RN — `expo-secure-store` é assíncrono
  (Promise-based), então o interceptor precisa `await` a leitura/escrita,
  diferente do cookie automático do browser; é só adaptação, não redesenho.

### Opção B — Biblioteca de auth dedicada (ex.: `react-query` + `axios` com
retry via plugin de terceiros)

- **Prós**: menos código próprio para manter a fila.
- **Contras**: `CLAUDE.md` já registra que `@tanstack/react-query` está no
  `package.json` do monorepo mas **não é o padrão usado** em nenhum app
  (web busca dado com `useEffect` + axios) — introduzir react-query só no
  mobile cria um terceiro padrão de data-fetching no monorepo sem
  necessidade. Rejeitada por inconsistência deliberada com a convenção já
  registrada.

### Opção C — Delegar renovação ao interceptor nativo do Expo (`expo-auth-session`)

- **Contras**: `expo-auth-session` é desenhado para OAuth/OIDC (fluxo de
  authorization code com IdP externo); o Orbien usa login próprio
  (email+senha+tenant_slug) contra `POST /auth/login` — não há IdP para
  esse fluxo se encaixar. Rejeitada por não corresponder ao protocolo real.

**Recomendação: Opção A.** É a única que reaproveita um padrão já
comprovado no monorepo (mesmo princípio de fila serializada) e não introduz
dependência nova. Confirmado como a direção a seguir para MOB-01/02.

---

## Architecture Overview

```mermaid
graph TD
    A[App start] --> B{SecureStore tem sessão?}
    B -- não --> L[Tela de Login]
    B -- sim --> C[AuthProvider hidrata contexto]
    L -->|POST /auth/login OK| C
    C --> D[ThemeProvider: aplica branding cacheado]
    D --> E[GET /settings em paralelo]
    E -->|sucesso| F[atualiza tema + cache local]
    E -->|falha/sem branding| G[mantém tema padrão Orbien, sem erro visível]
    C --> H[Navigation shell: tabs dos módulos]
    H --> I[ApiClient]
    I -->|401| J[Refresh Queue serializada]
    J -->|sucesso| I
    J -->|falha: refresh revogado| K[Limpa SecureStore, volta para Login]
```

`app.config.js` (MOB-12) roda em **build time** (resolve identidade do
profile) e expõe o resultado em runtime via `Constants.expoConfig.extra` —
não faz parte do fluxo de runtime acima, é a camada abaixo de tudo isso.

---

## Code Reuse Analysis

`apps/api` e os fronts são deploys independentes (regra do monorepo:
"Nada que rode na Vercel deve importar código de `apps/api`") — o mobile
segue a mesma regra. Reuso aqui é de **contrato**, não de código importado:

| Contrato de origem | Localização (fonte da verdade) | Como o mobile reusa |
| --- | --- | --- |
| `LoginDto` / resposta de login | `apps/api/src/auth/` (`POST /auth/login` → `{access_token, refresh_token, expires_in}`) | Mobile define `LoginResponse` local com os mesmos campos — sem importar o DTO do Nest. |
| `JwtPayload` (claims) | `apps/api/src/auth/` | Mobile não decodifica o JWT para lógica de negócio (evita duplicar regra que é do backend); só lê `expires_in` para agendar refresh preventivo. |
| `POST /auth/refresh` (`RefreshDto`) | `apps/api/src/auth/` | Interceptor da Opção A chama essa rota com o `refresh_token` do SecureStore. |
| `ResolvedSettings` (branding) | `apps/api/src/settings/settings.service.ts:13-28`, `GET /settings` | Mobile define `Branding` local espelhando `branding: {app_name, primary_color, logo_url, splash_url}`. Confirmado: `GET /settings` **não** tem `@Roles` (`settings.controller.ts:30`) — qualquer usuário autenticado pode chamar, inclusive membro comum; não há bloqueio a resolver aqui. |
| Padrão de fila de refresh | `apps/web/src/lib/api.ts:34-64` | Mesma máquina de estados (`isRefreshing`/`failedQueue`), adaptada para `expo-secure-store` assíncrono e `Authorization: Bearer` em vez de cookie. |

### Integration Points

| Sistema | Método de integração |
| --- | --- |
| `apps/api` `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` | HTTPS direto, `Authorization: Bearer <access_token>` nas chamadas autenticadas; login/refresh não levam esse header (ainda não há token). |
| `apps/api` `GET /settings` | Mesma auth Bearer; chamada assim que o `AuthProvider` hidrata, em paralelo à navegação (não bloqueia o shell). |
| EAS (`eas.json`) | Build profiles resolvem `extra` que `app.config.js` lê — sem chamada de rede, é resolução em build time. |

---

## Components

### `AuthClient` (biblioteca interna, não UI)

- **Purpose**: login, logout, guarda de sessão em `expo-secure-store`, fila
  de refresh serializada (Opção A).
- **Location**: `apps/mobile/src/lib/auth/auth-client.ts`
- **Interfaces**:
  - `login(tenantSlug: string, email: string, password: string): Promise<Session>`
  - `logout(): Promise<void>` — chama `POST /auth/logout` best-effort, sempre limpa o SecureStore mesmo se a chamada falhar (não pode deixar o usuário preso logado localmente).
  - `getValidAccessToken(): Promise<string>` — usado pelo `ApiClient`; dispara refresh se expirado, aguarda se um refresh já está em andamento.
- **Dependencies**: `expo-secure-store`, `ApiClient` (chamada crua sem interceptor para as próprias rotas de auth, para não recursar).
- **Reuses**: máquina de estados de `apps/web/src/lib/api.ts:34-64`.

### `ApiClient`

- **Purpose**: cliente HTTP único do app, injeta `Authorization: Bearer`,
  intercepta 401 e delega ao `AuthClient` para renovar + repetir a request original.
- **Location**: `apps/mobile/src/lib/api/client.ts`
- **Interfaces**: `get/post/patch/delete<T>(path, opts): Promise<T>`
- **Dependencies**: `AuthClient`, `Constants.expoConfig.extra.apiUrl` (config, nunca URL hardcoded — mesmo princípio do MOB-12 aplicado à API URL, que também varia por ambiente).
- **Reuses**: mesmo formato de erro que os fronts já tratam (`403` vs. lista vazia — ver Edge Cases da spec).

### `ThemeProvider`

- **Purpose**: aplica `primary_color`/`logo_url` do tenant no shell de
  navegação; evita flash do tema padrão ao reabrir o app (spec MOB-03, AC 3).
- **Location**: `apps/mobile/src/lib/theme/theme-provider.tsx`
- **Interfaces**: `useTheme(): { primaryColor, logoUrl, appName }`
- **Dependencies**: `expo-secure-store` (ou `AsyncStorage` — decisão abaixo em Tech Decisions) para cache local do último branding resolvido; `ApiClient` para `GET /settings`.
- **Reuses**: shape de `ResolvedSettings.branding` (`apps/api/src/settings/settings.service.ts`); fallback documentado no próprio backend (congregação → `branding_configs` → nenhum).

### `app.config.js` + `eas.json` (MOB-12)

- **Purpose**: identidade do app (nome, ícone, bundle id/applicationId,
  scheme, `oneSignalAppId`) resolvida por build profile, nunca hardcoded em
  componente/tela.
- **Location**: `apps/mobile/app.config.js`, `apps/mobile/eas.json`
- **Interfaces**: função `export default ({config}) => ({...config, name, ios, android, extra})`; v1 tem um único profile (`generic`) que resolve para os valores padrão Orbien quando nenhuma env de tenant está setada (spec MOB-12, AC 2).
- **Dependencies**: nenhuma chamada de rede — só `process.env` no momento do build/`expo start`.
- **Reuses**: nada do resto do monorepo (é o primeiro app do workspace a precisar disso — os outros três usam `NEXT_PUBLIC_*` estático, que não serve aqui porque precisa variar o *nome do app na loja*, não só uma env de runtime).

### Navigation shell

- **Purpose**: tab bar com os módulos do escopo (Escala, Conteúdo,
  Celebrações, Grupos) — só o esqueleto nesta rodada, telas de domínio ficam
  para a próxima rodada de Design (MOB-04+).
- **Location**: `apps/mobile/src/app/` (Expo Router, ver Tech Decisions)
- **Dependencies**: `AuthProvider`, `ThemeProvider`.

---

## Data Models

```typescript
// apps/mobile/src/lib/auth/types.ts
interface LoginResponse {
  access_token: string
  refresh_token: string
  expires_in: number // segundos; hoje 900 no backend
}

interface Session {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: number // epoch ms, calculado no cliente a partir de expires_in
}

// apps/mobile/src/lib/theme/types.ts
interface Branding {
  app_name: string | null
  primary_color: string | null
  logo_url: string | null
  splash_url: string | null
}
```

**Relationships**: `Session` vive só no `expo-secure-store` (nunca em
memória JS persistente entre cold starts, nunca em `AsyncStorage`, conforme
Assumptions da spec). `Branding` é cacheado em `AsyncStorage` (não precisa
do Keychain — não é segredo) para permitir reaplicar antes da rede
responder (spec MOB-03, AC 3).

---

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| --- | --- | --- |
| 401 em chamada autenticada, refresh ainda válido | `AuthClient` renova 1x, `ApiClient` repete a request original | Transparente — usuário não percebe |
| 401 em chamada autenticada, refresh revogado/expirado | `AuthClient` limpa SecureStore, `ApiClient` propaga um erro tipado `SessionExpiredError` | App navega para Login |
| `GET /settings` falha (rede ou erro 5xx) | `ThemeProvider` mantém o branding cacheado (ou o padrão Orbien se nunca houve cache) | Sem erro visível — spec MOB-03 AC 2 |
| Sem internet no cold start | `ApiClient` propaga erro de rede distinto de erro de auth | Tela de erro de rede explícita (Edge Cases da spec), nunca tela vazia |
| Duas chamadas expiram junto | Fila do `AuthClient` serializa: a segunda aguarda a Promise da primeira em vez de disparar novo refresh | Transparente |

---

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| --- | --- | --- | --- |
| `expo-secure-store` é assíncrono; um bug de ordenação (ler token antes de gravar) reabriria o mesmo tipo de race que a fila serializada existe para evitar | `apps/mobile/src/lib/auth/auth-client.ts` (a criar) | Duas requests concorrentes poderiam dobrar-refresh e derrubar a família de refresh no backend (mesmo efeito que o Edge Case da spec já cobre) | A fila (Opção A) precisa serializar pelo **estado em memória** (`isRefreshing`), não só pelo SecureStore — mesmo padrão do `apps/web`; task de implementação deve incluir teste de concorrência (duas chamadas simultâneas, 1 refresh disparado). |
| `GET /settings` está liberado para qualquer autenticado hoje (`settings.controller.ts:30`, sem `@Roles`), o que é bom para o mobile — mas se um dia ganhar `@Roles` (ex.: restringindo a admins) por engano, o mobile perderia acesso ao tema para membro comum sem aviso | `apps/api/src/settings/settings.controller.ts:30` | Regressão silenciosa: membro fica sem tema, sem erro (porque MOB-03 AC 2 já manda cair no padrão sem erro visível) — o bug ficaria invisível | Fora do escopo desta feature alterar o backend; registrar aqui para quem mexer em `settings.controller.ts` no futuro. Não é um `AD-NNN` (não é decisão nova, é observação). |
| Nenhum app do monorepo hoje usa Expo Router / navigation — não há convenção local a seguir | — | Risco de inventar padrão que diverge do que o time realmente quer | Ver Tech Decisions abaixo: Expo Router é a recomendação (arquivo-baseado, mesmo mental model de App Router do Next que os 3 fronts já usam) — malha com o que o time já conhece, não com o que RN "geralmente" usa (React Navigation puro). |

---

## Tech Decisions (only non-obvious ones)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Roteamento no mobile | Expo Router (file-based) | Os três fronts já usam Next App Router (file-based); manter o mesmo mental model reduz fricção de contexto ao trocar de app dentro do monorepo. Alternativa (React Navigation configurado manualmente) funciona igual mas não tem esse ganho de familiaridade. |
| Cache de branding | `AsyncStorage`, não `expo-secure-store` | Branding não é segredo (é o que qualquer visitante do site do tenant já vê); Keychain/Keystore é custo desnecessário para dado não sensível — reserva SecureStore só para token, coerente com a distinção que a spec já faz para o `apps/web` (`localStorage` vs. cookie `HttpOnly`, mesmo princípio: sensível vs. não sensível). |
| `app.config.js` roda função pura de `process.env`, sem chamada de API em build time | Config só lê env/`eas.json extra` | Buildar o app não pode depender da API estar no ar; identidade é decidida no momento do build/CI, não em runtime do build tool. |
| App id do OneSignal (MOB-12, AC 4) | Vem de `Constants.expoConfig.extra.oneSignalAppId`, não de import direto de env do SDK | Mesma regra dos outros três campos de identidade — um único mecanismo de config para tudo que precisa variar por profile, em vez de dois (env direta para OneSignal, `app.config.js` para o resto). |

> **Project-level decision** — registrada em `.specs/STATE.md` como
> `AD-002`: single-codebase multi-profile via `app.config.js`/`eas.json`
> é o padrão adotado para `apps/mobile` cobrir Starter e (futura) Premium.
> Ver seção Assumptions do `spec.md` para o texto completo da decisão.

---

# Rodada 2 — MOB-04 (Membros e Voluntários — escala)

**Spec**: `.specs/features/app-mobile/spec.md`, story "P1: Membros e
Voluntários", AC 1-4.
**Status**: Draft
**Escopo desta rodada**: as 4 ACs da story — listar escala (AC1),
confirmar/recusar slot pendente (AC2), check-in em evento (AC3), editar
indisponibilidade (AC4). MOB-05 a MOB-10 continuam fora.

## Gap encontrado ao pesquisar o backend (Knowledge Verification Chain, Step 1)

O sistema de escala antigo (`ScheduleSlot`/`Assignment`,
`apps/api/docs/sprint11.2-fatia4.md`) foi substituído pelo atual
`CelebrationAssignment` (`schema.prisma:1258-1277`). Uma migration antiga
(`20260611135344_add_swap_requests_checkin`) chegou a criar
`volunteer_swap_requests` e um `checked_in_at` em `schedule_assignments` —
mas **nenhum dos dois existe no schema atual**: foram descartados quando o
sistema mudou para `CelebrationAssignment`. Hoje:

- **AC1** (listar escala) — já coberto: `GET /volunteers/my-celebration-assignments`
  (`celebration-volunteer.controller.ts:44`, `celebration-assignment.service.ts:319-375`).
- **AC2** (confirmar/recusar) — já coberto: `PATCH /assignments/:id/respond`
  (`celebration-volunteer.controller.ts:27`, `respondToAssignment`,
  `celebration-assignment.service.ts:276-311`). A spec menciona "trocas,
  SwapRequest" só como referência de princípio (mesma regra de negócio já
  aplicada pela API) — não existe endpoint de troca separado, e não é
  necessário: responder `declined` já é a operação que a API expõe.
- **AC3** (check-in) — **sem backend**. Não há rota, nem campo no modelo.
- **AC4** (indisponibilidade) — já coberto:
  `POST`/`GET /volunteers/unavailability` (`unavailability.controller.ts:30,36`).

**Decisão**: implementar o que falta de AC3 nesta mesma rodada, no
`apps/api`, em vez de cortar a AC do escopo mobile ou fingir que o app
resolve sem servidor. É mudança pequena e localizada (uma coluna + uma
rota), segue exatamente o padrão que `respondToAssignment` já estabelece
para essa mesma tabela, e sem ela o app teria uma aba "Escala" com 3 dos 4
comportamentos da própria user story do MVP.

## Novo endpoint: `PATCH /assignments/:id/check-in`

- **Controller**: `CelebrationRespondController` (mesmo controller de
  `:id/respond` — mesmo recurso, mesmas guards), novo método `checkIn`.
- **Guard/Roles**: `@Roles(...VOLUNTEER_ROLES)` — idêntico a `respond`.
- **Regra de negócio** (`checkInAssignment`, novo método em
  `celebration-assignment.service.ts`, mesmo formato de `respondToAssignment`):
  1. Busca a assignment por `id` + `tenant_id` (RLS/escopo, mesmo padrão).
  2. `ForbiddenException` se `assignment.volunteerProfile.person_id !== personId`
     (mesma checagem "belt-and-suspenders" de `respondToAssignment:295-297`).
  3. `UnprocessableEntityException` se `assignment.status !== confirmed` —
     só se pode fazer check-in de um slot que a pessoa já confirmou (não
     faz sentido check-in de `pending`/`declined`).
  4. `ConflictException` se `checked_in_at` já estiver setado (idempotência
     — segundo toque no botão não deve sobrescrever o horário do primeiro).
  5. `update` com `checked_in_at: new Date()`.
- **Response**: o `CelebrationAssignment` atualizado (mesmo shape de
  `respond`).
- **Sem RLS novo**: `checked_in_at` é coluna em tabela existente
  (`celebration_assignments`), já coberta pela policy de RLS que a tabela
  já tem — não é uma tabela nova, não entra em `00N_rls_*.sql`
  (`AD-001` só se aplica a tabela nova).

### Data Model — alteração

```prisma
model CelebrationAssignment {
  // ...campos existentes
  checked_in_at DateTime? // novo — null até o check-in; setado 1x, imutável depois
}
```

Migration Prisma padrão (`prisma migrate dev`), **não** um script RLS
numerado — só uma coluna nullable em tabela já existente, RLS de linha já
cobre a coluna.

### DTO

Sem body — `PATCH /assignments/:id/check-in` não recebe payload (o
`checked_in_at` é sempre "agora", resolvido no servidor; cliente não deve
poder informar um horário arbitrário).

## Components (mobile)

Não existe tab bar hoje — `app/_layout.tsx` usa um `Stack` único e
`app/index.tsx` é a rota-raiz placeholder pós-login (ver trecho acima,
`ThemedShell`). Introduzir uma tab bar por causa de um módulo só (Escala)
seria arquitetura prematura — essa decisão fica para quando um segundo
módulo de domínio (MOB-06+) justificar o custo. Esta rodada troca o
placeholder de `index.tsx` pela tela real e adiciona uma rota-filha no
mesmo `Stack`.

### Tela "Escala" (rota raiz autenticada)

- **Purpose**: lista os próximos slots do usuário (AC1), permite
  confirmar/recusar um slot `pending` (AC2) e fazer check-in de um slot
  `confirmed` no dia do evento (AC3).
- **Location**: `apps/mobile/src/app/index.tsx` (substitui o placeholder
  atual — texto do nome do app move para o header, que `ThemedShell` já
  preenche via `theme.appName`/`theme.logoUrl`)
- **Dependencies**: `useAuth()` (sessão), `authenticatedRequest` (mesmo
  helper que `theme-provider.tsx` já usa para chamadas autenticadas com
  fila de refresh — ver `auth-client.ts`, Fix F1 do `tasks.md` da rodada 1).
- **Reuses**: `authenticatedRequest<T>()` (já existe, T-F1); padrão de
  estado local (`useState` + `useEffect`) — mesmo princípio do
  `apps/web/src/app/(admin)/voluntarios/page.tsx:169-232` (atualização
  otimista local após responder, sem refetch completo).

### `EscalaClient` (biblioteca interna)

- **Purpose**: wrapper tipado sobre `authenticatedRequest` para as 3 rotas
  de escala (my-assignments, respond, check-in).
- **Location**: `apps/mobile/src/lib/escala/escala-client.ts`
- **Interfaces**:
  - `getMyAssignments(includePast?: boolean): Promise<Assignment[]>`
  - `respondToAssignment(id: string, status: 'confirmed' | 'declined'): Promise<Assignment>`
  - `checkIn(id: string): Promise<Assignment>`
- **Dependencies**: `authenticatedRequest` (auth-client.ts).
- **Reuses**: mesmo princípio de separação `*-client.ts` (lógica) vs. tela
  (UI) que `auth-client.ts`/`theme-provider.tsx` já seguem.

### Tela "Indisponibilidade" (rota-filha)

- **Purpose**: ver/editar datas indisponíveis do mês (AC4).
- **Location**: `apps/mobile/src/app/indisponibilidade.tsx` (nova rota do
  `Stack` existente, navegada a partir de um botão/link na tela de Escala)
- **Dependencies**: `EscalaClient` (extensão com `getUnavailability`/`saveUnavailability`).
- **Reuses**: mesmo contrato de `apps/web/src/components/volunteers/UnavailabilityPanel.tsx`
  (`referenceMonth`/`referenceYear`/`dates[]`), incluindo o padrão de
  cancelamento de request obsoleta (`signal.cancelled`) ao trocar de mês
  rápido.

## Data Models (mobile)

```typescript
// apps/mobile/src/lib/escala/types.ts
interface Assignment {
  id: string
  status: 'pending' | 'confirmed' | 'declined' | 'swapped'
  notified_at: string | null
  responded_at: string | null
  checked_in_at: string | null // novo campo do backend
  celebration: { id: string; name: string }
  ministry: { id: string; name: string }
  scheduled_date: string
  setlist: { songs: SetlistSong[] } | null
}

interface SetlistSong {
  id: string
  sequence: number
  title: string
  key: string | null
  bpm: number | null
  link: string | null
}

interface Unavailability {
  dates: { date: string }[]
}
```

**Relationships**: espelha 1:1 o shape que `getMyAssignments`
(`celebration-assignment.service.ts:353-370`) já devolve, mais o campo
`checked_in_at` novo. Sem estado próprio no cliente além de cache de tela
(sem persistência local — spec não pede offline, Out of Scope da spec
original já corta isso).

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| --- | --- | --- |
| `respond`/`check-in` em assignment que não é do usuário | `403` do backend (já existe/novo, mesma checagem) | Erro genérico — não deveria acontecer via UI normal (a lista só mostra assignments do próprio usuário), tratado como erro inesperado |
| Check-in de slot ainda `pending`/`declined` | `422` do backend | Botão de check-in só aparece/habilita para status `confirmed` na UI — o erro do backend é a segunda linha de defesa, não a primeira |
| Check-in duplicado (`checked_in_at` já setado) | `409` do backend | UI já esconde o botão após o primeiro check-in bem-sucedido (estado local atualizado); erro tratado como no-op silencioso se a race acontecer |
| `respond`/`check-in`/`unavailability` sem rede | `NetworkError` do `ApiClient` (já existe) | Mesmo tratamento genérico de erro de rede que o resto do app (Edge Cases da spec) |

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| --- | --- | --- | --- |
| Novo endpoint de check-in não tem proteção contra check-in "no dia errado" (ex.: fazer check-in de um evento daqui a 3 semanas) | `celebration-assignment.service.ts` (a criar `checkInAssignment`) | Dado incorreto de presença se alguém chamar a rota fora do fluxo normal da UI | Fora de escopo agora — a spec não pede validação de janela de tempo para check-in (só "enviar o check-in e mostrar confirmação visual imediata", AC3). Registrar aqui para não ser esquecido se um requisito de janela aparecer depois; não é AD-NNN (não é decisão de arquitetura, é lacuna de regra de negócio reconhecida). |
| `EscalaClient`/tela nova é o primeiro consumidor real de `authenticatedRequest` fora do `ThemeProvider` — valida que o helper genérico realmente serve para múltiplos domínios, não só o caso original | `apps/mobile/src/lib/auth/auth-client.ts` (`authenticatedRequest`) | Baixo — é reuso direto, não há sinal de acoplamento ao domínio de tema no helper atual | Nenhuma ação necessária; mencionado para registro, não é um risco que bloqueia. |

## Tech Decisions (only non-obvious ones)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Onde implementar check-in | Novo endpoint em `apps/api` (`celebration_assignments.checked_in_at`), não um campo local no mobile | AC3 pede "enviar o check-in" — implica persistência no servidor (outros dispositivos/telas precisam ver o mesmo estado); sem isso a feature não é real, só um toggle visual local. |
| Reaproveitar `volunteer_swap_requests`/`schedule_assignments` da migration descartada | Não — construir em cima de `CelebrationAssignment`, o modelo atual | O sistema de escala mudou de arquitetura depois daquela migration (schedule_assignments não existe mais); ressuscitar uma tabela órfã do sistema antigo introduziria dois modelos de escala paralelos. `CelebrationAssignment` é a única fonte de verdade viva hoje. |
| Endpoint de check-in aceita corpo vazio | Sem DTO de request | Timestamp de check-in é sempre "agora, no servidor" — aceitar um horário do cliente abriria brecha para presença retroativa/adiantada forjada. |
