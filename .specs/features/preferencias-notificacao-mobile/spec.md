# Preferências de notificação (mobile) — Specification

Implementa MOB-10 (`.specs/features/app-mobile/spec.md`), a única entrada do
plano de mobile que ficou "Pending" — nunca passou por uma rodada de Design.
Segue o precedente de MOB-08/MOB-09: requisito grande o bastante para ganhar
feature própria, referenciada de volta na tabela de rastreabilidade do
`app-mobile`.

## Problem Statement

Hoje o único push do produto é o de posts de conteúdo (MOB-07, entregue): ao
publicar um `ContentPost`, o backend dispara para todo dispositivo cujas tags
OneSignal casem com o segmento do post — sem nenhuma forma de o usuário
reduzir o que recebe. Quem não quer ser avisado de todo pedido de oração, por
exemplo, só pode desligar push do app inteiro no sistema operacional, perdendo
também avisos e eventos.

## Goals

- [ ] Usuário escolhe, por categoria de notificação, se quer recebê-la —
      sem precisar desligar push do app inteiro.
- [ ] A escolha é respeitada no disparo do backend, não só na exibição do
      app — categoria desligada não gera notificação alguma, em vez de
      chegar e ser descartada no cliente.
- [ ] A preferência sobrevive a trocar de aparelho/reinstalar o app, porque
      mora na conta do usuário, não no dispositivo.

## Out of Scope

| Feature | Reason |
|---|---|
| Preferência por escala/check-in ou por Pequenos Grupos | Não existe push para esses módulos hoje (só `ContentPost` dispara notificação, ver `NotificationsService.notifyPost`) — não há o que o usuário desligar. A redação antiga do MOB-10 em `app-mobile/spec.md` citava "conteúdo, escala, PG"; corrigida aqui para o que existe de fato. Se um push de escala nascer depois, ganha sua própria categoria de preferência, não reabre esta spec. |
| Preferência por segmento de audiência (`AudienceSegment`) | Segmentação de audiência é decisão de quem publica (a igreja escolhe quem recebe); preferência de notificação é decisão de quem recebe (dentro do que já foi endereçado a ele). São eixos ortogonais — esta feature só atua sobre o segundo. |
| Tela de preferência no `apps/web`/`apps/admin` | MOB-10 é item do plano de mobile (`app-mobile/spec.md`); push web-only não existe hoje. Fica para quando (se) existir push no navegador. |
| Granularidade por tipo de post individual (8 valores de `ContentPostType`) | Decidido com o usuário: 4 grupos amplos (ver Assumptions) — controle fino demais não se paga para uma feature P3. |

---

## Assumptions & Open Questions

Decisões tomadas com o usuário durante o Specify (registradas para não
reabrir):

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Granularidade das categorias | 4 grupos: **Avisos** (`post`, `notice`), **Pedidos de oração** (`prayer`), **Eventos** (`event`), **Conteúdo devocional** (`devotional`, `study`, `sermon_video`, `audio`) | Escolhido pelo usuário entre 3 opções apresentadas (grupo único, 8 toggles individuais, 3 vs. 4 grupos) — quis oração separada de avisos. | y |
| Onde a preferência mora | Servidor: tabela nova (`notification_preferences`, 1:1 com `UserAccount`) + endpoint dedicado, não só tag OneSignal local | Escolhido pelo usuário sobre a alternativa "só tag OneSignal no device" — sincroniza entre aparelhos da mesma conta e sobrevive a reinstalar o app; o custo (modelo novo, migration, RLS) foi aceito. | y |
| Default antes de qualquer escolha | Todas as 4 categorias **ligadas** (opt-out) | Escolhido pelo usuário — preserva o comportamento atual (ninguém deixa de receber por omissão); mudar para opt-in reduziria alcance de push da noite para o dia para quem já usa o app. | y |
| Como o servidor aplica a preferência no disparo | Tag OneSignal por categoria (`pref_avisos`, `pref_oracao`, `pref_eventos`, `pref_devocional`, valores `"true"`/`"false"`), sincronizada pelo app a cada login/alteração; `NotificationsService.buildFilters` acrescenta, por categoria do post, um filtro OR (tag ausente OU tag `"true"`) — nunca lê a tabela nova diretamente no disparo | O disparo já filtra por tag OneSignal (`tenant_id`/`congregation_id`/`role`/`pg_ids`); replicar o padrão evita duas fontes de verdade concorrendo na hora do envio (tabela vs. tag) e mantém `dispatch()` sem round-trip novo ao Postgres por device. A tabela é a fonte de verdade para a **tela** (o que o app mostra marcado) e para persistência entre aparelhos; a tag é a fonte de verdade para o **filtro de envio**, mantida em sincronia pelo app. | n — decisão técnica de menor risco, sinalizada ao usuário |
| Escopo de tenant/congregação da tabela nova | `notification_preferences` carrega `tenant_id` + `congregation_id` (mesmo padrão de `UserAccount`), isolamento por RLS via `app_congregation_allowed()` nos dois lados (AD-001) | Toda tabela nova de dado de usuário segue o padrão já estabelecido em `.specs/STATE.md` (AD-001); não há razão para esta nascer com o padrão anterior, já corrigido em outro lugar. | y — decorre de AD-001, não é decisão nova |
| Quem pode ler/escrever a preferência | O próprio usuário autenticado, sobre a própria conta — sem `@Roles` além de estar autenticado (rota tipo `/me/...`, não uma rota de administração) | É dado pessoal do usuário sobre si mesmo, não uma operação administrativa; não há papel "certo" para restringir, todo mundo decide sobre a própria caixa de entrada. | n |
| Comportamento se a categoria de um post não mapear em nenhum grupo | Não deve acontecer — todo valor de `ContentPostType` está mapeado num dos 4 grupos (ver tabela em Goals); um teste trava essa cobertura para o enum não crescer sem entrar em algum grupo | Ambiguidade fechada aqui em vez de deixar um post "sem categoria" ser sempre enviado ou sempre bloqueado por omissão. | y — fechado nesta rodada |

**Open questions:** nenhuma sem resposta — todas as decisões acima foram
tomadas com o usuário ou decorrem de padrão já registrado (AD-001).

---

## User Stories

### P1: Escolher categorias de notificação ⭐ MVP desta feature

**User Story**: Como usuário do app, quero abrir uma tela de preferências de
notificação e ligar/desligar cada categoria (Avisos, Pedidos de oração,
Eventos, Conteúdo devocional), para receber só o que me interessa.

**Why P1**: É o core da feature — sem a tela não há o que "preferência"
signifique para o usuário.

**Acceptance Criteria**:

1. WHEN o usuário abre a tela de preferências de notificação pela primeira
   vez (sem registro salvo) THEN o app SHALL mostrar as 4 categorias todas
   marcadas como ligadas.
2. WHEN o usuário desliga uma categoria THEN o app SHALL persistir a mudança
   no servidor e refletir o estado desligado imediatamente na UI (sem
   esperar reabrir a tela).
3. WHEN a chamada de persistência falha (rede/servidor) THEN o app SHALL
   reverter o toggle para o estado anterior e mostrar um erro — nunca deixar
   a UI mostrar "desligado" enquanto o servidor ainda registra "ligado".
4. WHEN o usuário reabre o app em outro aparelho autenticado na mesma conta
   THEN as categorias SHALL aparecer no mesmo estado salvo anteriormente
   (a preferência é da conta, não do device).

**Independent Test**: logar com uma conta seed, desligar "Pedidos de oração",
fechar e reabrir o app (ou logar num segundo simulador com a mesma conta) e
confirmar que a categoria continua desligada.

---

### P1: O disparo respeita a categoria desligada ⭐ MVP desta feature

**User Story**: Como usuário que desligou uma categoria, não quero receber
push daquele tipo — a preferência precisa valer no envio, não só na tela.

**Why P1**: Sem isso a feature é cosmética — o Goal explícito é reduzir push
recebido de verdade, não só a exibição de um toggle.

**Acceptance Criteria**:

1. WHEN o usuário desliga uma categoria THEN o app SHALL sincronizar essa
   escolha como tag OneSignal do dispositivo (`pref_<categoria>=false`) logo
   após a persistência no servidor ter sucesso.
2. WHEN o app inicializa e registra o dispositivo (fluxo já existente do
   MOB-07) THEN o app SHALL também sincronizar todas as 4 tags de preferência
   a partir do que está salvo no servidor — cobre o caso de reinstalar o app
   ou trocar de aparelho.
3. WHEN um `ContentPost` de uma categoria desligada é publicado para o
   segmento do usuário THEN o backend SHALL excluir esse dispositivo do
   envio (filtro OneSignal), mesmo que o dispositivo já esteja registrado
   e casando com `tenant_id`/`congregation_id`/`role`/`pg_ids`.
4. WHEN a tag de preferência não existe para um dispositivo (usuário nunca
   abriu a tela, ou app antigo sem essa versão) THEN o backend SHALL tratar
   como categoria ligada (comportamento atual preservado — default é
   opt-out, nunca opt-in por ausência de dado).

**Independent Test**: desligar "Eventos" numa conta de teste, publicar um
`ContentPost` do tipo `event` para o segmento dessa conta e confirmar (via
log do `NotificationDispatch`/OneSignal, ou ausência de push no device) que
essa conta não recebeu; publicar um post do tipo `notice` (categoria ligada)
para a mesma conta e confirmar que recebeu normalmente.

---

## Edge Cases

- WHEN o usuário desliga todas as 4 categorias THEN o app SHALL permitir —
  não há piso mínimo de categorias ligadas.
- WHEN duas chamadas de toggle acontecem em sequência rápida (usuário
  mexendo em vários switches) THEN o app SHALL serializar as escritas por
  categoria (a mesma disciplina de "uma rotação por vez" já usada no refresh
  de sessão) para a última tocada não perder para uma resposta atrasada da
  anterior.
- WHEN a conta nunca teve `notification_preferences` criado (conta antiga)
  THEN o GET SHALL responder as 4 categorias como ligadas sem exigir criação
  prévia da linha (linha só é criada no primeiro PUT).
- WHEN o usuário faz logout e login com outra conta no mesmo aparelho THEN o
  app SHALL re-sincronizar as tags de preferência para os valores da nova
  conta — nunca herdar tags da conta anterior no mesmo device OneSignal.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| MOB-10a | P1: Escolher categorias de notificação | Execute | Implementing |
| MOB-10b | P1: O disparo respeita a categoria desligada | Tasks | In Tasks |

**ID format:** `MOB-10<letra>` — sub-requisitos de MOB-10 (`app-mobile/spec.md`).

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 2 total, 0 verificados. MOB-10a: backend completo (T1-T8,
2026-09-11) — schema/RLS/service/controller/rota HTTP, com os 4 AC da
história "Escolher categorias de notificação" cobertos por teste
(unit + integration); falta só a UI mobile (T13-T14, Fase 5, ainda não
executada) para a história ficar de ponta a ponta, por isso "Implementing"
em vez de "Verified" (o Verifier roda só depois de T1-T14 completas).
MOB-10b: fundação pronta (T1-T4, categorias mapeadas + tabela/RLS), mas o
filtro de disparo em si (T9, Fase 3) e a sincronização de tag no mobile
(T10-T12, Fase 4) ainda não foram implementados — segue "In Tasks".

---

## Success Criteria

- [ ] As 4 categorias aparecem na tela de preferências, ligadas por padrão,
      e o estado persiste entre sessões/aparelhos da mesma conta.
- [ ] Uma categoria desligada mede zero notificações recebidas nos testes
      manuais/automatizados desta feature (não é filtro só de exibição).
- [ ] Nenhuma regressão no fluxo de push existente (MOB-07) para categorias
      que permanecem ligadas.
