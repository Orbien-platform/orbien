# Bíblia NVI — Marcação de Versículos e Feed de Comentários (Mobile) Specification

## Problem Statement

Hoje o `apps/mobile` não tem nenhuma tela de leitura bíblica. Membros da
congregação não têm onde ler a Bíblia dentro do app nem onde compartilhar uma
reflexão sobre um versículo com o resto da congregação — hoje isso acontece
fora do Orbien (WhatsApp, papel, memória). A feature adiciona leitura da NVI
com filtro por livro/capítulo, marcação de um ou mais versículos com
comentário, e um feed desses comentários visível para todo mundo da mesma
congregação.

## Goals

- [ ] Usuário autenticado consegue ler qualquer capítulo da NVI, navegando por
      livro → capítulo, sem sair do app mobile.
- [ ] Usuário consegue marcar um intervalo de um ou mais versículos do
      capítulo aberto e anexar um comentário, publicado para a congregação.
- [ ] Todo membro da mesma congregação vê o feed de marcações+comentários,
      isolado por congregação (nunca vê de outra congregação do mesmo tenant
      nem de outro tenant).

## Out of Scope

Documentado para não crescer o escopo durante o Execute.

| Feature                                                       | Reason                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Réplica/thread em cima de uma marcação já publicada            | Decidido com o usuário: feed plano nesta versão (P1). Ver Assumptions.                      |
| Reação (like/amém) em marcações                                 | Não pedido; mesma lógica do item acima — cresce a spec sem necessidade validada.            |
| Notificação push de nova marcação/comentário                    | Nenhuma decisão de segmentação/tag OneSignal foi pedida; fica para uma feature futura.       |
| Outras versões da Bíblia além da NVI                            | Escopo é NVI. Campo `version` fica como string para não fechar a porta, mas só NVI é servida.|
| Tela equivalente no `apps/web` (admin) ou moderação via admin   | `apps/admin` só cobre rotas de plataforma; dado de igreja não passa por lá (regra do CLAUDE.md raiz). Moderação acontece dentro do próprio `apps/mobile`. |
| Download/cache de toda a Bíblia para leitura 100% offline        | O cache (P1) é por capítulo, sob demanda (lazy) — não um pré-download completo dos 66 livros. |
| Seleção de versículos não-contíguos numa mesma marcação          | Ver Assumptions — intervalo contíguo dentro de um único capítulo apenas.                     |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Editar/apagar a própria marcação | Autor pode editar o texto do comentário e apagar (soft delete) sua própria marcação | Confirmado pelo usuário | y |
| Moderação por terceiros | `admin_congregation`, `pastor` e `tenant_admin` podem apagar (soft delete) o comentário de qualquer pessoa da congregação | Confirmado pelo usuário | y |
| Estrutura do feed | Plano — cada marcação+comentário é um item independente, sem réplica nem reação | Confirmado pelo usuário | y |
| Cache do texto bíblico | Capítulo buscado pela 1ª vez na API externa é cacheado no Postgres (tabela global, sem tenant/congregação — texto da NVI é o mesmo para todo mundo); buscas seguintes usam o cache | Confirmado pelo usuário | y |
| Intervalo de versículos por marcação | Um intervalo contíguo `verse_start..verse_end` dentro de um único capítulo (não lista arbitrária, não cruza capítulos) | "Marcar um ou alguns versículos" mapeia naturalmente para um range; lista arbitrária ou cross-capítulo exigiria um schema mais complexo (array de referências) sem pedido explícito para isso | n — assumido, ajustável no Design se o usuário quiser lista arbitrária |
| Limite de tamanho do comentário | 3 a 2000 caracteres | Mesmo limite usado em `CreatePrayerRequestDto` (`apps/api/src/small-groups/dto/create-prayer-request.dto.ts`) — conteúdo reflexivo de forma livre, não chat curto (que usa 1000) | n — assumido por consistência com padrão já existente no repo |
| Provedor da API bíblica externa | Não fixado nesta spec — a integração é desenhada contra uma interface HTTP genérica (base URL + API key + identificador de versão configuráveis via env), permitindo trocar de provedor sem mudar código. Ex. de provedor real: API.Bible (Biblica) | O usuário decidiu usar "API bíblica licenciada" sem nomear o provedor exato; a obtenção de conta/licença/chave é uma tarefa operacional fora do que este agente pode executar (cadastro externo, aceite de termos, pagamento) | n — usuário precisa provisionar a chave real antes do teste end-to-end; unit tests usam a API mockada |
| Papéis com acesso à feature | Mesma lista ampla de papéis de congregação usada em `PrayerRequest`/`GroupMessage`: `member`, `cell_leader`, `secretary`, `pastor`, `admin_congregation`, `tenant_admin` — leitura e criação de marcação para todos esses; apagar-de-terceiros restrito a `admin_congregation`/`pastor`/`tenant_admin` | Bíblia é conteúdo de congregação como um todo, não de célula — não há razão para restringir mais que os outros feeds de conteúdo geral | n — assumido, sem pedido de restrição adicional |
| Proxy do texto bíblico pela API do Orbien (nunca direto do mobile) | O app mobile NUNCA chama a API bíblica externa diretamente — sempre via `GET` na API do Orbien, que busca (ou usa cache) e repassa | Mesma lógica de "token só visto no servidor" já aplicada no web (`/api-proxy`); a chave da API bíblica externa não pode vazar para o bundle do app mobile | n — assumido por consistência de segurança com o resto da base, sem pedido explícito, mas decisão de baixo risco |
| Isolamento do cache de texto bíblico | Tabela de cache de capítulos NÃO tem `tenant_id`/`congregation_id` — é referência global, sem RLS de isolamento por tenant (mesmo texto NVI serve todo mundo) | Ponto identificado na exploração inicial: é a única tabela nova da feature que foge do padrão "toda tabela nova é isolada por tenant" — precisa virar decisão explícita de arquitetura no Design (AD novo em `.specs/STATE.md`) | n — vira AD formal no Design |

**Open questions:** nenhuma — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Ler a NVI filtrando por livro, capítulo e versículo ⭐ MVP

**User Story**: Como membro da congregação, quero abrir a Bíblia dentro do
app e escolher livro e capítulo, para ler a NVI sem precisar de outro app.

**Why P1**: É a base de tudo — sem leitura não há o que marcar.

**Acceptance Criteria**:

1. WHEN o usuário abre a tela Bíblia THEN o sistema SHALL exibir um seletor
   (modal) para escolher um dos 66 livros e, em seguida, um capítulo válido
   para aquele livro.
2. WHEN o usuário confirma um livro e capítulo THEN o sistema SHALL exibir o
   texto NVI daquele capítulo com os versículos numerados, buscando primeiro
   do cache do Orbien e, se ausente, da API bíblica externa (via proxy do
   backend).
3. WHEN o usuário quer ir direto a um versículo específico (ex. veio de uma
   referência no feed) THEN o sistema SHALL aceitar livro+capítulo+versículo
   e abrir o capítulo já rolado/destacado naquele versículo.
4. WHEN a busca do capítulo falhar (API externa fora do ar e sem cache) THEN
   o sistema SHALL exibir uma mensagem de erro com opção de tentar de novo
   (padrão `StatusMessage`), sem quebrar a navegação.
5. WHEN o capítulo pedido já foi buscado antes (por qualquer usuário, de
   qualquer congregação/tenant) THEN o sistema SHALL servir do cache sem
   nova chamada à API externa.

**Independent Test**: Abrir a tela Bíblia, escolher "João" → capítulo 3, ver
o texto NVI aparecer numerado; derrubar a API externa (mock) e confirmar que
um capítulo já visitado antes continua abrindo do cache.

---

### P1: Marcar um ou mais versículos com comentário ⭐ MVP

**User Story**: Como membro da congregação, quero selecionar um ou mais
versículos que estou lendo e escrever um comentário, para compartilhar essa
reflexão com a minha congregação.

**Why P1**: É o core da feature pedida — sem isso, é só um leitor de Bíblia.

**Acceptance Criteria**:

1. WHEN o usuário seleciona um intervalo de versículos (um só, ou vários
   consecutivos) dentro do capítulo aberto e escreve um comentário de 3 a
   2000 caracteres THEN o sistema SHALL salvar a marcação vinculada ao
   `tenant_id`, `congregation_id` e `person_id` do usuário autenticado, à
   versão ("NVI"), livro, capítulo e ao intervalo de versículos.
2. WHEN o comentário está vazio, tem menos de 3 caracteres ou passa de 2000
   THEN o sistema SHALL rejeitar a submissão com uma mensagem de validação,
   sem gravar nada.
3. WHEN a marcação é salva com sucesso THEN o sistema SHALL torná-la visível
   no feed da congregação (próxima carga do feed já reflete a nova marcação).
4. WHEN o usuário tenta marcar um intervalo que cruza dois capítulos THEN o
   sistema SHALL rejeitar (fora do intervalo contíguo suportado — ver
   Assumptions).

**Independent Test**: Selecionar os versículos 16-18 de João 3, escrever um
comentário, salvar, e ver o item aparecer no feed da própria congregação.

---

### P1: Feed de marcações da congregação ⭐ MVP

**User Story**: Como membro da congregação, quero ver o que outras pessoas
da minha congregação estão marcando e comentando na Bíblia, para acompanhar
o que Deus tem falado com o grupo.

**Why P1**: É o "visível em feed" pedido explicitamente — sem ele a
marcação fica privada e a feature não cumpre o pedido original.

**Acceptance Criteria**:

1. WHEN o usuário abre o feed THEN o sistema SHALL listar as marcações da
   própria congregação (mesmo `tenant_id` E mesmo `congregation_id` do
   usuário autenticado), da mais recente para a mais antiga.
2. WHEN existe uma marcação de outra congregação do mesmo tenant, ou de
   outro tenant THEN o sistema SHALL NUNCA exibi-la nesse feed (isolamento
   por congregação garantido por RLS, não só por filtro de aplicação).
3. WHEN o usuário chega ao fim da página carregada THEN o sistema SHALL
   carregar mais itens antigos via paginação por cursor (`before`), igual ao
   padrão de `GroupMessage`.
4. WHEN o usuário toca num item do feed THEN o sistema SHALL permitir abrir
   a leitura completa do capítulo correspondente, com o intervalo marcado
   em destaque.
5. WHEN o feed está vazio (congregação sem nenhuma marcação ainda) THEN o
   sistema SHALL mostrar um estado vazio (padrão `EmptyState`), não erro.

**Independent Test**: Duas contas de teste na mesma congregação —
`teste1-church`; uma marca um versículo, a outra abre o feed e vê o item.
Uma terceira conta de outra congregação (ou `teste2-church`) não vê esse
item no feed dela.

---

### P2: Editar e apagar a própria marcação

**User Story**: Como autor de uma marcação, quero poder corrigir o texto do
meu comentário ou remover a marcação, para não deixar publicado algo que eu
não queria mais.

**Why P2**: Importante para a experiência, mas o feed funciona sem isso no
dia 1 (MVP pode nascer sem edição).

**Acceptance Criteria**:

1. WHEN o autor edita o texto do próprio comentário THEN o sistema SHALL
   atualizar o conteúdo e `updated_at`, mantendo a posição no feed pela
   `created_at` original (edição não "sobe" o item no feed).
2. WHEN o autor apaga a própria marcação THEN o sistema SHALL fazer soft
   delete (`deleted_at`) e o item SHALL sumir do feed e de qualquer destaque
   de capítulo.
3. WHEN alguém que não é o autor tenta editar ou apagar a marcação de outra
   pessoa (e não tem papel de moderação) THEN o sistema SHALL negar com 403.

**Independent Test**: Autor edita seu próprio comentário e vê o texto
atualizado no feed; tenta editar o de outra pessoa e recebe 403.

---

### P2: Moderação por líder/pastor/admin

**User Story**: Como `admin_congregation`, `pastor` ou `tenant_admin`, quero
poder remover um comentário impróprio de qualquer pessoa da minha
congregação, para manter o feed saudável.

**Why P2**: Necessário antes de abrir para uso real (feed público dentro da
congregação sem moderação nenhuma é risco), mas não bloqueia a demo do MVP.

**Acceptance Criteria**:

1. WHEN um usuário com papel `admin_congregation`, `pastor` ou
   `tenant_admin` apaga o comentário de outra pessoa da mesma congregação
   THEN o sistema SHALL fazer soft delete e registrar quem removeu
   (`deleted_by_person_id`), distinto de uma remoção pelo próprio autor.
2. WHEN um usuário sem esses papéis tenta apagar o comentário de outra
   pessoa THEN o sistema SHALL negar com 403.

**Independent Test**: Conta com papel `pastor` remove o comentário de um
`member`; o item some do feed de todos.

---

## Edge Cases

- WHEN o livro ou capítulo pedido não existe (ex. "capítulo 999" de um livro
  com 20 capítulos) THEN o sistema SHALL responder 400 com mensagem de
  validação, sem chamar a API externa.
- WHEN o usuário autenticado não tem `congregation_id` resolvido (situação
  que não deveria ocorrer para contas de igreja, mas existe para
  `platform_support` puro) THEN o sistema SHALL negar a criação de marcação
  com 403 (mesmo princípio de "dado de igreja não é para plataforma").
- WHEN a API bíblica externa responde lenta ou com rate limit THEN o sistema
  SHALL servir do cache quando existir; se não existir cache, SHALL
  propagar um erro tratável (edge case da AC de falha da P1).
- WHEN dois usuários marcam o mesmo intervalo de versículos, cada um com seu
  comentário THEN o sistema SHALL permitir — não há unicidade por
  livro/capítulo/versículo, cada marcação é independente por pessoa.
- WHEN um comentário contém apenas espaços em branco THEN o sistema SHALL
  tratar como vazio e rejeitar (mesma regra de validação da AC de
  comentário mínimo).

---

## Requirement Traceability

| Requirement ID | Story                                   | Phase  | Status   |
| --------------- | ---------------------------------------- | ------ | -------- |
| BIB-01          | P1: Ler a NVI com filtro                 | Tasks  | In Tasks |
| BIB-02          | P1: Ler a NVI com filtro (cache)         | Tasks  | In Tasks |
| BIB-03          | P1: Ler a NVI com filtro (falha externa) | Tasks  | In Tasks |
| BIB-04          | P1: Marcar versículos com comentário     | Tasks  | In Tasks |
| BIB-05          | P1: Marcar versículos (validação)        | Tasks  | In Tasks |
| BIB-06          | P1: Feed da congregação                  | Tasks  | In Tasks |
| BIB-07          | P1: Feed — isolamento por congregação    | Tasks  | In Tasks |
| BIB-08          | P1: Feed — paginação por cursor          | Tasks  | In Tasks |
| BIB-09          | P2: Editar/apagar própria marcação       | Tasks  | In Tasks |
| BIB-10          | P2: Moderação por líder/pastor/admin     | Tasks  | In Tasks |

**Coverage:** 10 total, 10 mapeados em tasks (T1–T23), 0 não mapeados

---

## Success Criteria

- [ ] Usuário consegue ler qualquer capítulo da NVI em até 2 toques a partir
      da tela Bíblia (selecionar livro, selecionar capítulo).
- [ ] Uma marcação criada por um membro aparece no feed de outro membro da
      mesma congregação sem refresh manual de app (próxima carga do feed).
- [ ] Zero vazamento cross-congregação/cross-tenant no feed, validado por
      teste de RLS dedicado (`apps/api/test/rls/*.spec.ts`), gate obrigatório
      do `pre-push.sh`.
