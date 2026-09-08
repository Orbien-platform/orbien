# Conexão Setlist ↔ Repertório — Specification

## Problem Statement

A ligação entre a setlist de uma etapa de louvor da ordem de culto e o
módulo de repertório existe no banco (`SetlistSong.song_id` → `Song`, FK
opcional com `onDelete: SetNull`) e na API (`POST
/celebrations/setlists/songs` copia `key`/`bpm`/`link` do catálogo quando
recebe `song_id`), mas na prática ela quase não é usada:

1. `UpdateSetlistSongDto` herda `song_id` de `CreateSetlistSongDto`, porém
   `SetlistSongsService.update` **não grava esse campo** — o PATCH aceita e
   descarta em silêncio. Uma música digitada avulsa nunca consegue ser
   vinculada ao repertório depois.
2. O seletor do catálogo em `ServiceOrderView` só aparece quando
   `catalog.length > 0`. Congregação que ainda não cadastrou nada não
   descobre que o módulo existe.
3. O seletor é um `<select>` nativo com o catálogo inteiro e só o título —
   sem busca, sem tom/BPM, e sem `last_played_at`, que a API já devolve e é
   exatamente o dado útil para não repetir a mesma música toda semana.
4. Não há como cadastrar uma música nova no repertório de dentro da ordem de
   culto: obriga sair para `/repertorio`, cadastrar, voltar e refazer.
5. `Song` guarda `youtube_link`, `spotify_link` e `cifra_club_link`, mas só o
   `link` genérico chega à setlist — as demais referências são perdidas.
6. A setlist não indica quais músicas vieram do catálogo nem oferece atalho
   para a ficha da música.

O objetivo é fechar as seis lacunas sem mudar a semântica de dados já
decidida: o que a setlist guarda continua sendo uma cópia congelada do
momento em que a música foi adicionada.

## Goals

- [ ] Escolher música do catálogo ao montar a setlist é a via natural, mesmo
      com catálogo grande (busca) ou vazio (caminho para cadastrar).
- [ ] Música adicionada como texto livre pode ser vinculada ao catálogo
      depois, sem apagar e recriar a entrada.
- [ ] Quem monta a setlist vê, na hora de escolher, tom, BPM e quando a
      música foi tocada pela última vez.
- [ ] As referências do catálogo (YouTube, Spotify, Cifra Club) ficam
      alcançáveis a partir da setlist.
- [ ] A setlist mostra o que veio do catálogo e o que é avulso.

## Out of Scope

| Feature | Reason |
|---|---|
| Gestão do catálogo (editar/remover `Song`) dentro da Ordem de Culto | O CRUD mora em `/repertorio` desde que o catálogo saiu de Celebrações (ver `celebracoes/page.tsx:66-69`). A OC ganha só o atalho de **criar**, que é o que desbloqueia o fluxo de montar setlist; editar e remover continuam fora |
| Sincronizar setlist com mudanças posteriores no `Song` | Decidido pelo usuário: mantém congelado, como hoje (mesma decisão de `repertorio-louvor` AC4) |
| Colunas novas em `SetlistSong` para os links extras | Ver Assumptions — os links de referência são lidos do catálogo pela relação, não copiados |
| Deduplicação/fuzzy-match de títulos | Herdado do Out of Scope de `repertorio-louvor` — sem requisito de negócio |
| Visão do músico (`my-assignments`) | Já entregue em `repertorio-louvor` (REPERT-03); esta feature não muda esse endpoint |
| Transposição automática de tom | Sem requisito declarado; `key`/`key_alt` continuam texto livre |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Sincronia setlist ↔ catálogo | Congelado: `title`/`key`/`bpm`/`link` da `SetlistSong` são cópia do momento da escolha e não mudam quando o `Song` muda | Escolhido pelo usuário; preserva `repertorio-louvor` AC4 e o histórico de execução | y |
| Como expor `youtube_link`/`spotify_link`/`cifra_club_link` na setlist | **Lidos do catálogo pela relação `song`**, incluída na leitura da setlist — não copiados em colunas novas de `SetlistSong` | Esses três são referências à *música* (onde ouvir, onde ver a cifra), não dado confirmado *daquela escala*. O que a escala confirma é tom, BPM e o `link` que o líder fixou — e esses continuam congelados. Copiar exigiria 3 colunas denormalizadas que nada na spec pede para congelar | y (decorre da decisão de sincronia) |
| Vincular avulsa ao catálogo altera os campos já digitados? | Não. O vínculo grava `song_id` e nada mais; tom/BPM/link digitados permanecem | Congelamento vale nos dois sentidos — vincular é declarar a origem, não reimportar valores. Quem quiser os valores do catálogo edita o campo | y (assumido, coerente com a decisão de sincronia) |
| Desvincular (`song_id` → `null`) | Permitido pelo mesmo PATCH, enviando `song_id: null` | Sem isso, um vínculo errado só se corrige apagando a música da setlist | y (assumido) |
| Permissão de criar `Song` a partir da OC | A mesma de `POST /songs` hoje: `admin_congregation`, `pastor`, `tenant_admin`, `ministry_leader` — idêntica ao `canAddSongs` que já governa o form da setlist | Nenhuma gate nova; o atalho não amplia quem pode escrever no catálogo | y (decorre do código existente) |
| Busca do seletor | Filtro client-side sobre a lista já carregada de `GET /songs`, por título | O endpoint devolve o catálogo inteiro da congregação e não tem paginação nem `?q=`; filtrar no cliente evita endpoint novo e mantém o padrão de busca de dados do web (`useEffect` + axios). Se o catálogo crescer ao ponto de doer, paginação é feature própria | y (assumido) |
| Componente do seletor | Input de busca + lista filtrada em HTML/Tailwind, no padrão do repo, em vez de biblioteca de combobox nova | `apps/web` não tem combobox/typeahead em uso; introduzir dependência para um campo é custo desproporcional | y (assumido) |

**Open questions:** nenhuma — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Vincular ao catálogo uma música já na setlist ⭐ MVP

**User Story**: Como usuário autorizado a montar a ordem de culto, quero
vincular ao repertório uma música que digitei avulsa — e poder desfazer esse
vínculo — para não precisar apagar e recriar a entrada só para ganhar a
ligação com o catálogo.

**Why P1**: É o defeito de verdade (campo aceito e descartado); as outras
histórias são a superfície que torna o vínculo usável.

**Acceptance Criteria**:

1. WHEN um usuário autorizado faz `PATCH /celebrations/setlists/songs/:id`
   com `song_id` de uma música do catálogo da própria congregação THEN o
   sistema SHALL persistir `song_id` na `SetlistSong` e devolver o registro
   atualizado com esse valor.
2. WHEN esse mesmo PATCH informa **apenas** `song_id` THEN o sistema SHALL
   deixar `title`/`key`/`bpm`/`link`/`notes` exatamente como estavam (o
   vínculo não reimporta valores do catálogo).
3. WHEN o PATCH informa `song_id: null` THEN o sistema SHALL gravar
   `song_id = NULL`, preservando os demais campos.
4. WHEN o PATCH informa `song_id` de uma música de outro tenant/congregação
   (ou inexistente) THEN o sistema SHALL responder 404 e não alterar a
   `SetlistSong`.
5. WHEN um usuário autorizado usa a ação de vincular na tela da ordem de
   culto sobre uma música sem `song_id` THEN o sistema SHALL permitir
   escolher uma música do catálogo e refletir o vínculo na lista sem
   recarregar a página inteira.

**Independent Test**: criar uma `SetlistSong` avulsa com tom "G"; PATCH com
`song_id` de uma música cujo tom no catálogo é "D"; confirmar `song_id`
gravado **e** tom ainda "G"; PATCH com `song_id: null`; confirmar
desvinculada e tom ainda "G".

---

### P1: Escolher do catálogo com busca e contexto ⭐ MVP

**User Story**: Como usuário que monta a setlist, quero buscar a música do
catálogo por título e ver tom, BPM e quando ela foi tocada pela última vez
antes de escolher, para achar rápido num catálogo grande e não repetir a
mesma música toda semana.

**Why P1**: É o ponto de uso do repertório. Um `<select>` com o catálogo
inteiro e só o título deixa de funcionar bem antes das 50 músicas.

**Acceptance Criteria**:

1. WHEN o form de adicionar música é aberto e o catálogo tem músicas THEN o
   sistema SHALL exibir um campo de busca e a lista de músicas mostrando,
   por música, título, tom (`key`, ou `key_alt` quando `key` é nulo), BPM
   quando houver, e a última vez tocada (`last_played_at` formatado, ou
   "nunca tocada" quando nulo).
2. WHEN o usuário digita texto no campo de busca THEN o sistema SHALL
   filtrar a lista por correspondência parcial no título, ignorando
   diferença de caixa e de acento.
3. WHEN a busca não encontra nenhuma música THEN o sistema SHALL exibir
   estado vazio explícito, com o caminho de cadastrar a música nova (ver
   história seguinte), sem esconder o campo de busca.
4. WHEN o usuário escolhe uma música da lista THEN o sistema SHALL
   pré-preencher `title`/`key`/`bpm`/`link` do form com os valores do
   catálogo, mantendo os campos editáveis, e enviar `song_id` no POST.
5. WHEN o catálogo da congregação está vazio THEN o sistema SHALL informar
   que não há repertório cadastrado e oferecer o caminho de cadastro, em vez
   de omitir a área do catálogo.
6. WHEN a carga do catálogo falha THEN o sistema SHALL manter o form de
   texto livre utilizável e exibir mensagem de que o catálogo não pôde ser
   carregado (comportamento de hoje, preservado).

**Independent Test**: com 3 músicas no catálogo (uma sem `key` mas com
`key_alt`, uma nunca tocada, uma tocada), abrir o form, ver os três
contextos corretos; buscar por termo com acento invertido ("orações" vs
"oracoes") e achar; escolher uma e ver o form pré-preenchido.

---

### P1: Cadastrar no repertório sem sair da ordem de culto ⭐ MVP

**User Story**: Como usuário autorizado, quero cadastrar uma música nova no
repertório de dentro do form da setlist e já usá-la ali, para não interromper
a montagem da ordem de culto para ir a `/repertorio` e voltar.

**Why P1**: Sem isso, catálogo vazio e música nova continuam empurrando o
usuário para o texto livre — e o vínculo nunca acontece.

**Acceptance Criteria**:

1. WHEN um usuário com papel autorizado a escrever no catálogo
   (`admin_congregation`, `pastor`, `tenant_admin`, `ministry_leader`)
   aciona o cadastro a partir do form da setlist THEN o sistema SHALL
   permitir informar título (obrigatório), tom, tom alternativo, BPM e os
   links (genérico, YouTube, Spotify, Cifra Club) e criar o `Song` via
   `POST /songs`.
2. WHEN o cadastro é concluído com sucesso THEN o sistema SHALL selecionar a
   música recém-criada no form da setlist — `song_id` preenchido e campos
   pré-preenchidos — sem que o usuário precise buscá-la de novo.
3. WHEN o título informado está vazio ou só com espaços THEN o sistema SHALL
   impedir o envio e exibir mensagem de campo obrigatório, sem chamar a API.
4. WHEN `POST /songs` falha (403, 4xx de validação, 5xx) THEN o sistema
   SHALL exibir a mensagem de erro derivada da resposta (`apiErrorMessage`,
   padrão já usado em `SongCatalogPanel`) e manter o que o usuário digitou,
   sem perder o form da setlist.
5. WHEN o usuário **não** tem papel autorizado a escrever no catálogo THEN o
   sistema SHALL não oferecer a ação de cadastrar — sem prejuízo de escolher
   do catálogo ou digitar avulso.

**Independent Test**: com catálogo vazio e papel `ministry_leader`, abrir o
form, cadastrar "Grande é o Senhor" em tom D, e confirmar que o form da
setlist já está com título/tom preenchidos e `song_id` da música nova;
repetir com papel sem permissão e confirmar que a ação não aparece.

---

### P2: Origem e referências visíveis na setlist

**User Story**: Como quem lê a ordem de culto (líder, músico), quero
distinguir na setlist o que veio do repertório do que é avulso, e alcançar as
referências da música (YouTube, Spotify, Cifra Club), para me preparar sem
caçar o link em outro lugar.

**Why P2**: Melhora a leitura e fecha as lacunas 5 e 6, mas não bloqueia
montar a setlist com vínculo (P1).

**Acceptance Criteria**:

1. WHEN a ordem de culto é lida (`GET` que devolve `ServiceOrder` com
   `setlist.songs`) THEN o sistema SHALL incluir, para cada `SetlistSong`
   com `song_id`, os dados de referência do `Song` vinculado — no mínimo
   `id`, `title`, `key`, `key_alt`, `youtube_link`, `spotify_link`,
   `cifra_club_link` — e `null` quando não há vínculo.
2. WHEN o `Song` vinculado foi removido do catálogo (`song_id` virou `NULL`
   por `SetNull`) THEN o sistema SHALL devolver a `SetlistSong` normalmente
   com a referência nula, sem erro, preservando os campos copiados.
3. WHEN a tela exibe uma música da setlist com vínculo THEN o sistema SHALL
   mostrar indicação visual de que ela vem do repertório e os links de
   referência disponíveis, cada um identificável (não um ícone genérico
   repetido sem rótulo acessível).
4. WHEN a tela exibe uma música da setlist sem vínculo THEN o sistema SHALL
   mostrá-la sem indicação de repertório e, para usuário autorizado, oferecer
   a ação de vincular (P1, AC5).

**Independent Test**: setlist com duas músicas, uma vinculada a um `Song`
com os três links e outra avulsa; ler o endpoint e conferir a referência
presente/nula; na tela, ver o indicador só na vinculada e a ação de vincular
só na avulsa.

---

## Edge Cases

- WHEN o PATCH de `SetlistSong` envia `song_id` como string que não é UUID
  THEN o sistema SHALL responder 400 (`@IsUUID()` já no DTO herdado).
- WHEN o PATCH envia `song_id: null` numa `SetlistSong` que já estava sem
  vínculo THEN o sistema SHALL responder 200 sem alteração efetiva (idempotente).
- WHEN duas músicas do catálogo têm o mesmo título (permitido — sem
  constraint de unicidade) THEN o seletor SHALL exibir as duas, distinguíveis
  pelo tom/BPM/última vez tocada.
- WHEN o título da música do catálogo é longo o suficiente para estourar a
  linha THEN a lista SHALL truncar sem quebrar o layout do form.
- WHEN o usuário escolhe uma música do catálogo e depois edita o tom no form
  antes de enviar THEN o valor editado SHALL prevalecer, com `song_id`
  preservado (comportamento já garantido por `repertorio-louvor` REPERT-02
  AC2 — esta feature não pode regredi-lo).
- WHEN o campo de busca recebe só espaços THEN a lista SHALL voltar ao estado
  não filtrado.

## Implicit-Requirement Dimensions Sweep (Large scope — completo)

| Dimensão | Cobertura |
|---|---|
| Input validation & bounds | `song_id` UUID ou `null` no PATCH (AC 400 em Edge Cases); título obrigatório no cadastro inline (História 3, AC3); `bpm ≥ 1` e links URL válidos herdados de `CreateSongDto` |
| Failure / partial-failure | Falha do `POST /songs` não derruba o form da setlist (História 3, AC4); falha da carga do catálogo mantém texto livre (História 2, AC6); `Song` removido do catálogo devolve referência nula (História 4, AC2) |
| Idempotency / retry / duplicate handling | `song_id: null` repetido é no-op (Edge Cases); título duplicado no catálogo permitido, distinguível no seletor (Edge Cases) |
| Auth boundaries & rate limits | PATCH de `SetlistSong` mantém `EDIT_ROLES` do `SetlistSongsController`; cadastro inline usa exatamente a gate de `POST /songs`, checada no backend e escondida no front (História 3, AC1/AC5). Sem rate limit novo — rotas autenticadas |
| Concurrency / ordering | `sequence` não muda nesta feature; vincular/desvincular não reordena. Duas abas vinculando a mesma `SetlistSong` — último PATCH vence, sem lock (aceitável: campo único, sem regra de negócio dependente) |
| Data lifecycle / expiry | Sem TTL. Remoção de `Song` continua `SetNull` (histórico preservado) — História 4, AC2 |
| Observability | Nada novo além do `AuditInterceptor`/logs padrão; não é rota de plataforma nem sessão de suporte |
| External-dependency failure | Os links são campos de texto armazenados — nenhuma chamada externa é feita para validar ou resolver |
| State-transition integrity | `song_id` transita entre `null` e um UUID válido da própria congregação, nos dois sentidos; nenhum outro campo muda como efeito colateral (História 1, AC2/AC3) |
| Multi-tenant isolation | `song_id` do PATCH é resolvido por `tenant_id` + `congregation_id` antes de gravar (História 1, AC4); RLS de `songs` (`007_rls_songs.sql`) e de `setlist_songs` inalteradas — nenhuma tabela nova nesta feature, portanto AD-001 não se aplica |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| SETREP-01 | P1: Vincular ao catálogo uma música já na setlist | T1, T8, T10 (+ `ec0d653` no DTO) | Done — verificado |
| SETREP-02 | P1: Escolher do catálogo com busca e contexto | T4, T5, T7, T10 | Done — verificado |
| SETREP-03 | P1: Cadastrar no repertório sem sair da ordem de culto | T6, T7, T10 | Done — verificado |
| SETREP-04 | P2: Origem e referências visíveis na setlist | T2, T3, T9, T10 | Done — verificado |

**Coverage:** 4 total, 4 mapeados a tasks, 0 sem mapeamento. Verifier independente: **PASS**, 20/20 ACs e 6/6 edge cases com evidência `file:line`; 6 mutações injetadas, 6 mortas. Ver `validation.md`.

---

## Success Criteria

- [ ] Uma música digitada avulsa numa setlist pode ganhar `song_id` por
      PATCH e pela tela, sem perder os campos já digitados.
- [ ] Com 50+ músicas no catálogo, achar e escolher a música certa no form da
      setlist é questão de digitar parte do título.
- [ ] Catálogo vazio deixa de ser um beco sem saída: dá para cadastrar a
      música e seguir montando a setlist na mesma tela.
- [ ] A setlist mostra, por música, se ela vem do repertório e quais
      referências existem.
- [ ] Nenhuma regressão nos critérios de `repertorio-louvor` REPERT-02
      (cópia no POST, override do usuário prevalecendo, `song_id` preservado).
