# PROD-20 — Multiplicação de célula, árvore genealógica, semáforo de saúde, metas por rede

## Problem Statement

Módulo 3 (células) não tem hoje nenhum apoio à multiplicação — o modo pelo qual
igrejas orgânicas em células crescem. `SmallGroup.parent_group_id` existe no
schema mas nada o usa: não há ação para criar uma célula filha, nenhuma
visualização da árvore de gerações, nenhum indicador de saúde da célula e
nenhum agrupamento acima da congregação para metas de rede. `PROD-20` no
`docs/PLANO.md` cobre as quatro peças; multiplicação é Starter, o resto é
Premium.

## Goals

- [ ] Líder ou admin consegue multiplicar uma célula (criar filha, mover
      membros escolhidos, definir novo líder) sem gate de plano.
- [ ] Toda célula tem um indicador de saúde (verde/amarelo/vermelho) derivado
      da frequência de encontros, visível para quem já vê a célula — Premium.
- [ ] A árvore genealógica de uma célula (ancestrais + descendentes) é
      visualizável — Premium.
- [ ] Uma rede agrupa células de uma congregação, tem um líder de rede e uma
      meta de saúde (percentual mínimo de células não-vermelhas) cujo status
      atual é visível — Premium.

## Out of Scope

| Feature | Reason |
|---|---|
| Critério de saúde por presença média ou por crescimento de membros | Usuário escolheu só frequência de encontros para este recorte; outros critérios ficam para item futuro se pedido |
| Rede cruzando congregações do mesmo tenant | Usuário escolheu rede por congregação |
| Job/cron que recalcula e persiste o semáforo periodicamente | Sem infra de job battida no `CLAUDE.md` para este módulo; semáforo é calculado on-demand na leitura (ver Assunções) |
| Notificação/alerta automático quando célula fica vermelha | Não pedido; é natural extensão de `PROD-11` (alerta de ausência), mas fora deste recorte |
| Meta de rede por contagem de multiplicações ou por total de células/membros | Usuário escolheu só meta de saúde para este recorte |
| Edição de `GroupMembership` já existente (mover membro fora do wizard) | Tela de gestão de membros já existe e não muda |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Papéis que podem multiplicar uma célula | `MANAGE_ROLES` (`tenant_admin`, `admin_congregation`, `pastor`) + `cell_leader` da própria célula (checagem por `RoleAssignment` escopado ao `small_group_id`) | Segue o precedente de `ALERT_ROLES` em `small-groups.controller.ts`, que já dá ação de auto-serviço ao `cell_leader` da célula em vez de restringir a admins | n |
| Semáforo é calculado on-demand (não persistido) | Calculado na leitura via `MAX(GroupMeeting.occurred_at)` da célula, comparado ao `now()` | Evita introduzir job/cron novo; volume por tenant é baixo (uma consulta por célula/rede exibida), sem dimensão de "observability de job" a cobrir | n |
| Célula sem nenhum `GroupMeeting` registrado | Vermelha desde a criação (trata como "nunca se reuniu" = pior estado) | Mais seguro que assumir verde por ausência de dado | n |
| `Network.leader_person_id` obrigatório ou opcional | Opcional (`String?`) | Permite criar a rede antes de nomear o líder, sem bloquear o fluxo administrativo | n |
| `SmallGroup.network_id` obrigatório ou opcional | Opcional (`String?`), `onDelete: SetNull` | Migração incremental: células existentes nascem sem rede; associar é ação separada | n |
| Meta de saúde da rede — forma do dado | `Network.health_goal_pct: Int?` (0–100), sem meta = sem cobrança de "goal-status" (retorna `null`) | Simplicidade: um número, não uma tabela de metas versionadas por período | n |
| Novo `network_id` exige nova policy RLS de tabela (Network) | Sim — `Network` é tabela nova, sem herdar RLS de `small_groups`. `SmallGroup.network_id` não muda RLS de `small_groups` (mesma isolação por tenant/congregação já existente) | Toda tabela nova precisa de script de RLS próprio, por regra do monorepo (`bootstrap-db.sh` passo 7 falha se faltar) | n |
| Endpoint de árvore genealógica retorna | Ancestrais (subindo por `parent_group_id` até a raiz) + todos os descendentes (recursivo), cada nó com `id`, `name`, `leader_person` (nome), `generation` (profundidade relativa à célula consultada), `health_status` | Cobre tanto "de onde vim" quanto "quem gerei", que é o uso natural de árvore genealógica de células | n |
| `GET .../health` e `.../genealogy` sem Premium | 403 (`PlanGuard`), mesmo comportamento de outras rotas `@RequiresPlan('premium')` já existentes | Consistência com o padrão de gate já implementado | n |
| Front sem Premium ao acessar árvore/semáforo/rede | Reaproveita `isForbidden(error)` + `<NoAccessState>`, mesmo padrão já usado em `apps/web` para 403 | Já é o idioma da base para "sem acesso"; não introduz um segundo padrão de upsell | n |

**Open questions:** nenhuma — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Multiplicar célula ⭐ MVP

**User Story**: Como líder de célula ou admin, quero multiplicar uma célula —
criando uma célula filha, escolhendo quais membros vão para ela e quem é o
novo líder — para que a célula continue crescendo em vez de estagnar.

**Why P1**: É a única peça Starter do item; sem ela nada mais do PROD-20 tem
dado real para mostrar (árvore vazia, semáforo sem sentido de rede).

**Acceptance Criteria**:

1. WHEN um usuário com papel em `MANAGE_ROLES` ou `cell_leader` da célula
   chama `POST /small-groups/:id/multiply` com `name`, `leader_person_id` e
   `member_ids` (subconjunto de `GroupMembership.person_id` ativos na célula
   mãe) THEN o sistema SHALL, numa única transação: criar uma `SmallGroup`
   filha com `parent_group_id = :id`, `tenant_id`/`congregation_id` iguais à
   mãe, `leader_person_id` informado; mover as `GroupMembership` cujo
   `person_id` está em `member_ids` da célula mãe para a filha; garantir que o
   novo líder tenha `GroupMembership` na filha com `role = leader` (criando-a
   se `leader_person_id` não estiver em `member_ids`).
2. WHEN `leader_person_id` não corresponde a uma `Person` do mesmo tenant, ou
   algum item de `member_ids` não é membro ativo da célula mãe THEN o sistema
   SHALL responder `400` sem criar nada (transação não confirma).
3. WHEN `member_ids` está vazio THEN o sistema SHALL permitir mesmo assim
   (célula filha nasce só com o novo líder) — multiplicar não exige mover
   ninguém além do líder.
4. WHEN um usuário sem `MANAGE_ROLES` e sem ser `cell_leader` daquela célula
   chama a rota THEN o sistema SHALL responder `403`.
5. WHEN a multiplicação é concluída THEN a tela de detalhe da célula mãe no
   `apps/web` SHALL exibir a nova célula filha na lista de células-filhas.
6. WHEN o tenant não é Premium THEN a rota de multiplicar SHALL continuar
   funcionando normalmente (sem `PlanGuard`) — é Starter.

**Independent Test**: Criar célula com 3 membros, chamar multiply escolhendo
2 deles e um novo líder; verificar célula filha criada, os 2 membros movidos,
o 1º membro remanescente na mãe, e o líder com membership de `leader` na
filha.

---

### P2: Semáforo de saúde da célula

**User Story**: Como pastor/admin, quero ver rapidamente quais células estão
saudáveis e quais precisam de atenção, para priorizar visitas e suporte.

**Why P2**: Depende só da célula existir (não depende de rede), e alimenta a
meta de rede da P4 — mais barato de entregar antes.

**Acceptance Criteria**:

1. WHEN o tenant é Premium e alguém com acesso de leitura à célula (mesmos
   papéis de `READ_ROLES`/`MINE_ROLES` já usados no módulo) consulta
   `GET /small-groups/:id/health` THEN o sistema SHALL responder
   `{ status: 'green'|'yellow'|'red', last_meeting_at: string|null,
   days_since_last_meeting: number|null }`, calculado a partir do
   `MAX(GroupMeeting.occurred_at)` daquela célula.
2. WHEN o último encontro ocorreu há menos de 14 dias (ou hoje) THEN
   `status` SHALL ser `green`.
3. WHEN o último encontro ocorreu entre 14 e 27 dias (inclusive) THEN
   `status` SHALL ser `yellow`.
4. WHEN o último encontro ocorreu há 28 dias ou mais, OU a célula nunca teve
   `GroupMeeting` registrado THEN `status` SHALL ser `red`.
5. WHEN o tenant não é Premium THEN a rota SHALL responder `403`
   (`@RequiresPlan('premium')`).
6. WHEN a tela de detalhe da célula (`GroupDetailSheet`) carrega e o tenant é
   Premium THEN ela SHALL exibir um indicador visual (bolinha colorida) com o
   `status`; quando não é Premium, a seção SHALL ficar oculta (sem 403
   visível ao usuário).

**Independent Test**: Criar célula sem encontros → `red`. Registrar encontro
hoje → `green`. Alterar `occurred_at` (via seed/teste) para 20 dias atrás →
`yellow`.

---

### P2: Árvore genealógica da célula

**User Story**: Como pastor/admin, quero ver de qual célula uma célula veio e
quais ela já gerou, para enxergar a linhagem completa de multiplicação.

**Why P2**: Depende só de `parent_group_id`, que já existe; não depende de
rede.

**Acceptance Criteria**:

1. WHEN o tenant é Premium e alguém com acesso de leitura consulta
   `GET /small-groups/:id/genealogy` THEN o sistema SHALL responder uma
   lista de ancestrais (subindo por `parent_group_id` até a raiz, mais
   próximo primeiro) e uma árvore de descendentes (recursiva, todas as
   gerações), cada nó com `id`, `name`, `leader_person_name`, `generation`
   (negativo para ancestrais, 0 para a própria célula, positivo para
   descendentes) e `health_status` (mesmo cálculo da história anterior).
2. WHEN a célula não tem `parent_group_id` nem `childGroups` THEN o sistema
   SHALL responder a lista de ancestrais vazia e a árvore de descendentes
   vazia (célula é raiz isolada) — não é erro.
3. WHEN o tenant não é Premium THEN a rota SHALL responder `403`.
4. WHEN a tela exibe a árvore THEN ela SHALL usar a mesma cor do semáforo por
   nó (reaproveitando o cálculo, não uma segunda lógica de cor).

**Independent Test**: Multiplicar A → B → C (2 gerações). Consultar
genealogia de B: ancestrais = [A], descendentes = [C].

---

### P3: Rede e meta de saúde

**User Story**: Como pastor, quero agrupar células numa rede com um líder de
rede e acompanhar se a rede está cumprindo uma meta de saúde (percentual
mínimo de células não-vermelhas), para gerir múltiplas células juntas.

**Why P3**: Depende do semáforo (P2) para ter sentido; é a peça mais nova do
domínio (tabela do zero).

**Acceptance Criteria**:

1. WHEN alguém com `MANAGE_ROLES` chama `POST /networks` com `name` e
   opcionalmente `leader_person_id` e `health_goal_pct` (0–100) THEN o
   sistema SHALL criar uma `Network` vinculada ao `tenant_id`/
   `congregation_id` do usuário.
2. WHEN alguém com `MANAGE_ROLES` chama `PATCH /small-groups/:id` com
   `network_id` (de uma `Network` da mesma congregação, ou `null` para
   desvincular) THEN o sistema SHALL associar/desassociar a célula da rede.
3. WHEN alguém consulta `GET /networks/:id/goal-status` e a rede tem
   `health_goal_pct` definido THEN o sistema SHALL responder
   `{ goal_pct: number, current_pct: number, met: boolean, green: number,
   yellow: number, red: number, total: number }`, onde `current_pct` é o
   percentual de células da rede com `status` `green` ou `yellow` (não
   vermelho) sobre o total de células da rede.
4. WHEN a rede não tem `health_goal_pct` definido THEN
   `GET /networks/:id/goal-status` SHALL responder `goal_pct: null,
   met: null` junto com as contagens (sem meta para comparar, mas os números
   continuam úteis).
5. WHEN a rede não tem nenhuma célula vinculada THEN `goal-status` SHALL
   responder `total: 0` e `current_pct: null` (sem dividir por zero).
6. WHEN o tenant não é Premium THEN todas as rotas de `Network` SHALL
   responder `403`.
7. WHEN alguém tenta vincular (`network_id`) uma célula de congregação
   diferente da rede THEN o sistema SHALL responder `400`.

**Independent Test**: Criar rede com meta 80%, vincular 5 células (4 verdes,
1 vermelha) → `current_pct: 80`, `met: true`. Deixar mais uma vermelha →
`current_pct: 66.67`, `met: false`.

---

## Edge Cases

- WHEN `member_ids` inclui o próprio `leader_person_id` da célula mãe (o
  líder atual está se mudando para a filha) THEN o sistema SHALL permitir —
  célula mãe fica sem membership desse `person_id`, mas seu
  `leader_person_id` continua apontando pra ele até alguém trocar
  explicitamente o líder da mãe (fora do escopo desta ação).
- WHEN `leader_person_id` da nova célula já é `leader_person_id` de outra
  célula (uma pessoa lidera duas células) THEN o sistema SHALL permitir —
  não há regra hoje que impeça uma pessoa de liderar mais de uma célula.
- WHEN duas chamadas de `multiply` concorrentes tentam mover o mesmo
  `person_id` para duas células filhas diferentes da mesma mãe THEN a
  segunda chamada SHALL falhar com `400` (membership já não pertence mais à
  mãe no momento da segunda transação — validação re-lê o estado dentro da
  transação).
- WHEN uma célula é deletada e tinha `childGroups` THEN o comportamento SHALL
  seguir o já existente (`onDelete: SetNull` em `parent_group_id`) — não
  muda com este item.
- WHEN uma `Network` é deletada e tinha células vinculadas THEN
  `SmallGroup.network_id` SHALL virar `null` (`onDelete: SetNull`), sem
  apagar as células.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| CEL20-01 | P1: Multiplicar célula | Design | Pending |
| CEL20-02 | P1: Multiplicar célula (validação) | Design | Pending |
| CEL20-03 | P1: Multiplicar célula (permissões) | Design | Pending |
| CEL20-04 | P2: Semáforo de saúde | Design | Pending |
| CEL20-05 | P2: Semáforo de saúde (thresholds) | Design | Pending |
| CEL20-06 | P2: Árvore genealógica | Design | Pending |
| CEL20-07 | P3: Network CRUD | Design | Pending |
| CEL20-08 | P3: Meta de saúde da rede | Design | Pending |

**Coverage:** 8 total, 0 mapped to tasks, 8 unmapped ⚠️ (aguardando Design/Tasks)

---

## Success Criteria

- [ ] `POST /small-groups/:id/multiply` cria célula filha + move membros numa
      transação, coberto por teste de integração.
- [ ] Semáforo (`green`/`yellow`/`red`) calculado corretamente nos 3 casos de
      threshold, coberto por teste unitário do cálculo.
- [ ] Árvore genealógica retorna ancestrais e descendentes corretos em pelo
      menos 2 gerações, coberto por teste.
- [ ] `Network` + `goal-status` cobertos por teste, incluindo o caso de rede
      sem meta e rede sem células.
- [ ] Todas as rotas Premium (`health`, `genealogy`, `networks/*`) retornam
      `403` sem `PlanGuard` satisfeito, coberto por teste.
- [ ] RLS: nova tabela `networks` tem script de RLS próprio e passa no passo
      7 do `bootstrap-db.sh`.
