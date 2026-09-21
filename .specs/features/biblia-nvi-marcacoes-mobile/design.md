# Bíblia NVI — Marcação de Versículos e Feed de Comentários (Mobile) Design

**Spec**: `.specs/features/biblia-nvi-marcacoes-mobile/spec.md`
**Status**: Draft

---

## Approach Exploration

### Approach A — Proxy + cache no backend (recomendada)

O `apps/mobile` nunca fala com a API bíblica externa. Toda leitura passa por
`GET /bible/...` na API do Orbien, que busca na externa só na primeira vez
por capítulo/versão e guarda o resultado numa tabela de cache global
(sem tenant/congregação — o texto da NVI é o mesmo pra todo mundo).
Marcação e feed são tabelas normais, isoladas por `tenant_id`+`congregation_id`
(AD-001).

**Trade-off**: mais um componente no backend (provider + cache), mas mantém
a chave da API externa só no servidor (mesmo princípio do `/api-proxy` do
web) e corta custo/latência repetida.

### Approach B — Mobile chama a API bíblica externa direto

Sem proxy: o app mobile guardaria a chave da API bíblica e leria o texto
direto do provedor.

**Rejeitada**: chave de API paga embutida no bundle do app é chave vazada —
qualquer um decompila o app e usa a chave por fora. Contraria o princípio já
estabelecido no `apps/web` (token só no servidor) sem ganho nenhum.

### Approach C — Importar a NVI inteira como seed, sem chamada em runtime

Adquirir o texto completo da NVI de uma vez (arquivo licenciado) e rodar
como seed de banco, sem depender de API externa em runtime.

**Rejeitada**: exige negociar e obter o dataset completo licenciado como um
passo prévio único e grande, em vez de uma chave de API que já é o caminho
que o usuário escolheu ("API bíblica licenciada" — decisão já tomada na
etapa de Specify). Também não é o que foi decidido: usaríamos o mesmo AD-005
de qualquer forma para não duplicar RLS por tenant num texto que não varia
por igreja.

**Escolhida: Approach A.**

---

## Architecture Overview

```mermaid
graph TD
    subgraph Mobile [apps/mobile]
        A[Tela biblia/index - seletor livro/capitulo] --> B[Tela biblia/[book]/[chapter] - leitura + selecao de versiculos]
        B --> C[Composer de comentario]
        D[Tela biblia/feed]
    end

    subgraph API [apps/api - BibleModule]
        E[BibleReaderController]
        F[BibleReaderService]
        G[BibleVerseMarksController]
        H[BibleVerseMarksService]
        I[(bible_chapter_cache - global, sem tenant)]
        J[(bible_verse_marks - tenant+congregacao, AD-001)]
        K[BibleTextProvider - HTTP client generico]
    end

    L[API bíblica externa licenciada]

    A -->|GET /bible/books| E
    B -->|GET /bible/books/:book/chapters/:n| E
    C -->|POST /bible/marks| G
    D -->|GET /bible/feed| G
    E --> F
    F -->|cache hit| I
    F -->|cache miss| K --> L
    F -->|upsert| I
    G --> H
    H --> J
    H -->|valida intervalo contra o capitulo| F
```

---

## Code Reuse Analysis

### Existing Components to Leverage

| Component | Location | How to Use |
| --------- | -------- | ---------- |
| `JwtAuthGuard` + `RolesGuard` + `@Roles` | `apps/api/src/auth/**` | Mesmo padrão de `PrayerRequestsController`/`GroupMessagesController` — rejeição barata por papel, autoridade real no service |
| `TenantContextInterceptor` | `apps/api/src/common/interceptors/tenant-context.interceptor.ts` | `SET LOCAL ROLE app_user` + `set_config` antes de qualquer query — necessário mesmo nas rotas de leitura de texto (autenticação), embora a query de texto não filtre por tenant |
| Padrão de service "resolve person_id do JWT" | `apps/api/src/small-groups/prayer-requests.service.ts:112-133` | Mesmo `requireCongregation`-like lookup via `userAccount.findUnique` |
| Paginação por cursor (`before`/`after`) | `apps/api/src/small-groups/dto/list-group-messages-query.dto.ts` | Copiado para `list-bible-feed-query.dto.ts` |
| `authenticatedRequest` | `apps/mobile/src/lib/auth/auth-client.ts` | Base de `bible-client.ts`, mesmo padrão de `content-client.ts` |
| `Card`, `Screen`, `StatusMessage`, `EmptyState`, `AppButton`, `Alert` | `apps/mobile/src/components/*` | Reaproveitados sem alteração nas telas novas |
| Padrão de tela com paginação/erro/vazio | `apps/mobile/src/app/(tabs)/conteudo.tsx` | Estrutura de `useEffect` + estados `error`/`empty`/`loading`, guard de duplo toque (`isLoadingMoreRef`) |
| Ícones por subpath | `apps/mobile/src/lib/theme/icons.ts` | Acrescenta os ícones novos que a Bíblia precisa (ex. `BookOpen`, `Highlighter`) |
| `AD-001` (RLS tenant+congregação) | `.specs/STATE.md` | Aplicado a `bible_verse_marks` |

### Integration Points

| System | Integration Method |
| ------ | ------------------- |
| API bíblica externa licenciada | `BibleTextProvider` — cliente HTTP genérico atrás de uma interface (`getChapter(bookCode, chapter): Promise<VerseText[]>`), configurado por `BIBLE_API_BASE_URL`/`BIBLE_API_KEY`/`BIBLE_API_VERSION_ID` (env do Render); nenhum código do resto do monorepo conhece o provedor concreto |
| Postgres (Prisma) | Dois modelos novos: `BibleVerseMark` (isolado por tenant+congregação) e `BibleChapterCache` (global, ver Tech Decisions) |
| Expo Router (`apps/mobile`) | Três rotas empilhadas novas fora de `(tabs)`, com entrada a partir de `Perfil` (STYLE-GUIDE §7 — tab bar já tem as 5 abas) |

---

## Components

### `BibleModule` (novo módulo NestJS)

- **Purpose**: agrupa leitura de texto (proxy+cache) e marcações/feed — mesmo
  padrão de módulo por domínio que `SmallGroupsModule` (vários controllers,
  um module).
- **Location**: `apps/api/src/bible/`
- **Arquivos**:
  - `bible-books.constant.ts` — lista estática dos 66 livros (código,
    nome pt-BR, testamento, quantidade de capítulos). São **fatos**
    estruturais, não texto bíblico — sem questão de licença.
  - `bible-text-provider.interface.ts` — `interface BibleTextProvider { getChapter(bookCode: string, chapter: number): Promise<VerseText[]> }`.
  - `api-bible-text.provider.ts` — implementação HTTP concreta (o provedor
    real, ex. API.Bible). Isolada atrás da interface para trocar de provedor
    sem tocar em `BibleReaderService`.
  - `bible-reader.service.ts` — cache-first: lê `bible_chapter_cache`; se
    ausente, chama o provider, faz upsert (`ON CONFLICT DO NOTHING` na
    unique key `version+book_code+chapter`) e retorna.
  - `bible-reader.controller.ts` — `GET /bible/books`,
    `GET /bible/books/:bookCode/chapters/:chapter`.
  - `bible-verse-marks.service.ts` — CRUD de marcação + view com
    `is_mine`/`can_delete`, mesmo formato de `PrayerRequestView`.
  - `bible-verse-marks.controller.ts` — `POST /bible/marks`,
    `GET /bible/feed`, `PATCH /bible/marks/:id`, `DELETE /bible/marks/:id`.
  - `dto/create-bible-verse-mark.dto.ts`,
    `dto/update-bible-verse-mark.dto.ts`,
    `dto/list-bible-feed-query.dto.ts`.
  - `bible.module.ts` — registra tudo, importado em `app.module.ts`.
- **Interfaces**:
  - `BibleReaderService.getChapter(bookCode: string, chapter: number): Promise<ChapterView>`
  - `BibleVerseMarksService.create(dto, user): Promise<BibleVerseMarkView>`
  - `BibleVerseMarksService.findFeed(query, user): Promise<{ items: BibleVerseMarkView[]; nextCursor: string | null }>`
  - `BibleVerseMarksService.update(id, dto, user): Promise<BibleVerseMarkView>`
  - `BibleVerseMarksService.remove(id, user): Promise<{ id: string }>`
- **Dependencies**: `PrismaService`, `BibleTextProvider` (injetado por
  token, permite mock em teste).
- **Reuses**: `JwtAuthGuard`, `RolesGuard`, `@Roles`, `TenantContextInterceptor`,
  `CurrentUser`, `JwtPayload`.

### Papéis (`BIBLE_ROLES`)

Mesma lista ampla de `PRAYER_ROLES`/`CHAT_ROLES`: `member`, `cell_leader`,
`secretary`, `pastor`, `admin_congregation`, `tenant_admin` — leitura e
criação para todos; moderação (`DELETE` de marcação alheia) restrita a
`admin_congregation`/`pastor`/`tenant_admin`, decidida no service (mesmo
princípio "`@Roles` é rejeição barata" documentado em
`prayer-requests.controller.ts:21-25`).

### Mobile: `src/lib/bible/`

- **Purpose**: client fino sobre `authenticatedRequest`, mesmo padrão de
  `content-client.ts`.
- **Location**: `apps/mobile/src/lib/bible/bible-client.ts` + `types.ts`.
- **Interfaces**:
  - `getBooks(): Promise<BibleBook[]>`
  - `getChapter(bookCode: string, chapter: number): Promise<BibleChapter>`
  - `createMark(input: CreateMarkInput): Promise<BibleVerseMark>`
  - `updateMark(id: string, comment: string): Promise<BibleVerseMark>`
  - `deleteMark(id: string): Promise<{ id: string }>`
  - `getFeed(params?: { before?: string; limit?: number }): Promise<BibleFeedPage>`
- **Dependencies**: `authenticatedRequest` (`../auth/auth-client`).
- **Reuses**: mesmo tratamento de erro (`HttpError`) que os outros clients.

### Mobile: telas novas (fora da tab bar)

- **Purpose**: leitura, marcação e feed.
- **Location**:
  - `apps/mobile/src/app/biblia/index.tsx` — seletor de livro/capítulo
    (modal customizado, sem lib de picker — mesmo padrão de lista+`Card` de
    `conteudo.tsx`) e atalho para o feed.
  - `apps/mobile/src/app/biblia/[book]/[chapter].tsx` — leitura do
    capítulo, seleção de intervalo de versículos (toque no primeiro,
    toque no último para fechar o intervalo) e CTA "Comentar" que abre o
    composer.
  - `apps/mobile/src/app/biblia/feed.tsx` — feed da congregação, mesmo
    padrão de paginação/estado vazio/erro de `conteudo.tsx`, mas cursor
    (`before`), não offset.
- **Entry point**: botão em `apps/mobile/src/app/(tabs)/perfil.tsx`
  (STYLE-GUIDE §7 — 5 abas já ocupadas, rota empilhada é o único caminho).
- **Reuses**: `Screen`, `Card`, `StatusMessage`, `EmptyState`, `AppButton`,
  `Alert`, `useTheme()`, tokens de `theme/tokens.ts`.
- **Registro**: as três rotas entram em `Stack.Protected` de
  `apps/mobile/src/app/_layout.tsx`, ao lado de `grupo/[id]` etc.

---

## Data Models

### `BibleVerseMark` (tabela `bible_verse_marks`)

```prisma
model BibleVerseMark {
  id                 String    @id @default(uuid())
  tenant_id          String
  congregation_id    String
  person_id          String
  version            String    @default("NVI")
  book_code          String
  chapter            Int
  verse_start        Int
  verse_end          Int
  comment            String
  deleted_at         DateTime?
  deleted_by_person_id String?
  created_at         DateTime  @default(now())
  updated_at         DateTime  @updatedAt

  tenant       Tenant       @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  congregation Congregation @relation(fields: [congregation_id], references: [id], onDelete: Cascade)
  person       Person       @relation(fields: [person_id], references: [id], onDelete: Cascade)

  @@index([tenant_id, id])
  @@index([tenant_id, congregation_id, created_at])
  @@map("bible_verse_marks")
}
```

Isolada por `tenant_id`+`congregation_id` — AD-001 de ponta a ponta (RLS
`020_rls_bible_verse_marks.sql`, mesmo template de `012`/`015`).

### `BibleChapterCache` (tabela `bible_chapter_cache`) — global, sem tenant

```prisma
model BibleChapterCache {
  id         String   @id @default(uuid())
  version    String
  book_code  String
  chapter    Int
  verses     Json     // [{ number: number, text: string }]
  fetched_at DateTime @default(now())

  @@unique([version, book_code, chapter])
  @@map("bible_chapter_cache")
}
```

**Sem `tenant_id`/`congregation_id`, de propósito** — ver AD-005 abaixo.

### Novos tipos no mobile (`src/lib/bible/types.ts`)

```typescript
export type BibleBook = { code: string; name: string; testament: "AT" | "NT"; chapters: number };
export type BibleVerse = { number: number; text: string };
export type BibleChapter = { book_code: string; chapter: number; verses: BibleVerse[] };
export type BibleVerseMark = {
  id: string;
  book_code: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  comment: string;
  created_at: string;
  updated_at: string;
  person: { id: string; full_name: string } | null;
  is_mine: boolean;
  can_delete: boolean;
};
export type BibleFeedPage = { items: BibleVerseMark[]; nextCursor: string | null };
```

---

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| --------------- | -------- | ------------ |
| Livro/capítulo inválido (fora da lista canônica ou > total de capítulos do livro) | 400 na validação do DTO/service, sem chamar a API externa | Mensagem de validação na tela |
| API externa fora do ar e sem cache | `BibleReaderService` propaga erro tratável (502) | `StatusMessage` com "tentar de novo" |
| Intervalo de versículo inválido (fora do capítulo, `verse_end < verse_start`, ou cruzando capítulo) | 400, validado contra o capítulo já resolvido (cache ou provider) | Mensagem de validação no composer |
| Comentário vazio/curto/longo demais (fora de 3–2000) | 400 via `class-validator` | Mensagem de validação no composer |
| Usuário sem `congregation_id` (ex. `platform_support` puro) tenta marcar | 403 | Ação bloqueada, sem tela dedicada (caso raro) |
| Editar/apagar marcação alheia sem papel de moderação | 403 | Botão de editar/apagar nem aparece (`can_delete`/`is_mine` na view) |
| Corrida em cache-miss (dois usuários pedem o mesmo capítulo ao mesmo tempo) | `ON CONFLICT (version, book_code, chapter) DO NOTHING` + leitura pós-upsert | Transparente — os dois recebem o mesmo texto |

---

## Risks & Concerns

| Concern | Location | Impact | Mitigation |
| ------- | -------- | ------ | ---------- |
| Tabela nova sem isolamento por tenant é um padrão nunca usado no repo (todas as `0NN_rls_*.sql` hoje isolam por tenant ou tenant+congregação) | `apps/api/prisma/migrations/0NN_rls_*.sql` (todas) | Alerta do `pre-push.sh` (linhas ~93-110) dispara se a tabela não tiver `ENABLE ROW LEVEL SECURITY` em algum script | Habilitar RLS mesmo assim, com policy explícita `USING (true) WITH CHECK (true)` — nunca deixar a tabela sem RLS nenhum. Documentado como **AD-005** em `.specs/STATE.md`, para não ser um silêncio |
| Validação de intervalo de versículo depende de já ter buscado o capítulo (cache ou provider) | `bible-verse-marks.service.ts` (a criar) | Criar uma marcação exige uma chamada a mais (buscar o capítulo) antes de gravar | Aceitável: o app sempre chama isso a partir da tela de leitura, que já buscou o capítulo — o double-fetch cai no cache na prática |
| Provedor real da API bíblica ainda não está escolhido/contratado nesta sessão | Todo o `BibleModule` | Sem chave real, só é possível testar com provider mockado; o teste manual end-to-end fica bloqueado até o usuário configurar `BIBLE_API_KEY` | `BibleTextProvider` fica atrás de interface — os testes unitários/e2e do backend usam um fake; a tela mobile pode ser demonstrada com capítulos pré-semeados na tabela de cache via seed de teste, sem depender da chave real |
| Nenhum teste de RLS hoje cobre uma tabela **sem** isolamento (todos os specs de `test/rls/` testam isolamento, não visibilidade compartilhada) | `apps/api/test/rls/*.spec.ts` | O padrão de teste "duas congregações, uma não vê a outra" não se aplica — precisa de um teste com intenção invertida | Escrever `bible-chapter-cache.spec.ts` afirmando o oposto: duas congregações/tenants DIFERENTES leem a MESMA linha de cache — prova que a abertura é deliberada, não uma falha de isolamento não testada |

---

## Tech Decisions (only non-obvious ones)

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Unificar "marca" e "comentário" num único modelo | `BibleVerseMark` carrega o comentário no mesmo registro (não existe marca sem comentário) | O pedido original é "marcar... e adicionar comentário" como uma ação só; nenhuma história pede destacar sem comentar |
| Intervalo de versículo é um range `verse_start..verse_end`, não uma lista | Ver spec.md, Assumptions | Mapeia direto pra UI de "toque no primeiro, toque no último" e evita um segundo modelo (array de referências) sem pedido para isso |
| Lista canônica de livros/capítulos vive só no backend | `apps/api/src/bible/bible-books.constant.ts`, servida por `GET /bible/books` | Evita duplicar a lista em dois lugares (backend valida, mobile exibe) — mobile busca da API, nunca hardcoda |
| Proxy obrigatório: mobile nunca chama a API bíblica externa | `BibleReaderController`/`BibleReaderService` no meio | Chave de API paga não pode estar no bundle do app — mesmo princípio do `/api-proxy` do web |

> **Decisão de projeto (AD-005)**: será adicionada a `.specs/STATE.md` no
> fechamento deste Design — cache de texto bíblico é a primeira tabela do
> repo que nasce **sem** isolamento por tenant/congregação, de propósito
> (conteúdo idêntico para todo mundo), com RLS habilitado e policy
> `USING (true)` explícita em vez de RLS ausente.

---
