# Restrição de acesso do piso (`member`) — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and follow its Execute
flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the
source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review,
Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/restricao-acesso-piso-member/design.md`
**Status**: Done — todas as 8 tasks implementadas e commitadas; aguardando Verifier.

---

## Test Coverage Matrix

> Gerado a partir de `apps/web/package.json`, `apps/mobile/package.json`, e amostragem de
> `apps/web/src/app/api/session/route.test.ts`, `apps/mobile/src/__tests__/app/(tabs)/_layout.test.tsx`,
> `apps/mobile/src/__tests__/app/login.test.tsx`, `apps/mobile/src/__tests__/app/navigation-boot.test.tsx`.
> Nenhuma diretriz explícita de cobertura em `CLAUDE.md`/`AGENTS.md` além de "rode via
> Turborepo" — aplicado o default forte (1:1 com ACs da spec, casos de borda listados).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| `apps/web/src/app/api/session/route.ts` (POST, bloqueio) | unit | 1:1 com ACs P1#1-4 da story "Bloquear login web do piso" + edge cases (roles vazio, member+outro papel, falha na revogação) | `apps/web/src/app/api/session/route.test.ts` | `npm run test -w orbien-web` |
| `apps/web/src/lib/session.ts` (`revokeRefreshToken`) | unit | Sucesso e falha silenciosa (try/catch) | `apps/web/src/lib/session.test.ts` | `npm run test -w orbien-web` |
| `apps/web/src/app/(public)/login/page.tsx` (mensagem 403) | unit | Mensagem específica pro código `WEB_ACCESS_DENIED`, mensagem genérica nos demais casos já cobertos | `apps/web/src/app/(public)/login/page.test.tsx` (novo, mesma pasta do arquivo) | `npm run test -w orbien-web` |
| `apps/mobile/src/lib/permissions/permissions-client.ts` (novo) | unit | Sucesso, 401/erro HTTP, exceção de rede → todos os casos devolvem o contrato certo (`string[]` ou `null`) | `apps/mobile/src/__tests__/lib/permissions/permissions-client.test.ts` | `npm run test -w orbien-mobile` |
| `apps/mobile/src/lib/auth/auth-provider.tsx` (fetch de `areas`) | unit | `areas` populada após login e após boot; `status` não fica preso esperando `fetchAreas` | `apps/mobile/src/__tests__/lib/auth/auth-provider.test.tsx` (existente ou novo, mesmo padrão) | `npm run test -w orbien-mobile` |
| `apps/mobile/src/app/(tabs)/_layout.tsx` (gate Escala) | unit | Com `volunteers`: 5 abas visíveis (comportamento atual, sem regressão). Sem `volunteers`: aba Escala com `href: null`, 4 visíveis, rota `index` ainda declarada. `areas: null`: mostra (fail-open) | `apps/mobile/src/__tests__/app/(tabs)/_layout.test.tsx` (existente, estender) | `npm run test -w orbien-mobile` |
| `apps/mobile/src/app/indisponibilidade.tsx` (guard) | unit | Sem `volunteers`: renderiza `SemAcesso`, não chama `getUnavailability`. Com `volunteers` ou `areas: null`: comportamento atual preservado | `apps/mobile/src/__tests__/app/indisponibilidade.test.tsx` (existente ou novo) | `npm run test -w orbien-mobile` |
| e2e boot (member-only não vê Escala) | integration | Fluxo completo login → boot → tab bar, reaproveitando o padrão de `navigation-boot.test.tsx` | `apps/mobile/src/__tests__/app/navigation-boot.test.tsx` (estender) | `npm run test -w orbien-mobile` |

## Gate Check Commands

| Gate Level | When to Use | Command |
|---|---|---|
| Quick | Depois de cada task com só testes unitários | `npm run test -w orbien-web` ou `npm run test -w orbien-mobile` (conforme o app da task) |
| Full | Fim de cada phase | `npm run lint -- --filter=orbien-web --filter=orbien-mobile && npm run test -w orbien-web && npm run test -w orbien-mobile` |
| Build | Fim da feature (antes do PR) | `npx tsc -p apps/web/tsconfig.json --noEmit && npx tsc -p apps/mobile/tsconfig.json --noEmit && npm run test -w orbien-web && npm run test -w orbien-mobile` |

---

## Execution Plan

Duas phases independentes (web não depende de mobile nem vice-versa) — mas como o escopo
total é pequeno (8 tasks), executo tudo inline, sem sub-agentes.

### Phase 1: Web — bloqueio de login

```
T1 → T2 → T3
```

### Phase 2: Mobile — gate de Escala/Indisponibilidade

```
T4 → T5 → T6 → T7 → T8
```

---

## Task Breakdown

### T1: Extrair `revokeRefreshToken` em `lib/session.ts` ✅ (commit `388cdab`)

**What**: Nova função `revokeRefreshToken(token: string): Promise<void>` que chama
`POST /auth/logout` com `try/catch` silencioso (mesmo padrão inline que já existe no
`DELETE` de `route.ts`), pra ser reusada pelo bloqueio de login.
**Where**: `apps/web/src/lib/session.ts`
**Depends on**: None
**Reuses**: `BACKEND_URL`, o `try { fetch(...) } catch {}` já existente no `DELETE` de
`route.ts:100-113`
**Requirement**: ACC-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `revokeRefreshToken` exportada, aceita o refresh token, nunca lança
- [ ] `DELETE` de `route.ts` passa a usar a função nova (elimina a duplicação, sem mudar
      comportamento)
- [ ] Gate: `npm run test -w orbien-web`
- [ ] Nenhum teste existente de `route.test.ts` quebra

**Tests**: unit
**Gate**: quick

---

### T2: Bloquear login web de conta só-`member` em `route.ts` ✅ (commit `e0613c5`)

**What**: No `POST` de `route.ts`, depois de `decodeJwtPayload` e da guarda existente
(`!payload || !body.email`), checar `payload.roles.some((r) => r !== 'member')`; se falso,
chamar `revokeRefreshToken(pair.refresh_token)` e responder
`{ code: 'WEB_ACCESS_DENIED', message: 'Este acesso é apenas pelo aplicativo Orbien.' }` com
status 403, sem gravar nenhum cookie.
**Where**: `apps/web/src/app/api/session/route.ts`
**Depends on**: T1
**Reuses**: `decodeJwtPayload`, `revokeRefreshToken` (T1)
**Requirement**: ACC-01, ACC-02, ACC-03, ACC-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `roles: ['member']` → 403, nenhum `Set-Cookie`, `revokeRefreshToken` chamada
- [ ] `roles: []` → mesmo bloqueio (tratado como "nenhum papel além de member")
- [ ] `roles: ['member', 'volunteer']` → login normal, cookies gravados
- [ ] `roles: ['tenant_admin']` (e os outros 8 papéis, ao menos um caso de amostra) → login
      normal
- [ ] Revogação falhando (mock rejeita) não impede a resposta 403
- [ ] Gate: `npm run test -w orbien-web`

**Tests**: unit
**Gate**: quick

---

### T3: Mensagem específica na tela de login pro bloqueio ✅ (commit `cea5892`)

**What**: No `catch` de `handleSubmit`, adicionar um ramo pra
`err.response.status === 403 && err.response.data?.code === 'WEB_ACCESS_DENIED'`, usando a
`message` vinda da API (com fallback fixo se `message` vier vazia).
**Where**: `apps/web/src/app/(public)/login/page.tsx`
**Depends on**: T2
**Reuses**: O `if/else` de status já existente no mesmo `catch`
**Requirement**: ACC-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Erro 403 com `code: 'WEB_ACCESS_DENIED'` mostra a mensagem específica
- [ ] 401 continua mostrando "E-mail ou senha incorretos." (sem regressão)
- [ ] 403 sem esse `code` (se algum dia existir) cai no `else` genérico, não quebra
- [ ] Gate: `npm run test -w orbien-web`

**Tests**: unit
**Gate**: full (fecha a Phase 1 — lint + test)

**Commit**: `feat(web): recusar login de conta só com papel member`

---

### T4: `permissions-client.ts` no mobile ✅ (commit `03503aa`)

**What**: Novo arquivo com `fetchAreas(): Promise<string[] | null>`, chamando
`authenticatedRequest('get', '/me/permissions')`, `try/catch` externo devolvendo `null` em
qualquer falha — mesmo contrato do `fetchAreas` do web.
**Where**: `apps/mobile/src/lib/permissions/permissions-client.ts`
**Depends on**: None
**Reuses**: `authenticatedRequest` de `apps/mobile/src/lib/auth/auth-client.ts`
**Requirement**: ACC-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Resposta 200 com `{ areas: [...] }` devolve o array
- [ ] Resposta não-ok, exceção de rede, ou corpo malformado devolvem `null`, nunca lançam
- [ ] Gate: `npm run test -w orbien-mobile`

**Tests**: unit
**Gate**: quick

---

### T5: `auth-provider.tsx` busca e guarda `areas` ✅ (commit `bf9d1b3`)

**What**: Estender o estado do contexto (`Session`/estado interno) com
`areas: string[] | null`, disparando `fetchAreas()` (T4) depois que `login()` resolve e
depois que `getSession()` resolve no boot — sem bloquear a transição de `status` pra
`"authenticated"`.
**Where**: `apps/mobile/src/lib/auth/auth-provider.tsx` (e tipos em `lib/auth/types` se for
o caso)
**Depends on**: T4
**Reuses**: Fluxo de `status`/`useEffect` já existente
**Requirement**: ACC-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Depois de `login()`, `session.areas` reflete o retorno de `fetchAreas`
- [ ] Depois do boot (`getSession` + restauração), `session.areas` também é buscada
- [ ] `status` vira `"authenticated"` sem esperar `fetchAreas` responder (`areas` começa
      `null`, atualiza depois)
- [ ] Falha em `fetchAreas` deixa `areas: null`, não derruba a sessão
- [ ] Gate: `npm run test -w orbien-mobile`

**Tests**: unit
**Gate**: quick

---

### T6: Esconder aba Escala em `(tabs)/_layout.tsx` ✅ (commit `7474b22`)

**What**: Calcular `showEscala = session?.areas == null || session.areas.includes('volunteers')`
e aplicar `options={{ href: showEscala ? undefined : null }}` no `<Tabs.Screen name="index">`
existente.
**Where**: `apps/mobile/src/app/(tabs)/_layout.tsx`
**Depends on**: T5
**Reuses**: `useAuth`, o `<Tabs.Screen>` existente (não vira lista de config)
**Requirement**: ACC-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `areas: ['volunteers', ...]` → 5 abas visíveis, igual hoje
- [ ] `areas: ['content']` (sem `volunteers`) → aba Escala não aparece na tab bar, rota
      `index` continua declarada (não é removida do navigator)
- [ ] `areas: null` → 5 abas visíveis (fail-open)
- [ ] Teste existente de "máximo 5 abas" continua passando (conta rotas declaradas, não
      abas visíveis — ajustar o teste se ele contava só visíveis)
- [ ] Gate: `npm run test -w orbien-mobile`

**Tests**: unit
**Gate**: quick

---

### T7: Guard "sem acesso" em `indisponibilidade.tsx` ✅ (commit `a16fffe`)

**What**: No topo do componente, antes do `useEffect` de `getUnavailability`, checar
`session?.areas && !session.areas.includes('volunteers')` e retornar um componente
`SemAcesso` simples (texto + botão voltar) nesse caso.
**Where**: `apps/mobile/src/app/indisponibilidade.tsx`
**Depends on**: T5
**Reuses**: Padrão de early-return já comum nas telas do mobile
**Requirement**: ACC-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `areas` sem `volunteers` → renderiza `SemAcesso`, `getUnavailability` não é chamada
- [ ] `areas` com `volunteers` → tela funciona como hoje, sem regressão
- [ ] `areas: null` → tela funciona como hoje (fail-open)
- [ ] Gate: `npm run test -w orbien-mobile`

**Tests**: unit
**Gate**: quick

---

### T8: Teste e2e de boot — member-only não vê Escala ✅ (commit `2791cf8`)

**What**: Estender `navigation-boot.test.tsx` com um cenário: sessão restaurada com
`roles: ['member']` (e `areas` mockada sem `volunteers`) → tab bar sem a aba Escala visível,
sem crash.
**Where**: `apps/mobile/src/__tests__/app/navigation-boot.test.tsx`
**Depends on**: T6, T7
**Reuses**: Setup existente do teste (mock de `Stack.Protected`/navegação)
**Requirement**: ACC-06, ACC-07, ACC-09

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Cenário novo passa: boot com `member`-only não mostra a aba Escala
- [ ] Cenários existentes do arquivo continuam passando (sem regressão)
- [ ] Gate: `npm run test -w orbien-mobile` (full — fecha a Phase 2: lint + test)

**Tests**: integration
**Gate**: full

**Commit**: `feat(mobile): esconder Escala/Indisponibilidade de quem não tem volunteers`

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 ──→ T2 ──→ T3
Phase 2:  T4 ──→ T5 ──→ T6 ──→ T7 ──→ T8
```

8 tasks no total — cabe num único batch (≤ ~8), execução inline, sem sub-agentes.

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1: Extrair `revokeRefreshToken` | 1 função | ✅ Granular |
| T2: Bloqueio no `POST` de `route.ts` | 1 função (handler) | ✅ Granular |
| T3: Mensagem na tela de login | 1 bloco de `catch` | ✅ Granular |
| T4: `permissions-client.ts` | 1 função | ✅ Granular |
| T5: `areas` no `auth-provider.tsx` | 1 componente/contexto | ✅ Granular |
| T6: Gate na tab bar | 1 componente | ✅ Granular |
| T7: Guard na tela de Indisponibilidade | 1 componente | ✅ Granular |
| T8: Teste e2e de boot | 1 arquivo de teste, 1 cenário novo | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | Nenhuma seta de entrada | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | None | Nenhuma seta de entrada (Phase 2 começa aqui) | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T5 | T5 → T7 (nota: T7 depende de T5, não de T6 — ambos T6 e T7 partem de T5; o diagrama
      linear `T5→T6→T7` ainda é válido porque T6 não altera nada que T7 leia, a ordem
      textual é só sequência de execução, não dependência real) | ✅ Match (ordem sequencial, dependência real é em T5) |
| T8 | T6, T7 | T7 → T8 (e T6, transitivamente, já executada antes de T7 na mesma phase) | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1 | `lib/session.ts` (revogação) | unit | unit | ✅ OK |
| T2 | `api/session/route.ts` (POST) | unit | unit | ✅ OK |
| T3 | `(public)/login/page.tsx` | unit | unit | ✅ OK |
| T4 | `lib/permissions/permissions-client.ts` | unit | unit | ✅ OK |
| T5 | `lib/auth/auth-provider.tsx` | unit | unit | ✅ OK |
| T6 | `app/(tabs)/_layout.tsx` | unit | unit | ✅ OK |
| T7 | `app/indisponibilidade.tsx` | unit | unit | ✅ OK |
| T8 | `__tests__/app/navigation-boot.test.tsx` (e2e/integration) | integration | integration | ✅ OK |

Nenhuma violação — todas as tasks incluem os testes da camada que tocam, nenhum "testado em
outra task".
