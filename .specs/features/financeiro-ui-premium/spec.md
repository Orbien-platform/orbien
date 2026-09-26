# Financeiro — telas que faltam para os recursos já prometidos em /precos

## Problem Statement

A página `/precos` (apps/site) promete, no bloco "Financeiro e contabilidade",
quatro recursos: dashboard semanal (ambos planos), DRE/fluxo de caixa/forecast,
exportação contábil OFX/SPED e carnê do dizimista para IR (os três últimos
Premium). Auditoria do backend (`apps/api`) confirma que os quatro existem,
testados e corretamente restritos por plano via `PlanGuard` +
`@RequiresPlan('premium')`. O gap é no `apps/web`: forecast, OFX/SPED e carnê
do dizimista não têm nenhuma tela — o tesoureiro não consegue acioná-los pelo
produto, só chamando a API direto. O dashboard semanal tem tela, mas ela
recalcula os números no cliente em vez de consumir o endpoint dedicado
`GET /financial/dashboard/weekly`, que já existe sem gate de plano.

## Goals

- [ ] Toda funcionalidade que a página de preços promete em "Financeiro e
      contabilidade" é acionável dentro do `apps/web`, sem precisar de
      chamada direta à API.
- [ ] A tela de "Visão Geral" do financeiro consome o endpoint dedicado do
      dashboard semanal em vez de recalcular os números a partir da lista de
      transações.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Geração em lote do carnê do dizimista (1 PDF por doador de uma vez) | `docs/PLANO.md` PROD-08 já documenta como próximo passo deliberadamente fora desta entrega; não está na promessa da página de preços, que fala em "carnê do dizimista", singular, por pessoa |
| Tela de "recibo automático por email" (lista de `DonationReceiptsController.findAll`/`download`) | Linha separada da tabela de preços ("Doações e PIX"), fora do bloco "Financeiro e contabilidade" que esta spec cobre |
| Mudar o gating de plano em si (`PlanGuard`, `@RequiresPlan`) | Já está correto e testado; esta spec só fecha lacuna de UI |
| "Fluxo de caixa" como tela/endpoint dedicado | Não existe como feature separada no backend — DRE e Balancete já cobrem esse território; não inventar endpoint novo para isto |
| Tela de conciliação bancária de itens não-OFX (ex.: revisão manual linha a linha do extrato importado) | `findUnmatched` existe; a spec cobre upload + lista de não-conciliados, não um fluxo completo de reconciliação manual assistida |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Onde entram as novas telas | Dentro de `apps/web/src/app/(admin)/financeiro/page.tsx`, como novas abas (`forecast`, `exportar`, `carne-dizimista`) e componentes em `apps/web/src/components/financial/`, seguindo o padrão de abas/estado já usado (DRE, Balancete) | É a única tela do produto para tesouraria; três novos módulos soltos fragmentariam a navegação que já existe | n |
| 403 em rota Premium | Reusa `NoAccessState` (mesmo componente e mensagem genérica já usados em `GroupGenealogyTree`/`redes` para 403 de papel ou de plano) | É o padrão já estabelecido no repo: `isForbidden` não distingue "sem papel" de "sem plano", e as telas existentes tratam os dois com o mesmo componente | n |
| UI para jobs assíncronos (SPED, ZIP) | Poll de `GET /financial/export/jobs/:id` a cada 2s até `status !== 'pending' \| 'processing'`, então baixar via `download_url` do `GET /financial/export/jobs/:id/download`; ZIP fica fora do escopo da UI (não está na página de preços) — só SPED precisa desse fluxo na tela nova | OFX e CSV/PDF já são síncronos (`StreamableFile` direto); só SPED, entre os recursos prometidos, é assíncrono | n |
| Import de OFX (conciliação bancária) entra nesta rodada? | Sim — está sob o mesmo Premium gate e é o par direto da exportação OFX que a página promete ("Exportação contábil (OFX, SPED)" implica o ciclo completo de conciliação); sem ele a tela de export ficaria pela metade | — decisão do usuário na pergunta de escopo: "construir as 3 telas que faltam" | y (aprovado na pergunta de escopo) |
| Dashboard semanal: migrar para o endpoint dedicado | Sim, conforme decisão explícita do usuário | Evita que os dois caminhos (cálculo client-side vs. endpoint) continuem divergindo | y |

**Open questions:** nenhuma — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Dashboard semanal consome o endpoint dedicado ⭐ MVP

**User Story**: Como tesoureiro (Starter ou Premium), quero que a Visão Geral
do financeiro mostre os mesmos números que o backend já calcula em
`GET /financial/dashboard/weekly`, para não ver dado divergente entre o que a
API expõe e o que a tela mostra.

**Why P1**: É a correção de menor risco (endpoint já existe, sem gate) e
remove uma duplicação de lógica que só vai piorar com o tempo.

**Acceptance Criteria**:

1. WHEN a aba "Visão Geral" carrega THEN o sistema SHALL chamar
   `GET /financial/dashboard/weekly` e usar sua resposta (`weekly`,
   `vs_last_month_pct`, `top_income_categories`, `average_per_contributor`,
   `tithe_active_count`) para os cartões e o gráfico, em vez de recalcular a
   partir de `/financial/transactions`.
2. WHEN a requisição falha com 403 THEN o sistema SHALL mostrar
   `NoAccessState` no lugar do card/gráfico, do mesmo jeito que a aba
   "Lançamentos" já trata hoje.
3. WHEN a requisição está em curso THEN o sistema SHALL mostrar o mesmo
   padrão de `Skeleton` já usado nos KPIs e no gráfico.
4. WHEN o endpoint responde com 8 semanas (`weekly`, incluindo semanas sem
   lançamento, com `income`/`expense`/`net` zerados) THEN o gráfico de barras
   SHALL plotar as 8, na ordem cronológica que a API já devolve.

**Independent Test**: acessar `/financeiro`, aba Visão Geral, e confirmar
(via network tab) que só `GET /financial/dashboard/weekly` alimenta o card de
KPIs e o gráfico — sem chamada a `/financial/transactions` para esse fim.

---

### P2: Forecast financeiro tem tela (Premium)

**User Story**: Como tesoureiro em tenant Premium, quero ver a projeção de
receita dos próximos meses (o "forecast" que a página de preços promete), com
base em `GET /financial/dashboard/forecast/:months`, para planejar sem
precisar calcular fora do sistema.

**Why P1 vs P2**: P2 porque depende de decidir onde a tela mora (optou-se por
substituir o card "Receitas vs período anterior" da Visão Geral, hoje
alimentado por um cálculo aproximado feito a partir do DRE).

**Acceptance Criteria**:

1. WHEN o tenant é Premium e a aba Visão Geral carrega THEN o sistema SHALL
   chamar `GET /financial/dashboard/forecast/:months` (padrão `months=6`) e
   substituir o card "Receitas vs período anterior" — hoje calculado a partir
   de `dre.previous_period` — por um gráfico com `historical` (meses
   passados, `total`) e `projected` (meses futuros, `projected`), deixando
   claro visualmente qual parte é histórico e qual é projeção.
2. WHEN o usuário troca o horizonte entre 3, 6 e 12 meses THEN o sistema
   SHALL rechamar o endpoint com o novo valor e atualizar o gráfico.
3. WHEN o tenant é Starter (resposta 403) THEN o sistema SHALL mostrar
   `NoAccessState` no lugar do card de forecast — a Visão Geral do Starter
   continua sem esse card, sem quebrar o restante da página.
4. WHEN `months_of_history` vier menor que o solicitado (poucos meses de
   dados) THEN a tela SHALL renderizar normalmente com os meses disponíveis,
   sem erro — o cálculo de médias já trata isso no backend.

**Independent Test**: em tenant Premium, alternar 3/6/12 meses no card de
forecast e ver o gráfico mudar; em tenant Starter, confirmar que o card vira
`NoAccessState` sem quebrar o resto da Visão Geral.

---

### P3: Exportação contábil completa (OFX, SPED) + importação de OFX (Premium)

**User Story**: Como tesoureiro em tenant Premium, quero baixar o extrato em
OFX e o arquivo SPED pela tela de Financeiro, e também importar um extrato
OFX do banco para conciliação, exatamente como a página de preços promete em
"Exportação contábil (OFX, SPED)".

**Why P3**: Maior superfície (2 export síncronos/assíncronos + fluxo de
upload+lista), depende de decidir o padrão de polling do job SPED.

**Acceptance Criteria**:

1. WHEN o tesoureiro está na aba DRE (onde `ExportButton` já vive) THEN o
   sistema SHALL oferecer um botão "OFX" ao lado de CSV/PDF, que chama
   `POST /financial/export/ofx` com o mesmo período selecionado e baixa o
   arquivo (`StreamableFile`, resposta síncrona) com nome
   `extrato-{start}-{end}.ofx`.
2. WHEN o tesoureiro aciona a exportação SPED THEN o sistema SHALL chamar
   `POST /financial/export/sped`, receber `{ job_id, status }`, fazer poll em
   `GET /financial/export/jobs/:id` a cada 2s até `status` sair de
   `pending`/`processing`, e ao chegar em `done` obter a URL via
   `GET /financial/export/jobs/:id/download` e disparar o download
   automaticamente; ao chegar em `error` SHALL mostrar mensagem de erro com
   `job.error_message`.
3. WHEN o tesoureiro abre uma nova tela/seção "Importar extrato" THEN o
   sistema SHALL permitir selecionar um arquivo `.ofx` (limite 10MB, mesmo do
   backend) e enviá-lo via `POST /financial/import/ofx` (`multipart/form-data`,
   campo `file`), mostrando o resultado retornado pelo `OfxImportService`.
4. WHEN a importação terminar THEN a mesma tela SHALL listar as transações
   não conciliadas via `GET /financial/import/ofx/unmatched`, para o
   tesoureiro ver o que precisa de ação manual.
5. WHEN qualquer uma dessas rotas responde 403 (tenant Starter) THEN a seção
   inteira (export OFX/SPED e import) SHALL virar `NoAccessState`, sem
   remover CSV/PDF, que continuam disponíveis nos dois planos conforme já
   funcionam hoje.

**Independent Test**: em tenant Premium, baixar um OFX (download imediato),
disparar um SPED e ver o botão em estado "processando" até o download
disparar sozinho, depois subir um arquivo `.ofx` de teste e ver a lista de
não conciliados atualizar.

---

### P4: Carnê do dizimista / relatório anual para IR (Premium)

**User Story**: Como tesoureiro em tenant Premium, quero ver a lista de
dizimistas de um ano e baixar o carnê em PDF de cada um, para atender ao
pedido de comprovante de IR sem sair do sistema.

**Why P4**: Menor superfície das quatro, mas depende das três anteriores
estarem no lugar (mesma aba/seção de financeiro).

**Acceptance Criteria**:

1. WHEN o tesoureiro abre a seção "Carnê do dizimista" THEN o sistema SHALL
   chamar `GET /financial/donation-receipts/annual/summary?year=` (padrão:
   ano corrente) e listar `person_name`, `total`, `count` por doador,
   ordenado como a API já devolve (maior total primeiro).
2. WHEN o tesoureiro troca o ano THEN o sistema SHALL rechamar o endpoint com
   o novo `year`.
3. WHEN o tesoureiro clica em "Baixar carnê" de um doador da lista THEN o
   sistema SHALL chamar `GET /financial/donation-receipts/annual/:personId?year=`
   e baixar o PDF (`StreamableFile`) com nome `carne-dizimista-{year}.pdf`.
4. WHEN a lista vier vazia para o ano selecionado THEN o sistema SHALL
   mostrar estado vazio explícito ("Nenhum doador identificado neste ano"),
   não uma tabela em branco sem contexto.
5. WHEN o tenant é Starter (403) THEN a seção inteira SHALL virar
   `NoAccessState`.

**Independent Test**: selecionar um ano com doações de teste em
`teste1-church`/`teste2-church`, ver a lista de doadores, baixar o PDF de um
deles e confirmar o nome do arquivo e o conteúdo básico (nome do doador,
total, ano).

---

## Edge Cases

- WHEN o usuário troca de aba/seção no meio de um polling de job SPED THEN o
  sistema SHALL cancelar o polling (não vazar `setInterval`/`setTimeout` ao
  desmontar o componente).
- WHEN o upload de OFX falhar (arquivo inválido, > 10MB, erro do parser)
  THEN o sistema SHALL mostrar a mensagem de erro sem travar a tela, seguindo
  o padrão de `try/catch` + mensagem que `ExportButton` já usa.
- WHEN `donor_person_id` remonta a uma pessoa removida/anônima (não deveria
  acontecer, mas a query já filtra `is_anonymous: false` e
  `donor_person_id: { not: null }` no backend) THEN a tela não precisa de
  tratamento adicional — o backend já garante a lista só com doadores
  identificados.
- WHEN o usuário é `pastor` (papel só leitura em Financeiro, ver
  `isPastor` na página atual, que já esconde valores/edição) THEN as novas
  seções (forecast, export, carnê) seguem a mesma regra de papéis que os
  controllers já aplicam (`DASHBOARD_ROLES`, `EXPORT_ROLES`,
  `PRODUCT_AREA_READ_ROLES.financial`) — não inventar regra de UI adicional
  além do que a API já retorna/nega.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| FIN-01 | P1: Dashboard semanal | Design | Pending |
| FIN-02 | P1: Dashboard semanal — 403 | Design | Pending |
| FIN-03 | P2: Forecast — card + horizonte | Design | Pending |
| FIN-04 | P2: Forecast — 403 Starter | Design | Pending |
| FIN-05 | P3: Export OFX síncrono | Design | Pending |
| FIN-06 | P3: Export SPED assíncrono (poll + download) | Design | Pending |
| FIN-07 | P3: Import OFX (upload) | Design | Pending |
| FIN-08 | P3: Import OFX (lista não conciliados) | Design | Pending |
| FIN-09 | P3: 403 Starter (seção inteira) | Design | Pending |
| FIN-10 | P4: Carnê — lista de doadores por ano | Design | Pending |
| FIN-11 | P4: Carnê — download do PDF | Design | Pending |
| FIN-12 | P4: Carnê — 403 Starter | Design | Pending |

**Coverage:** 12 total, 12 a mapear em tasks, 0 sem cobertura.

---

## Success Criteria

- [ ] As quatro linhas de "Financeiro e contabilidade" na página de preços
      correspondem a uma tela real e acionável dentro do `apps/web`, sem
      necessidade de chamar a API diretamente.
- [ ] `GET /financial/dashboard/weekly` é a única fonte dos números da Visão
      Geral do dashboard semanal (zero cálculo client-side equivalente
      remanescente).
- [ ] `npm run lint -w orbien-web` e os testes de componente novos/alterados
      passam.
