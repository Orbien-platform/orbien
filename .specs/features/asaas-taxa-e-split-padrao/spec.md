# Taxa da Asaas do tenant e split de 1% (padrão da base) — Specification

Escopo **Medium/Large** (transversal, dinheiro). Avaliação e plano — nada
implementado. Origem: decisão do dono do produto em 2026-10-03, registrada como
`AD-006` (`.specs/STATE.md`), `PEND-16` e `DEC-07` (`docs/PLANO.md`).

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
- [ ] A tarifa Asaas é do tenant (cobrança criada na conta Asaas do tenant — DEC-07).
- [ ] Cobrança sem split é impossível de criar e há teste que prova.
- [ ] Percentual e wallet são configuração, não literal.

## Out of Scope

| Item | Motivo |
|---|---|
| PIX manual (Cenário 1) | Não usa Asaas; sem tarifa nem split. |
| Repassar tarifa ao doador | Decisão é tarifa do tenant (AD-006). |
| Troca de provedor | ADR-007 já isola a lógica; este padrão só garante um ponto de mudança. |
| Cobrar retroativamente o 1% de cobranças passadas | Fora; nenhuma foi feita com split. |

## Assumptions & Open Questions

| Decisão | Default | Rationale | Confirmado? |
|---|---|---|---|
| Base do 1% | Sobre o valor da cobrança | Texto do pricing ("1% por transação") | n — Q-S1 |
| Falha fechada | Wallet/percentual ausentes → 503 + log; não cobra | AD-006 item 4 | y (decisão do dono) |
| Montador | `AsaasChargeService.buildCharge(kind, input)` em `financial/`, usado por `PixService` e por qualquer serviço novo | AD-006 item 3 | y |
| Configuração | `ASAAS_PLATFORM_WALLET_ID`, `ASAAS_PLATFORM_FEE_PERCENT` (padrão 1) em env; validadas no boot | Nada literal espalhado | n |
| Tenant sem conta Asaas própria | Cobrança Asaas indisponível (503 claro); Cenário 1 segue | DEC-07 | n — Q-S2 |

**Open questions (dono do produto / spike):**

| # | Pergunta |
|---|---|
| Q-S1 | O 1% incide sobre o valor bruto e a Asaas calcula a tarifa dela antes ou depois do split? **Não verificado na doc da Asaas** (campos `split[].walletId` e `percentualValue` são o que lembro; confirmar). |
| Q-S2 | Modelo de conta por tenant (DEC-07): subconta criada pela Orbien via API vs. conta própria da igreja? Quem faz o KYC? |
| Q-S3 | Onde fica a credencial por tenant (segredo cifrado fora do schema aberto)? |
| Q-S4 | Tenant em transição (sem conta Asaas ainda): bloquear PIX dinâmico/recorrente ou manter conta única temporariamente com split? (Manter a conta única contradiz a "tarifa do tenant" — só como ponte, com data para sair.) |
| Q-S5 | Assinaturas recorrentes já criadas (se houver em produção) sem split: recriar ou aceitar até cancelar? |

## User Stories

### P1: Montador único com split ⭐ MVP

1. WHEN qualquer serviço cria cobrança THEN o sistema SHALL passar por `AsaasChargeService` e a requisição à Asaas SHALL conter `split` com a wallet e o percentual configurados.
2. WHEN `ASAAS_PLATFORM_WALLET_ID`/percentual estão ausentes ou inválidos THEN o sistema SHALL recusar subir/criar cobrança (falha fechada) e logar o motivo.
3. WHEN alguém adiciona `asaasPost('/payments'|'/subscriptions')` fora do montador THEN um teste de unidade SHALL falhar (varredura do código-fonte ou spy no HTTP).

**Independent Test**: mockar o `HttpService` e criar PIX dinâmico, inscrição e assinatura; as três requisições levam o mesmo `split`.

### P1: Tarifa do tenant

1. WHEN a cobrança é criada THEN o sistema SHALL usá-la na conta Asaas do tenant (credencial por tenant — DEC-07), nunca na conta da Orbien.
2. WHEN o tenant não tem conta Asaas ativa THEN o sistema SHALL responder 503 com mensagem acionável e não cobrar.

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
| ASAAS-05 | Conta/credencial por tenant (DEC-07) | Pending — bloqueada em Q-S2/Q-S3 |
| ASAAS-06 | Visibilidade da tarifa/split | Pending (P2) |

## Tasks (inline — ≤ 8, execução em um batch)

| ID | Task | Depends | Tests | Done when |
|---|---|---|---|---|
| A1 | Spike Asaas sandbox: formato do `split`, base de cálculo, subconta/wallet por tenant (responde Q-S1/Q-S2) | — | none | Respostas em `context.md` |
| A2 | Config `ASAAS_PLATFORM_WALLET_ID`/`_FEE_PERCENT` + validação no boot; `.env.example` | A1 | unit | Boot falha sem wallet quando há chave Asaas |
| A3 | `AsaasChargeService.buildCharge` (payment/subscription) com `split` | A2 | unit 1:1 com ASAAS-01..03 | Corpo contém `split`; ausência de config lança |
| A4 | Migrar os 3 pontos de `PixService` para o montador (sem mudar comportamento externo) | A3 | unit (regressão de `pix.service.spec.ts`) | Suíte atual passa sem editar asserts, mais asserts de `split` |
| A5 | Teste de trava: nenhuma cobrança Asaas fora do montador | A4 | unit | Falha se `/payments`/`/subscriptions` for postado direto |
| A6 | Credencial/conta Asaas por tenant (modelo, segredo, resolução na cobrança, 503 sem conta) | A1, DEC-07 | unit + integration + RLS | ASAAS-05 |
| A7 | Documentar no `apps/api` e `docs/` (pricing, DEPLOY, env) | A4 | none | Docs coerentes |

Gates: `npm run test:unit -w orbien-backend`, `npm run test:rls -w orbien-backend` (A6), `npm run build:api`, `turbo run lint --filter=orbien-backend`. Testes só com `teste1-church`/`teste2-church` e sandbox Asaas.

## Recomendação

Fazer **antes** do PROD-27 do doador e **independente dele**: A1–A5 são pequenos
(≈1–2 dias) e já fecham o desvio entre pricing e código para os dois cenários que
existem. A6/DEC-07 (conta por tenant) é a parte grande e arriscada — decidir
Q-S2/Q-S3 antes de estimar.
