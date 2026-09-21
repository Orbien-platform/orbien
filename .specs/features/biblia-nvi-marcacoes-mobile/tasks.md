# Bíblia NVI — Marcação de Versículos e Feed de Comentários (Mobile) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and
follow its Execute flow and Critical Rules.** Do not search for skill files
by filesystem path. The skill is the source of truth for the full flow
(per-task cycle, sub-agent delegation, adequacy review, Verifier,
discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not
proceed without it.**

---

**Design**: `.specs/features/biblia-nvi-marcacoes-mobile/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Gerado a partir do código existente (`apps/api/src/small-groups/*.spec.ts`,
> `apps/api/test/rls/*.spec.ts`, `apps/api/test/integration/songs.spec.ts`,
> `apps/mobile/src/__tests__/app/**`) e das convenções em `CLAUDE.md`/
> `apps/api/jest.config.js`/`apps/mobile/package.json`. Nenhum guideline
> escrito de cobertura foi encontrado além do que os testes existentes já
> praticam — a Coverage Expectation abaixo replica esse piso, sem exceder
> arbitrariamente.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------- | ---------------------- | ------------------ | ------------- |
| Isolamento RLS (`bible_verse_marks`, `bible_chapter_cache`) | RLS | Toda tabela nova: leitura/escrita cross-congregação e cross-tenant (padrão `event-registrations.spec.ts`); para `bible_chapter_cache`, o oposto — visibilidade compartilhada comprovada | `apps/api/test/rls/*.spec.ts` | `npm run test:rls -w orbien-backend` |
| Serviço/regra de domínio (`BibleReaderService`, `BibleVerseMarksService`, `ApiBibleTextProvider`) | unit | 1:1 com os ACs da spec (BIB-01 a BIB-10) + todo edge case listado | `apps/api/src/bible/*.spec.ts` | `npm run test:unit -w orbien-backend` |
| Controller (`BibleReaderController`, `BibleVerseMarksController`) | unit | Guards/roles + happy path + erros (400/403/404), service mockado — mesmo padrão de `prayer-requests.controller.spec.ts` | `apps/api/src/bible/*.controller.spec.ts` | `npm run test:unit -w orbien-backend` |
| DTOs (`create-bible-verse-mark.dto.ts` etc.) | unit | Cada `class-validator` decorator testado (válido + inválido), padrão de `apps/api/src/small-groups/dto/*.spec.ts` | `apps/api/src/bible/dto/*.spec.ts` | `npm run test:unit -w orbien-backend` |
| Fluxo HTTP completo (feed com paginação + cache-miss real) | integration | Um teste ponta a ponta contra banco de verdade, padrão `test/integration/songs.spec.ts` | `apps/api/test/integration/bible.spec.ts` | `npm run test:integration -w orbien-backend` |
| Referência estática (`bible-books.constant.ts`) | unit | Contagem de livros (66), testamento e soma de capítulos batem com a NVI | `apps/api/src/bible/*.spec.ts` | `npm run test:unit -w orbien-backend` |
| Telas mobile (`biblia/index`, `biblia/[book]/[chapter]`, `biblia/feed`) | unit (RTL) | Estado de loading/erro/vazio + interação principal da tela, mesmo padrão de `src/__tests__/app/(tabs)/conteudo.test.tsx` | `apps/mobile/src/__tests__/app/biblia/**/*.test.tsx` | `npm run test -w orbien-mobile` |
| Client mobile (`bible-client.ts`) | none (piso existente) | Sem teste próprio — `content-client.ts`/`escala-client.ts` também não têm; a cobertura vem das telas que os mockam (mesmo piso do repo) | — | — (coberto indiretamente) |
| Registro de rotas (`_layout.tsx`) | unit | Ajuste do `navigation-boot.test.tsx` se a lista de rotas protegidas mudar de forma que o teste já cobre | `apps/mobile/src/__tests__/app/navigation-boot.test.tsx` | `npm run test -w orbien-mobile` |
| `bible.module.ts` (wiring) | none | Build gate — mesmo piso de `small-groups.module.spec.ts`, que só existe porque o módulo tem lógica de import cruzado; aqui não há, então build gate basta | — | build gate only |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Depois de tasks só com unit test (backend ou mobile) | `npm run test:unit -w orbien-backend` **ou** `npm run test -w orbien-mobile` (conforme a task) |
| Full | Depois de tasks com RLS ou integration | Quick da task + `npm run test:rls -w orbien-backend` e/ou `npm run test:integration -w orbien-backend` (a task diz qual) |
| Build | Fim de cada fase | `npx turbo run build && npx turbo run lint && npx tsc --noEmit -p apps/api/tsconfig.json` |

---

## Execution Plan

### Phase B1: Schema, RLS e referência estática (fundação do backend)

```
T1 → T2 → T3 → T4 → T5 → T6
```

### Phase B2: Leitor da Bíblia (proxy + cache)

```
T7 → T8 → T9 → T10
```

### Phase B3: Marcação e feed

```
T11 → T12 → T13 → T14
```

### Phase M1: Client e ícones do mobile

```
T15 → T16
```

### Phase M2: Leitura e seleção de versículo

```
T17 → T18 → T19 → T20
```

### Phase M3: Marcação, feed e entrada

```
T21 → T22 → T23
```

---

## Task Breakdown

### T1: Modelos Prisma `BibleVerseMark` e `BibleChapterCache`

**What**: Adicionar os dois models ao `schema.prisma` (campos exatos do
design.md) e gerar a migration `add_bible_verse_marks_and_cache`.
**Where**: `apps/api/prisma/schema.prisma`, nova migration em
`apps/api/prisma/migrations/<timestamp>_add_bible_verse_marks_and_cache/`
**Depends on**: None
**Reuses**: Padrão de `PrayerRequest`/`GroupMessage` (schema.prisma:728,756)
**Requirement**: BIB-04, BIB-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `BibleVerseMark` com `tenant_id`, `congregation_id`, `person_id`,
      `version`, `book_code`, `chapter`, `verse_start`, `verse_end`,
      `comment`, `deleted_at`, `deleted_by_person_id`, timestamps, relations
      e índices conforme design.md
- [ ] `BibleChapterCache` com `version`, `book_code`, `chapter`, `verses`
      (Json), `fetched_at`, `@@unique([version, book_code, chapter])`, SEM
      `tenant_id`/`congregation_id`
- [ ] `prisma migrate dev` gera a migration sem erro, `prisma generate` roda
      limpo
- [ ] Build gate: `npx tsc --noEmit -p apps/api/tsconfig.json`

**Tests**: none (entity/schema)
**Gate**: build

---

### T2: RLS de `bible_verse_marks` (AD-001)

**What**: Script `020_rls_bible_verse_marks.sql` com a policy
`tenant_congregation_isolation` (USING/WITH CHECK simétricos via
`app_congregation_allowed`), bloco de verificação `DO $$`, e registro no
`bootstrap-db.sh` passo 3/8.
**Where**: `apps/api/prisma/migrations/020_rls_bible_verse_marks.sql`,
`apps/api/scripts/bootstrap-db.sh`
**Depends on**: T1
**Reuses**: `apps/api/prisma/migrations/015_rls_event_registrations.sql`
(template completo, inclusive o bloco `DO $$`)
**Requirement**: BIB-07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY`
- [ ] Policy `tenant_congregation_isolation` idêntica ao template AD-001
- [ ] Bloco `DO $$` que falha se não houver exatamente 1 policy simétrica
- [ ] Guard `if [ -f ... ]` novo no `bootstrap-db.sh`, na posição dos
      scripts de tabela nova (depois de `003`, junto de `012/014/015/016/018`)
- [ ] `bash scripts/bootstrap-db.sh` local roda sem erro no passo 3/8 e 7/8

**Tests**: RLS (via T4)
**Gate**: full

---

### T3: RLS de `bible_chapter_cache` (AD-005)

**What**: Script `021_rls_bible_chapter_cache.sql` habilitando RLS com
policy `PERMISSIVE FOR ALL TO app_user USING (true) WITH CHECK (true)`,
documentando a exceção (AD-005), e registro no `bootstrap-db.sh`.
**Where**: `apps/api/prisma/migrations/021_rls_bible_chapter_cache.sql`,
`apps/api/scripts/bootstrap-db.sh`
**Depends on**: T1
**Reuses**: Mesmo formato de cabeçalho comentado dos outros `0NN_rls_*.sql`;
`AD-005` em `.specs/STATE.md`
**Requirement**: BIB-01, BIB-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `ALTER TABLE bible_chapter_cache ENABLE/FORCE ROW LEVEL SECURITY`
- [ ] Policy única, `USING (true) WITH CHECK (true)`, comentário no cabeçalho
      referenciando AD-005 e explicando por que não há isolamento
- [ ] Guard novo no `bootstrap-db.sh`, na mesma seção do passo 3/8
- [ ] `bash scripts/bootstrap-db.sh` local roda sem erro

**Tests**: RLS (via T5)
**Gate**: full

---

### T4: Teste de RLS — isolamento de `bible_verse_marks`

**What**: `bible-verse-marks.spec.ts` com os 5 casos do padrão AD-001
(congregação vê a própria, congregação irmã não vê, listagem só traz a do
contexto, outro tenant não vê nada, escrita cross-congregação é negada).
**Where**: `apps/api/test/rls/bible-verse-marks.spec.ts`
**Depends on**: T2
**Reuses**: `apps/api/test/rls/event-registrations.spec.ts` (estrutura
completa: `beforeAll`/`afterAll`, `runAsTenantWithRole`)
**Requirement**: BIB-07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] 2 congregações do mesmo tenant + 1 de outro tenant, cada uma com uma
      marcação
- [ ] 5 testes: leitura própria, congregação irmã não vê, listagem filtrada,
      outro tenant não vê nada, escrita cross-congregação rejeitada
- [ ] `npm run test:rls -w orbien-backend` passa, incluindo este arquivo

**Tests**: RLS
**Gate**: full

---

### T5: Teste de RLS — visibilidade compartilhada de `bible_chapter_cache`

**What**: `bible-chapter-cache.spec.ts` provando que duas
congregações/tenants DIFERENTES leem a MESMA linha de cache — o oposto do
padrão de isolamento, documentando a intenção da AD-005.
**Where**: `apps/api/test/rls/bible-chapter-cache.spec.ts`
**Depends on**: T3
**Reuses**: `runAsTenantWithRole`/`prismaAdmin` de
`apps/api/test/helpers/rls.ts`
**Requirement**: BIB-01, BIB-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Cria 2 tenants/congregações distintos
- [ ] Insere uma linha de cache via `prismaAdmin` (sem tenant, como o design
      prevê)
- [ ] Os dois contextos de tenant, via `runAsTenantWithRole`, leem a mesma
      linha com sucesso (afirma o comportamento, não um bug)
- [ ] `npm run test:rls -w orbien-backend` passa, incluindo este arquivo

**Tests**: RLS
**Gate**: full

---

### T6: `bible-books.constant.ts` — lista canônica dos 66 livros

**What**: Const com `{ code, name, testament, chapters }` para os 66 livros
da Bíblia protestante (fatos estruturais, sem texto licenciado).
**Where**: `apps/api/src/bible/bible-books.constant.ts` +
`apps/api/src/bible/bible-books.constant.spec.ts`
**Depends on**: None (paralelo a T1-T5, mas listado em sequência por ficar
na mesma fase)
**Reuses**: Nenhum código existente — dado de referência novo
**Requirement**: BIB-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] 66 entradas, 39 AT + 27 NT
- [ ] Cada entrada com `chapters` correto (contagem pública, sem texto)
- [ ] Teste unitário confere a contagem total e a soma AT+NT=66
- [ ] `npm run test:unit -w orbien-backend` passa

**Tests**: unit
**Gate**: quick

---

### T7: `BibleTextProvider` — interface e tipos

**What**: Interface `BibleTextProvider { getChapter(bookCode: string, chapter: number): Promise<VerseText[]> }`, tipo `VerseText = { number: number; text: string }`, e token de injeção NestJS (`BIBLE_TEXT_PROVIDER`).
**Where**: `apps/api/src/bible/bible-text-provider.interface.ts`
**Depends on**: T6
**Reuses**: Padrão de interface+token de outros providers do repo (se houver; senão, `useValue`/`useClass` padrão do Nest)
**Requirement**: BIB-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Interface e tipos exportados
- [ ] Token de DI exportado (`Symbol` ou string constante)
- [ ] Build gate: `npx tsc --noEmit -p apps/api/tsconfig.json`

**Tests**: none (entity/interface)
**Gate**: build

---

### T8: `ApiBibleTextProvider` — cliente HTTP do provedor externo

**What**: Implementação concreta de `BibleTextProvider`, configurada por
`BIBLE_API_BASE_URL`/`BIBLE_API_KEY`/`BIBLE_API_VERSION_ID` (env), com
tratamento de erro (rede, 4xx/5xx, timeout) propagando um erro tratável.
**Where**: `apps/api/src/bible/api-bible-text.provider.ts` +
`apps/api/src/bible/api-bible-text.provider.spec.ts`
**Depends on**: T7
**Reuses**: Nenhum HTTP client existente específico — usa `fetch`/`HttpService`
do Nest, conforme o que já for padrão do módulo mais próximo (checar
`@nestjs/axios` no `package.json` antes de escolher)
**Requirement**: BIB-01, BIB-03

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Implementa `getChapter` chamando a API externa configurada por env
- [ ] Erro de rede/timeout/4xx/5xx vira um erro tratável específico (não um
      throw genérico), consumido depois pelo `BibleReaderService`
- [ ] Testes unitários com fetch/HTTP mockado: sucesso, 404 (livro/capítulo
      inexistente no provedor), 5xx, timeout
- [ ] `npm run test:unit -w orbien-backend` passa

**Tests**: unit
**Gate**: quick

---

### T9: `BibleReaderService` — cache-first

**What**: `getChapter(bookCode, chapter)`: valida contra
`bible-books.constant.ts`, lê `bible_chapter_cache`; se ausente, chama o
provider, faz upsert (`ON CONFLICT (version, book_code, chapter) DO NOTHING`)
e retorna; se o provider falhar e não houver cache, propaga erro tratável.
**Where**: `apps/api/src/bible/bible-reader.service.ts` +
`.spec.ts`
**Depends on**: T8
**Reuses**: `PrismaService`, padrão de service de
`prayer-requests.service.ts` (estrutura de classe/DI)
**Requirement**: BIB-01, BIB-02, BIB-03

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Livro/capítulo inválido rejeita com erro de validação, SEM chamar o
      provider (mockado e verificado como não-chamado no teste)
- [ ] Cache hit não chama o provider
- [ ] Cache miss chama o provider, grava e retorna
- [ ] Provider falhando sem cache propaga erro tratável (mapeado a 502 no
      controller, T10)
- [ ] Corrida de cache-miss simulada (duas chamadas concorrentes) resolve
      sem erro de unique constraint (upsert idempotente)
- [ ] `npm run test:unit -w orbien-backend` passa

**Tests**: unit
**Gate**: quick

---

### T10: `BibleReaderController` + `bible.module.ts` (leitura)

**What**: `GET /bible/books` e
`GET /bible/books/:bookCode/chapters/:chapter`, com `JwtAuthGuard`+
`RolesGuard`+`TenantContextInterceptor` (autenticação exigida, sem filtro
de tenant na query). Cria `bible.module.ts` registrando o que existe até
aqui e importa em `app.module.ts`.
**Where**: `apps/api/src/bible/bible-reader.controller.ts` + `.spec.ts`,
`apps/api/src/bible/bible.module.ts`, `apps/api/src/app.module.ts` (editar)
**Depends on**: T9
**Reuses**: Guards/decorators de `prayer-requests.controller.ts`
**Requirement**: BIB-01, BIB-02, BIB-03

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `GET /bible/books` retorna a lista canônica (T6)
- [ ] `GET /bible/books/:bookCode/chapters/:chapter` retorna o capítulo
      (service mockado no teste de controller)
- [ ] 400 para livro/capítulo inválido, 502 para falha do provider sem cache
      (mapeados a partir do erro tratável de T9)
- [ ] `BibleModule` registrado em `app.module.ts`
- [ ] `npm run test:unit -w orbien-backend` passa; `npx turbo run build`
      compila os 5 apps

**Tests**: unit
**Gate**: full (inclui build, por registrar módulo novo em `app.module.ts`)

---

### T11: DTOs de marcação e feed

**What**: `create-bible-verse-mark.dto.ts` (`book_code`, `chapter`,
`verse_start`, `verse_end`, `comment` 3–2000 chars),
`update-bible-verse-mark.dto.ts` (`comment`), `list-bible-feed-query.dto.ts`
(`before`/`after`/`limit`, cursor).
**Where**: `apps/api/src/bible/dto/*.ts` + `*.spec.ts`
**Depends on**: T10
**Reuses**: `create-prayer-request.dto.ts` (limite 3–2000),
`list-group-messages-query.dto.ts` (cursor)
**Requirement**: BIB-04, BIB-05, BIB-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `comment`: `@MinLength(3)`/`@MaxLength(2000)` com mensagens em
      português
- [ ] `verse_start`/`verse_end`/`chapter`: inteiros positivos
- [ ] `before`/`after`/`limit` do feed espelham `ListGroupMessagesQueryDto`
- [ ] Teste unitário por decorator (válido + inválido), padrão dos specs de
      DTO existentes
- [ ] `npm run test:unit -w orbien-backend` passa

**Tests**: unit
**Gate**: quick

---

### T12: `BibleVerseMarksService`

**What**: `create`, `findFeed` (paginação por cursor, isolamento vem da
RLS — a query não filtra manualmente por congregação), `update`, `remove`
— com `is_mine`/`can_delete` na view (`can_delete` = autor OU papel de
moderação), validação do intervalo de versículo contra o capítulo
(via `BibleReaderService`), soft delete com `deleted_by_person_id` quando
for moderação.
**Where**: `apps/api/src/bible/bible-verse-marks.service.ts` + `.spec.ts`
**Depends on**: T11
**Reuses**: `prayer-requests.service.ts` (resolução de `person_id`,
`PrayerRequestView` como modelo de view), `BibleReaderService` (T9)
**Requirement**: BIB-04, BIB-05, BIB-06, BIB-08, BIB-09, BIB-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Criar marcação válida grava `tenant_id`/`congregation_id`/`person_id`
      do JWT
- [ ] Intervalo cruzando capítulo, ou fora do total de versículos do
      capítulo (via `BibleReaderService`), rejeita antes de gravar
- [ ] Usuário sem `congregation_id` resolvido: 403
- [ ] Editar: só autor; muda `comment`+`updated_at`, mantém `created_at`
- [ ] Apagar pelo autor: soft delete, `deleted_by_person_id` nulo
- [ ] Apagar por `admin_congregation`/`pastor`/`tenant_admin` de outra
      pessoa: soft delete com `deleted_by_person_id` preenchido
- [ ] Apagar/editar por quem não é autor nem moderador: 403
- [ ] `findFeed` pagina por cursor (`before`), exclui `deleted_at IS NOT NULL`
- [ ] `npm run test:unit -w orbien-backend` passa

**Tests**: unit
**Gate**: quick

---

### T13: `BibleVerseMarksController` + wiring final do `bible.module.ts`

**What**: `POST /bible/marks`, `GET /bible/feed`, `PATCH /bible/marks/:id`,
`DELETE /bible/marks/:id`, com `BIBLE_ROLES` (mesma lista de
`PRAYER_ROLES`). Completa o `bible.module.ts` com o controller e o service
novos.
**Where**: `apps/api/src/bible/bible-verse-marks.controller.ts` + `.spec.ts`,
`apps/api/src/bible/bible.module.ts` (editar)
**Depends on**: T12
**Reuses**: `PrayerRequestsController`/`GroupMessagesController` (estrutura
de guards/roles)
**Requirement**: BIB-04, BIB-06, BIB-08, BIB-09, BIB-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] 4 rotas com `@Roles(...BIBLE_ROLES)`, guards e interceptor corretos
- [ ] Controller spec cobre happy path + 400/403 de cada rota (service
      mockado)
- [ ] `npm run test:unit -w orbien-backend` passa; `npx turbo run build`
      compila

**Tests**: unit
**Gate**: full

---

### T14: Teste de integração HTTP — feed com cache-miss real

**What**: Teste ponta a ponta contra banco de verdade: cria tenant/
congregação/pessoa, chama `GET /bible/books/:book/chapters/:n` (cache-miss,
provider real substituído por um fake determinístico via override do
módulo), depois `POST /bible/marks` e `GET /bible/feed`, confirmando o item
aparece paginado.
**Where**: `apps/api/test/integration/bible.spec.ts`
**Depends on**: T13
**Reuses**: `apps/api/test/integration/songs.spec.ts` (estrutura completa:
`supertest`, `AppModule`, `PrismaClient` admin, `overrideProvider`)
**Requirement**: BIB-01, BIB-02, BIB-04, BIB-06, BIB-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `BibleTextProvider` sobrescrito por um fake no `Test.createTestingModule`
      (sem chamada de rede real — nenhuma credencial precisa existir para
      este teste passar)
- [ ] Fluxo completo: leitura de capítulo → criação de marcação → feed
      mostra o item
- [ ] `npm run test:integration -w orbien-backend` passa

**Tests**: integration
**Gate**: full

---

### T15: `src/lib/bible/bible-client.ts` + `types.ts` (mobile)

**What**: Client fino sobre `authenticatedRequest` para as 6 operações
(`getBooks`, `getChapter`, `createMark`, `updateMark`, `deleteMark`,
`getFeed`).
**Where**: `apps/mobile/src/lib/bible/bible-client.ts`,
`apps/mobile/src/lib/bible/types.ts`
**Depends on**: T13 (contrato da API precisa existir)
**Reuses**: `apps/mobile/src/lib/content/content-client.ts` (estrutura)
**Requirement**: BIB-01, BIB-02, BIB-04, BIB-06, BIB-08, BIB-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] 6 funções tipadas, cada uma chamando `authenticatedRequest` com o
      método/rota corretos
- [ ] Tipos espelham exatamente o design.md (`BibleBook`, `BibleVerse`,
      `BibleChapter`, `BibleVerseMark`, `BibleFeedPage`)
- [ ] Build gate: `npx tsc --noEmit` do mobile (via `npm run build -w orbien-mobile`)

**Tests**: none (piso do repo — ver matrix)
**Gate**: build

---

### T16: Ícones novos em `theme/icons.ts`

**What**: Acrescentar os ícones que as telas de Bíblia vão precisar (ex.
`BookOpen`, `Highlighter` ou `MessageSquare`, `ChevronRight` se ainda não
exportado) por subpath do lucide.
**Where**: `apps/mobile/src/lib/theme/icons.ts`
**Depends on**: None (independente, mas ordenado aqui por fase)
**Reuses**: Padrão já usado nesse arquivo (subpath, nunca barril)
**Requirement**: BIB-01, BIB-04, BIB-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Cada ícone novo importado via `lucide-react-native/icons/<nome>`
- [ ] Build gate: `npx tsc --noEmit` do mobile

**Tests**: none (config)
**Gate**: build

---

### T17: `BookChapterPickerModal` — seletor customizado

**What**: Componente de modal com lista de livros (busca `GET /bible/books`
uma vez) → lista de capítulos do livro escolhido, usando `Card`/`FlatList`
(sem lib de picker, conforme achado da exploração).
**Where**: `apps/mobile/src/components/BookChapterPickerModal.tsx` +
`apps/mobile/src/__tests__/components/BookChapterPickerModal.test.tsx`
**Depends on**: T15, T16
**Reuses**: `Card`, `Screen`/modal pattern do repo, `useTheme()`
**Requirement**: BIB-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Abre lista de livros, depois lista de capítulos do livro escolhido
- [ ] `onSelect(bookCode, chapter)` disparado ao confirmar
- [ ] Alvo de toque ≥48px (`touchTarget`), cores por papel semântico
- [ ] Teste RTL: abre, seleciona livro, seleciona capítulo, confirma
      callback chamado com os valores certos
- [ ] `npm run test -w orbien-mobile` passa

**Tests**: unit (RTL)
**Gate**: quick

---

### T18: Tela `src/app/biblia/index.tsx`

**What**: Tela de entrada — abre o `BookChapterPickerModal`, navega para
`/biblia/[book]/[chapter]` ao confirmar, e tem atalho para `/biblia/feed`.
**Where**: `apps/mobile/src/app/biblia/index.tsx` +
`apps/mobile/src/__tests__/app/biblia/index.test.tsx`
**Depends on**: T17
**Reuses**: `Screen`, `AppButton`, padrão de tela de `conteudo.tsx`
**Requirement**: BIB-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Abre o picker, navega ao confirmar
- [ ] Botão/atalho visível para o feed
- [ ] Teste RTL cobre a navegação (mock de `expo-router`)
- [ ] `npm run test -w orbien-mobile` passa

**Tests**: unit (RTL)
**Gate**: quick

---

### T19: Tela `src/app/biblia/[book]/[chapter].tsx` — leitura + seleção

**What**: Busca o capítulo (`getChapter`), exibe versículos numerados,
permite tocar no primeiro e no último versículo do intervalo desejado
(destaca visualmente o intervalo), CTA "Comentar" habilitado só com
intervalo selecionado. Estados de erro (`StatusMessage`, retry) e loading.
**Where**: `apps/mobile/src/app/biblia/[book]/[chapter].tsx` +
`apps/mobile/src/__tests__/app/biblia/[book]/[chapter].test.tsx`
**Depends on**: T18
**Reuses**: `StatusMessage`, `describeLoadError`, padrão de erro/loading de
`conteudo.tsx`
**Requirement**: BIB-01, BIB-02, BIB-03, BIB-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Renderiza os versículos numerados do capítulo pedido
- [ ] Falha de rede sem cache mostra `StatusMessage` com retry (AC de erro
      da P1)
- [ ] Toque no 1º e no último versículo define o intervalo, destaque visual
      aplicado
- [ ] CTA "Comentar" só habilita com intervalo válido selecionado
- [ ] Teste RTL cobre: sucesso, erro+retry, seleção de intervalo
- [ ] `npm run test -w orbien-mobile` passa

**Tests**: unit (RTL)
**Gate**: quick

---

### T20: Registro das rotas de Bíblia em `_layout.tsx`

**What**: Adicionar `biblia/index`, `biblia/[book]/[chapter]` e
`biblia/feed` ao `Stack.Protected` de `apps/mobile/src/app/_layout.tsx`,
com `title` apropriado.
**Where**: `apps/mobile/src/app/_layout.tsx`
**Depends on**: T19
**Reuses**: Entradas existentes (`grupo/[id]`, `post/[id]`)
**Requirement**: BIB-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] 3 `Stack.Screen` novas, com `title` em português
- [ ] `apps/mobile/src/__tests__/app/navigation-boot.test.tsx` continua
      passando (ou é atualizado se a asserção listar rotas explicitamente)
- [ ] `npm run test -w orbien-mobile` passa; `npx turbo run build` compila

**Tests**: unit (via `navigation-boot.test.tsx` se aplicável)
**Gate**: full

---

### T21: Composer de comentário + `createMark`

**What**: Modal/tela de composição do comentário (3–2000 caracteres,
validação client-side espelhando o DTO do backend), chamando `createMark`
ao confirmar; volta para a leitura com a marcação já refletida.
**Where**: `apps/mobile/src/app/biblia/[book]/[chapter].tsx` (composer
embutido ou arquivo próprio, conforme ficar mais coeso) +
teste correspondente
**Depends on**: T20
**Reuses**: `Input`/`AppButton`, `Alert` para erro
**Requirement**: BIB-04, BIB-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Validação de tamanho do comentário antes de chamar a API
- [ ] Sucesso fecha o composer e confirma visualmente
- [ ] Erro do backend (400/403/502) exibido via `Alert`/`StatusMessage`
- [ ] Teste RTL: submissão válida chama `createMark`; comentário curto
      demais bloqueia o submit
- [ ] `npm run test -w orbien-mobile` passa

**Tests**: unit (RTL)
**Gate**: quick

---

### T22: Tela `src/app/biblia/feed.tsx`

**What**: Lista paginada (cursor `before`) das marcações da congregação,
com estado vazio/erro, edição/exclusão da própria marcação e exclusão por
moderador (usa `is_mine`/`can_delete` da API), toque no item abre o
capítulo correspondente com o intervalo em destaque.
**Where**: `apps/mobile/src/app/biblia/feed.tsx` +
`apps/mobile/src/__tests__/app/biblia/feed.test.tsx`
**Depends on**: T21
**Reuses**: Padrão de paginação/estado vazio/guard de duplo toque de
`conteudo.tsx` (adaptado de offset para cursor)
**Requirement**: BIB-06, BIB-07, BIB-08, BIB-09, BIB-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Lista ordenada da mais recente para a mais antiga, "carregar mais"
      via cursor
- [ ] Estado vazio (`EmptyState`) e de erro (`StatusMessage`) distintos
- [ ] Botão de editar/apagar só aparece quando `can_delete`/`is_mine` permite
- [ ] Toque no item navega para `/biblia/[book]/[chapter]` com o intervalo
- [ ] Teste RTL: lista, paginação, estado vazio, exclusão (própria e como
      moderador)
- [ ] `npm run test -w orbien-mobile` passa

**Tests**: unit (RTL)
**Gate**: quick

---

### T23: Atalho no `perfil.tsx` para `/biblia`

**What**: Botão/link em `apps/mobile/src/app/(tabs)/perfil.tsx` navegando
para `/biblia` — único ponto de entrada, já que a tab bar não ganha aba
nova (STYLE-GUIDE §7).
**Where**: `apps/mobile/src/app/(tabs)/perfil.tsx` +
`apps/mobile/src/__tests__/app/(tabs)/perfil.test.tsx` (editar)
**Depends on**: T22
**Reuses**: Padrão de item de lista/botão já usado em `perfil.tsx` para
outros atalhos (ex. `notificacoes`, `indisponibilidade`)
**Requirement**: BIB-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Item/botão "Bíblia" navega para `/biblia`
- [ ] Teste RTL cobre a navegação (mesmo padrão dos outros atalhos do
      arquivo)
- [ ] `npm run test -w orbien-mobile` passa; `npx turbo run build && npx turbo run lint`
      limpos nos 5 apps (fim de feature)

**Tests**: unit (RTL)
**Gate**: build

---

## Phase Execution Map

```
Phase B1 → Phase B2 → Phase B3 → Phase M1 → Phase M2 → Phase M3

Phase B1:  T1 ──→ T2 ──→ T3 ──→ T4 ──→ T5 ──→ T6
Phase B2:  T7 ──→ T8 ──→ T9 ──→ T10
Phase B3:  T11 ──→ T12 ──→ T13 ──→ T14
Phase M1:  T15 ──→ T16
Phase M2:  T17 ──→ T18 ──→ T19 ──→ T20
Phase M3:  T21 ──→ T22 ──→ T23
```

Execução sequencial dentro de cada fase; fases também sequenciais aqui
porque M1 depende do contrato HTTP fechado em B3 (T13/T15), e B2/B3
dependem de T1/T6 (schema e referência estática).

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 2 models + 1 migration | ✅ Granular (uma unidade de schema) |
| T2 | 1 script RLS + 1 registro | ✅ Granular |
| T3 | 1 script RLS + 1 registro | ✅ Granular |
| T4 | 1 arquivo de teste | ✅ Granular |
| T5 | 1 arquivo de teste | ✅ Granular |
| T6 | 1 constante + 1 teste | ✅ Granular |
| T7 | 1 interface + tipos | ✅ Granular |
| T8 | 1 implementação + teste | ✅ Granular |
| T9 | 1 service + teste | ✅ Granular |
| T10 | 1 controller + 1 module (novo) + teste | ⚠️ OK — coeso (módulo nasce junto do 1º controller, como o padrão do repo) |
| T11 | 3 DTOs + testes | ⚠️ OK — coesos (mesma feature, cada um pequeno) |
| T12 | 1 service (4 métodos) + teste | ✅ Granular (um componente) |
| T13 | 1 controller + wiring do module + teste | ✅ Granular |
| T14 | 1 teste de integração | ✅ Granular |
| T15 | 1 client + 1 types | ✅ Granular |
| T16 | 1 arquivo de ícones | ✅ Granular |
| T17 | 1 componente + teste | ✅ Granular |
| T18 | 1 tela + teste | ✅ Granular |
| T19 | 1 tela + teste | ✅ Granular |
| T20 | 1 arquivo de layout | ✅ Granular |
| T21 | 1 composer + teste | ✅ Granular |
| T22 | 1 tela + teste | ✅ Granular |
| T23 | 1 edição de tela existente + teste | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ------------------------ | ---------------- | ------ |
| T1 | None | — | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T1 | T1→T2→T3 (sequencial na fase) | ✅ Match |
| T4 | T2 | T2→...→T4 | ✅ Match |
| T5 | T3 | ...→T5 | ✅ Match |
| T6 | None (paralelo, mas sequenciado na fase) | ...→T6 | ✅ Match |
| T7 | T6 | T6→T7 (fim de B1 → início B2) | ✅ Match |
| T8 | T7 | T7→T8 | ✅ Match |
| T9 | T8 | T8→T9 | ✅ Match |
| T10 | T9 | T9→T10 | ✅ Match |
| T11 | T10 | T10→T11 (fim de B2 → início B3) | ✅ Match |
| T12 | T11 | T11→T12 | ✅ Match |
| T13 | T12 | T12→T13 | ✅ Match |
| T14 | T13 | T13→T14 | ✅ Match |
| T15 | T13 | T14→T15 (fim de B3 → início M1; dependência real é T13, T14 só precisa terminar por ordem de fase) | ✅ Match |
| T16 | None | T15→T16 (sequencial na fase) | ✅ Match |
| T17 | T15, T16 | T16→T17 | ✅ Match |
| T18 | T17 | T17→T18 | ✅ Match |
| T19 | T18 | T18→T19 | ✅ Match |
| T20 | T19 | T19→T20 | ✅ Match |
| T21 | T20 | T20→T21 (fim de M2 → início M3) | ✅ Match |
| T22 | T21 | T21→T22 | ✅ Match |
| T23 | T22 | T22→T23 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | ---------------------------- | ------------------ | ------------ | ------ |
| T1 | Entity/schema | none | none | ✅ OK |
| T2 | RLS script | RLS (via T4) | RLS | ✅ OK |
| T3 | RLS script | RLS (via T5) | RLS | ✅ OK |
| T4 | RLS test | RLS | RLS | ✅ OK |
| T5 | RLS test | RLS | RLS | ✅ OK |
| T6 | Referência estática | unit | unit | ✅ OK |
| T7 | Interface/entity | none | none | ✅ OK |
| T8 | Serviço/regra (provider) | unit | unit | ✅ OK |
| T9 | Serviço/regra | unit | unit | ✅ OK |
| T10 | Controller + module | unit | unit (full gate p/ build) | ✅ OK |
| T11 | DTO | unit | unit | ✅ OK |
| T12 | Serviço/regra | unit | unit | ✅ OK |
| T13 | Controller + module wiring | unit | unit | ✅ OK |
| T14 | Fluxo HTTP completo | integration | integration | ✅ OK |
| T15 | Client mobile | none (piso do repo) | none | ✅ OK |
| T16 | Config (ícones) | none | none | ✅ OK |
| T17 | Componente mobile | unit (RTL) | unit | ✅ OK |
| T18 | Tela mobile | unit (RTL) | unit | ✅ OK |
| T19 | Tela mobile | unit (RTL) | unit | ✅ OK |
| T20 | Registro de rotas | unit (condicional) | unit | ✅ OK |
| T21 | Composer (tela) | unit (RTL) | unit | ✅ OK |
| T22 | Tela mobile | unit (RTL) | unit | ✅ OK |
| T23 | Tela mobile (edição) | unit (RTL) | unit | ✅ OK |

Nenhuma violação — todas as tasks que criam camada com teste exigido pela
matrix já incluem o teste na mesma task.

---
