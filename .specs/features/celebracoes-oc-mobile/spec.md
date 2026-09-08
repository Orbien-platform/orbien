# Celebrações e Ordem de Culto no Mobile (MOB-08) — Specification

## Problem Statement

O app mobile (`apps/mobile`) hoje só mostra ao voluntário a própria escala
(MOB-04, aba "Escala": lista pessoal de `CelebrationAssignment`, confirmar/
recusar, check-in). Não há como ver a Ordem de Culto (OC) nem a setlist do
culto pra que foi escalado, nem uma visão geral das próximas celebrações para
quem lidera ministério — obrigando a abrir o navegador (`apps/web`), o
atrito que o app mobile existe pra eliminar. Esta é a próxima peça do escopo
P2 já registrado em `.specs/features/app-mobile/spec.md` (MOB-08, Pending).

## Goals

- [ ] Membro/voluntário escalado abre a celebração em que está e vê a OC e a
      setlist (quando houver) em modo leitura, com sua função/horário
      destacados.
- [ ] Líder de ministério (`ministry_leader`) vê a lista das próximas
      celebrações da congregação, não só as que tem escala pessoal.
- [ ] Nenhuma role nova é criada; a visibilidade segue as regras que a API já
      aplica hoje em cada endpoint consumido.

## Out of Scope

| Feature | Reason |
|---|---|
| Editar OC/setlist pelo mobile | É leitura (AC2 do MOB-08 original); edição continua exclusiva do web/admin |
| Celebrações passadas / histórico | MOB-08 original só fala de "próximo evento"; histórico é extensão futura |
| Notificação push de mudança na OC | Fora do escopo desta rodada; push de escala já existe (MOB-04/07) |
| Pequenos Grupos (MOB-09) | Próximo módulo depois deste, especificado à parte |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Fonte da lista de celebrações para `member`/`volunteer` | Deriva de `GET /volunteers/my-celebration-assignments` (assignments do próprio usuário), não de `GET /celebrations/instances` | `GET /celebrations/instances` (list e `:id`) tem `READ_ROLES` = admin/pastor/tenant_admin/secretary/ministry_leader — **não inclui `volunteer`/`member`** (`celebration-instances.controller.ts:13-14`). Um voluntário comum não pode listar instances hoje; a única fonte de celebrações que ele já enxerga é a própria escala. | n |
| Fonte da lista de celebrações para `ministry_leader` | `GET /celebrations/instances` (list completo da congregação) | Ele está no `READ_ROLES` desse endpoint — vê todas as próximas, não só as que tem escala | n |
| Como chegar na OC a partir da escala pessoal | Backend precisa devolver o `service_order_id` (ou instance id com serviceOrder aninhado) em `GET /volunteers/my-celebration-assignments` — hoje esse endpoint só devolve `celebration{id,name}`, sem link pra OC | `getMyAssignments` (`celebration-assignment.service.ts:354-410`) não inclui a relação `serviceOrder`; sem isso o mobile não tem `id` nenhum pra chamar `GET /celebrations/orders/:id`. É mudança de shape aditiva (campo novo), não quebra consumidores existentes (web não usa esse campo hoje) | n |
| Endpoint de detalhe da OC | Reusa `GET /celebrations/orders/:id`, que já inclui `items` → `setlist.songs.song` aninhado (visto na feature `setlist-repertorio-conexao`) e já libera `volunteer`/`member` no `@Roles` (`service-orders.controller.ts:31`) | Endpoint único cobre AC2 inteiro sem endpoint novo | y |
| "Próximo evento" no P1 do MOB-08 original | Para `member`/`volunteer`: só celebrações com escala futura (`scheduled_date >= hoje`, mesmo filtro que a aba Escala já usa). Para `ministry_leader`: próximas N (paginação simples, mesmo padrão do feed MOB-06) | Consistente com o que a API já filtra por default (`includePast` false) e com o padrão de paginação já usado no Conteúdo | n |
| Setlist ausente | Tela mostra a OC normalmente e uma mensagem "Repertório ainda não publicado" no lugar da setlist — mesma copy que o web já usa em Meus Turnos | Reaproveita decisão de produto já tomada, não inventa nova | y |

**Open questions:** nenhuma sem default registrado acima — as três primeiras
linhas (`n`) são decisões técnicas de leitura de API, não de produto, e vão
para confirmação do usuário só se ele discordar do default ao revisar esta
spec.

---

## User Stories

### P1: Ver a OC e a setlist da celebração em que estou escalado ⭐ MVP

**User Story**: Como voluntário/membro de ministério, quero abrir a
celebração em que fui escalado pelo celular e ver a Ordem de Culto e a
setlist, para me preparar sem precisar do navegador.

**Why P1**: É o valor central do MOB-08 — a lacuna que hoje empurra o
voluntário de volta pro navegador depois de confirmar a escala no app.

**Acceptance Criteria**:

1. WHEN o usuário (`member`/`volunteer`) abre a aba "Celebrações" THEN o app
   SHALL listar as celebrações em que ele tem ao menos uma escala futura
   (mesma fonte e filtro de `GET /volunteers/my-celebration-assignments`),
   ordenadas por data crescente.
2. WHEN o usuário abre uma celebração da lista THEN o app SHALL buscar e
   mostrar a Ordem de Culto (nome/horário de cada etapa, responsável) e,
   se existir, a setlist (música, tom, bpm, links), em modo leitura.
3. WHEN a etapa da OC ou a linha da setlist corresponde à escala do usuário
   THEN a tela SHALL destacar visualmente sua função e horário nessa etapa.
4. WHEN a celebração não tem setlist publicada THEN o app SHALL mostrar a OC
   normalmente com a mensagem "Repertório ainda não publicado" no lugar da
   setlist, sem esconder a OC.
5. WHEN a busca da OC falha (rede ou erro do servidor) THEN o app SHALL
   mostrar estado de erro com opção de tentar novamente, nunca uma tela
   vazia interpretável como "sem OC".

**Independent Test**: conta de voluntário com uma escala futura confirmada —
abrir "Celebrações", abrir a celebração, ver a OC com sua etapa destacada e
a setlist (ou o aviso de repertório não publicado).

---

### P2: Líder vê todas as próximas celebrações da congregação

**User Story**: Como líder de ministério, quero ver a lista de próximas
celebrações da congregação (não só as que tenho escala pessoal), para me
planejar mesmo antes de ser escalado.

**Why P2**: Amplia o alcance da mesma tela para quem já tem visibilidade
mais ampla na API — não bloqueia o valor central do P1.

**Acceptance Criteria**:

1. WHEN o usuário tem role `ministry_leader` (ou superior: admin_congregation/
   pastor/tenant_admin/secretary) THEN a aba "Celebrações" SHALL listar as
   próximas celebrações da congregação via `GET /celebrations/instances`, não
   apenas as com escala pessoal.
2. WHEN a lista está vazia (nenhuma celebração futura agendada) THEN o app
   SHALL mostrar estado vazio explícito ("Nenhuma celebração agendada"), não
   erro.

**Independent Test**: conta `ministry_leader` sem nenhuma escala pessoal —
abrir "Celebrações" e ver celebrações futuras da congregação mesmo assim.

---

## Edge Cases

- WHEN o usuário não tem nenhuma escala futura e não é `ministry_leader`+
  THEN a aba SHALL mostrar estado vazio ("Você não tem celebrações
  próximas"), nunca lista vazia indistinguível de erro de permissão — mesmo
  princípio da pendência nº 10 já citado no `spec.md` do app-mobile.
- WHEN a OC tem etapas sem responsável definido (`responsible_label`
  genérico) THEN a tela SHALL mostrar o rótulo como veio da API, sem tentar
  inferir responsável.
- WHEN duas etapas da OC compartilham o mesmo horário/sequência (dado
  inconsistente, não deveria ocorrer mas a tela não deve quebrar) THEN o app
  SHALL renderizar ambas na ordem devolvida pela API, sem deduplicar.
- WHEN o usuário sai da tela de detalhe e volta (troca de aba) THEN o app
  SHALL refazer a busca (sem cache stale), mesmo padrão do MOB-04.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| MOB-08-01 | P1: Lista de celebrações (member/volunteer, via assignments) | Design | Pending |
| MOB-08-02 | P1: Detalhe — OC + setlist em modo leitura | Design | Pending |
| MOB-08-03 | P1: Destaque da própria função/horário | Design | Pending |
| MOB-08-04 | P1: Estado sem setlist publicada | Design | Pending |
| MOB-08-05 | P1: Estado de erro na busca da OC | Design | Pending |
| MOB-08-06 | P2: Lista completa para `ministry_leader`+ | Design | Pending |
| MOB-08-07 | Backend: `getMyAssignments` passa a incluir `service_order_id` | Design | Pending |

**ID format:** `MOB-08-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 7 total, 0 mapeados a tasks ainda, 7 aguardando Design/Tasks ⚠️

---

## Success Criteria

- [ ] Voluntário com escala futura confirmada abre a OC e a setlist da
      celebração em menos de 2 toques a partir da aba "Celebrações".
- [ ] Zero chamada a endpoint que a role do usuário não tem acesso (sem
      tentar `GET /celebrations/instances` para `member`/`volunteer`).
- [ ] `npm run test -w orbien-mobile` e `npm run test -w orbien-backend`
      verdes com os testes novos desta feature.
