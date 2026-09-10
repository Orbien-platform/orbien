# Mapa do monorepo e portão de cobertura do mobile — Specification

## Problem Statement

`apps/mobile` entrou no monorepo em 2026-09-08 e, em três dias, virou o app com
mais entrega recente — 9 dos 12 requisitos do `app-mobile/spec.md` verificados,
39 suítes, 239 testes. Nada disso chegou aos documentos que descrevem o
repositório: o `README.md` da raiz ainda lista **três** apps, o `CLAUDE.md` e o
`docs/MONOREPO.md` listam **quatro**, e o `docs/ROADMAP.md:52` afirma
literalmente que *"não existe `apps/mobile` no monorepo"*. Quem lê o mapa hoje
toma decisão sobre um repositório que não é este.

O mesmo desencontro existe dentro da própria feature: `app-mobile/spec.md`
marca MOB-04 a MOB-07 como ✅ Verified (e o `validation.md` traz o veredito de
cada rodada), enquanto o `app-mobile/tasks.md` mantém as rodadas 2, 3 e 4 como
**In Progress**. Duas fontes, duas respostas, nenhuma indicação de qual vale.

E o mobile é o único dos cinco apps **sem nenhum portão de cobertura**: o
`jest.config.js` não tem `coverageThreshold`, não existe script `test:cov`, e o
`ci.yml` mede cobertura de api/web/site/admin e não do mobile. É exatamente o
ponto cego que o próprio `docs/TESTES.md:64` documenta ter acontecido com
`src/platform/` na API — "nasceu depois das fases, não entrou em nenhuma
entrada da lista, e ficou abaixo de 100% sem reprovar nada".

## Goals

- [ ] Todo documento que enumera os apps do monorepo diz **cinco**: `api`,
      `site`, `web`, `admin`, `mobile` — com o mesmo papel e o mesmo destino de
      deploy em todos eles.
- [ ] `spec.md`, `tasks.md` e `validation.md` do `app-mobile` concordam sobre o
      estado de cada requisito MOB-NN, com a evidência que sustenta o estado.
- [ ] `apps/mobile` tem portão de cobertura equivalente ao dos outros quatro
      apps: `coverageThreshold` travado, script `test:cov`, e passo próprio no
      `ci.yml` — código novo sem teste reprova o CI.
- [ ] `docs/TESTES.md` descreve o estado real do plano de testes, incluindo o
      mobile e o que a Fase 13 de fato entregou no web.

## Out of Scope

| Feature | Reason |
|---|---|
| Subir o web a `global: 100` (fechar a Fase 13 de verdade) | Decisão do usuário nesta rodada: só corrigir o documento. Cobrir os ramos que faltam em `celebrations`/`groups`/`persons`/`repertorio`/`volunteers` é trabalho próprio e misturaria duas frentes num PR só. |
| Levar o mobile a 100% nas quatro métricas | Decisão do usuário: o alvo é **piso medido**, o mesmo mecanismo do `apps/admin`. Escrever teste novo para os ~101 ramos que faltam é feature própria. |
| Bloco 2 do levantamento (`ORBIEN_API_URL` do profile `production`, app id do OneSignal, `DEPLOY.md` do mobile) | Bloqueadores de go-live do mobile, não portões de CI. Ordem de execução acordada: portões primeiro. |
| Bloco 3 em diante (conformidade LGPD, `/termos`, `/privacidade`, gating por plano) | Ciclos posteriores na ordem acordada. |
| Criar fase de cobertura para `apps/admin` no `docs/TESTES.md` | O admin já tem threshold travado (99/98/100/100) e passo no CI; a ausência de "fase" é histórica e não deixa buraco de portão. Registrar isso é parte de MAP-10, criar a fase não é. |
| Corrigir o texto de qualquer AC do `app-mobile` cuja divergência não tenha veredito escrito no `validation.md` | Homogeneizar é fazer os documentos concordarem com o que já foi verificado — não revisar decisão de produto. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| O que "mesma cobertura de testes em mobile" significa | **Piso medido**, como o `apps/admin`: travar o threshold no número que o mobile alcança hoje e aplicar "o piso nunca desce" | Resposta explícita do usuário quando apresentadas as três leituras possíveis (global 100 / piso medido / 100 com exceções). Fecha o buraco do portão sem escrever teste novo. | **y** |
| O que fazer com a Fase 13 (web em `global: 0`) | Só corrigir o documento: reescrever a Fase 13 em `docs/TESTES.md` para dizer que o web fecha por piso por caminho, não por `global: 100` | Resposta explícita do usuário. Mantém a rodada focada. | **y** |
| Valor do piso do mobile | Piso **inteiro para baixo** do medido: `statements 94`, `branches 84`, `functions 93`, `lines 97` | Medido em 2026-09-10 com `collectCoverageFrom` sobre `src/**`: 94,51 / 84,69 / 93,81 / 97,94. Arredondar para baixo é o que o `apps/admin` fez (99/98/100/100) e dá margem para variação de instrumentação sem afrouxar o portão. | n — decisão técnica, sinalizada |
| Denominador da cobertura do mobile | `collectCoverageFrom: src/**/*.{ts,tsx}`, excluindo `*.test.*` e `*.d.ts` | Sem `collectCoverageFrom`, o Jest só mede arquivos que algum teste importou — um arquivo novo **sem nenhum teste** não entraria na conta e o portão não o veria. É o mesmo ponto cego que a lista por caminho teve com `src/platform/`. `apps/api` usa `collectCoverageFrom` explícito e os três fronts usam `include: ["src/**"]`. | n — alinha o mobile ao que os outros quatro já fazem |
| Exclusões de cobertura do mobile | Só `*.test.{ts,tsx}` e `*.d.ts` — nenhuma outra | `docs/TESTES.md:87` manda a lista de exclusões ser curta e cada linha ter justificativa registrada. O mobile não tem análogo de `main.ts` (o entrypoint é o Expo Router, e as telas são testadas). | n |
| `app.config.js` e `jest.setup.js` na conta | Fora — a cobertura mede `src/`, como nos outros quatro apps | `docs/TESTES.md:82`: "A meta é sobre `src/`". O `app.config.js` já tem teste próprio (`app.config.test.js`, MOB-12/T7) que continua rodando no `npm run test`. | n |
| Estado real de MOB-04 a MOB-07 | **Verified** — o `spec.md` está certo e o `tasks.md` está desatualizado | Verificado na codebase, não assumido: `validation.md` traz veredito de cada rodada (Round 3/MOB-04+05 "✅ Ready" com Fix 1 resolvido em `4cec930`; Rodada 3/MOB-06 "✅ Ready"; Rodada 4/MOB-07 "✅ Ready" após Fix 1 em `0568697`), e os arquivos de implementação existem. Ver AC de MAP-05. | **y** (evidência no repo) |
| Rótulo duplicado "Round 3" no `validation.md` | Corrigir a numeração, mantendo o texto dos vereditos intacto | Há duas seções numeradas 3 (`:207` "Round 3 (MOB-04, MOB-05)" e `:361` "Rodada 3 (MOB-06)"). Renumerar é o mínimo para o documento poder ser citado sem ambiguidade. Nenhum veredito muda. | n |
| Papel do `docs/ROADMAP.md` sobre a decisão "Mobile" | A decisão de produto listada como em aberto ("retomar a Fase 7 ou assumir o `apps/web`") foi **tomada** — o `app-mobile/spec.md` registra "foi confirmada agora" | O ROADMAP é explícito sobre ser o documento de direção; deixar como "em aberto" uma decisão já executada é o mesmo defeito que a linha 52. | n |
| README da raiz diz "Docker no Render" | Corrigir para runtime Node | `CLAUDE.md` da raiz: "O serviço da API no Render usa **runtime Node**, não Docker". O README e o `docs/MONOREPO.md` contradizem a fonte de verdade declarada. Está dentro de "ajustar o mapa" porque é a mesma tabela de apps. | n |

**Open questions:** nenhuma — as duas decisões de rumo foram respondidas pelo
usuário e o resto está registrado acima como assunção com justificativa.

---

## User Stories

### P1: O mapa do monorepo diz cinco apps ⭐ MVP

**User Story**: Como dev (ou agente) que abre este repositório pela primeira
vez, quero que todo documento que lista os apps liste os mesmos cinco, para não
tomar decisão sobre um repositório que não existe mais.

**Why P1**: É o pedido literal do usuário e a origem de todo o resto — os
outros documentos derivam deste mapa.

**Acceptance Criteria**:

1. WHEN alguém lê `README.md`, `CLAUDE.md` (raiz) ou `docs/MONOREPO.md` THEN
   cada um SHALL listar os cinco apps (`api`, `site`, `web`, `admin`,
   `mobile`), cada um com package name, stack e destino de deploy.
2. WHEN alguém lê `docs/ROADMAP.md` THEN o documento SHALL NOT afirmar que
   `apps/mobile` não existe, e SHALL registrar o mobile na tabela "O que já foi
   entregue" com o estado verificado dos requisitos MOB-NN.
3. WHEN alguém lê a seção "Ciclos seguintes" de `docs/ROADMAP.md` THEN o item
   "Mobile" SHALL refletir que a decisão foi tomada e executada (v1 Starter
   entregue), e o que resta dele SHALL aparecer como o que de fato resta
   (MOB-10, e o white-label Premium do item 3).
4. WHEN `README.md` ou `docs/MONOREPO.md` descrevem o deploy da API THEN
   SHALL dizer runtime Node no Render, não imagem Docker — alinhado ao
   `CLAUDE.md` da raiz e ao `DEPLOY.md`.
5. WHEN alguém lê `docs/CI.md` THEN o documento SHALL descrever os jobs que o
   `ci.yml` realmente tem, incluindo o `mobile-eas-build` e a cobertura do
   mobile.

**Independent Test**: `grep -ri "quatro apps\|três\b.*apps\|os 4 apps" README.md
CLAUDE.md docs/` não volta nada, e cada um dos cinco documentos cita
`apps/mobile`.

---

### P1: Um requisito MOB-NN tem um estado só ⭐ MVP

**User Story**: Como quem retoma a feature `app-mobile`, quero que `spec.md`,
`tasks.md` e `validation.md` concordem sobre o que está pronto, para não
reimplementar o que já passou pelo Verifier nem dar por pronto o que não passou.

**Why P1**: Pedido explícito do usuário, e é pré-condição para qualquer rodada
futura do mobile — inclusive MOB-10.

**Acceptance Criteria**:

1. WHEN o `spec.md` marca um requisito MOB-NN como ✅ Verified THEN o bloco
   correspondente em `tasks.md` SHALL estar marcado como Done, com o veredito
   do `validation.md` citado por seção.
2. WHEN um estado é ajustado THEN o ajuste SHALL ser sustentado por evidência
   verificada na codebase (arquivo de implementação + veredito no
   `validation.md`), nunca por inferência a partir do outro documento.
3. WHEN as notas de execução do `spec.md` dizem "não marcar Verified aqui"
   (Fase 1/2 e Fase 3/4) THEN essas notas SHALL ser marcadas como cumpridas ou
   removidas, porque a condição que descrevem (Verifier ainda não rodou) já não
   vale.
4. WHEN duas seções do `validation.md` carregam o mesmo número de rodada THEN a
   numeração SHALL ser corrigida sem alterar o texto de nenhum veredito.
5. WHEN o `validation.md` registra uma divergência entre a redação de um AC e o
   comportamento decidido e implementado (MOB-06 AC2, "visíveis para os
   segmentos de audiência") THEN o `spec.md` SHALL passar a descrever o
   comportamento confirmado, citando a decisão de origem.

**Independent Test**: para cada MOB-NN marcado Verified no `spec.md`, existe no
`tasks.md` um bloco Done e no `validation.md` um veredito — e nenhum bloco de
`tasks.md` fica em In Progress.

---

### P1: O mobile tem portão de cobertura como os outros quatro ⭐ MVP

**User Story**: Como quem revisa PR do mobile, quero que código novo sem teste
reprove o CI no mobile do mesmo jeito que reprova nos outros apps, para o app
que mais cresce não ser o único sem rede.

**Why P1**: É o "Bloco 1 — portões" que o usuário mandou executar, e o único
item desta rodada que muda comportamento de CI.

**Acceptance Criteria**:

1. WHEN `npm run test:cov -w orbien-mobile` roda THEN SHALL medir cobertura
   sobre todo `src/**/*.{ts,tsx}` — inclusive arquivo que nenhum teste importa —
   excluindo apenas `*.test.{ts,tsx}` e `*.d.ts`.
2. WHEN a cobertura do mobile fica abaixo do piso (`statements 94`,
   `branches 84`, `functions 93`, `lines 97`) THEN o comando SHALL sair com
   código diferente de zero.
3. WHEN a cobertura está no piso ou acima THEN o comando SHALL sair com código
   zero — o piso é o número medido hoje, então o estado atual do repositório
   passa sem escrever teste novo.
4. WHEN o job "Unidade e cobertura" do `ci.yml` roda THEN SHALL executar um
   passo de cobertura do mobile, ao lado dos quatro que já existem.
5. WHEN um passo ou comentário do `ci.yml` se refere ao conjunto de apps THEN
   SHALL dizer cinco, não quatro.
6. WHEN o piso é registrado THEN o `jest.config.js` SHALL trazer, em
   comentário, de onde o número saiu (data da medição e regra "o piso nunca
   desce"), no mesmo formato que `apps/api/jest.config.js` e
   `apps/admin/vitest.config.ts` já usam.

**Independent Test**: `npm run test:cov -w orbien-mobile` passa no estado atual;
subir qualquer threshold em 1 ponto faz o mesmo comando falhar.

---

### P2: O plano de testes descreve o plano que existe

**User Story**: Como quem usa `docs/TESTES.md` como fonte da verdade entre
sessões, quero que o quadro de fases inclua o mobile e que a Fase 13 diga o que
de fato entregou, para o documento não prometer o que o `vitest.config.ts` não
faz.

**Why P2**: Não muda portão nenhum — é o registro do que os ACs acima
produziram. Mas sem ele o documento volta a divergir na próxima sessão.

**Acceptance Criteria**:

1. WHEN alguém lê o quadro "Estado" de `docs/TESTES.md` THEN SHALL encontrar
   uma linha para o mobile, com escopo e estado.
2. WHEN alguém lê a tabela de cobertura medida THEN SHALL encontrar a linha do
   mobile com os números medidos e a data da medição.
3. WHEN alguém lê a seção da Fase 13 THEN o texto SHALL dizer que o web fecha
   por piso por caminho (e por quê), em vez de prometer `global: 100` que o
   `vitest.config.ts` não trava — e SHALL registrar que subir o web a
   `global: 100` continua em aberto, como trabalho próprio.
4. WHEN a seção "Exclusões" é lida THEN as exclusões de cobertura do mobile
   SHALL estar registradas ali com a justificativa, como a própria seção exige.

**Independent Test**: `grep -c mobile docs/TESTES.md` > 0, e a seção da Fase 13
não contém promessa de `global: 100` no web sem a ressalva do que falta.

---

## Edge Cases

- WHEN o `collectCoverageFrom` novo passa a incluir arquivo que nenhum teste
  importava THEN a cobertura medida SHALL cair em relação ao número
  "só arquivos importados" — e o piso SHALL ser calibrado sobre a medição
  **com** `collectCoverageFrom`, não sobre a anterior. (Medido: 94,51/84,69/
  93,81/97,94 com; 94,67/85,40/93,83/98,00 sem.)
- WHEN um arquivo do mobile é só re-export ou só tipo (`src/lib/theme/icons.ts`,
  os `types.ts`) THEN ele SHALL continuar aparecendo com 0% sem derrubar o
  total, porque não tem statement executável — nenhuma exclusão nova é
  necessária para acomodá-lo.
- WHEN o passo de cobertura do mobile roda no CI, na mesma máquina que o
  Postgres da suíte de integração THEN o `testTimeout: 60000` já calibrado no
  `jest.config.js` SHALL continuar valendo — a mudança não pode reduzi-lo.
- WHEN um documento cita um número de cobertura THEN SHALL citar junto a data
  da medição, porque o número envelhece e o documento não.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| MAP-01 | P1: Mapa — `README.md` e `docs/MONOREPO.md` com 5 apps + Render Node | Tasks | Pending |
| MAP-02 | P1: Mapa — `CLAUDE.md` da raiz com 5 apps | Tasks | Pending |
| MAP-03 | P1: Mapa — `docs/ROADMAP.md` sem a negação do mobile, com entrega e ciclos atualizados | Tasks | Pending |
| MAP-04 | P1: Mapa — `docs/CI.md` descrevendo os jobs reais, mobile incluído | Tasks | Pending |
| MAP-05 | P1: Homogeneidade — `app-mobile/tasks.md` rodadas 2-4 Done com evidência | Tasks | Pending |
| MAP-06 | P1: Homogeneidade — notas obsoletas do `spec.md`, AC2 de MOB-06 e numeração do `validation.md` | Tasks | Pending |
| MAP-07 | P1: Portão — `collectCoverageFrom` + `coverageThreshold` no `jest.config.js` do mobile | Tasks | Pending |
| MAP-08 | P1: Portão — script `test:cov` em `apps/mobile/package.json` | Tasks | Pending |
| MAP-09 | P1: Portão — passo de cobertura do mobile no `ci.yml` e "5 apps" | Tasks | Pending |
| MAP-10 | P2: `docs/TESTES.md` — linha do mobile, números medidos, exclusões e Fase 13 honesta | Tasks | Pending |

**ID format:** `MAP-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 10 total, 10 mapeados para tarefas, 0 sem mapeamento.

---

## Success Criteria

- [ ] Nenhum documento do repositório afirma um número de apps diferente de cinco.
- [ ] Nenhum bloco de `app-mobile/tasks.md` fica em In Progress enquanto o
      `spec.md` diz Verified.
- [ ] `npm run test:cov -w orbien-mobile` passa no estado atual e falha se
      qualquer threshold subir 1 ponto.
- [ ] O CI mede cobertura dos cinco apps.
- [ ] `docs/TESTES.md` não promete nada que um arquivo de config não trave.
