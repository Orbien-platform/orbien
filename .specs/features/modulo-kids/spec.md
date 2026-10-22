# Módulo Kids (KIDS) Specification

## Problem Statement

O Orbien só conhece criança como número: `CelebrationAttendance.children` é uma
contagem agregada por culto (PROD-37). Não há turma, faixa etária, cadastro
nominal, responsável autorizado nem check-out seguro. Igrejas com uma turma
infantil (Doca hoje) e igrejas com várias faixas etárias não têm onde operar o
culto kids, nem como saber quem está em qual sala e quem pode buscar cada criança.

## Goals

- [ ] Uma celebração tem 0, 1 ou N sessões kids (uma por turma/faixa etária), sem duplicar a agenda da celebração.
- [ ] O responsável cadastra a criança e autoriza quem pode buscá-la; a igreja registra o consentimento.
- [ ] Entrada e saída da criança em segundos, com etiqueta/QR casada entre criança e responsável.
- [ ] Voluntários kids são escalados por sessão e a contagem de crianças do culto deriva do check-in.

## Out of Scope

| Feature | Reason |
|---|---|
| Reconhecimento facial | Risco LGPD alto; benchmark aberto usa QR/etiqueta |
| Currículo, lição, galeria de fotos | Não é o núcleo de operação e segurança |
| Comunicação por WhatsApp com pais | Notificação push/in-app cobre o MVP |
| Cobrança de eventos kids | Passaria pelo montador Asaas (AD-008); fora do MVP |
| Impressora térmica dedicada | MVP gera etiqueta imprimível pelo navegador/app |
| Paridade com Eklesia/inChurch/InPeace | Sem módulo kids documentado nem usado pelo cliente zero |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Modelo | `KidsRoom` (turma, catálogo da congregação) + `KidsSession` (instância × turma, único) | Cobre 0/1/N; resposta do usuário | y |
| Faixa etária | `min_age_months` e `max_age_months` (inteiros, nullable em um dos lados); sem sobreposição obrigatória nem proibida | Bebês precisam de meses; igrejas variam | n |
| Criança sem turma que a comporte | Check-in permite escolher turma manualmente com aviso, nunca bloqueia | Segurança operacional > regra rígida | n |
| Quem é "criança" | `Person` com `birth_date`; guardada em `Household` com `HouseholdMember.role = child` | Reusa 360°; MVP-doc já prevê Household para infantil | n |
| Criança sem conta | Sem `UserAccount`; só o responsável tem login | Menores não autenticam | y |
| Responsáveis | Novo `KidsGuardian` (criança, pessoa, parentesco, `can_pickup`, `is_primary`); ≥1 primário | Retirada exige lista explícita, não só o Household | n |
| Terceiro autorizado sem conta | Pessoa cadastrada pelo responsável com nome + telefone + foto opcional; retira com código | Avó/vizinho buscam; precisa rastro | n |
| Consentimento | `ConsentRecord` do responsável com `origin = 'kids'` e versão do termo; sem consentimento válido não há check-in | LGPD Art. 14; responsável cadastra | y |
| Dados sensíveis | Alergia/restrição e observação médica: texto livre, visível só a equipe kids e liderança, auditado | Art. 11 (saúde) | n |
| Check-in | Responsável (app) ou equipe (web/mobile) lê QR; gera `KidsCheckin` com `code` curto de 4 caracteres único por sessão | Etiqueta criança + responsável com o mesmo código | n |
| Check-out | Só com código ou QR do responsável; quem não tem `can_pickup` é recusado; override só por líder kids com motivo gravado | Núcleo de segurança | n |
| Capacidade da turma | Aviso ao atingir; não bloqueia | Decisão pastoral na hora | n |
| Contagem de crianças (PROD-37) | `CelebrationAttendance.children` passa a sugerir o total de check-ins do culto, editável; sem check-in, segue manual | Mantém contrato atual, sem migração de dados | n |
| Escala | `CelebrationMinistry` ganha vínculo opcional com `KidsSession`; ministério "Kids" existente é reaproveitado | Evita escala paralela | n |
| Plano | `premium`, como celebrações (`@RequiresPlan('premium')`) | Depende da escala/celebração | n |
| Quem gerencia | `tenant_admin`, `admin_congregation`, `pastor`, `secretary` e líder do ministério kids; `volunteer` escalado só opera check-in/out da sua sessão | Mínimo privilégio | n |
| Retenção | Check-ins guardados 12 meses; criança anonimizada via fluxo existente de `anonymized_at`; exclusão em 30 dias pós-contrato | Contrato já prevê; `Person` já tem `anonymized_at` | n |
| RLS | Todas as tabelas novas com `app_congregation_allowed()` em `USING` e `WITH CHECK`, script novo no bootstrap e passo 7 | Regra do monorepo | y |

**Open questions:** nenhuma sem default registrado. Linhas `n` valem se não houver discordância. Duas merecem olho do dono do produto: a faixa etária em meses (bebês) e o prazo de retenção de check-ins.

---

## User Stories

### P1: Turmas e sessões por culto ⭐ MVP

**User Story**: Como líder kids, quero cadastrar turmas e abrir uma ou mais delas em cada culto, para refletir como a igreja realmente opera.

**Acceptance Criteria**:
1. WHEN líder cria turma com nome e faixa etária THEN o sistema SHALL gravá-la na congregação e listá-la ordenada por idade mínima.
2. WHEN a faixa tem `min` > `max` ou valores negativos THEN o sistema SHALL responder 400.
3. WHEN líder abre sessão kids numa instância com uma turma THEN o sistema SHALL criar `KidsSession` única para o par instância×turma.
4. WHEN o par já existe THEN o sistema SHALL responder 409, sem duplicar.
5. WHEN a instância não tem sessões THEN o sistema SHALL tratá-la como sem culto kids, sem erro e sem exigir cadastro.
6. WHEN a instância é cancelada THEN as sessões SHALL ficar canceladas e não aceitar check-in.
7. WHEN a celebração tem rotina fixa de kids THEN o líder SHALL poder abrir as sessões de várias instâncias de uma vez a partir de um modelo (turmas padrão da celebração).

**Independent Test**: em `teste1-church`, criar turmas "Maternal" e "Júnior", abrir ambas num culto e uma só no seguinte; o terceiro culto fica sem sessão.

---

### P1: Cadastro de criança e responsáveis ⭐ MVP

**User Story**: Como responsável, quero cadastrar meus filhos e quem pode buscá-los, com meu consentimento, para usar o kids com segurança.

**Acceptance Criteria**:
1. WHEN responsável logado cadastra criança (nome, nascimento, alergias, observações) THEN o sistema SHALL criar `Person` e `HouseholdMember(child)` no Household dele.
2. WHEN não há consentimento vigente do responsável THEN o cadastro SHALL ser recusado com 422 e texto do termo.
3. WHEN responsável adiciona terceiro autorizado THEN o sistema SHALL gravar nome, telefone e `can_pickup`.
4. WHEN a criança fica sem responsável primário THEN o sistema SHALL recusar a remoção (422).
5. WHEN a equipe kids abre a ficha THEN o sistema SHALL mostrar alergias e responsáveis, e `AuditInterceptor` SHALL registrar a leitura de dado de saúde.
6. WHEN o responsável revoga o consentimento THEN o sistema SHALL impedir novos check-ins e manter o histórico até a retenção.
7. WHEN a secretaria cadastra a criança no lugar do responsável THEN o sistema SHALL exigir o registro do consentimento (origem `secretaria`) antes de salvar.

**Independent Test**: responsável de `teste1-church` cadastra duas crianças e uma avó autorizada; sem consentimento, o cadastro falha.

---

### P1: Check-in e check-out seguros ⭐ MVP

**User Story**: Como voluntário kids, quero receber e devolver crianças com confirmação do responsável, para ninguém sair com a pessoa errada.

**Acceptance Criteria**:
1. WHEN responsável ou equipe faz check-in de criança numa sessão aberta THEN o sistema SHALL criar `KidsCheckin` com horário, turma, responsável e `code` de 4 caracteres único na sessão.
2. WHEN a criança já tem check-in aberto na mesma instância THEN o sistema SHALL responder 409.
3. WHEN a idade da criança não cabe na faixa da turma THEN o sistema SHALL avisar e permitir confirmar, gravando `age_override = true`.
4. WHEN a sessão atinge a capacidade THEN o sistema SHALL avisar e permitir seguir.
5. WHEN o check-in ocorre THEN o sistema SHALL gerar etiqueta imprimível da criança (nome, turma, alergia em destaque, código) e a do responsável (código).
6. WHEN check-out recebe código/QR de responsável com `can_pickup` THEN o sistema SHALL fechar o check-in com horário e quem retirou.
7. WHEN o código não confere ou a pessoa não pode retirar THEN o sistema SHALL recusar (403) sem revelar o motivo à tela da pessoa e avisar o líder.
8. WHEN líder kids autoriza retirada por exceção THEN o sistema SHALL exigir motivo e gravá-lo.
9. WHEN a sessão é lida por quem não é equipe/liderança THEN o sistema SHALL responder 403.

**Independent Test**: check-in de uma criança com alergia, impressão das duas etiquetas, check-out com código correto passa e com código de outra criança é recusado.

---

### P2: Escala de voluntários kids e contagem

**User Story**: Como líder kids, quero escalar voluntários por sessão e ter a contagem de crianças pronta, sem lançar duas vezes.

**Acceptance Criteria**:
1. WHEN líder escala voluntário numa sessão kids THEN o sistema SHALL criar a atribuição ligada à sessão, reaproveitando confirmação e troca de escala existentes.
2. WHEN a sessão tem menos voluntários que o mínimo definido na turma THEN o sistema SHALL sinalizar a falta na escala.
3. WHEN o culto tem check-ins THEN a contagem de público SHALL sugerir `children` = total de crianças distintas com check-in, editável por quem pode lançar.
4. WHEN o líder substitui o valor sugerido THEN o sistema SHALL guardar o valor lançado e manter o total de check-ins visível ao lado.
5. WHEN voluntário abre "Minhas escalas" THEN o sistema SHALL mostrar a turma e o horário da sessão em que está escalado.

**Independent Test**: escalar dois voluntários, fazer cinco check-ins, abrir contagem e ver `children = 5` sugerido.

---

### P3: Visão da liderança

**User Story**: Como pastor, quero ver presença kids por turma ao longo do tempo.

**Acceptance Criteria**:
1. WHEN abre Indicadores com período THEN o sistema SHALL mostrar média de crianças por turma, só entre sessões com check-in.
2. WHEN nenhuma sessão do filtro tem check-in THEN SHALL mostrar estado vazio, nunca zero.

---

## Edge Cases

- Duas pessoas fazem check-in da mesma criança ao mesmo tempo: índice único parcial (criança × instância, aberto) → 409 para o segundo, sem 500.
- Criança sem `birth_date`: check-in pede a data antes de seguir.
- Código de 4 caracteres colide dentro da sessão: gerar de novo até ser único; fora da sessão pode repetir.
- Culto termina com check-in aberto: a liderança vê a lista de crianças não retiradas e fecha com motivo.
- Responsável perde o celular: líder kids identifica por documento e autoriza por exceção (AC 8).
- Criança em duas turmas no mesmo culto: permitida só após check-out da anterior.
- Turma desativada com sessões futuras: sessões abertas permanecem; novas não podem ser criadas.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| KIDS-01 | P1 Turmas: `KidsRoom` + RLS | Design | Pending |
| KIDS-02 | P1 Sessões: `KidsSession` 0..N por instância (AC 1–6) | Design | Pending |
| KIDS-03 | P1 Sessões em lote a partir de modelo (AC 7) | Design | Pending |
| KIDS-04 | P1 Cadastro de criança e Household (AC 1, 7) | Design | Pending |
| KIDS-05 | P1 Responsáveis e terceiros autorizados (AC 3–4) | Design | Pending |
| KIDS-06 | P1 Consentimento Art. 14 (AC 2, 6) | Design | Pending |
| KIDS-07 | P1 Dados de saúde com auditoria (AC 5) | Design | Pending |
| KIDS-08 | P1 Check-in com código e etiquetas | Design | Pending |
| KIDS-09 | P1 Check-out seguro e exceção | Design | Pending |
| KIDS-10 | P2 Escala por sessão | Design | Pending |
| KIDS-11 | P2 Contagem derivada (PROD-37) | Design | Pending |
| KIDS-12 | P3 Indicadores kids | - | Pending |

**Coverage:** 12 total, 0 mapped to tasks, 12 unmapped ⚠️ (Tasks vem depois do Design)

---

## Implicit-Requirement Dimensions

| Dimension | Coverage |
|---|---|
| Input validation & bounds | Faixa etária, nascimento, código; AC P1 Turmas 2 e Edge Cases |
| Failure / partial-failure | Check-in sem consentimento, culto cancelado; P1 Check-in |
| Idempotency / duplicate | Sessão única por par, check-in aberto único (409) |
| Auth boundaries | Papéis na tabela; volunteer só opera a própria sessão; RLS por congregação |
| Concurrency / ordering | Índice único parcial no check-in aberto |
| Data lifecycle | Retenção 12 meses, anonimização, exclusão pós-contrato |
| Observability | `AuditInterceptor` na leitura de saúde e nas exceções de retirada |
| External-dependency failure | N/A because o MVP não chama serviço externo (etiqueta sai do navegador/app) |
| State-transition integrity | Sessão aberta→cancelada; check-in aberto→fechado, sem reabrir |

## Success Criteria

- [ ] Uma celebração com duas turmas kids e outra sem nenhuma coexistem sem tratamento especial.
- [ ] Nenhuma retirada fecha sem código ou exceção registrada com motivo.
- [ ] Teste de RLS: congregação B não lê criança, responsável nem check-in da A.
- [ ] Fluxo de check-in de uma criança leva menos de 15 segundos no celular.
