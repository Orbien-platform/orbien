# Design — Financeiro: telas que faltam (forecast, export OFX/SPED, carnê do dizimista, dashboard semanal)

## Arquitetura

Tudo dentro do módulo já existente `apps/web/src/app/(admin)/financeiro/` —
sem rota nova, sem módulo novo. Segue o padrão já em uso na página
(`Tabs.Root` do `@base-ui/react/tabs`, um `useState`/`useEffect` por bloco de
dado, `api` de `@/lib/api`, `NoAccessState` para 403, `Skeleton` para loading).

### Componentes novos

| Arquivo | Responsabilidade |
| --- | --- |
| `apps/web/src/components/financial/WeeklyDashboardCard.tsx` | Busca `GET /financial/dashboard/weekly`; substitui o cálculo local de `chartData`/`kpiIncome`/etc. na aba Visão Geral. Recebe nada por prop — busca por conta própria (mesmo padrão de `loadTx`). |
| `apps/web/src/components/financial/ForecastCard.tsx` | Busca `GET /financial/dashboard/forecast/:months`; seletor de horizonte (3/6/12); substitui o card "Receitas vs período anterior" na Visão Geral. 403 → `NoAccessState`. |
| `apps/web/src/components/financial/ExportButton.tsx` (editar, não recriar) | Adicionar botão OFX (síncrono, mesmo padrão de `handleCsv`/`handlePdf`) e botão SPED (assíncrono — poll de job). |
| `apps/web/src/lib/exportJobPolling.ts` | Helper puro (sem componente): `pollExportJob(jobId, { intervalMs=2000 }) -> Promise<{ status: 'done'|'error', downloadUrl?, errorMessage? }>`, com `AbortSignal` para cancelar ao desmontar. Reusado só por SPED agora, mas isolado porque é lógica, não UI. |
| `apps/web/src/components/financial/BankReconciliationPanel.tsx` | Upload de OFX (`<input type="file" accept=".ofx">` + `FormData`) e lista de não conciliados (`GET /financial/import/ofx/unmatched`). Nova aba `conciliacao` na página. 403 → `NoAccessState` na aba inteira. |
| `apps/web/src/components/financial/DonationBookletPanel.tsx` | Seletor de ano + tabela de doadores (`GET /financial/donation-receipts/annual/summary`) + botão de download por linha (`GET /financial/donation-receipts/annual/:personId`). Nova aba `carne-dizimista`. 403 → `NoAccessState` na aba inteira. |

### Mudança em `apps/web/src/app/(admin)/financeiro/page.tsx`

- `TabValue` ganha `"conciliacao"` e `"carne-dizimista"` (só visíveis para
  `!isPastor`, mesmo critério das abas "Lançamentos"/"Recorrentes" — essas
  seções envolvem ação de tesouraria, não leitura).
- Bloco "Visão Geral": remove `buildWeeklyChart`, `kpiIncome`, `kpiExpense`,
  `kpiResult`, `forecastPct` e o `useEffect` de DRE quando usado só para
  alimentar o card antigo de forecast (o DRE continua sendo buscado para a
  aba DRE em si — só o card da Visão Geral que dependia dele sai). Os dois
  cards somem, entram `<WeeklyDashboardCard />` e `<ForecastCard />` no
  lugar.
- `ExportButton` ganha as duas props que já recebe (`periodStart`,
  `periodEnd`) — nenhuma prop nova, os botões OFX/SPED reusam o mesmo
  período da aba DRE.

## Decisões de design

1. **Cards da Visão Geral buscam por conta própria, não recebem props do
   pai.** Seguem o padrão que a página já tem para dado que não é
   compartilhado entre abas (ex.: `balancete` só é buscado na aba
   `balancete`). Evita acoplar `FinanceiroPage` ao formato de resposta dos
   dois endpoints novos.
2. **Poll do job SPED é um helper isolado, não um hook genérico.** Só há um
   consumidor hoje (SPED); ZIP está fora do escopo da UI. Generalizar agora
   seria abstração prematura — se um segundo consumidor aparecer, promove-se
   para hook nesse momento.
3. **`NoAccessState` sem variante "Premium".** O componente já é genérico
   ("Seu papel... fale com um administrador") e é assim que `redes`/árvore
   genealógica tratam 403 de plano hoje — manter o mesmo texto em vez de
   inventar uma cópia "recurso Premium" que o resto do produto não usa.
4. **Import de OFX vira aba própria (`conciliacao`), não modal dentro da aba
   DRE.** Upload + lista de não conciliados é um fluxo de trabalho, não uma
   ação pontual como exportar — merece o mesmo tratamento de
   "Lançamentos"/"Recorrentes" (aba própria com sua tabela).

## Non-goals (redundante com Out of Scope da spec, citado para quem só lê o design)

Sem geração em lote do carnê, sem tela de "recibo automático", sem endpoint
novo de "fluxo de caixa", sem mudança em `PlanGuard`/`@RequiresPlan`.
