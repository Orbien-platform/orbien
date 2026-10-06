# Financeiro — Caixa atual — Tasks

Sem design formal: reuso de `dashboard-period.ts` (fim exclusivo), `DashboardController`
e `TotalCard`/`KpiCard` existentes. Sem migration, sem RLS nova.

| # | Tarefa | Cobre | Gate |
| --- | --- | --- | --- |
| T1 | API: `CashBalanceService` (ou método em `DashboardService`) — `aggregate` por `type` com `status in (paid, confirmed)`, `occurred_at < endExclusive`, escopo `tenant_id`+`congregation_id`; `pending` à parte. Exportar `parseDay`/helper de `as_of` em `dashboard-period.ts` | CAIXA-01,02,03 | `dashboard.service.spec.ts` (ou spec novo): paid, confirmed, pending, borda 15:00Z, sem lançamento, outra congregação |
| T2 | API: `GET /financial/dashboard/cash-balance` + `CashBalanceQueryDto` (`as_of` `IsDateString`), `@Roles(...DASHBOARD_ROLES)`, sem `@RequiresPlan`; 400 em data inválida | CAIXA-02 | `dashboard.controller.spec.ts` |
| T3 | Web: componente `CashBalanceCard` (`components/financial/`) + hook de busca com guard de sequência; estados loading/erro/403/negativo; linha "a pagar/receber" | CAIXA-04,07 | Vitest do componente. **Carregar `frontend-design` antes** |
| T4 | Web Visão Geral: `CashBalanceCard` com `as_of = overviewPeriod.end`, acima do `WeeklyDashboardCard` | CAIXA-04 | `page.test.tsx` |
| T5 | Web Lançamentos: card ao lado da apuração com `as_of = txTo \|\| todayKey()`; refetch via `txReload` em criar/excluir/status/edição; rótulo do "Saldo" vira "Saldo do período" | CAIXA-05,06 | `page.test.tsx`: filtros não refazem a busca; mutação refaz |
| T6 | e2e em `teste1-church`: pagar lançamento e ver caixa mudar (`apps/web/e2e/financeiro.spec.ts`) | CAIXA-06 | `playwright` local |
| T7 | `docs/PLANO.md`: registrar item (`PROD-`), se couber | — | `check-skills`/lint |

Ordem: T1 → T2 → T3 → (T4 ∥ T5) → T6 → T7. Um commit por tarefa; Verifier fresco ao final.
