# App Mobile Tasks — MOB-01, MOB-02, MOB-03, MOB-11, MOB-12

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and
follow its Execute flow and Critical Rules.** Do not search for skill files
by filesystem path. The skill is the source of truth for the full flow
(per-task cycle, sub-agent delegation, adequacy review, Verifier,
discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed
without it.**

---

**Design**: `.specs/features/app-mobile/design.md`
**Status**: Phase 1 (T1-T4), Phase 2 (T5-T7), Phase 3 (T8-T11), Phase 4
(T12-T14) e Phase 5 (T15-T16, tema por tenant) ✅ Done. MOB-01, MOB-02,
MOB-03, MOB-11 e MOB-12 entregues nesta rodada de Execute.

---

## Test Coverage Matrix

> Gerado por leitura do repo — `apps/api/jest.config.js` (projects
> unit/integration/rls), `apps/web/vitest.config.ts` +
> `apps/web/playwright.config.ts` (vitest para unit, Playwright para e2e).
> `apps/mobile` é workspace novo, sem testes existentes para amostrar.
> **Confirmado com o usuário**: Jest (`jest-expo`) +
> `@testing-library/react-native` para unit/component; sem e2e nativo
> (Detox) nesta rodada — fica para quando um módulo de domínio (MOB-04+)
> justificar o custo de setup.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| Workspace/config (`package.json`, `tsconfig.json`, `app.config.js`, `eas.json`, `jest.config.js`) | none | build gate only | `apps/mobile/*.{json,js}` | `npm run build:mobile` (typecheck) |
| `ApiClient` (`lib/api/client.ts`) | unit | 1:1 com AC de MOB-01/02 relevantes a essa camada (URL de config, propagação de erro de rede vs. de auth, delegação de 401) | `apps/mobile/src/lib/api/**/*.test.ts` | `npm run test -w orbien-mobile` |
| `AuthClient` (`lib/auth/auth-client.ts`) | unit | Todos os ACs de MOB-01 (login, logout, sessão expira → login) e MOB-02 (fila serializada, refresh concorrente, refresh revogado) | `apps/mobile/src/lib/auth/**/*.test.ts` | `npm run test -w orbien-mobile` |
| `ThemeProvider` (`lib/theme/theme-provider.tsx`) | unit + component | Todos os ACs de MOB-03 (fetch, fallback sem branding, reaplica cache antes da rede) | `apps/mobile/src/lib/theme/**/*.test.tsx` | `npm run test -w orbien-mobile` |
| Tela de Login / `AuthProvider` (componentes) | component | Caminho feliz (login OK → navega) + erro genérico (credencial errada) — AC 1/2 de MOB-01 | `apps/mobile/src/app/**/*.test.tsx`, `apps/mobile/src/lib/auth/auth-provider.test.tsx` | `npm run test -w orbien-mobile` |
| `app.config.js` (resolução de identidade) | unit | AC 1/2/4 de MOB-12 (resolve default sem env; lê de `Constants.expoConfig.extra`, não de literal) | `apps/mobile/app.config.test.js` | `npm run test -w orbien-mobile` |

**Coverage Expectation values**: seguidas do default forte do processo
(camada de domínio = 1:1 com AC; config/entity = build gate only) — não há
guideline de teste no `CLAUDE.md` raiz nem em `apps/*/AGENTS.md` para mobile
especificamente (workspace ainda não existe).

## Gate Check Commands

| Gate Level | When to Use | Command |
|---|---|---|
| Quick | Após tasks com só teste unitário/component | `npm run test -w orbien-mobile` |
| Build | Após task de config/scaffold, ou fechamento de fase | `npm run build:mobile` (typecheck via `tsc --noEmit`) && `turbo run lint --filter=orbien-mobile` |
| Full | Fechamento da rodada inteira (antes de propor PR) | `npm run test -w orbien-mobile` && `npm run build:mobile` && `turbo run lint --filter=orbien-mobile` |

---

## Execution Plan

Phases são ordenadas e rodam em sequência — cada fase termina antes da
próxima começar, e as tasks dentro de uma fase rodam em ordem.

### Phase 1: Scaffold do workspace (MOB-11)

```
T1 → T2 → T3 → T4
```

### Phase 2: Config dinâmica multi-variante (MOB-12)

```
T5 → T6 → T7
```

### Phase 3: Cliente de API e sessão (MOB-01, MOB-02)

```
T8 → T9 → T10 → T11
```

### Phase 4: UI de autenticação e navegação (MOB-01)

```
T12 → T13 → T14
```

### Phase 5: Tema por tenant (MOB-03)

```
T15 → T16
```

---

## Task Breakdown

### T1: Criar workspace `apps/mobile` (Expo + TypeScript)

**Status**: ✅ Done (commit `dce8c49`)

**What**: `npx create-expo-app` (template TypeScript blank) em
`apps/mobile`, `package.json` com `name: "orbien-mobile"` seguindo o
padrão dos outros três apps (`orbien-backend`/`orbien-site`/`orbien-web`/
`orbien-admin`), sem lockfile próprio (regra do monorepo: lockfile único na
raiz).
**Where**: `apps/mobile/package.json`, `apps/mobile/tsconfig.json`,
`apps/mobile/src/app/_layout.tsx` (placeholder), `apps/mobile/.gitignore`
**Depends on**: None
**Reuses**: `apps/web/tsconfig.json` como referência de `strict: true`
(mesmo rigor de tipos dos outros apps).
**Requirement**: MOB-11

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `npm install` na raiz resolve `apps/mobile` como workspace (`npm ls orbien-mobile` funciona)
- [x] `npx expo start` sobe o Metro bundler sem erro (verificação manual, registrada no Done — não é gate automatizado)
- [x] Nenhum lockfile criado dentro de `apps/mobile`
- [x] Gate check passa: `npm run build:mobile` (adicionado em T3) — placeholder aceitável nesta task se T3 ainda não existe: rodar `npx tsc --noEmit` direto em `apps/mobile`

**Tests**: none (config/scaffold)
**Gate**: build

---

### T2: Configurar Expo Router e Jest (`jest-expo` + Testing Library)

**Status**: ✅ Done (commit `a006aa9`)

**What**: Adicionar `expo-router` (navegação file-based, decisão do
design), `jest-expo`, `@testing-library/react-native`,
`@testing-library/jest-native` como devDependencies; criar
`apps/mobile/jest.config.js` (preset `jest-expo`) e script `"test"` no
`package.json` do mobile.
**Where**: `apps/mobile/package.json`, `apps/mobile/jest.config.js`,
`apps/mobile/jest.setup.js`
**Depends on**: T1
**Reuses**: nenhum — primeiro app do monorepo com Jest configurado para RN
(API usa Jest para Node, não serve de template de preset).
**Requirement**: MOB-11

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `npm run test -w orbien-mobile` roda e passa com `--passWithNoTests` (ainda não há teste real)
- [x] `expo-router` resolve uma rota placeholder (`app/index.tsx`) sem erro no Metro

**SPEC_DEVIATION**: `@testing-library/jest-native` ficou de fora. Seu peer
`react-test-renderer>=16` resolve numa versão (`19.2.8`) que conflita com o
`react@19.2.3` fixado pelo Expo SDK 57 (`ERESOLVE`); além disso a lib está
superada — `@testing-library/react-native@14` já embute os mesmos matchers
(basta importar de `@testing-library/react-native`, documentado no próprio
README do pacote). Sem impacto de cobertura.

**Tests**: none (config)
**Gate**: build

---

### T3: Scripts na raiz + `turbo.json`

**Status**: ✅ Done (commit `23e15f4`)

**What**: Adicionar `dev:mobile` (`turbo run dev --filter=orbien-mobile`)
e `build:mobile` (`turbo run build --filter=orbien-mobile`, mapeado para
`tsc --noEmit` no `package.json` do mobile — não há bundle Next/Nest para
"buildar") ao `package.json` raiz; garantir que `apps/mobile` não precisa de
entrada nova em `turbo.json` (o pipeline `dev`/`build`/`lint`/`test` já é
genérico por task name, aplica a qualquer workspace).
**Where**: `/package.json` (raiz)
**Depends on**: T1, T2
**Reuses**: `dev:web`/`build:web` como padrão do script.
**Requirement**: MOB-11

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `npm run dev:mobile` sobe o Metro bundler
- [x] `npm run build:mobile` roda `tsc --noEmit` em `apps/mobile` e passa
- [x] `turbo run lint --filter=orbien-mobile` roda (mesmo que só com regra base do ESLint, sem regra específica ainda — cai para T4)

**Tests**: none (config)
**Gate**: build

---

### T4: ESLint para `apps/mobile`

**Status**: ✅ Done (commit `d2d1a9d`)

**What**: Config ESLint do mobile seguindo a mesma base
`typescript-eslint` recommended sem checagem de tipos que a API usa (regra
do monorepo: "não" adicionar checagem de tipos), mais o preset
`eslint-config-expo` (padrão Expo) para regras específicas de RN/JSX.
**Where**: `apps/mobile/eslint.config.mjs`
**Depends on**: T1
**Reuses**: `apps/api/eslint.config.mjs` como referência da base
`typescript-eslint`.
**Requirement**: MOB-11

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `turbo run lint --filter=orbien-mobile` roda sem erro no scaffold placeholder
- [x] `no-unused-vars` com `argsIgnorePattern: "^_"` replicado (mesma convenção da API)

**Tests**: none (config)
**Gate**: build

**Commit**: `feat(mobile): scaffold do workspace apps/mobile com Expo Router, Jest e lint`

---

### T5: `app.config.js` dinâmico (identidade default)

**Status**: ✅ Done (commit `022b7e3`)

**What**: Substituir `app.json` estático (do scaffold do T1) por
`app.config.js` — função que lê `process.env` e resolve nome, ícone,
`bundleIdentifier`/`package`, `scheme` e `extra.oneSignalAppId`; sem
nenhuma env de tenant setada, resolve para os valores padrão Orbien
(spec MOB-12 AC 2).
**Where**: `apps/mobile/app.config.js` (novo), remove `apps/mobile/app.json`
**Depends on**: T1
**Reuses**: nenhum precedente no monorepo (primeiro `app.config.js`
dinâmico) — só a decisão já registrada em `.specs/STATE.md` AD-002.
**Requirement**: MOB-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `npx expo config` (sem env setada) mostra nome "Orbien", ícone
      default, bundle id `com.orbien.app` (ou equivalente decidido em
      Execute), `extra.oneSignalAppId` com o valor default
- [x] Nenhum desses valores aparece hardcoded em qualquer arquivo fora de
      `app.config.js`/`eas.json`
- [x] Teste unitário cobrindo a função exportada por `app.config.js`
      (import direto do módulo, chamado com `{config: {}}`, sem env
      setada) confirma os defaults

**Nota de execução**: bundle id/package default decidido como
`com.orbien.app` (igual nas duas plataformas). App id do OneSignal default
é um placeholder explícito (`REPLACE_WITH_ONESIGNAL_APP_ID`) — não existe
um projeto OneSignal real documentado nesta rodada; o mecanismo de
resolução é o que a task entrega, a credencial real entra depois via EAS
secret (ver README, T6).

**Tests**: unit
**Gate**: quick

---

### T6: `eas.json` com profile único (`generic`)

**Status**: ✅ Done (commit `0bd5e64`)

**What**: Criar `apps/mobile/eas.json` com profiles `development`,
`preview` e `production`, todos usando o profile de identidade `generic`
(nenhum profile Premium ainda — spec deixa isso fora de escopo de
implementação); `extra` documentando onde um profile futuro de tenant
entraria (comentário JSON não é válido — usar `README` curto ao lado, não
comentário dentro do `eas.json`).
**Where**: `apps/mobile/eas.json`, `apps/mobile/README.md` (seção "Build
profiles")
**Depends on**: T5
**Reuses**: nenhum.
**Requirement**: MOB-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `eas build:configure` (ou edição manual equivalente) produz `eas.json`
      válido com os 3 profiles
- [x] `README.md` do mobile documenta como rodar localmente
      (`npx expo start`) e como buildar via EAS (comando + profile)

**Nota de execução**: `eas.json` escrito à mão (edição manual, opção já
prevista no Done when) — `eas build:configure` exige login numa conta
Expo/EAS, indisponível neste ambiente. Schema seguido manualmente
(`cli.version`, `build.<profile>.extends`, `submit`).

**Tests**: none (config)
**Gate**: build

---

### T7: Teste de regressão — nenhum literal hardcoded de identidade

**Status**: ✅ Done (commit `0fe6c90`)

**What**: Teste (grep programático dentro de um teste Jest, ou lint rule
custom) que falha se `"Orbien"`, o bundle id, ou o app id do OneSignal
aparecerem como string literal fora de `app.config.js`/`eas.json`/testes —
operacionaliza o AC 4 de MOB-12 e o Success Criteria correspondente da
spec.
**Where**: `apps/mobile/src/lib/config/no-hardcoded-identity.test.ts`
**Depends on**: T5, T6
**Reuses**: `Constants.expoConfig.extra` (lido de dentro do próprio teste
para saber o que comparar).
**Requirement**: MOB-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Teste passa no estado atual do código
- [x] Teste falha propositalmente se alguém reintroduzir um literal (validado manualmente durante a task, depois revertido)
- [x] Gate check passa: `npm run test -w orbien-mobile`

**SPEC_DEVIATION**: o teste deriva os valores de referência direto de
`app.config.js` (`require` + chamada com `{config: {}}`), não de
`Constants.expoConfig.extra` como o "Reuses" sugeria — `Constants.expoConfig`
vem `{}` sob `jest-expo` em ambiente de teste (não há manifest nativo
resolvido), então `Constants` não tinha o que comparar. `app.config.js` é a
mesma fonte da verdade que `Constants` leria em runtime real.

O próprio teste pegou um hardcode real: `src/app/index.tsx` (T2) tinha
`"Orbien"` literal no `<Text>` do placeholder — corrigido para ler
`Constants.expoConfig?.name`.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(mobile): app.config.js dinâmico e eas.json multi-profile (MOB-12)`

---

### T8: Tipos de sessão e branding

**Status**: ✅ Done (commit `0cb6bba`)

**What**: Definir `LoginResponse`, `Session`, `Branding` (interfaces do
Data Models do design) em arquivos de tipo puros, sem lógica.
**Where**: `apps/mobile/src/lib/auth/types.ts`,
`apps/mobile/src/lib/theme/types.ts`
**Depends on**: T2
**Reuses**: shape espelhado de `apps/api/src/auth/` e
`apps/api/src/settings/settings.service.ts` (contrato, não import).
**Requirement**: MOB-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Tipos exportados batem exatamente com os campos documentados no
      `design.md` (Data Models)
- [ ] Sem erro de TypeScript

**Tests**: none (tipos puros)
**Gate**: build

---

### T9: `ApiClient` (cliente HTTP base, sem refresh ainda)

**Status**: ✅ Done (commit `ba8f1f3`)

**What**: Wrapper de `fetch` com métodos `get/post/patch/delete<T>`, base
URL lida de `Constants.expoConfig.extra.apiUrl` (nunca hardcoded — mesmo
princípio do MOB-12 aplicado à URL da API), injeta
`Authorization: Bearer` quando um token é passado, mapeia erro de rede
(sem resposta) para um tipo `NetworkError` distinto de erro HTTP.
**Where**: `apps/mobile/src/lib/api/client.ts`,
`apps/mobile/src/lib/api/errors.ts`
**Depends on**: T5, T8
**Reuses**: nenhum — mas o contrato de erro (`NetworkError` vs. resto)
segue o Edge Case da spec ("erro de rede claro, não tela vazia").
**Requirement**: MOB-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Testes unitários (mock de `fetch`) cobrem: sucesso, erro HTTP com
      body de erro, erro de rede (fetch rejeita) → `NetworkError`
- [ ] Base URL vem de `expoConfig.extra`, confirmado por teste (mock do
      `Constants`)
- [ ] Gate check passa: `npm run test -w orbien-mobile`

**Tests**: unit
**Gate**: quick

---

### T10: `AuthClient` — login, logout, guarda de sessão

**Status**: ✅ Done (commit `d658389`)

**What**: `login(tenantSlug, email, password)` chama `POST /auth/login` via
`ApiClient`, grava `Session` em `expo-secure-store`; `logout()` chama
`POST /auth/logout` best-effort e sempre limpa o SecureStore mesmo se a
chamada falhar; `getSession()` lê do SecureStore (sem chamada de rede).
Ainda **sem** a fila de refresh (T11).
**Where**: `apps/mobile/src/lib/auth/auth-client.ts`
**Depends on**: T8, T9
**Reuses**: `ApiClient` (T9).
**Requirement**: MOB-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Testes unitários (mock de `expo-secure-store` e `ApiClient`) cobrem
      AC 1 (login grava sessão), AC 2 (erro genérico — o teste verifica que
      o `AuthClient` não tenta distinguir os casos de erro, só repassa a
      mensagem genérica que a API já devolve), AC 5 (logout limpa
      SecureStore mesmo com a chamada de rede falhando)
- [ ] Gate check passa: `npm run test -w orbien-mobile`

**Tests**: unit
**Gate**: quick

---

### T11: Fila de refresh serializada (MOB-02)

**Status**: ✅ Done (commit `8194ee2`)

**What**: Adicionar a `AuthClient` (ou módulo companion
`refresh-queue.ts`) a máquina de estados `isRefreshing`/`failedQueue`
(espelhando `apps/web/src/lib/api.ts:34-64`, adaptada para
`expo-secure-store` assíncrono): `getValidAccessToken()` dispara refresh
único mesmo com N chamadas concorrentes; falha de refresh limpa
SecureStore e rejeita toda a fila com `SessionExpiredError`.
**Where**: `apps/mobile/src/lib/auth/auth-client.ts` (extensão),
`apps/mobile/src/lib/auth/session-expired-error.ts`
**Depends on**: T10
**Reuses**: máquina de estados de `apps/web/src/lib/api.ts:34-64`.
**Requirement**: MOB-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Teste de concorrência: duas chamadas a `getValidAccessToken()`
      disparadas juntas com token expirado resultam em **uma** chamada a
      `POST /auth/refresh` (mock contando invocações) — cobre o Edge Case
      "duas telas disparam refresh ao mesmo tempo"
- [ ] Teste: refresh falha (mock 401) → SecureStore limpo, ambas as
      chamadas da fila rejeitam com `SessionExpiredError`
- [ ] Gate check passa: `npm run test -w orbien-mobile`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(mobile): AuthClient com login/logout e fila de refresh serializada (MOB-01, MOB-02)`

---

## Task Coverage Note (Fase 3)

T9 é código "domínio" (regra de rede) mas sem AC própria de MOB-01/02 além
das cobertas por T10/T11 — sua Coverage Expectation na matriz já cobre isso
("delegação de 401" fica testada em T9 como contrato de erro; a delegação
efetiva ao `AuthClient" é testada em T11 via mock do `ApiClient`).

---

### T12: `AuthProvider` (contexto React + hidratação)

**Status**: ✅ Done (commit `05981ab`)

**What**: Context/hook `useAuth()` que hidrata sessão do SecureStore no
boot, expõe `session`, `login`, `logout`, e um estado
`status: 'loading' | 'authenticated' | 'unauthenticated'`.
**Where**: `apps/mobile/src/lib/auth/auth-provider.tsx`
**Depends on**: T11
**Reuses**: `AuthClient` (T10/T11).
**Requirement**: MOB-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Teste component (Testing Library): sem sessão salva → `status`
      resolve para `unauthenticated`; com sessão salva válida →
      `authenticated`
- [ ] Teste: `logout()` chamado no contexto reflete `status: unauthenticated`
      imediatamente (sem esperar reload)
- [ ] Gate check passa: `npm run test -w orbien-mobile`

**Tests**: component
**Gate**: quick

---

### T13: Tela de Login (Expo Router)

**Status**: ✅ Done (commit `8d3e197`)

**What**: Rota `app/login.tsx` com campos `tenant_slug`, `email`, `senha`,
chama `useAuth().login`, mostra mensagem de erro genérica em qualquer
falha (AC 2 de MOB-01 — não distinguir tipos de erro na UI), navega para a
rota inicial em caso de sucesso.
**Where**: `apps/mobile/src/app/login.tsx`
**Depends on**: T12
**Reuses**: `useAuth()` (T12).
**Requirement**: MOB-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Teste component: submit com credenciais válidas (mock) navega;
      submit com erro (mock rejeita) mostra a mesma mensagem genérica
      independentemente do motivo do erro simulado
- [ ] Gate check passa: `npm run test -w orbien-mobile`

**Tests**: component
**Gate**: quick

---

### T14: Guarda de navegação (root layout)

**Status**: ✅ Done (commit `b900717`)

**What**: `app/_layout.tsx` envolve a árvore com `AuthProvider`; enquanto
`status === 'loading'`, mostra splash; `unauthenticated` força redirect
para `/login`; `authenticated` libera o shell de tabs (placeholder de
tabs — telas de domínio ficam para MOB-04+).
**Where**: `apps/mobile/src/app/_layout.tsx`
**Depends on**: T13
**Reuses**: `AuthProvider` (T12).
**Requirement**: MOB-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Teste component: `unauthenticated` renderiza a tela de login (via
      router mock); `authenticated` renderiza o shell placeholder
- [ ] Gate check passa: `npm run test -w orbien-mobile`

**Tests**: component
**Gate**: full

**Commit**: `feat(mobile): tela de login, AuthProvider e guarda de navegação (MOB-01)`

---

### T15: `ThemeProvider` (fetch + cache + fallback)

**Status**: ✅ Done (commit `f3aae3e`)

**What**: Hook/context `useTheme()`: no boot, reaplica branding cacheado
(`AsyncStorage`) antes de qualquer chamada de rede completar (AC 3);
dispara `GET /settings` em paralelo; em sucesso, atualiza tema + regrava
cache; em falha ou tenant sem branding customizado, mantém o padrão Orbien
sem erro visível (AC 2).
**Where**: `apps/mobile/src/lib/theme/theme-provider.tsx`
**Depends on**: T9, T14
**Reuses**: `ApiClient` (T9), `Branding` type (T8).
**Requirement**: MOB-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Teste: cache existente em `AsyncStorage` é aplicado antes da Promise
      de `GET /settings` resolver (mock com delay controlado)
- [x] Teste: `GET /settings` retorna branding nulo/sem customização →
      tema permanece o default Orbien, nenhum estado de erro exposto
- [x] Teste: `GET /settings` falha (erro de rede) → tema cacheado
      permanece, nenhum erro visível
- [x] Gate check passa: `npm run test -w orbien-mobile`

**Tests**: unit + component
**Gate**: quick

---

### T16: Wiring do `ThemeProvider` no shell + teste ponta a ponta de dois tenants

**Status**: ✅ Done (commit `1b9bb5f`)

**What**: `_layout.tsx` passa a envolver o shell autenticado com
`ThemeProvider`, aplicando `primaryColor`/`logoUrl` no header/tab bar do
Expo Router; teste component simula dois brandings distintos (mock de
`GET /settings`) e confirma que cor/logo mudam.
**Where**: `apps/mobile/src/app/_layout.tsx` (extensão)
**Depends on**: T15
**Reuses**: `ThemeProvider` (T15).
**Requirement**: MOB-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Teste component: dois mocks de branding diferentes produzem cor/
      logo diferentes no shell renderizado
- [x] Gate check passa (full): `npm run test -w orbien-mobile` &&
      `npm run build:mobile` && `turbo run lint --filter=orbien-mobile`

**Tests**: component
**Gate**: full

**Commit**: `feat(mobile): tema por tenant com cache e fallback (MOB-03)`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ──→ T2 ──→ T3 ──→ T4
Phase 2:  T5 ──→ T6 ──→ T7
Phase 3:  T8 ──→ T9 ──→ T10 ──→ T11
Phase 4:  T12 ──→ T13 ──→ T14
Phase 5:  T15 ──→ T16
```

Execução é estritamente sequencial dentro de cada fase.

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1: Scaffold Expo | 1 workspace (config apenas) | ✅ Granular |
| T2: Expo Router + Jest | 1 setup de teste | ✅ Granular |
| T3: Scripts raiz | 1 arquivo (`package.json` raiz) | ✅ Granular |
| T4: ESLint mobile | 1 config | ✅ Granular |
| T5: `app.config.js` | 1 arquivo | ✅ Granular |
| T6: `eas.json` | 1 arquivo + README | ✅ Granular |
| T7: Teste anti-hardcode | 1 teste | ✅ Granular |
| T8: Tipos | 2 arquivos de tipo puro, cohesivos (mesma origem de dados) | ✅ Granular |
| T9: `ApiClient` | 1 componente (cliente HTTP) | ✅ Granular |
| T10: `AuthClient` (login/logout) | 1 componente | ✅ Granular |
| T11: Fila de refresh | 1 função (extensão de T10) | ✅ Granular |
| T12: `AuthProvider` | 1 componente | ✅ Granular |
| T13: Tela de Login | 1 tela | ✅ Granular |
| T14: Root layout/guarda | 1 arquivo | ✅ Granular |
| T15: `ThemeProvider` | 1 componente | ✅ Granular |
| T16: Wiring do tema | 1 arquivo (extensão de T14) | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | — | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T1, T2 | T2→T3 (T1 transitivo) | ✅ Match |
| T4 | T1 | T3→T4 (mesma fase, ordem sequencial) | ✅ Match |
| T5 | T1 | Fase 2 inicia após Fase 1 | ✅ Match |
| T6 | T5 | T5→T6 | ✅ Match |
| T7 | T5, T6 | T6→T7 | ✅ Match |
| T8 | T2 | Fase 3 inicia após Fase 2 | ✅ Match |
| T9 | T5, T8 | T8→T9 | ✅ Match |
| T10 | T8, T9 | T9→T10 | ✅ Match |
| T11 | T10 | T10→T11 | ✅ Match |
| T12 | T11 | Fase 4 inicia após Fase 3 | ✅ Match |
| T13 | T12 | T12→T13 | ✅ Match |
| T14 | T13 | T13→T14 | ✅ Match |
| T15 | T9, T14 | Fase 5 inicia após Fase 4 (T9 já concluída na Fase 3) | ✅ Match |
| T16 | T15 | T15→T16 | ✅ Match |

Nenhuma task depende de uma task de fase posterior. ✅

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1 | Workspace/config | none | none | ✅ OK |
| T2 | Workspace/config | none | none | ✅ OK |
| T3 | Workspace/config | none | none | ✅ OK |
| T4 | Workspace/config | none | none | ✅ OK |
| T5 | `app.config.js` | unit | unit | ✅ OK |
| T6 | Workspace/config (`eas.json`) | none | none | ✅ OK |
| T7 | Teste de config (camada própria) | unit | unit | ✅ OK |
| T8 | Tipos puros | none | none | ✅ OK |
| T9 | `ApiClient` (domínio) | unit | unit | ✅ OK |
| T10 | `AuthClient` (domínio) | unit | unit | ✅ OK |
| T11 | `AuthClient` — fila (domínio) | unit | unit | ✅ OK |
| T12 | `AuthProvider` (componente) | component | component | ✅ OK |
| T13 | Tela de Login (componente) | component | component | ✅ OK |
| T14 | Root layout (componente) | component | component | ✅ OK |
| T15 | `ThemeProvider` (domínio+componente) | unit + component | unit + component | ✅ OK |
| T16 | Wiring do tema (componente) | component | component | ✅ OK |

Nenhuma violação. ✅

---

## Task Verification Standards

Cada task segue `Done when` + `Tests` + `Gate` conforme definido acima.
Contagem de testes esperada por task fica registrada no Execute (task por
task), já que o número exato de casos depende de detalhes que só aparecem
ao escrever o mock — o que está fixo aqui é a **cobertura mínima
obrigatória** (cada `Done when` já lista os cenários que não podem faltar).

---

## Fix Tasks (pós-Verifier, rodada 1)

### F1: Wire `ApiClient`/`AuthClient` — interceptação reativa de 401 (MOB-01 AC 3/AC 4)

**Status**: ✅ Done

**Gap reportado pelo Verifier** (`.specs/features/app-mobile/validation.md`,
rodada 1 — FAIL): `ThemeProvider` (o único consumidor autenticado real desta
rodada) passava `session.accessToken` direto para `apiClient.get`, nunca
passando por `getValidAccessToken()`/a fila de refresh. Isso deixava MOB-01
AC 3 (renovação automática + reenvio em 401) e AC 4 (sessão encerrada →
login) sem nenhum caminho real que os exercitasse — a fila de refresh (T11)
estava correta e bem testada, mas era código morto do ponto de vista do
app.

**O que foi feito**:
- `auth-client.ts`: extraída a renovação de fato para `performRefresh`
  (reusada por `getValidAccessToken`, caminho proativo por relógio, e por
  `refreshNow`, forçado); adicionado `onSessionExpired`/`notifySessionExpired`
  (pub-sub) para quem precisar reagir a uma sessão encerrada por qualquer
  chamada autenticada, não só a que o usuário está olhando; adicionado
  `authenticatedRequest<T>(method, path, options)` — obtém token válido,
  chama `apiClient`, e em 401 reativo força uma renovação e repete a
  chamada original uma vez.
- `theme-provider.tsx`: passa a chamar `authenticatedRequest("get", "/settings")`
  em vez de montar o header manualmente.
- `auth-provider.tsx`: assina `onSessionExpired` para transicionar
  `status` para `"unauthenticated"` (o `AuthGate` em `_layout.tsx` já
  redireciona para `/login` a partir daí — nenhuma mudança de navegação
  necessária).
- Novo teste `authenticated-request.test.ts` (3 testes: 401 reativo com
  retentativa e sucesso; renovação falha → `SessionExpiredError` +
  notificação; erro não-401 propaga sem acionar renovação); teste novo em
  `auth-provider.test.tsx` (AC 4: `onSessionExpired` → `status`
  `unauthenticated`, sem chamar `logout()` de novo); testes existentes de
  `theme-provider.test.tsx`/`_layout.test.tsx` ajustados para mockar
  `authenticatedRequest` em vez de `apiClient.get` diretamente.

**Gate (full)**: `npm run test -w orbien-mobile` (43 testes, 10 suites,
todos passando) && `npm run build:mobile` && `turbo run lint --filter=orbien-mobile`
(0 erros).

**Requirement**: MOB-01, MOB-02

---

### F2: Endurecer teste anti-hardcode e `getBaseUrl()` (revisão pré-PR)

**Status**: ✅ Done

**Achados da revisão local** (`/code-review`, antes de abrir o PR):
1. `no-hardcoded-identity.test.ts` comparava por substring
   (`content.includes(literal)`) — um comentário futuro mencionando
   "Orbien" em prosa (sem ser um hardcode de fato) derrubaria o teste por
   motivo errado.
2. `client.ts`'s `getBaseUrl()` caía silenciosamente em string vazia
   quando `extra.apiUrl` não vinha configurado, virando
   `fetch('' + path)` — erro opaco, indistinguível de falha de rede.

**O que foi feito**:
- Teste anti-hardcode agora exige o literal entre aspas
  (`["'`]literal["'`]`), não qualquer ocorrência em texto — continua
  pegando hardcode de fato (`name: "Orbien"`, `"Orbien"` em JSX) sem falso
  positivo por comentário em prosa.
- `getBaseUrl()` lança erro explícito ("apiUrl não configurada...") quando
  `extra.apiUrl` está ausente/vazio, e essa chamada fica **fora** do
  `try/catch` que envolve o `fetch` — erro de config nunca vira
  `NetworkError` (evita mascarar a causa real como "sem internet"). Novo
  teste cobre o caminho (`ApiClient — apiUrl ausente na config`).

**Gate (full)**: `npm run test -w orbien-mobile` (44 testes, 10 suites)
&& `npm run build:mobile` && `turbo run lint --filter=orbien-mobile`
(0 erros).

**Requirement**: MOB-01, MOB-12
