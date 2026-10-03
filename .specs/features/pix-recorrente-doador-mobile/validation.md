# PIX recorrente do doador (mobile) — Validation

**Data**: 2026-10-03 · **Escopo**: o que foi construído atrás da trava
`ASAAS_PAYMENTS_ENABLED` (`PROD-28`). P0 (entrega da cobrança) e PRD-DONOR-12
(split/subconta) **não** foram construídos e estão fora desta validação.

**Modo**: pass de validação *standalone* (fallback do `validate.md`), feito na
mesma sessão que implementou — **autor = verificador**. Não houve Verifier
independente (sub-agente). A mitigação é o discrimination sensor abaixo, que
mostra que os testes quebram quando a defesa é removida. Recomendado: rodar um
Verifier fresco antes de ligar a trava em produção.

**Veredito**: **PASS para o escopo travado** · bloqueado para lançamento
(ver "Gaps").

## Gate

| Gate | Comando | Resultado |
|---|---|---|
| API unit | `npm run test:unit -w orbien-backend` | 293 suítes, 3002+ testes, todos passam (rodada completa antes do ajuste de `posts.service.spec`; suítes afetadas reexecutadas depois: 300/300) |
| API integração | `npm run test:integration -w orbien-backend -- --testPathPatterns me-pix-subscriptions` | 11/11 |
| API RLS | `npm run test:rls -w orbien-backend -- --testPathPatterns pix-subscriptions` | 6/6 |
| API build/lint | `npm run build:api`, `turbo run lint --filter=orbien-backend` | ok |
| Web | `vitest run` (apps/web), `turbo run lint --filter=orbien-web` | 1529/1529; lint 0 erros |
| Mobile | `npm run test -w orbien-mobile`, `eslint`, `tsc --noEmit` | 600/600 (antes da última correção de lint; tela reexecutada: 11/11); 0 erros |

Contagem de testes só cresceu; nenhum teste removido ou enfraquecido. Os
asserts existentes de PROD-24/PROD-27 foram mantidos — os testes que
precisavam da trava ligada ganharam `ASAAS_PAYMENTS_ENABLED=true` no
`beforeEach`, e cada describe ganhou o caso "trava desligada".

## Critérios de aceite (evidence-or-zero)

| Critério | Outcome da spec | Evidência | Resultado |
|---|---|---|---|
| P1-criar 1: pessoa do banco; `donor_person_id` no corpo rejeitado | 400 com o campo; criação para `person_id` da conta | `test/integration/me-pix-subscriptions.spec.ts:190` (`res.status === 400`), `:199` (`donor_person_id: mariaPersonId`); `donor-pix-subscriptions.service.spec.ts:113`, `:274` | ✅ |
| P1-criar 2: plano do banco, não da claim | 403, sem Asaas | `donor-pix-subscriptions.service.spec.ts:138`, `:147` | ✅ |
| P1-criar 3: conta sem pessoa | 409, sem Asaas | `donor-pix-subscriptions.service.spec.ts:154`; integração `:243` | ✅ |
| P1-criar 4: já tem ativa | 409, sem segunda assinatura | `donor-pix-subscriptions.service.spec.ts:161`; integração `:215`, `:229` (unique parcial, P2002) | ✅ |
| P1-criar 5: `Idempotency-Key` | mesma assinatura no reenvio | — | ❌ não implementado (desvio 1 em `tasks.md`); coberto em parte pela unique |
| P1-criar 6: valor/aceite inválidos | 400 | `donor-pix-subscriptions.service.spec.ts:279`, `:286` | ✅ |
| P1-criar 7: Asaas falha | 503, sem linha ativa, sem órfã | `pix.service.spec.ts:983` (503 sem gravar), `:860` (gravação falha → DELETE na Asaas) | ✅ (exceto queda do processo entre os dois passos — desvio 1) |
| P1-ver 1: só as próprias | lista sem a do vizinho | integração `:259`; unit `:184` (`where` com `donor_person_id`) | ✅ |
| P1-ver 2: sem pessoa → vazia | `[]` | unit `:195`; integração `:243` | ✅ |
| P1-ver 3: plano/trava não bloqueiam ver | lista | unit `:202`; integração `:169` | ✅ |
| P1-cancelar 1: Asaas antes de marcar | DELETE, depois `cancelled` | integração `:282` (`asaasDeletes` contém a URL; status `cancelled`) | ✅ |
| P1-cancelar 2: de outra pessoa | 404, sem Asaas, segue ativa | integração `:269`; unit `:227` | ✅ |
| P1-cancelar 3: erro Asaas ≠ 404 | 503, segue ativa; app nunca diz "cancelado" | `pix.service.spec.ts` "Asaas responde outro erro HTTP (500)"; app `dizimo-automatico.test.tsx:165` | ✅ |
| P1-cancelar 4: 404 Asaas | marca `cancelled` | `pix.service.spec.ts:1059` | ✅ |
| P1-cancelar 5: idempotente | no-op | `pix.service.spec.ts` "já cancelada: não chama a Asaas de novo" (pré-existente) | ✅ |
| Edge: sessão de suporte | 403 criar/cancelar | unit `:173`, `:252` | ✅ |
| Trava (AD-008) | criar → 503 em todo caminho; ver/cancelar livres; fronts escondem | `pix.service.spec.ts:543`, `:742`, `:849`, `:1078`; `posts.service.spec.ts` (evento pago → 400); integração `:157`, `:177`; web `financeiro/page.test.tsx` (aba PIX some), `CreatePostModal.test.tsx` (sem campo de preço); app `(tabs)/index.test.tsx` (sem entrada), `dizimo-automatico.test.tsx:59` | ✅ |
| P2: consentimento versionado | versão + hora gravadas | `pix.service.spec.ts` "grava a versão e a hora do aceite"; integração `:199` | ✅ |
| P2: estados e falhas no app | indisponível, ativa, sem pagamentos, erro | `dizimo-automatico.test.tsx:59`–`:180` | ✅ |

## Discrimination sensor

Mutação aplicada no arquivo real, teste rodado, arquivo restaurado e suíte
reexecutada verde (119/119 unit; 11/11 integração).

| Mutação | Testes que falharam |
|---|---|
| `DonorPixSubscriptionsService`: tirar `donor_person_id` do `where` de listar e cancelar | 2 de integração (Maria vê e cancela a do João) |
| `PixService.createSubscriptionFor`: tirar `assertAsaasPaymentsEnabled()` + tratar todo erro do DELETE como 503 | 2 unit (trava; 404 da Asaas) |
| `DonorPixSubscriptionsService.assertPremiumFromDb`: nunca barrar | 2 unit (claim × banco; sem linha de plano) |

## Achados da revisão pré-PR (2026-10-03) — corrigidos

- `/code-review`: `parseAmount` do app apagava todo ponto — "50.00" no teclado
  en-US virava R$ 5.000/mês, dentro do limite. Corrigido; casos "50.00",
  "10.50", "1.500,00" em `pix-recorrente-client.test.ts` (a versão antiga
  falha em "50.00").
- `/code-review`: unique "uma ativa por doador" valia também para o
  tesoureiro (risco de `migrate deploy` falhar com duplicata existente).
  Restrita a `consent_version IS NOT NULL`; teste de integração novo prova
  que o tesoureiro ainda cria duas (12/12).
- Revisão Orbien: evento pago já publicado passa a responder 503 na
  inscrição com a trava desligada — registrado em `PROD-28` para conferir
  antes do deploy (decisão do dono: só registrar).

## Gaps (bloqueiam ligar a trava — não este commit)

1. P0: o doador não recebe a cobrança do ciclo (sem QR/link no app; cliente
   Asaas ainda é a igreja na conta raiz). `PROD-28`, "O que falta" 3.
2. PRD-DONOR-12: cobrança sem split e na conta raiz (`AD-006`/`AD-007`).
3. Idempotência por chave e saga `pending` (desvio 1).
4. Verifier independente não rodou (autor = verificador).
