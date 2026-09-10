# Mapa do monorepo e portão de cobertura do mobile — Validation

**Date**: 2026-09-10
**Spec**: `.specs/features/mapa-monorepo-e-portoes/spec.md`
**Diff range**: `7b5607b~1..HEAD` na branch `claude/avaliar-docs-pendencias-plano-ewcn9p`
(11 commits: `7b5607b` planejamento + `42f1801`..`fdcf14e` execução; 14 arquivos).
Durante a verificação o implementador commitou `79684c5` (bookkeeping de status
em `mapa-monorepo-e-portoes/{spec.md,tasks.md}`) — o conteúdo é idêntico ao diff
não-commitado que eu já havia inspecionado, e não toca nenhuma evidência abaixo.
**Verifier**: sub-agente independente (autor ≠ verificador), read-only sobre a árvore real.
Todas as mutações rodaram em `/tmp/.../scratchpad` via `jest --config` com `rootDir`
absoluto — nenhum arquivo do repositório foi alterado, nenhum `git stash`.

**Veredito: ❌ FAIL** — o portão de cobertura (a única frente que muda
comportamento) está **integralmente correto e discriminante**; a frente de
documentação deixa passar 2 gaps materiais, sendo um deles a falha do
**Independent Test que a própria spec escreveu** para a story P1 do mapa.

---

## Task Completion

| Task | Status | Notas |
|---|---|---|
| T1 `README.md` | ✅ Done | 5 apps, package name, stack, deploy; Render runtime Node |
| T2 `docs/MONOREPO.md` | ⚠️ Partial | 5 apps e deploy corretos, mas **sem package name por app** — ver Gap 6 |
| T3 `CLAUDE.md` | ✅ Done | 1 linha acrescentada à tabela; diff só adiciona |
| T4 `docs/ROADMAP.md` | ✅ Done | Negação removida; entrega + bloqueadores conferidos contra `eas.json`/`app.config.js` |
| T5 `docs/CI.md` | ⚠️ Partial | `mobile-eas-build` e cobertura descritos e corretos; afirmação sobre `pre-push.sh` ficou falsa — Gap 3 |
| T6 `app-mobile/tasks.md` + `validation.md` | ✅ Done | 0 blocos In Progress; nenhum veredito alterado |
| T7 `app-mobile/spec.md` | ✅ Done | Notas vencidas removidas; AC2 de MOB-06 confere com o código |
| T8 `jest.config.js` + `package.json` | ✅ Done | Provado nas duas direções pelo sensor |
| T9 `ci.yml` | ✅ Done | YAML válido, 5 passos, comando literalmente idêntico |
| T10 `docs/TESTES.md` | ❌ Incompleto | Fase 15 e Fase 13 reescritas corretamente, mas o cabeçalho e o bloco final do documento continuam contradizendo-as — Gaps 1 e 2 |

---

## Spec-Anchored Acceptance Criteria

### P1: O mapa do monorepo diz cinco apps

| Criterion | Outcome definido pela spec | `file:line` + evidência | Result |
|---|---|---|---|
| AC1 — `README.md`, `CLAUDE.md`, `docs/MONOREPO.md` listam 5 apps com package name, stack e deploy | Os três documentos, cada app com os **três** atributos | `README.md:9-13` (`api/…(orbien-backend)` … `mobile/ Expo + React Native → EAS Build (iOS/Android) (orbien-mobile)`); `CLAUDE.md:13` (`\| apps/mobile \| orbien-mobile \| Expo (SDK 57) + React Native, Expo Router \| EAS Build (iOS/Android) \|`); `docs/MONOREPO.md:5,18-23,90-97` — 5 apps, stack e deploy presentes, **package name ausente** (`orbien-api`/`orbien-site`/`orbien-web` em `:5` e `:104` são os **repositórios antigos**, não package names — o package da API é `orbien-backend`) | ⚠️ Partial |
| AC2 — `docs/ROADMAP.md` não nega o mobile e o registra em "O que já foi entregue" com estado MOB-NN | Negação ausente + linha na tabela com o estado verificado | `docs/ROADMAP.md:37` — linha "App mobile (Fase 7, ADR-004/ADR-005) \| **Entregue na variante Starter** … Verificados: MOB-01/02 … MOB-08 … MOB-09 … MOB-11/12. Falta MOB-10". Bate 1:1 com `.specs/features/app-mobile/spec.md:334-345`. `grep -n "não existe .apps/mobile" docs/ROADMAP.md` → vazio | ✅ PASS |
| AC3 — "Ciclos seguintes" item Mobile reflete decisão tomada/executada; o que resta aparece como o que resta | Item riscado + MOB-10 e white-label Premium como o restante | `docs/ROADMAP.md:136-138` (`~~**Mobile:** retomar a Fase 7…~~ **Decidido e executado**`); `:145-149` item 3 white-label reescrito; `:87-88` MOB-10 nomeado | ✅ PASS |
| AC4 — `README.md`/`docs/MONOREPO.md` dizem runtime Node no Render | Runtime Node, não imagem Docker | `README.md:82` (`\| apps/api \| Render, **runtime Node** \|`) e `:88-89` (ressalva do Dockerfile); `docs/MONOREPO.md:10` (`roda no **Render**, em runtime Node`) e `:24-29`. Verificado no disco: `render.yaml` existe **na raiz** e `apps/api/render.yaml` **não existe** — a correção do caminho no README é factualmente certa | ✅ PASS |
| AC5 — `docs/CI.md` descreve os jobs reais, `mobile-eas-build` e a cobertura do mobile | Descrição fiel ao `ci.yml` | `docs/CI.md:339-352` (Fase 6) — conferido contra `.github/workflows/ci.yml:308-312` (`needs: [build, unit]`, `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`) e `:325-340` (gate por `git diff --quiet … -- apps/mobile`). `docs/CI.md:354-364` descreve os 5 passos; bate com `ci.yml:118-131`. "os outros cinco continuam sendo o portão real" confere: 6 jobs no total (`build`, `unit`, `rls`, `smoke-site`, `e2e`, `mobile-eas-build`) | ✅ PASS |

**Independent Test da spec** (`spec.md:101-103`):
`grep -ri "quatro apps\|três\b.*apps\|os 4 apps" README.md CLAUDE.md docs/` **deve voltar vazio**.

```
docs/TESTES.md:3:Meta declarada: **100% de cobertura nos quatro apps** (...)
docs/TESTES.md:1147:O que **falta** para a meta de 100% nos quatro apps, que era a redação
```

→ **❌ FALHA.** Dois hits, ambos em `docs/`, ambos no arquivo que T10 editou.
Cada um dos cinco documentos cita `apps/mobile` (README 4, CLAUDE 1, MONOREPO 6,
ROADMAP 2, CI 2, TESTES 4) — a segunda metade do teste passa; a primeira não.

---

### P1: Um requisito MOB-NN tem um estado só

| Criterion | Outcome definido pela spec | `file:line` + evidência | Result |
|---|---|---|---|
| AC1 — MOB-NN ✅ Verified no `spec.md` ⇒ bloco Done no `tasks.md` citando o veredito por seção | Done + veredito citado | `.specs/features/app-mobile/tasks.md:805-809` ("✅ Done — Verifier … **✅ Ready** … `4cec930` … Ver `validation.md`, seção \"Rodada 2 (MOB-04, MOB-05)\""); `:1202-1206` (Rodada 3/MOB-06); `:1441-1447` (Rodada 4/MOB-07, `0568697`). Seções citadas existem: `validation.md:207`, `:361`, `:534` | ✅ PASS |
| AC2 — o ajuste é sustentado por evidência na codebase, nunca por inferência entre documentos | Arquivo de implementação + veredito | Re-derivado por mim, não aceito do implementador: MOB-04/05 → `apps/mobile/src/lib/escala/escala-client.ts:9,22,36,41,56` (`getMyAssignments`, `respondToAssignment`, `checkIn`, `getUnavailability`, `saveUnavailability`) + `apps/mobile/src/app/indisponibilidade.tsx`; MOB-06 → `apps/mobile/src/lib/content/content-client.ts:12,24` + `apps/mobile/src/app/(tabs)/conteudo.tsx` + `src/app/post/[id].tsx`; MOB-07 → `apps/mobile/src/lib/notifications/onesignal-client.ts:38` (`OneSignal.login(payload.sub)`), `:39` (`addTags`), `:73` (listener de `click`) e `src/lib/notifications/notifications-provider.tsx:24-25` (`router.push(\`/post/${postId}\`)`) | ✅ PASS |
| AC3 — notas "não marcar Verified aqui" marcadas como cumpridas ou removidas | Condição vencida não pode seguir como instrução | `.specs/features/app-mobile/spec.md:355-360` — as duas notas foram substituídas por "**Nota (Fases 1-5 do Execute) — cumprida.**", que explica por que saíram | ✅ PASS |
| AC4 — numeração duplicada corrigida sem alterar veredito | Números distintos, texto intacto | `git diff 7b5607b~1..HEAD -- .specs/features/app-mobile/validation.md` = **2 linhas**, ambas de título (`:1` → "Rodada 1", `:207` "Round 3 (MOB-04, MOB-05)" → "Rodada 2"). Headings resultantes: `:1` Rodada 1, `:207` Rodada 2, `:361` Rodada 3, `:534` Rodada 4 — sequência única e cronológica. **Nenhum texto de veredito, evidência ou `file:line` alterado** | ✅ PASS |
| AC5 — divergência de MOB-06 AC2 corrigida no `spec.md`, citando a decisão de origem | `spec.md` passa a descrever listagem **sem** filtro por segmento | `.specs/features/app-mobile/spec.md:172-186` — "publicados da congregação do usuário — **sem** filtrar por segmento de audiência" + citação do `design.md` ("Achado importante — segmentação de audiência não filtra a listagem"). **Confirmado contra o código**: `apps/mobile/src/lib/content/content-client.ts:12` `getPosts(page?, limit?)` — nenhum parâmetro nem query de segmento | ✅ PASS |

**Independent Test da spec**: `grep -n "Status\*\*: In Progress" .specs/features/app-mobile/tasks.md` → **vazio**.
Tabela de traceability (`app-mobile/spec.md:334-345`): 11 × `✅ Verified` + MOB-10 `Pending`
— **bate exatamente** com a linha de Coverage reescrita (`:351-352`: "12 total, **11 verificadas**
… 1 pendente (MOB-10)"). Coerência interna ✅. MOB-10 continua Pending ✅.

---

### P1: O mobile tem portão de cobertura como os outros quatro

| Criterion | Outcome definido pela spec | `file:line` + evidência | Result |
|---|---|---|---|
| AC1 — mede todo `src/**/*.{ts,tsx}`, **inclusive arquivo que nenhum teste importa**, excluindo só `*.test.*` e `*.d.ts` | Denominador = todos os fontes de `src/` | `apps/mobile/jest.config.js:33-37`. **Re-derivado**: 56 arquivos `src/**/*.{ts,tsx}` não-teste no disco vs. **56 registros `SF:` no `lcov.info`** — cobertura 56/56, zero omissões. E o mutante M3 prova o "inclusive arquivo que nenhum teste importa": 6 arquivos (`src/lib/{auth,celebracoes,content,escala,pequenos-grupos,theme}/types.ts`) **desaparecem** da medição quando `collectCoverageFrom` é removido | ✅ PASS |
| AC2 — abaixo do piso (94/84/93/97) ⇒ exit ≠ 0 | Exit code diferente de zero | Sensor M1 e M2 (abaixo): exit **1** em ambos, com a mensagem `Jest: "global" coverage threshold for … not met` | ✅ PASS |
| AC3 — no piso ou acima ⇒ exit 0, sem teste novo | Exit 0 no estado atual | `npm run test:cov -w orbien-mobile` → **EXIT=0**, 39 suítes / 239 testes, 94.51 / 84.69 / 93.81 / 97.94 | ✅ PASS |
| AC4 — job "Unidade e cobertura" executa um passo de cobertura do mobile ao lado dos quatro | 5 passos, mobile incluído | `.github/workflows/ci.yml:130-131` — `- name: Cobertura do mobile` / `run: npm run test:cov -w orbien-mobile`, imediatamente após `Cobertura do admin` (`:127-128`). Comando **literalmente idêntico** ao provado. Passos de cobertura no job: `:118,121,124,127,130` = **5** | ✅ PASS |
| AC5 — rótulo/comentário que se refere ao conjunto de apps diz cinco | "5 apps" nos rótulos | `ci.yml:44` `- name: Build dos 5 apps`; `ci.yml:100` `- name: Suítes de unidade dos 5 apps`; comentário `:109-116` reescrito e factualmente correto (API/site em `global: 100`, admin 99/98/100/100, mobile 94/84/93/97, web em `global: 0` + pisos por caminho) | ✅ PASS |
| AC6 — comentário registra origem do número (data + "o piso nunca desce"), no formato de `apps/api`/`apps/admin` | Data, números medidos, regra | `apps/mobile/jest.config.js:41-52` — "Piso medido em **2026-09-10** … 94,51 statements / 84,69 branches / 93,81 functions / 97,94 lines, com 39 suítes e 239 testes … **O piso nunca desce.**" Números **conferem com a medição real, dígito a dígito** | ✅ PASS |

**Independent Test da spec**: passa hoje ✅ (exit 0); subir threshold em 1+ ponto faz falhar ✅
(M1/M2). **Preservações exigidas**: `testTimeout: 60000` intacto em `jest.config.js:64` ✅;
bloco `transformIgnorePatterns` (`:11-13`) e `transform` do `lucide-react-native` (`:18-21`)
intactos ✅.

---

### P2: O plano de testes descreve o plano que existe

| Criterion | Outcome definido pela spec | `file:line` + evidência | Result |
|---|---|---|---|
| AC1 — quadro "Estado" tem linha do mobile com escopo e estado | Linha presente | `docs/TESTES.md:34` — `\| 15 \| mobile — portão de cobertura \| src/** (telas, lib, componentes) \| 39 suítes \| ☑ \|`, mais a nota `:40-46` explicando que nasceu depois do plano (mesmo tratamento da Fase 14) | ✅ PASS |
| AC2 — tabela de cobertura medida tem a linha do mobile com números e data | Números + data | `docs/TESTES.md:65-69` — "E o mobile, **medido em 2026-09-10**" + `\| mobile \| 94,51% \| 84,69% \| 93,81% \| 97,94% \| 39 (239 testes) \|`. **Confere com a medição real** | ✅ PASS |
| AC3 — seção da Fase 13 diz que o web fecha por piso por caminho (e por quê) em vez de prometer `global: 100`, **e** registra que subir o web a `global: 100` segue em aberto | A **seção** inteira coerente | Metade cumprida: `docs/TESTES.md:963-999` faz exatamente isso (admin como decisão, web como pendência, os dois caminhos, a decisão do usuário datada) e `:948-950` corrige o quadro. **Mas a mesma seção da Fase 13 termina em `:1147-1158` com um bloco não tocado que a contradiz frontalmente** — ver Gap 2 | ⚠️ Partial |
| AC4 — seção "Exclusões" registra as exclusões do mobile com justificativa | Linha + justificativa | `docs/TESTES.md:109` (`\| apps/mobile/src/**/*.test.{ts,tsx} \| o teste é o instrumento, não o medido … \|`), `:108` (`**/*.d.ts` já existia e cobre o mobile) e `:111-114` (por que não há análogo de `main.ts`, por que `app.config.js` fica fora) | ✅ PASS |

**Independent Test da spec**: `grep -c mobile docs/TESTES.md` = 4 > 0 ✅.
A seção da Fase 13 não contém promessa de `global: 100` no web ✅ — mas contém
afirmação **factualmente falsa** sobre o estado do web e do admin (Gap 2).

---

**Status agregado**: 18/20 ACs ✅ · 2 ⚠️ Partial · 1 Independent Test de story ❌ falhando.

---

## Discrimination Sensor

A feature não escreve código de produção; a lógica verificável é o **portão de
cobertura**. Cópia descartável: `apps/mobile/jest.config.js` copiado para
`/tmp/.../scratchpad/jest.<tag>.js`, com `rootDir` absoluto apontando para
`apps/mobile` e `coverageDirectory` redirecionado para `/tmp` — a árvore real
nunca foi escrita. Execução: `npx jest --config <tmp> --coverage --passWithNoTests`.

| # | Mutação | `file:line` | Exit | Cobertura medida | Killed? |
|---|---|---|---|---|---|
| 0 | Controle (config real, sem mutação) | `apps/mobile/jest.config.js:54` | **0** | 94.51 / 84.69 / 93.81 / 97.94 · 39 suítes / 239 testes | — (baseline) |
| 1 | `branches: 84` → `86` | `apps/mobile/jest.config.js:54` | **1** | idem — `Jest: "global" coverage threshold for branches (86%) not met: 84.69%` | ✅ **Killed** |
| 2 | `functions: 93` → `95` | `apps/mobile/jest.config.js:54` | **1** | idem — `Jest: "global" coverage threshold for functions (95%) not met: 93.81%` | ✅ **Killed** |
| 3 | Remoção integral do `collectCoverageFrom` | `apps/mobile/jest.config.js:33-37` | **0** | **94.67 / 85.40 / 93.83 / 98.00** | ✅ **Justificativa confirmada** (ver abaixo) |

**Sensor depth**: lightweight (3 mutações, proporcional a uma feature sem código de produção).
**Result**: **2/2 mutações de threshold mortas** + a mutação estrutural confirma a
justificativa central da spec. O portão **discrimina exatamente o que a spec diz que discrimina**.

### Mutação 3 — a justificativa do `collectCoverageFrom`, confirmada com número

Sem `collectCoverageFrom` a cobertura medida **sobe** em todas as quatro métricas:

| | statements | branches | functions | lines | arquivos medidos |
|---|---|---|---|---|---|
| **Com** `collectCoverageFrom` | 94.51% (913/966) | 84.69% (559/660) | 93.81% (273/291) | 97.94% (856/874) | **56** |
| **Sem** | 94.67% (942/995) | 85.40% (591/692) | 93.83% (274/292) | 98.00% (885/903) | **52** |

Isto reproduz **dígito a dígito** o par que o Edge Case da spec registra
(`spec.md:208-209`: "94,51/84,69/93,81/97,94 com; 94,67/85,40/93,83/98,00 sem").
**Confirmado, não refutado.**

O que o número significa para o portão — diff dos conjuntos de arquivos dos dois
`lcov.info`:

- Só medidos **com** `collectCoverageFrom` (invisíveis sem ele): `src/lib/auth/types.ts`,
  `src/lib/celebracoes/types.ts`, `src/lib/content/types.ts`, `src/lib/escala/types.ts`,
  `src/lib/pequenos-grupos/types.ts`, `src/lib/theme/types.ts`.
- Só medidos **sem**: `app.config.js`, `assets/splash-icon.png`.

Ou seja: sem o campo, o Jest mede **menos fontes de `src/`** e ainda assim um número
**maior** — precisamente o ponto cego que a spec descreve. Um arquivo novo de `src/`
que nenhum teste importe ficaria **fora do denominador**, a porcentagem não se moveria
e o piso não o veria. Com o campo, os 56 fontes entram sempre. A afirmação da spec
está **empiricamente correta**.

---

## Edge Cases

- [x] **EC1 — a cobertura com `collectCoverageFrom` é a mais baixa, e o piso foi calibrado sobre ela.**
      Confirmado pelo sensor M3 (tabela acima) e pelo threshold em `jest.config.js:54`,
      que é o inteiro para baixo da coluna "com" (94/84/93/97), não da "sem" (que
      permitiria 94/85/93/98).
- [x] **EC2 — arquivo só re-export ou só tipo continua em 0% sem derrubar o total.**
      Confirmado no `lcov.info`: 7 arquivos com `LF=0 LH=0` — os 6 `types.ts` acima
      **mais** `src/lib/theme/icons.ts`, exatamente os nomeados na spec. Sem statement
      executável, contribuem 0/0 e não movem o total. Nenhuma exclusão nova foi criada ✅.
- [x] **EC3 — `testTimeout: 60000` não pode ser reduzido.** `apps/mobile/jest.config.js:64`
      — `testTimeout: 60000`, com o comentário original (`:56-63`) intacto. `git diff` do
      arquivo não toca a linha.
- [ ] **EC4 — todo número de cobertura citado vem com a data da medição.** ⚠️ **Parcial.**
      Cumprido onde a feature escreveu o número do mobile de forma primária
      (`jest.config.js:41`, `docs/TESTES.md:65`, `docs/TESTES.md:950`). **Não** cumprido nos
      números novos escritos sem data: `.github/workflows/ci.yml:114-115` ("Admin
      (99/98/100/100) e mobile (94/84/93/97)") e `docs/TESTES.md:948` ("a Fase 14 travou
      piso medido (99/98/100/100)"). São pisos de config, não medições — leitura defensável —
      mas a Edge Case está escrita sem essa distinção. Ver Gap 7.

---

## Gate Check

| Gate | Comando | Exit | Resultado |
|---|---|---|---|
| Cobertura (mobile) | `npm run test:cov -w orbien-mobile` (da raiz) | **0** | 39 suítes / 239 testes passando; 94.51 / 84.69 / 93.81 / 97.94 |
| YAML do CI | `python3 -c "import yaml;yaml.safe_load(open('.github/workflows/ci.yml'))"` | **0** | Válido; 6 jobs; **5** passos de cobertura; o do mobile roda **exatamente** `npm run test:cov -w orbien-mobile` |
| Lint | `npx turbo run lint` | **0** | 5/5 workspaces successful, **0 errors** (76 warnings pré-existentes em `orbien-mobile`, nenhum introduzido por este range) |

**Integridade de testes** — `git diff 7b5607b~1..HEAD -- '*.test.ts' '*.test.tsx' '*.spec.ts' '*.spec.tsx'`
→ **saída vazia**. Nenhum teste alterado, removido ou enfraquecido no range.
Contagem antes = contagem depois = **39 suítes / 239 testes**. Delta 0, como a
feature declara (ela trava piso, não escreve teste). Nenhum teste skipado.

**Números documentados × números reais**: batem em todos os pontos —
`spec.md:57` e `:208`, `apps/mobile/jest.config.js:41-42`, `docs/TESTES.md:69`,
`docs/TESTES.md:920-928`, `docs/ROADMAP.md:37`. **Nenhuma divergência numérica.**

**Escopo intocado**: `git diff --name-only 7b5607b~1..HEAD` = 14 arquivos, **nenhum**
sob `docs/produto/` — a pasta declarada fora de escopo pela spec ficou de fato intacta ✅.
Nenhum arquivo de produção de `apps/*/src/` foi tocado ✅.

---

## Code Quality

| Princípio | Status |
|---|---|
| Nenhuma funcionalidade além do pedido | ✅ |
| Sem abstração para uso único | ✅ (a config reusa o formato de `apps/api`/`apps/admin`) |
| Sem "flexibilidade" desnecessária | ✅ |
| Só arquivos necessários tocados | ✅ (14, todos no escopo declarado) |
| Não "melhorou" código não relacionado | ✅ (nenhum `src/` tocado) |
| Segue padrões existentes | ✅ (`collectCoverageFrom` + `coverageReporters: ["text-summary","lcov"]` idênticos a `apps/api/jest.config.js`; piso medido idêntico ao mecanismo de `apps/admin/vitest.config.ts`) |
| Spec-anchored outcome check | ⚠️ 2 ACs parciais |
| Cobertura por camada (matriz de `tasks.md`) | ✅ prova nas duas direções executada e reproduzida por mim |
| Nenhum teste sem requisito | ✅ (nenhum teste criado) |
| Diretrizes documentadas seguidas | ✅ `CLAUDE.md` (raiz), `docs/TESTES.md` §"Exclusões", `apps/mobile/AGENTS.md` |

**Um ponto para registro, não gap**: `test:cov` usa `--passWithNoTests`, no
mesmo formato dos outros workspaces. Não afrouxa o portão — com
`collectCoverageFrom` ativo, um repositório sem testes mediria 0% e o
`coverageThreshold` reprovaria mesmo assim.

---

## Gaps (ranqueados)

### Gap 1 — MAJOR · `docs/TESTES.md:3` e `:1147` ainda dizem "quatro apps"

O Independent Test que a **própria spec** define para a story P1 do mapa
(`spec.md:101-103`) falha, e falha dentro do arquivo que T10 editou:

```
docs/TESTES.md:3    Meta declarada: **100% de cobertura nos quatro apps** (`statements`, `branches`,
docs/TESTES.md:1147 O que **falta** para a meta de 100% nos quatro apps, que era a redação
```

Viola também o Success Criterion nº 1 (`spec.md:248`: "Nenhum documento do
repositório afirma um número de apps diferente de cinco"). O documento agora
tem uma Fase 15 para o mobile, uma tabela de cobertura do mobile e uma seção
sobre os cinco passos de CI — e abre declarando quatro.

**Fix**: `docs/TESTES.md:3` → "cinco apps"; `:1147` → "cinco apps" (e ver Gap 2,
que é a mesma frase).

### Gap 2 — MAJOR · `docs/TESTES.md:1147-1158` contradiz a Fase 13 reescrita, dentro da mesma seção

O bloco final da seção da Fase 13 não foi tocado por T10 e agora afirma o
oposto do que `:960-999` estabelece:

```
1147  O que **falta** para a meta de 100% nos quatro apps, que era a redação
1148  original desta checklist:
1150  npm run test:cov -w orbien-web       # hoje 68,5% — falta a Fase 10
1151  npm run test:cov -w orbien-admin     # hoje 1,5%  — não há fase que o cubra
1156  A linha do admin foi mantida aqui como registro, não como cobrança: sem uma
1157  fase que produza esses testes, exigir 100% dele nesta checklist era pedir o
1158  resultado sem o trabalho.
```

Contra o que o mesmo documento agora diz:

- `:964-965` — "O motivo original caiu: **a Fase 10 fechou**, `src/app/**` está em 100"
  ⇒ `:1150` "falta a Fase 10" é **falso**.
- `:948` e `:962-968` — "A Fase 14 cobriu o console inteiro e travou o piso medido
  (99/98/100/100)" ⇒ `:1151` "não há fase que o cubra" e `:1156-1158` "sem uma fase
  que produza esses testes" são **falsos**; a Fase 14 está no quadro em `:33`.
- O `1,5%` do admin é a medição de **2026-09-05** apresentada como estado de hoje,
  sem data — o que a EC4 da spec proíbe.

É exatamente o defeito que o AC3 de P2 existe para eliminar ("o documento não
prometer o que o `vitest.config.ts` não faz"): a correção foi escrita em um
lugar da seção e a versão antiga sobreviveu no outro.

**Fix**: reescrever `:1147-1158` para apontar para "1. Thresholds" (`:945-999`)
como fonte única, ou removê-lo — com a data em qualquer número que permanecer.

### Gap 3 — MINOR · `docs/CI.md:431` afirma algo falso sobre `scripts/pre-push.sh`

```
docs/CI.md:431         Ele roda o que o CI rodaria — build dos 5 apps, tipos da API ...
scripts/pre-push.sh:107  npx turbo run build ... && passa "build dos 4 apps" \
```

T9 renomeou o step do `ci.yml`, T5 propagou o "5" para o `CI.md` — mas o script
que o `CI.md` está descrevendo continua imprimindo "build dos 4 apps" no
terminal do dev. O documento passou a descrever errado a ferramenta que ele
documenta. (O `turbo run build` cobre de fato os 5 workspaces; o defeito é só
o rótulo.)

**Fix**: `scripts/pre-push.sh:107` → `passa "build dos 5 apps"`.

### Gap 4 — MINOR · `apps/mobile/README.md:134` cita um step de CI que já não se chama assim

```
apps/mobile/README.md:134  Roda em todo PR pelo step "Build dos 4 apps" (`turbo run build`) ...
```

Referência cruzada **por nome** ao step renomeado em `.github/workflows/ci.yml:44`
para `Build dos 5 apps`. Quem procurar "Build dos 4 apps" no workflow não acha
mais. `apps/mobile/README.md` não está no range do diff — a varredura por
referências quebradas não chegou a ele.

**Fix**: `apps/mobile/README.md:134` → `"Build dos 5 apps"`.

### Gap 5 — MINOR · `docs/MONOREPO.md` não traz package name por app (AC1)

O AC1 exige os **três** atributos por app nos três documentos. `README.md:9-13`
e `CLAUDE.md:9-13` trazem os três; `docs/MONOREPO.md` traz stack e deploy
(`:5,18-23,90-97`) mas nenhum package name — e os `orbien-api`/`orbien-site`/
`orbien-web` de `:5` e `:104` são os **repositórios antigos**, não packages
(o package da API é `orbien-backend`), o que torna a leitura ativamente
enganosa para quem procurar ali o nome do workspace.

Origem: o `Done when` de T2 (`tasks.md:132-141`) não repetiu a exigência de
package name que o AC1 faz — a tarefa foi cumprida como escrita, a AC não.

**Fix**: acrescentar os package names na narrativa de `docs/MONOREPO.md`, ou
apontar explicitamente a tabela do `CLAUDE.md`/`README.md` como a canônica.

### Gap 6 — COSMETIC · `docs/ROADMAP.md:59` aponta "acima" para uma seção que está abaixo

`:59` diz "O que sobrou dela está em \"O que falta no mobile\", **acima**" — mas
a seção `## O que falta no mobile` começa em `:74`, depois. (A outra referência,
em `:148`, não usa direção e está correta.)

**Fix**: `docs/ROADMAP.md:59` → "abaixo".

### Gap 7 — COSMETIC / ⚠️ spec-precision · EC4 sem outcome preciso

A Edge Case `spec.md:217-218` ("WHEN um documento cita um número de cobertura
THEN SHALL citar junto a data da medição") não distingue **medição** de **piso
travado em config**. Sob a leitura literal, `.github/workflows/ci.yml:114-115`
e `docs/TESTES.md:948` a violam; sob a leitura razoável (piso de config não
envelhece do mesmo jeito), não. Marcado como ⚠️ em vez de aprovado vago.

**Fix**: precisar a Edge Case na spec, ou datar os dois pontos.

### Informativo (fora do escopo declarado, sem fix proposto)

- `DEPLOY.md:3` — "deploy dos **quatro** apps". Coerente com o próprio escopo
  do arquivo (não cobre mobile) e o `README.md:91-93` já declara isso
  explicitamente. Só entra em conflito com a leitura literal do Success
  Criterion nº 1.
- `docs/PENDENCIAS.md:19` ("lint nos 3 apps") e `:583` ("Três apps, portão
  verde") — registro histórico de pendência fechada, datado por contexto.
- `.specs/features/app-mobile/{spec.md:33,378, tasks.md:103}` — "os outros três
  apps", texto de spec histórica anterior ao `apps/admin`, fora do range.

---

## Requirement Traceability Update

| Requirement | Previous | New |
|---|---|---|
| MAP-01 | Implementing | ⚠️ **Needs Fix** — AC1 parcial em `docs/MONOREPO.md` (Gap 5); README ✅ |
| MAP-02 | Implementing | ✅ **Verified** |
| MAP-03 | Implementing | ✅ **Verified** (com Gap 6 cosmético) |
| MAP-04 | Implementing | ⚠️ **Needs Fix** — Gap 3 (`docs/CI.md:431` × `pre-push.sh:107`) |
| MAP-05 | Implementing | ✅ **Verified** |
| MAP-06 | Implementing | ✅ **Verified** |
| MAP-07 | Implementing | ✅ **Verified** — sensor 2/2 mortos, denominador 56/56 |
| MAP-08 | Implementing | ✅ **Verified** |
| MAP-09 | Implementing | ✅ **Verified** |
| MAP-10 | Implementing | ❌ **Needs Fix** — Gaps 1 e 2 |

Fora da tabela, aberto pela varredura: `apps/mobile/README.md:134` (Gap 4).

---

## Summary

**Overall**: ❌ **Not Ready** — 2 gaps materiais na frente de documentação.

**Spec-anchored check**: 18/20 ACs com evidência `file:line` batendo o outcome da
spec · 2 ⚠️ parciais · 1 Independent Test de story falhando (P1 mapa).
**Sensor**: 2/2 mutações de threshold mortas; mutação estrutural confirma a
justificativa do `collectCoverageFrom` com número (94,51 → 94,67, 56 → 52 arquivos).
**Gate**: cobertura exit 0 (239/239), YAML exit 0 (5 passos), lint exit 0 (0 erros).
**Integridade**: nenhum teste tocado; nenhum número documentado divergente do medido.

**O que funciona** — e funciona bem:

- O portão de cobertura do mobile é **real e discriminante**. Não é "passa hoje":
  provado nas duas direções por mim, independentemente, em cópia descartável.
- O denominador cobre **56/56** fontes de `src/`, e a remoção do
  `collectCoverageFrom` prova empiricamente que 6 arquivos sumiriam da conta sem ele.
- Todo número documentado (spec, `jest.config.js`, `TESTES.md`, `ROADMAP.md`)
  bate com a medição real, dígito a dígito.
- A homogeneização do `app-mobile` está **integralmente correta**: 0 blocos In
  Progress, traceability coerente com a linha de Coverage, MOB-04..MOB-07
  confirmados **na codebase** (não nos documentos), e o `validation.md` teve
  exatamente 2 linhas de título alteradas — nenhum veredito, evidência ou
  `file:line` tocado.
- Os bloqueadores de go-live listados no ROADMAP conferem com `eas.json` (profile
  `production` sem `ORBIEN_API_URL`) e `app.config.js:17` (`REPLACE_WITH_ONESIGNAL_APP_ID`).

**O que reprova**: a feature cuja tese é "todo documento diz cinco" deixa a
declaração de abertura de `docs/TESTES.md` dizendo quatro, e reescreve a Fase 13
em um lugar sem apagar a versão antiga no outro — o mesmo tipo de divergência
entre duas fontes que a feature existe para eliminar.

**Next steps**: Gaps 1 e 2 (ambos em `docs/TESTES.md`) são bloqueantes e fecham
numa edição só. Gaps 3, 4 e 5 são de uma linha cada. Gaps 6 e 7 são opcionais.
Nenhum toca o portão de cobertura — MAP-07/08/09 podem ser dados por fechados
como estão.
