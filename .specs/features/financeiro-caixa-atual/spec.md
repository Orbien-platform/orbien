# Financeiro — Caixa atual Specification

## Problem Statement

A Visão Geral e a aba Lançamentos só mostram números **do período** (entradas,
saídas, saldo do período). O tesoureiro não vê quanto a igreja tem em caixa:
o saldo acumulado desde o primeiro lançamento. Esse é o dado mais importante do
financeiro, e hoje exige somar de cabeça ou abrir o DRE de todo o histórico.

## Goals

- [ ] Visão Geral e Lançamentos mostram "Caixa em DD/MM/AAAA": Σ entradas − Σ saídas
      realizadas, de todo o histórico até o fim do período pesquisado.
- [ ] O valor vem calculado no servidor a cada consulta (sem cache), e é recalculado
      quando o fim do período muda e quando um lançamento é criado, editado, pago ou excluído.
- [ ] Um único cálculo no backend alimenta as duas telas (mesma fronteira de dia do dashboard).

## Out of Scope

| Feature | Reason |
| --- | --- |
| Saldo inicial / de abertura por congregação | Sem coluna no schema; abertura se lança como entrada normal (decisão do usuário) |
| Caixa consolidado do tenant (todas as congregações) | Módulo inteiro isola por congregação (decisão do usuário) |
| Caixa por conta bancária / conciliação | Não existe modelo de conta; conciliação é outra aba |
| Série histórica do caixa (gráfico de evolução) | Possível P3 futuro; não pedido |
| Mudar "Saldo (entradas − saídas)" da aba Lançamentos | Continua sendo o saldo do período filtrado; só ganha rótulo distinto do caixa |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Quais status entram | `paid` + `confirmed`. `pending` ("Não pago") fica fora | Caixa = dinheiro que de fato entrou/saiu | y |
| Saldo inicial | Não existe; Σ só de lançamentos | Sem migration | y |
| Escopo | `tenant_id` + `congregation_id` do usuário | Padrão do módulo | y |
| Filtros que afetam o caixa | Só a data fim. Tipo, categoria, status e data inicial não | Caixa é fato acumulado, não saldo filtrado | y |
| Data fim vazia (Lançamentos) | Hoje em Brasília | Sem fim definido, "caixa atual" é o de hoje | n |
| Data fim no futuro (ex.: mês inteiro em curso) | Inclui lançamentos pagos com data até esse fim | É o que "até o filtro de data fim" pede; o rótulo mostra a data | n |
| Intervalo invertido na aba Lançamentos | Caixa usa a data fim digitada mesmo assim | Fim é válido por si só; lista fica vazia como hoje | n |
| "Tempo real" | Consulta sem cache + refetch após mutação e ao trocar fim; sem polling/websocket | Dado muda por ação do próprio usuário; polling não se paga | n |
| Linha secundária | "A pagar/receber até a data": Σ `pending` por tipo, até a data fim | Dá contexto sem poluir o número principal | n |
| Papéis | Mesmos de `GET /financial/dashboard/weekly` (`DASHBOARD_ROLES`) na Visão Geral; Lançamentos já é restrito ao não-pastor | Sem gate de plano, como `weekly` | n |

**Open questions:** nenhuma — resolvidas ou registradas acima.

---

## User Stories

### P1: Caixa atual na Visão Geral ⭐ MVP

**User Story**: Como tesoureiro, quero ver o caixa na Visão Geral, no fim do período que escolhi, para saber quanto a igreja tem sem somar nada.

**Acceptance Criteria**:

1. WHEN `GET /financial/dashboard/cash-balance?as_of=AAAA-MM-DD` é chamado THEN a API SHALL responder `balance = Σ income − Σ expense` dos lançamentos `paid`/`confirmed` da congregação do usuário com `occurred_at < as_of + 1 dia` (00:00Z, fim exclusivo, mesma convenção de `dashboard-period.ts`), desde o primeiro lançamento.
2. WHEN `as_of` é omitido THEN a API SHALL usar hoje em Brasília.
3. WHEN `as_of` é inválido (ex.: 30/02, formato errado) THEN a API SHALL responder 400.
4. WHEN há lançamentos `pending` até a data THEN a resposta SHALL trazer `pending.income` e `pending.expense` separados, e `balance` SHALL ignorá-los.
5. WHEN a Visão Geral carrega ou o usuário navega o período THEN o card SHALL pedir o caixa com `as_of = overviewPeriod.end` e mostrar "Caixa em DD/MM/AAAA".
6. WHEN o saldo é negativo THEN o card SHALL mostrá-lo em tom de saída (crimson) com sinal.
7. WHEN a requisição falha THEN o card SHALL mostrar estado de erro com tentar de novo; WHEN 403 THEN `NoAccessState`; WHILE carrega, `Skeleton`.

**Independent Test**: tenant de teste com entradas/saídas pagas antes, dentro e depois do período; o caixa na Visão Geral bate com Σ até o fim e muda ao avançar o período.

---

### P1: Caixa atual em Lançamentos ⭐ MVP

**User Story**: Como tesoureiro, quero o caixa junto da apuração da aba Lançamentos, na data fim do filtro.

**Acceptance Criteria**:

1. WHEN a aba abre THEN o caixa SHALL aparecer junto dos três cartões de apuração, com `as_of` = data fim do filtro (ou hoje se vazia).
2. WHEN o usuário muda tipo, categoria, status ou data inicial THEN o caixa SHALL permanecer igual (sem nova consulta).
3. WHEN o usuário muda a data fim THEN o caixa SHALL ser recalculado, descartando respostas atrasadas (guard de sequência como `txSeq`).
4. WHEN um lançamento é criado, excluído, editado ou tem o status alternado (pago/não pago) THEN o caixa SHALL ser recarregado, sem recarregar a página.
5. WHEN o toggle de status falha e é revertido THEN o caixa SHALL voltar ao valor anterior (refetch ou revert).
6. WHEN o card é exibido THEN o rótulo SHALL deixar claro que o caixa é acumulado e não é afetado pelos filtros, e o cartão "Saldo (entradas − saídas)" SHALL ser rotulado como saldo do período.

**Independent Test**: marcar um lançamento como pago e ver o caixa subir/descer na hora; trocar tipo/categoria e ver o caixa fixo.

---

### P2: A pagar / a receber até a data

**Acceptance Criteria**:

1. WHEN há `pending` até a data fim THEN o card SHALL mostrar linha secundária "A receber R$ x · A pagar R$ y" e, opcionalmente, o caixa projetado.
2. WHEN não há `pending` THEN a linha SHALL ser omitida.

---

## Edge Cases

- Sem nenhum lançamento: caixa R$ 0,00 (não erro, não vazio).
- Lançamento no último dia, às 15:00Z (meio-dia de Brasília): entra (fim exclusivo no dia seguinte 00:00Z).
- Lançamento `confirmed` (exportado): entra.
- Valores Decimal(12,2): somar no banco, converter no fim; sem acúmulo de float no cliente.
- `as_of` > 5 anos à frente: aceitar (não é janela, é limite superior).
- Congregação sem acesso / outra congregação: nunca soma; RLS e filtro explícito de `congregation_id`.
- Pastor: sem aba Lançamentos; vê só o card da Visão Geral (se `DASHBOARD_ROLES` incluir).

## Dimensões implícitas

| Dimensão | Resolução |
| --- | --- |
| Validação de entrada | `as_of` data civil válida (CAIXA-02) |
| Falha parcial | Falha do caixa não derruba cartões/gráfico/lista; card próprio com erro (CAIXA-04) |
| Idempotência | Leitura pura (N/A para escrita) |
| Auth | Mesmos guards/papéis do `weekly`; RLS por congregação |
| Concorrência / ordem | Guard de sequência no cliente (CAIXA-06) |
| Ciclo de vida | N/A: sem dado novo persistido |
| Observabilidade | N/A: leitura, `AuditInterceptor` global já cobre rota |
| Dependência externa | N/A: só banco |
| Transição de estado | pending→paid altera o caixa (CAIXA-06) |

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CAIXA-01 | P1 Visão Geral AC1-2 (cálculo, default hoje) | Execute | Pending |
| CAIXA-02 | P1 Visão Geral AC3 (400) | Execute | Pending |
| CAIXA-03 | P1 Visão Geral AC4 (pending separado) | Execute | Pending |
| CAIXA-04 | P1 Visão Geral AC5-7 (card, negativo, estados) | Execute | Pending |
| CAIXA-05 | P1 Lançamentos AC1-2,6 (card, filtros, rótulos) | Execute | Pending |
| CAIXA-06 | P1 Lançamentos AC3-5 (refetch, sequência, revert) | Execute | Pending |
| CAIXA-07 | P2 a pagar/receber | Execute | Pending |

## Success Criteria

- [ ] Caixa na tela == Σ SQL de paid+confirmed até a data fim, nos dois lugares.
- [ ] Trocar fim, pagar/despagar e excluir lançamento atualizam o caixa sem recarregar.
- [ ] Teste só em `teste1-church` / `teste2-church`.
