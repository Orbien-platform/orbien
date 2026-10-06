# Validação — Caixa atual

**Veredito: PASS** (verificação inline, sem sub-agente; autor = verificador, então vale como fallback standalone)

Commits: `9c03c05` (cálculo), rota, `CashBalanceCard`, páginas. Gate: `jest src/financial`, `vitest` web (financeiro), `eslint`, `tsc`.

| Requisito | Evidência (teste) | Resultado esperado pela spec |
| --- | --- | --- |
| CAIXA-01 cálculo e `as_of` padrão | `dashboard.service.spec.ts` "o caixa soma entradas e saídas pagas e exportadas…" (`balance` ≈ 1100,25); "sem as_of, usa hoje em Brasília" (`as_of` 2026-10-15); `dashboard-period.spec.ts` `resolveAsOf` | paid+confirmed, fim exclusivo no dia seguinte 00:00Z |
| CAIXA-02 data inválida | `dashboard.service.spec.ts` "data impossível vira 400"; `dashboard.controller.spec.ts` DTO `isDateString` | 400 |
| CAIXA-03 pendentes à parte | `dashboard.service.spec.ts` (`pending` = `{income: 999, expense: 77}`, fora do saldo) | `pending` separado, saldo sem eles |
| CAIXA-04 card, negativo, estados | `CashBalanceCard.test.tsx` (negativo `text-crimson`, skeleton, 403, erro + "Tentar de novo", StrictMode, resposta atrasada) | conforme AC5-7 |
| CAIXA-05 Lançamentos, filtros, rótulo | `page.test.tsx` "caixa atual" (data final, vazia = hoje, filtros não mexem); "Saldo do período" nos testes da apuração | AC1-2,6 |
| CAIXA-06 recarga | `page.test.tsx` "criar, excluir e pagar… recarregam o caixa" (reload 0→3); falha de pagamento não recarrega | AC3-5 |
| CAIXA-07 a pagar/receber | `CashBalanceCard.test.tsx` (mostra / omite a linha) | P2 |

**Discrimination sensor** (`dashboard.service.ts`, mutações descartadas): pendente entra no caixa — morto; `lt`→`lte` — morto; sinal invertido — morto; sem filtro de congregação — morto.

**Não coberto:** e2e (T6, roda só no CI com seed) e teste de integração contra Postgres real (`groupBy` do Prisma, sem SQL cru). Divergência da spec: a spec pedia `Saldo do período` só como rótulo; os dois testes antigos que liam "Saldo (entradas − saídas)" foram atualizados para o novo nome.
