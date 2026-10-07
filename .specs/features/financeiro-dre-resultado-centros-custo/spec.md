# DRE: lucro/prejuízo, PDF e visão por centros de custo — Specification

## Problem Statement

O DRE (`GET /financial/dre`, aba "DRE" em `(admin)/financeiro`) mostra um
"Resultado líquido" sem dizer se é lucro ou prejuízo, soma lançamentos
`pending` (ainda não realizados) como se fossem resultado, e não tem
exportação própria: o botão de PDF da aba chama `/financial/export/pdf`
(razão/diário), enquanto o PDF de DRE existe na API
(`POST /financial/dre/export/pdf`) sem nenhuma tela. Esse PDF ainda tem um
efeito colateral — marca como `confirmed` todos os lançamentos `paid` do
período a cada geração. Centros de custo só aparecem no Balancete (tabela
simples), sem gráfico, sem filtro no DRE e sem evolução no tempo.

## Goals

- [ ] O DRE exibe **Lucro** ou **Prejuízo** do período (rótulo, sinal e cor),
      calculado só sobre lançamentos realizados.
- [ ] O tesoureiro baixa o DRE em PDF pela aba DRE; gerar o PDF não altera
      nenhum dado.
- [ ] O financeiro permite analisar por centro de custo: filtro no DRE/PDF,
      DRE comparativo por centro, gráficos no Balancete e evolução mensal.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Ação explícita "confirmar lançamentos do período" | O efeito colateral do PDF sai; se a confirmação contábil for necessária, vira ação própria, em outra entrega |
| Alterar o PDF de Razão/Diário e CSV/OFX/SPED (`ExportButton`) | Já existem e funcionam; só o DRE entra |
| Exportar o Balancete / matriz por centro em PDF | Pedido cobre PDF só do DRE |
| Novo cadastro/hierarquia de centros de custo | O CRUD existe (Starter); sem tabela nova, sem migration |
| Rateio de despesa entre centros | Lançamento tem um único `cost_center_id` |
| Mobile e `apps/admin` | Módulo financeiro é só `apps/api` + `apps/web` |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Termo do resultado | "Lucro" / "Prejuízo" (zero: "Resultado zerado") | Pedido do usuário | y |
| Que lançamentos entram | `paid` + `confirmed`; `pending` fica fora e vira linha informativa "A realizar" (receitas e despesas pendentes) | Lucro/prejuízo é resultado realizado | y |
| Efeito colateral do PDF | Removido (`updateMany` → `confirmed` sai) | PDF vira só leitura | y |
| Escopo de centro de custo | Filtro por `cost_center_id` (UUID); `cost_center` (nome) continua aceito por compatibilidade, mas `cost_center_id` vence | Nome não é único por congregação | n |
| Lançamento sem centro | Coluna/linha "Sem centro de custo" nas visões comparativas; no filtro, valor `none` | Mesmo rótulo do Balancete | n |
| Botão de PDF do DRE | Novo botão "DRE (PDF)" na aba DRE; `ExportButton` (razão/diário/CSV/OFX/SPED) não muda | Evita mexer em fluxo existente | n |
| Pastor | Mantém o comportamento atual do DRE (valores ocultos na tela, sem exportar); Balancete e novos gráficos seguem o Balancete atual (mostram valores) | Não muda política de acesso | n |
| Plano | Todas as rotas novas Premium, mesmos papéis do DRE/Balancete (`treasurer`, `admin_congregation`, `pastor`, `tenant_admin`) | Mesmo padrão | n |
| Evolução mensal | Um ponto por mês de calendário que o período toca; máximo 36 meses (acima disso 400) | Limita custo da consulta | n |
| Gráficos | Barras em HTML (largura proporcional) com `aria-label` e o valor escrito em cada uma, seguindo a skill `dataviz`; `recharts` não foi usado | A tabela do Balancete continua como equivalente textual e os testes existentes do web mockam só parte do `recharts` | y (desvio registrado como `SPEC_DEVIATION` em `CostCenterCharts.tsx`) |

**Open questions:** nenhuma.

---

## User Stories

### P1: Lucro ou prejuízo no DRE ⭐ MVP

**User Story**: Como tesoureiro, quero ver se o período fechou em lucro ou
prejuízo para entender a saúde financeira sem interpretar sinal.

**Acceptance Criteria**:

1. WHEN `GET /financial/dre` é chamado THEN o sistema SHALL somar só lançamentos com status `paid` ou `confirmed` em receitas, despesas e resultado, no período atual e no anterior.
2. WHEN há lançamentos `pending` no período THEN a resposta SHALL trazer `pending: { revenue_total, expenses_total }` com a soma deles, fora de `net_result`.
3. WHEN `net_result` > 0 THEN a tela SHALL rotular "Lucro do período" em `text-teal`; WHEN < 0, "Prejuízo do período" em `text-crimson`; WHEN = 0, "Resultado zerado" em `text-stone` (cinza neutro do app, nem teal nem crimson).
4. WHEN receitas e despesas somam com centavos (ex.: 0,10 + 0,20 − 0,30) THEN `net_result` SHALL vir arredondado a 2 casas (sem resíduo de ponto flutuante).
5. WHEN há pendentes THEN a tela SHALL mostrar a linha "A realizar" com receitas e despesas pendentes, sem somá-las ao resultado.

**Independent Test**: criar lançamentos pagos e pendentes em `teste1-church`, abrir a aba DRE e conferir rótulo, valor e linha "A realizar".

---

### P1: Exportar o DRE em PDF ⭐ MVP

**User Story**: Como tesoureiro, quero baixar o DRE do período em PDF para apresentar à liderança.

**Acceptance Criteria**:

1. WHEN o usuário clica "DRE (PDF)" na aba DRE THEN a tela SHALL chamar `POST /financial/dre/export/pdf` com o período e o centro de custo selecionados e baixar `orbien_dre_<AAAAMM>[_<AAAAMM>].pdf`.
2. WHEN o PDF é gerado THEN ele SHALL exibir o resultado como "Lucro do período" ou "Prejuízo do período" (ou "Resultado zerado"), os mesmos totais da tela e a linha "A realizar".
3. WHEN há filtro de centro de custo THEN o PDF SHALL declarar o recorte no cabeçalho (nome do centro ou "Sem centro de custo").
4. WHEN o PDF é gerado THEN o sistema SHALL NOT alterar nenhum `FinancialTransaction` (nenhum `updateMany`/`update`).
5. WHEN a geração falha THEN a tela SHALL mostrar "Erro ao exportar o DRE." e reabilitar o botão; WHEN o período está vazio, SHALL pedir o período sem chamar a API.
6. WHEN o usuário é `pastor` (sem outro papel) THEN o botão SHALL NOT aparecer.
7. WHEN `period_end` < `period_start` THEN a API SHALL responder 400.

**Independent Test**: baixar o PDF e conferir título, rótulo de lucro/prejuízo e que `status` dos lançamentos não mudou.

---

### P1: Filtro por centro de custo no DRE ⭐ MVP

**Acceptance Criteria**:

1. WHEN o usuário escolhe um centro no seletor da aba DRE THEN a tela SHALL pedir `/financial/dre?...&cost_center_id=<uuid>` (ou `none`) e recalcular o resultado e o período anterior com o mesmo recorte.
2. WHEN `cost_center_id` não é UUID nem `none` THEN a API SHALL responder 400.
3. WHEN o centro pertence a outro tenant THEN a API SHALL devolver DRE vazio (zeros) — o isolamento é do RLS/`tenant_id`, sem vazar existência.
4. WHEN o seletor está em "Todos" THEN nenhum filtro SHALL ser aplicado.

---

### P2: DRE comparativo por centro de custo

**User Story**: Como tesoureiro, quero ver categorias × centros de custo para saber qual centro dá lucro ou prejuízo.

**Acceptance Criteria**:

1. WHEN `GET /financial/dre/by-cost-center?period_start&period_end[&congregation_id]` é chamado THEN a resposta SHALL trazer uma coluna por centro com lançamento no período (mais "Sem centro de custo" se houver), linhas de receita e despesa por categoria, e por coluna `revenue_total`, `expenses_total`, `net_result`, além da coluna total geral.
2. WHEN a soma das colunas é feita THEN ela SHALL fechar com o total geral e com o `net_result` do `GET /financial/dre` do mesmo período/recorte.
3. WHEN a tela exibe a matriz THEN cada coluna SHALL mostrar Lucro/Prejuízo com a mesma regra de cor do DRE, e a tabela SHALL ficar num contêiner com `overflow-x-auto` e largura mínima própria, de modo que em tela estreita a rolagem seja horizontal e a página não estoure (a primeira coluna fica fixa).
4. WHEN não há lançamentos realizados THEN a tela SHALL mostrar "Sem lançamentos no período".

---

### P2: Gráficos no Balancete

**Acceptance Criteria**:

1. WHEN o Balancete carrega dados THEN a tela SHALL exibir barras de receita e despesa por centro de custo, na mesma ordem da tabela.
2. WHEN o Balancete carrega THEN a tela SHALL exibir a participação de cada centro no total de despesas, em %, com soma 100% (ou nada se despesas = 0).
3. WHEN o Balancete é calculado THEN ele SHALL usar a mesma regra de status do DRE (`paid` + `confirmed`) para fechar com ele.
4. WHEN há gráfico THEN cada barra SHALL ter equivalente textual acessível (a tabela já presente) e `aria-label` com centro e valores.

---

### P3: Evolução mensal por centro de custo

**Acceptance Criteria**:

1. WHEN `GET /financial/balancete/monthly?period_start&period_end[&congregation_id]` é chamado THEN a resposta SHALL trazer, por centro, uma série com `{ month: 'AAAA-MM', revenue_total, expenses_total, net_result }` para cada mês do período, com zeros nos meses sem lançamento.
2. WHEN o período excede 36 meses THEN a API SHALL responder 400.
3. WHEN a tela exibe a evolução THEN SHALL permitir escolher o centro e mostrar o resultado mensal (positivo e negativo distinguíveis por mais que a cor).

---

## Edge Cases

- WHEN o período não tem lançamentos realizados THEN o DRE SHALL mostrar zeros e "Resultado zerado".
- WHEN `period_start` está vazio THEN a tela SHALL NOT chamar a API.
- WHEN a tela troca de período durante uma requisição THEN só a resposta mais recente SHALL ser aplicada (padrão `requestSeq` do `BalancetePanel`).
- WHEN a API devolve 403 (papel/plano) THEN a aba SHALL mostrar `NoAccessState`, sem erro genérico.
- WHEN o centro foi apagado depois de ter lançamentos THEN `cost_center_id` do lançamento já vira `null` (verificar o `onDelete` no schema) e entra em "Sem centro de custo".

---

## Dimensões implícitas

| Dimensão | Resultado |
| --- | --- |
| Validação de entrada | DRE-04, DRE-07, DRE-12, DRE-16 |
| Falha / falha parcial | DRE-08 (falha de PDF), 403 nas telas |
| Idempotência / duplicata | DRE-05: PDF não escreve nada, logo repetível |
| Auth / rate limit | Mesmos papéis e Premium; `isPastor` — ver Assumptions. Rate limit: N/A porque o PDF já existe com o mesmo guard e agora é só leitura |
| Concorrência | `requestSeq` nas telas; leituras sem transação longa |
| Ciclo de vida do dado | N/A porque não há tabela nem retenção novas |
| Observabilidade | N/A porque nenhum job ou integração nova |
| Falha de dependência externa | N/A porque `pdfmake` roda local |
| Transição de estado | PDF deixa de transicionar `paid` → `confirmed` (DRE-05) |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| DRE-01 | P1 Lucro/prejuízo: só realizados (AC1) | Execute | Implemented |
| DRE-02 | P1 Lucro/prejuízo: `pending` informativo (AC2, AC5) | Execute | Implemented |
| DRE-03 | P1 Lucro/prejuízo: rótulo e cor (AC3) | Execute | Implemented |
| DRE-04 | P1 Lucro/prejuízo: arredondamento (AC4) | Execute | Implemented |
| DRE-05 | P1 PDF: sem efeito colateral (AC4) | Execute | Implemented |
| DRE-06 | P1 PDF: conteúdo lucro/prejuízo + A realizar + recorte (AC2, AC3) | Execute | Implemented |
| DRE-07 | P1 PDF: período inválido 400 (AC7) | Execute | Implemented |
| DRE-08 | P1 PDF: botão, download, erro, pastor (AC1, AC5, AC6) | Execute | Implemented |
| DRE-09 | P1 Filtro: seletor e recorte nos dois períodos (AC1, AC4) | Execute | Implemented |
| DRE-10 | P1 Filtro: `cost_center_id` + compat. por nome (AC1) | Execute | Implemented |
| DRE-11 | P1 Filtro: isolamento entre tenants (AC3) | Execute | Implemented |
| DRE-12 | P1 Filtro: validação de `cost_center_id` (AC2) | Execute | Implemented |
| DRE-13 | P2 Matriz: API (AC1, AC2) | Execute | Implemented |
| DRE-14 | P2 Matriz: tela (AC3, AC4) | Execute | Implemented |
| DRE-15 | P2 Gráficos: barras e participação (AC1, AC2, AC4) | Execute | Implemented |
| DRE-16 | P2 Gráficos: Balancete só realizados (AC3) | Execute | Implemented |
| DRE-17 | P3 Evolução: API (AC1, AC2) | Execute | Implemented |
| DRE-18 | P3 Evolução: tela (AC3) | Execute | Implemented |

**Coverage:** 18 requisitos, 18 implementados (T1–T12); `Verified` só depois do Verifier.

---

## Success Criteria

- [ ] Para qualquer período, `net_result` do DRE, soma das colunas da matriz e total do Balancete são iguais.
- [x] Gerar o PDF 2× seguidas não altera nenhum registro (teste unitário + conferido contra o banco local: 3 `paid` seguem `paid`).
- [x] Testes novos só em `teste1-church`/`teste2-church` (e2e); nada toca `doca-church`. (e2e roda em `teste2-church`, o tenant Premium.)
