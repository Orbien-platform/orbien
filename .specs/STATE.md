# Project State

Log de decisões de arquitetura entre features (append-only). Cada entrada é
`AD-NNN`; nunca editar uma existente — só adicionar `status: superseded by AD-NNN`
quando uma decisão posterior a substituir.

## Decisions

### AD-001 — Novas tabelas de congregação nascem com `app_congregation_allowed()`

**Status**: active
**Origem**: feature `repertorio-louvor`, fase Design, 2026-09-07

Toda tabela nova com isolamento por congregação (`tenant_id`+`congregation_id`)
escreve sua policy `tenant_congregation_isolation` usando a função
`app_congregation_allowed(congregation_id)` (criada em
`prisma/migrations/003_rls_admin_write.sql`) diretamente nos dois lados —
`USING` e `WITH CHECK` — desde a primeira versão do script de RLS.

**Nunca** replicar o padrão anterior a `003` (`congregation_id = app_current_congregation() OR app_has_role('tenant_admin') OR app_has_role('denomination_admin')`
inline, com `WITH CHECK` mais estrito que o `USING`) — esse padrão só existe
historicamente porque `003` não existia ainda quando `001`/`002` foram
escritos, e ele foi a causa da pendência nº 1 documentada em
`docs/PENDENCIAS.md` (leitura permitida, escrita negada com 42501 para
`tenant_admin` em congregação irmã).

Como `003_rls_admin_write.sql` já roda antes de qualquer script de RLS novo
no pipeline do `bootstrap-db.sh`, a função já está disponível — não há razão
para uma tabela nova nascer com o defeito já corrigido em outro lugar.

**Consequência prática**: um script `00N_rls_<feature>.sql` novo é
adicionado ao `bootstrap-db.sh` no passo 3 (junto de `002`-`006`, com o
mesmo guard `if [ -f ... ]`), rodando depois de `003`.

### AD-002
- **Decision**: `apps/mobile` (Expo/React Native) usa um único codebase para as
  duas variantes de distribuição (Starter genérico multi-tenant e a futura
  Premium white-label por tenant). As variantes diferem só por *build
  profile* do EAS (`eas.json`) combinado a um `app.config.js` dinâmico
  (função, não `app.json` estático) que resolve nome, ícone, bundle
  id/applicationId, scheme e app id do OneSignal a partir de env/`extra` por
  profile. Nenhum desses valores pode ser hardcoded em código-fonte
  compartilhado (telas, componentes, chamadas à API).
- **Reason**: fork de código por variante diverge com o tempo (fix na
  Starter não chega na Premium) e obriga reescrever a variante genérica
  quando o Premium (ADR-005) for implementado. Config dinâmica por profile é
  o único mecanismo que deixa o Premium herdar tudo que o v1 entregar sem
  retrabalho de arquitetura.
- **Trade-off**: exige que todo componente que hoje "só" mostraria "Orbien"
  passe a ler isso de `Constants.expoConfig.extra` em vez de literal — um
  pouco mais de indireção desde o v1, mesmo o Premium ainda não existindo.
- **Scope**: `apps/mobile` inteiro — qualquer PR que adicionar tela/módulo
  novo ao mobile deve seguir essa regra para nome do app, ícone, bundle id e
  identificadores de push.
- **Date**: 2026-09-08
- **Status**: active

### AD-003 — Preferência de push por categoria vive em tag OneSignal, checada com `!=`

**Status**: active
**Origem**: feature `preferencias-notificacao-mobile` (MOB-10), fase Design, 2026-09-11

Toda preferência de opt-out por categoria de push usa uma tag OneSignal por
categoria (`pref_<categoria>`, valores `"true"`/`"false"`), sincronizada pelo
cliente (login e a cada mudança de preferência) — nunca uma consulta ao
Postgres no momento do disparo. O disparo filtra com
`{field:'tag', key:'pref_<categoria>', relation:'!=', value:'false'}`,
**nunca** `not_exists OR '='`: filtros OneSignal não suportam parênteses/
agrupamento e são avaliados sequencialmente (cada operador aplica sobre o
resultado acumulado até ali) — inserir um OR extra quebraria a segmentação
por tenant/congregação/role já calculada antes dele. `!=` sozinho já cobre
"tag ausente OU tag diferente de `false`" numa única condição, preservando o
default seguro (ausência de tag = categoria ligada).

**Consequência prática**: a tabela que guarda a preferência (ex.
`notification_preferences`) é a fonte de verdade para a **tela** (o que
mostra marcado, sincronizado entre aparelhos da mesma conta) — nunca para o
**filtro de envio**, que sempre lê a tag do device. Duas fontes de verdade
por design, não descuido; ver `preferencias-notificacao-mobile/design.md`,
Tech Decisions.

### AD-004 — `audit_insert()` resolve e congela o nome do autor uma vez, no `AuditInterceptor`

**Status**: active
**Origem**: feature `login-email-global`, fase Design, 2026-09-13

Qualquer coluna de "snapshot" em `audit_logs` (ex.: `actor_name_snapshot`) é
resolvida **uma única vez**, dentro do `AuditInterceptor` — nunca por cada
chamador de `audit_insert()` individualmente. A função ganha o parâmetro
correspondente e todo chamador (o interceptor global, e qualquer serviço que
passe a chamá-la direto, como a transferência de tenant desta feature) passa
o mesmo valor já resolvido.

**Motivo**: `audit_insert()` hoje só recebe `actor_user_id`; se cada
chamador decidisse por conta própria se resolve o nome (fazendo ou não o
join até `persons`), o snapshot existiria só nos registros de quem se deu ao
trabalho — inconsistência pior do que não ter o campo. Resolver no
interceptor garante que **toda** linha de `audit_logs`, de qualquer rota
auditada, tem o mesmo dado.

**Consequência prática**: adicionar um novo dado "congelado no momento do
registro" a `audit_logs` é sempre um parâmetro novo em `audit_insert()`
(`001_rls_setup.sql`, `CREATE OR REPLACE FUNCTION`) resolvido no
`AuditInterceptor` antes do `tap()`, nunca uma query solta em cada feature
que precisar auditar algo.

### AD-005 — Tabela de referência global (sem tenant) ainda habilita RLS, com `USING (true)`

**Status**: active
**Origem**: feature `biblia-nvi-marcacoes-mobile`, fase Design, 2026-09-21

Toda tabela nova do repo até aqui isola por `tenant_id` (ou
`tenant_id`+`congregation_id`, AD-001). `bible_chapter_cache` é a primeira
exceção deliberada: guarda o texto de um capítulo da NVI, que é **o mesmo
para toda igreja** — não existe "congregação dona" desse dado, e RLS por
tenant não faz sentido aqui.

**Não é** "criar a tabela sem RLS". A tabela ainda roda
`ALTER TABLE bible_chapter_cache ENABLE/FORCE ROW LEVEL SECURITY`, com uma
policy explícita `PERMISSIVE FOR ALL TO app_user USING (true) WITH CHECK (true)`
— visibilidade total é uma escolha registrada e testada (ver
`apps/api/test/rls/bible-chapter-cache.spec.ts`), não a ausência de policy
que o alerta do `pre-push.sh` (linhas ~93-110) existe para pegar.

**Consequência prática**: uma tabela nova de **referência global** (texto,
tabela de código, catálogo que não varia por igreja) segue este padrão —
RLS habilitado com `USING (true)/WITH CHECK (true)` — em vez de ficar sem
RLS (o que o alerta do pre-push aceitaria em silêncio, mas deixa a
intenção implícita) ou de ganhar `tenant_id` que não tem dono nenhum para
apontar.

### AD-006 — Rota pública que acha linha por id externo resolve o escopo por função SQL `SECURITY DEFINER`

**Status**: active
**Origem**: feature `doacao-publica-premium-qr-dinamico`, fase Execute, 2026-10-03

Rota sem JWT roda como `orbien_app` e **não** tem `app.tenant_id`: as tabelas com
RLS por tenant+congregação (`pix_payments`, `pix_subscriptions`,
`financial_transactions`) devolvem zero linhas para ela. O webhook da Asaas
descartava toda confirmação por isso (ver `PEND-16`) — e só conhece o id da Asaas.

O caminho "id externo → escopo" é uma função `SECURITY DEFINER`, com
`search_path` fixo, `EXECUTE` só para `orbien_app`, que devolve **somente**
`tenant_id` e `congregation_id` — nunca a linha
(`pix_webhook_scope()`, `024_rls_pix_webhook_scope.sql`; mesmo padrão de
`audit_insert()`, AD-004). Com o escopo, o service abre a transação, fixa
`app.tenant_id`/`app.congregation_id` e o resto roda sob a RLS normal. O escopo
vem do banco, **nunca** do payload: tenant forjado no corpo é ignorado.

Não usar `prisma.system` (BYPASSRLS) em handler de requisição — `prisma.service.ts`
reserva o client privilegiado a schedulers. Não criar policy para `orbien_app`
em tabela de dado de igreja: afrouxa a fronteira que a função mantém estreita.

**Consequência prática**: nova rota pública que precise achar uma linha de tenant
por um id que só o terceiro conhece ganha uma função irmã (`0NN_rls_*.sql`, no
`bootstrap-db.sh`, com a verificação no passo 7), nunca uma policy nova.
Escrita sem JWT a partir de um slug resolvido no servidor continua sendo
`runInPublicContext` (sem script de RLS novo).

### AD-007 — O que o doador público declara nunca vira `Person`, e o plano é lido do banco do slug

**Status**: active
**Origem**: feature `doacao-publica-premium-qr-dinamico`, fase Design/Execute, 2026-10-03

Na doação pública, nome e e-mail são **declaração sem verificação**. Gravam-se na
própria linha de `pix_payments` (`donor_*`, com o aceite do termo) e o recibo
(`PROD-03`) vai para o e-mail declarado (`donation_receipts.recipient_*`,
`person_id` nulo). **Nenhuma** `Person` é criada nem vinculada por e-mail: quem
digitasse o e-mail de um membro atribuiria a doação — e o recibo, e o carnê de IR
de `PROD-08` — a ele. `Person` vinculada (doador cadastrado) sempre vence o
declarado.

O plano que decide QR dinâmico × chave estática é o `TenantPlan` do tenant
resolvido pelo slug, lido no banco; um `plan`/`mode` no corpo é 400. O plano gateia
a **criação** da cobrança, não a confirmação: o dinheiro que entrou vira
lançamento mesmo que o plano tenha mudado no meio.

**Consequência prática**: nova rota pública que receba dado de identificação do
visitante guarda o snapshot na linha da operação, com aceite versionado
(`legal/consent-terms/`), e só cria/vincula `Person` num fluxo que verifique o
titular. Recibo/documento para quem não é `Person` usa `recipient_*`.

### AD-008 — Taxa da Asaas é do tenant; 1% de split vai para a Orbien, em toda cobrança

**Status**: active
**Origem**: decisão do dono do produto, 2026-10-03 (avaliação `pix-recorrente-doador-mobile`)

Para **toda e qualquer** cobrança criada na Asaas — hoje `POST /payments`
(PIX dinâmico, inscrição de evento) e `POST /subscriptions` (PIX recorrente),
amanhã qualquer novo cenário ou meio de pagamento — vale uma regra só:

1. **A tarifa da Asaas é custo do tenant** (a igreja é a dona da cobrança e
   absorve a tarifa). Nunca repassada à Orbien, nunca somada ao doador.
2. **A Orbien recebe 1% por split** da própria cobrança (`split` da Asaas para
   a wallet da Orbien), não por repasse manual nem por fatura posterior.
3. **Um único ponto monta a cobrança.** Nenhum serviço chama
   `asaasPost('/payments'|'/subscriptions', …)` com corpo próprio: todos passam
   pelo mesmo montador, que injeta o split e é o único lugar que conhece o
   percentual e a wallet (configuração, não literal espalhado).
4. **Cobrança sem split não existe.** Wallet/percentual ausentes → a criação
   falha (503 "serviço PIX indisponível" + log), em vez de cobrar sem a parte
   da Orbien. Teste de unidade falha se algum POST de cobrança sair sem
   `split`.

**Motivo**: o pricing já descreve "1% retido via split + ~1% da Asaas" como
custo efetivo ~2% para a igreja (`pricing-church-platform.md` §79-84, ADR-007),
mas o código não tem nenhum `split` (verificado em 2026-10-03: três pontos de
cobrança em `pix.service.ts`, nenhum com `split`/`walletId`). Sem um ponto
único, cada cenário novo (como a recorrente do doador) reimplementaria — ou
esqueceria — a regra.

**Consequência prática**: uma feature nova de pagamento **não** decide taxa nem
split; ela chama o montador. Mudar o percentual ou o provedor (ADR-007) é uma
mudança num lugar. **Pré-requisito em aberto (DEC-07/PEND-17)**: hoje há uma só
`ASAAS_API_KEY` e um cliente Asaas por tenant — para a tarifa ser do tenant e o
split sair da cobrança dele, a cobrança precisa ser criada na conta Asaas do
tenant (subconta/wallet por tenant). Ver `.specs/features/asaas-taxa-e-split-padrao/`.

### AD-009 — Cobrança nasce na subconta Asaas do tenant, criada pela Orbien; só tenant com CNPJ

**Status**: active
**Origem**: decisão do dono do produto, 2026-10-03 (fecha `DEC-07`; complementa AD-008)

Como cumprir o AD-008 ("tarifa do tenant, 1% para a Orbien"):

1. **A cobrança é emitida na conta do tenant, nunca na da Orbien.** Para cada
   igreja a Orbien cria uma **subconta Asaas** com a chave raiz da Orbien
   (`POST /accounts`). A cobrança (`/payments`, `/subscriptions`) sai com a
   `apiKey` **da subconta**, e o `split` leva o 1% para o `walletId` da Orbien.
   O PIX mostra a igreja como recebedora; o valor bruto, a tarifa, o estorno e a
   contestação são da igreja. A Orbien só recebe a parte dela — que é o que
   torna demonstrável que o dinheiro não é da Orbien.
2. **Rejeitado**: cobrança na conta da Orbien com split de ~99% para a igreja.
   O doador veria "Orbien" no PIX e a cobrança bruta seria da Orbien — o risco
   tributário e de custódia que motivou esta decisão.
3. **A igreja nunca manuseia chave.** A `apiKey` da subconta vem uma única vez,
   na resposta de criação; a Orbien a guarda **cifrada na aplicação** (chave
   mestra fora do banco), nunca em log, nunca no front, lida só pelo montador
   de cobrança do AD-008. A chave raiz da Orbien e o `walletId` da Orbien ficam
   em variável de ambiente, nunca no banco.
4. **Só tenant com CNPJ.** Sem CNPJ não há subconta nem cobrança Asaas: a
   igreja expõe só a própria chave PIX (copiar ou QR) e a contribuição acontece
   no banco do doador, fora do app — é o Cenário 1 que já existe
   (`PixService.createManual`, página `/doar/{slug}`). Sem confirmação
   automática, sem recibo, sem recorrente, sem split. Conta em nome do CPF do
   pastor/responsável **não** é alternativa.
5. **Enquanto a subconta não está aprovada** (documentos pendentes, em análise,
   recusada) vale o mesmo Cenário 1; os recursos que dependem da Asaas aparecem
   como "ative os recebimentos", não como erro.

**Consequência prática**: nenhum código cria cobrança com a chave raiz da
Orbien. A chave raiz só cria e consulta subcontas. Base do 1%: o split da Asaas
incide sobre o **valor líquido** (após a tarifa) — o 1% é do líquido.
Em aberto (perguntar à Asaas, não bloqueia o modelo): se a subconta tem acesso
ao painel ou saque automático para o banco da igreja (subconta BaaS não tem
painel — a Orbien **não** deve operar saque de dinheiro do tenant), custo de
criação, e como "organização religiosa" é tratada no KYC (associação pede ata).

### AD-010 — Toda cobrança Asaas nasce atrás de `ASAAS_PAYMENTS_ENABLED`; ver e cancelar, nunca

**Status**: active
**Origem**: decisão do dono do produto, 2026-10-03 (PROD-28)

Os pagamentos pela Asaas ficam prontos e desligados até o lançamento. Regra
para todo código que cria cobrança na Asaas — o que existe hoje e o que vier:

1. **Criar cobrança** chama `assertAsaasPaymentsEnabled()`
   (`apps/api/src/financial/asaas-payments.flag.ts`) antes de qualquer
   consulta ou chamada à Asaas — 503 com a mensagem da trava. Onde já existe
   um caminho sem Asaas, ele é tomado em vez do 503: o QR dinâmico da doação
   pública Premium consulta `asaasPaymentsEnabled()` e cai para a chave
   estática, como o Starter. A checagem fica no serviço que cobra
   (`PixService`), não só no controller, para que todo caminho (inclusive o
   de inscrição de evento, que vem de `content/`) passe por ela. O que só
   *prepara* uma cobrança (ex.: evento com preço) é barrado também, com 400.
2. **Nunca travar**: listar, cancelar, webhook. Cobrança emitida precisa ser
   confirmada, e quem é cobrado precisa poder parar.
3. Só o literal `true` liga. Valor esquecido ou digitado errado = desligado.
4. Os fronts leem `GET /me/permissions` → `features.asaas_payments` com
   **falha fechada** (sem resposta = escondido), ao contrário de `areas`
   (falha aberta). Esconder é UX; quem nega é a API.

**Rota de dinheiro self-service** (também desta feature): rota que um
`member` usa para mexer em dinheiro dele deriva a pessoa
(`user_accounts.person_id`) e o plano (`tenant_plans`) **do banco**, nunca do
corpo nem da claim; responde 404 para linha de outra pessoa; e barra sessão de
suporte. Modelo: `DonorPixSubscriptionsService`.

**Consequência prática**: ligar pagamentos em produção é mudar uma env — e
isso só depois de `AD-008`/`AD-009` no código (`PROD-28`, "O que falta").

