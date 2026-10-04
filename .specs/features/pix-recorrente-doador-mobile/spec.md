# PIX recorrente do doador (mobile) — Specification

Avaliação e plano de `PROD-27` (parte "tela do doador", que o `docs/PLANO.md`
deixou como trabalho de produto para o mobile). **Esta spec avalia e planeja;
não implementa.** Escopo Large/Complex: dinheiro, multi-tenant, integração
externa, LGPD.

**Veredito (detalhe em "Recomendação")**: **construir depois**, e só depois de
fechar o pré-requisito P0 abaixo — que é um furo que já existe no fluxo do
tesoureiro.

**Atualização 2026-10-03**: P1 (contratar, ver, cancelar) e parte de P2 foram
construídos **atrás da trava `ASAAS_PAYMENTS_ENABLED`, desligada para todos**
(`PROD-28`). P0 (entrega da cobrança) e PRD-DONOR-12 (split/subconta) seguem
abertos — são o que impede ligar a trava. Progresso por task em `tasks.md`.

## Problem Statement

Hoje só `admin_congregation`/`treasurer`/`tenant_admin` criam, listam e cancelam
assinatura PIX recorrente, em nome do doador (`POST/GET/PATCH
/financial/pix/subscriptions`, `pix.controller.ts:58-82`, Premium via
`@RequiresPlan`). O papel `member` não tem rota. A tela do tesoureiro existe no
web (`PixSubscriptionsPanel`). O doador que quer "dizimar no automático"
precisa pedir ao tesoureiro e não consegue parar sozinho — o que também é um
problema de LGPD/consumidor (cancelar tem que ser tão fácil quanto contratar).

## Evidência do estado atual (verificada no código em 2026-10-01)

| # | Achado | Onde |
|---|---|---|
| E1 | O cliente Asaas da assinatura é **a igreja** (um por tenant, `externalReference=tenantId`), não o doador. O doador não tem e-mail/CPF na Asaas; a cobrança mensal vai para o cliente-igreja. | `pix.service.ts:237-251`, `:380-390` |
| E2 | `createSubscription` devolve a linha local; **não persiste nem devolve** `invoiceUrl`/QR da cobrança. A UI do web diz só "primeira cobrança vence amanhã". Nada entrega o PIX do ciclo ao doador. | `pix.service.ts:398-410`, `PixSubscriptionsPanel.tsx:252` |
| E3 | O código cria `billingType: 'PIX'`, `cycle: 'MONTHLY'` — cobrança PIX mensal. Se isso é o "PIX Automático" (débito recorrente autorizado pelo doador) ou apenas uma cobrança PIX que o doador paga manualmente todo mês, **não está verificado** (ver Q1). Os docs de produto prometem "PIX Automático". | `pix.service.ts:382-390`; `pricing-church-platform.md:134` |
| E4 | `JwtPayload` não tem `person_id` (`jwt-payload.interface.ts`). `UserAccount.person_id` é **nullable** (`schema.prisma` ~254). Logo "a própria pessoa" tem que vir do banco, e conta sem `Person` vinculada existe. | |
| E5 | `PlanGuard` lê `user.plan` **da claim** (até 15 min defasada) (`plan.guard.ts`). O precedente que lê do banco é o `MemberCapService`/recibo (`TenantPlan`). | |
| E6 | `tenant_congregation_isolation` (023) isola por tenant + congregação; `app_congregation_allowed` = `congregation == sessão OR tenant_admin` (`003:30-36`). **Não distingue pessoa**: qualquer `member` da congregação passa no RLS para as assinaturas de todos os outros doadores dela. | `023_rls_pix_subscriptions.sql` |
| E7 | `createSubscription` não tem idempotência: chama a Asaas **antes** de gravar a linha (falha no `create` local deixa assinatura ativa e cobrando sem registro) e dois toques criam duas assinaturas. `amount` só tem `@IsPositive` (sem mínimo/máximo); `description` é texto livre enviado à Asaas. | `pix.service.ts:378-410`, `create-pix-subscription.dto.ts` |
| E8 | Cancelar já confirma na Asaas antes de marcar `cancelled`, e cancelar duas vezes é no-op; webhook de assinatura cancelada é ignorado. Correto — é o desenho a reaproveitar. Mas 404 da Asaas (já removida) hoje vira 503 e a assinatura nunca fecha localmente. | `pix.service.ts:422-443`, `:577-580` |
| E9 | **Decidido (AD-008, 2026-10-03)**: a tarifa Asaas é do tenant e a Orbien recebe 1% por split em toda cobrança. Hoje nenhuma cobrança leva `split` (nem a recorrente, nem as de `/payments`) e a conta é única — o padrão ainda não está no código. A assinatura do doador **deve** nascer pelo montador único de `asaas-taxa-e-split-padrao`, não com corpo próprio. | `.specs/STATE.md` AD-008; `.specs/features/asaas-taxa-e-split-padrao/` |
| E10 | Recibo (PROD-03) já sai do webhook para `PixPayment` com `donor_person_id` + tenant Premium (do banco) + doador **com e-mail**; o `PixPayment` recorrente já carrega `donor_person_id` (`:585-593`), então recibo e carnê anual (PROD-08) funcionam sem mudança. Não há rota de recibo para o próprio doador (`/financial/donation-receipts` é do tesoureiro). | PLANO PROD-03/08 |
| E11 | No mobile, "Contribua" abre `${webUrl}/doar/{slug}` no navegador (doação avulsa pública) (`(tabs)/index.tsx:108-119`). Não há tela financeira autenticada. O padrão de QR/copia-e-cola dentro do app existe em `EventRegistrationPanel.tsx`. O plano chega no JWT do mobile (`jwt.ts`), só como dica de UI. | |
| E12 | A restrição do piso (`restricao-acesso-piso-member`) bloqueia `member` no web — o app é o único cliente do doador `member`. | `.specs/features/restricao-acesso-piso-member` |

## Goals

- [ ] O doador contrata, vê e cancela **a própria** assinatura de dízimo pelo app, sem depender do tesoureiro.
- [ ] Nenhum `member` consegue ler, criar ou cancelar assinatura de outra pessoa (provado por teste de integração + RLS).
- [ ] Cancelar nunca diz "cancelado" ao doador sem a Asaas ter confirmado.
- [ ] Plano Premium e identidade do doador vêm sempre do banco, nunca da claim nem do corpo.
- [ ] O doador recebe, de verdade, o meio de pagar cada ciclo (ou autoriza o débito) — **P0, pré-requisito**.
- [ ] A assinatura é criada pelo montador único de cobrança (tarifa do tenant + split de 1% para a Orbien, AD-008) — **PRD-DONOR-12, pré-requisito**.

## Out of Scope

| Feature | Reason |
|---|---|
| Doação avulsa/QR dinâmico do doador no app | É `PROD`-separado (Cenário 2 é do tesoureiro); "Contribua" já cobre o avulso via web. |
| Editar valor/pausar assinatura | Asaas permite, mas o MVP é contratar/ver/cancelar (cancelar + recriar cobre). |
| Tela no `apps/web` para o doador | `member` não loga no web (E12). |
| Cartão/boleto recorrente | PROD-27 é PIX. |
| Mudar o fluxo do tesoureiro | Só o furo E2 é compartilhado e entra como P0. |
| Reembolso/estorno de ciclo já pago | Fluxo financeiro próprio, fora do dízimo automático. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Rota do doador | `/me/pix-subscriptions` (POST/GET/PATCH `:id/cancel`) num controller novo, **sem** `@Roles` de gestão; `JwtAuthGuard` + `TenantContextInterceptor` | `/me/permissions` já é o precedente de rota "só o que é meu"; `donor_person_id` nunca entra no DTO | n (decisão de design) |
| Quem é "a própria pessoa" | `UserAccount.person_id` lido do banco por `user.sub`; ausente → 409 "conta sem cadastro de pessoa" | E4 | n |
| Premium | Consulta `TenantPlan` no banco em cada rota `/me/pix-subscriptions`; claim ignorada | E5, regra do pedido | n |
| Congregação/categoria | Congregação da sessão e `resolveCategory` como no fluxo existente | Mantém RLS 023 e o webhook funcionando | n |
| RLS | **Sem policy nova no MVP**: a 023 já é simétrica (USING = WITH CHECK, verificado no passo 7 do bootstrap) e isola tenant/congregação; o isolamento por **pessoa** é `WHERE donor_person_id = <do banco>` no serviço, com teste que prova que um `member` não vê a do vizinho | Policy por pessoa exige um GUC novo (`app.person_id`) no `TenantContextInterceptor` — mudança transversal, ver Q5 | n |
| Uma assinatura ativa por doador | Índice único parcial `(tenant_id, donor_person_id) WHERE status='active'` | Evita duplicata por toque duplo e por retry | n |
| Valor | Mínimo e máximo configuráveis em constante; sem `description` livre do doador (texto fixo "Dízimo automático via Orbien") | E7; superfície de abuso e injeção na Asaas | n — valores em Q4 |
| Criação com falha parcial | Gravar linha `pending` → chamar Asaas → ativar; `pending` órfã é reconciliada/expirada | E7 | n |
| Cancelar | Asaas `DELETE` primeiro; 404 da Asaas = já removida → marcar `cancelled`; demais erros → 503 e linha segue `active` | E8 | n |
| Consentimento | Aceite explícito versionado (`donor_recurring_consent_v1`) gravado com data/versão/IP na criação; texto diz valor, periodicidade, que cancela a qualquer momento no app | LGPD map §2.3/§consent; prática de cobrança recorrente | n — texto jurídico em Q6 |
| Entrada no app | CTA "Dízimo automático" dentro de uma tela de Contribuição autenticada (não no `HomeQuickActions` sozinho) e atalho no Perfil; **escondido** para tenant Starter (sem upsell ao doador) | E11 | n |

**Open questions (dono do produto):** ver seção final. Nenhuma bloqueia a spec,
mas **Q1–Q3 bloqueiam o início da implementação**.

---

## User Stories

### P0: Entregar a cobrança ao doador ⭐ pré-requisito (fecha E1–E3)

**User Story**: Como doador com assinatura ativa, quero receber o PIX (ou a
autorização) de cada ciclo, para que a assinatura realmente cobre.

**Why P0**: sem isto a feature mobile é uma tela que cria uma assinatura que
ninguém paga — e o fluxo do tesoureiro já sofre o mesmo.

**Acceptance Criteria**:

1. WHEN a assinatura é criada THEN o sistema SHALL ter, para o primeiro ciclo, um `invoiceUrl`/QR obtido da Asaas e persistido (ou re-buscável) por `pix_subscriptions.id`.
2. WHEN o doador abre a assinatura no app THEN o sistema SHALL devolver o PIX (copia-e-cola + QR) da cobrança em aberto do ciclo, buscado na Asaas sob demanda, nunca de cache além do vencimento.
3. WHEN a decisão de Q1 for "débito automático autorizado" THEN o sistema SHALL expor o fluxo de autorização da Asaas em vez do QR por ciclo.
4. WHEN o ciclo seguinte vence THEN o doador SHALL ser avisado por push (categoria existente de preferência) ou pelo canal definido em Q2.

**Independent Test**: criar assinatura em `teste1-church` (sandbox Asaas) e obter o QR da primeira cobrança pela API, sem passar pelo e-mail da igreja.

---

### P1: Contratar a própria assinatura ⭐ MVP

**User Story**: Como membro/doador de tenant Premium, quero contratar dízimo mensal automático.

**Acceptance Criteria**:

1. WHEN `member` autenticado envia `POST /me/pix-subscriptions {amount, consent}` THEN o sistema SHALL criar assinatura com `donor_person_id` = `UserAccount.person_id` do banco; qualquer `donor_person_id` no corpo SHALL ser rejeitado (whitelist do `ValidationPipe`).
2. WHEN o tenant (lido de `TenantPlan` no banco) é `starter`, ainda que a claim diga `premium` THEN o sistema SHALL responder 403 e não chamar a Asaas.
3. WHEN a conta não tem `person_id` THEN o sistema SHALL responder 409 sem chamar a Asaas.
4. WHEN o doador já tem assinatura `active` THEN o sistema SHALL responder 409 com a assinatura existente (índice único parcial), sem segunda chamada à Asaas.
5. WHEN o mesmo `Idempotency-Key` é reenviado THEN o sistema SHALL devolver a mesma assinatura, sem nova chamada à Asaas.
6. WHEN `amount` está fora de [mínimo, máximo] ou `consent` ausente/desatualizado THEN o sistema SHALL responder 400.
7. WHEN a Asaas falha ou dá timeout THEN o sistema SHALL responder 503, não deixar linha `active` e não deixar assinatura Asaas sem linha local (reconciliação de `pending`).
8. WHEN a chave PIX da igreja não está configurada THEN o sistema SHALL responder 400 com a mesma mensagem do fluxo do tesoureiro.

**Independent Test**: `POST` como `member` de `teste1-church` → linha com a pessoa certa; repetir → 409/mesma linha; corpo com `donor_person_id` alheio → 400.

---

### P1: Ver a própria assinatura ⭐ MVP

**Acceptance Criteria**:

1. WHEN `GET /me/pix-subscriptions` THEN o sistema SHALL listar apenas linhas com `donor_person_id` da conta do token, nunca as de outras pessoas da mesma congregação.
2. WHEN a conta não tem `person_id` THEN o sistema SHALL devolver lista vazia (leitura não falha).
3. WHEN o tenant deixou de ser Premium THEN o sistema SHALL ainda **listar** e permitir **cancelar** (decisão Q3: cancelar nunca é bloqueado por plano) mas não criar.
4. WHEN o histórico é pedido THEN o sistema SHALL incluir os `PixPayment` recorrentes confirmados da pessoa (data, valor) — base do "o que já dizimei".

---

### P1: Cancelar a própria assinatura ⭐ MVP

**Acceptance Criteria**:

1. WHEN `PATCH /me/pix-subscriptions/:id/cancel` e a assinatura é do doador THEN o sistema SHALL chamar `DELETE /subscriptions/:id` na Asaas e **só então** marcar `cancelled` + `cancelled_at`.
2. WHEN `:id` é de outra pessoa (mesma ou outra congregação/tenant) THEN o sistema SHALL responder 404 (não 403, para não confirmar existência) e não chamar a Asaas.
3. WHEN a Asaas responde erro ≠ 404 THEN o sistema SHALL responder 503 e manter `active`; o app SHALL dizer "não foi possível cancelar agora — tente de novo", nunca "cancelado".
4. WHEN a Asaas responde 404 (já removida) THEN o sistema SHALL marcar `cancelled`.
5. WHEN o cancelamento é repetido ou concorrente THEN o sistema SHALL ser idempotente (no-op, uma só chamada efetiva à Asaas).
6. WHEN um webhook de cobrança chega depois do cancelamento THEN o sistema SHALL ignorá-lo (comportamento já existente, mantido e testado).

---

### P2: Consentimento e recibo visíveis ao doador

1. WHEN o doador contrata THEN o app SHALL mostrar o aceite com valor, dia, periodicidade e como cancelar, e o sistema SHALL gravar versão/data do aceite.
2. WHEN o doador não tem e-mail cadastrado THEN o app SHALL avisar que o recibo (PROD-03) não será enviado e oferecer atualizar o e-mail.
3. WHEN o doador pede seus recibos THEN o sistema SHALL listar só os da própria pessoa (rota `/me` nova ou adiada — Q7).

### P2: Falhas e estados no app

1. WHEN a Asaas está indisponível na criação THEN o app SHALL mostrar erro recuperável sem estado "pendente" inventado.
2. WHEN há assinatura `pending` THEN o app SHALL mostrar "processando" e reconsultar, nunca duplicar a chamada.

### P3: Push de lembrete do ciclo / cobrança falha

(Depende de Q2 e de nova categoria de preferência; não entra no MVP.)

---

## Edge Cases

- Conta `member` + papel de tesoureiro: as rotas `/financial/pix/subscriptions` seguem valendo para a gestão; `/me/...` sempre opera só na própria pessoa, mesmo para o tesoureiro.
- Sessão de suporte (`support_session: true`): `/me/pix-subscriptions` **não** deve criar nem cancelar em nome do alvo — responder 403 (a impersonação é para ver, não para mover dinheiro do doador).
- Pessoa mesclada/anonimizada (LGPD, esquecimento) com assinatura ativa: anonimizar exige cancelar antes na Asaas.
- Mudança de congregação do doador com assinatura ativa: a linha segue na congregação de origem (RLS 023); o app lista pela pessoa, e o cancelamento tem que achar a linha — ver Risco R6 do design.
- Webhook de ciclo chega antes de a linha `pending` ser ativada: tratar como ativa só após reconciliação.

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| PRD-DONOR-01 | P0: cobrança do ciclo chega ao doador | Design | Pending |
| PRD-DONOR-02 | P1: criar só a própria (pessoa do banco) | Execute | Implemented (atrás da trava) |
| PRD-DONOR-03 | P1: plano do banco, não da claim | Execute | Implemented (atrás da trava) |
| PRD-DONOR-04 | P1: uma ativa por doador + idempotência | Execute | Partial — sem saga `pending` (tasks.md, desvio 1) |
| PRD-DONOR-05 | P1: listar só as próprias | Execute | Implemented (atrás da trava) |
| PRD-DONOR-06 | P1: cancelar confirma na Asaas | Execute | Implemented |
| PRD-DONOR-07 | P1: anti-IDOR (404 para alheia) | Execute | Implemented |
| PRD-DONOR-08 | P2: consentimento versionado | Execute | Implemented (texto jurídico pendente, PROD-28 Q4) |
| PRD-DONOR-09 | P2: recibo/e-mail ausente | - | Pending |
| PRD-DONOR-10 | P2: estados e falhas no app | Execute | Implemented |
| PRD-DONOR-11 | P3: lembretes por push | - | Pending |
| PRD-DONOR-12 | Pré-requisito: criar pelo montador único com split (AD-008) | Design | Pending — entregue por `asaas-taxa-e-split-padrao` |

**Coverage:** 12 total, 11 mapeados em tasks (PRD-DONOR-12 via T3b), 1 (PRD-DONOR-11) adiado de propósito.

## Dimensões implícitas (sweep)

| Dimensão | Resolução |
|---|---|
| Validação/limites | PRD-DONOR-02/04: min/máx, sem `description` livre |
| Falha parcial | AC P1-7, `pending` + reconciliação |
| Idempotência | `Idempotency-Key` + índice único parcial |
| Auth/rate limit | `@Throttle` (padrão 10/min do controller) + sessão de suporte barrada |
| Concorrência | cancelar/criar concorrentes: `updateMany` condicional, índice único |
| Ciclo de vida | cancelar sem apagar a linha (5 anos, LGPD map §2.3) |
| Observabilidade | log de falha Asaas (existente) + `AuditInterceptor` já grava a rota |
| Dependência externa | Asaas fora → 503, nunca estado otimista |
| Transição de estado | `pending → active → cancelled`; `cancelled` terminal |

## Success Criteria

- [ ] Doador de `teste1-church` contrata, vê o QR do 1º ciclo e cancela sem tesoureiro.
- [ ] Teste de RLS/integração prova que `member` A não lê nem cancela a assinatura de `member` B (mesma congregação) nem a de outro tenant.
- [ ] Zero cobrança Asaas ativa sem linha local `active` (reconciliação testada).

---

## Recomendação

**Construir depois — e não por falta de valor.**

0. **Regra de taxa/split decidida (AD-008)**: tarifa do tenant e 1% por split valem para esta feature como para todas; o código ainda não cumpre (nenhum `split`, conta Asaas única). Isso vira segundo pré-requisito, junto do P0.
1. **Valor é real**: dízimo automático é a "âncora comercial" do Premium (ADR, pricing §134); o doador hoje não consegue parar sozinho; o custo marginal da tela é baixo porque RLS 023, webhook, recibo (PROD-03) e carnê (PROD-08) já funcionam para `PixPayment` recorrente (E10).
2. **Mas o motor não está pronto**: E1–E3 mostram que a assinatura é criada no cliente-Asaas da igreja e **ninguém entrega o PIX do ciclo ao doador**. Uma tela de auto-serviço em cima disso cria assinaturas que não cobram — e hoje não há evidência de uso real do fluxo do tesoureiro com cobrança efetivamente paga. Construir o app antes é construir a parte fácil e herdar o furo.
3. **Risco financeiro/legal sobe** quando o doador contrata sozinho: consentimento recorrente, cancelamento garantido, idempotência (E7) e plano do banco (E5) viram requisitos — todos viáveis, nenhum "grátis".
4. **Sequência recomendada**: (a) spike P0 de 1–2 dias em sandbox Asaas respondendo Q1–Q3 (junto com o spike A1 de `asaas-taxa-e-split-padrao`) e, conforme a resposta, corrigindo o fluxo do tesoureiro; (b) só então abrir esta feature (estimativa ~14 tasks, 5 fases — ver `tasks.md`); (c) "Contribua" avulso segue como está.

**Perguntas abertas para o dono do produto**

| # | Pergunta | Por que importa |
|---|---|---|
| Q1 | A promessa é **PIX Automático** (débito recorrente autorizado pelo doador) ou **cobrança PIX mensal** que o doador paga todo mês? O código faz a segunda (E3). **Não verifiquei na documentação da Asaas** se `billingType: PIX` + `MONTHLY` equivale ao Automático; é preciso confirmar. | Define o P0 inteiro e o que é "automático" para o doador. |
| Q2 | Como o doador é avisado de cada ciclo (push, e-mail da Asaas ao doador, nada)? Cadastrar o doador como cliente Asaas próprio (CPF obrigatório?) é aceitável? | E1: hoje a Asaas notificaria o e-mail da igreja. |
| Q3 | Se o tenant cai de Premium para Starter, as assinaturas ativas continuam cobrando? (Recomendação: continuam, cancelar sempre liberado, criar bloqueado.) | Evita igreja que perde plano e doador cobrado sem recibo. |
| Q4 | Valor mínimo/máximo do dízimo automático (sugestão: mín. R$ 10, máx. R$ 5.000 — confirmar mínimo da Asaas para PIX)? | Antiabuso e erro de digitação. |
| Q5 | Aceita o isolamento por pessoa só no serviço (+ testes), ou quer policy RLS por pessoa (exige `app.person_id` no interceptor, mudança transversal)? Recomendação: serviço + teste agora; policy se mais rotas `/me` financeiras surgirem. | Defesa em profundidade vs. custo. |
| Q6 | Quem redige/aprova o texto de consentimento recorrente (`donor_recurring_consent_v1`)? | LGPD map só tem `donor_consent_v1` (avulsa). |
| Q7 | Recibos do próprio doador (`/me/receipts`) entram junto ou depois? | Fecha o ciclo "dizimei → tenho comprovante" no app. |
| ~~Q8~~ | **Respondida em 2026-10-03 (AD-008):** tarifa Asaas é do tenant; 1% por split para a Orbien em toda transação, inclusive a recorrente. Modelo de conta decidido em AD-009 (subconta da igreja criada pela Orbien, só CNPJ). Com isso o doador passa a ser cliente da **subconta da igreja**, o que também resolve E1: a cobrança do ciclo é da igreja para o doador. | Fechada. |
| Q9 | Alguma igreja Premium real (tenant pagante) quer isso agora? | Valida prioridade contra o backlog. |
