# Taxa da Asaas do tenant e split de 1% (padrão da base) — Specification

Escopo **Medium/Large** (transversal, dinheiro). Avaliação e plano — nada
implementado. Origem: decisão do dono do produto em 2026-10-03, registrada como
`AD-008` e `AD-009` (`.specs/STATE.md`), `PEND-17` e `DEC-07` (`docs/PLANO.md`).

**Modelo decidido (AD-009, 2026-10-03)**: subconta Asaas por igreja criada pela
Orbien com a chave raiz; cobrança emitida na subconta com a `apiKey` dela; 1% por
split para o `walletId` da Orbien; só tenant com CNPJ; sem CNPJ ou subconta não
aprovada → só a chave PIX da igreja (Cenário 1).

## Problem Statement

O pricing promete "1% retido via split + ~1% da Asaas" (custo efetivo ~2% para
a igreja). O código não cumpre: nenhuma cobrança tem `split`, e a tarifa da
Asaas cai na conta única da `ASAAS_API_KEY`, não no tenant.

## Evidência (código em 2026-10-03)

| # | Achado | Onde |
|---|---|---|
| S1 | Três pontos criam cobrança, cada um com corpo próprio: `/payments` PIX dinâmico, `/payments` inscrição de evento, `/subscriptions` recorrente. Nenhum envia `split`. | `pix.service.ts:297`, `:479`, `:382` |
| S2 | Uma só `ASAAS_API_KEY` (env); o "cliente" Asaas é a igreja (`externalReference=tenantId`). Não há wallet/subconta por tenant. | `pix.service.ts:51-60`, `:237-251` |
| S3 | `branding.pix_key` é guardada e devolvida, mas não entra na chamada à Asaas. | `pix.service.ts` |
| S4 | `.env.example` só tem `ASAAS_API_KEY`, `ASAAS_API_URL`, `ASAAS_WEBHOOK_TOKEN`; sem wallet nem percentual. | `apps/api/.env.example:42-45` |
| S5 | Cenário 1 (PIX manual, chave da igreja) não passa pela Asaas — **fora** desta regra. | `pix.service.ts:255-277` |

## Goals

- [ ] Toda cobrança Asaas é montada por um único ponto, com split de 1% para a wallet da Orbien.
- [ ] A tarifa Asaas é do tenant: a cobrança é criada na subconta do tenant (AD-009), nunca com a chave raiz da Orbien.
- [ ] Igreja com CNPJ ativa os recebimentos sem sair do Orbien (dados → subconta criada → documentos pelo link da Asaas → aprovada), sem manusear chave.
- [ ] Cobrança sem split é impossível de criar e há teste que prova.
- [ ] Percentual e wallet são configuração, não literal.

## Out of Scope

| Item | Motivo |
|---|---|
| PIX manual (Cenário 1) | Não usa Asaas; sem tarifa nem split. |
| Repassar tarifa ao doador | Decisão é tarifa do tenant (AD-008). |
| Troca de provedor | ADR-007 já isola a lógica; este padrão só garante um ponto de mudança. |
| Cobrar retroativamente o 1% de cobranças passadas | Fora; nenhuma foi feita com split. |

## Assumptions & Open Questions

| Decisão | Default | Rationale | Confirmado? |
|---|---|---|---|
| Base do 1% | Sobre o **valor líquido** (é como o split da Asaas calcula) | Doc da Asaas: split incide sobre `netValue` | y — confirmado pela doc; avisar o pricing |
| Falha fechada | Wallet/percentual ausentes → 503 + log; não cobra | AD-008 item 4 | y (decisão do dono) |
| Montador | `AsaasChargeService.buildCharge(kind, input)` em `financial/`, usado por `PixService` e por qualquer serviço novo | AD-008 item 3 | y |
| Configuração | `ASAAS_PLATFORM_WALLET_ID`, `ASAAS_PLATFORM_FEE_PERCENT` (padrão 1) em env; validadas no boot | Nada literal espalhado | n |
| Tenant sem subconta aprovada ou sem CNPJ | Cobrança Asaas indisponível com mensagem "ative os recebimentos"; Cenário 1 segue | AD-009 | y |
| Credencial da subconta | `apiKey` cifrada na aplicação (AES-GCM, chave mestra em env), coluna nunca selecionada fora do montador | AD-009 item 3 | y |

**Open questions (dono do produto / spike):**

| # | Pergunta |
|---|---|
| ~~Q-S1~~ | Respondida: o split da Asaas incide sobre o valor líquido (`netValue`), com `split[].walletId` + `percentualValue`. Resta decidir se o pricing passa a dizer "1% do líquido". |
| ~~Q-S2~~ | Respondida (AD-009): subconta criada pela Orbien; KYC pela igreja via `onboardingUrl` da Asaas (análise em até 48 h). |
| Q-S6 | (Asaas) A subconta tem painel ou saque automático para o banco da igreja? A Orbien não deve operar saque. |
| Q-S7 | (Asaas) Custo de criação/manutenção da subconta; exigência de contrato de parceria. |
| Q-S8 | (Asaas) KYC de organização religiosa: entra como associação (exige ata de eleição)? |
| ~~Q-S3~~ | Respondida (AD-009): cifrada na aplicação, chave mestra em env. |
| ~~Q-S4~~ | Respondida (AD-009): sem ponte pela conta única; até aprovar, só Cenário 1. |
| Q-S5 | Assinaturas recorrentes já criadas (se houver em produção) sem split: recriar ou aceitar até cancelar? |

## User Stories

### P1: Montador único com split ⭐ MVP

1. WHEN qualquer serviço cria cobrança THEN o sistema SHALL passar por `AsaasChargeService` e a requisição à Asaas SHALL conter `split` com a wallet e o percentual configurados.
2. WHEN `ASAAS_PLATFORM_WALLET_ID`/percentual estão ausentes ou inválidos THEN o sistema SHALL recusar subir/criar cobrança (falha fechada) e logar o motivo.
3. WHEN alguém adiciona `asaasPost('/payments'|'/subscriptions')` fora do montador THEN um teste de unidade SHALL falhar (varredura do código-fonte ou spy no HTTP).

**Independent Test**: mockar o `HttpService` e criar PIX dinâmico, inscrição e assinatura; as três requisições levam o mesmo `split`.

### P1: Tarifa do tenant

1. WHEN a cobrança é criada THEN o sistema SHALL usar a `apiKey` da subconta do tenant; a chave raiz da Orbien SHALL nunca criar cobrança.
2. WHEN o tenant não tem subconta `approved` THEN o sistema SHALL responder com estado "recebimentos não ativados" e não cobrar; o Cenário 1 SHALL seguir disponível.
3. WHEN o tenant não tem CNPJ THEN o sistema SHALL não oferecer a ativação.

### P1: Ativar recebimentos (igreja com CNPJ)

1. WHEN o `tenant_admin` informa CNPJ e dados do responsável THEN o sistema SHALL criar a subconta com a chave raiz e guardar `walletId`, `asaas_account_id` e a `apiKey` cifrada assim que a resposta chega (a chave não volta a ser consultável).
2. WHEN a Asaas exige documentos THEN o sistema SHALL mostrar à igreja o `onboardingUrl` de cada documento.
3. WHEN a Asaas notifica mudança de situação da conta (webhook de status) THEN o sistema SHALL atualizar o estado: `pending_documents → under_review → approved | rejected`.
4. WHEN a gravação falha depois de a Asaas responder THEN o sistema SHALL registrar o `asaas_account_id` para reconciliação e alertar — nunca perder a chave em silêncio.
5. WHEN a subconta é aprovada THEN o sistema SHALL configurar o webhook de cobrança da subconta (token por conta).

### Modelo de dados proposto

`tenant_payment_accounts` (uma por tenant): `tenant_id` (unique), `provider` (`asaas`),
`asaas_account_id`, `wallet_id`, `api_key_encrypted`, `webhook_token_hash`,
`status` (`pending_documents|under_review|approved|rejected|disabled`), `cnpj`,
`created_at`, `updated_at`. RLS por tenant (escrita só `tenant_admin`; a coluna
cifrada nunca é devolvida por rota). Script de RLS novo entra no
`bootstrap-db.sh` com verificação no passo 7.

### P2: Visibilidade

1. WHEN o tesoureiro vê o lançamento/recibo THEN o sistema SHALL mostrar o valor bruto e, se a Asaas informa, a tarifa e o split (transparência; só depois de Q-S1).

## Edge Cases

- Valor muito baixo em que 1% arredonda para centavo zero: definir arredondamento (Q-S1) e mínimo de cobrança (já Q4 do PIX do doador).
- Webhook de cobrança com split: o `PixPayment.amount` continua o valor bruto; líquido/tarifa não alteram o lançamento do tenant sem decisão contábil (lançar bruto e tarifa como despesa? — pergunta ao dono).
- Sandbox: wallet de teste da Orbien; `teste1/teste2-church` apenas.

## Requirement Traceability

| ID | Story | Status |
|---|---|---|
| ASAAS-01 | Montador único | Pending |
| ASAAS-02 | Split em toda cobrança | Pending |
| ASAAS-03 | Falha fechada | Pending |
| ASAAS-04 | Trava de regressão (teste) | Pending |
| ASAAS-05 | Cobrança na subconta do tenant (AD-009) | Pending |
| ASAAS-07 | Ativar recebimentos: criar subconta, onboarding, estados | Pending — Q-S6..Q-S8 com a Asaas |
| ASAAS-06 | Visibilidade da tarifa/split | Pending (P2) |

## Tasks (10 — no Execute, oferecer sub-agentes: A1–A5 e A6–A6d em batches separados)

| ID | Task | Depends | Tests | Done when |
|---|---|---|---|---|
| A1 | Spike Asaas sandbox: formato do `split`, base de cálculo, subconta/wallet por tenant (responde Q-S1/Q-S2) | — | none | Respostas em `context.md` |
| A2 | Config `ASAAS_PLATFORM_WALLET_ID`/`_FEE_PERCENT` + validação no boot; `.env.example` | A1 | unit | Boot falha sem wallet quando há chave Asaas |
| A3 | `AsaasChargeService.buildCharge` (payment/subscription) com `split` | A2 | unit 1:1 com ASAAS-01..03 | Corpo contém `split`; ausência de config lança |
| A4 | Migrar os 3 pontos de `PixService` para o montador (sem mudar comportamento externo) | A3 | unit (regressão de `pix.service.spec.ts`) | Suíte atual passa sem editar asserts, mais asserts de `split` |
| A5 | Teste de trava: nenhuma cobrança Asaas fora do montador | A4 | unit | Falha se `/payments`/`/subscriptions` for postado direto |
| A6 | Tabela `tenant_payment_accounts` + RLS + cifragem da `apiKey` | A1 | unit + RLS | ASAAS-05 |
| A6b | Criar subconta (chave raiz) + `onboardingUrl` + webhook de status da conta | A6 | unit + integration | ASAAS-07 |
| A6c | Montador usa a `apiKey` da subconta aprovada; sem subconta → "recebimentos não ativados" | A3, A6 | unit | ASAAS-05 |
| A6d | Tela de ativação no `apps/web` (`tenant_admin`; carregar `frontend-design`) | A6b | unit | ASAAS-07 |
| A7 | Documentar no `apps/api` e `docs/` (pricing, DEPLOY, env) | A4 | none | Docs coerentes |

Gates: `npm run test:unit -w orbien-backend`, `npm run test:rls -w orbien-backend` (A6), `npm run build:api`, `turbo run lint --filter=orbien-backend`. Testes só com `teste1-church`/`teste2-church` e sandbox Asaas.

## Recomendação

Fazer **antes** do PROD-27 do doador e **independente dele**: A1–A5 são pequenos
(≈1–2 dias) e já fecham o desvio entre pricing e código para os dois cenários que
existem. A6–A6d (subconta por tenant, AD-009) é a parte grande; o modelo está
decidido e faltam só Q-S6..Q-S8 com a Asaas antes de estimar. Atenção: A1–A5
sozinhos ainda cobrariam na conta raiz — só vão para produção junto com A6c.
