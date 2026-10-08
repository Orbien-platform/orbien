# DRE: lucro/prejuízo, PDF e centros de custo — Validation (ciclo 3 de 3)

**Date**: 2026-10-07
**Spec**: `.specs/features/financeiro-dre-resultado-centros-custo/spec.md` (ACs = fonte da verdade)
**Diff range**: feature inteira `11e48a3..0efbd8e` (HEAD `0efbd8e`, branch `feat/dre-lucro-prejuizo-centros-de-custo`); superfície nova do ciclo 3 `fa0fb55..0efbd8e` (commits `b06c9cb` e `0efbd8e`, só teste).
**Verifier**: sub-agente independente (autor != verificador; não participou dos ciclos 1 e 2). Árvore real não mutada: mutações em `git worktree` descartável (`.claude/worktrees/v3`, removido com `--force`; `git worktree list` só com a árvore real; `git status` só com este arquivo novo; nenhum `git stash`).

## Veredito: FAIL ❌ (ciclo 3, o último: escalar ao usuário)

`git diff fa0fb55..HEAD` não toca código de produção: só 8 arquivos de teste e a caixa de `spec.md:193` (`[ ]` para `[x]`). Os 7 gaps ranqueados do ciclo 2 estão tratados (6 fechados; o 7º, cosmético, aceito com justificativa e uma ratificação que depende do usuário). Os 17 sobreviventes antigos que eram lacuna estão **mortos**; os 3 que seguem vivos são equivalente/indefinido e aceitos. Gates verdes e banco real fecha (DRE = matriz = Balancete = série = 150,00; PDF não altera nada; 401 sem token nas 4 rotas; nenhum id de centro de outro tenant).

O que reprova é o sensor novo, focado no que os ciclos 1 e 2 não atacaram: de **90 mutações novas válidas, 49 morreram e 41 sobreviveram**. Dos 41, 23 são **lacuna real de teste** (nenhuma exige mudar o comportamento de produção: o código atual responde certo no banco real), 12 são equivalentes/defensivos e 6 indefinidos pela spec. As lacunas reais, por gravidade, estão em "Gaps restantes". Pela regra da decisão (PASS exige zero lacuna real aberta) o resultado é FAIL. Como o limite de 3 iterações fix→re-verify foi atingido, o ciclo não reabre sozinho: **cabe ao usuário decidir** entre (a) mandar uma rodada final só de testes (cerca de 12 asserções, nenhuma de produção) ou (b) aceitar explicitamente as lacunas 4 a 9 como pendência conhecida e fechar só 1 a 3.

---

## Histórico

**Ciclo 1** (`11e48a3..73cc87b`): **FAIL ❌**. 27/27 ACs com asserção (23 ✅, 2 ⚠, 2 ❌). Sensor: 51 mutações, 39 mortas, **12 sobreviveram** (M2b, M2c, M2i, M2e, M2j, M2k, M20, M24, M25, M26, W5, W6). Banco real: 150,00 nas três visões; 8 PDFs sem alterar lançamento.

**Ciclo 2** (`11e48a3..fa0fb55`): **FAIL ❌**. Os 12 sobreviventes do ciclo 1 mortos; 85 novas, 65 mortas, **20 sobreviveram** (Wt, V9, Q1, N28, V3, R1 a R6, R9, N16, Ws, Wv, N11, N12, Wn, Wj, Wg). 27/27 ACs com asserção (21 ✅, 5 ⚠, 1 ❌). Gates: API 311 suítes/3498 testes, web 144/1814. Banco real: 150,00 nas visões.

---

## Task Completion

`tasks.md` T1 a T12: todas "✅ Concluída" (`tasks.md:76,89,102,112,123,135` e seguintes); nenhuma parcial ou bloqueada. Requisitos DRE-01 a DRE-18 implementados.

---

## Gaps do ciclo 2 (itens 1 a 7 do ranking dele)

| # | Gap | Estado | Evidência `arquivo:linha` + asserção |
| --- | --- | --- | --- |
| 1 | Major: "A realizar" some com um lado só pendente (Wt) | **FECHADA** | `DrePanel.test.tsx:91-100` (receita 0, despesa 400: `getByText("A realizar")`) e `:102-110` (receita 250, despesa 0); `:112-118` ausente sem pendentes. Wt (`\|\|` vira `&&`) reexecutado: MORTO (2 testes falham) |
| 2 | Major: matriz e série sem linha `confirmed` (V9, Q1) | **FECHADA** | `dre-cost-center.service.spec.ts:186` massa com `confirmed`; `:247-256` `expect(wheres[0]?.status).toEqual({ in: ['paid', 'confirmed'] })`; `balancete-monthly.service.spec.ts:258-267` idem; V9 e Q1 reexecutados: MORTOS |
| 3 | Major: âncoras da regex de `cost_center_id` (N28, V3) | **FECHADA** | `dto/dre-query.dto.spec.ts:63-64` rejeita `xnone` e `noneX` (e UUID com prefixo/sufixo na mesma tabela); N28 e V3 reexecutados: MORTOS (3 e 4 testes falham). Banco real: `xnone`, `noneX`, UUID com `X` antes/depois: 400 |
| 4 | Minor: centavos em colunas, células, linha, série, Balancete (R1 a R6, R9) | **FECHADA** | `dre-cost-center.service.spec.ts:272-286` (`columns[0]` 0,3/0,3, `cells[MISSOES.id]` 0,3, `total` 0,3), `:226-244` totais; `balancete-monthly.service.spec.ts:271-` pontos; `balancete.service.spec.ts:226-238` `lines[0]` 0,3/0,3. R1..R6 e R9: **todos MORTOS** |
| 5 | Minor: "Sem centro" primeiro nos dados (N16); pastor acumulando papel (Ws, Wv) | **FECHADA** | `dre-cost-center.service.spec.ts:260` ("Sem centro de custo" por último mesmo sendo o primeiro a aparecer); `financeiro/page.test.tsx:394-396` `it.each` pastor+tesoureiro/tenant_admin/admin_congregation não restrito, `:382` pastor puro restrito. N16, Ws, Wv: MORTOS |
| 6 | Minor, pré-existente: nov→jan e fronteira 00:00:00.000 (N11, N12) | **FECHADA** | `dre.service.spec.ts:286-300` (nov→jan compara com ago→out: `start: '2025-08-01'`), `:304-310` `toBe('2025-12-01T00:00:00.000Z')` e `lte` `'...T23:59:59.999Z'`. N11 (3 testes) e N12 (1 teste): MORTOS |
| 7 | Cosmético: `<th scope="row">`, rótulo "Lançamentos sem centro", ratificação do desvio "y", `spec.md:193` | **ACEITA-COM-JUSTIFICATIVA** (parte fechada) | `spec.md:193` agora `[x]` (fechada). Seguem abertas e cosméticas: `DreCostCenterMatrix.tsx:71` primeira coluna `<td>` sticky; `DrePanel.tsx` opção "Lançamentos sem centro" vs "Sem centro de custo" no resto. Não alteram dado nem AC. A confirmação "y" do desvio `recharts` em `spec.md:50` segue sem prova de que o usuário a deu: **depende do usuário** |

---

## Spec-Anchored Acceptance Criteria

Legenda: ✅ coberto, valor bate com a spec e as mutações do ponto morreram. ⚠ coberto, mas há mutante sobrevivente de lacuna real (ver "Gaps restantes") ou spec sem precisão. Arquivos de teste da API em `apps/api/src/financial/`, do web em `apps/web/src/components/financial/`.

### P1: Lucro ou prejuízo no DRE

| AC | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| --- | --- | --- | --- |
| AC1 só `paid`/`confirmed`, atual e anterior | `pending` fora | `dre.service.spec.ts:517` `expect(dre.net_result).toBe(110)`; `:522-535` anterior sem pendentes. Q2, Q3, Q4 (ciclo 2) e a troca de status em X40 (`['pending','paid']`): MORTAS | ✅ |
| AC2 `pending` fora de `net_result` | soma dos pendentes | `dre.service.spec.ts:549` `expect(dre.pending).toEqual({ revenue_total: 230.5, expenses_total: 80.25 })`. X38 (pending ignora centro): MORTA; X39 (pending ignora congregação): SOBREVIVEU | ⚠ (X39) |
| AC3 rótulo e cor | `>0` "Lucro do período" `text-teal`; `<0` "Prejuízo do período" `text-crimson`; `=0` "Resultado zerado" `text-stone` | `DrePanel.test.tsx:52` (teal), `:60` (crimson), `:68` (stone, sem teal nem crimson). D7 (resultado visível ao pastor): MORTA | ✅ |
| AC4 centavos | `net_result` a 2 casas | `dre.service.spec.ts:570-614` (`net_result` 0, 0,1; receita/despesa 0,3; anterior 0,3; `pending` 0,3). R-série, N14: MORTAS | ✅ |
| AC5 linha "A realizar" sem somar | receitas e despesas pendentes visíveis | `DrePanel.test.tsx:77-90` (`/Receitas\s+R\$\s?300,00/`, `/Despesas\s+R\$\s?120,00/`), `:91-110` um lado só, `:112-118` ausente. Wt: MORTO | ✅ |

### P1: Exportar o DRE em PDF

| AC | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| --- | --- | --- | --- |
| AC1 POST e nome `orbien_dre_AAAAMM[_AAAAMM].pdf` | corpo com período e centro; nome do arquivo | `DrePdfButton.test.tsx:28,42,51,61`; `dre.controller.spec.ts:122,137` (`filename="orbien_dre_202601.pdf"` / `..._202601_202603.pdf`). X21 (flip de `s === e`), X22 (`slice(0,7)`), X23 (prefixo), X24 (Content-Type), X25 (`inline`), R6 (sem `responseType`): MORTAS | ✅ |
| AC2 conteúdo: rótulo, totais, "A realizar" | rótulo certo, valores nas linhas certas | `dre-pdf.service.spec.ts:167-215` (`pdfTableRows`, totais, período anterior, Lucro/Prejuízo com valor na linha); **`:272-281` "A realizar" é só `toContain('A realizar'/'230,50'/'80,25')`: X34 (troca receita/despesa pendente), X49 (rótulo) e X26 SOBREVIVERAM** | ⚠ |
| AC3 recorte no cabeçalho | nome do centro ou "Sem centro de custo" | `dre-pdf.service.spec.ts:296,310,321,331,342`. X15 (`tenant_id` do `findFirst`), X16 (compat. por nome), X17 ("não encontrado" vs "Sem centro de custo"): MORTAS | ✅ |
| AC4 sem `update`/`updateMany` | nenhuma escrita | `dre-pdf.service.spec.ts:220,228` (`ftAccess` `toEqual([])`, 2 gerações). Banco real: snapshot `id+status+updated_at` dos 8 lançamentos idêntico após 10 PDFs | ✅ |
| AC5 erro e período vazio | "Erro ao exportar o DRE." e reabilita; vazio sem API | `DrePdfButton.test.tsx:71` (vazio), `:80` (erro + reabilita), `:91` (desabilita). R2, R7, R9: MORTAS. **R1 (só `!periodStart`, fim vazio chama a API) SOBREVIVEU** | ⚠ |
| AC6 pastor sem outro papel: sem botão | botão ausente | `DrePdfButton.test.tsx:129`; `financeiro/page.test.tsx:382,394-396`. Ws, Wv: MORTOS | ✅ |
| AC7 `period_end` < `period_start` | 400 | `dre.controller.spec.ts:161`; `dto/dre-query.dto.spec.ts` (período); banco real 400 em DRE, matriz, mensal, Balancete e PDF | ✅ |

### P1: Filtro por centro de custo

| AC | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| --- | --- | --- | --- |
| AC1 seletor pede `cost_center_id=<uuid>`/`none`, atual e anterior | URL com o parâmetro | `DrePanel.test.tsx:144,155`; `dre.service.spec.ts:656,668`. H1 (chave sem centro), H2 (parâmetro sempre enviado): MORTAS | ✅ |
| AC2 não-UUID e não-`none` → 400 | 400 | `dto/dre-query.dto.spec.ts:57-74` (inclui `:63-64`); `dre.controller.spec.ts:170`; banco real 400 em 6 entradas inválidas. N28, V3: MORTOS | ✅ |
| AC3 centro de outro tenant → zeros | zeros | `dre.service.spec.ts:708`; `dre-pdf.service.spec.ts:342`; banco real UUID inexistente `0,0,0`. X12 (sem `tenant_id` no `buildScope`): MORTA em 6 testes | ✅ |
| AC4 "Todos": sem filtro | nenhuma chave | `DrePanel.test.tsx:137,165`; `dre.service.spec.ts:679-686` `not.toHaveProperty('cost_center_id')` | ✅ |

### P2: DRE comparativo por centro

| AC | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| --- | --- | --- | --- |
| AC1 matriz | colunas por centro (+ "Sem centro"), linhas por categoria, totais | `dre-cost-center.service.spec.ts:92,128,143,260,272`. X31 (chave por nome na API), X36 (período), N16: MORTAS. **M1 (tela: célula da coluna "Sem centro" lida por chave `"none"` em vez de `"__none__"`) SOBREVIVEU**: a fixture traz `__none__: 0` (`DreCostCenterMatrix.test.tsx:19-20`), então valor nenhum aparece | ⚠ |
| AC2 soma das colunas = total geral = `net_result` do DRE | igualdade | `dre-cost-center.service.spec.ts:151,184-222` (`toBe(84.5)`, `toBe(390)`, `toBe(305.5)` nos 4 serviços), `:247-256` status. V9 morta; banco real 150 = 150 = 150 = 150 | ✅ |
| AC3 Lucro/Prejuízo por coluna e rolagem | cores do DRE; `overflow-x-auto`, `min-w-max`, 1ª coluna `sticky` | `DreCostCenterMatrix.test.tsx:37,71-77`. M4 (valor da célula de resultado), M5 (total da linha), Msec (linha de seção): MORTAS | ✅ (rolagem visual: aceita, ver ciclo 2) |
| AC4 vazio | "Sem lançamentos no período" | `DreCostCenterMatrix.test.tsx:79` | ✅ |

### P2: Gráficos no Balancete

| AC | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| --- | --- | --- | --- |
| AC1 barras por centro, mesma ordem da tabela | uma por centro, ordem igual | `CostCenterCharts.test.tsx:33,52`; `BalancetePanel.test.tsx:26`. B1 (gráfico removido), C1, C2, C3: MORTAS. **B3 (`BalancetePanel.tsx:142` passa `lines` invertidas) e C4 (`CostCenterCharts.tsx:47` `max` só de receita) SOBREVIVERAM** | ⚠ |
| AC2 participação em %, soma 100 | Σ% = 100 | `CostCenterCharts.test.tsx:16,80,89,95,109`. C5, C7: MORTAS. Wn (desempate de restos iguais): SOBREVIVE, a spec não define o desempate | ⚠ (spec-precision, aceito) |
| AC3 Balancete com a regra do DRE | `paid`+`confirmed` | `balancete.service.spec.ts:45` `status: { in: ['paid', 'confirmed'] }`; `:211-` fecha com DRE | ✅ |
| AC4 equivalente textual e `aria-label` | `aria-label` com centro e valores | `CostCenterCharts.test.tsx:33,44,60`; C5 (rótulo do `aria-label` da participação): MORTA | ✅ |

### P3: Evolução mensal

| AC | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| --- | --- | --- | --- |
| AC1 série `{month, revenue_total, expenses_total, net_result}` com zeros | pontos `AAAA-MM` | `balancete-monthly.service.spec.ts:71,95,110,121,271`. X29 (`slice`), X37 (período), X28: MORTAS. **X30 (série chaveada por nome em vez de id: dois centros homônimos viram uma série só) SOBREVIVEU** | ⚠ |
| AC2 >36 meses → 400 | 36 aceita, 37 rejeita | `balancete-monthly.service.spec.ts:204,217,230`; `CostCenterTrend.test.tsx:126,133`; banco real 36 → 200, 37 → 400. X28 (limite 37 na API), X44: MORTAS. Na tela, **T1 (`MAX_MONTHS = 37`) SOBREVIVEU**: nenhum teste do componente usa exatamente 37 meses | ⚠ |
| AC3 escolher o centro; positivo e negativo distinguíveis | seletor; rótulo e posição | `CostCenterTrend.test.tsx:80,90,104`. T2, T3, T5, T6, T9, T8: MORTAS. **T4 (`CostCenterTrend.tsx:136` `maxAbs` sem `Math.abs`) SOBREVIVEU**: período só com prejuízo ficaria sem barra | ⚠ |

### Edge cases

| Edge case | Evidência | Estado |
| --- | --- | --- |
| Sem realizados: zeros e "Resultado zerado" | `dre.service.spec.ts:561`; `DrePanel.test.tsx:68` | ✅ |
| `period_start` vazio: não chama a API | `DrePanel.test.tsx:225`; `DrePdfButton.test.tsx:71`. **H7 (`loading` sem `!!start`, esqueleto eterno) SOBREVIVEU**: o teste só afirma "não chama a API" | ✅ (spec) / ⚠ UI |
| Troca de período durante a requisição | `DrePanel.test.tsx:197`; `DreCostCenterMatrix.test.tsx:146`; `CostCenterTrend.test.tsx:162`; `BalancetePanel.test.tsx:118,134` | ✅ |
| 403 → `NoAccessState` | `DrePanel.test.tsx:218,239`; `DreCostCenterMatrix.test.tsx:91`; `CostCenterTrend.test.tsx:148` | ✅ |
| Centro apagado → "Sem centro de custo" | `schema.prisma` `onDelete: SetNull`; agregação de `null` coberta | ✅ por leitura |

**Status**: 27/27 ACs com asserção localizada (evidence-or-zero cumprido); 18 ✅ e 9 ⚠ (P1-resultado AC2, P1-PDF AC2 e AC5, P2-matriz AC1, P2-gráficos AC1 e AC2, P3 AC1, AC2 e AC3; Wn em gráficos AC2 é spec-precision aceito). Nenhum AC sem evidência e nenhum ❌.

---

## Discrimination Sensor (ciclo 3)

Profundidade **P0-full**. Worktree descartável em `0efbd8e`; `node_modules` por link simbólico. API: `jest src/financial/dre src/financial/balancete src/financial/dto --selectProjects unit` (22 suítes, 295 testes, verde sem mutação). Web: `vitest run src/components/financial "src/app/(admin)/financeiro"` (394 testes, verde sem mutação). Cada mutação aplicada, testes rodados, revertida com `git checkout`. As edições de `apps/web` foram feitas **com a ferramenta Edit** (nenhum `sed`/heredoc); o hook `PreToolUse` não as negou. As do web rodaram em 9 rodadas de até 6 arquivos diferentes, atribuindo cada morte ao teste que falhou; mutante sem teste falhando no seu componente é sobrevivente (conferido em rodada solo para Wt, Ws, Wv, Wn, Wj, Wg, R8 e H8).

### A. Os 20 sobreviventes do ciclo 2, reexecutados: 17 MORTOS, 3 sobrevivem

| # | Mutação | Agora | Teste que mata / classificação |
| --- | --- | --- | --- |
| Wt | `hasPending` `\|\|` vira `&&` (`DrePanel.tsx`) | MORTO | `DrePanel.test.tsx:91,102` |
| V9 | matriz só `paid` | MORTO | `dre-cost-center.service.spec.ts:186,247` |
| Q1 | série mensal só `paid` | MORTO | `balancete-monthly.service.spec.ts:258` (e o teste único `dre-cost-center...:184`) |
| N28 | regex sem `^` | MORTO | `dto/dre-query.dto.spec.ts:63-64` (3 falhas) |
| V3 | regex sem `$` | MORTO | idem (4 falhas) |
| R1, R2 | série sem `round2` em receita/despesa | MORTOS | `balancete-monthly.service.spec.ts:271` |
| R3, R4 | coluna da matriz sem `round2` | MORTOS | `dre-cost-center.service.spec.ts:272` |
| R5, R6 | célula e total da linha sem `round2` | MORTOS | idem |
| R9 | linha do Balancete sem arredondar receita | MORTO | `balancete.service.spec.ts:226` |
| N16 | desempate de "Sem centro" | MORTO | `dre-cost-center.service.spec.ts:260` |
| Ws | `treasurer` fora de `managesFinance` | MORTO | `financeiro/page.test.tsx` pastor + tesoureiro |
| Wv | `isPastor` sem `&& !managesFinance` | MORTO | `financeiro/page.test.tsx` (3 falhas) |
| N11 | período anterior sem `+1` ms | MORTO | `dre.service.spec.ts:304-310` (3 falhas) |
| N12 | `* 12` vira `* 0` | MORTO | `dre.service.spec.ts:286` |
| **Wn** | desempate de restos iguais em `sharesOf` | **SOBREVIVE** | **indefinido pela spec** (AC2 só exige soma 100; não define quem recebe o ponto extra). Aceito |
| **Wj** | pastor também busca `/financial/cost-centers` | **SOBREVIVE** | **equivalente na UI** (seletor escondido; falha do GET engolida). Defesa em profundidade. Aceito |
| **Wg** | matriz renderizada sem `!isPastor` | **SOBREVIVE** | **equivalente** (o hook não busca para pastor, `matrix` é `null`). Aceito |

### B. Mutações novas (nenhuma está nas listas dos ciclos 1 e 2)

**90 válidas injetadas: 49 MORTAS, 41 SOBREVIVERAM.** Não contada: X11 (`@RequiresPlan('starter')` não compila, a suíte nem roda; o caso real, tirar o `@RequiresPlan`, é o V14 do ciclo 2).

**Mortas (49)**

| Área | Mutações MORTAS |
| --- | --- |
| roles / plano dos 2 controllers | X08 `BALANCETE_ROLES` sem `pastor`; X09 `DRE_ROLES` sem `admin_congregation`; X10 `DRE_ROLES` sem `pastor`; X14 `getByCostCenter` com `congregation_id` no lugar de `tenant_id` |
| `buildScope` | X12 `tenant_id` removido (6 testes falham em 5 suítes); X13 filtro de congregação invertido (7 falhas) |
| PDF (conteúdo e controller) | X15 `findFirst` sem `tenant_id`; X16 compat. por nome; X17 "não encontrado" vs "Sem centro de custo"; X21 flip `s === e`; X22 `slice(0,7)`; X23 prefixo; X24 `Content-Type`; X25 `inline` |
| série e matriz (API) | X28 `MAX_MONTHS` 37; X29 `monthKey` `slice(0,6)`; X31 matriz chaveada por nome; X36 matriz com `period.start` = fim; X37 série idem; X44 texto do 400 |
| DRE | X38 `pending` ignora centro; X40 `pending` soma `paid`; X41 `period.start` = fim (ambos) |
| DTO | X32 `congregation_id` sem `@IsUUID` no `BalanceteQueryDto`; X42 idem no `DreQueryDto` |
| web: `useDreReport` | H1 chave sem centro; H2 `cost_center_id=` sempre enviado |
| web: `DrePdfButton` | R2 sem `disabled`; R6 sem `responseType`; R7 sem `setBusy(false)`; R9 texto do aviso |
| web: `CostCenterTrend` | T2 `+1` de `monthsTouched`; T3 `* 11`; T5 altura `* 50`; T6 cor do lucro; T8 busca antes do clique; T9 sem `!tooLong` |
| web: `CostCenterCharts` | C1 largura `* 50`; C2 sem filtro `expenses_total > 0`; C3 ordenação ascendente; C5 `aria-label` da participação; C6 lucro/prejuízo trocados; C7 largura da participação |
| web: matriz e painel | M4 célula de resultado mostra receita; M5 total da linha zerado; Msec linha de seção com a coluna errada; B1 gráficos removidos; B2 evolução removida; D7 resultado visível ao pastor |

**SOBREVIVERAM (41)**, com classificação

| # | Mutação | Arquivo:linha | Classificação |
| --- | --- | --- | --- |
| X01 | `PlanGuard` fora de `@UseGuards` | `dre.controller.ts:21` | **LACUNA REAL (Major, segurança)** |
| X02 | `JwtAuthGuard` fora | `dre.controller.ts:21` | **LACUNA REAL** (banco real dá 401 sem token, mas o teste não vê) |
| X03 | `RolesGuard` fora | `dre.controller.ts:21` | **LACUNA REAL** |
| X04 | `@UseInterceptors(TenantContextInterceptor)` fora | `dre.controller.ts:22` | **LACUNA REAL** |
| X05 | `PlanGuard` fora | `balancete.controller.ts:19` | **LACUNA REAL** |
| X06 | `RolesGuard` fora | `balancete.controller.ts:19` | **LACUNA REAL** |
| X07 | `TenantContextInterceptor` fora | `balancete.controller.ts:20` | **LACUNA REAL** |
| X34 | PDF "A realizar": receita e despesa pendentes trocadas | `dre-pdf.service.ts:160-161` | **LACUNA REAL (Major, AC2 do PDF)** |
| X49 | rótulo "Receitas pendentes" vira "Receitas" | `dre-pdf.service.ts:160` | **LACUNA REAL** (mesma raiz de X34) |
| X26 | rótulo "Despesas pendentes" vira "Despesas" | `dre-pdf.service.ts:161` | **LACUNA REAL** (mesma raiz) |
| X30 | série mensal chaveada por nome | `balancete-monthly.service.ts:71` | **LACUNA REAL (Major, P3 AC1)**: a spec diz que "nome não é único por congregação"; dois centros homônimos fundem as séries |
| X39 | `pending` sem o filtro de congregação | `dre.service.ts:100` | **LACUNA REAL (Minor)**: totais filtrados e "A realizar" do tenant inteiro |
| X33 | cabeçalho do PDF com as datas do período anterior | `dre-pdf.service.ts:74` | **LACUNA REAL (Minor)**: o PDF poderia declarar o período errado sem teste falhar |
| M1 | matriz lê a célula "Sem centro" por `"none"` | `DreCostCenterMatrix.tsx:39` | **LACUNA REAL (Major, P2 AC1 na tela)**: fixture com `__none__: 0` (`DreCostCenterMatrix.test.tsx:19-20`) |
| T4 | `maxAbs` sem `Math.abs` | `CostCenterTrend.tsx:136` | **LACUNA REAL (Minor)** |
| C4 | `max` só com receita | `CostCenterCharts.tsx:47` | **LACUNA REAL (Minor)**: barra de despesa passaria de 100% |
| B3 | `BalancetePanel` passa `lines` invertidas | `BalancetePanel.tsx:142` | **LACUNA REAL (Minor, P2 AC1)** |
| T1 | `MAX_MONTHS` 37 na tela | `CostCenterTrend.tsx:10` | **LACUNA REAL (Minor)**: fronteira de 37 meses só testada na API |
| R1w | só `!periodStart` (fim vazio chama a API) | `DrePdfButton.tsx:32` | **LACUNA REAL (Minor, P1-PDF AC5)** |
| R3 | `URL.revokeObjectURL` removido | `DrePdfButton.tsx` | **LACUNA REAL (Minor)**: o mock existe (`DrePdfButton.test.tsx:19`) mas nunca é afirmado; vaza o blob |
| R5 | `setError("")` removido | `DrePdfButton.tsx:36` | **LACUNA REAL (Minor)**: o erro antigo continuaria após um novo clique que dá certo |
| H7 | `loading` sem `!!start && !!end` | `useDreReport.ts:94` | **LACUNA REAL (Minor)**: com data apagada fica esqueleto no lugar de "Selecione um período" |
| H8 | `setMatrix(null)` removido do `catch` | `useDreReport.ts` (`.catch` da matriz) | **LACUNA REAL (Minor)**: erro deixa a matriz do período anterior na tela |
| X18 | rodapé "Gerado por Orbien" | `dre-pdf.service.ts:191` | indefinido pela spec |
| X19 | rótulo "Período:" do cabeçalho | `dre-pdf.service.ts:~85` | indefinido pela spec |
| X20 | rótulo "Emissão:" | `dre-pdf.service.ts:86` | indefinido pela spec |
| X35 / X27 | nome da igreja no PDF / fallback "Igreja" | `dre-pdf.service.ts` | indefinido pela spec (existe só o teste `:62` de que o PDF sai) |
| X46 | título "Demonstrativo de Resultados (DRE)" | `dre-pdf.service.ts:82` | indefinido pela spec (só o "Independent Test" cita "título") |
| X47 | rótulo "Período Anterior" | `dre-pdf.service.ts` | indefinido pela spec |
| X48 | nota "Lançamentos ainda não realizados..." | `dre-pdf.service.ts` | indefinido pela spec |
| D5 | `DeltaCell` `delta >= 0` vira `> 0` | `DrePanel.tsx:20` | indefinido pela spec (código movido de `page.tsx`, fora do AC) |
| D6 | `deltaPercent` com anterior 0 devolve 0 | `DrePanel.tsx:14` | indefinido pela spec (idem) |
| H5 | `setAccessDenied(false)` removido | `useDreReport.ts` | indefinido pela spec (só importa se o papel mudar na sessão) |
| H6 | `setMatrixDenied(false)` removido | `useDreReport.ts` | indefinido pela spec (idem) |
| M2 | `?? 0` removido da célula da matriz | `DreCostCenterMatrix.tsx:39` | **equivalente dado o contrato** (a API preenche toda chave de coluna com 0) |
| H4 | `Array.isArray` do GET de centros | `useDreReport.ts` | equivalente dado o contrato (defensivo) |
| R8 | `a.remove()` removido | `DrePdfButton.tsx` | equivalente funcional (limpeza de DOM) |
| T7 | `Math.round` na soma "Todos os centros" | `CostCenterTrend.tsx` | quase equivalente: `fmt` já arredonda a 2 casas; só difere para resíduo de 1e-17 que mudaria o rótulo para "lucro R$ 0,00" |
| H3 | `centersLoaded.current = true` removido | `useDreReport.ts:84` | equivalente na UI (só um GET a mais se a aba reativar) |
| R4 | `Blob` com `type: "text/plain"` | `DrePdfButton.tsx` | equivalente funcional (o nome vem do atributo `download`) |

Contagem: 41 = **23 lacuna real** (X01 a X07, X26, X30, X33, X34, X39, X49, M1, T4, C4, B3, T1, R1w, R3, R5, H7, H8) + **12 indefinido pela spec** (X18, X19, X20, X27, X35, X46, X47, X48, D5, D6, H5, H6) + **6 equivalente** (M2, H4, R8, T7, H3, R4).

**Result**: 49/90 novas mortas; 17/20 antigas mortas, 3 aceitas. **FAIL ❌** por 23 mutantes de lacuna real (9 gaps agrupados).

---

## Gate Check

Rodados na árvore real, branch `feat/dre-lucro-prejuizo-centros-de-custo`, HEAD `0efbd8e`.

| Comando | Saída real | Resultado |
| --- | --- | --- |
| `npm run test:unit -w orbien-backend` (inteira) | `Test Suites: 311 passed, 311 total` / `Tests: 3512 passed, 3512 total` / `EXIT 0` | ✅ |
| `npm run test -w orbien-web` (inteira) | `Test Files  144 passed (144)` / `Tests  1820 passed (1820)` / `EXIT 0` | ✅ |
| `npm run lint -w orbien-backend` | sem problemas / `EXIT 0` | ✅ |
| `npm run lint -w orbien-web` | `✖ 7 problems (0 errors, 7 warnings)` / `EXIT 0` (avisos `no-unused-vars` em `components/groups/PublicCellsMap.test.tsx`, fora do diff) | ✅ |
| `npx tsc --noEmit -p apps/web` | sem saída / `EXIT 0` | ✅ |
| `NODE_ENV=production npm run build:web` | `Tasks: 1 successful, 1 total` / `EXIT 0` | ✅ |

- Contagem: ciclo 2 API 3498 e web 1814; agora 3512 (+14) e 1820 (+6). Nenhuma queda, nenhum teste pulado.
- e2e Playwright não reexecutado (exige navegador e o fluxo todo).

---

## Banco real (`teste2-church`, Premium, `tenant_admin`; somente GET e `POST /financial/dre/export/pdf`)

API `http://localhost:3000/api` de pé (`/health` 200); web `http://localhost:3001` respondeu 307 (a UI não foi exercitada). Conta `fvargaspf+teste2@gmail.com`; o JWT traz `tenant_id fb4728c7-...`, `roles: ["tenant_admin"]`, `plan: premium`. 8 lançamentos (17/09 a 06/10/2026).

| Verificação | Resultado |
| --- | --- |
| Sem token: `GET dre`, `GET dre/by-cost-center`, `GET balancete/monthly`, `GET balancete` e `POST dre/export/pdf` | **401** nas 5 |
| Isolamento: ids de centro em matriz, série e Balancete vs `GET /financial/cost-centers` do mesmo token | nenhum id fora (`[]`); o único centro é `a50bfcae...` (Administração) |
| `GET /financial/dre/export/pdf` | 404 (a rota é só POST) |
| DRE 2026-09-01..10-31 | receita 1950, despesa 1800, `net_result` 150, `pending {0, 400}`, anterior 0 |
| Matriz | totals 1950/1800/150; Administração −1550, Sem centro de custo 1700 (por último) |
| Balancete | 1950/1800/150 |
| Série mensal | `2026-09`, `2026-10`; Administração [0, −1550]; Sem centro [900, 800] |
| Fechamento DRE = matriz = Balancete = soma da série | **150 = 150 = 150 = 150** ✅ |
| `cost_center_id=none` / UUID / UUID inexistente | 1950/250/1700 e `pending` 400; 0/1550/−1550; 0/0/0 (200) |
| `cost_center_id` `xyz`, `xnone`, `noneX`, vazio, UUID+`X`, `X`+UUID | **400** nos 6 |
| Período invertido: DRE, matriz, mensal, Balancete, PDF | **400** nos 5 |
| `congregation_id=zzz` em mensal e matriz | 400 |
| Mensal 2024-01..2026-12 (36), 2024-01..2027-01 (37), 2023-12-31..2026-12-31 | **200**, **400**, **400** |
| PDF: 5 corpos (mês, dois meses, `none`, UUID, UUID inexistente), cada um 2x | 10x **201**, `%PDF-`, `Content-Type: application/pdf`, `orbien_dre_202609.pdf` / `orbien_dre_202609_202610.pdf` |
| PDF `cost_center_id=abc` e corpo vazio | 400 e 400 |
| Snapshot `id + status + updated_at + amount + cost_center_id` dos 8 lançamentos, antes e depois dos 10 PDFs | **idêntico** (nenhum `paid` virou `confirmed`) |

Limite: `RolesGuard`/`PlanGuard` não puderam ser exercitados no banco real (uma única conta, `tenant_admin` Premium); só `JwtAuthGuard` (401). É exatamente o que o gap 1 deixa sem teste.

---

## Code Quality e achados adicionais

| Princípio | Status |
| --- | --- |
| `dre-scope.ts` único define status, recorte de centro e `round2` | ✅ |
| Isolamento multi-tenant: serviços novos usam `this.prisma.client` (RLS) e `buildScope` com `tenant_id` do token; X12, X15, X14 mortas | ✅ (mas ver gap 1: interceptor de tenant sem asserção) |
| Roles e Premium das rotas novas iguais às do DRE/Balancete (`@Roles` de `DRE_ROLES`/`BALANCETE_ROLES`, `@RequiresPlan('premium')`) | ✅ para metadado; ⚠ para o guard que o aplica |
| Sem migration, sem RLS script, sem dependência nova | ✅ |
| Nenhum teste em `doca-church` (e2e em `teste2-church`) | ✅ |
| Teste não-raso: asserções de valor (`toBe`, `toEqual`) na maior parte; **exceções**: "A realizar" do PDF por `toContain` solto (`dre-pdf.service.spec.ts:279-281`), mock de `revokeObjectURL` sem asserção | ⚠ |

Achados fora dos ACs (sem bloqueio, já vistos no ciclo 2 e ainda presentes):
- `DeltaCell` (`DrePanel.tsx:19-30`): com período anterior negativo, `((atual − anterior)/anterior)` inverte sinal e cor. Pré-existente, mas a feature destaca o prejuízo.
- `CostCenterTrend`: depois de um erro, trocar para um período já tentado não refaz a busca e não há botão de nova tentativa.
- Pastor chama diretamente `by-cost-center`, `monthly` e o PDF e recebe valores (decisão da spec: a tela não os mostra).

---

## Gaps restantes (ranqueados)

1. **Major, segurança, test-only**: nenhum teste prova que `@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)` e `@UseInterceptors(TenantContextInterceptor)` estão aplicados em `DreController` (`dre.controller.ts:21-22`) e `BalanceteController` (`balancete.controller.ts:19-20`). Os testes afirmam `@Roles` e `@RequiresPlan`, que sem os guards não fazem nada (X01 a X07 sobrevivem). Sem `APP_GUARD` global. Fix: `Reflect.getMetadata('__guards__', DreController)` `toEqual([JwtAuthGuard, RolesGuard, PlanGuard])` e `'__interceptors__'` `toEqual([TenantContextInterceptor])`, nos dois controllers (padrão em `pix.controller.spec.ts:148`).
2. **Major, P1-PDF AC2**: a linha "A realizar" do PDF só tem `toContain` solto (`dre-pdf.service.spec.ts:272-281`): trocar receita e despesa pendentes passa (X34, X49, X26). Fix: `pdfTableRows` com `['Receitas pendentes','230,50']` e `['Despesas pendentes','80,25']`.
3. **Major, P3 AC1**: série mensal chaveada por nome (`balancete-monthly.service.ts:71`, X30) funde dois centros homônimos, e a spec afirma que o nome não é único por congregação. Fix: teste com dois centros de mesmo nome e ids diferentes, esperando duas séries.
4. **Major na tela, P2 AC1**: célula da coluna "Sem centro de custo" lida por chave errada passa (M1): a fixture `DreCostCenterMatrix.test.tsx:19-20` tem `__none__: 0`. Fix: valor diferente de zero em `__none__`.
5. **Minor, gráficos e evolução**: C4 (`max` só da receita), B3 (ordem invertida no `BalancetePanel`), T4 (`maxAbs` sem `Math.abs`), T1 (fronteira de 37 meses no componente). Fix: despesa maior que receita no teste de largura; ordem afirmada no `BalancetePanel.test.tsx:26`; período só de prejuízo com altura da barra; 37 meses sem chamar a API.
6. **Minor, PDF**: X33 (datas do cabeçalho) e X39 (`pending` sem congregação). Fix: `pdfTableRows`/texto do cabeçalho com `Período: 01/12/2025 a 31/12/2025`; teste de congregação no `pending`.
7. **Minor, `DrePdfButton`**: R1w (fim vazio), R3 (`revokeObjectURL` não afirmado), R5 (erro antigo não limpo).
8. **Minor, `useDreReport`**: H7 (esqueleto eterno com data apagada), H8 (matriz velha após erro).
9. **Cosmético (aceito com justificativa)**: `<th scope="row">` na matriz, rótulo "Lançamentos sem centro", ratificação do desvio "y" (`spec.md:50`) que **depende do usuário**.

Aceitos como não-lacuna: Wn, Wj, Wg (ciclo 2) e os 12 indefinidos/6 equivalentes do ciclo 3 (tabela acima), por justificativa individual.

---

## Requirement Traceability Update

| Requisito | Estado |
| --- | --- |
| DRE-01, 03, 04, 05, 07, 09, 10, 11, 12, 15 (participação), 16, 18 | ✅ Verified |
| DRE-02 | ⚠ Verified com ressalva (X39: `pending` e congregação) |
| DRE-06 | ⚠ Needs Fix (gap 2: "A realizar" do PDF; gap 6: cabeçalho) |
| DRE-08 | ⚠ Verified com ressalva (R1w, R3, R5) |
| DRE-13 | ⚠ Needs Fix (gap 4, M1, na tela) |
| DRE-14 | ⚠ Verified com ressalva (M1) |
| DRE-15 (barras) | ⚠ Verified com ressalva (C4, B3) |
| DRE-17 | ⚠ Needs Fix (gap 3, X30) |
| Rotas novas: guards e interceptor | ⚠ Needs Fix (gap 1) |

---

## Summary

**Overall**: ❌ Not Ready (sem defeito funcional encontrado no código e no banco real; faltam testes que discriminem). Ciclo 3 de 3: escalar ao usuário.

**Gaps do ciclo 2**: 1 a 6 FECHADAS; 7 ACEITA (cosmético; ratificação pendente do usuário).
**Spec-anchored check**: 27/27 ACs com asserção localizada; 18 ✅, 9 ⚠, 0 ❌.
**Sensor**: antigos 17 mortos e 3 sobrevivem (Wn, Wj, Wg: aceitos); novas 90 (49 mortas, 41 sobreviveram: 23 lacuna real, 12 indefinido pela spec, 6 equivalente).
**Gate**: API 311 suítes/3512 testes, web 144 arquivos/1820 testes, lint 0 erros nos dois, `tsc` limpo, `build:web` ok.
**Banco real**: DRE = matriz = Balancete = série = 150,00; 401 sem token nas 5 rotas; nenhum id de centro de outro tenant; PDF 10x sem alterar lançamento; 400s e limite de 36 meses conforme a spec.

---

## Adendo pós-ciclo 3 (autor, NÃO re-verificado)

O limite de 3 ciclos do Verifier foi atingido com FAIL por lacunas de teste (zero defeito funcional).
Por decisão do dono do produto ("fechar tudo antes do PR"), as 23 lacunas reais do ciclo 3 foram fechadas
só com testes — nenhuma linha de produção mudou (`git diff` das fontes de produção contra `fd3246e` é vazio).
Cada uma foi conferida pelo autor reaplicando o mutante e vendo o teste novo falhar; isso **não** substitui um
Verifier independente, e este arquivo continua registrando o veredito dele (FAIL, ciclo 3).

| Lacuna | Teste novo | Mutante reaplicado |
| --- | --- | --- |
| X01–X07 guards/interceptor dos 2 controllers | `dre.controller.spec.ts`, `balancete.controller.spec.ts` (`__guards__`, `__interceptors__`) | 7/7 mortos |
| X34, X49, X26 "A realizar" no PDF | `dre-pdf.service.spec.ts` (linhas `Receitas/Despesas pendentes` com valor) | 3/3 mortos |
| X33 cabeçalho do PDF | `dre-pdf.service.spec.ts` (`Período: 01/01/2026 a 31/01/2026`) | morto |
| X30 série por nome | `balancete-monthly.service.spec.ts` (dois centros homônimos) | morto |
| X39 pendente sem congregação | `dre.service.spec.ts` (3 consultas com a mesma congregação) | morto |
| M1 célula "Sem centro" | `DreCostCenterMatrix.test.tsx` (`__none__` ≠ 0) | morto |
| T4, T1 evolução | `CostCenterTrend.test.tsx` (módulo do maior mês; 37 meses) | 2/2 mortos |
| C4 escala dos gráficos | `CostCenterCharts.test.tsx` (despesa maior que receita) | morto |
| B3 ordem no Balancete | `BalancetePanel.test.tsx` (gráfico = ordem da tabela) | morto |
| R1w, R3, R5 botão do PDF | `DrePdfButton.test.tsx` | 3/3 mortos |
| H7, H8 `useDreReport` | `DrePanel.test.tsx`, `DreCostCenterMatrix.test.tsx` | 2/2 mortos |

Gates após o adendo: API 311 suítes / 3518 testes; web 144 arquivos / 1830 testes; lint sem erros; `tsc` limpo.
Seguem abertos (cosméticos, declarados): primeira coluna da matriz como `<td>` em vez de `<th scope="row">`;
rótulo "Lançamentos sem centro". O desvio dos gráficos em HTML (em vez de `recharts`) foi **ratificado** pelo dono do produto.
