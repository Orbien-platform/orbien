# Repertório do Time de Louvor — Specification

## Problem Statement

O módulo de Celebrações já monta a ordem de culto e a escala de voluntários,
e `SetlistSong` já guarda título/tom/bpm/link por música — mas cada uma é
texto livre digitado do zero a cada culto, sem repertório reutilizável. Além
disso, essa tela mora inteira em `(admin)/celebracoes`: um músico escalado,
sem papel de liderança, não enxerga o repertório do culto em que vai tocar.
O objetivo é fechar as duas lacunas — catálogo de músicas reutilizável e
visão do músico — deixando o dado pronto para, no futuro, alimentar um app
mobile de músicos sem redesenho.

## Goals

- [ ] Repertório reutilizável: uma música cadastrada uma vez (tom padrão,
      bpm, link de cifra) pode ser reaproveitada em qualquer setlist futura,
      sem redigitar.
- [ ] Voluntário escalado enxerga, sem precisar de papel de liderança, a
      setlist do culto em que foi escalado no seu ministério.
- [ ] "Última vez tocada" de uma música do catálogo é derivável a partir do
      histórico de setlists, sem campo replicado que possa dessincronizar.

## Out of Scope

| Feature | Reason |
|---|---|
| App mobile de músicos | Fora do pedido atual — só a API precisa ficar pronta para esse consumo (mesmo endpoint que o web vai usar) |
| Catálogo por ministério (múltiplos repertórios) | Decidido: catálogo único por congregação (ver Assumptions) |
| Novo papel/flag "ministério de louvor" em `Ministry` | Decidido: permissão de editar catálogo segue a mesma gate de hoje (admin_congregation/pastor/tenant_admin/ministry_leader) — sem modelar pertencimento a ministério para esse fim |
| Deduplicação automática/fuzzy-match de títulos | Sem requisito de negócio declarado; busca por texto já reduz duplicata na prática |
| Edição da setlist pelo músico | Visão do músico é somente leitura |
| Exportação/PDF do catálogo isolado | Exportação de OC já existe (`pdf-export.service.ts`) e não muda aqui |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Escopo do catálogo | Um `Song` por `tenant_id`+`congregation_id`, sem `ministry_id` | Escolhido pelo usuário — cobre o caso comum (uma congregação, um repertório) mesmo com mais de um ministério de louvor | y |
| Permissão de editar catálogo | Mesma gate de hoje: `admin_congregation`, `pastor`, `tenant_admin`, `ministry_leader` (papéis do JWT, checados também no backend, não só no front) | Escolhido pelo usuário — evita modelar "pertencimento a ministério" sem regra de negócio clara ainda | y |
| `SetlistSong.song_id` obrigatório? | Opcional — `SetlistSong` continua podendo existir com campos livres, sem `song_id` | Escolhido pelo usuário — não força cadastro prévio no catálogo para montar setlist de última hora | y |
| Como a visão do músico decide "meu repertório" | Via `CelebrationAssignment` → `CelebrationMinistry.ministry_id` → `ServiceOrderItem` da mesma `celebration_instance_id` com `ministry_id` igual → `Setlist` daquele item — só do próprio ministério, não da instância inteira | O vínculo ministério↔item já existe (`ServiceOrderItem.ministry_id`); reaproveita o dado, não cria conceito novo. Escopo por ministério evita vazar repertório de outros ministérios da mesma instância | y |
| Item de OC sem `ministry_id` (responsável é pessoa, não ministério) | Ignorado na busca de repertório do voluntário — não entra na resposta de `my-assignments` | Sem `ministry_id` não há como ligar o item a uma escala de ministério | y |
| Unicidade de título no catálogo | Sem constraint de banco; lista com busca/typeahead ajuda a evitar duplicata manualmente | Não há requisito de negócio para bloquear título repetido (pode haver duas versões/arranjos da mesma música) | y (assumido, sem objeção levantada) |
| Exclusão de `Song` referenciada em setlists antigas | Permitida; `SetlistSong.song_id` vira `NULL` (`onDelete: SetNull`), texto histórico (`title`/`key`/`bpm`/`link` já copiados no momento de adicionar) não muda | `SetlistSong` já denormaliza os campos ao vincular — apagar do catálogo não deve apagar histórico de execução | y (assumido) |
| RLS da tabela nova | Política forte `tenant_congregation_isolation` via `app_congregation_allowed()`, no mesmo padrão de `002_rls_celebration_schedules.sql`, entrando em novo script `00N_rls_*.sql` no pipeline do `bootstrap-db.sh` | Regra do monorepo: tabela de congregação nova não pode ficar só na migration comum do Prisma | y (decorre do CLAUDE.md, não é escolha nova) |

**Open questions:** nenhuma — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Cadastrar e listar músicas do catálogo ⭐ MVP

**User Story**: Como admin_congregation/pastor/tenant_admin/ministry_leader,
quero cadastrar uma música no catálogo da congregação (título, tom padrão,
bpm padrão, link de cifra/referência, notas) e listá-las, para não redigitar
os mesmos dados toda vez que monto uma setlist.

**Why P1**: É a base de dado de que as outras duas histórias dependem.

**Acceptance Criteria**:

1. WHEN um usuário com papel autorizado cria uma música com título THEN o
   sistema SHALL persistir `Song` com `tenant_id`/`congregation_id` do
   usuário e devolver 201 com o registro criado.
2. WHEN um usuário sem papel autorizado tenta criar/editar/remover uma
   música THEN o sistema SHALL responder 403.
3. WHEN um usuário autenticado (qualquer papel com acesso ao módulo de
   Celebrações) lista o catálogo THEN o sistema SHALL devolver apenas
   músicas da própria congregação (RLS), ordenadas por título.
4. WHEN um usuário edita tom/bpm/link/notas de uma música existente THEN o
   sistema SHALL atualizar o registro sem alterar `SetlistSong` já
   existentes que a referenciam (dado já copiado permanece como estava).
5. WHEN um usuário remove uma música referenciada por `SetlistSong` de
   setlists passadas THEN o sistema SHALL permitir a remoção e manter as
   entradas de `SetlistSong` com `song_id = NULL`, preservando os campos
   livres já copiados.

**Independent Test**: criar duas músicas via API/tela, editar uma, remover a
outra, e confirmar que a lista reflete o estado sem tocar em nenhuma
setlist.

---

### P1: Reaproveitar música do catálogo numa setlist ⭐ MVP

**User Story**: Como usuário autorizado a montar a ordem de culto, quero
escolher uma música do catálogo ao adicionar um item na setlist — e ainda
poder digitar avulso — para não repetir tom/bpm/link manualmente, mas sem
travar quando a música é nova ou pontual.

**Why P1**: É o ponto de uso do catálogo — sem isso ele fica cadastrado e
nunca é consumido.

**Acceptance Criteria**:

1. WHEN um usuário adiciona uma `SetlistSong` informando `song_id` de uma
   música do catálogo (sem sobrescrever campos) THEN o sistema SHALL copiar
   `title`/`key`/`bpm`/`link` do `Song` para os campos da `SetlistSong` no
   momento da criação.
2. WHEN um usuário adiciona uma `SetlistSong` informando `song_id` e também
   um ou mais campos (ex.: `key` diferente, por causa de transposição no
   culto) THEN o sistema SHALL manter o valor informado no campo em vez do
   valor padrão do catálogo, preservando o vínculo (`song_id` continua
   setado).
3. WHEN um usuário adiciona uma `SetlistSong` sem `song_id` (texto livre)
   THEN o sistema SHALL aceitar normalmente, como já funciona hoje.
4. WHEN `song_id` referencia uma música de outro tenant/congregação THEN o
   sistema SHALL rejeitar com 400/404 (RLS + validação de posse).

**Independent Test**: criar uma música no catálogo com tom "D", adicionar
duas `SetlistSong` diferentes referenciando-a — uma sem override (fica tom
"D") e outra com `key: "E"` (fica tom "E", mas com `song_id` preenchido nas
duas).

---

### P1: Visão do músico — meu repertório na minha escala ⭐ MVP

**User Story**: Como voluntário escalado num ministério (ex.: músico,
vocal), quero ver, junto da minha escala, a setlist do culto em que fui
escalado — título, tom, bpm e link de cada música — sem precisar de papel
de liderança, para me preparar antes do culto.

**Why P1**: É a dor concreta que motivou a feature — hoje esse voluntário
não tem acesso nenhum ao repertório.

**Acceptance Criteria**:

1. WHEN um voluntário consulta suas escalas (endpoint de `my-assignments`)
   THEN o sistema SHALL incluir, para cada escala cuja `CelebrationMinistry`
   tem um `ServiceOrderItem` correspondente (mesma `celebration_instance_id`
   e mesmo `ministry_id`) com `Setlist`, a lista de `SetlistSong` (título,
   tom, bpm, link, sequência) daquele item.
2. WHEN a escala do voluntário não tem `ServiceOrderItem`/`Setlist`
   correspondente ainda (ordem de culto não publicada ou item sem setlist)
   THEN o sistema SHALL devolver a escala normalmente com o campo de
   repertório vazio/nulo, sem erro.
3. WHEN o voluntário tenta acessar a setlist de uma escala que não é dele
   (por id direto, fora do endpoint de `my-assignments`) THEN o sistema
   SHALL continuar aplicando a mesma regra de acesso já existente para
   `Setlist`/`SetlistSong` (hoje restrita a papéis de gestão) — a exposição
   nova é só dentro do próprio `my-assignments`.
4. WHEN o front do `apps/web` recebe essa resposta THEN o sistema SHALL
   exibir uma tela/seção somente leitura com a escala e o repertório
   associado, acessível a qualquer usuário autenticado (não só papéis de
   gestão).

**Independent Test**: escalar um voluntário comum numa `CelebrationMinistry`
cujo `ServiceOrderItem` tem `Setlist` com 2 músicas; chamar
`my-assignments` com o token desse voluntário e ver as 2 músicas na
resposta; repetir sem setlist publicada e ver o campo vazio sem 500.

---

### P2: "Última vez tocada" no catálogo

**User Story**: Como usuário que monta a setlist, quero ver quando uma
música do catálogo foi tocada pela última vez, para variar o repertório em
vez de repetir a mesma música toda semana.

**Why P2**: Valor real, mas não bloqueia o uso básico do catálogo (P1) nem
a visão do músico (P1) — é uma consulta derivada por cima do que já existe.

**Acceptance Criteria**:

1. WHEN um usuário lista o catálogo THEN o sistema SHALL incluir, por
   música, a data da `CelebrationInstance` mais recente em que ela apareceu
   numa `SetlistSong` com `song_id` apontando pra ela (via
   `Setlist → ServiceOrderItem → ServiceOrder → CelebrationInstance`).
2. WHEN uma música nunca foi usada em nenhuma setlist THEN o sistema SHALL
   devolver esse campo como `null`, sem erro.

**Independent Test**: tocar a mesma música em duas instâncias de datas
diferentes; listar o catálogo e confirmar que a data devolvida é a mais
recente das duas.

---

## Edge Cases

- WHEN o título da música é vazio/só espaço THEN o sistema SHALL rejeitar
  com 400 (mesma validação que já existe em `CreateSetlistSongDto.title`).
- WHEN `bpm` é informado com valor ≤ 0 THEN o sistema SHALL rejeitar com 400
  (mesma regra de `@Min(1)` já usada em `SetlistSong`).
- WHEN `link` é informado e não é uma URL válida THEN o sistema SHALL
  rejeitar com 400 (`@IsUrl()`, mesmo padrão de `SetlistSong.link`).
- WHEN duas requisições tentam criar a "mesma" música (mesmo título) ao
  mesmo tempo THEN o sistema SHALL permitir ambas (sem constraint de
  unicidade — ver Assumptions); não é tratado como erro.
- WHEN um `tenant_admin`/`admin_congregation` acessa o catálogo de uma
  congregação irmã (mesmo tenant) THEN o sistema SHALL seguir a mesma regra
  já vigente para as demais tabelas de congregação — leitura permitida por
  RLS para esses papéis, escrita restrita à própria congregação (padrão
  `app_congregation_allowed`, ver pendência nº 1 do `docs/PENDENCIAS.md`).

## Implicit-Requirement Dimensions Sweep (Large scope — completo)

| Dimensão | Cobertura |
|---|---|
| Input validation & bounds | Título obrigatório, `bpm` ≥ 1, `link` URL válida — replicado do padrão de `SetlistSong` (ver Edge Cases) |
| Failure / partial-failure | Remoção de `Song` referenciada: `SetNull` em vez de bloquear ou cascatear (ver User Story 1, AC5) |
| Idempotency / retry / duplicate handling | N/A pra dedupe (ver Assumptions); criação normal de `Song`/`SetlistSong` já é idempotente por natureza (POST cria novo recurso, sem chave de dedupe declarada como requisito) |
| Auth boundaries & rate limits | Gate de edição = papéis existentes (ver Assumptions); leitura do catálogo = qualquer papel com acesso ao módulo de Celebrações; leitura de repertório próprio (P1 história 3) = o próprio voluntário, sem exigir papel de gestão. Sem rate limit novo — não é rota pública |
| Concurrency / ordering | `sequence` de `SetlistSong` já existe e não muda; catálogo não tem ordenação própria (lista por título) |
| Data lifecycle / expiry | Sem TTL; exclusão é manual e definitiva (hard delete de `Song`, ver AC5) |
| Observability | Nenhum requisito novo além do que `AuditInterceptor`/logs padrão já cobrem (catálogo não é rota de plataforma nem sessão de suporte) |
| External-dependency failure | N/A — `link` é só um campo de texto/URL armazenado, sem chamada externa (nenhuma validação de que a URL responde) |
| State-transition integrity | N/A — `Song` não tem máquina de estados; `SetlistSong` já tem a sua (fora do escopo desta feature) |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| REPERT-01 | P1: Cadastrar e listar músicas do catálogo | Tasks T1-T6 | Implementing (API done) |
| REPERT-02 | P1: Reaproveitar música do catálogo numa setlist | Tasks T7-T8 | Implementing (API done) |
| REPERT-03 | P1: Visão do músico — meu repertório na minha escala | Tasks T9, T13 | Implementing (API done, web pendente) |
| REPERT-04 | P2: "Última vez tocada" no catálogo | Task T5 | Implementing (API done) |

**Coverage:** 4 total, 4 mapeados a tasks, 0 sem mapeamento. API completa (T1-T9); web+e2e (T10-T14) em execução.

---

## Success Criteria

- [ ] Uma música cadastrada uma vez aparece disponível para seleção em
      qualquer nova `SetlistSong` da mesma congregação, sem redigitação.
- [ ] Um voluntário comum escalado num ministério com item de OC + setlist
      vê o repertório completo (título/tom/bpm/link) pela API de
      `my-assignments`, sem precisar de papel de liderança.
- [ ] RLS por congregação cobre a tabela nova nos mesmos moldes das demais
      tabelas de Celebrações (verificável pelo `bootstrap-db.sh` e pela
      suíte `test/rls`).
