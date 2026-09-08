# Conexão Setlist ↔ Repertório — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/setlist-repertorio-conexao/design.md`
**Status**: Done — T1-T10 concluídas, Verifier independente com veredito PASS

---

## Test Coverage Matrix

> Gerada do codebase, das diretrizes do projeto e da spec — confirmar antes do Execute.
> Diretrizes encontradas: `CLAUDE.md` (raiz), `docs/TESTES.md`, `apps/api/jest.config.js`,
> `apps/web/vitest.config.ts`, `apps/web/playwright.config.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| Serviço da API (`apps/api/src/celebrations/*.service.ts`) | unit | **100% statements/branches/functions/lines** — é o `coverageThreshold.global` do `jest.config.js`, não uma meta minha; além disso 1:1 com os ACs da spec e todo edge case listado | `apps/api/src/**/*.spec.ts` (ao lado do fonte) | `npm run test -w orbien-backend` |
| Helper do web (`apps/web/src/lib/**`) | unit | **100% nas quatro métricas** — threshold por caminho em `vitest.config.ts` | `apps/web/src/lib/*.test.ts` | `npm run test -w orbien-web` |
| Componente de celebrações (`apps/web/src/components/celebrations/**`) | unit | Piso vigente: 99 statements / 95 branches / 100 functions / 100 lines. **O piso nunca desce** (`vitest.config.ts`) | `apps/web/src/components/celebrations/*.test.tsx` | `npm run test -w orbien-web` |
| Componente de repertório (`apps/web/src/components/repertorio/**`) | unit | Sem threshold por caminho no `vitest.config.ts` (ponto cego — ver Alerta de portão abaixo). Alvo aplicado: **todo AC da spec + todo estado listado** (carregando, vazio, sem resultado, erro), no mesmo nível do irmão `celebrations/**` | `apps/web/src/components/repertorio/*.test.tsx` | `npm run test -w orbien-web` |
| Fluxo de tela ponta a ponta | e2e | Caminho feliz + cadastro inline + vincular avulsa | `apps/web/e2e/*.spec.ts` | `npm run e2e -w orbien-web` |
| DTO / schema / module | none | Portão de build e lint | — | `npm run build:api && npm run lint` |

> O jest da API tem três projects (`unit`, `integration`, `rls`) com `testMatch` distintos.
> `unit` é `<rootDir>/src/**/*.spec.ts` — teste da API vai **ao lado do fonte**, não em `test/`.
> Nenhuma tarefa aqui cria tabela, então `test:rls` não entra no portão (nada novo a isolar).

### Alerta de portão (decisão do usuário pendente — não corrigir por conta própria)

`apps/web/vitest.config.ts` lista thresholds por caminho para `celebrations/`,
`content/`, `financial/`, `groups/`, `persons/`, `volunteers/` — mas **não** para
`components/repertorio/`. O `SongCatalogPanel.tsx` (465 linhas) já está fora da
conta hoje, e o `SongPicker` desta feature nasceria fora também. É o mesmo ponto
cego que o cabeçalho do `apps/api/jest.config.js` documenta ter acontecido com
`src/platform/` ("nasceu depois das fases 1-6, não entrou em nenhuma entrada da
lista, e ficou dois DTOs abaixo de 100% sem reprovar nada"). Os testes das tarefas
T5/T6 são escritos no nível alvo de qualquer forma.

**Decisão do usuário (antes do Execute): corrigir junto.** A entrada
`"src/components/repertorio/**"` é adicionada às thresholds do
`vitest.config.ts` em **T6**, depois que os testes de T5/T6 existem — o piso
é o que eles efetivamente alcançarem, e daí em diante nunca desce (regra do
próprio arquivo). Não é correção unilateral: foi apresentada como achado com
evidência e escolhida.

## Gate Check Commands

> Gerada do codebase — confirmar antes do Execute. Sempre a partir da raiz.

| Gate Level | When to Use | Command |
|---|---|---|
| Quick (API) | Após tarefa de serviço da API | `npm run test -w orbien-backend` |
| Quick (Web) | Após tarefa de lib/componente do web | `npm run test -w orbien-web` |
| Full | Após tarefa com e2e | `npm run test -w orbien-web && npm run e2e -w orbien-web` |
| Build | Fechamento de fase da API / da feature | `npm run build:api && npm run build:web && npm run lint && npm run test` |
| Cobertura (portão real) | Antes de declarar a fase da API concluída | `npm run test:cov -w orbien-backend` (global 100) e `npm run test:cov -w orbien-web` (thresholds por caminho) |

---

## Execution Plan

Fases ordenadas, sequenciais; tarefas dentro da fase executam em ordem.

### Phase 1: API — persistência do vínculo e contrato de leitura

```
T1 → T2 → T3
```

### Phase 2: Web — base compartilhada

```
T4
```

### Phase 3: Web — seletor de catálogo

```
T5 → T6
```

### Phase 4: Web — integração na ordem de culto

```
T7 → T8 → T9
```

### Phase 5: Verificação ponta a ponta

```
T10
```

---

## Task Breakdown

### T1: Persistir `song_id` no `update` de `SetlistSongsService`

> **✅ Concluída** — commit `bf9226b`, gate verde antes do commit.

**What**: `update` passa a gravar `song_id` quando o dto o informa (UUID válido resolvido na própria congregação, ou `null`), sem tocar nos demais campos; a resolução do catálogo que `create` já faz é extraída para `resolveCatalogSong` privado e compartilhada.
**Where**: `apps/api/src/celebrations/setlist-songs.service.ts` (modificar), `apps/api/src/celebrations/setlist-songs.service.spec.ts` (modificar)
**Depends on**: None
**Reuses**: `findOne` (posse da `SetlistSong`, `:55-61`), a consulta de catálogo de `create` (`:22-29`)
**Requirement**: SETREP-01

**Tools**:
- MCP: NONE (Read/Edit/Bash locais)
- Skill: NONE

**Done when**:
- [ ] `resolveCatalogSong(tenantId, congregationId, songId)` privado, usado por `create` e `update` — sem segunda consulta duplicada
- [ ] `update` inclui `song_id` no `data` quando `dto.song_id !== undefined`, distinguindo `null` (grava NULL, sem consultar catálogo) de ausente (não entra no `data`)
- [ ] `song_id` de outra congregação/inexistente lança `NotFoundException` **antes** do `setlistSong.update` (nada é gravado) — SETREP-01 AC4
- [ ] Testes cobrem os 4 estados: UUID válido da própria congregação (AC1), só `song_id` sem outros campos (AC2 — asserção de que `data` não contém title/key/bpm/link/notes), `null` (AC3), cross-tenant (AC4)
- [ ] O teste existente "atualiza todos os campos informados" (`:200-226`) passa a enviar `song_id` e a afirmá-lo no `data` — fecha a lacuna que deixou o bug passar
- [ ] `npm run test -w orbien-backend` passa; `npm run test:cov -w orbien-backend` mantém global 100
- [x] Contagem de testes: 15 existentes em `setlist-songs.service.spec.ts` continuam passando + 5 novos (nenhuma deleção). *Correção: o plano dizia "20 existentes" — eram 15; após T1/T2 são 22*

**Tests**: unit
**Gate**: quick (API) + cobertura
**Commit**: `fix(api): grava song_id no PATCH de música da setlist`

---

### T2: Devolver a referência do catálogo em `SetlistSongsService`

> **✅ Concluída** — commit `f23a166`, gate verde antes do commit.

**What**: constante `SONG_REFERENCE_SELECT` exportada e `include: { song: { select: ... } }` em `findAll` e `findOne`, para a `SetlistSong` carregar a referência do `Song` vinculado (ou `null`).
**Where**: `apps/api/src/celebrations/setlist-songs.service.ts` (modificar), `.spec.ts` (modificar)
**Depends on**: T1
**Reuses**: as consultas `findMany`/`findFirst` já existentes (`:47-53`, `:57-59`)
**Requirement**: SETREP-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `SONG_REFERENCE_SELECT` exportada com exatamente os campos do design (`id`, `title`, `key`, `key_alt`, `youtube_link`, `spotify_link`, `cifra_club_link`)
- [ ] `findAll` e `findOne` incluem a relação; `orderBy: { sequence: 'asc' }` de `findAll` preservado
- [ ] Testes afirmam o `include` passado ao Prisma em ambos os métodos, e que uma `SetlistSong` sem vínculo volta com `song: null` (SETREP-04 AC2)
- [ ] `npm run test -w orbien-backend` passa; cobertura global 100 mantida
- [ ] Contagem de testes: os de `findAll`/`findOne` atualizados + ~2 novos, nenhuma deleção

**Tests**: unit
**Gate**: quick (API) + cobertura
**Commit**: `feat(api): expõe a música do catálogo vinculada à setlist`

---

### T3: Aprofundar o `include` da ordem de culto até a referência do catálogo

> **✅ Concluída** — commit `1641946`, gate verde antes do commit.

**What**: `ServiceOrdersService.findOne` passa a incluir `songs.song` com a mesma `SONG_REFERENCE_SELECT`, para a tela da ordem de culto receber a referência junto do payload que já busca.
**Where**: `apps/api/src/celebrations/service-orders.service.ts` (modificar), `apps/api/src/celebrations/service-orders.service.spec.ts` (modificar)
**Depends on**: T2
**Reuses**: `SONG_REFERENCE_SELECT` de T2 (importada, não redigitada — é a mitigação do risco de divergência entre os dois serviços); o `include` de `setlist` já existente (`:63-65`)
**Requirement**: SETREP-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `setlist.include.songs` ganha `include: { song: { select: SONG_REFERENCE_SELECT } }`, importada de `setlist-songs.service.ts`
- [ ] Teste afirma o `include` aninhado completo no `findFirst`/`findUnique` do serviço
- [ ] Nenhum outro campo do payload muda (asserção do objeto de `include` inteiro, não parcial)
- [ ] `npm run test -w orbien-backend` passa; cobertura global 100 mantida
- [ ] Contagem de testes: existentes de `service-orders.service.spec.ts` passando + ~1 novo

**Tests**: unit
**Gate**: quick (API) + cobertura + `npm run build:api`
**Commit**: `feat(api): referência do catálogo no payload da ordem de culto`

---

### T4: Criar `lib/repertorio.ts` com o tipo e os helpers do catálogo

> **✅ Concluída** — commit `5124962`, gate verde antes do commit.

**What**: casa única de `CatalogSong` e dos helpers de exibição/busca — move o que hoje está em `SongCatalogPanel` e adiciona a normalização de acento e o casamento de busca.
**Where**: `apps/web/src/lib/repertorio.ts` (novo), `apps/web/src/lib/repertorio.test.ts` (novo), `apps/web/src/components/repertorio/SongCatalogPanel.tsx` (ajustar imports)
**Depends on**: None
**Reuses**: `CatalogSong` e `fmtLastPlayed` de `SongCatalogPanel.tsx:15-36` (movidos, sem mudança de comportamento)
**Requirement**: SETREP-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `CatalogSong`, `fmtLastPlayed`, `normalizeForSearch`, `matchesSong`, `songKey` exportados
- [ ] `normalizeForSearch` faz minúsculas + `normalize("NFD")` + remoção de diacríticos ("Orações" e "oracoes" colidem) — SETREP-02 AC2
- [ ] `matchesSong` devolve `true` para termo vazio ou só espaço (Edge Case da spec)
- [ ] `songKey` devolve `key ?? key_alt ?? null`
- [ ] `SongCatalogPanel` importa de `lib/repertorio` e **não** redeclara nada; seus 15 testes continuam passando sem edição de asserção
- [ ] `npm run test -w orbien-web` passa; `npm run test:cov -w orbien-web` mantém `src/lib/**` em **100 nas quatro métricas**
- [ ] Contagem de testes: ~10 novos em `repertorio.test.ts` + os 15 de `SongCatalogPanel.test.tsx` intactos

**Tests**: unit
**Gate**: quick (Web) + cobertura
**Commit**: `refactor(web): centraliza tipo e helpers do repertório em lib`

---

### T5: Criar o `SongPicker` com busca e contexto

> **✅ Concluída** — commit `9836384`, gate verde antes do commit.

**What**: componente que carrega o catálogo, filtra por título com busca insensível a acento e lista título, tom, BPM e última vez tocada, cobrindo os quatro estados (carregando, catálogo vazio, busca sem resultado, erro de carga).
**Where**: `apps/web/src/components/repertorio/SongPicker.tsx` (novo), `SongPicker.test.tsx` (novo)
**Depends on**: T4
**Reuses**: `SearchInput` (`components/ui/SearchInput.tsx`, com `debounce` repassado), `lib/repertorio` (T4), `api`, `apiErrorMessage`, o padrão de `useEffect` + guarda de `cancelled` de `SongCatalogPanel.tsx:63-80`
**Requirement**: SETREP-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `<SongPicker canCreate onSelect onCancel? debounce? />` carrega `GET /songs` em `useEffect` + axios (**não** react-query — `CLAUDE.md`)
- [ ] Lista mostra, por música: título, tom (`songKey`, com fallback `key_alt`), BPM quando houver, e `fmtLastPlayed` (incluindo "nunca tocada") — AC1
- [ ] Busca filtra por `matchesSong`; termo só com espaço volta à lista cheia — AC2 e Edge Case
- [ ] Estado de busca sem resultado mantém o campo de busca visível e oferece o caminho de cadastro — AC3
- [ ] Catálogo vazio informa a ausência de repertório e oferece cadastro, em vez de omitir a área — AC5
- [ ] Erro de carga mostra `apiErrorMessage` sem impedir a entrada manual em volta — AC6
- [ ] `onSelect` recebe o `CatalogSong` inteiro (o consumidor decide o pré-preenchimento) — AC4
- [ ] Título longo truncado sem quebrar layout; duas músicas de mesmo título distinguíveis por tom/BPM/última vez (Edge Cases)
- [ ] Botão de ícone usa `<button>` puro, não `<Button>` (regra do `CLAUDE.md`)
- [ ] Testes com `debounce={0}` (evita timer real — risco registrado no design); `npm run test -w orbien-web` passa
- [ ] Contagem de testes: ~14 novos, cobrindo os 4 estados + os 6 ACs

**Tests**: unit
**Gate**: quick (Web)
**Commit**: `feat(web): seletor de repertório com busca e contexto`

---

### T6: Cadastro inline de música no `SongPicker`

> **✅ Concluída** — commit `7a1edc1`, gate verde antes do commit.

**What**: `SongQuickCreate` interno ao `SongPicker` — cria um `Song` via `POST /songs` e devolve a música já selecionada, sem sair da tela. Fecha também o ponto cego de portão: registra `components/repertorio/**` nas thresholds do `vitest.config.ts`.
**Where**: `apps/web/src/components/repertorio/SongPicker.tsx` (modificar), `SongPicker.test.tsx` (modificar), `apps/web/vitest.config.ts` (modificar)
**Depends on**: T5
**Reuses**: os campos e a validação de título do form de `SongCatalogPanel` (título com `trim`, BPM numérico, links opcionais); `Input`, `Label`, `Button`, `apiErrorMessage`
**Requirement**: SETREP-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Form aceita título (obrigatório), tom, tom alternativo, BPM e os quatro links, e chama `POST /songs` — AC1
- [ ] Sucesso chama `onSelect` com a música criada, normalizando `last_played_at: null` (o POST não devolve o campo — risco registrado no design) — AC2
- [ ] Título vazio/só espaço bloqueia o envio com mensagem, **sem** chamar a API (asserção de que o mock do axios não foi chamado) — AC3
- [ ] Falha do POST (403 e 5xx cobertos) exibe `apiErrorMessage` e preserva o que foi digitado — AC4
- [ ] `canCreate={false}` não renderiza a ação de cadastrar, sem prejudicar buscar/escolher — AC5
- [ ] `vitest.config.ts` ganha `"src/components/repertorio/**"` nas thresholds, com o piso medido por `npm run test:cov -w orbien-web` (decisão do usuário — ver Alerta de portão). O piso registrado é o alcançado, nunca um número aspiracional nem um rebaixamento de outro caminho
- [ ] `npm run test -w orbien-web` passa e `npm run test:cov -w orbien-web` passa **com** a nova entrada ativa
- [ ] Contagem de testes: ~8 novos (total do arquivo ~22), nenhuma deleção

**Tests**: unit
**Gate**: quick (Web) + cobertura
**Commit**: `feat(web): cadastra música no repertório sem sair da ordem de culto`

---

### T7: `AddSongForm` passa a consumir o `SongPicker`

> **✅ Concluída** — commit `07a598b`, gate verde antes do commit.

**What**: substitui o `<select>` nativo e o `useEffect` de carga do catálogo pelo `SongPicker`, apagando a declaração local de `CatalogSong`, sem regredir o comportamento de override do REPERT-02.
**Where**: `apps/web/src/components/celebrations/ServiceOrderView.tsx` (modificar), `ServiceOrderView.test.tsx` (modificar)
**Depends on**: T6
**Reuses**: `handleSelectSong` (`:151-163`) como callback do picker, com o comentário REPERT-02; o `<select>` de tom alternativo (`:215-226`) permanece — é decisão da escala
**Requirement**: SETREP-02, SETREP-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `<select>` do catálogo (`:196-209`), `useEffect` de `/songs` (`:142-147`) e `interface CatalogSong` local (`:117-121`) removidos; `SongPicker` no lugar
- [ ] Escolher no picker pré-preenche título/tom/BPM/link e mantém os campos editáveis — SETREP-02 AC4
- [ ] Cadastrar pelo picker deixa a música nova já selecionada no form — SETREP-03 AC2
- [ ] POST continua enviando `song_id` junto dos campos editados: **teste de não-regressão** de REPERT-02 AC2 (escolher do catálogo, editar o tom, e afirmar `song_id` + tom editado no corpo)
- [ ] `canCreate` do picker recebe o `canAddSongs` que já governa o form
- [ ] `npm run test -w orbien-web` passa; `test:cov` mantém `components/celebrations/**` ≥ 99/95/100/100 (**o piso nunca desce**)
- [ ] Contagem de testes: os de `ServiceOrderView.test.tsx:696-790` (catálogo) reescritos para o picker, sem redução de casos, + 1 de não-regressão

**Tests**: unit
**Gate**: quick (Web) + cobertura
**Commit**: `feat(web): usa o seletor de repertório no form da setlist`

---

### T8: Ação de vincular/desvincular música da setlist

> **✅ Concluída** — commit `0d01cbe`, gate verde antes do commit.

**What**: botão de ícone na linha da música que abre o `SongPicker` inline e faz `PATCH` com apenas `song_id` (ou `null` para desvincular).
**Where**: `apps/web/src/components/celebrations/ServiceOrderView.tsx` (modificar), `ServiceOrderView.test.tsx` (modificar)
**Depends on**: T7
**Reuses**: `afterAddSong` (recarga sem reload de página), o padrão de erro/toast do componente, `SongPicker`
**Requirement**: SETREP-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Botão de ícone com `aria-label`, ao lado do remover, visível só quando `canAddSongs && !isReadOnly` (abordagem confirmada: ícone discreto)
- [ ] Escolher no picker faz `PATCH /celebrations/setlists/songs/:id` com corpo contendo **apenas** `song_id` (asserção do corpo exato — SETREP-01 AC2)
- [ ] Lista reflete o vínculo sem recarregar a página — AC5
- [ ] Desvincular envia `song_id: null`
- [ ] Falha do PATCH exibe erro sem perder o estado da lista
- [ ] `npm run test -w orbien-web` passa; `components/celebrations/**` mantém o piso
- [ ] Contagem de testes: ~5 novos

**Tests**: unit
**Gate**: quick (Web) + cobertura
**Commit**: `feat(web): vincula música avulsa da setlist ao repertório`

---

### T9: Origem e links de referência na linha da setlist

> **✅ Concluída** — commit `58fe05c`, gate verde antes do commit.

**What**: indicação visual de que a música vem do repertório e os links de referência do `Song` (YouTube, Spotify, Cifra Club) na linha, cada um identificável.
**Where**: `apps/web/src/components/celebrations/ServiceOrderView.tsx` (modificar), `ServiceOrderView.test.tsx` (modificar)
**Depends on**: T8, T3
**Reuses**: o bloco de renderização da setlist (`:687-737`); os tipos `SetlistSong.song` do contrato de T2/T3
**Requirement**: SETREP-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `interface SetlistSong` do web ganha `song_id` e `song` conforme o contrato do design
- [ ] Música com vínculo mostra indicador de repertório e os links disponíveis, cada um com rótulo acessível distinto (não ícone genérico repetido) — AC3
- [ ] Música sem vínculo não mostra indicador e, para autorizado, mostra a ação de vincular de T8 — AC4
- [ ] `song: null` (avulsa ou `Song` removido do catálogo) renderiza sem erro, com os campos históricos — AC2
- [ ] Link genérico da setlist (`song.link` congelado) continua exibido como hoje, sem duplicar com os de referência
- [ ] `npm run test -w orbien-web` passa; `components/celebrations/**` mantém o piso
- [ ] Contagem de testes: ~5 novos

**Tests**: unit
**Gate**: quick (Web) + cobertura + `npm run build:web`
**Commit**: `feat(web): mostra origem e referências da música na setlist`

---

### T10: e2e do fluxo setlist ↔ repertório

> **✅ Concluída** — commit `8e43722`, gate verde antes do commit.

**What**: spec de Playwright cobrindo os três fluxos novos ponta a ponta: buscar e escolher do catálogo, cadastrar inline e usar, e vincular uma música avulsa.
**Where**: `apps/web/e2e/setlist-repertorio.spec.ts` (novo)
**Depends on**: T9
**Reuses**: `apps/web/e2e/fixtures.ts` e o padrão de `apps/web/e2e/repertorio.spec.ts` (que já documenta o caminho de repertório)
**Requirement**: SETREP-01, SETREP-02, SETREP-03, SETREP-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Caminho feliz: abrir a OC, etapa de louvor, buscar por parte do título, escolher, e ver a música na setlist com o indicador de repertório
- [ ] Cadastro inline: catálogo sem a música, cadastrar pelo picker, e ver a música já selecionada e adicionada
- [ ] Vincular avulsa: música de texto livre ganha o vínculo pela ação da linha, e o indicador aparece
- [ ] `npm run e2e -w orbien-web` passa **ou**, se o binário do Playwright não estiver disponível no ambiente, o motivo fica registrado no cabeçalho do arquivo e reportado no resumo (não declarar verde sem execução)
- [ ] Contagem de testes: 3 novos

**Tests**: e2e
**Gate**: full → depois Build (`npm run build:api && npm run build:web && npm run lint && npm run test`)
**Commit**: `test(web): e2e da conexão entre setlist e repertório`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ──→ T2 ──→ T3
Phase 2:  T4
Phase 3:  T5 ──→ T6
Phase 4:  T7 ──→ T8 ──→ T9
Phase 5:  T10

Arestas entre fases:  T3 ──→ T9   (contrato da API consumido pela linha da setlist)
                      T4 ──→ T5   (helpers antes do seletor)
                      T6 ──→ T7   (picker completo antes de substituir o select)
                      T9 ──→ T10  (tela pronta antes do e2e)
```

Execução estritamente sequencial — sem paralelismo intra-fase.

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1: `song_id` no update | 1 método + extração de 1 helper, mesmo arquivo | ✅ Granular |
| T2: referência em `SetlistSongsService` | 1 constante + 2 métodos de leitura, mesmo arquivo | ✅ Granular (coeso) |
| T3: `include` da ordem de culto | 1 consulta | ✅ Granular |
| T4: `lib/repertorio.ts` | 1 módulo de helpers + ajuste de import no consumidor | ✅ Granular (coeso) |
| T5: `SongPicker` | 1 componente | ✅ Granular |
| T6: `SongQuickCreate` | 1 componente interno | ✅ Granular |
| T7: `AddSongForm` consome o picker | 1 função/1 form | ✅ Granular |
| T8: ação de vincular | 1 ação + 1 chamada | ✅ Granular |
| T9: origem e links na linha | 1 bloco de renderização + 1 tipo | ✅ Granular |
| T10: e2e | 1 arquivo de teste | ✅ Granular |

Nenhuma tarefa abre mais de um arquivo-fonte (o `.spec`/`.test` irmão não conta como segundo arquivo — teste é co-locado por contrato da skill).

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | — (raiz da Phase 1) | ✅ Match |
| T2 | T1 | `T1 ──→ T2` | ✅ Match |
| T3 | T2 | `T2 ──→ T3` | ✅ Match |
| T4 | None | — (raiz da Phase 2) | ✅ Match |
| T5 | T4 | `T4 ──→ T5` (aresta entre fases) | ✅ Match |
| T6 | T5 | `T5 ──→ T6` | ✅ Match |
| T7 | T6 | `T6 ──→ T7` (aresta entre fases) | ✅ Match |
| T8 | T7 | `T7 ──→ T8` | ✅ Match |
| T9 | T8, T3 | `T8 ──→ T9` e `T3 ──→ T9` (aresta entre fases) | ✅ Match |
| T10 | T9 | `T9 ──→ T10` (aresta entre fases) | ✅ Match |

Nenhuma dependência aponta para fase posterior: T9 depende de T3 (fase anterior) e T8 (mesma fase). ✅

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1 | Serviço da API | unit (100% global) | unit | ✅ OK |
| T2 | Serviço da API | unit (100% global) | unit | ✅ OK |
| T3 | Serviço da API | unit (100% global) | unit | ✅ OK |
| T4 | Helper do web (`src/lib/**`) + componente de repertório | unit (100% nas quatro) | unit | ✅ OK |
| T5 | Componente de repertório | unit | unit | ✅ OK |
| T6 | Componente de repertório + config de portão | unit (config: portão de build/cobertura) | unit | ✅ OK |
| T7 | Componente de celebrações | unit (piso 99/95/100/100) | unit | ✅ OK |
| T8 | Componente de celebrações | unit (piso 99/95/100/100) | unit | ✅ OK |
| T9 | Componente de celebrações | unit (piso 99/95/100/100) | unit | ✅ OK |
| T10 | Fluxo de tela | e2e | e2e | ✅ OK |

Nenhuma tarefa declara `Tests: none`; nenhuma difere o teste para outra tarefa. Nenhuma tarefa toca camada de DTO/schema/module isoladamente, então a linha `none` da matriz não é exercida.

---

## Requirement Traceability (atualização da spec)

| Requirement ID | Tasks |
|---|---|
| SETREP-01 | T1, T8, T10 |
| SETREP-02 | T4, T5, T7, T10 |
| SETREP-03 | T6, T7, T10 |
| SETREP-04 | T2, T3, T9, T10 |

Cobertura: 4 de 4 requisitos mapeados; nenhuma tarefa sem requisito.


---

## Status de execução — lote 1 (T1-T6)

Verificado pelo orquestrador em 2026-09-08, não só relatado pelo worker:
`npm run test -w orbien-backend` → **2004 testes, 216 suítes, 0 falhas**;
`npm run test -w orbien-web` → **979 testes, 91 arquivos, 0 falhas**.
Cobertura da API em 100 nas quatro métricas; web com `test:cov` exit 0 já
**com** a entrada nova de `components/repertorio/**` ativa.

| T | Commit | Testes novos |
|---|---|---|
| T1 | `bf9226b` | 5 |
| T2 | `f23a166` | 1 |
| T3 | `1641946` | 1 |
| T4 | `5124962` | 12 |
| T5 | `9836384` | 15 |
| T6 | `7a1edc1` | 8 |

Piso registrado para `components/repertorio/**`: `98 / 91 / 100 / 100`
(medido 98,73 / 91,54 / 100 / 100). O que falta são as guardas
`if (signal.cancelled) return` do `useEffect`, alcançáveis só desmontando no
meio da requisição — mesmo padrão já documentado no arquivo para outros
diretórios. Nenhum `SPEC_DEVIATION` marcado.

### Achados fora do escopo do lote 1 (não corrigidos — decisão do usuário)

1. **Lacuna de teste na camada de DTO (SETREP-01 AC3)**:
   `apps/api/src/celebrations/dto/update-setlist-song.dto.spec.ts` não afirma
   que `song_id: null` passa a validação. Passa hoje (`@IsOptional()` ignora
   `null`) e o serviço está coberto, mas nada tranca o contrato — trocar
   `@IsOptional()` por outra combinação quebraria AC3 sem teste vermelho. O
   400 para não-UUID **está** coberto (herdado de
   `create-setlist-song.dto.spec.ts:31-33`).
2. `SetlistSongsService.findAll/findOne` declaram retorno `SetlistSong[]` /
   `SetlistSong`, sem refletir no tipo a relação `song` que o Prisma passa a
   devolver. O front tipa a forma em T9; tipo forte na API seria tarefa
   própria.
3. `npm run lint -w orbien-web` emite 1 warning pré-existente em
   `apps/web/coverage/lcov-report/block-navigation.js` — artefato gerado pelo
   `test:cov`, diretório não versionado. 0 erros.
4. `UpdateSetlistSongDto` tipa `song_id?: string` embora `null` chegue em
   runtime (o que AC3 exige); o serviço contorna com
   `dto.song_id as string | null | undefined`. O campo mora em
   `CreateSetlistSongDto`, fora do escopo de T1.


---

## Status de execução — lote 2 (T7-T10)

| T | Commit | Testes novos |
|---|---|---|
| T7 | `07a598b` | 1 (mais os 10 casos de catálogo reescritos para o picker, virando 11 — sem redução) |
| T8 | `0d01cbe` | 6 |
| T9 | `58fe05c` | 5 |
| T10 | `8e43722` | 3 e2e (não executáveis neste ambiente — ver abaixo) |

Fora do plano original, por decisão do dev sobre o achado nº 1 do lote 1:
commit `ec0d653` fecha o contrato de `song_id: null` no
`update-setlist-song.dto.spec.ts` (2 casos). O comentário do teste foi
corrigido antes do commit: quem deixa o `null` passar é o `@IsOptional()` que
o `PartialType` injeta, não o do `CreateSetlistSongDto` — a primeira redação
errava o mecanismo, e a mutação provou o erro.

`components/celebrations/**` fechou em **99,25 / 96,37 / 100 / 100**, acima do
piso 99/95/100/100 — subiu a cada tarefa (99,24/96,24 → 99,25/96,31 →
99,25/96,37).

### e2e não executado — motivo técnico

`apps/web/e2e/setlist-repertorio.spec.ts` existe, typechecka
(`npx tsc --noEmit -p apps/web/tsconfig.json` cobre `e2e/`) e seus seletores
foram conferidos por inspeção contra o componente, mas **não foi executado**:
o `@playwright/test` 1.62.1 do repo não encontra em `/opt/pw-browsers` o build
que espera (há `chromium-1194` e `chromium_headless_shell-1194`), não existe
nenhuma variável `E2E_*` no ambiente, e não há app nem API no ar. `playwright
install` não foi rodado. Verde de e2e só em ambiente com app de verdade.

### Achados fora do escopo do lote 2 (não corrigidos)

1. O cabeçalho de `apps/web/e2e/repertorio.spec.ts` diz que o seletor de
   catálogo da OC "fica fora deste e2e até aquele defeito pré-existente ser
   corrigido" — a nota está desatualizada agora que
   `setlist-repertorio.spec.ts` cobre esse caminho.
2. `docs/PENDENCIAS.md` afirma que `ServiceOrderView.tsx` posta para
   `/celebrations/service-orders...`; essa parte já foi corrigida antes (usa
   `/celebrations/orders` e `/celebrations/items`). O que resta quebrado é o
   `AddItemModal` — a seção merece atualização.
3. `lucide-react` nesta versão não exporta `Youtube`; o ícone usado é
   `SquarePlay`. A identidade do link está no rótulo acessível, não no glifo.

### Veredito do Verifier independente

**PASS ✅** — 20/20 ACs com o valor afirmado batendo com o outcome da spec,
6/6 Edge Cases cobertos, 6 mutações injetadas e **6 mortas** (nenhuma
sobreviveu, logo nenhuma fix task). Relatório completo em `validation.md`.

Único **spec-precision gap**: o Edge Case "título longo trunca **sem quebrar o
layout**" — a truncagem está asserida (`SongPicker.test.tsx:165`), mas "sem
quebrar o layout" não tem observável definido na spec e não é mensurável em
jsdom. Registrado como lição `L-006` (candidate — nasceu como L-004 e foi re-registrada pelo script na resolução do conflito com a main, que já havia levado L-004 e L-005 do app-mobile).
