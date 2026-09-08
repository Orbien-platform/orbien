# Repertório do Time de Louvor — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and follow
its Execute flow and Critical Rules.** Do not search for skill files by
filesystem path. The skill is the source of truth for the full flow
(per-task cycle, sub-agent delegation, adequacy review, Verifier,
discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed
without it.**

---

**Design**: `.specs/features/repertorio-louvor/design.md`
**Status**: Done. T1-T14 concluídas e commitadas (`23965f2`..`0909a0e`); 3 gaps do Verifier corrigidos (`b672a0a`, `4c7d14e`, `2d42484`); re-verify PASS. Ver `validation.md`.

---

## Test Coverage Matrix

> Gerado a partir de `apps/api/jest.config.js` (threshold global 100% em
> statements/branches/functions/lines, três projects: `unit`/`integration`/`rls`),
> `apps/web/package.json` (`vitest`, `playwright`), e amostragem de
> `create-setlist-song.dto.spec.ts`, `setlists.controller.spec.ts`,
> `celebration-assignment.service.spec.ts`, `(admin)/celebracoes/page.test.tsx`,
> `e2e/templates.spec.ts`. Nenhuma diretriz de teste em `CLAUDE.md`/`AGENTS.md`
> além do que os configs já impõem — threshold 100% da API é a diretriz mais
> forte que existe no repo, aplicada como piso.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| DTO (validação) — `CreateSongDto`, `UpdateSongDto`, `CreateSetlistSongDto` (campo `song_id` novo) | unit | Todo campo/regra de validação, aceito e rejeitado (piso: mesma profundidade de `create-setlist-song.dto.spec.ts`) | `apps/api/src/celebrations/dto/*.spec.ts` | `npm run test:unit -w orbien-backend` |
| Serviço (`SongsService`, `SetlistSongsService` estendido, `CelebrationAssignmentService.getMyAssignments` estendido) | unit | 1:1 com os ACs de REPERT-01/02/03/04 + todo edge case listado na spec; 100% branch (threshold global) | `apps/api/src/celebrations/*.service.spec.ts` | `npm run test:unit -w orbien-backend` |
| Controller (`SongsController`) | unit | Roles corretos por rota (metadata `@Roles`) + delegação ao service, mesmo padrão de `setlists.controller.spec.ts` | `apps/api/src/celebrations/*.controller.spec.ts` | `npm run test:unit -w orbien-backend` |
| Isolamento multi-tenant (tabela `songs`) | RLS | Leitura/escrita cross-congregação negada para `admin_congregation`; `tenant_admin` lê e escreve congregação irmã; `USING = WITH CHECK` (AD-001) | `apps/api/test/rls/*.spec.ts` | `npm run test:rls -w orbien-backend` |
| Componente web (`SongCatalogPanel`, aba nova em `celebracoes/page.tsx`, seletor de música em `ServiceOrderView`, cartão de `voluntarios/page.tsx`) | unit (vitest + RTL) | Render + interação principal + estado vazio/erro, mesmo padrão de `page.test.tsx` existente | `apps/web/src/**/*.test.tsx` | `npm run test -w orbien-web` |
| Fluxo de tela (catálogo → setlist → visão do músico) | e2e | Caminho feliz completo (cadastrar música, usar na setlist, ver na escala) + um caso de ausência (sem setlist publicada) | `apps/web/e2e/*.spec.ts` | `npm run e2e -w orbien-web` |
| Prisma schema (`Song`, `SetlistSong.song_id`) | none | build gate only | `apps/api/prisma/schema.prisma` | build gate only |
| RLS script (`007_rls_songs.sql`) + `bootstrap-db.sh` | none (validado indiretamente pela suíte RLS acima) | build gate only + `bootstrap-db.sh` roda sem erro | `apps/api/scripts/bootstrap-db.sh` | build gate only |

## Gate Check Commands

| Gate Level | When to Use | Command |
|---|---|---|
| Quick | Depois de tasks só com teste unit (dto/service/controller/componente web) | `npm run test:unit -w orbien-backend` (API) ou `npm run test -w orbien-web` (web), conforme a task |
| Full | Depois de tasks com RLS ou e2e | `npm run test:rls -w orbien-backend` (RLS) ou `npm run e2e -w orbien-web` (e2e) |
| Build | Ao fechar cada fase e ao final da feature | `npm run build:api && npm run build:web && npx turbo run lint && npm run test:cov -w orbien-backend && npm run test -w orbien-web` |

---

## Execution Plan

### Phase 1: Schema + RLS (fundação de dado)

```
T1 → T2 → T3
```

### Phase 2: Catálogo de músicas (API)

```
T4 → T5 → T6
```

### Phase 3: Vínculo catálogo ↔ setlist (API)

```
T7 → T8
```

### Phase 4: Visão do músico (API)

```
T9
```

### Phase 5: Catálogo (web)

```
T10 → T11
```

### Phase 6: Seletor de música + visão do músico (web)

```
T12 → T13
```

### Phase 7: E2E de ponta a ponta

```
T14
```

---

## Task Breakdown

### T1: Adicionar `Song` ao schema Prisma e gerar migration

**What**: Adicionar `model Song` (tenant_id, congregation_id, title, key, bpm,
link, notes) e o campo `song_id`/relação `song` (opcional, `onDelete: SetNull`)
em `SetlistSong`; adicionar `songs Song[]` em `Tenant` e `Congregation`. Gerar
a migration do Prisma (`npx prisma migrate dev --name add_songs_catalog` a
partir de `apps/api`, contra o Postgres local já provisionado) e rodar
`npx prisma generate`.
**Where**: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_add_songs_catalog/`
**Depends on**: None
**Reuses**: padrão de campos/índices de `Setlist`/`SetlistSong` (linhas 1153-1189 do schema atual)
**Requirement**: REPERT-01, REPERT-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `model Song` existe com os campos do design, `@@map("songs")`, índices `[tenant_id, congregation_id]` e `[tenant_id, id]`
- [ ] `SetlistSong.song_id` é opcional, com relação `onDelete: SetNull`
- [ ] `Tenant`/`Congregation` têm `songs Song[]`
- [ ] Migration gerada e aplicada localmente sem erro (`npx prisma migrate dev` sai com código 0)
- [ ] `npx prisma generate` roda sem erro

**Tests**: none (schema/migration — build gate only)
**Gate**: build (`npm run build:api`)

---

### T2: `007_rls_songs.sql` + wiring no `bootstrap-db.sh`

**What**: Criar `apps/api/prisma/migrations/007_rls_songs.sql` — `ENABLE`/`FORCE ROW LEVEL SECURITY`
em `songs` e uma policy `tenant_congregation_isolation` usando
`app_congregation_allowed(congregation_id)` diretamente em `USING` e `WITH CHECK`
(seguindo AD-001 — não replicar o padrão pré-`003`). Adicionar o `if [ -f prisma/migrations/007_rls_songs.sql ]; then run_sql_file ...; fi`
no passo 3 do `bootstrap-db.sh`, depois do bloco de `003_rls_admin_write.sql`.
**Where**: `apps/api/prisma/migrations/007_rls_songs.sql`, `apps/api/scripts/bootstrap-db.sh`
**Depends on**: T1 (tabela `songs` precisa existir)
**Reuses**: `app_congregation_allowed()` de `003_rls_admin_write.sql`; estrutura de `002_rls_celebration_schedules.sql` como referência de formato
**Requirement**: REPERT-01 (isolamento multi-tenant do catálogo)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `007_rls_songs.sql` habilita RLS em `songs` e cria a policy com `app_congregation_allowed()` nos dois lados
- [ ] `bootstrap-db.sh` roda o script novo no lugar certo (depois de `003`)
- [ ] `bash apps/api/scripts/bootstrap-db.sh` (contra o Postgres local) roda do zero sem erro, incluindo o passo 7 de verificação (que varre `pg_policies` genericamente e cobre `songs` sem precisar de assert dedicado)

**Tests**: none (validado indiretamente por T3)
**Gate**: build (rodar o bootstrap local com sucesso)

---

### T3: Teste de isolamento RLS para `songs`

**What**: Adicionar casos em `apps/api/test/rls/isolation.spec.ts` (ou um spec
próprio no mesmo diretório) exercitando `songs`: `admin_congregation` da
congregação A não lê/escreve música da congregação B; `tenant_admin` sem
congregação fixada lê e escreve em qualquer congregação do tenant;
`USING`/`WITH CHECK` idênticos (checagem já genérica do `bootstrap-db.sh`,
aqui é o teste de comportamento via Prisma/RLS real).
**Where**: `apps/api/test/rls/isolation.spec.ts` (ou novo arquivo no mesmo diretório)
**Depends on**: T2
**Reuses**: helpers `runAsTenant`, `runAsUser`, `runAsTenantWithRole` de `test/helpers/rls.ts`
**Requirement**: REPERT-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Teste prova que `admin_congregation` da congregação A não lê música da congregação B
- [ ] Teste prova que `tenant_admin` lê e escreve música de qualquer congregação do tenant
- [ ] `npm run test:rls -w orbien-backend` passa, incluindo os casos novos

**Tests**: rls
**Gate**: full (`npm run test:rls -w orbien-backend`)

**Commit**: `feat(api): tabela songs com RLS por congregação`

---

### T4: `CreateSongDto` / `UpdateSongDto`

**What**: Criar os DTOs de criação/atualização do catálogo — `title` obrigatório
(`@IsString()`), `key`/`link`/`notes` opcionais (`@IsOptional() @IsString()`,
exceto `link` com `@IsUrl()`), `bpm` opcional (`@IsOptional() @IsInt() @Min(1)`).
`UpdateSongDto` com todos os campos opcionais (`PartialType` ou repetição
explícita, seguindo o padrão já usado em outros `update-*.dto.ts` do módulo).
**Where**: `apps/api/src/celebrations/dto/create-song.dto.ts`, `dto/update-song.dto.ts`, e seus `.spec.ts`
**Depends on**: T1 (nenhuma dependência de compilação real, mas o modelo `Song` já precisa existir para os tipos)
**Reuses**: `create-setlist-song.dto.ts`/`update-setlist-song.dto.ts` como referência direta de padrão
**Requirement**: REPERT-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Todo campo tem teste de aceitação e rejeição (mesmo padrão de `create-setlist-song.dto.spec.ts`)
- [ ] `npm run test:unit -w orbien-backend` passa

**Tests**: unit
**Gate**: quick

---

### T5: `SongsService`

**What**: Implementar `create`, `findAll` (ordenado por título, com
`last_played_at` calculado — join `Song → SetlistSong → Setlist → ServiceOrderItem → ServiceOrder → CelebrationInstance`,
`MAX(scheduled_date)` por música, `null` quando nunca usada), `update`, `remove`
— todos escopados por `tenant_id`+`congregation_id` do usuário.
**Where**: `apps/api/src/celebrations/songs.service.ts`, `songs.service.spec.ts`
**Depends on**: T4
**Reuses**: padrão de `setlists.service.ts`/`setlist-songs.service.ts` (uso de `PrismaService.client`, validação de posse via `findFirst`)
**Requirement**: REPERT-01, REPERT-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `create` persiste com `tenant_id`/`congregation_id` do usuário
- [ ] `findAll` devolve `last_played_at: null` para música nunca tocada, e a data mais recente para música tocada em mais de uma instância (AC de REPERT-04)
- [ ] `update`/`remove` só operam dentro da própria congregação (RLS + validação de posse)
- [ ] Cobertura de branch 100% no arquivo (threshold global do projeto)
- [ ] `npm run test:unit -w orbien-backend` passa

**Tests**: unit
**Gate**: quick

---

### T6: `SongsController` + registro no módulo

**What**: Rotas `POST/GET/PATCH/DELETE /songs`. Escrita (`POST`/`PATCH`/`DELETE`)
com `@Roles('admin_congregation','pastor','tenant_admin','ministry_leader')`
(mesma gate de hoje, decisão da Specify); `GET` sem `@Roles` extra além do
`JwtAuthGuard` padrão (qualquer usuário autenticado do módulo de Celebrações).
Registrar `SongsController`/`SongsService` em `celebrations.module.ts`.
**Where**: `apps/api/src/celebrations/songs.controller.ts`, `songs.controller.spec.ts`, `celebrations.module.ts` (modificado)
**Depends on**: T5
**Reuses**: `setlists.controller.ts`/`setlists.controller.spec.ts` como referência direta de padrão (incluindo o teste de metadata `@Roles` via `Reflector`)
**Requirement**: REPERT-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Cada rota de escrita exige a gate correta (teste via `Reflector`, mesmo padrão de `setlists.controller.spec.ts`)
- [ ] `GET /songs` acessível sem a gate de escrita
- [ ] Controller registrado em `celebrations.module.ts` sem quebrar `celebrations.module.spec.ts`
- [ ] `npm run test:unit -w orbien-backend` passa

**Tests**: unit
**Gate**: quick

**Commit**: `feat(api): catálogo de músicas (CRUD + última vez tocada)`

---

### T7: `song_id` opcional em `CreateSetlistSongDto`

**What**: Adicionar `song_id?: string` (`@IsOptional() @IsUUID()`) ao DTO
existente. Nenhum campo existente muda.
**Where**: `apps/api/src/celebrations/dto/create-setlist-song.dto.ts`, `create-setlist-song.dto.spec.ts` (modificados)
**Depends on**: T1
**Reuses**: os próprios campos já validados no arquivo
**Requirement**: REPERT-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `song_id` aceito quando UUID válido, rejeitado quando não-UUID
- [ ] `song_id` continua opcional — payload sem ele passa como antes (regressão)
- [ ] `npm run test:unit -w orbien-backend` passa

**Tests**: unit
**Gate**: quick

---

### T8: `SetlistSongsService` resolve `song_id`

**What**: Quando `song_id` vem no DTO, buscar o `Song` (validando `tenant_id`+`congregation_id`
do usuário — `NotFoundException` se não achar, cobrindo `song_id` de outro
tenant/congregação); usar `title`/`key`/`bpm`/`link` do `Song` como default
para os campos do DTO que **não** vieram explícitos no body, preservando
override quando vierem. Persistir `song_id` na `SetlistSong` criada.
**Where**: `apps/api/src/celebrations/setlist-songs.service.ts`, `setlist-songs.service.spec.ts` (modificados)
**Depends on**: T7
**Reuses**: validação de posse de `Setlist` já existente no `create()` atual do service
**Requirement**: REPERT-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `song_id` sem overrides copia `title`/`key`/`bpm`/`link` do catálogo (AC1 de REPERT-02)
- [ ] `song_id` com override em `key` mantém o valor do body, com `song_id` ainda setado (AC2)
- [ ] Sem `song_id`, comportamento idêntico ao atual — texto livre (AC3, regressão)
- [ ] `song_id` de outro tenant/congregação → `NotFoundException` (AC4)
- [ ] `npm run test:unit -w orbien-backend` passa

**Tests**: unit
**Gate**: quick

**Commit**: `feat(api): SetlistSong reaproveita música do catálogo (song_id opcional)`

---

### T9: `getMyAssignments` anexa repertório

**What**: Extrair `attachSetlists(assignments)` como método privado do
`CelebrationAssignmentService`. Para o conjunto de `celebration_instance_id`
dos assignments retornados, buscar em uma única query
`ServiceOrder.findMany({ where: { celebration_instance_id: { in: [...] } }, include: { items: { include: { setlist: { include: { songs: true } } } } } })`
e casar em memória por `(celebration_instance_id, ministry_id)` — item sem
`ministry_id` é ignorado. Anexar `setlist: { songs: [...] } | null` a cada
item do retorno de `getMyAssignments`.
**Where**: `apps/api/src/celebrations/celebration-assignment.service.ts` (modificado), `celebration-assignment.service.spec.ts` (modificado)
**Depends on**: T1
**Reuses**: a query e o shape existentes de `getMyAssignments` (linha 319)
**Requirement**: REPERT-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Assignment cujo `ServiceOrderItem` tem `ministry_id` igual ao da `CelebrationMinistry` e tem `Setlist` traz as músicas, ordenadas por `sequence` (AC1)
- [ ] Assignment sem `ServiceOrder`/item/setlist correspondente traz `setlist: null`, sem erro (AC2)
- [ ] Item de OC sem `ministry_id` é ignorado (não aparece como repertório de ninguém)
- [ ] A busca do repertório usa uma única query batched para múltiplos assignments (teste verifica que o mock de `serviceOrder.findMany` é chamado uma vez, não N vezes)
- [ ] `npm run test:unit -w orbien-backend` passa

**Tests**: unit
**Gate**: quick

**Commit**: `feat(api): my-assignments inclui o repertório do ministério do voluntário`

---

### T10: `SongCatalogPanel` (componente web)

**What**: Componente de listagem + criar/editar/remover músicas do catálogo,
consumindo `GET/POST/PATCH/DELETE /songs` via `src/lib/api.ts` (padrão
`useEffect`+axios, sem react-query). Recebe `canEdit: boolean` como prop
(mesma convenção de `TemplatesPanel`). Mostra `last_played_at` formatado
(`fmtDate`/equivalente) ou "nunca tocada".
**Where**: `apps/web/src/components/celebrations/SongCatalogPanel.tsx`, `SongCatalogPanel.test.tsx`
**Depends on**: T6
**Reuses**: `TemplatesPanel.tsx` como referência direta de estrutura (fetch, loading, empty state, canEdit)
**Requirement**: REPERT-01, REPERT-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Lista músicas, mostra estado vazio e estado de loading
- [x] Com `canEdit=false`, não mostra ações de criar/editar/remover
- [x] Com `canEdit=true`, cria/edita/remove e atualiza a lista local sem reload
- [x] `npm run test -w orbien-web` passa

**Tests**: unit (vitest)
**Gate**: quick

---

### T11: Aba "Repertório" em `(admin)/celebracoes`

**What**: Adicionar a aba (`Tabs.Panel value="repertorio"`) na página
existente, renderizando `SongCatalogPanel` com `canEdit={canAddSongs}` (mesma
gate já usada para adicionar música na setlist hoje — decisão da Specify).
**Where**: `apps/web/src/app/(admin)/celebracoes/page.tsx` (modificado), `page.test.tsx` (modificado)
**Depends on**: T10
**Reuses**: estrutura de abas já existente na página (`activeTab`, `Tabs.Panel`, `tabBtn`)
**Requirement**: REPERT-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Nova aba aparece na navegação e renderiza `SongCatalogPanel`
- [x] `canEdit` chega corretamente ao componente conforme o papel do usuário mockado no teste
- [x] `npm run test -w orbien-web` passa

**Tests**: unit (vitest)
**Gate**: quick

**Commit**: `feat(web): aba de repertório em Celebrações`

---

### T12: Seletor de música no formulário de `SetlistSong`

**What**: No formulário de adicionar/editar item de setlist dentro de
`ServiceOrderView.tsx` (ou subcomponente correspondente), adicionar um
combobox "escolher do catálogo" que, ao selecionar uma música, preenche
título/tom/bpm/link como valores default editáveis (mantendo os campos
livres visíveis e editáveis por baixo — sem travar entrada avulsa, decisão
da Specify). Envia `song_id` junto do payload quando uma música foi
selecionada.
**Where**: `apps/web/src/components/celebrations/ServiceOrderView.tsx` (modificado, ou arquivo próprio do form de música), teste correspondente
**Depends on**: T6, T8
**Reuses**: os campos de formulário já existentes para `SetlistSong` (título/tom/bpm/link/notas)
**Requirement**: REPERT-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Selecionar música do catálogo preenche os campos, ainda editáveis
- [x] Editar um campo depois de selecionar mantém `song_id` e envia o valor editado (não o do catálogo)
- [x] Continua possível adicionar música sem selecionar nada do catálogo (regressão)
- [x] `npm run test -w orbien-web` passa

**Tests**: unit (vitest)
**Gate**: quick

---

### T13: Repertório na aba "Meus Turnos"

**What**: Estender `MyAssignment` (front) com `setlist: { songs: {...}[] } | null`
e renderizar, em cada cartão de `voluntarios/page.tsx` (linhas 310-352), uma
seção com o repertório quando presente — título/tom/bpm, e o link como
`<button>` puro (não `<Button>`, por não ser CTA primário — convenção do
`CLAUDE.md` do monorepo) abrindo em nova aba. Quando `setlist` é `null`,
mostrar texto indicando que o repertório ainda não foi publicado.
**Where**: `apps/web/src/app/(admin)/voluntarios/page.tsx` (modificado)
**Depends on**: T9
**Reuses**: o próprio bloco de renderização de `myAssignments.map(...)` já existente

**Requirement**: REPERT-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Cartão com `setlist` presente mostra as músicas (título, tom, bpm, link clicável)
- [x] Cartão com `setlist: null` mostra o texto de "ainda não publicado", sem quebrar
- [x] `npm run test -w orbien-web` passa

**Tests**: unit (vitest)
**Gate**: quick

**Commit**: `feat(web): seletor de catálogo na setlist e repertório em Meus Turnos`

---

### T14: E2E de ponta a ponta

**What**: Cenário Playwright cobrindo o caminho feliz completo: logar como
papel autorizado, cadastrar música no catálogo (aba nova em `/celebracoes`),
adicionar essa música a uma `SetlistSong` de um item de OC reaproveitando o
catálogo, e verificar que ela aparece formatada corretamente. Mais um caso
de erro/ausência: escala sem `ServiceOrder`/setlist publicada mostra o
estado "ainda não publicado" em vez de quebrar a tela.
**Where**: `apps/web/e2e/repertorio.spec.ts` (novo)
**Depends on**: T11, T12, T13
**Reuses**: fixtures e padrão de login/seed de `e2e/templates.spec.ts` e `e2e/schedule.spec.ts`
**Requirement**: REPERT-01, REPERT-02, REPERT-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Caminho feliz completo passa (cadastro → uso na setlist → aparece corretamente)
- [x] Caso de ausência de setlist publicada não gera erro de console nem resposta HTTP inesperada (mesmo padrão de asserção das outras specs de e2e)
- [x] `npm run e2e -w orbien-web` passa

**Tests**: e2e
**Gate**: full

**Commit**: `test(web): e2e do repertório do time de louvor`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

Phase 1:  T1 ──→ T2 ──→ T3
Phase 2:  T4 ──→ T5 ──→ T6
Phase 3:  T7 ──→ T8
Phase 4:  T9
Phase 5:  T10 ──→ T11
Phase 6:  T12 ──→ T13
Phase 7:  T14
```

Execução estritamente sequencial dentro de cada fase. Fases também rodam em
sequência (Fase 3 depende do módulo criado na Fase 2; Fase 6 depende da API
das Fases 2/3/4; Fase 7 depende de tudo).

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1: Schema + migration | 1 arquivo de schema + 1 migration gerada | ✅ Granular |
| T2: RLS script + wiring | 1 arquivo SQL + 1 edição pontual em `bootstrap-db.sh` | ✅ Granular |
| T3: Teste RLS | 1 arquivo de teste | ✅ Granular |
| T4: DTOs do catálogo | 2 arquivos pequenos e coesos (create+update do mesmo recurso) | ✅ Granular (2-3 coisas relacionadas no mesmo conceito) |
| T5: `SongsService` | 1 service | ✅ Granular |
| T6: `SongsController` + módulo | 1 controller + 1 edição de registro | ✅ Granular |
| T7: DTO `song_id` | 1 campo em 1 arquivo | ✅ Granular |
| T8: `SetlistSongsService` estendido | 1 método de 1 service | ✅ Granular |
| T9: `getMyAssignments` estendido | 1 método de 1 service | ✅ Granular |
| T10: `SongCatalogPanel` | 1 componente | ✅ Granular |
| T11: Aba nova em `celebracoes` | 1 edição pontual de 1 página | ✅ Granular |
| T12: Seletor de música na setlist | 1 componente/form | ✅ Granular |
| T13: Repertório em "Meus Turnos" | 1 edição pontual de 1 página | ✅ Granular |
| T14: E2E | 1 spec | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | (início da Fase 1) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T1 | (início da Fase 2, após Fase 1) | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T1 | (início da Fase 3, após Fase 1/2) | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T1 | (Fase 4, após Fase 1) | ✅ Match |
| T10 | T6 | (Fase 5, após Fase 2) | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T6, T8 | (Fase 6, após Fases 2/3) | ✅ Match |
| T13 | T9 | (Fase 6, após Fase 4) | ✅ Match |
| T14 | T11, T12, T13 | (Fase 7, após Fases 5/6) | ✅ Match |

**Regra verificada**: nenhuma task depende de uma task de fase posterior — todas as dependências apontam para trás ou dentro da mesma fase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1 | Schema/migration | none | none | ✅ OK |
| T2 | RLS script | none (validado por T3) | none | ✅ OK |
| T3 | Teste RLS | rls | rls | ✅ OK |
| T4 | DTO | unit | unit | ✅ OK |
| T5 | Serviço | unit | unit | ✅ OK |
| T6 | Controller | unit | unit | ✅ OK |
| T7 | DTO | unit | unit | ✅ OK |
| T8 | Serviço | unit | unit | ✅ OK |
| T9 | Serviço | unit | unit | ✅ OK |
| T10 | Componente web | unit (vitest) | unit (vitest) | ✅ OK |
| T11 | Componente web (página) | unit (vitest) | unit (vitest) | ✅ OK |
| T12 | Componente web | unit (vitest) | unit (vitest) | ✅ OK |
| T13 | Componente web (página) | unit (vitest) | unit (vitest) | ✅ OK |
| T14 | Fluxo de tela | e2e | e2e | ✅ OK |

Nenhuma violação — nenhuma task adia teste para "task futura".
