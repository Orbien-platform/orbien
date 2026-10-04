# Doação pública Premium com QR dinâmico — Specification

**Estado:** **implementado e validado em 2026-10-03** (ver `validation.md`). A
primeira sessão foi só de planejamento (Specify → Design → Tasks); depois o dono
do produto respondeu as perguntas abertas e pediu tudo no mesmo PR — as respostas
estão na coluna *Confirmed?* abaixo e o que mudou em relação ao plano está em
`tasks.md` §Desvios. Dimensionamento: **Complex** — domínio de pagamento,
rota sem JWT, RLS, dado pessoal (LGPD) e um defeito pré-existente que bloqueia a
confirmação (ver `DPUB-06`).

**Fontes lidas:** `apps/api/src/financial/pix.service.ts` e `pix.controller.ts`,
`dto/create-pix.dto.ts`, `donation-receipts.service.ts`,
`apps/api/prisma/migrations/001_rls_setup.sql` e `023_rls_pix_subscriptions.sql`,
`scripts/bootstrap-db.sh`, `apps/api/test/integration/public-routes.spec.ts`,
`apps/api/src/small-groups/public-small-groups.service.ts`, `apps/api/src/main.ts`,
`apps/web/src/app/(public)/doar/[tenant_slug]/page.tsx`,
`apps/web/src/app/api-proxy/[...path]/route.ts`,
`docs/PLANO.md` (PEND-14, PROD-03, PROD-04, PROD-27), ADR-007 em
`docs/produto/adrs-architecture-decisions.md`, `docs/produto/orbien-lgpd-mapping.md`,
`docs/AMBIENTES.md`.

---

## Problem Statement

A página pública `/doar/[tenant_slug]` só entrega a chave PIX da igreja para
cópia manual, qualquer que seja o plano (`PixService.createPublicDonation`,
`pix.service.ts:520`). A rota grava a intenção em `pix_payments`
(`scenario = public`, `pending`) e **não** cria lançamento: a chave é paga fora
da API, sem confirmação, e DRE/dashboard somam lançamentos sem olhar `status`,
então lançar na hora deixaria qualquer visitante inflar a receita (PEND-14).

O ADR-007 (Cenário 3) prevê o contrário para o Premium: "exibe QR dinâmico
identificado + chave para cópia manual". O QR dinâmico existe
(`createDynamic`, Cenário 2), mas exige JWT e papel financeiro — não há rota
pública. O resultado é que o Premium paga o plano e a página de doação do
doador anônimo é igual à do Starter: sem confirmação automática, sem lançamento,
sem recibo.

## Goals

- [ ] Doador (anônimo ou identificado) de igreja **Premium** recebe, na página
      pública, QR dinâmico + copia-e-cola da Asaas, e vê o estado "pago" sem
      recarregar.
- [ ] Doador de igreja **Starter** continua recebendo exatamente a chave
      estática de hoje (contrato da resposta preservado — o mobile abre essa
      mesma página).
- [ ] O lançamento em `financial_transactions` só nasce quando o webhook da
      Asaas confirma, uma única vez (idempotente), na categoria de receita certa.
- [ ] A rota pública não abre vetor novo: valor limitado, taxa limitada, sem
      cobrança órfã descontrolada, sem enumerar tenants, sem dado de outro tenant,
      sem policy de RLS nova que afrouxe nada.
- [ ] PEND-14 fica resolvido: `donor_name`/`donor_email` guardados com
      consentimento e retenção, e o tesoureiro vê as intenções pendentes.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Split de ~1% da plataforma (ADR-007, Cenário 2) | Não existe em `createDynamic` hoje (nenhum parâmetro `split` nas chamadas à Asaas). A doação pública Premium segue o mesmo corte; split é tema próprio do ADR-007. |
| Cartão, boleto, outro método | ADR-007: PIX é o único método do MVP. |
| Doação recorrente pela página pública | PROD-27 é autenticado (assinatura exige `donor_person_id`); fora desta entrega. |
| Reconciliação das intenções do **Starter** com o extrato (PROD-07) | A tela de intenções pendentes (DPUB-26) só lista e permite o tesoureiro marcar manualmente; casar automaticamente com OFX é outra pendência. |
| Cobrar do doador taxa Asaas ou repassar custo | Decisão comercial, fora do código. |
| Domínio próprio da igreja (`proxy.ts`) | Já resolve `/` → `/doar/[slug]`; esta entrega não muda o roteamento. |
| Corrigir os outros pontos do `PixService` que usam `prisma.client` sem contexto além do webhook | Só o webhook entra (DPUB-06); `createForEventRegistration` roda no contexto do `ContentModule` e não foi tocado. |

---

## Assumptions & Open Questions

Sessão de planejamento sem interlocutor ao vivo: nenhuma gray area foi
discutida em tempo real. Todas viram **suposição** com o default escolhido
(`context.md` não foi criado — o Discuss não rodou). As perguntas ao dono do
produto estão consolidadas em `tasks.md` §Perguntas abertas; as marcadas **BLOQ**
bloqueiam a tarefa citada.

| # | Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- | --- |
| A1 | Onde o plano é lido | `TenantPlan.plan` do tenant resolvido pelo slug, no banco, dentro do `runInPublicContext` | Mesmo princípio de `MemberCapService`/`DonationReceiptService` ("nunca na claim"); aqui nem há claim. `tenant_plans` é legível por `orbien_app` (`orbien_app_auth ... USING (true)`, `017_rls_auth_tables.sql`). | n |
| A2 | Quais `PlanStatus` valem como Premium | `plan = premium` e `status ∈ {active, trial}` | `DonationReceiptService` olha só `plan`; mas um tenant `suspended`/`cancelled` não deve abrir cobrança nova. Divergência deliberada, levada à pergunta Q3. | y (default aceito) |
| A3 | Mesma rota ou rota nova | **Mesma** `POST /financial/pix/public-donation`, com campo novo `mode` na resposta | Mobile e o formulário atual já a chamam; o servidor decide o ramo pelo plano, o cliente nunca pede "dynamic". | n |
| A4 | Falha da Asaas no ramo Premium | Cai para a chave estática com `mode: "static"` e `fallback_reason: "provider_unavailable"`; a intenção fica registrada | Doação não deve ser perdida por indisponibilidade de terceiro; o custo é perder a confirmação automática dessa tentativa. Alternativa (503) em Q4. | y (default aceito) |
| A5 | Valor mínimo/máximo | Mín. R$ 5,00, máx. R$ 50.000,00, no máximo 2 casas decimais — **os limites da Asaas por cobrança** | Hoje só há `@IsPositive()`; `pix_payments.amount` é `Decimal(12,2)`, então valor ≥ 10^10 estoura em 500 e `10.123` é arredondado em silêncio. Mínimo da Asaas para PIX **não verificado** na doc oficial — conferir antes de fixar (T-01). Valores finais em Q2. **Dono do produto: "mínimo e máximo aceitável pela Asaas".** Valores da Central de Ajuda da Asaas (conta PF: até R$ 50 mil; PJ: até R$ 500 mil; mínimo R$ 5), via busca em 2026-10-03 — a doc de referência da API estava bloqueada no ambiente. Adotado o teto de PF, que vale para qualquer conta. | y |
| A6 | Categoria do lançamento | `resolveCategory(..., dto.category_slug)` como hoje, com fallback "Oferta" | Mesmo comportamento do Cenário 1/2/3 atual. Risco menor: o doador escolhe, por texto livre, qualquer categoria de receita cujo nome contenha o termo (ver design, Risks). | n |
| A7 | Doador identificado → `Person` | **Nenhuma** `Person` é criada nem vinculada por e-mail nesta entrega | Vincular pelo e-mail digitado é afirmação não verificada: um terceiro digita o e-mail de um membro e a doação cai no `donor_person_id` dele (recibo e carnê de IR de PROD-08 do membro errado). Criar `Person` a partir da rota pública é coleta de dado sensível (Art. 11) fora do escopo. | n |
| A8 | Recibo (PROD-03) para doador público | **Opção (b), decidida pelo dono do produto:** recibo emitido para o **e-mail declarado**, sem criar `Person` — `donation_receipts.person_id` passou a nulo, com `recipient_name`/`recipient_email` e um CHECK. Entrou neste PR | Reaproveitar `DonationReceiptService` sem alterá-lo exige `Person`; alterá-lo para aceitar snapshot (nome+e-mail da intenção) é decisão de produto. | y |
| A9 | Consentimento | `donor_consent_v1` (ADR/LGPD mapping §3.1) registrado **na própria linha** de `pix_payments` (`donor_consent_version`, `donor_consented_at`), só quando há `donor_email` | `consent_record` exige `person_id` NOT NULL (A7), então não dá para gravar lá. IP/user-agent **não** são guardados (minimização) — diverge do §3.2 do mapeamento; Q6. | y (default aceito: só versão + instante, sem IP/user-agent) |
| A10 | Retenção do dado do doador | **Dado de doação e financeiro é retido** — nenhum job apaga `donor_*` (a anonimização de 30 dias do plano foi descartada) | Minimização: PII de tentativa abandonada não tem finalidade. Prazo de 30 dias é sugestão; Q7. **Dono do produto: "dados financeiros e de doação precisam ser retidos".** Prazo contábil de 5 anos segue em `CONF-02`. | y |
| A11 | Quando uma cobrança some | Expiração preguiçosa na leitura (>24h sem pagamento = `expired` na resposta) + limpeza diária que cancela a cobrança na Asaas **e depois** marca `failed` | Marcar `failed` antes de cancelar na Asaas perderia dinheiro pago depois (DPUB-09). Cron depende do serviço acordado (PEND-13). | y |
| A12 | Polling | Cliente consulta `GET /financial/pix/public-donation/:tenant_slug/:payment_id` a cada 4 s, só enquanto a aba está visível, por até 24 h; para ao ver `confirmed` | Webhook é a única fonte de verdade (não há `GET` de pagamento hoje). Alternativa SSE/WebSocket não existe na base. | y |
| A13 | Fatiamento | Um único PR (o da branch `docs/spec-doacao-publica-premium-qr-dinamico`), commits atômicos por tarefa | Cada PR deployável sozinho; o P0 (webhook) é correção pré-existente e vai primeiro. **Dono do produto: "tudo resolvido nesta PR".** O fatiamento em 5 PRs do plano ficou como alternativa. | y |

**Open questions:** nenhuma — Q1–Q10 foram respondidas pelo dono do produto
(Q1: função SQL `SECURITY DEFINER`, recomendação aceita; Q2–Q4: limites da Asaas,
demais defaults; Q5: opção b; Q6–Q7: dado retido; Q8–Q10: sugestões simples,
adotadas). Ver `tasks.md` §Respostas.

---

## User Stories

### P0: O webhook enxerga o pagamento sob RLS ⭐ pré-requisito

**User Story**: Como plataforma, preciso que `PixService.handleWebhook` consiga
achar o `pix_payments`, criar o lançamento e emitir recibo, para que **qualquer**
confirmação (Cenários 2/3, inscrição paga, recorrente) funcione sob RLS.

**Why P0**: sem isto, nada do que vem depois confirma. Evidência no design
(§Achado crítico) — o webhook roda como `orbien_app` sem `app.tenant_id` e
nenhum teste cobre isso contra o banco.

**Acceptance Criteria**:

1. WHEN a Asaas envia `PAYMENT_CONFIRMED` para um `asaas_payment_id` que existe em
   `pix_payments` de qualquer tenant THEN o sistema SHALL localizar a linha,
   abrir transação com `app.tenant_id` e `app.congregation_id` **da linha
   encontrada** e criar o lançamento nesse tenant/congregação. (`DPUB-06`)
2. WHEN o mesmo evento chega sem o token correto THEN o sistema SHALL responder
   401 e não ler nada. (inalterado)
3. WHEN o `asaas_payment_id` não existe THEN o sistema SHALL responder
   `{ received: true }` sem erro (inalterado) e sem revelar a existência de linhas
   de outro tenant.

**Independent Test**: teste de integração com `teste2-church`: linha
`pix_payments` pendente com `asaas_payment_id` conhecido → `POST
/financial/pix/webhook` com o token → linha `confirmed` + 1 lançamento
`pix_webhook`. Hoje esse teste **falharia** (ver design).

---

### P1: Doador de igreja Premium paga com QR dinâmico ⭐ MVP

**User Story**: Como doador (anônimo ou identificado) da página pública de uma
igreja Premium, quero um QR/copia-e-cola que a igreja reconhece automaticamente,
para doar sem digitar chave e sem mandar comprovante.

**Why P1**: é a promessa do ADR-007 Cenário 3 e o que diferencia Premium na
doação pública.

**Acceptance Criteria**:

1. WHEN `POST /financial/pix/public-donation` chega para um tenant cujo
   `TenantPlan` no banco é Premium (A2) e a Asaas está configurada THEN o sistema
   SHALL criar a cobrança PIX na Asaas (customer da igreja, `value = amount`,
   `externalReference` = id do `pix_payments`), gravar a linha `scenario = public`,
   `status = pending`, com `asaas_payment_id`, `qr_code` e `pix_key`, e responder
   `mode: "dynamic"` com `payment_id`, `qr_code` (copia-e-cola),
   `qr_code_image` (base64), `expires_at`, além de `pix_key`, `amount`,
   `church_name` e `transaction_ref` (campos atuais). (`DPUB-01`, `DPUB-03`, `DPUB-04`)
2. WHEN o tenant é Starter (ou `TenantPlan` ausente) THEN o sistema SHALL
   responder `mode: "static"` com o corpo atual e **não** chamar a Asaas.
   (`DPUB-02`)
3. WHEN o corpo traz qualquer campo de plano/modo (`plan`, `mode`,
   `scenario`) THEN o sistema SHALL rejeitar com 400 (o DTO é
   `forbidNonWhitelisted`) — o plano nunca vem do cliente. (`DPUB-01`)
4. WHEN a Asaas falha (timeout, 4xx, 5xx) no ramo Premium THEN o sistema SHALL
   registrar o erro, responder `mode: "static"` com
   `fallback_reason: "provider_unavailable"` (A4) e a linha ficar sem
   `asaas_payment_id`. (`DPUB-05`)
5. WHEN `ASAAS_API_KEY` não está definida no ambiente THEN o sistema SHALL
   comportar-se como no item 4, sem chamar a Asaas. (`DPUB-05`)
6. WHEN o honeypot `website` vem preenchido THEN o sistema SHALL responder o
   corpo vazio atual sem gravar nem chamar a Asaas. (inalterado)

**Independent Test**: com `teste2-church` (Premium) e `HttpService` simulado,
`POST` devolve `mode: "dynamic"` e a linha existe com `asaas_payment_id`; com
`teste1-church` (Starter) devolve `mode: "static"` e o mock da Asaas não foi
chamado.

---

### P1: Confirmação só pelo webhook, lançamento só confirmado ⭐ MVP

**User Story**: Como tesoureiro, quero que a doação entre no financeiro somente
quando a Asaas confirmar o pagamento, uma vez só, para o DRE não ser inflado nem
duplicado.

**Acceptance Criteria**:

1. WHEN `createPublicDonation` conclui (static ou dynamic) THEN o sistema SHALL
   **não** criar `financial_transactions`. (`DPUB-08`, preserva PEND-14)
2. WHEN `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED` chega para uma linha
   `scenario = public`, `pending` THEN o sistema SHALL, na mesma transação,
   marcar `confirmed` (`updateMany ... WHERE status = pending`) e criar 1
   lançamento `income`, `source = pix_webhook`, na `category_id` da linha, com o
   valor do payload (ou o da linha). (`DPUB-07`, `DPUB-10`)
3. WHEN o mesmo pagamento é reentregue ou chegam `CONFIRMED` e `RECEIVED` em
   paralelo THEN o sistema SHALL manter exatamente 1 lançamento. (`DPUB-07`)
4. WHEN o webhook chega para uma linha `failed` (limpeza já rodou, mas o dinheiro
   entrou) THEN o sistema SHALL confirmar mesmo assim (`failed → confirmed`) e
   criar o lançamento — o pagamento real prevalece sobre a limpeza. (`DPUB-09`)
5. WHEN a linha é do Cenário 3 estático (sem `asaas_payment_id`) THEN o sistema
   SHALL permanecer `pending` até o tesoureiro agir (DPUB-26); nenhum evento
   automático a confirma.
6. WHEN a doação é anônima (sem `donor_name`/`donor_email`) THEN o lançamento SHALL
   sair sem `donor_person_id` e a `description` SHALL ser genérica ("Doação
   pública via PIX"); nenhum recibo é gerado (guarda atual de
   `DonationReceiptService`).
7. WHEN a doação é identificada (A7) THEN o lançamento SHALL sair **sem**
   `donor_person_id` (não há `Person`) e o nome/e-mail declarados SHALL ficar só
   na linha de `pix_payments` (DPUB-22).

**Independent Test**: integração com `teste2-church`: confirmar duas vezes o
mesmo `asaas_payment_id` → `count(financial_transactions) = 1`; confirmar linha
`failed` → lançamento criado.

---

### P1: A rota pública não vira vetor de abuso ⭐ MVP

**User Story**: Como plataforma, quero que uma rota sem login que dispara
chamadas pagas/limitadas à Asaas e escreve no banco tenha teto de valor, de taxa
e de cobranças pendentes, e não vaze nada.

**Acceptance Criteria**:

1. WHEN `amount` é < mínimo, > máximo, não finito ou tem >2 casas decimais THEN o
   sistema SHALL responder 400 com mensagem em português, sem tocar o banco nem a
   Asaas. (`DPUB-11`)
2. WHEN o mesmo cliente excede o limite de criação THEN o sistema SHALL responder
   429. O limite SHALL ser por cliente real, não por IP da Vercel (ver design,
   Risks R1). (`DPUB-12`)
3. WHEN um tenant já tem N cobranças dinâmicas públicas `pending` criadas na
   última hora THEN o sistema SHALL responder o ramo estático (A4) sem chamar a
   Asaas — teto por tenant que independe de IP e de memória do processo.
   (`DPUB-13`)
4. WHEN o slug não existe, não tem chave PIX ou não tem congregação THEN o
   sistema SHALL responder a **mesma** resposta (404 genérico "Igreja não
   encontrada"), sem distinguir os três casos — hoje o 400 "Igreja não
   configurou chave PIX" confirma que o slug existe. (`DPUB-14`)
5. WHEN a resposta é montada THEN o sistema SHALL devolver somente dados da igreja
   do slug (nome, chave, valor, QR); nenhum id de tenant/congregação/categoria nem
   campo de outro tenant. (`DPUB-15`)
6. WHEN um slug de tenant A é usado com um `payment_id` de tenant B na rota de
   status THEN o sistema SHALL responder 404 idêntico ao de id inexistente.
   (`DPUB-15`)
7. WHEN a escrita da rota pública roda THEN o RLS de `pix_payments` SHALL ser a
   fronteira (policy `tenant_congregation_isolation`, `USING` = `WITH CHECK`) e
   **nenhuma policy nova** SHALL ser criada para a escrita (a escrita sem JWT já é
   coberta: ver design §RLS). Se a Q1/DPUB-06 optar por função SQL, o passo 7 do
   `bootstrap-db.sh` SHALL ganhar a verificação dela. (`DPUB-17`)

**Independent Test**: integração: 11 chamadas seguidas → a 11ª devolve 429; slug
inexistente e slug sem chave devolvem corpo e status idênticos; valor
`10000.01` e `4.99` e `10.123` devolvem 400.

---

### P2: A página mostra QR, copia-e-cola e vira "pago" sozinha

**User Story**: Como doador, quero escanear o QR (ou copiar o código), pagar no
meu banco e ver a confirmação na própria página.

**Acceptance Criteria**:

1. WHEN a resposta é `mode: "dynamic"` THEN a página SHALL exibir o QR (imagem),
   o copia-e-cola com botão "Copiar", o valor, o prazo ("válido até dd/mm hh:mm")
   e a chave estática como alternativa recolhida. (`DPUB-18`)
2. WHEN a resposta é `mode: "static"` THEN a página SHALL manter o fluxo atual
   (chave + referência). Se `fallback_reason` existir, SHALL avisar "QR indisponível
   agora; use a chave". (`DPUB-18`)
3. WHEN a página está em `dynamic` e visível THEN SHALL consultar o status a cada
   4 s e, ao receber `confirmed`, trocar para o estado "Doação recebida —
   obrigado" e parar o polling. (`DPUB-19`)
4. WHEN o status retorna `expired` (>24 h) ou o `expires_at` passou THEN a página
   SHALL parar o polling e oferecer "Gerar novo QR" (volta ao formulário com o
   valor preenchido). (`DPUB-20`)
5. WHEN o polling recebe 429/rede cai THEN a página SHALL recuar (backoff) sem
   mostrar erro enquanto o QR continuar válido; WHEN a criação falha THEN SHALL
   mostrar a mensagem de `apiErrorMessage` e permitir tentar de novo. (`DPUB-21`)
6. WHEN o usuário fecha a aba e volta THEN o QR SHALL poder ser recuperado pelo
   `payment_id` guardado em `sessionStorage` (com try/catch; sem ele a página volta
   ao formulário). (`DPUB-21`)

**Independent Test**: `page.test.tsx` (vitest) com `api` mockado: dynamic → QR
visível; resposta do poll `confirmed` → estado "recebida"; timers falsos.

---

### P2: Dados do doador, consentimento e retenção (PEND-14, parte 1)

**User Story**: Como igreja, quero saber quem declarou ter doado, com
consentimento registrado e sem guardar mais do que preciso.

**Acceptance Criteria**:

1. WHEN o formulário envia `donor_name` e/ou `donor_email` THEN o sistema SHALL
   gravá-los em `pix_payments.donor_name`/`donor_email` (novas colunas nullable,
   normalizados: trim, e-mail em minúsculas, nome ≤ 120). (`DPUB-22`)
2. WHEN há `donor_email` THEN o formulário SHALL exigir o aceite de
   `donor_consent_v1` (checkbox + texto/link versionado) e o servidor SHALL
   rejeitar `donor_email` sem `donor_consent: true`; gravar `donor_consent_version`
   e `donor_consented_at`. (`DPUB-23`)
3. ~~WHEN passam 30 dias de uma intenção nunca confirmada THEN um job SHALL
   anonimizar `donor_name`/`donor_email`.~~ **Descartado (A10):** o dono do produto
   decidiu que dado de doação e financeiro é retido; nenhum job apaga `donor_*`.
   O prazo contábil (5 anos) segue em CONF-02. (`DPUB-24`)
4. WHEN a retenção de CONF-02 for implementada THEN `pix_payments.donor_*` e
   `donation_receipts.recipient_*` SHALL estar listados como campos cobertos
   (dependência cruzada, sem escopo aqui).

**Independent Test**: integração: `POST` com e-mail e sem consentimento → 400;
com consentimento → colunas gravadas, e a resposta não as devolve.

---

### P2: Recibo para doador público identificado (opção b — decidida)

**User Story**: Como doador identificado com e-mail, quero receber o recibo (PROD-03).

**Acceptance Criteria**:

1. WHEN a doação confirmada é de doador identificado com `donor_email` e
   consentimento, e o tenant é Premium (do banco) THEN o sistema SHALL emitir o
   recibo e enviá-lo **para o e-mail declarado** (DPUB-25), sem depender de
   `Person`.
2. WHEN a doação é anônima THEN SHALL não gerar recibo (inalterado).
3. WHEN a geração falha THEN o webhook SHALL continuar respondendo 200
   (best-effort, como hoje).

> Implementado pela opção **(b)**: `donation_receipts.person_id` passou a nulo, com
> `recipient_name`/`recipient_email` e um CHECK (`Person` **ou** e-mail). Nenhuma
> `Person` é criada (A7). Também vale na baixa manual do tesoureiro (DPUB-26).

---

### P3: Tela de intenções pendentes do tesoureiro (PEND-14, parte 2)

**User Story**: Como tesoureiro, quero ver as doações públicas pendentes e, no caso
do Starter, marcá-las como recebidas depois de conferir no extrato.

**Acceptance Criteria**:

1. WHEN o tesoureiro abre a aba "Intenções" do financeiro THEN o sistema SHALL
   listar `pix_payments` `scenario = public` da congregação (`status`, valor,
   referência `PIX-XXXXXXXX`, nome/e-mail declarados, data), paginado, sob o
   papel financeiro (`FINANCIAL_ROLES`). (`DPUB-26`)
2. WHEN o tesoureiro marca uma intenção `static` como recebida THEN o sistema
   SHALL, numa transação, passar `pending → confirmed` e criar o lançamento
   `income` com `source = manual` (não `pix_webhook`: ninguém confirmou
   automaticamente) e registrar auditoria. Idempotente pelo mesmo
   `updateMany` condicional. (`DPUB-26`)
3. WHEN a intenção é `dynamic` THEN a ação manual SHALL ficar indisponível (a
   confirmação é do webhook).
4. WHEN o usuário não tem papel financeiro THEN o sistema SHALL responder 403.

> `TransactionSource` hoje só tem `manual | pix_webhook | recurring`; `manual`
> serve, sem migration de enum.

---

## Edge Cases

- WHEN o doador abre duas abas e gera dois QRs THEN existem duas linhas `pending`;
  só a paga confirma. A outra expira (A11).
- WHEN a Asaas devolve o pagamento mas `pixQrCode` falha THEN a cobrança ficou
  órfã na Asaas sem linha nossa: SHALL tentar `DELETE /payments/:id`
  (best-effort) antes de cair no ramo estático. (`DPUB-05`)
- WHEN `payload.payment.value` difere do `amount` da linha THEN o lançamento usa o
  valor do payload (comportamento atual de `handleWebhook`) — a Asaas é a
  autoridade do valor pago; divergência SHALL ser logada.
- WHEN o webhook chega depois que `TenantPlan` virou Starter THEN confirma mesmo
  assim (dinheiro entrou; o plano gateia a **criação**, não a confirmação).
- WHEN o `tenant_slug` tem caixa/espaços diferentes THEN o sistema SHALL tratá-lo
  como hoje (`findUnique` exato) — slug inexistente cai no 404 genérico.
- WHEN dois doadores pagam o mesmo valor ao mesmo tempo THEN `externalReference`
  (id da linha) e `asaas_payment_id` (UNIQUE) impedem confusão.
- WHEN o servidor reinicia no meio da criação (após Asaas, antes do `INSERT`) THEN
  há cobrança sem linha; o webhook dela cai em "PixPayment não encontrado" e é
  ignorado — risco aceito, mitigado pela ordem (linha primeiro, ver design).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| DPUB-01 | P1 QR dinâmico (plano do banco, nunca do cliente) | Execute | Verified |
| DPUB-02 | P1 QR dinâmico (fallback Starter) | Execute | Verified |
| DPUB-03 | P1 QR dinâmico (cobrança na Asaas) | Execute | Verified |
| DPUB-04 | P1 QR dinâmico (contrato da resposta) | Execute | Verified |
| DPUB-05 | P1 QR dinâmico (falha da Asaas / sem chave) | Execute | Verified |
| DPUB-06 | P0 Webhook sob RLS | Execute | Verified |
| DPUB-07 | P1 Confirmação idempotente | Execute | Verified |
| DPUB-08 | P1 Sem lançamento antes de confirmar | Execute | Verified |
| DPUB-09 | P1 `failed → confirmed` | Execute | Verified |
| DPUB-10 | P1 Categoria financeira | Execute | Verified |
| DPUB-11 | P1 Valor mín./máx./casas | Execute | Verified |
| DPUB-12 | P1 Rate limit por cliente real | Execute | Verified |
| DPUB-13 | P1 Teto de cobranças pendentes por tenant | Execute | Verified |
| DPUB-14 | P1 Sem enumeração de tenant | Execute | Verified |
| DPUB-15 | P1 Sem vazamento entre tenants | Execute | Verified |
| DPUB-16 | P1 Status sem PII; CORS não se aplica | Execute | Verified |
| DPUB-17 | P1 RLS: nenhuma policy afrouxada | Execute | Verified |
| DPUB-18 | P2 UX: QR/copia-e-cola/fallback | Execute | Verified |
| DPUB-19 | P2 UX: polling → pago | Execute | Verified |
| DPUB-20 | P2 UX: validade 24 h / novo QR | Execute | Verified |
| DPUB-21 | P2 UX: erro, backoff, retomada | Execute | Verified |
| DPUB-22 | P2 Colunas `donor_*` | Execute | Verified |
| DPUB-23 | P2 Consentimento | Execute | Verified |
| DPUB-24 | P2 Retenção/anonimização | — | Descartado (A10: dado retido) |
| DPUB-25 | P2 Recibo (condicional Q5) | Execute | Verified |
| DPUB-26 | P3 Tela de intenções + baixa manual | Execute | Verified |
| DPUB-27 | P2 Expiração + cancelamento de cobrança órfã | Execute | Verified |

**Coverage:** 27 total, 27 mapeados em `design.md` e implementados; DPUB-24 (anonimização) **descartado** por decisão do dono do produto — ver A10. Evidência por AC em `validation.md`.

---

## Success Criteria

- [ ] Doação de R$ 50 em `teste2-church` (Premium, sandbox Asaas) gera QR, e a
      confirmação simulada do webhook produz **1** lançamento na categoria "Oferta".
- [ ] Mesma doação em `teste1-church` (Starter) devolve a chave estática e **0**
      chamadas à Asaas.
- [ ] Teste de integração do webhook contra o banco (hoje inexistente) passa e
      cobre confirmar 2× = 1 lançamento.
- [ ] Nenhuma policy de RLS afrouxada; `npm run test:rls -w orbien-backend` verde.
- [ ] PEND-14 pode ser fechada em `docs/PLANO.md` com a evidência dos PRs 4 e 5.
