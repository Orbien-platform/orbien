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
- [ ] Entrada e saída da criança em segundos, com etiqueta e código casados entre criança e responsável.
- [ ] Voluntários kids são escalados por sessão e a contagem de crianças do culto deriva do check-in.

## Out of Scope

| Feature | Reason |
|---|---|
| Reconhecimento facial | Risco LGPD alto |
| QR impresso na etiqueta | A etiqueta continua só com o código. O QR vive na tela do app do responsável (R3-1); etiqueta no app segue fora |
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
| Faixa etária | **Obrigatória em toda turma**, cada turma com a sua: `min_age_months` e `max_age_months` (inteiros ≥ 0, min ≤ max); sem regra sobre sobreposição entre turmas | Resposta do usuário; meses para caber bebês | y |
| Criança fora da faixa da turma | Cada turma tem `allows_out_of_range` (bool, padrão `false`). Se `true`: aviso com confirmação e segue (`age_override = true`). Se `false`: check-in recusado com a mensagem "fora da faixa etária da turma" | Resposta do usuário | y |
| Quem é "criança" | `Person` com `birth_date`; guardada em `Household` com `HouseholdMember.role = child` | Reusa 360°; MVP-doc já prevê Household para infantil | n |
| Criança sem conta | Sem `UserAccount`; só o responsável tem login | Menores não autenticam | y |
| Responsáveis | Novo `KidsGuardian` (criança, pessoa, parentesco, `can_pickup`, `is_primary`); ≥1 primário | Retirada exige lista explícita, não só o Household | n |
| Terceiro autorizado sem conta | Pessoa cadastrada pelo responsável com nome + telefone + foto opcional; retira com código | Avó/vizinho buscam; precisa rastro; resposta do usuário | y |
| Consentimento | `ConsentRecord` do responsável com `origin = 'kids'` e versão do termo; sem consentimento válido não há check-in | LGPD Art. 14; responsável cadastra | y |
| Dados sensíveis | Alergia/restrição e observação médica: texto livre, visível só a equipe kids e liderança, auditado | Art. 11 (saúde); resposta do usuário | y |
| Check-in | Por código (a equipe faz o check-in e o sistema gera o `code` de 4 caracteres, único na sessão) **ou pela leitura do QR** emitido pelo app do responsável (R3-1). O QR é só um portador: o código segue sendo o segredo da retirada | Etiqueta criança + responsável com o mesmo código; respostas do usuário e do dono (2026-10-29) | y |
| Responsável pela entrada | Todo check-in grava **quem entrega** (`guardian_person_id`, obrigatório, de `KidsGuardian`) e **quem recebe na turma** (`checked_in_by`, obrigatório, usuário da equipe) | Resposta do usuário ("tem que ter um responsável pela entrada") | y |
| Check-out | Com o código digitado **ou o QR** da tela do código do responsável (equivalentes: mesmas regras de `can_pickup`, mesma recusa 403, mesma auditoria); 5 tentativas erradas travam o check-in (R3-2); override só por líder kids com motivo gravado | Núcleo de segurança; respostas do usuário e do dono (2026-10-29) | y |
| Capacidade da turma | Aviso ao atingir; **não bloqueia** | Resposta do usuário | y |
| Contagem de crianças (PROD-37) | A contagem vem do check-in (total de crianças distintas) e **pode ser alterada manualmente**; sem check-in, segue manual | Resposta do usuário; mantém o contrato atual | y |
| Escala | `CelebrationMinistry` ganha vínculo opcional com `KidsSession`; ministério "Kids" existente é reaproveitado | Evita escala paralela; resposta do usuário | y |
| Plano | `premium` (`@RequiresPlan('premium')`) | Resposta do usuário | y |
| Ficha da família (`GET /persons/households/:id`) | Continua listando os filhos para quem lê Pessoas; sem dado de saúde | Decisão do dono em 2026-10-26 (valida o Verifier: S2 aceito) | y |
| Leitura do código de retirada por `GET /kids/children/:id/checkin` | Responsável (member do Household) e gestão kids; a gestão pode repassar o código a quem esqueceu | Decisão do dono em 2026-10-26 (S3 aceito) | y |
| Autorizados a retirar: quem adiciona e remove | Qualquer adulto do Household; só o editar exige ser responsável primário ou gestão | Decisão do dono em 2026-10-26 (S4 aceito) | y |
| Reimpressão de etiquetas | Só quem fez o check-in, enquanto aberto; outros papéis 403 | Corrige S1 do Verifier: a equipe não relê o código | y |
| Quem gerencia | `tenant_admin`, `admin_congregation`, `pastor`, `secretary` e líder do ministério kids; `volunteer` escalado só opera check-in/out da sua sessão | Mínimo privilégio; resposta do usuário | y |
| Retenção e anonimização | Check-ins guardados 12 meses e depois anonimizados pelo fluxo existente (`anonymized_at`). **Enquanto o responsável pelo check-in for membro ativo, o registro não é anonimizado**; deixou de ser membro ativo → segue a regra dos 12 meses. Exclusão em 30 dias pós-contrato | Resposta do usuário; contrato já prevê | y |
| RLS | Todas as tabelas novas com `app_congregation_allowed()` em `USING` e `WITH CHECK`, script novo no bootstrap e passo 7 | Regra do monorepo | y |

**Open questions:** nenhuma. Revisão de 2026-10-26: o dono do produto respondeu os pontos em aberto. Seguem como `n` só Household, responsáveis (`KidsGuardian`) e consentimento, que seguem o desenho proposto.

---

## User Stories

### P1: Turmas e sessões por culto ⭐ MVP

**User Story**: Como líder kids, quero cadastrar turmas e abrir uma ou mais delas em cada culto, para refletir como a igreja realmente opera.

**Acceptance Criteria**:
1. WHEN líder cria turma com nome, faixa etária e a opção de aceitar fora da faixa THEN o sistema SHALL gravá-la na congregação e listá-la ordenada por idade mínima.
2. WHEN a faixa está ausente, tem `min` > `max` ou valores negativos THEN o sistema SHALL responder 400.
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
8. WHEN a gestão kids (inclui o `ministry_leader`, que não lê `GET /persons`) busca adultos para cadastrar criança ou autorizado (`GET /kids/guardians/search?q=`) THEN o sistema SHALL devolver até 20 adultos (`is_child = false`, vivos, da mesma congregação) com `id`, nome e telefone mascarado, sem criança nem dado sensível; `member` e `volunteer` SHALL receber 403.

**Independent Test**: responsável de `teste1-church` cadastra duas crianças e uma avó autorizada; sem consentimento, o cadastro falha.

---

### P1: Check-in e check-out seguros ⭐ MVP

**User Story**: Como voluntário kids, quero receber e devolver crianças com confirmação do responsável, para ninguém sair com a pessoa errada.

**Acceptance Criteria**:
1. WHEN responsável ou equipe faz check-in de criança numa sessão aberta THEN o sistema SHALL criar `KidsCheckin` com horário, responsável que entrega, membro da equipe que recebe e `code` de 4 caracteres único na sessão.
1b. WHEN o check-in vem sem responsável que entrega ou sem quem recebe THEN o sistema SHALL responder 400.
1c. WHEN o responsável pede o QR de check-in de um filho (`POST /kids/children/:id/qr`) THEN o sistema SHALL emitir um QR de curta duração (5 minutos) e uso único, preso à criança e ao responsável que o emitiu, e SHALL aceitar o pedido só de responsável cadastrado (`KidsGuardian`) e adulto do Household da criança (404 aos demais; 409 se a criança já está presente). WHEN a equipe lê o QR (`POST /kids/sessions/:id/checkins/by-qr`) THEN o check-in SHALL sair com `guardian_person_id` = quem emitiu e `checked_in_by` = quem leu, passando por TODAS as regras do check-in normal (faixa, consentimento, 409, capacidade só avisa); QR expirado, já usado, forjado ou malformado SHALL receber um 403 genérico, sem revelar o motivo (que fica só na auditoria `kids.checkin_qr_denied`). Falha do check-in (409, 422) SHALL NOT consumir o QR.
2. WHEN a criança já tem check-in aberto na mesma instância THEN o sistema SHALL responder 409.
3. WHEN a idade da criança não cabe na faixa e a turma tem `allows_out_of_range = true` THEN o sistema SHALL avisar, pedir confirmação e, confirmado, gravar `age_override = true`.
3b. WHEN a idade não cabe e a turma tem `allows_out_of_range = false` THEN o sistema SHALL responder 422 "fora da faixa etária da turma", sem confirmação possível.
4. WHEN a sessão atinge a capacidade THEN o sistema SHALL avisar e permitir seguir (nunca bloquear).
5. WHEN o check-in ocorre THEN o sistema SHALL gerar etiqueta imprimível da criança (nome, turma, alergia em destaque, código) e a do responsável (código).
6. WHEN check-out recebe o código de responsável com `can_pickup` THEN o sistema SHALL fechar o check-in com horário e quem retirou.
6b. WHEN o check-out recebe o QR da tela do código do responsável (`GET /kids/children/:id/checkin` devolve `qr`, com o mesmo código embutido e assinado) no lugar do código digitado THEN o sistema SHALL tratá-lo como o código: mesmas regras de `can_pickup`, mesma recusa 403 idêntica, mesma auditoria e mesma contagem de tentativas; QR forjado, adulterado ou de outro check-in SHALL valer como código errado.
7. WHEN o código não confere ou a pessoa não pode retirar THEN o sistema SHALL recusar (403) sem revelar o motivo à tela da pessoa e avisar o líder. O código é mostrado no check-in (a quem o fez: o responsável no app, ou a equipe no balcão para repassá-lo) e ao responsável a qualquer momento (`GET /kids/children/:id/checkin`); **não** aparece à equipe no roster nem pode ser relido por ela depois — a etiqueta é opcional, o código não depende dela. A reimpressão (`GET /kids/checkins/:id/labels`) é só de quem fez o check-in (`checked_in_by` = usuário do token) e só enquanto ele está aberto; qualquer outro usuário ou papel, gestão e voluntário escalado inclusos, recebe 403.
7b. WHEN o check-out de um check-in acumula **5 tentativas de código errado** (por código digitado ou por QR) THEN o sistema SHALL travá-lo: toda tentativa seguinte, inclusive com o código certo e pessoa autorizada, SHALL receber o MESMO 403 genérico do AC 7 (o travamento não é revelado), sem fechar o check-in; SHALL gravar a auditoria `kids.checkout_locked` (uma vez) e avisar o líder por push; só `checkout-override` do líder kids o encerra. Acerto antes da 5ª falha fecha normalmente. Só código errado conta (código certo com pessoa sem `can_pickup` não gasta tentativa); o contador é por check-in e atômico sob concorrência.
6c. WHEN o check-in é gravado por OUTRA pessoa que não o responsável primário (equipe ou terceiro autorizado) THEN o sistema SHALL avisar por push o responsável primário com conta ("Criança recebida na turma X", só primeiro nome e turma, sem dado de saúde); o primário que fez o check-in ele mesmo NÃO SHALL ser avisado. WHEN o check-out fecha (código, QR ou override) THEN o aviso "Criança entregue" SHALL ir ao primário e aos demais responsáveis com `can_pickup` que tenham conta, exceto a pessoa que retirou. Ambos usam a categoria/preferência `kids` (AD-003) e são best-effort: falha de push nunca desfaz o check-in/out.
8. WHEN líder kids autoriza retirada por exceção THEN o sistema SHALL exigir motivo e gravá-lo. É o caminho quando o responsável esqueceu o código, já que a equipe não consegue relê-lo.
9. WHEN a sessão é lida por quem não é equipe/liderança THEN o sistema SHALL responder 403.

**Independent Test**: check-in de uma criança com alergia, impressão das duas etiquetas, check-out com código correto passa e com código de outra criança é recusado.

---

### P2: Escala de voluntários kids e contagem

**User Story**: Como líder kids, quero escalar voluntários por sessão e ter a contagem de crianças pronta, sem lançar duas vezes.

**Acceptance Criteria**:
1. WHEN líder escala voluntário numa sessão kids THEN o sistema SHALL criar a atribuição ligada à sessão, reaproveitando confirmação e troca de escala existentes.
2. WHEN a sessão tem menos voluntários que o mínimo definido na turma THEN o sistema SHALL sinalizar a falta na escala.
3. WHEN o culto tem check-ins THEN a contagem de público SHALL trazer `children` = total de crianças distintas com check-in como valor inicial.
4. WHEN quem pode lançar altera o valor manualmente THEN o sistema SHALL guardar o valor lançado e manter o total de check-ins visível ao lado.
5. WHEN voluntário abre "Minhas escalas" THEN o sistema SHALL mostrar a turma e o horário da sessão em que está escalado.
6. WHEN a liderança lista as instâncias da celebração (`GET /celebrations/instances`) THEN cada instância SHALL trazer `checkin_total` (crianças distintas com check-in, aberto ou fechado; 0 quando não há), com o mesmo significado do `checkin_total` da contagem de público e calculado numa única agregação. O `ministry_leader` SHALL ler a lista e a contagem total.

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
- Criança sem `birth_date`: check-in pede a data antes de seguir (sem ela a faixa não se valida).
- Código de 4 caracteres colide dentro da sessão: gerar de novo até ser único; fora da sessão pode repetir.
- Culto termina com check-in aberto: a liderança vê a lista de crianças não retiradas e fecha com motivo.
- Responsável perde a etiqueta ou esquece o código: líder kids identifica por documento e autoriza por exceção (AC 8).
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
| KIDS-08 | P1 Check-in por código, responsável pela entrada e etiquetas | Design | Pending |
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
