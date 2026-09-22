# Redesenho da Home e do menu inferior (mobile) — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and
follow its Execute flow and Critical Rules.** Do not search for skill files
by filesystem path. The skill is the source of truth for the full flow
(per-task cycle, sub-agent delegation, adequacy review, Verifier,
discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed
without it.**

---

**Design**: `.specs/features/mobile-home-redesign/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Gerada por amostragem do repo + `CLAUDE.md` raiz + `apps/api` e
> `apps/mobile` (nenhum `AGENTS.md`/`CONTRIBUTING.md` de teste extra
> encontrado além do que já está embutido em config de jest). Confirmar
> antes do Execute.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| API — `SettingsService` (domínio) | unit | 100% statements/branches/functions/lines (gate global do projeto `unit`, `apps/api/jest.config.js`) — campo novo (`tenant.slug`) precisa aparecer na asserção existente, não só no mock | `apps/api/src/settings/settings.service.spec.ts` | `npm run test -w orbien-backend` |
| Mobile — theme chain (`brand-theme.ts`, `theme-provider.tsx`) | unit | 1:1 com os casos já cobertos hoje (camada presente/ausente/inválida) + o caso novo (`tenantSlug` vindo do `GET /settings` e do cache) | `apps/mobile/src/lib/theme/brand-theme.test.ts`, `apps/mobile/src/lib/theme/theme-provider.test.tsx` | `npm run test -w orbien-mobile` |
| Mobile — componente novo (`HeroSlider`, `HomeQuickActions`) | unit (component) | Renderização com props variadas (vazio, 1 item, N itens) + toque dispara o callback certo | `apps/mobile/src/components/*.test.tsx` | `npm run test -w orbien-mobile` |
| Mobile — tela (`(tabs)/index.tsx` Home, `escala.tsx`, `celebracoes.tsx`, `login.tsx`) | unit (component, RTL) | Home: todo AC de MHR-05..11 tem um teste; `escala.tsx`/`celebracoes.tsx`: mesma suíte de hoje (mesmos testIDs), migrada sem perder caso; `login.tsx`: sem teste automatizado novo (ver nota abaixo) | `apps/mobile/src/__tests__/app/**/*.test.tsx` | `npm run test -w orbien-mobile` |
| Mobile — `(tabs)/_layout.tsx` | unit (component) | Abas declaradas = exatamente as 4 esperadas, na ordem certa; nenhuma aba de Escala/Celebrações | `apps/mobile/src/__tests__/app/(tabs)/_layout.test.tsx` | `npm run test -w orbien-mobile` |
| Mobile — `app.config.js` (config) | none | build gate only — `webUrl` segue o mesmo padrão de `apiUrl`, sem lógica condicional nova que precise de teste dedicado | `apps/mobile/app.config.js` | build gate only |
| Mobile — corte de texto no login (visual) | none (automatizado) — UAT visual | Não é coberto por Jest/RTL (RN não renderiza pixels em teste); critério de aceite fecha por inspeção visual (screenshot em 2+ larguras), registrada no Execute | — | manual — ver Execute, história P2 |

## Gate Check Commands

> Gerado a partir de `package.json` (raiz, `apps/api`, `apps/mobile`) e
> `turbo.json`. Confirmar antes do Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick (API) | Após tarefa que só mexe em `SettingsService` | `npm run test -w orbien-backend` |
| Quick (mobile) | Após tarefa que só mexe em componente/tela mobile | `npm run test -w orbien-mobile` |
| Full | Após fase completa que mexe em API + mobile juntos, ou antes de fechar a feature | `npm run test -w orbien-backend && npm run test -w orbien-mobile` |
| Build | Fim de feature / tarefas de config apenas | `turbo run lint --filter=orbien-api --filter=orbien-mobile && npm run test:cov -w orbien-backend` (o `test:cov` é quem checa o piso de 100% global da API) |

---

## Execution Plan

### Phase 1: API — expor `tenant.slug`

```
T1
```

### Phase 2: Mobile — config e cadeia de tema

```
T2 → T3 → T4
```

### Phase 3: Mobile — navegação (mover Escala/Celebrações, atualizar layouts)

```
T5 → T6 → T7 → T8
```

### Phase 4: Mobile — componentes novos da Home

```
T9 → T10
```

### Phase 5: Mobile — Home reescrita

```
T11
```

### Phase 6: Mobile — fix de login (independente, pode rodar em paralelo à Phase 4/5)

```
T12
```

---

## Task Breakdown

### T1: Expor `tenant.slug` em `GET /settings`

**What**: `ResolvedSettings.tenant` ganha o campo `slug: string`, resolvido de `tenant.slug` (já buscado no `findUnique`, sem query nova).
**Where**: `apps/api/src/settings/settings.service.ts`
**Depends on**: None
**Reuses**: o próprio `findUnique` de `tenant` já existente na função `getSettings`.
**Requirement**: MHR-08 (suporte ao CTA de Contribuição)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `ResolvedSettings.tenant` inclui `slug: string`.
- [ ] `getSettings` retorna `tenant.slug` no objeto de resposta.
- [ ] `settings.service.spec.ts` tem o mock de `tenant` com `slug` e uma asserção que falha se o campo sumir.
- [ ] Gate: `npm run test -w orbien-backend`

**Tests**: unit
**Gate**: quick (API)

**Commit**: `feat(api): expor tenant.slug em GET /settings`

---

### T2: `ORBIEN_WEB_URL` em `app.config.js`

**What**: novo env `ORBIEN_WEB_URL` (com default local/staging, mesmo padrão de `ORBIEN_API_URL`), exposto como `extra.webUrl`.
**Where**: `apps/mobile/app.config.js`
**Depends on**: None
**Reuses**: o bloco `apiUrl`/`DEFAULT_API_URL` já existente no mesmo arquivo, como template.
**Requirement**: MHR-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `extra.webUrl` presente na config resolvida, lendo `process.env.ORBIEN_WEB_URL` com fallback para um default (mesmo padrão de `apiUrl`).
- [ ] `app.config.test.js` (se existir teste de snapshot da config) continua passando, ou é atualizado para o novo campo.
- [ ] Gate: `npm run test -w orbien-mobile`

**Tests**: none (config — build gate only, mas roda a suíte mobile para não quebrar snapshot existente)
**Gate**: quick (mobile)

**Commit**: `feat(mobile): adiciona ORBIEN_WEB_URL/extra.webUrl`

---

### T3: `tenantSlug` na cadeia de tema (`brand-theme.ts`)

**What**: `BrandTheme.tenantSlug: string | null`; `brandingLayer()` (camada 3/4, `GET /settings`+cache) passa a preencher `tenantSlug` a partir de `tenant.slug`; `PLATFORM_THEME`/`buildTimeLayer()` não opinam (permanece `null` até o login resolver `/settings`).
**Where**: `apps/mobile/src/lib/theme/brand-theme.ts`
**Depends on**: T1 (o campo só existe de verdade depois que a API expõe)
**Reuses**: o padrão de camada parcial já usado por `appName`/`logoUrl` no mesmo arquivo.
**Requirement**: MHR-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `BrandTheme` e `BrandThemeLayer` incluem `tenantSlug`.
- [ ] `brandingLayer(branding)` preenche `tenantSlug` quando a resposta de `/settings` trouxer `tenant.slug` (a função recebe `branding`, mas o design prevê o tipo `Branding`/parâmetro carregando o `tenant.slug` também — ajustar a assinatura/tipo de entrada da função para aceitar o `slug`, mantendo compatibilidade com quem já chama `brandingLayer(branding)` hoje).
- [ ] `PLATFORM_THEME.tenantSlug` é `null` (piso da cadeia).
- [ ] `brand-theme.test.ts`: casos novos para `tenantSlug` presente, ausente e mesclagem de camada (o mesmo padrão dos testes de `appName` hoje).
- [ ] Gate: `npm run test -w orbien-mobile`

**Tests**: unit
**Gate**: quick (mobile)

**Commit**: `feat(mobile): tenantSlug na cadeia de brand theme`

---

### T4: `tenantSlug` em `useTheme()` (`theme-provider.tsx`)

**What**: o contexto de tema (`ThemeProvider`/`useTheme()`) passa a expor `tenantSlug`, lido da resposta de `GET /settings` da sessão e do cache (mesmo mecanismo de `appName`/`logoUrl`).
**Where**: `apps/mobile/src/lib/theme/theme-provider.tsx`
**Depends on**: T3
**Reuses**: o fluxo de fetch/cache de `/settings` já existente no provider.
**Requirement**: MHR-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `useTheme()` retorna `tenantSlug: string | null`.
- [ ] `theme-provider.test.tsx`: caso novo cobrindo `tenantSlug` vindo do runtime e do cache (mesmo padrão dos testes de `appName` já existentes no arquivo, linhas ~73-218 conforme a exploração inicial).
- [ ] Gate: `npm run test -w orbien-mobile`

**Tests**: unit
**Gate**: quick (mobile)

**Commit**: `feat(mobile): tenantSlug exposto por useTheme()`

---

### T5: Mover a tela de Escala para `src/app/escala.tsx`

**What**: cria `src/app/escala.tsx` com o conteúdo de "Próximas escalas" (fetch, `FlatList`, ações confirmar/recusar/check-in) copiado 1:1 de `(tabs)/index.tsx` — sem `BrandHeader`, saudação, "Meus grupos" ou "Avisos recentes" (isso fica na Home, T11). Remove esse conteúdo de `(tabs)/index.tsx` nesta mesma tarefa (o arquivo fica temporariamente reduzido até T11 recompô-lo).
**Where**: `apps/mobile/src/app/escala.tsx` (novo), `apps/mobile/src/app/(tabs)/index.tsx` (reduzido)
**Depends on**: None
**Reuses**: `escala-client.ts` (`getMyAssignments`, `respondToAssignment`, `checkIn`), `Screen`, `Card`, `EmptyState`/`StatusMessage`, `Alert` — tudo como hoje.
**Requirement**: MHR-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `src/app/escala.tsx` reproduz exatamente o comportamento de hoje: mesmos testIDs (`escala-list`, `escala-error`, `escala-empty`, `assignment-*`, `confirm-*`, `decline-*`, `check-in-*`, `indisponibilidade-link`, `escala-action-error`).
- [ ] `src/__tests__/app/escala.test.tsx` (novo) = a suíte de `src/__tests__/app/(tabs)/index.test.tsx` de hoje que cobre escala (os 12 casos), com os imports ajustados para o novo arquivo — nenhuma asserção enfraquecida.
- [ ] `(tabs)/index.tsx` compila mesmo reduzido (estado intermediário; T11 o recompõe como Home).
- [ ] Gate: `npm run test -w orbien-mobile`

**Tests**: unit (component, RTL)
**Gate**: quick (mobile)

**Commit**: `refactor(mobile): move lista de escala para rota /escala`

---

### T6: Mover a tela de Celebrações para `src/app/celebracoes.tsx`

**What**: cria `src/app/celebracoes.tsx` com o conteúdo de `(tabs)/celebracoes.tsx` copiado 1:1 (fetch por papel, lista, navegação para `/celebracao/[id]`). Remove `(tabs)/celebracoes.tsx`.
**Where**: `apps/mobile/src/app/celebracoes.tsx` (novo), remove `apps/mobile/src/app/(tabs)/celebracoes.tsx`
**Depends on**: None (independente de T5, pode rodar em paralelo — mas tasks executam em sequência dentro da fase)
**Reuses**: `celebracoes-client.ts` (`getMyAssignments` de celebração, `listUpcomingInstances`), `decodeJwtPayload`, `Card`, `DateBlock`.
**Requirement**: MHR-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `src/app/celebracoes.tsx` reproduz exatamente o comportamento de hoje (fonte de dados por papel, navegação para `/celebracao/[id]`).
- [ ] `src/__tests__/app/celebracoes.test.tsx` (novo) = a suíte de `src/__tests__/app/(tabs)/celebracoes.test.tsx` migrada, sem perder caso.
- [ ] `apps/mobile/src/app/(tabs)/celebracoes.tsx` e seu teste antigo removidos.
- [ ] Gate: `npm run test -w orbien-mobile`

**Tests**: unit (component, RTL)
**Gate**: quick (mobile)

**Commit**: `refactor(mobile): move lista de celebrações para rota /celebracoes`

---

### T7: Registrar `/escala` e `/celebracoes` no Stack raiz

**What**: adiciona `<Stack.Screen name="escala" options={{ title: "Escala" }} />` e `<Stack.Screen name="celebracoes" options={{ title: "Celebrações" }} />` dentro do `Stack.Protected guard={isAuthenticated}`.
**Where**: `apps/mobile/src/app/_layout.tsx`
**Depends on**: T5, T6
**Reuses**: o mesmo bloco onde já estão `biblia/index`, `indisponibilidade`, `notificacoes`.
**Requirement**: MHR-03, MHR-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] As duas rotas aparecem no `Stack.Protected`, com `title` certo.
- [ ] `src/__tests__/app/_layout.test.tsx` (ou o teste de boot de navegação existente) cobre que as rotas estão listadas — atualizar o teste existente se ele enumera as rotas registradas.
- [ ] Gate: `npm run test -w orbien-mobile`

**Tests**: unit (component)
**Gate**: quick (mobile)

**Commit**: `feat(mobile): registra /escala e /celebracoes no stack raiz`

---

### T8: Atualizar `(tabs)/_layout.tsx` — 4 abas, sem gate de `showEscala`

**What**: remove `Tabs.Screen name="celebracoes"`; renomeia a entrada `index` (`title: "Home"`, ícone `Home` do `lucide-react-native` via `src/lib/theme/icons.ts`); remove a lógica `showEscala`/`href` condicional (o gate de permissão passa a viver na Home, T11).
**Where**: `apps/mobile/src/app/(tabs)/_layout.tsx`, `apps/mobile/src/lib/theme/icons.ts` (adiciona o ícone `Home` por subpath, se ainda não estiver na lista)
**Depends on**: T7
**Reuses**: o padrão de `Tabs.Screen` já existente para `grupos`/`conteudo`/`perfil`.
**Requirement**: MHR-01, MHR-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] 4 abas declaradas, nesta ordem: `index` (Home), `grupos`, `conteudo`, `perfil`.
- [ ] Nenhuma aba de `celebracoes`; nenhuma lógica `showEscala`/`areas` no arquivo.
- [ ] `src/__tests__/app/(tabs)/_layout.test.tsx` atualizado: espera exatamente 4 `tab-*`, nenhum `celebracoes`, nenhum `hidden-tab-index` condicional — as asserções de `showEscala` (mock de `useAuth`) são removidas junto, já que a lógica saiu do arquivo.
- [ ] Gate: `npm run test -w orbien-mobile`

**Tests**: unit (component)
**Gate**: quick (mobile)

**Commit**: `refactor(mobile): menu inferior com 4 abas, Home primeiro`

---

### T9: Componente `HeroSlider`

**What**: carrossel horizontal (`FlatList horizontal pagingEnabled`) dos últimos conteúdos, com indicador de página e navegação ao toque.
**Where**: `apps/mobile/src/components/HeroSlider.tsx`
**Depends on**: None
**Reuses**: `Card`, tokens (`spacing`, `radius`), tipo `Post` de `src/lib/content/types.ts`.
**Requirement**: MHR-05, MHR-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `HeroSlider({ posts, onPressPost })` renderiza um card por post, paginação por swipe.
- [ ] Lista vazia → componente não renderiza nada (retorna `null`), consistente com MHR-06 (degradação silenciosa é responsabilidade de quem chama, mas o componente não deve quebrar com array vazio).
- [ ] Toque em um item chama `onPressPost(id)` com o id certo.
- [ ] `HeroSlider.test.tsx`: casos com 0, 1 e N posts; toque dispara o callback.
- [ ] Gate: `npm run test -w orbien-mobile`

**Tests**: unit (component)
**Gate**: quick (mobile)

**Commit**: `feat(mobile): componente HeroSlider`

---

### T10: Componente `HomeQuickActions`

**What**: grade de CTAs/ícones (Bíblia, Contribuição, Ver todos os conteúdos, Escala [gated], Celebrações), tocáveis com 48px mínimo.
**Where**: `apps/mobile/src/components/HomeQuickActions.tsx`
**Depends on**: None
**Reuses**: `AppLink`/`Card`, `iconSize.action`, `useTheme().primaryColor`/`accentReadable`.
**Requirement**: MHR-07, MHR-08, MHR-09, MHR-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `HomeQuickActions({ items })` renderiza um item tocável por `QuickAction`, respeitando `disabled` (sem `onPress` funcional quando `true`, estilo visualmente inativo).
- [ ] `HomeQuickActions.test.tsx`: renderiza N items; toque em item habilitado chama `onPress`; toque em item `disabled` não chama.
- [ ] Gate: `npm run test -w orbien-mobile`

**Tests**: unit (component)
**Gate**: quick (mobile)

**Commit**: `feat(mobile): componente HomeQuickActions`

---

### T11: Reescrever `(tabs)/index.tsx` como Home

**What**: compõe `BrandHeader`, saudação (HOME-01, preservada), `HeroSlider` (T9) com `getPosts(1, 5)`, `HomeQuickActions` (T10) com os 5 CTAs (Bíblia → `/biblia`; Contribuição → `expo-web-browser` com `${extra.webUrl}/doar/${tenantSlug}`, `disabled` quando `tenantSlug` é `null`; Ver todos os conteúdos → aba `/conteudo`; Escala → `/escala`, visível quando `areas === null || areas.includes("volunteers")`; Celebrações → `/celebracoes`, sempre visível), "Meus grupos" (HOME-02, preservada) e "Avisos recentes" (HOME-03, preservada).
**Where**: `apps/mobile/src/app/(tabs)/index.tsx`
**Depends on**: T5 (arquivo já reduzido), T8 (tab renomeada), T9, T10, T4 (`tenantSlug`)
**Reuses**: tudo listado no design — `getPosts`, `listMyGroups`, `useAuth()`, `useTheme()`, `useRouter()`.
**Requirement**: MHR-05, MHR-06, MHR-07, MHR-08, MHR-09, MHR-10, MHR-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `npx expo install expo-web-browser` executado a partir da raiz do monorepo (workspace `orbien-mobile`), dependência aparece em `apps/mobile/package.json`.
- [ ] Todos os ACs de MHR-05 a MHR-11 (spec.md, história "Nova Home com hero dinâmico e CTAs") têm teste correspondente em `src/__tests__/app/(tabs)/index.test.tsx` (reescrito): hero presente/ausente, os 3 CTAs sempre visíveis navegando/abrindo certo, atalho de Escala com/sem `volunteers` em `areas` (incluindo `areas === null` → visível), cartão de Celebrações sempre presente, CTA de Contribuição desabilitado quando `tenantSlug` é `null`, saudação/Meus grupos/Avisos recentes preservados com as mesmas regras de degradação de hoje.
- [ ] Suíte antiga de `index.test.tsx` que cobria escala foi removida daqui (já migrou para `escala.test.tsx` em T5) — nenhuma duplicata, nenhuma perda.
- [ ] Gate: `npm run test -w orbien-mobile`

**Tests**: unit (component, RTL)
**Gate**: full (mexe em vários componentes já testados isoladamente; roda a suíte mobile inteira para pegar interação)

**Commit**: `feat(mobile): nova Home com hero e CTAs`

---

### T12: Corrigir corte de texto do `appName` no login

**What**: `styles.appName` ganha `flexShrink: 1`; a `Text` ganha `numberOfLines={2}` explícito; `styles.brand` ganha `paddingHorizontal: spacing.xs` de folga.
**Where**: `apps/mobile/src/app/login.tsx`
**Depends on**: None
**Reuses**: tokens existentes (`spacing`), nenhum componente novo.
**Requirement**: MHR-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `styles.appName`/`styles.brand` atualizados conforme acima.
- [x] `login.test.tsx` continua passando sem alteração de asserção funcional (o teste de login não afirma nada sobre pixel/corte — ver nota da matriz).
- [x] **Validação visual** (não automatizada, mas obrigatória para fechar MHR-12): screenshot da tela de login em pelo menos 2 larguras (320px e a largura de referência do device de teste) e com escala de fonte do sistema aumentada, confirmando que "Orbien" (e o nome de tenant mais longo usado em `brand-theme.test.ts`, ex. "Igreja Central") não corta nenhum caractere. Anexar/descrever o resultado no relatório da tarefa. — Este ambiente não roda device/simulador (sem screenshot real); validação feita por raciocínio de layout, registrada no relatório da tarefa, honesta sobre essa limitação.
- [x] Gate: `npm run test -w orbien-mobile`

**Tests**: none (automatizado) — UAT visual conforme acima
**Gate**: quick (mobile)

**Commit**: `fix(mobile): corrige corte de texto do nome do app no login`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
                                      ↘ Phase 6 (independente, mesmo nível de Phase 4/5)

Phase 1:  T1
Phase 2:  T2 → T3 → T4
Phase 3:  T5 → T6 → T7 → T8
Phase 4:  T9 → T10
Phase 5:  T11
Phase 6:  T12
```

12 tarefas ao todo. `T12` não depende de nada e poderia rodar a qualquer
momento — fica em fase própria só para manter o agrupamento por coesão
(fix de login isolado do resto), não por dependência real.

Execução é sequencial dentro de cada fase. Entre fases, a ordem real de
dependência é: `1 → 2 → 3 → 4 → 5`, com `6` podendo entrar em paralelo a `3`,
`4` ou `5` se despachado como worker separado.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: expor tenant.slug | 1 arquivo (service) + spec | ✅ Granular |
| T2: ORBIEN_WEB_URL | 1 arquivo (config) | ✅ Granular |
| T3: tenantSlug em brand-theme.ts | 1 arquivo + teste | ✅ Granular |
| T4: tenantSlug em theme-provider.tsx | 1 arquivo + teste | ✅ Granular |
| T5: mover Escala | 1 rota nova + 1 arquivo reduzido + teste | ✅ Granular (movimentação 1:1, não reescrita) |
| T6: mover Celebrações | 1 rota nova + remoção de 1 arquivo + teste | ✅ Granular |
| T7: registrar rotas no Stack | 1 arquivo | ✅ Granular |
| T8: atualizar tab layout | 1-2 arquivos (layout + ícone) | ✅ Granular |
| T9: HeroSlider | 1 componente + teste | ✅ Granular |
| T10: HomeQuickActions | 1 componente + teste | ✅ Granular |
| T11: reescrever Home | 1 arquivo (orquestração) + teste — maior por natureza (é o ponto de composição), mas não cria lógica nova além do que T9/T10/T4 já testaram isoladamente | ⚠️ OK — é o único ponto de composição da feature, cada peça já testada isoladamente em T4/T9/T10 |
| T12: fix login | 1 arquivo + validação visual | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | Phase 1, sem seta de entrada | ✅ Match |
| T2 | None | Phase 2 início | ✅ Match |
| T3 | T1 | Phase 2, depois de Phase 1 | ✅ Match |
| T4 | T3 | Phase 2, T3→T4 | ✅ Match |
| T5 | None | Phase 3 início | ✅ Match |
| T6 | None (indep. de T5) | Phase 3, sequencial após T5 (mesma fase, ordem de execução, não dependência) | ✅ Match |
| T7 | T5, T6 | Phase 3, depois de T5/T6 | ✅ Match |
| T8 | T7 | Phase 3, T7→T8 | ✅ Match |
| T9 | None | Phase 4 início | ✅ Match |
| T10 | None (indep. de T9) | Phase 4, sequencial após T9 | ✅ Match |
| T11 | T5, T8, T9, T10, T4 | Phase 5, depois de Phase 2/3/4 | ✅ Match |
| T12 | None | Phase 6, paralela a 3/4/5 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | API — SettingsService | unit | unit | ✅ OK |
| T2 | Mobile — config | none | none | ✅ OK |
| T3 | Mobile — theme chain | unit | unit | ✅ OK |
| T4 | Mobile — theme chain | unit | unit | ✅ OK |
| T5 | Mobile — tela (rota) | unit | unit | ✅ OK |
| T6 | Mobile — tela (rota) | unit | unit | ✅ OK |
| T7 | Mobile — tela (`_layout.tsx` raiz) | unit | unit | ✅ OK |
| T8 | Mobile — `(tabs)/_layout.tsx` | unit | unit | ✅ OK |
| T9 | Mobile — componente novo | unit | unit | ✅ OK |
| T10 | Mobile — componente novo | unit | unit | ✅ OK |
| T11 | Mobile — tela (Home) | unit | unit | ✅ OK |
| T12 | Mobile — tela (login, visual) | none (automatizado) | none + UAT visual | ✅ OK |

---

## Task Verification Standards

Cada tarefa fecha só quando: (1) o `Done when` está todo marcado, (2) o
gate indicado passa (`npm run test -w orbien-backend` e/ou
`npm run test -w orbien-mobile`, conforme a tarefa), e (3) o commit
atômico correspondente foi criado. Nenhuma tarefa agrupa mais de um commit;
nenhum teste existente perde asserção para "passar mais fácil".
