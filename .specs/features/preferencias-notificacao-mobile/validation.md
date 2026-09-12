# Preferências de notificação (mobile) — Validation

**Date**: 2026-09-11
**Spec**: `.specs/features/preferencias-notificacao-mobile/spec.md`
**Diff range**: `60394ac..HEAD` (18 commits, 36 files changed)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | Model `NotificationPreference` + migration, commit `9a11083` |
| T2   | ✅ Done | RLS script `008_rls_notification_preferences.sql` + bootstrap wiring, commit `ac1fde4` |
| T3   | ✅ Done | Teste de isolamento RLS, commit `828587f` — SPEC_DEVIATION verificada como correta (ver seção própria) |
| T4   | ✅ Done | `notification-categories.ts`, commit `1704fa8` |
| T5   | ✅ Done | `NotificationPreferencesService`, commit `ea41a91` |
| T6   | ✅ Done | `NotificationPreferencesController` + DTO, commit `6e810a4` |
| T7   | ✅ Done | Wiring `ContentModule`, commit `67accb2` |
| T8   | ✅ Done | Teste de integração HTTP, commit `df79f91` |
| T9   | ✅ Done | Filtro de categoria em `notifyPost`, commit `cd89f54` |
| T10  | ✅ Done | Cliente mobile, commit `bffac82` |
| T11  | ✅ Done | `syncNotificationPreferenceTags`, commit `6aaca18` |
| T12  | ✅ Done | Sincronização em `NotificationsProvider`, commit `baeeb9f` |
| T13  | ✅ Done | Tela `notificacoes.tsx`, commit `97ee5a8` |
| T14  | ✅ Done | Navegação em Perfil + registro em `_layout.tsx`, commits `7c48065`, `12fca2f` |

All 14 tasks are commits atomic per task, matching what each commit message claims (verified against `git diff 60394ac..HEAD --stat` and per-file diffs).

---

## Spec-Anchored Acceptance Criteria

### P1: Escolher categorias de notificação

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: primeira abertura sem registro salvo → 4 categorias ligadas | 4 booleans `true` | `apps/api/src/content/notification-preferences.service.spec.ts:18-27` — `expect(result).toEqual({ avisos: true, oracao: true, eventos: true, devocional: true })`; `apps/api/test/integration/notification-preferences.spec.ts:90-97` — `expect(res.body).toEqual({avisos:true,oracao:true,eventos:true,devocional:true})`; `apps/mobile/src/__tests__/app/notificacoes.test.tsx:29-40` — 4 `switch-*` com `props.value === true` | ✅ PASS |
| AC2: desligar categoria → persiste no servidor e reflete na UI sem reabrir | UI reflete imediatamente (otimista), sem esperar novo GET | `apps/mobile/src/__tests__/app/notificacoes.test.tsx:42-65` — `expect(screen.getByTestId("switch-oracao").props.value).toBe(false)` logo após `fireEvent`, antes do `waitFor` no mock de PATCH; `apps/api/test/integration/notification-preferences.spec.ts:99-117` — PATCH persiste e GET seguinte reflete `oracao:false` | ✅ PASS |
| AC3: falha na persistência → reverte toggle e mostra erro | Nunca mostrar "desligado" com servidor ainda "ligado" | `apps/mobile/src/__tests__/app/notificacoes.test.tsx:67-85` — após rejeição, `expect(screen.getByTestId("switch-eventos").props.value).toBe(true)` (revertido) e `expect(screen.getByTestId("save-error")).toBeTruthy()`; adicionalmente `expect(mockSyncNotificationPreferenceTags).not.toHaveBeenCalled()` (não sincroniza tag em falha) | ✅ PASS |
| AC4: reabrir em outro aparelho autenticado na mesma conta → mesmo estado salvo | Preferência é da conta, não do device (servidor é fonte de verdade) | `apps/api/test/integration/notification-preferences.spec.ts:99-117` — PATCH pela conta A e GET subsequente pela mesma conta reflete `oracao:false` (prova que o dado mora no servidor, por `user_account_id`, não em qualquer estado local); reforçado por `notification-preferences.spec.ts:132-145` (conta B nunca vê a alteração de A) | ✅ PASS |

**Status P1 (story 1)**: ✅ All ACs covered.

### P1: O disparo respeita a categoria desligada

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: desligar categoria → sincroniza tag `pref_<categoria>=false` após persistência ter sucesso | `OneSignal.User.addTags` chamado com string `"false"`, só após sucesso do PATCH | `apps/mobile/src/lib/notifications/onesignal-client.test.ts:91-105` — `expect(mockAddTags).toHaveBeenCalledWith({pref_avisos:"true",pref_oracao:"false",pref_eventos:"true",pref_devocional:"false"})`; `apps/mobile/src/__tests__/app/notificacoes.test.tsx:42-65` — `syncNotificationPreferenceTags` chamado só dentro do `.then` de sucesso, com o `updated` devolvido pelo servidor | ✅ PASS |
| AC2: app inicializa/registra dispositivo → sincroniza as 4 tags a partir do servidor | Fluxo de login/registro (MOB-07) também sincroniza tags de preferência | `apps/mobile/src/lib/notifications/notifications-provider.test.tsx:97-113` — `expect(mockGetNotificationPreferences).toHaveBeenCalled()` e `expect(mockSyncNotificationPreferenceTags).toHaveBeenCalledWith(prefs)` no mesmo efeito de `registerDevice`; falha de rede não propaga: `notifications-provider.test.tsx:116-131` | ✅ PASS |
| AC3: `ContentPost` de categoria desligada publicado → backend exclui o dispositivo do envio | Filtro OneSignal `!=` aplicado ao array de filtros existente | `apps/api/src/content/notifications.service.spec.ts:74-91` — `expect(payload.filters).toContainEqual({field:'tag',key:'pref_eventos',relation:'!=',value:'false'})`; `notifications.service.spec.ts:116-129` — filtro aditivo, preserva filtro de segmento existente | ✅ PASS |
| AC4: tag de preferência ausente (nunca abriu a tela / app antigo) → tratado como categoria ligada | Default é opt-out, nunca opt-in por ausência | `apps/api/src/content/notifications.service.ts:40-45` — usa `relation: '!='` (não `not_exists OR '='`): semântica OneSignal documentada em `design.md` (Tech Decisions) trata tag ausente como "diferente de 'false'"; coberto indiretamente pelos testes de `notifications.service.spec.ts:74-129` que verificam que o filtro emitido é sempre `!=` (nunca `=`), nunca testado com um device real sem a tag (é comportamento de terceiro documentado, não simulável em unit) | ⚠️ Spec-precision gap (comportamento depende de semântica documentada do provedor externo, não verificável localmente por teste; a mutação #1 do sensor abaixo confirma que `!=` é a condição realmente aplicada) |

**Status P1 (story 2)**: 3/4 PASS diretos; 1 flagged como spec-precision gap (dependência de comportamento externo do OneSignal, não simulável em unit test — o design.md já documenta essa decisão com a citação da doc do provedor). Não é uma lacuna de implementação: o código aplica exatamente o `relation: '!='` que a spec pede; o gap é epistemológico (não há como testar localmente "o OneSignal de fato trata ausência de tag como != 'false'" sem uma chamada real à API deles).

### Edge Cases

| Edge Case | file:line + assertion | Result |
| --- | --- | --- |
| Desligar as 4 categorias — sem piso mínimo | `apps/api/src/content/notification-preferences.service.spec.ts` (`update` aceita patch parcial ou total, sem validação de mínimo) e DTO (`update-notification-preferences.dto.spec.ts:16-19`, todas opcionais) — nenhuma validação de "ao menos uma ligada" existe em nenhum lugar do código, o que é o comportamento correto (permitir) | ✅ PASS |
| Duas chamadas de toggle em sequência rápida — serializar por categoria | `apps/mobile/src/__tests__/app/notificacoes.test.tsx:87-125` — teste explícito com categorias diferentes não se bloqueando e resposta atrasada da mesma categoria não sobrescrevendo a mais recente (`pendingRef` no código, `notificacoes.tsx:60-96`) | ✅ PASS |
| Conta nunca teve `notification_preferences` — GET responde 4 ligadas sem criar linha | `notification-preferences.service.spec.ts:18-27` — `expect(client.notificationPreference.upsert).not.toHaveBeenCalled()` | ✅ PASS |
| Logout + login com outra conta — não herdar tags da conta anterior | Nenhum teste novo cobre especificamente "tags `pref_*` não herdadas entre contas no mesmo device" — depende do mecanismo pré-existente `unregisterDevice()`/`OneSignal.logout()` (MOB-07, não alterado por esta feature) seguido do novo `getNotificationPreferences().then(syncNotificationPreferenceTags)` no próximo login (`notifications-provider.tsx:40-47`) | ⚠️ Spec-precision gap — mecanismo plausível (reutiliza o padrão já existente para `tenant_id`/`congregation_id`/`role`, que tem o mesmo risco e não tem teste próprio de "não herda entre contas" além de `logout()` ser chamado), mas nenhum teste desta feature afirma esse comportamento explicitamente para as tags `pref_*` |

---

## Discrimination Sensor

Executado em worktree descartável (`git worktree add --detach /tmp/orbien-mutate HEAD`), nunca no working tree real.

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `apps/api/src/content/notifications.service.ts:43` | `relation: '!='` → `relation: '='` no filtro de categoria de `notifyPost` | ✅ Killed — `notifications.service.spec.ts` (2 asserções falharam) |
| 2 | `apps/api/src/content/notification-preferences.service.ts:23` | Default sem linha salva `{...ALL_ON}` → `{avisos: false, oracao: true, eventos: true, devocional: true}` | ✅ Killed — `notification-preferences.service.spec.ts` (AC1) falhou |
| 3 | `apps/mobile/src/app/notificacoes.tsx:95` | Removida a chamada `syncNotificationPreferenceTags(result)` no `.then` de sucesso do toggle | ✅ Killed — `notificacoes.test.tsx` (2 testes falharam: AC2 e Edge Case da fila) |

**Sensor depth**: lightweight (3 mutações, feature não é P0/pagamento/auth)
**Result**: 3/3 killed — PASS ✅

Worktree removida ao final (`git worktree remove /tmp/orbien-mutate --force`); nenhuma mutação chegou ao working tree real.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — nenhuma abstração além do necessário (mapeamento de categoria é a única "infraestrutura" nova, e é reaproveitada nos dois lados, como o design pedia) |
| Surgical changes | ✅ — `notifyPost`/`buildFilters` estendidos, não reescritos; `NotificationsProvider` ganhou só o efeito novo |
| No scope creep | ✅ — a correção de `_layout.tsx` (registro em `Stack.Protected`) é parte inseparável de "dar navegação" à rota nova, não scope creep (a task já documentava essa nota) |
| Matches patterns | ✅ — segue `*-client.ts`, `UnavailabilityController`/`Service`, `007_rls_songs.sql` ao pé da letra |
| Spec-anchored outcome check (asserted values match spec) | ✅ — ver tabela acima; 1 spec-precision gap flagged (dependência de comportamento externo do OneSignal), não uma falha de assertividade |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ — rota HTTP cobre happy path (GET/PATCH) + isolamento entre contas (error/edge: conta B não lê/escreve A) |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — cada teste novo cita a AC/Edge Case correspondente no nome ou comentário |
| Documented guidelines followed | ✅ — `CLAUDE.md` raiz (RLS `USING`==`WITH CHECK`, tag de preferência, sem `@Roles` em rota de própria conta) |

---

## Gate Check

- **Gate command (Build)**: `npm run build:api` e `turbo run lint` (via `npx turbo run lint`, pois `turbo` não está no PATH)
- **Result**:
  - `npm run build:api` — sucesso (cache hit)
  - `npx turbo run lint` — 5/5 pacotes com sucesso, 0 erros (79 warnings pré-existentes no `orbien-mobile`, nenhum novo introduzido pelos arquivos desta feature além dos mesmos padrões já presentes em todo o resto do repositório — `import/first` e `no-redeclare` de `screen`/`Text`, idênticos aos de todo outro arquivo de teste do projeto)
  - `npm run test:unit -w orbien-backend` — 221 suites, 2068 testes, **todos passando**. (Nota do ambiente: a primeira execução falhou com `TypeError: undefined is not a function` em TODAS as 221 suítes por um `jest-circus@29.7.0` extraneous na raiz, incompatível com `jest@30.5.1` do `orbien-backend`; `npm install` a partir da raiz — mandado pelo `CLAUDE.md` — resolveu, confirmando que não era um problema desta feature, mas de estado de `node_modules` divergente do lockfile nesta sessão)
  - `npm run test:integration -w orbien-backend` — 10 suites, 54 testes, todos passando
  - `npm run test:rls -w orbien-backend` — 2 suites, 68 testes, todos passando
  - `npm run test -w orbien-mobile` — 41 suites, 251 testes: **38 suites passando, 3 falhando** (`animated-splash.test.tsx`, `_layout.test.tsx`, `navigation-boot.test.tsx`); 244 testes passando, 7 falhando
- **Test count before feature**: não medido diretamente no merge-base para os projetos backend (não há necessidade — nenhuma alegação de teste removido); mobile no merge-base: mesmas 3 suítes/7 testes falhando (confirmado abaixo)
- **Test count after feature**: 2068 (unit) + 54 (integration) + 68 (rls) no backend; 251 no mobile (244 passando)
- **Delta**: +muitos testes novos (16 arquivos de teste novos/estendidos no diff, ver `git diff --stat`), 0 testes removidos
- **Skipped tests**: nenhum
- **Failures**: 3 suítes do mobile, pré-existentes — investigadas e confirmadas abaixo, não bloqueiam esta feature

### Investigação da falha pré-existente do mobile (obrigatória pelo prompt)

Confirmado independentemente, não aceito de graça:

1. `git diff 60394ac..HEAD --stat` não lista `src/lib/splash/animated-splash.test.tsx`, `src/lib/splash/animated-splash.tsx`, `src/__tests__/app/_layout.test.tsx`, nem `src/__tests__/app/navigation-boot.test.tsx` entre os arquivos alterados por esta feature.
2. `apps/mobile/src/app/_layout.tsx` (que `_layout.test.tsx` e `navigation-boot.test.tsx` exercitam) foi tocado por esta feature (1 linha: `<Stack.Screen name="notificacoes" .../>`), mas o erro reportado (`Unable to locate attached view in the native tree` dentro de `Animated.timing`) não tem relação com `Stack.Screen`/rotas — é um erro de runtime do `react-native-reanimated`/`Animated` na simulação de teste, independente da linha adicionada.
3. Reproduzido em worktree isolada no merge-base puro (`git worktree add --detach 60394ac`, com `node_modules` linkado): `npx jest` nas 3 suítes retorna **exatamente** o mesmo resultado — 3 suítes falhando, 7 testes falhando — antes de qualquer commit desta feature existir.
4. Conclusão: pré-existente, confirmado por reprodução direta no merge-base, não apenas por inferência do diff. Não é bloqueio desta feature.

---

## Fix Plans

Nenhum fix obrigatório. Duas observações não-bloqueantes (spec-precision gaps) documentadas acima:

1. MOB-10b AC4 (tag ausente tratada como ligada) depende de semântica documentada do OneSignal sobre `!=` com tag ausente — não testável localmente sem uma chamada real à API do provedor. O código aplica a condição correta (`relation: '!='`), e a decisão está documentada com a fonte em `design.md` (Tech Decisions). Não é uma falha de implementação — é o teto do que um teste local consegue provar sobre um sistema de terceiro.
2. Edge Case "logout + login com outra conta não herda tags" não tem teste explícito para as tags `pref_*` novas — o mecanismo (reuso de `OneSignal.logout()` já existente + sync no próximo login) é o mesmo padrão que `tenant_id`/`congregation_id`/`role` já usam sem teste dedicado a esse cenário específico. Risco baixo e simétrico ao que o produto já aceita para MOB-07; não é uma regressão introduzida por esta feature.

Nenhum dos dois altera o veredito: são gaps de precisão de spec/teste, não critérios de aceite falhando ou funcionalidade ausente.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| MOB-10a     | Implementing     | ✅ Verified |
| MOB-10b     | Implementing     | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 7/8 ACs matched spec outcome diretamente; 1 spec-precision gap flagged (dependência de comportamento documentado de terceiro, não uma falha de implementação); ambos os Edge Cases centrais (fila por categoria, GET sem linha) cobertos, 1 edge case secundário (não herdar tag entre contas) sem teste dedicado mas com mecanismo herdado e plausível
**Sensor**: 3/3 mutações mortas
**Gate**: build ✅, lint ✅ (0 erros), unit 2068/2068, integration 54/54, rls 68/68, mobile 244/251 (7 falhas em 3 suítes pré-existentes, confirmadas por reprodução no merge-base — fora do escopo desta feature)

**What works**: as duas User Stories P1 estão de ponta a ponta — tela mobile com 4 toggles, persistência no servidor com RLS por congregação (AD-001), sincronização de tag OneSignal em dois pontos (login e toggle), e o disparo de push filtrando por categoria desligada com a semântica `!=` correta. O SPEC_DEVIATION registrado em T3 é uma correção legítima do texto da task para bater com AD-001 (verificado independentemente: `app_congregation_allowed()` de fato tem a exceção `tenant_admin` incondicional, sem parâmetro por tabela para desligá-la).

**Issues found**: nenhuma bloqueante. Dois spec-precision gaps documentados (ver Fix Plans) — não geram fix task.

**Next steps**: nenhum. Feature pronta para fechar; traçabilidade atualizada em `spec.md` e em `app-mobile/spec.md`.
