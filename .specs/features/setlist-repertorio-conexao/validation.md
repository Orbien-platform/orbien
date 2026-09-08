# Conexão Setlist ↔ Repertório — Validation

**Date**: 2026-09-08
**Spec**: `.specs/features/setlist-repertorio-conexao/spec.md`
**Branch**: `claude/setlist-repertorio-conexao-y5viy4`
**Diff range**: `f64cd7f..ec0d653` (11 commits de código: `bf9226b`, `f23a166`,
`1641946`, `5124962`, `9836384`, `7a1edc1`, `07a598b`, `0d01cbe`, `58fe05c`,
`8e43722`, `ec0d653`; `d88b73d` e `b7bb3b8` são documentação em `.specs/`)
**Verifier**: sub-agente independente (autor ≠ verificador), regra
evidence-or-zero
**Verdict**: **PASS ✅**

---

## Superfície verificada

17 arquivos, +2785/−117. Código de produção:

| Arquivo | Papel |
|---|---|
| `apps/api/src/celebrations/setlist-songs.service.ts` | `resolveCatalogSong` + `song_id` no `update` + `SONG_REFERENCE_SELECT` no `findAll`/`findOne` |
| `apps/api/src/celebrations/service-orders.service.ts` | `include` aninhado até `setlist.songs.song` |
| `apps/web/src/lib/repertorio.ts` | `CatalogSong`, `fmtLastPlayed`, `normalizeForSearch`, `matchesSong`, `songKey` |
| `apps/web/src/components/repertorio/SongPicker.tsx` | seletor com busca/contexto + `SongQuickCreate` |
| `apps/web/src/components/repertorio/SongCatalogPanel.tsx` | passa a importar o tipo/helper da lib |
| `apps/web/src/components/celebrations/ServiceOrderView.tsx` | consumo do picker, vincular/desvincular, origem e referências na linha |
| `apps/web/vitest.config.ts` | entrada nova de threshold para `src/components/repertorio/**` |

Testes: `setlist-songs.service.spec.ts`, `service-orders.service.spec.ts`,
`dto/update-setlist-song.dto.spec.ts`, `repertorio.test.ts`,
`SongPicker.test.tsx`, `ServiceOrderView.test.tsx`, `e2e/setlist-repertorio.spec.ts`.

---

## Task Completion

| Task | Status | Notas |
|---|---|---|
| T1 `song_id` no `update` | ✅ Done | `bf9226b` |
| T2 referência em `SetlistSongsService` | ✅ Done | `f23a166` |
| T3 `include` da ordem de culto | ✅ Done | `1641946` |
| T4 `lib/repertorio.ts` | ✅ Done | `5124962` |
| T5 `SongPicker` | ✅ Done | `9836384` |
| T6 `SongQuickCreate` + threshold | ✅ Done | `7a1edc1`; piso `98/91/100/100` registrado no `vitest.config.ts` |
| T7 `AddSongForm` consome o picker | ✅ Done | `07a598b` |
| T8 vincular/desvincular | ✅ Done | `0d01cbe` |
| T9 origem e referências na linha | ✅ Done | `58fe05c` |
| T10 e2e | ⚠️ Escrito, não executável | `8e43722` — ver "Limitação do e2e" |

Observação de documentação (não é gap de código): a seção
"Status de execução" do `tasks.md` cobre só o lote 1 (T1–T6); T7–T10 têm
commit e teste, mas não têm a marca `✅ Concluída` no corpo da tarefa.

---

## Spec-Anchored Acceptance Criteria

Legenda dos arquivos: `SSS` = `apps/api/src/celebrations/setlist-songs.service.spec.ts`;
`SOS` = `apps/api/src/celebrations/service-orders.service.spec.ts`;
`UDS` = `apps/api/src/celebrations/dto/update-setlist-song.dto.spec.ts`;
`SP` = `apps/web/src/components/repertorio/SongPicker.test.tsx`;
`SOV` = `apps/web/src/components/celebrations/ServiceOrderView.test.tsx`;
`REP` = `apps/web/src/lib/repertorio.test.ts`.

### SETREP-01 — Vincular ao catálogo uma música já na setlist

| Criterion | Spec-defined outcome | `file:line` + asserção | Result |
|---|---|---|---|
| AC1: PATCH com `song_id` da própria congregação → persiste e devolve o registro atualizado com esse valor | `song_id` gravado; resolução por `tenant_id` + `congregation_id`; retorno contém o valor | `SSS:298` — `expect(client.song.findFirst).toHaveBeenCalledWith({ where: { id: 'song-catalog', tenant_id: 't1', congregation_id: 'g1' } })`; `SSS:301` — `expect(result).toEqual({ id: 'song1', song_id: 'song-catalog' })` | ✅ PASS |
| AC2: PATCH com **apenas** `song_id` → `title`/`key`/`bpm`/`link`/`notes` intactos | corpo do `update` do Prisma contém **só** `song_id` | `SSS:313` — `expect(client.setlistSong.update).toHaveBeenCalledWith({ where: { id: 'song1' }, data: { song_id: 'song-catalog' } })` (igualdade exata do objeto `data`, não `objectContaining`) | ✅ PASS |
| AC3: PATCH com `song_id: null` → grava NULL preservando os demais campos | `data: { song_id: null }`, sem consulta ao catálogo | `SSS:327` — `expect(client.setlistSong.update).toHaveBeenCalledWith({ where: { id: 'song1' }, data: { song_id: null } })`; `SSS:331` — `expect(client.song.findFirst).not.toHaveBeenCalled()`; `SSS:332` — `expect(result).toEqual({ id: 'song1', song_id: null, key: 'G' })` | ✅ PASS |
| AC3 (contrato do DTO) | `song_id: null` passa a validação (não vira 400) | `UDS:28` — `expect(await errorsFor({ song_id: null })).toHaveLength(0)` | ✅ PASS |
| AC4: `song_id` de outro tenant/inexistente → 404 e nada alterado | `NotFoundException` **antes** do `update` | `SSS:352` — `.rejects.toBeInstanceOf(NotFoundException)`; `SSS:355` — `expect(client.setlistSong.update).not.toHaveBeenCalled()` | ✅ PASS |
| AC5: ação de vincular na tela reflete o vínculo sem recarregar a página | PATCH com corpo `{ song_id }` e lista atualizada pela recarga da própria OC | `SOV:1230` — `expect(api.patch).toHaveBeenCalledWith("/celebrations/setlists/songs/s1", { song_id: "cs1" })`; `SOV:1235` — `findByRole("button", { name: "Desvincular Grande é o Senhor do repertório" })` presente após a recarga | ✅ PASS |
| AC5 (desvincular pela tela) | corpo `{ song_id: null }` | `SOV:1275` — `expect(api.patch).toHaveBeenCalledWith("/celebrations/setlists/songs/s1", { song_id: null })`; `SOV:1278-1279` — tom `G` e `80 BPM` continuam na linha | ✅ PASS |

### SETREP-02 — Escolher do catálogo com busca e contexto

| Criterion | Spec-defined outcome | `file:line` + asserção | Result |
|---|---|---|---|
| AC1: lista mostra título, tom (`key`, ou `key_alt` quando `key` nulo), BPM quando houver, última vez tocada (ou "nunca tocada") | os quatro dados, com os fallbacks | `SP:43-45` — `expect(screen.getByText("Tom D"))`, `expect(screen.getByText("80 BPM"))`, `expect(screen.getByText("Última vez tocada: 01/08/2026"))`; `SP:53-55` — `getByText("Tom E")` (key nulo, key_alt E), `getByText("Última vez tocada: nunca tocada")`, `expect(screen.queryByText(/BPM/)).not.toBeInTheDocument()` | ✅ PASS |
| AC2: busca filtra por correspondência parcial no título, ignorando caixa e acento | "oracoes" acha "Orações" e some com a outra | `SP:75-76` — `expect(screen.queryByText("Aleluia")).not.toBeInTheDocument()` + `expect(screen.getByText("Orações")).toBeInTheDocument()` após digitar `"oracoes"`; `REP:47-48` — `expect(matchesSong(song({title:"Orações"}), "ORACOES")).toBe(true)` e `expect(matchesSong(song({title:"Oracoes"}), "orações")).toBe(true)` | ✅ PASS |
| AC3: busca sem resultado → estado vazio explícito, com caminho de cadastro, sem esconder o campo de busca | as três coisas simultâneas | `SP:97-99` — `findByText("Nenhuma música encontrada para essa busca.")` + `getByPlaceholderText("Buscar no repertório…")` + `getByRole("button", { name: /Cadastrar música no repertório/ })` | ✅ PASS |
| AC4: escolher pré-preenche `title`/`key`/`bpm`/`link`, campos editáveis, e envia `song_id` no POST | valores do catálogo nos campos + `song_id` no corpo | `SP:141` — `expect(onSelect).toHaveBeenCalledWith(chosen)` (o `CatalogSong` inteiro); `SOV:893-896` — `toHaveValue("Digno é o Senhor")` / `"E"` / `90` / `"http://cifra.test/x"`; `SOV:901` — `expect(api.post).toHaveBeenCalledWith("/celebrations/setlists/songs", expect.objectContaining({ setlist_id: "sl1", song_id: "cs1", title: "Digno é o Senhor" }))` | ✅ PASS |
| AC5: catálogo vazio informa a ausência e oferece cadastro, sem omitir a área | mensagem + botão de cadastro + campo de busca | `SP:106-110` — `findByText("Nenhuma música no repertório desta congregação.")` + botão de cadastro + campo de busca; `SOV:1098-1113` — mesma dupla na OC e POST avulso ainda funcionando (`objectContaining({ setlist_id: "sl1", title: "Avulsa" })`) | ✅ PASS |
| AC6: falha da carga do catálogo mantém o form de texto livre e exibe a mensagem | `apiErrorMessage` + entrada avulsa funcionando | `SP:129-130` — `findByText("Catálogo indisponível")` + campo de busca presente; `SOV:1173` — `findByText("Não foi possível carregar o catálogo.")` e `SOV:1180` — POST avulso com `objectContaining({ setlist_id: "sl1", title: "Música avulsa" })` | ✅ PASS |

### SETREP-03 — Cadastrar no repertório sem sair da ordem de culto

| Criterion | Spec-defined outcome | `file:line` + asserção | Result |
|---|---|---|---|
| AC1: form com título (obrigatório), tom, tom alternativo, BPM e os quatro links, criando via `POST /songs` | os oito campos e o corpo do POST | `SP:205-212` — `getByLabelText` de "Título", "Tom", "Tom alternativo", "BPM", "Link", "YouTube", "Spotify", "Cifra Club"; `SP:232-241` — `expect(api.post).toHaveBeenCalledWith("/songs", { title: "Grande é o Senhor", key: "D", key_alt: "E", bpm: 80, link: "https://cifra/x", youtube_link: "https://yt/x", spotify_link: "https://spotify/x", cifra_club_link: "https://cifraclub/x" })` — corpo exato, com `trim` do título comprovado | ✅ PASS |
| AC2: sucesso seleciona a música criada no form da setlist (`song_id` + campos pré-preenchidos) | seleção automática, `last_played_at: null` | `SP:256-262` — `expect(onSelect).toHaveBeenCalledWith({ id: "novo", title: "Grande é o Senhor", key: "D", bpm: null, last_played_at: null })`; `SOV:1140-1143` — `toHaveValue("Grande é o Nosso Deus")` / `"A"` / `72`; `SOV:1148` — POST da setlist com `objectContaining({ song_id: "novo", title: "Grande é o Nosso Deus" })` | ✅ PASS |
| AC3: título vazio/só espaço bloqueia o envio com mensagem, sem chamar a API | mensagem + zero chamadas | `SP:272-273` — `findByText("Dê um título à música.")` + `expect(api.post).not.toHaveBeenCalled()` | ✅ PASS |
| AC4: falha do POST exibe `apiErrorMessage` e preserva o digitado | mensagem da resposta (403) e fallback (5xx), input preservado | `SP:286-287` — `findByText("Você não tem permissão.")` + `expect(screen.getByLabelText("Título")).toHaveValue("Digno é o Senhor")`; `SP:300-301` — `findByText("Não foi possível salvar a música.")` + `expect(screen.queryByText("Internal server error")).not.toBeInTheDocument()` | ✅ PASS |
| AC5: sem papel autorizado, a ação de cadastrar não é oferecida, sem prejuízo de buscar/escolher | botão ausente; seleção ainda funciona | `SP:174` — `expect(screen.queryByRole("button", { name: /Cadastrar música no repertório/ })).not.toBeInTheDocument()`; `SP:177` — `expect(onSelect).toHaveBeenCalledTimes(1)` após escolher | ✅ PASS |

### SETREP-04 — Origem e referências visíveis na setlist

| Criterion | Spec-defined outcome | `file:line` + asserção | Result |
|---|---|---|---|
| AC1: leitura da OC inclui, por `SetlistSong` com `song_id`, ao menos `id`, `title`, `key`, `key_alt`, `youtube_link`, `spotify_link`, `cifra_club_link` | `select` exato passado ao Prisma nas três consultas | `SSS:177-193` — `expect(client.setlistSong.findMany).toHaveBeenCalledWith({ where: {...}, orderBy: { sequence: 'asc' }, include: { song: { select: { id: true, title: true, key: true, key_alt: true, youtube_link: true, spotify_link: true, cifra_club_link: true } } } })`; `SSS:218-233` — o mesmo objeto no `findFirst` de `findOne`; `SOS:81-121` — `expect(client.serviceOrder.findFirst).toHaveBeenCalledWith({...})` com o `include` **inteiro** (não parcial), com `items.setlist.songs.include.song.select` completo | ✅ PASS |
| AC2: `Song` removido (`song_id` NULL) devolve a `SetlistSong` normalmente, referência nula, campos copiados preservados | `song: null` sem erro, cópia congelada intacta | `SSS:207` — `expect(result).toEqual([{ id: 'song1', title: 'Avulsa', key: 'G', song_id: null, song: null }])`; `SOV:1412-1415` — `getByText("G")`, `getByText("80 BPM")`, `getByRole("link", { name: "Abrir link" })` com `href="http://x.test"`, e `queryByText("Repertório")` ausente | ✅ PASS |
| AC3: música com vínculo mostra indicação de repertório e os links disponíveis, cada um identificável | badge + três rótulos acessíveis distintos, com href | `SOV:1371-1380` — `getByText("Repertório")`; `getByRole("link", { name: "Abrir no YouTube: Grande é o Senhor" })` → `toHaveAttribute("href", "http://yt.test/a")`; idem "Abrir no Spotify: …" → `http://spotify.test/a`; idem "Abrir a cifra no Cifra Club: …" → `http://cifraclub.test/a`; `SOV:1443-1451` — só a referência existente aparece (Spotify/Cifra ausentes quando nulos) | ✅ PASS |
| AC4: música sem vínculo não mostra indicador e, para autorizado, oferece a ação de vincular | badge ausente + botão presente | `SOV:1390-1393` — `expect(screen.queryByText("Repertório")).not.toBeInTheDocument()` + `getByRole("button", { name: "Vincular Grande é o Senhor ao repertório" })`; negativos: `SOV:1329-1331` (sem `canAddSongs`) e `SOV:1341-1343` (somente leitura) | ✅ PASS |
| AC3 (não duplicar o link congelado) | o `link` da setlist aparece uma vez; o tom exibido é o congelado | `SOV:1481-1485` — `expect(document.querySelectorAll('a[href="http://x.test"]')).toHaveLength(1)`, `expect(screen.getAllByRole("link")).toHaveLength(3)`, `getByText("G")` presente e `queryByText("D")` (tom do catálogo) ausente | ✅ PASS |

**Status**: 4/4 requisitos com todos os ACs rastreados a `file:line` +
asserção de valor. Nenhum AC sem evidência.

---

## Edge Cases

| Edge case (spec) | Outcome da spec | Evidência | Result |
|---|---|---|---|
| PATCH com `song_id` que não é UUID → 400 | rejeição pelo `@IsUUID()` do DTO | `UDS:32-33` — `expect(errors.some((e) => e.property === 'song_id')).toBe(true)` (e o herdado `create-setlist-song.dto.spec.ts:31-33`) | ✅ PASS — nota: a asserção mira a validação do DTO (a origem do 400), não o status HTTP; é o padrão do repo para camada de DTO |
| `song_id: null` em música já sem vínculo → 200 sem alteração efetiva (idempotente) | registro devolvido sem mudança | `SSS:343` — `expect(result).toEqual({ id: 'song1', song_id: null, key: 'G' })` | ✅ PASS — nota: idempotência asserida no serviço; nenhum teste afirma o status 200 (rota inalterada, 200 é o default do Nest para PATCH) |
| Dois títulos iguais no catálogo → seletor exibe os dois, distinguíveis por tom/BPM/última vez | 2 itens + os três contextos | `SP:151-157` — `expect(await screen.findAllByText("Aleluia")).toHaveLength(2)` + `getByText("Tom D")`/`"Tom G"`/`"80 BPM"`/`"120 BPM"`/`"Última vez tocada: nunca tocada"`/`"Última vez tocada: 01/08/2026"` | ✅ PASS |
| Título longo trunca sem quebrar o layout | truncar (a parte "sem quebrar o layout" não tem outcome observável definido) | `SP:165` — `expect((await screen.findByText(longo)).className).toContain("truncate")` | ⚠️ **Spec-precision gap** — a truncagem está asserida; "sem quebrar o layout" não é mensurável em jsdom e a spec não define o observável |
| Escolher do catálogo e depois editar o tom → valor editado prevalece com `song_id` preservado (não-regressão REPERT-02 AC2) | corpo do POST com `song_id` do catálogo **e** o tom editado | `SOV:998-1001` — `expect(api.post).toHaveBeenCalledWith("/celebrations/setlists/songs", expect.objectContaining({ setlist_id: "sl1", song_id: "cs1", key: "F" }))` — conjunção no mesmo objeto, valor editado (`F`), não o do catálogo (`E`) | ✅ PASS |
| Campo de busca com só espaços → lista volta ao estado não filtrado | filtro neutro | `REP:60` — `expect(matchesSong(song(), "   ")).toBe(true)`; `SP:86-87` — `getByText("Aleluia")` e `getByText("Orações")` ambos presentes após digitar `"   "` | ✅ PASS |

---

## Regra payload/conjunção

Os três pontos onde a regra é decisiva foram checados por valor, não por
"a chamada aconteceu":

1. **Corpo exato do PATCH (SETREP-01 AC2)** — `SSS:313` usa igualdade exata
   em `data` (`{ song_id: 'song-catalog' }`), então qualquer campo extra
   reprova; `SOV:1230` faz o mesmo no front (`{ song_id: "cs1" }`).
   Confirmado por mutação (M6, abaixo).
2. **`include`/`select` passado ao Prisma (SETREP-04 AC1)** — `SOS:81-121`
   afirma o objeto de `include` **inteiro** do `findFirst`, não um
   `objectContaining`; `SSS:177`/`SSS:218` afirmam o `select` completo dos
   sete campos. Confirmado por mutação (M3).
3. **`song_id` + campo editado no POST (não-regressão REPERT-02 AC2)** —
   `SOV:998` afirma `song_id: "cs1"` e `key: "F"` no mesmo
   `objectContaining`, com o valor do catálogo (`E`) descartado.

---

## Discrimination Sensor

Estado descartável: `git worktree add` em
`/tmp/claude-0/.../scratchpad/mut` (node_modules por symlink), removido no
fim. **Nenhuma mutação tocou a árvore real** — nenhum `git stash` foi usado.

| # | Arquivo:linha | Mutação | Testes rodados | Resultado |
|---|---|---|---|---|
| M1 | `apps/api/src/celebrations/setlist-songs.service.ts:96` | `...(songId !== undefined && { song_id: songId })` → `...(songId && { song_id: songId })` (truthiness) | `setlist-songs.service.spec.ts` | ✅ **Morta** — 1 falha: `SSS:327` esperava `data: { song_id: null }`, recebeu `data: {}` (AC3) |
| M2 | `setlist-songs.service.ts:91-96` | `update` passa a reimportar `key` do catálogo (`...(cat && { key: cat.key })`) | `setlist-songs.service.spec.ts` | ✅ **Morta** — 1 falha: `SSS:313` recebeu `data: { key: "D", song_id: "song-catalog" }` (AC2) |
| M3 | `apps/api/src/celebrations/service-orders.service.ts:63-70` | remove `include: { song: { select: SONG_REFERENCE_SELECT } }` de `setlist.songs` | `service-orders.service.spec.ts` | ✅ **Morta** — 1 falha: `SOS:81` (AC1 de SETREP-04) |
| M4 | `apps/web/src/lib/repertorio.ts:36` | `if (!needle) return true` → `return false` (inverte o termo vazio) | `repertorio.test.ts` + `SongPicker.test.tsx` | ✅ **Morta** — 12 falhas, incluindo `REP:56`/`REP:60` (termo vazio/espaço) e o AC2/AC3 do picker |
| M5 | `apps/web/src/components/repertorio/SongPicker.tsx:112` | `{canCreate ? (` → `{true ? (` (ignora `canCreate={false}`) | `SongPicker.test.tsx` | ✅ **Morta** — 1 falha: `SP:174` (SETREP-03 AC5) |
| M6 | `apps/web/src/components/celebrations/ServiceOrderView.tsx:437-439` | `handleLinkSong` acrescenta `key: song?.key` ao corpo do PATCH | `ServiceOrderView.test.tsx` | ✅ **Morta** — 1 falha: `SOV:1230` ("apenas `song_id` no corpo", SETREP-01 AC2) |

**Sensor depth**: 6 mutações (acima do piso de 1–3 do nível default; o
alvo inclui integridade de dado multi-tenant).
**Result**: **6/6 mortas, 0 sobreviveram — PASS ✅**

**Observação (mutante equivalente, não é gap)**: em
`ServiceOrderView.tsx:816`, `canCreate={canAddSongs}` está dentro do ramo
`canAddSongs && !isReadOnly` (`:811`), então trocar por `canCreate={true}`
não muda comportamento observável — o form nem renderiza quando
`canAddSongs` é falso. A gate de SETREP-03 AC5 é exercida no nível do
`SongPicker` (M5) e o negativo na tela está em `SOV:1329`/`SOV:1341`.

---

## Gate Check (números reais, tudo a partir da raiz)

| Comando | Resultado |
|---|---|
| `npm run test -w orbien-backend` | **2006 testes, 216 suítes, 0 falhas, 0 skips** — exit 0 |
| `npm run test:cov -w orbien-backend` | **2056 testes, 225 suítes, 0 falhas** — exit 0. Cobertura: **Statements 100% (5289/5289), Branches 100% (1784/1784), Functions 100% (892/892), Lines 100% (4697/4697)** — `coverageThreshold.global: 100` atendido |
| `npm run test -w orbien-web` | **991 testes, 91 arquivos, 0 falhas, 0 skips** — exit 0 |
| `npm run test:cov -w orbien-web` | **991 testes, 91 arquivos, 0 falhas** — exit 0, todos os thresholds por caminho atendidos. All files 99,6 / 96,86 / 100 / 100. `components/celebrations/**` **99,25 / 96,37 / 100 / 100** (piso 99/95/100/100 — não desceu). `components/repertorio/**` **98,73 / 92,25 / 100 / 100** (piso novo 98/91/100/100; `SongPicker.tsx` 96,61 / 94,73 / 100 / 100, descobertas as linhas 35 e 40-44 — as guardas `if (signal.cancelled) return`). `src/lib/**` em 100 nas quatro |
| `npm run lint` | exit 0 — 5 tarefas, 0 erros. Warnings: 1 em `apps/web/coverage/lcov-report/block-navigation.js` (artefato do `test:cov`, não versionado — pendência pré-existente conhecida) e 23 pré-existentes em `orbien-mobile`, fora desta feature |
| `npm run build:api` | exit 0 |
| `npm run build:web` | exit 0 |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | exit 0 — o `include` do tsconfig cobre `e2e/**`, então o e2e novo compila |
| `npm run e2e -w orbien-web` | **não executado** — ver limitação abaixo |

### Test Integrity Check

Contagens medidas em worktree descartável no merge-base `f64cd7f` e no HEAD:

| Suíte | Antes (`f64cd7f`) | Depois (`ec0d653`) | Delta |
|---|---|---|---|
| API (unit) | 1997 testes / 216 suítes | 2006 / 216 | **+9 testes** |
| Web (vitest) | 944 testes / 89 arquivos | 991 / 91 | **+47 testes, +2 arquivos** |

Nenhuma contagem desceu; nenhuma suíte deletada; nenhum `skip`/`todo`
introduzido. Nenhuma asserção enfraquecida: o teste pré-existente "atualiza
todos os campos informados" (`SSS:246`) passou a **incluir** `song_id` no
`data` afirmado (era a lacuna que deixou o bug original passar), e os testes
de catálogo do `ServiceOrderView` foram reescritos para o picker sem redução
de casos.

### Limitação do e2e (registrada, não é falha da feature)

`apps/web/e2e/setlist-repertorio.spec.ts` (3 testes: escolher do catálogo,
cadastro inline, vincular avulsa) **não é executável neste ambiente**, por
três motivos de ambiente: o Playwright 1.62.1 do repo procura uma revisão de
Chromium que não está em `/opt/pw-browsers` (há `chromium-1194` e
`chromium_headless_shell-1194`); não existe nenhuma variável `E2E_*`
(`E2E_EMAIL`/`E2E_PASSWORD`/`E2E_TENANT` são exigidas pela fixture `api`); e
não há app nem API rodando em `E2E_BASE_URL`/`E2E_API_URL`. `playwright
install` **não** foi executado. Verificação feita: inspeção do arquivo (os
seletores usados batem com os do componente — `"Buscar no repertório…"`,
`"Cadastrar música no repertório"`, `"Criar e usar"`, `"Vincular … ao
repertório"`, `"Desvincular … do repertório"`, badge `"Repertório"`) e
`tsc --noEmit` do `apps/web`, que inclui `e2e/` e passa. O cabeçalho do
próprio arquivo já declara a não execução — não há verde declarado sem
execução.

---

## Code Quality

| Princípio | Status |
|---|---|
| Nenhuma feature além do pedido | ✅ — o CRUD do catálogo continua em `/repertorio`; só o **criar** entrou na OC, como a spec delimita |
| Sem abstração para uso único | ✅ — `lib/repertorio.ts` tem dois consumidores reais (`SongCatalogPanel`, `SongPicker`); `SONG_REFERENCE_SELECT` tem dois (`SetlistSongsService`, `ServiceOrdersService`) |
| Sem "flexibilidade" desnecessária | ✅ — busca client-side sem endpoint novo, sem biblioteca de combobox, como as Assumptions decidiram |
| Só arquivos necessários | ✅ — 7 de produção, todos previstos no `tasks.md` |
| Não "melhorou" código não relacionado | ✅ — `SongCatalogPanel` só perdeu as declarações movidas e reexporta o tipo para não quebrar importadores |
| Segue os padrões da base | ✅ — `useEffect` + axios (não react-query), `<button>` puro para ícone/link e `<Button>` com `bg-navy` só no primário, teste co-locado, zero DDL/migration |
| Sênior aprovaria | ✅ |
| Testes mapeiam ACs e não são superficiais | ✅ — cada teste novo cita o ID do AC ou "Edge Case" no nome; nenhum teste órfão de requisito |
| Spec-anchored outcome check | ✅ — 1 ⚠️ spec-precision gap declarado (título longo) |
| Coverage Expectation por camada | ✅ — API em 100 global; `src/lib/**` em 100; `celebrations/**` acima do piso; `repertorio/**` com entrada nova de threshold (o ponto cego de portão foi fechado como o usuário decidiu) |
| Diretrizes documentadas seguidas | ✅ — `CLAUDE.md` (raiz), `docs/TESTES.md`, `apps/api/jest.config.js`, `apps/web/vitest.config.ts` |
| Isolamento multi-tenant | ✅ — `resolveCatalogSong` filtra por `tenant_id` + `congregation_id` antes de gravar (AC4 com asserção do `where`); nenhuma tabela nova, AD-001 não se aplica |

---

## Pendências conhecidas e aceitas (não são gaps desta verificação)

1. `SetlistSongsService.findAll/findOne` declaram retorno `SetlistSong[]` /
   `SetlistSong` sem refletir a relação `song` no tipo.
2. `UpdateSetlistSongDto` tipa `song_id?: string` embora `null` chegue em
   runtime (o serviço contorna com `as string | null | undefined`).
3. 1 warning de lint pré-existente em `apps/web/coverage/lcov-report/`
   (artefato do `test:cov`, diretório não versionado).
4. `tasks.md` não marca T7–T10 como concluídas no corpo das tarefas (só o
   lote 1 tem o bloco de status).

---

## Requirement Traceability Update

| Requirement | Status anterior | Novo status |
|---|---|---|
| SETREP-01 | Implementing | ✅ Verified |
| SETREP-02 | Implementing | ✅ Verified |
| SETREP-03 | Implementing | ✅ Verified |
| SETREP-04 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 20/20 ACs (4 requisitos) com o valor afirmado
batendo com o outcome da spec; 6/6 Edge Cases cobertos, **1 ⚠️
spec-precision gap** (título longo: "sem quebrar o layout" sem outcome
observável definido).
**Sensor**: 6/6 mutações mortas, 0 sobreviveram.
**Gate**: API 2006 (cov 2056) e web 991 testes, 0 falhas; cobertura da API
100/100/100/100; thresholds do web atendidos; lint 0 erros; `build:api` e
`build:web` verdes; `tsc` do web verde.
**Árvore real**: limpa (`git status --short` vazio), HEAD em `ec0d653`,
branch `claude/setlist-repertorio-conexao-y5viy4`. As mutações rodaram em
worktrees descartáveis, já removidos.

**O que funciona**: PATCH grava e apaga `song_id` sem tocar na cópia
congelada e barra música de outra congregação com 404 antes de gravar; as
três leituras devolvem a referência do catálogo com os sete campos; o
seletor busca sem acento/caixa, mostra tom/BPM/última vez tocada e cobre os
quatro estados (carregando, vazio, sem resultado, erro); o cadastro inline
cria e já seleciona a música; a linha da setlist mostra a origem e as três
referências com rótulos distintos, e oferece vincular/desvincular a quem
pode editar.

**Issues found**: nenhum bloqueador. Um ⚠️ spec-precision gap (acima) e o
e2e não executável por ambiente.

**Next steps**: nenhuma fix task. Se o e2e importar como portão, rodar
`npm run e2e -w orbien-web` num ambiente com Chromium compatível, as
variáveis `E2E_*` e app/API de pé.
