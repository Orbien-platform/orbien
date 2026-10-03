# PIX recorrente do doador (mobile) — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and follow
its Execute flow and Critical Rules.** Do not search for skill files by
filesystem path. The skill is the source of truth for the full flow
(per-task cycle, sub-agent delegation, adequacy review, Verifier,
discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed
without it.**

---

**Design**: `.specs/features/pix-recorrente-doador-mobile/design.md`
**Status**: Executado em parte, **atrás da trava `ASAAS_PAYMENTS_ENABLED`**
(desligada para todo tenant) — decisão do dono do produto em 2026-10-03:
"deixar minimamente pronto, mas não disponível nem para Premium nem para
Starter, e lançar depois do produto no mercado" (`PROD-28`, `AD-008`).

**Progresso de Execute (2026-10-03, branch `docs/spec-pix-recorrente-doador-mobile`):**

| Task | Estado | Nota |
|---|---|---|
| T1, T2, T3 (Fase 0 / P0) | **não feito** | Spike Asaas e entrega da cobrança do ciclo ao doador seguem abertos (`PROD-28`, "O que falta" 3) |
| T3b (split, AD-006/AD-007) | **não feito** | Depende de `asaas-taxa-e-split-padrao` |
| T4 | parcial | Migration `add_pix_subscription_consent`: `consent_version`, `consent_accepted_at`. **Sem** status `pending` nem `idempotency_key` (ver desvio 1) |
| T5 | feito | Unique parcial `pix_subscriptions_one_active_per_donor`; bootstrap/RLS 023 sem mudança |
| T6 | feito | `PixService.createSubscriptionFor` / `cancelSubscriptionRow`, tesoureiro intacto |
| T7 | feito | Pessoa e plano do banco, sessão de suporte barrada |
| T8 | parcial | Limites, aceite, 409 por pré-checagem + unique, compensação na Asaas. Sem saga `pending` (desvio 1) |
| T9 | feito | Lista com contribuições confirmadas; cancelar com 404-Asaas = removida |
| T10 | parcial | Controller sem `/:id/charge` (depende de T3) |
| T11 | feito | `test/integration/me-pix-subscriptions.spec.ts` (11 testes) — sensor: sem o filtro por pessoa, 2 falham |
| T12–T14 | feito | Cliente, tela `dizimo-automatico`, entrada na Home (trava **e** Premium) |
| (novo) | feito | Trava `ASAAS_PAYMENTS_ENABLED` na API, web (aba PIX, preço de evento) e app |

**Desvios (SPEC_DEVIATION):**

1. Idempotência sem status `pending` e sem `Idempotency-Key`: a garantia é a
   unique parcial (uma ativa por doador) + compensação (cancela na Asaas se a
   gravação falha). Cobre toque duplo e reenvio; não cobre a API cair entre a
   Asaas responder e a compensação — fica logado com o id
   (`Assinatura Asaas … órfã`) para reconciliação. Saga `pending` + job de
   reconciliação ficam em `PROD-28`, "O que falta" 4.
2. Entrada só na Home (sem atalho no Perfil) — mínimo pedido.
3. O tesoureiro também passa a ter "uma ativa por doador" (efeito da unique
   no banco) — antes podia criar duas para a mesma pessoa.

**Branch de execução (quando aprovada)**: `feat/pix-recorrente-doador-mobile`.
**Ambiente de teste**: só `teste1-church`/`teste2-church`; nunca `doca-church`.
Sandbox Asaas apenas.

---

## Test Coverage Matrix

> Guidelines found: `CLAUDE.md` (raiz), `apps/api/package.json`, `apps/mobile/package.json`, `apps/api/test/rls/*`, `docs/TESTES.md`, `docs/AMBIENTES.md`. Confirmar com o time antes do Execute.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| Serviço de auto-serviço (`PixSubscriptionSelfService`) | unit | 1:1 com ACs P1; todos os erros da tabela de Error Handling | `apps/api/src/financial/*.spec.ts` (co-locado, padrão de `pix.service.spec.ts`) | `npm run test:unit -w orbien-backend` |
| Controller `/me/pix-subscriptions` | unit + integration | rotas: feliz, 403 plano (claim premium × banco starter), 409, 404 IDOR, 400 body com `donor_person_id` | `apps/api/src/financial/*.spec.ts`, `apps/api/test/integration/` | `npm run test:integration -w orbien-backend` |
| Isolamento multi-tenant/pessoa | RLS | cross-tenant e cross-congregação de leitura **e** escrita; (se Q5) cross-pessoa | `apps/api/test/rls/pix-subscriptions.spec.ts` (estender) | `npm run test:rls -w orbien-backend` |
| Invariante de papéis | unit | rota `/me/pix-subscriptions` na allowlist com justificativa | `apps/api/src/auth/roles-invariant.spec.ts` | `npm run test:unit -w orbien-backend` |
| Migration/SQL (índice parcial, enum `pending`) | build + RLS | passo 7 do bootstrap continua verde | `apps/api/scripts/bootstrap-db.sh` | `bash apps/api/scripts/bootstrap-db.sh` (Postgres local) |
| Cliente e tela mobile | unit (jest + test-renderer) | cada estado da tela; "cancelado" nunca aparece em erro | `apps/mobile/src/**/*.test.tsx` | `npm run test -w orbien-mobile` |
| Entrada na Home/Perfil | unit | visível só com `plan==="premium"`; `disabled` sem handler | `apps/mobile/src/components/HomeQuickActions.test.tsx`, `src/__tests__/app/(tabs)/index.test.tsx` | idem |

## Gate Check Commands

| Gate Level | When to Use | Command |
|---|---|---|
| Quick | tasks só com unit | `npm run test:unit -w orbien-backend` / `npm run test -w orbien-mobile` |
| Full | integração/RLS | quick + `npm run test:integration -w orbien-backend` + `npm run test:rls -w orbien-backend` |
| Build | fim de fase | `npm run build:api`, `turbo run lint --filter=orbien-backend --filter=orbien-mobile`, `node scripts/check-skills.mjs` |

---

## Execution Plan

```
Fase 0 (spike + P0) → Fase 1 (modelo) → Fase 2 (API doador) → Fase 3 (testes de segurança) → Fase 4 (mobile)
```

### Fase 0 — Decidir e fechar o P0 (bloqueia o resto)

| ID | Task | Depends on | Tests | Done when |
|---|---|---|---|---|
| T1 | Spike em sandbox Asaas: o que `billingType:PIX` + `MONTHLY` gera; como obter `invoiceUrl`/QR do ciclo; se existe PIX Automático com autorização do doador. Registrar em `context.md` | — | none (pesquisa) | Q1 respondida com evidência da doc/sandbox |
| T2 | Dono decide Q1–Q3 e Q8; registrar em `context.md` | T1 | none | Decisões gravadas |
| T3b | Criar a assinatura pelo `AsaasChargeService` (AD-006): split de 1% e credencial do tenant; depende de `asaas-taxa-e-split-padrao` A3–A6 | T2, A4 | unit: corpo da assinatura contém `split`; sem config → 503 | PRD-DONOR-12 |
| T3 | `asaasGet` + método `getCurrentCharge(subscription)` no `PixService` (QR/copia-e-cola do ciclo em aberto) | T2 | unit (Asaas mockado: aberto, nenhum, erro) | PRD-DONOR-01 coberto; fluxo do tesoureiro também pode usar |

### Fase 1 — Modelo de dados

| ID | Task | Depends on | Tests | Done when |
|---|---|---|---|---|
| T4 | Migration Prisma: enum `pending`, `asaas_subscription_id` opcional, `idempotency_key`, `consent_version`, `consent_at` + `@@unique` | T2 | build | `prisma migrate` aplica em banco local; `findUnique` do webhook compila |
| T5 | SQL do índice único parcial (ativas/pendentes por doador) dentro da migration; confirmar que o passo 7 do `bootstrap-db.sh` segue verde | T4 | RLS (bootstrap) | `bootstrap-db.sh` completo sem erro; segunda `active` do mesmo doador viola o índice |

### Fase 2 — API do doador

| ID | Task | Depends on | Tests | Done when |
|---|---|---|---|---|
| T6 | Extrair o miolo de `createSubscription` para método com `donorPersonId` explícito (tesoureiro intacto) | T4 | unit (regressão do spec existente) | Suite atual de `pix.service.spec.ts` passa sem editar asserts |
| T7 | `PixSubscriptionSelfService.resolveDonor` + `assertPremium` (banco) + barrar `support_session` | T6 | unit: sem `person_id`→409, claim premium×banco starter→403, suporte→403 | PRD-DONOR-02/03 |
| T8 | `create` em saga `pending→active` com `Idempotency-Key`, limites de valor, consentimento, reconciliação de `pending` | T5, T7 | unit: ACs P1-criar 1-8 (inclui Asaas falha/timeout, retry, duplicata) | PRD-DONOR-02/04/08 |
| T9 | `list` (+ histórico de `PixPayment` recorrente) e `cancel` (Asaas primeiro, 404=removida, idempotente, 404 alheia) | T7 | unit: ACs P1-ver e P1-cancelar | PRD-DONOR-05/06/07 |
| T10 | Controller `/me/pix-subscriptions` (+ `/:id/charge`), `@Throttle`, allowlist em `roles-invariant.spec.ts` | T8, T9, T3 | unit + integration | Rotas respondem; invariante passa |

### Fase 3 — Prova de segurança

| ID | Task | Depends on | Tests | Done when |
|---|---|---|---|---|
| T11 | Integração/RLS: `member` A × `member` B (mesma congregação), outro tenant, outra congregação; corpo com `donor_person_id`; claim `premium` × banco `starter`; webhook após cancelar | T10 | integration + RLS, **só dados descartáveis `pixsub-*`/`teste1-church`** | Cada vetor do spec tem teste vermelho sem a defesa (discrimination sensor) |

### Fase 4 — Mobile (carregar `frontend-design` antes)

| ID | Task | Depends on | Tests | Done when |
|---|---|---|---|---|
| T12 | Cliente `src/lib/pix-recorrente/` (+ tipos, erros → mensagens) | T10 | unit | Mapeia 403/409/404/503 para estados |
| T13 | Tela `dizimo-automatico.tsx`: todos os estados, aceite de consentimento, QR/copia-e-cola do ciclo, cancelar com confirmação | T12 | unit por estado | PRD-DONOR-08/09/10; "cancelado" só após 200 |
| T14 | Entrada na Home (`HomeQuickActions`) e no Perfil, só `plan==="premium"`; rota registrada em `_layout.tsx` | T13 | unit | Starter não vê; Premium vê; sem handler quando `disabled` |

**Totais**: 15 tasks (T3b inclusa), 5 fases. > ~8 tasks ⇒ no Execute, **oferecer sub-agentes** por fase (Fase 0 sempre inline: decisão humana).

### Diagram-Definition Cross-Check

| Task | Depends on (definição) | No diagrama | ✓ |
|---|---|---|---|
| T3 | T2 | Fase 0 → | ✓ |
| T4 | T2 | Fase 0 → Fase 1 | ✓ |
| T5 | T4 | Fase 1 | ✓ |
| T6–T10 | T4/T5/T7–T9 | Fase 2 após 1 | ✓ |
| T11 | T10 | Fase 3 | ✓ |
| T12–T14 | T10→T12→T13→T14 | Fase 4 | ✓ |

### Test Co-location Validation

| Task | Tests no task | Bate com a Matrix | ✓ |
|---|---|---|---|
| T3, T6–T9 | unit | Serviço: unit | ✓ |
| T10 | unit + integration | Controller | ✓ |
| T11 | integration + RLS | Isolamento | ✓ |
| T4 | build | Migration: build | ✓ |
| T5 | RLS (bootstrap) | Migration/SQL | ✓ |
| T12–T14 | unit | Mobile | ✓ |
| T1, T2 | none (decisão) | n/a | ✓ |

## Ferramentas por task (a confirmar com o usuário antes do Execute)

Skills: `frontend-design` (T13/T14, obrigatória), `security-review` e `pr-review` ao fechar a Fase 3. MCPs: nenhum necessário.
