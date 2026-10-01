# Doação pública Premium com QR dinâmico — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/doacao-publica-premium-qr-dinamico/design.md`
**Status**: Draft — **não executar** antes de o dono do produto responder as perguntas BLOQ (§Perguntas abertas) e aprovar as tarefas.

> Esta sessão foi só de planejamento: nenhuma tarefa abaixo foi implementada.
> Cada tarefa = um commit atômico, em português, com os testes dela dentro.
> Branch por PR (regra do monorepo): `fix/`, `feat/` a partir de `main`.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `CLAUDE.md` (raiz), `apps/web/AGENTS.md` + `apps/web/CLAUDE.md`, `docs/AMBIENTES.md` (só `teste1-church`/`teste2-church`), `docs/TESTES.md`, `apps/api/package.json` (projetos jest `unit`/`integration`/`rls`; `testMatch` em `test/**` para integração/RLS e specs ao lado do código em `src/**/*.spec.ts` para unit), `apps/web/package.json` (vitest).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Regra do `PixService` (ramo static/dynamic, fallback, teto, confirmação, descrição) | unit | 1:1 com os ACs de P0/P1; todo edge case listado; mock de `HttpService` e `PrismaService` | `apps/api/src/financial/pix.service.spec.ts` | `npm run test:unit -w orbien-backend -- pix.service` |
| DTOs (`CreatePublicDonationDto`) | unit | Cada limite (mín., máx., casas, e-mail, consent, tamanhos) aceita/rejeita; campo `plan`/`mode` rejeitado | `apps/api/src/financial/dto/*.spec.ts` | `npm run test:unit -w orbien-backend -- dto` |
| Controller (rotas novas, throttle, guards, papéis) | unit | Cada rota nova: happy + 400/404/403/429; metadados de guard | `apps/api/src/financial/pix.controller.spec.ts` | `npm run test:unit -w orbien-backend -- pix.controller` |
| Rota pública por HTTP contra o banco | integration | Premium (`teste2-church`) e Starter (`teste1-church`) end-to-end, limites, 404 uniforme, cross-tenant, sem lançamento antes da confirmação | `apps/api/test/integration/public-donation.spec.ts` (novo) | `npm run test:integration -w orbien-backend -- public-donation` |
| Webhook contra o banco | integration | Confirmar, 2× = 1 lançamento, `failed → confirmed`, linha desconhecida, token inválido, recorrente | `apps/api/test/integration/pix-webhook.spec.ts` (novo) | `npm run test:integration -w orbien-backend -- pix-webhook` |
| RLS / função SQL | RLS | `pix_webhook_scope` devolve só ids, só a `orbien_app`; `pix_payments` com 2 congregações do mesmo tenant + 1 tenant de fora; `USING` ≡ `WITH CHECK` | `apps/api/test/rls/pix-payments.spec.ts` e `pix-webhook-scope.spec.ts` (novos) | `npm run test:rls -w orbien-backend` |
| Scheduler (expiração, anonimização) | unit + integration | Ordem "cancelar na Asaas → `failed`"; falha da Asaas mantém `pending`; só linhas > prazo | `src/financial/*.scheduler.spec.ts`; `test/integration/public-donation-expiry.spec.ts` | `npm run test:unit …` / `test:integration …` |
| Página pública (estados, polling, retomada) | unit (vitest + RTL, timers falsos) | Cada estado da AC de P2-UX; backoff; para ao `confirmed`/`expired`; `sessionStorage` com try/catch | `apps/web/src/app/(public)/doar/[tenant_slug]/page.test.tsx`, `…/usePaymentStatus.test.ts` | `npm run test -w orbien-web` |
| Painel do tesoureiro (aba Intenções) | unit (vitest) | Lista, vazio, erro, 403 (`NoAccessState`), baixa manual, ação oculta em `dynamic` | `apps/web/src/components/financial/*.test.tsx` | `npm run test -w orbien-web` |
| Fluxo e2e do doador | e2e (Playwright) | Caminho feliz Starter + um de erro (sandbox Asaas **não** é chamado no e2e; QR dinâmico fica nos mocks) | `apps/web/e2e/*.spec.ts` | `npm run e2e -w orbien-web` (contra `teste1-church`) |
| Migration Prisma / script SQL de RLS | none | build gate + `prisma migrate deploy` em banco limpo + passo 7 do bootstrap | `apps/api/prisma/migrations/**`, `024_*.sql` | `npm run build:api` + `npm run db:deploy -w orbien-backend` (banco local) |

> **Tenants de teste:** todo teste novo que grava usa `teste1-church` (Starter,
> `pix_key` `12345678900`) e `teste2-church` (Premium) — ambos criados por
> `prisma/seed.ts` (`npm run db:seed -w orbien-backend`; o banco local de
> desenvolvimento está **sem seed**, tenants vazios). Linhas criadas pelo teste
> são removidas no `afterAll`. **Nunca `doca-church`.** O spec antigo
> `public-routes.spec.ts` cria tenant `pub-<ts>` (R12) e não é tocado aqui.
>
> **Sandbox Asaas:** nenhum teste automatizado chama a Asaas real; `HttpService`
> é simulado. A validação manual do QR em sandbox usa `teste2-church`, com
> `ASAAS_API_URL` de sandbox, nunca produção.

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Após tarefa só com unit (API) | `npm run test:unit -w orbien-backend -- <arquivo>` + `npm run lint -w orbien-backend` |
| Quick-web | Após tarefa só com vitest (web) | `npm run test -w orbien-web -- <arquivo>` + `npm run lint -w orbien-web` |
| Full | Após tarefa com integration/RLS | `npm run test:integration -w orbien-backend` e `npm run test:rls -w orbien-backend` (DB local: `DATABASE_URL`/`DIRECT_URL` já apontam para o Postgres de dev; seed `teste1/2`) |
| Build | Fim de fase / tarefa só de config, migration ou SQL | `npm run build:api` + `npm run build:web` + `npm run lint` + `npm test` + `bash scripts/pre-push.sh` (portão de RLS; alerta ⇒ pergunta, não silêncio) |

---

## Execution Plan

```text
Fase 0 (pesquisa)        T01
                          │
Fase 1 — PR1 webhook      T02 → T03 → T04 → T05 → T06
                                              │
Fase 2 — PR2 API          T07 ─┐              │
                          T08 ─┼→ T10 → T11 → T12 → T13 → T14 → T15 → T16
                          T09 ─┘     (T10 exige T04 e T01)
                                                                  │
Fase 3 — PR3 web                       T17 → T18 → T19 ───────────┤ (exige T13/T15 no ar)
                                                                  │
Fase 4 — PR4 dado do doador            T20 → T21 → T22 → T23 → (T24 se Q5)
                                                                  │
Fase 5 — PR5 intenções                 T25 → T26 → T27 → T28
```

Fases dependem das anteriores só quando indicado; **PR3 (web) pode começar assim que
T13 estiver mergeado** (contrato fixo) e PR5 é independente de PR3/PR4.

---

## Fase 0 — Verificação do que não está no repositório

### T01 — Conferir na documentação oficial da Asaas os parâmetros que o código assume
- **What:** nota curta em `design.md` §Integration Points com: valor mínimo/máximo de cobrança PIX, formato/hora do `dueDate` e `expirationDate` do `pixQrCode`, `DELETE /payments/:id` (efeito em cobrança pendente e já paga), `notificationDisabled`/e-mail ao customer, limites de requisição por conta.
- **Where:** `.specs/features/doacao-publica-premium-qr-dinamico/design.md`
- **Depends on:** — · **Reuses:** Knowledge Verification Chain passo 4 (docs oficiais); nunca inventar
- **Tests:** none (documento) · **Gate:** Build não se aplica; revisão do dono
- **Done when:** cada item tem fonte citada ou "não encontrei documentação" — A5/Q2 e A11 ficam resolvidas ou marcadas incertas.
- **Requirements:** DPUB-03, DPUB-11, DPUB-27

---

## Fase 1 — PR1 · Webhook sob RLS (P0) — `fix/pix-webhook-contexto-rls`

### T02 — Função SQL `pix_webhook_scope` + bootstrap + passo 7
- **What:** `024_rls_pix_webhook_scope.sql`: `SECURITY DEFINER`, `search_path` fixo, `REVOKE … FROM PUBLIC`, `GRANT EXECUTE … TO orbien_app`; devolve `(tenant_id, congregation_id)` a partir de `asaas_payment_id` ou, para recorrente, de `asaas_subscription_id`. Entra no `bootstrap-db.sh` depois de `003` e do passo 4 (ordem não numérica — ver CLAUDE.md), e o passo 7 ganha a verificação (`prosecdef`, `search_path`, `EXECUTE`).
- **Where:** `apps/api/prisma/migrations/024_rls_pix_webhook_scope.sql`, `apps/api/scripts/bootstrap-db.sh`
- **Depends on:** **Q1 = W1**, T01 não necessário · **Reuses:** modelo `audit_insert`/`resolve_actor_name` (`001`), verificação do passo 7 de `023`
- **Tests:** none (SQL) — coberto por T03 · **Gate:** Build (`db:deploy` em banco limpo + idempotente na 2ª vez)
- **Done when:** bootstrap roda 2× sem erro; passo 7 falha se a função perder `SECURITY DEFINER`.
- **Requirements:** DPUB-06, DPUB-17

### T03 — Teste de RLS da função e de `pix_payments`
- **What:** `test/rls/pix-webhook-scope.spec.ts` (função devolve só ids; `app_user` sem `EXECUTE`; id inexistente → vazio) e `test/rls/pix-payments.spec.ts` (congregação A ≠ B do mesmo tenant; tenant de fora; escrita cruzada → 42501; `USING` ≡ `WITH CHECK`).
- **Where:** `apps/api/test/rls/`
- **Depends on:** T02 · **Reuses:** `test/helpers/rls`, molde `pix-subscriptions.spec.ts`
- **Tests:** RLS (matriz) · **Gate:** Full
- **Done when:** casos novos verdes e **falham** se a função for trocada por `STABLE` sem `SECURITY DEFINER` (discrimination).
- **Requirements:** DPUB-06, DPUB-15, DPUB-17

### T04 — `handleWebhook` resolve o escopo e roda sob contexto
- **What:** `resolveWebhookScope()` chama a função; `runInTx` faz `set_config('app.tenant_id', …, true)` + `app.congregation_id` antes de achar/confirmar; `createPixPaymentFromSubscriptionWebhook` e a leitura de `pixSubscription` idem; token com `timingSafeEqual`; log sem payload inteiro (R10, R11).
- **Where:** `apps/api/src/financial/pix.service.ts` (`:614` em diante)
- **Depends on:** T02 · **Reuses:** `runInPublicContext`, idempotência `updateMany`
- **Tests:** unit — reescrever os casos de webhook de `pix.service.spec.ts` para exigir a chamada do escopo e do `set_config` (hoje o mock não exige nada, e por isso o defeito passou) · **Gate:** Quick
- **Done when:** unit verde; token inválido → 401 sem consultar o banco; linha desconhecida → 200 sem vazar.
- **Requirements:** DPUB-06, DPUB-07

### T05 — Recibo sob contexto do tenant
- **What:** `generateForTransaction` é chamado depois do `runInTx` e lê `financial_transactions`/`persons` sem contexto; envolver em contexto do tenant da transação (mesmo `set_config`) para o recibo (PROD-03) funcionar em Cenários 2/recorrente. **Sem** mudar o desenho do recibo (Q5 é à parte).
- **Where:** `apps/api/src/financial/pix.service.ts` + `donation-receipts.service.ts` (parâmetros de contexto)
- **Depends on:** T04 · **Tests:** unit (`donation-receipts.service.spec.ts`: recebe contexto; anônimo e sem e-mail seguem não gerando) · **Gate:** Quick
- **Done when:** chamada com doador identificado + Premium + e-mail gera recibo no teste; falha continua engolida.
- **Requirements:** DPUB-06

### T06 — Teste de integração do webhook (hoje inexistente)
- **What:** `test/integration/pix-webhook.spec.ts` com `teste2-church`: linha `dynamic` pendente → webhook → `confirmed` + 1 lançamento `pix_webhook` na categoria da linha; reenvio e `CONFIRMED`+`RECEIVED` paralelos → 1 lançamento; `asaas_payment_id` desconhecido → 200; token errado → 401; recorrente cria a linha sob o tenant da assinatura; **outro tenant não é tocado**.
- **Where:** `apps/api/test/integration/pix-webhook.spec.ts`
- **Depends on:** T04 · **Reuses:** setup de `public-routes.spec.ts` (Nest `AppModule` + `supertest`), seed `teste1/2`
- **Tests:** integration (matriz) · **Gate:** Full
- **Done when:** o teste **falha em `main`** (prova do achado R0) e passa com T04.
- **Requirements:** DPUB-06, DPUB-07, DPUB-09 (parcial)

---

## Fase 2 — PR2 · API da doação pública dinâmica (P1) — `feat/doacao-publica-qr-dinamico-api`

### T07 — `CreatePublicDonationDto` com limites
- **What:** DTO próprio (A5): `amount` com `maxDecimalPlaces: 2`, `@Min`, `@Max`; `@MaxLength` em slug/nome/e-mail/categoria; honeypot mantido; sem campo de plano/modo. `POST /financial/pix` (manual) segue com `CreatePixDto`.
- **Where:** `apps/api/src/financial/dto/create-public-donation.dto.ts`
- **Depends on:** Q2 · **Tests:** unit — cada limite (mín.−0,01, mín., máx., máx.+0,01, `10.123`, `NaN`, `Infinity`, `plan`/`mode` rejeitados) · **Gate:** Quick
- **Requirements:** DPUB-11, DPUB-01

### T08 — `resolveTenant`: plano e 404 uniforme
- **What:** devolve `plan`+`status` (leitura de `tenantPlan` no `Promise.all`); slug inexistente, sem chave PIX e sem congregação ⇒ **mesma** `NotFoundException('Igreja não encontrada')` para o Cenário 3 (e os Cenários 1; confirmar impacto em `POST /financial/pix` e `createDynamic`, que usam outros resolvers).
- **Where:** `pix.service.ts:92`
- **Depends on:** Q3 · **Tests:** unit — três falhas ⇒ mesma exceção/mensagem; plano `premium/active|trial` ⇒ dynamic-elegível; `suspended|cancelled|ausente` ⇒ não · **Gate:** Quick
- **Requirements:** DPUB-01, DPUB-14

### T09 — Extrair `createAsaasPixCharge` (refactor sem mudança de comportamento)
- **What:** mover customer→payment→pixQrCode (duplicado em `createDynamic` e `createForEventRegistration`) para um helper privado; aceita `externalReference` e devolve `{ asaasPaymentId, qrCode }`.
- **Where:** `pix.service.ts:282,452`
- **Depends on:** — · **Tests:** unit — os specs existentes de `createDynamic`/`createForEventRegistration` continuam verdes **sem edição** (prova de não regressão) · **Gate:** Quick
- **Requirements:** DPUB-03

### T10 — `createPublicDonation`: ramo dinâmico, fallback e ordem de escrita
- **What:** linha `pending` com `id` pré-gerado → (se Premium + `ASAAS_API_KEY` + teto livre) cobrança com `externalReference = id` → `UPDATE asaas_payment_id, qr_code`; senão/em falha ⇒ `mode: 'static'` + `fallback_reason`; se a cobrança foi criada mas o QR falhou ⇒ `DELETE /payments/:id` best-effort; **sem** lançamento (DPUB-08); honeypot intacto.
- **Where:** `pix.service.ts:520`
- **Depends on:** T04, T07, T08, T09, T01, Q4 · **Tests:** unit — Premium→dynamic (shape completo); Starter→static e `HttpService` não chamado; Asaas 5xx/timeout→static+`provider_unavailable`; sem chave→static; honeypot; nunca `financialTransaction.create` · **Gate:** Quick
- **Requirements:** DPUB-01…05, DPUB-08

### T11 — Teto de cobranças dinâmicas pendentes por tenant
- **What:** `countRecentPublicDynamic()` (índice `[tenant_id, status]` já existe) acima de N/hora ⇒ ramo estático com `fallback_reason: 'cap_reached'`.
- **Where:** `pix.service.ts`
- **Depends on:** T10 · **Tests:** unit — abaixo/no/acima do teto; só conta `scenario = public` e `dynamic`; janela de 1 h · **Gate:** Quick
- **Requirements:** DPUB-13

### T12 — Webhook: `public` e `failed → confirmed`
- **What:** `updateMany ... status IN (pending, failed)`; `description` "Doação pública via PIX" para `scenario = public`; lançamento sem `donor_person_id`; divergência payload×linha logada.
- **Where:** `pix.service.ts:701` e bloco `description`
- **Depends on:** T04 · **Tests:** unit + estender T06 (`failed` confirmado; `confirmed` não reaplicado) · **Gate:** Full
- **Requirements:** DPUB-07, DPUB-09, DPUB-10

### T13 — Rota de status `GET public-donation/:tenant_slug/:payment_id`
- **What:** `getPublicDonationStatus` + rota; `ParseUUIDPipe`; `runInPublicContext`; `expired` preguiçoso; `Cache-Control: no-store`; só `{status, expires_at}`.
- **Where:** `pix.service.ts`, `pix.controller.ts`
- **Depends on:** T08 · **Tests:** unit service + controller (404 idêntico para id inexistente e id de outro tenant; resposta sem PII; `expired`) · **Gate:** Quick
- **Requirements:** DPUB-15, DPUB-16, DPUB-20

### T14 — Rate limit por cliente real
- **What:** limite da criação e do status (status mais folgado: ~30/min) com tracker adequado ao proxy do web (R1/Q8) + `@Throttle` próprio por rota.
- **Where:** `pix.controller.ts`, tracker em `apps/api/src/common/`
- **Depends on:** Q8 · **Tests:** unit do tracker (chave por cliente/tenant, cabeçalho forjado ignorado) + controller (metadados `@Throttle`) · **Gate:** Quick
- **Requirements:** DPUB-12

### T15 — Integração HTTP da doação pública (Premium/Starter)
- **What:** `test/integration/public-donation.spec.ts`: `teste2-church` ⇒ `dynamic` (Asaas simulada) e linha com `asaas_payment_id`, **0** lançamentos; `teste1-church` ⇒ `static`, Asaas não chamada; 400 de valor; 11ª chamada ⇒ 429; 404 uniforme; status de outro tenant ⇒ 404; webhook → status `confirmed` → 1 lançamento.
- **Where:** `apps/api/test/integration/public-donation.spec.ts`
- **Depends on:** T10–T14 · **Tests:** integration · **Gate:** Full
- **Requirements:** DPUB-01…05, 08, 11–15

### T16 — `PublicDonationExpiryScheduler` (cobrança órfã)
- **What:** cron diário: dinâmicas públicas `pending` > 48 h ⇒ `DELETE` na Asaas **e depois** `failed`; falha da Asaas ⇒ mantém `pending`.
- **Where:** `apps/api/src/financial/public-donation-expiry.scheduler.ts` (+ registro em `financial.module.ts`)
- **Depends on:** T10, T12 · **Reuses:** `RecurringRuleScheduler`, `prisma.system` · **Tests:** unit (ordem; falha mantém; só linhas elegíveis) + integration curto · **Gate:** Full
- **Requirements:** DPUB-27, DPUB-09

---

## Fase 3 — PR3 · Página pública (P2) — `feat/doacao-publica-qr-dinamico-web`

> Antes da primeira edição: carregar a skill `frontend-design`, ler
> `node_modules/next/dist/docs/` e `apps/web/AGENTS.md`/`CLAUDE.md` (hook
> `require-frontend-design.mjs`). Edição por Bash não vale.

### T17 — Bloco "QR + copia-e-cola" (componente neutro)
- **What:** exibe imagem, código, "Copiar" (`<button>` puro), valor, validade; tokens do design system; sem dependência do `DynamicPixPanel` autenticado.
- **Where:** `apps/web/src/components/public/PixQrBlock.tsx`
- **Depends on:** T13 no ar (contrato) · **Tests:** unit vitest (renderiza QR/código, copia, formata `expires_at`) · **Gate:** Quick-web
- **Requirements:** DPUB-18

### T18 — `usePaymentStatus` (polling)
- **What:** `setTimeout` encadeado de 4 s, só com `visibilityState === 'visible'`, backoff 4→8→16 s em erro/429, teto 24 h, para em `confirmed`/`expired`; `useEffect` + axios (padrão do web, não react-query).
- **Where:** `apps/web/src/hooks/usePaymentStatus.ts`
- **Depends on:** T17 · **Tests:** unit com timers falsos (cada transição; aba oculta pausa; unmount limpa) · **Gate:** Quick-web
- **Requirements:** DPUB-19, DPUB-21

### T19 — `page.tsx`: estados `static | dynamic | confirmed | expired`, retomada e erro
- **What:** integra T17/T18; fallback com aviso; "Gerar novo QR" preserva o valor; `sessionStorage` (try/catch) guarda `payment_id`; mensagens por `apiErrorMessage`; 404 genérico.
- **Where:** `apps/web/src/app/(public)/doar/[tenant_slug]/page.tsx` (+ `page.test.tsx`)
- **Depends on:** T17, T18 · **Tests:** unit — todos os estados da P2-UX; Starter inalterado (regressão do teste atual) · **Gate:** Quick-web + Build
- **Requirements:** DPUB-18…21

---

## Fase 4 — PR4 · Dado do doador, consentimento, retenção (PEND-14 parte 1) — `feat/doacao-publica-dados-doador`

### T20 — Migration aditiva `pix_payments.donor_*`
- **What:** `donor_name`, `donor_email`, `donor_consent_version`, `donor_consented_at` (nullable); sem índice; **sem policy nova** (herda a da tabela).
- **Where:** `apps/api/prisma/schema.prisma` + migration Prisma
- **Depends on:** Q6, Q7 · **Tests:** none (build gate) — `prisma migrate deploy` em banco limpo + `test:rls` inalterado verde · **Gate:** Build
- **Requirements:** DPUB-22

### T21 — Persistir `donor_*` com consentimento
- **What:** `CreatePublicDonationDto.donor_consent`; servidor rejeita e-mail sem consentimento; normaliza (trim, minúsculas); grava versão/instante; **não** vai para a Asaas nem para logs.
- **Where:** DTO + `pix.service.ts`
- **Depends on:** T20, T10 · **Tests:** unit (matriz de combinações nome/e-mail/consent) + estender T15 (colunas gravadas; sem consent ⇒ 400) · **Gate:** Full
- **Requirements:** DPUB-22, DPUB-23

### T22 — Formulário: nome, e-mail, consentimento versionado
- **What:** checkbox + texto/link de `donor_consent_v1` aparece quando há e-mail; botão desabilitado sem aceite; texto versionado em Markdown no repo (mapeamento LGPD §3.3). **Revisão jurídica do texto = CONF-01** (não bloqueia o código, bloqueia o lançamento em produção).
- **Where:** `apps/web/.../doar/[tenant_slug]/page.tsx`, `apps/web/src/legal/donor_consent_v1.md` (caminho a confirmar)
- **Depends on:** T21, T19 · **Tests:** unit vitest · **Gate:** Quick-web
- **Requirements:** DPUB-23

### T23 — Anonimização de `donor_*` de intenções não confirmadas
- **What:** no scheduler (T16) ou próprio: após o prazo (A10/Q7), `donor_name`/`donor_email` ⇒ `NULL` para `pending`/`failed`; `confirmed` intacto.
- **Where:** `public-donation-expiry.scheduler.ts`
- **Depends on:** T16, T20 · **Tests:** unit + integration (só as antigas e não confirmadas) · **Gate:** Full
- **Requirements:** DPUB-24

### T24 — (condicional a Q5) Recibo para doador público identificado
- **What:** emitir recibo para o e-mail declarado sem `Person` (ajuste de `DonationReceipt`/serviço) **ou** criar `Person` — decisão de Q5.
- **Where:** `donation-receipts.service.ts`, `schema.prisma`
- **Depends on:** **Q5**, T05, T21 · **Tests:** unit + integration (anônimo não recebe; Starter não recebe; falha não derruba webhook) · **Gate:** Full
- **Requirements:** DPUB-25

---

## Fase 5 — PR5 · Tela de intenções do tesoureiro (PEND-14 parte 2) — `feat/intencoes-doacao-publica-tesouraria`

### T25 — `GET /financial/pix/public-intents`
- **What:** lista paginada de `scenario = public` da congregação; papéis `FINANCIAL_ROLES`; sem `@RequiresPlan`.
- **Where:** `pix.service.ts`, `pix.controller.ts`
- **Depends on:** T20 · **Tests:** unit service/controller (403 para outro papel; paginação) + RLS (congregação B não vê A) · **Gate:** Full
- **Requirements:** DPUB-26

### T26 — `POST …/public-intents/:id/settle` (baixa manual da estática)
- **What:** transação única: `updateMany pending → confirmed` condicional + lançamento `income`, `source = manual`, `category_id` da linha + `writeAuditLog`; recusa `dynamic`; idempotente.
- **Where:** `pix.service.ts`, `pix.controller.ts`
- **Depends on:** T25 · **Tests:** unit + integration (2 baixas = 1 lançamento; `dynamic` ⇒ 409; auditoria gravada) · **Gate:** Full
- **Requirements:** DPUB-26

### T27 — Aba "Intenções" no financeiro (web)
- **What:** lista, vazio, erro, `NoAccessState` em 403, botão "Marcar como recebida" só em `static pending`. Skill `frontend-design` antes de editar.
- **Where:** `apps/web/src/components/financial/PublicIntentsPanel.tsx`, `apps/web/src/app/(admin)/financeiro/page.tsx`
- **Depends on:** T25, T26 · **Tests:** unit vitest · **Gate:** Quick-web + Build
- **Requirements:** DPUB-26

### T28 — Fechamento documental
- **What:** `docs/PLANO.md`: fechar PEND-14 com a evidência dos PRs 4/5, atualizar a nota de PROD-04 ("Cenário 3 Premium"), registrar a pendência do achado R0 se ainda houver resíduo; `.specs/STATE.md`: `AD-006` (webhook sob contexto resolvido por função SECURITY DEFINER; plano lido do banco na rota pública; donor ≠ Person) **somente se aprovado**.
- **Where:** `docs/PLANO.md`, `.specs/STATE.md`
- **Depends on:** T27 · **Tests:** none · **Gate:** `node scripts/check-skills.mjs` não se aplica; revisão
- **Requirements:** todos (rastreabilidade)

---

## Validação pré-aprovação

### Check 1 — Granularidade

| Tarefa | Entregável único | OK |
| --- | --- | --- |
| T01 | 1 nota de pesquisa | ✅ |
| T02 | 1 script SQL + sua linha no bootstrap/passo 7 (indivisível: script sem passo 7 falha o portão) | ✅ |
| T03 | 2 specs de RLS da mesma função/tabela | ✅ |
| T04 | 1 método (`handleWebhook` + escopo) | ✅ |
| T05 | 1 ponto (contexto do recibo) | ✅ |
| T06 | 1 arquivo de integração | ✅ |
| T07 | 1 DTO | ✅ |
| T08 | 1 função (`resolveTenant`) | ✅ |
| T09 | 1 refactor | ✅ |
| T10 | 1 método (`createPublicDonation`) | ✅ |
| T11 | 1 função + guarda | ✅ |
| T12 | 1 bloco do webhook (guarda + descrição) | ✅ |
| T13 | 1 endpoint | ✅ |
| T14 | 1 tracker + decoradores | ✅ |
| T15 | 1 arquivo de integração | ✅ |
| T16 | 1 scheduler | ✅ |
| T17 | 1 componente | ✅ |
| T18 | 1 hook | ✅ |
| T19 | 1 página | ✅ |
| T20 | 1 migration | ✅ |
| T21 | persistência `donor_*` (DTO + 1 método) | ✅ |
| T22 | 1 trecho de formulário + texto legal | ✅ |
| T23 | 1 rotina de anonimização | ✅ |
| T24 | condicional a Q5 | ✅ |
| T25 | 1 endpoint | ✅ |
| T26 | 1 endpoint | ✅ |
| T27 | 1 componente | ✅ |
| T28 | 1 commit de docs | ✅ |

### Check 2 — Diagrama × `Depends on`

| Tarefa | `Depends on` | No diagrama | OK |
| --- | --- | --- | --- |
| T02 | Q1 | início da Fase 1 | ✅ |
| T03 | T02 | T02 → T03 | ✅ |
| T04 | T02 | T03 → T04 (T04 só exige T02; T03 antes é ordem de portão) | ✅ |
| T05 | T04 | T04 → T05 | ✅ |
| T06 | T04 | T05 → T06 (idem) | ✅ |
| T07/T08/T09 | Q2 / Q3 / — | paralelos | ✅ |
| T10 | T04, T07–T09, T01, Q4 | converge | ✅ |
| T11 | T10 | T10 → T11 | ✅ |
| T12 | T04 | T11 → T12 (T12 só exige T04) | ✅ |
| T13 | T08 | T12 → T13 (idem) | ✅ |
| T14 | Q8 | T13 → T14 | ✅ |
| T15 | T10–T14 | T14 → T15 | ✅ |
| T16 | T10, T12 | T15 → T16 | ✅ |
| T17–T19 | T13/T15 no ar | PR3 | ✅ |
| T20–T24 | Q6/Q7/Q5 + T10/T16 | PR4 | ✅ |
| T25–T28 | T20 | PR5 | ✅ |

### Check 3 — Co-localização de testes

| Tarefa | Camada | Teste na própria tarefa | OK |
| --- | --- | --- | --- |
| T02 | SQL | none (coberto por T03 — **exceção declarada**: o SQL e seu teste de RLS vão no mesmo PR e o portão do PR roda os dois) | ⚠️ aceita |
| T03–T06 | RLS/unit/integration | sim | ✅ |
| T07–T16 | unit/integration | sim | ✅ |
| T17–T19, T22, T27 | vitest | sim | ✅ |
| T20 | migration | none (build gate) | ✅ |
| T21, T23–T26 | unit/integration | sim | ✅ |
| T28 | docs | none | ✅ |

> ⚠️ Única exceção: T02 (script SQL sem teste próprio). Alternativa para zerar
> a exceção: fundir T02+T03 num commit. Recomendo manter separado para o
> `revert` isolado de SQL, com o portão de PR exigindo ambos.

---

## Fatiamento em PRs (recomendação)

| PR | Conteúdo | Tarefas | Por que separado | Deploy |
| --- | --- | --- | --- | --- |
| **PR1** `fix/pix-webhook-contexto-rls` | Webhook sob RLS | T02–T06 | É correção de defeito **pré-existente** que afeta Cenário 2, inscrição paga e recorrente; vale sozinha, reverte sozinha, e desbloqueia o resto. Rodar `bootstrap-db.sh` (`db:deploy`) antes do código | API (Render) |
| **PR2** `feat/doacao-publica-qr-dinamico-api` | Rota pública dinâmica + status + teto + expiração | T07–T16 | Backend completo e testável sem UI; **sem efeito visível** enquanto a página não consome `mode: dynamic` (o formulário atual ignora campos novos) | API |
| **PR3** `feat/doacao-publica-qr-dinamico-web` | Página (QR, polling, estados) | T17–T19 | Isola a skill `frontend-design`; só depende do contrato da PR2 | Vercel |
| **PR4** `feat/doacao-publica-dados-doador` | PEND-14 (1/2): colunas + consentimento + retenção (+ recibo se Q5) | T20–T24 | Migration + LGPD + texto legal (CONF-01) têm ritmo próprio; **não bloqueia** o Premium | API + web |
| **PR5** `feat/intencoes-doacao-publica-tesouraria` | PEND-14 (2/2): lista + baixa manual | T25–T28 | Valor é do **Starter** (o Premium se confirma sozinho); só precisa das colunas de PR4 para mostrar nome/e-mail — mas funciona sem elas | API + web |

**PEND-14: mesma entrega ou outra?** O `PLANO.md` diz que as duas partes "são o
mesmo trabalho". Recomendo **duas PRs, depois** do Premium: (a) o Premium
dinâmico **não depende** de nenhuma das duas (webhook confirma; a linha já guarda
a intenção); (b) as colunas de doador carregam LGPD e texto jurídico que não devem
atrasar o QR; (c) a tela do tesoureiro beneficia sobretudo o Starter. PEND-14 só
fecha quando PR4 e PR5 estiverem no ar.

Ordem de merge: PR1 → PR2 → PR3 (a PR3 pode ser aberta em paralelo à PR2 contra o
contrato). **Não mergear PR2 em produção sem PR1**: o QR seria gerado e o pagamento
nunca confirmado (R0). **Habilitar por plano:** nenhum flag — o ramo `dynamic` só
existe para tenants Premium no banco, e a UI depende de `mode`.

---

## Perguntas abertas para o dono do produto

| # | Pergunta | Default adotado | Bloqueia |
| --- | --- | --- | --- |
| **Q1** | **Achado R0** (webhook sem contexto de RLS — sonda no banco local, produção **não** verificada): corrijo em PR própria com função SQL `SECURITY DEFINER` (W1), com `prisma.system` (W2) ou com `externalReference` (W3)? Alguém conferiu o log do Render por `PixPayment não encontrado` no Cenário 2? Quer registrar como `PEND-16` em `docs/PLANO.md`? | W1 | **BLOQ** T02, T04 e tudo depois |
| **Q2** | Valor mínimo e máximo da doação pública? | R$ 5,00 – R$ 10.000,00, 2 casas (mínimo da Asaas a confirmar em T01) | T07 |
| **Q3** | Quais `PlanStatus` liberam o QR: só `active`, `active`+`trial`? (`DonationReceiptService` hoje ignora `status`.) | `active` + `trial` | T08 |
| **Q4** | Asaas fora do ar no Premium: cair para a chave estática com aviso (perde confirmação automática daquela doação) ou devolver 503? | Cair para estática | T10 |
| **Q5** | Recibo (PROD-03) para doador público: (a) não emitir, só doador cadastrado; (b) emitir para o e-mail declarado sem `Person` (muda `donation_receipts.person_id`); (c) criar `Person` `visitor` com consentimento? | (a) no P1; decidir (b)/(c) antes de T24 | **BLOQ** T24 |
| **Q6** | Consentimento do doador: gravar só versão+instante na linha (sem IP/user-agent, por minimização) ou seguir o mapeamento LGPD §3.2 (IP e user-agent)? Quem aprova o texto de `donor_consent_v1` (CONF-01)? | Só versão+instante | T20, T22 |
| **Q7** | Retenção do dado do doador não confirmado: 30 dias? E o confirmado: 5 anos (CONF-02)? | 30 d / 5 a | T20, T23 |
| **Q8** | Rate limit atrás do proxy do web (R1, hipótese a validar em staging): o IP visto pela API é o da Vercel. Aceita (a) tracker por `tenant_slug` + teto por tenant em banco; (b) cabeçalho de IP assinado pelo proxy do web; (c) manter 10/min global? | (a) | T14 |
| **Q9** | `category_slug` público: manter texto livre ou fixar um conjunto (`oferta`, `dizimo`, `missoes`)? | Manter | — |
| **Q10** | O spec antigo `public-routes.spec.ts` cria tenant `pub-<ts>` (fora da regra `teste1/2-church`, em banco efêmero): migrar para os tenants de teste numa tarefa à parte? | Fora desta entrega | — |

> Nenhuma pergunta impede a leitura da spec; **Q1 e Q5 bloqueiam execução**.
