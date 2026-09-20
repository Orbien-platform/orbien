# Plano — Orbien

**Fonte única sobre o produto: direção, ajustes e pendências abertas.**
O que está aberto está aqui, com ID, evidência e estado. Não existe segunda
lista — se um trabalho não está neste documento, ele não está planejado.

Dois documentos continuam ao lado deste, e nenhum dos dois é fonte de
pendência:

- [`PENDENCIAS.md`](PENDENCIAS.md) é **arquivo histórico**: o achado, a
  evidência que o produziu e a decisão que o fechou. Serve para entender por
  que uma coisa é como é (o `CLAUDE.md` e o `DEPLOY.md` citam pendências
  numeradas de lá). O que ainda está aberto foi movido para cá.
- [`produto/`](produto/) é a base de decisão histórica — ADRs, especificação
  funcional, pricing, LGPD, contratos. Descreve **por que** o produto é como
  é, não o que falta.

Última varredura completa contra a `main`: **2026-09-13** — fechou `AJU-04`,
`AJU-06`, `PEND-02`, `PROD-04` (PR #86, ver nota — em outra sessão, mais
completo que a tentativa daqui), `PROD-06`, `PROD-10` (já entregue em
2026-09-12, só não tinha saído desta lista), `PROD-18` (duplicata de
`PROD-15`) e `PROD-19`; revisitou `PEND-04` sem mudança de código.

Em **2026-09-14** fecharam `PROD-09` (chat fechado por célula, em outra
sessão — ver a nota da seção 6), `PROD-21` (auditoria escopada ao tenant) e
`PROD-16` na variante Starter — a metade Premium dele, o evento com
pagamento, abriu como `PROD-24`.

Nova varredura em **2026-09-14**: `npm run test:rls -w orbien-backend`
resulta hoje em **118 testes em 6 suítes** (`isolation.spec.ts` 75,
`platform-plane.spec.ts` 12, `small-groups-public.spec.ts` 12,
`event-registrations.spec.ts` 6, `tenant-audit-read.spec.ts` 5,
`user-account-transfer.spec.ts` 8) — os arquivos de RLS que as entregas de
`PROD-13`, `PROD-16`, `PROD-21` e `PROD-22` trouxeram deixaram o número "61
em 2 suítes" de `AJU-01`/`AJU-02` desatualizado de novo; atualizado nesta
rodada. Conferidos e sem mudança: `CONF-02`/`CONF-03` (nenhuma rota nova de
`/me/*` além de `permissions`, nenhum cron novo de retenção de log de acesso
ou de consentimento), `PROD-05/07/08/11/12/17/20/23/24` (nenhum código novo),
`PEND-04` e os itens de mobile da seção 5.

Varredura de **2026-09-15**, contra a `main` em `244897f` (merge do PR #95):
fecharam `PROD-20` (multiplicação de célula, árvore genealógica, semáforo de
saúde e rede com meta) e `PROD-24` (evento com inscrição paga, backend +
painel do organizador) — os dois com nota própria na seção 6. `PEND-05`
nasceu nesta rodada, com os três achados menores declarados no PR do
`PROD-20`, e os três seguem abertos: conferidos um a um aqui (sem assertiva
SQL dedicada para `networks` no passo 7 do `bootstrap-db.sh`; `.catch(() =>
{})` em `MultiplyGroupModal.tsx:57` e `NetworkFormModal.tsx:62`; nenhum
`apps/web/e2e/*.spec.ts` toca multiplicação ou redes). O PR #95, que veio
depois, fechou lacunas de **cobertura de componente** do `PROD-20` — não é o
e2e que o terceiro ponto do `PEND-05` pede.

Contagem de RLS nesta rodada: `npm run test:rls -w orbien-backend` fecha em
**125 testes em 7 suítes** (`isolation.spec.ts` 75, `platform-plane.spec.ts`
12, `small-groups-public.spec.ts` 12, `user-account-transfer.spec.ts` 8,
`networks.spec.ts` 7, `event-registrations.spec.ts` 6,
`tenant-audit-read.spec.ts` 5). O `016_rls_networks.sql` e o
`test/rls/networks.spec.ts` do `PROD-20` desatualizaram o "118 em 6 suítes"
medido em 2026-09-14 — terceira vez que essa contagem envelhece. Atualizada
aqui e em `docs/TESTES.md`; o mesmo rótulo em `scripts/pre-push.sh` ficou
como `AJU-07` na seção 8, porque é portão, não documento.

Conferidos nesta varredura e **sem mudança de código** — seguem abertos
exatamente como descritos: `CONF-01` (as marcações
`[REVISÃO JURÍDICA OBRIGATÓRIA]` continuam nos dois documentos, 18 e 4),
`CONF-02` (nenhum cron de retenção de log de acesso ou de registro de
consentimento — os seis de `apps/api/src/persons/` são os mesmos),
`CONF-03` (`me.controller.ts` segue com `GET /me/permissions` e nada mais),
`PROD-05` (nenhuma rota de sugestão de escala), `PROD-07` (o OFX de
`financial/export/` continua sendo só exportação), `PROD-08`, `PROD-12`,
`PROD-17`, `AJU-05`, `PEND-04` e os `DEC-` da seção 9.

Em **2026-09-16** fecharam `PROD-11` (alerta de ausência consecutiva, em
outra branch — ver a nota da seção 6 e o `PEND-06` da seção 7, que nasceu e
fechou junto) e `PROD-25` (tela de member self-service para inscrição em
evento), no `apps/mobile`. Com o `PROD-25`,
`POST .../registrations/me` deixa de ser rota sem consumidor e o QR do PIX
que o `PROD-24` devolve passa a ter onde aparecer.

Em **2026-09-19** fechou `PROD-23` (tela da liderança para os pedidos de
visita, `apps/web`) — nota na seção 6 — e nasceu já decidida a `DEC-06`
(seção 9), que fixa os tenants de teste e o que pode rodar contra produção.

Em **2026-09-20** fechou `PROD-05` (sugestão automática de escala por
disponibilidade e rodízio, Módulo 1) — ver a nota da seção 6. Só backend:
`GET /celebrations/instances/:instanceId/schedule/suggest`, sem tabela nova.

Também em **2026-09-20** fechou `PROD-08` (carnê do dizimista / relatório anual
para IR) — nota completa na seção 6. `AnnualDonationReportService` novo em
`apps/api/src/financial/`, registrado em `PixModule` (mesmo módulo de
`DonationReceiptsController`, não `FinancialModule`); duas rotas Premium em
`GET /financial/donation-receipts/annual/*`; sem tabela nova, sem migration,
sem script de RLS — o relatório é recalculado sob demanda a partir de
`FinancialTransaction`/`Person`, não persiste em R2. Geração em lote (um PDF
por doador de uma vez) ficou de fora, documentada como próximo passo.

Também em **2026-09-20** fechou `PROD-17` (segmentação avançada de notificações —
comportamento, engajamento, inatividade — Premium), nota completa na
seção 6: três critérios novos resolvidos a partir de sinais que já existiam
no schema (`VisitRecord`, `AttendanceRecord`, `MaterialOpenRecord`), sem
critério de "abriu/não abriu notificação" (decisão registrada, dado
inexistente por pessoa). Gate de Premium no service, mesmo princípio do
`PROD-24`.

Também em **2026-09-20** fechou `PROD-07` (conciliação bancária — importar OFX,
Premium — ver a nota da seção 6).

Também em **2026-09-20** fechou `PROD-12` (check-in de membros por QR no encontro,
ver a nota da seção 6): `MeetingCheckinToken` novo, dois endpoints em
`MeetingsController`, RLS em `018_rls_meeting_checkin_tokens.sql` (Padrão B,
suíte de RLS agora em 144 testes em 10 suítes) e tela do líder no `apps/web`
(`GroupDetailSheet`) — a do membro ficou para o `apps/mobile`, à parte, pelo
mesmo motivo do `PROD-25`. `PEND-08` nasceu na mesma rodada, sobre um alerta
de `pre-push.sh` aceito sem ajuste.

---

## 1. Visão do produto

Orbien é uma plataforma SaaS white-label de gestão de igrejas, multi-tenant em
três níveis (plataforma → denominação/tenant → congregação), com quatro módulos
originais — Membros e Voluntários, Financeiro, Pequenos Grupos, Conteúdos e
Notificações — mais um quinto módulo nativo, Celebrações e Ordem de Celebração
(OC), acrescentado a partir da dor validada no cliente zero (Doca Church).

O detalhamento funcional de cada módulo está em
`produto/produto-gestao-igrejas-mvp.md`; as decisões de arquitetura que
sustentam isso, em `produto/adrs-architecture-decisions.md`; a matriz de
funcionalidade por plano, em `produto/pricing-church-platform.md`.

## 2. O que já foi entregue

A base de `api`, `site` e `web` corresponde à Fase 6 do
`produto/orbien-guia-fases-execucao.md`. A ela se somaram dois apps: o
`admin`, que não estava no plano original, e o `mobile`, que estava (Fase 7) e
foi retomado — cinco no total.

| Área | Estado |
|---|---|
| Auth + multi-tenant + papéis | Entregue — JWT próprio, RLS por `tenant_id`/`congregation_id`, papéis granulares |
| Módulo 1 — Membros e Voluntários | Entregue, incluindo escalas, trocas e check-in |
| Módulo 2 — Financeiro | Entregue — plano de contas, lançamentos, PIX cenários 1–3 com webhook Asaas, DRE, fluxo de caixa, forecast, exportação contábil |
| Módulo 3 — Pequenos Grupos | Entregue — cadastro, hierarquia, reuniões, presença, biblioteca de materiais agendados, indicador de abertura, histórico de versões de materiais, pedidos de oração da célula |
| Módulo 4 — Conteúdos e Notificações | Entregue — posts, notificações, segmentação básica e avançada (comportamento/engajamento/inatividade, Premium), métricas da OneSignal |
| Módulo 5 — Celebrações e OC | Entregue — `Celebration`, `CelebrationInstance`, `ServiceOrder`/`ServiceOrderItem`, `Setlist`, repertório, OC em PDF, integração com escalas do Módulo 1 |
| Plano de plataforma (Nível 0) | Entregue e além do escopo original — `apps/admin`, `@PlatformRoute()`, `platform_support`, sessão de suporte cross-origin, auditoria, cancelamento/reativação de `TenantPlan` (sem tela) |
| Retenção de dados (LGPD, seção 5) | Entregue nas 4 categorias de pessoa + Art. 18 (soft delete) + aviso semanal ao admin — ver **CONF-02** |
| App mobile (Fase 7, ADR-004/ADR-005) | Entregue na variante Starter — `apps/mobile` (Expo + RN). MOB-01…MOB-12 verificados, incluindo MOB-10 (preferências de notificação, PR #76). Ver `.specs/features/app-mobile/` |
| Infra | Entregue com a atualização do ADR-008: Render (runtime Node) + Vercel (site/web/admin) + EAS Build (mobile) + Supabase + Cloudflare R2 |

Isso cobre as Fases 1 e 2 do roadmap de MVP original (seção 4 de
`produto-gestao-igrejas-mvp.md`) por inteiro, e a maior parte da Fase 3 —
incluindo a peça que o próprio documento marcava como última do MVP.

Entregue por módulo **não** é o mesmo que entregue por funcionalidade: a
matriz de pricing é mais fina que esta tabela, e é a seção 4 que mostra o que
sobra.

## 3. Como ler o resto deste documento

Cada item aberto tem um ID estável, usado em commit e em conversa:

| Prefixo | O que é |
|---|---|
| `CONF-` | Conformidade — o ciclo atual |
| `PROD-` | Funcionalidade prevista no material de produto e sem código |
| `PEND-` | Pendência de código: defeito ou dívida achada em revisão |
| `AJU-` | Ajuste de documento, rótulo ou portão — não muda comportamento |
| `DEC-` | Decisão de produto em aberto: vira trabalho só depois de decidida |

**Gravidade** é sobre consequência, não sobre esforço: `segurança` >
`defeito` > `dívida` > `cosmético`.

Nenhum item aqui é compromisso de data. A ordem dentro de cada bloco é
sugestão, não fila.

---

## 4. Ciclo atual — conformidade

### CONF-01 · Revisão jurídica dos documentos legais e do contrato v4 · dívida

`produto/church-platform-documentos-legais.md` e
`produto/contrato-church-platform-v4.md` seguem com marcações
`[REVISÃO JURÍDICA OBRIGATÓRIA]` não resolvidas. Nenhum indício no repositório
de que passaram por advogado. Inclui os itens da seção 10 do mapeamento LGPD
e o checklist de pré-go-live da seção 9.

Depende de gente de fora, não de código.

### CONF-02 · Retenção de dados — o que falta da seção 5 · dívida

**O que já roda** (`apps/api/src/persons/`, feature
`.specs/features/reten-dados-fim-contrato/`):

| O que | Prazo | Onde |
|---|---|---|
| Visitante sem evolução (seção 5) | 1 ano | `purgeInactivePersons` (cron 4h) |
| Membro sem vínculo financeiro (seção 5) | 2 anos | `purgeInactivePersons` (cron 4h) |
| Dado financeiro — doador (seção 5) | 5 anos após o fim do contrato | `purgeFinancialDonorsAfterContractEnd` (cron 5h) |
| Dado de menor de 18 anos (seção 5) | 30 dias após o fim do contrato | `purgeMinorsAfterContractEnd` (cron 6h) |
| Exclusão a pedido do titular (Art. 18, DT-05) | 30 dias após o soft delete | `purgeExpiredSoftDeletes` (cron 3h) |
| Aviso ao admin de prazo vencendo em 7 dias (seção 5.1) | semanal | `PersonsRetentionNotifierService` (segunda, 8h) |

Todas anonimizam (`anonymizedFields()`), nunca fazem `DELETE` físico: a
`financial_transaction` fica intacta, que é a obrigação fiscal — o que sai é o
cadastro da pessoa. O marco de fim de contrato é `TenantPlan.cancelled_at`,
escrito por `POST /platform/tenants/:id/cancel` e limpo por `/reactivate`.

**O que falta.** A tabela de retenção tem oito linhas; as que falam de cadastro
de pessoa estão cobertas. Sobram as duas que não são cadastro, declaradas fora
do escopo daquela entrega:

- retenção de **logs de acesso e auditoria** (2 anos, Marco Civil Art. 15);
- retenção de **registros de consentimento** (5 anos após a revogação).

### CONF-03 · Direitos do titular (Art. 18) — nenhum endpoint existe · dívida

O `me.controller.ts` existe desde o PR #75, mas responde **uma** rota só —
`GET /me/permissions`, que é de autorização, não de LGPD. O mapeamento (seção
4) especifica quatro rotas de autosserviço do titular, e nenhuma delas existe;
a matriz de pricing vende isso nos **dois** planos ("LGPD — consentimento,
histórico, exportação de dados pessoais"):

- `GET /me/personal-data` — confirmação e acesso (Art. 18, I e II);
- `GET /me/export` — portabilidade em ZIP, com `person.json`, `consents.json`,
  `groups.json`, `donations.json` e fotos (Art. 18, V);
- `POST /me/revoke-consent` — revogação por versão do termo (Art. 18, IX);
- `PATCH /me` — correção pelo próprio titular (Art. 18, III).

O lado de dentro existe: `consent_records` é escrito no cadastro de visitante e
na importação, e a anonimização revoga os consentimentos da pessoa. O titular é
que não tem por onde pedir nada — hoje depende de um admin.

É o item de conformidade mais próximo de virar código, e o checklist de
pré-go-live do CONF-01 cobra exatamente a exportação que não existe.

---

## 5. Mobile até a loja

A variante Starter está entregue e verificada; publicável é outra coisa.

### ~~PROD-14 · MOB-10 — preferências de notificação por usuário~~ · fechado

Entregue no PR #76, em 2026-09-11: tela de preferências no mobile, tags da
OneSignal sincronizadas na autenticação, e `notification_preferences` com RLS
por congregação (`008_rls_notification_preferences.sql`). Era o último
requisito funcional do `.specs/features/app-mobile/spec.md`.

### AJU-05 · `DEPLOY.md` não tem parte de mobile · dívida

Cobre API, site, web e admin; não há procedimento escrito de build de
produção, submissão às lojas nem OTA. O `apps/mobile/README.md` cobre
credenciais e profiles, mas não é o documento de deploy do monorepo.

> Os dois bloqueadores de build de loja — `ORBIEN_API_URL` e
> `ORBIEN_ONESIGNAL_APP_ID` ausentes no profile `production` — **fecharam** em
> 2026-09-11 (PR #72). Os profiles `preview` e `generic` seguem no placeholder
> do OneSignal de propósito: builds internos não gastam cota do app real.
>
> A infra de OTA em si já existe (2026-09-12, ver `PROD-15` abaixo); o que
> falta aqui é só o procedimento escrito — `eas update --branch <channel>`,
> quando publicar e como isso se relaciona com bump de versão nativa.

### ~~PROD-15 · Infra básica de expo-updates~~ · fechado

Entregue em 2026-09-12, sem depender de data de publicação em loja — é
infraestrutura que já serve às builds internas (`development`/`preview`) hoje:

- `expo-updates@~57.0.22` instalado (versão pareada ao Expo SDK 57 via
  `bundledNativeModules`).
- `runtimeVersion: { policy: "appVersion" }` em `app.config.js` — a runtime
  segue o `appVersion` remoto (`eas.json` já tinha `appVersionSource:
  "remote"`), então qualquer build com módulo nativo novo exige bump de
  versão, e é esse bump que barra um update JS incompatível de chegar num
  binário antigo.
- `updates.url` apontando para o projeto EAS já vinculado
  (`extra.eas.projectId`).
- Um `channel` por build profile em `eas.json`: `development`, `preview`
  (compartilhado com `preview-ios-simulator`, que é só variante de simulador
  do mesmo perfil) e `production`.

O que **não** entrou, de propósito — fica registrado, não decidido: a
granularidade de channel quando existir build própria por tenant
(`DEC-02`). Hoje só existe a variante genérica multi-tenant, então channel
por profile já cobre o que existe; channel por tenant é pergunta em aberto,
ver `DEC-05`.

---

## 6. Plano de produto sem código

Levantado funcionalidade por funcionalidade contra a matriz de pricing (seção
5) e o mapeamento LGPD. A coluna **Plano** é a da matriz: o que está como
Starter já se prometeu a quem assinar o plano base.

### Tabela no schema, nenhum código a usa

O caso mais caro, porque parece entregue em qualquer leitura do
`schema.prisma` e não existe em lugar nenhum do `apps/api` — **fechou por
completo em 2026-09-12**, as três tabelas que a lista tinha:

> `PROD-01` (`prayer_requests`) **fechou em 2026-09-12** — era a terceira
> tabela desta lista. Três rotas em `small-groups`, RLS por congregação
> (`008_rls_prayer_requests.sql`) e painel no `apps/web`. A decisão de acesso
> está registrada em `PEND-01`, porque contrasta com o resto do módulo.
>
> `PROD-02` (`cost_centers`) **fechou em 2026-09-12** — mesmo caso de
> tabela antiga sem rota. CRUD em `financial/cost-centers` (Starter,
> `pricing-church-platform.md` §5.2) e o balancete em `financial/balancete`
> que agrupa `FinancialTransaction` por centro de custo (Premium inteiro,
> `@RequiresPlan('premium')` no controller, mesmo padrão do DRE). RLS trocada
> de `tenant_isolation` para `tenant_congregation_isolation` em
> `010_rls_cost_centers.sql`, mesmo motivo de `009_rls_prayer_requests.sql`
> (AD-001). O seletor de centro de custo entrou em `NewTransactionModal`
> (lançamento avulso e edição); lançamentos parcelados/fixos não o suportam
> ainda porque `create-recurring-rule.dto.ts` não tem o campo — decisão de
> escopo, não esquecimento.
>
> `PROD-03` (`donation_receipts`) **fechou em 2026-09-12**. Recibo é gerado a
> partir de `PixService.handleWebhook` — quando a Asaas confirma um PIX com
> doador identificado (`donor_person_id`, não anônimo), e o tenant é Premium
> (consultado no `TenantPlan` do banco, mesmo princípio do `MemberCapService`
> em `PEND`/`CONF` — nunca na claim do token). `DonationReceiptService` monta
> o PDF (`pdfmake`, mesmo padrão do `DrePdfService`), sobe para o R2 e envia
> por e-mail via `MailService` (Resend). Sem doador identificado, doação
> anônima, ou doador sem e-mail cadastrado, não gera nada — não é erro, é
> escopo (não há como emitir recibo sem destinatário). `GET
> /financial/donation-receipts` e `.../:id/download` expõem a lista e o link
> assinado para o tesoureiro, com o mesmo trio de guardas do resto do
> Premium em `financial` (`JwtAuthGuard, RolesGuard, PlanGuard` +
> `@RequiresPlan('premium')`). RLS segue sem mudança: `donation_receipts` já
> tinha `tenant_isolation` de `001_rls_setup.sql`, mesmo desenho do resto do
> financeiro (nenhuma tabela do módulo tem RLS por congregação ainda — não é
> regressão introduzida aqui). O recibo não é documento fiscal — o schema não
> modela CNPJ/razão social da igreja, então o PDF traz doador, valor, data e
> igreja pelo nome, sem se apresentar como nota fiscal.

Cada uma é uma decisão de duas pontas: **construir** a funcionalidade ou
**derrubar** a tabela. Manter tabela morta no schema é o que faz a próxima
leitura errar de novo.

### ~~PROD-10 · Histórico de versões de materiais de estudo~~ · fechado

Entregue em 2026-09-12: snapshot do `StudyMaterial` gravado em
`StudyMaterialVersion` antes de cada `PATCH` (título, descrição, autor,
arquivo, conteúdo, datas, tags e quem alterou), com RLS padrão B
(`tenant_id` + `congregation_id`,
`20260912140000_add_study_material_versions`) e rota
`GET /study-materials/:id/versions`. `GroupDetailSheet`, no `apps/web`,
ganhou um toggle de histórico por material, lazy e cacheado como o de
reuniões. Concorrência otimista no `update()` (`updateMany` com
`where.version` + `ConflictException`) evita duas edições simultâneas
colidirem no índice único de `StudyMaterialVersion`.

### ~~PROD-22 · Transferência de conta entre tenants~~ · fechado

> Renumerado de `PROD-20` em 2026-09-13 — esse ID passou a pertencer ao item
> de multiplicação de célula, renumerado em paralelo na `main` (ID não se
> recicla).

Entregue em 2026-09-13, feature `login-email-global` (P2 — pré-condição do
e-mail único global fechado em `PROD`/Fase 2 da mesma feature):
`PATCH /platform/user-accounts/:id/transfer`, exclusiva de `platform_support`
no `apps/admin` (`@Roles('platform_support')` + `@PlatformRoute()`, mesmas
três marcas do resto de `PlatformController`). `TransferUserAccountService`
move `UserAccount` + `Person` (mesma pessoa, mesmo `person_id` — nunca cria
conta nova) para o tenant/congregação de destino numa única transação,
revoga a família de refresh tokens da conta e zera os `role_assignments` do
tenant de origem — exceto `platform_support`, que é global e nunca é tocado.
Rejeita no-op (destino igual à origem) e destino inexistente/inativo antes
de mover qualquer dado. `audit_logs` (`entity='user_account'`,
`action='tenant_transfer'`) é gravado no tenant de ORIGEM, fora da
transação de negócio, best-effort (mesmo princípio do `AuditInterceptor`,
ver `AD-004` em `.specs/STATE.md`) — uma falha ao auditar não desfaz a
transferência já confirmada.

Sem tela ainda no `apps/admin` — só a rota da API. Ver
`.specs/features/login-email-global/design.md` para o desenho completo;
testes em `apps/api/src/platform/transfer-user-account.service.spec.ts`,
`apps/api/src/platform/platform.controller.spec.ts` e RLS em
`apps/api/test/rls/user-account-transfer.spec.ts` (prova que o tenant de
origem deixa de ver a conta/pessoa e que histórico com `tenant_id` próprio,
ex. `financial_transactions`, continua visível).

### ~~PROD-21 · Tela de audit log escopada a tenant~~ · fechado

Entregue em 2026-09-14. Nada novo é gravado — o dado já estava em
`audit_logs` desde a Fase 1, escrito pelo `AuditInterceptor`; o que faltava
era a leitura do lado do tenant. `GET /audit-logs` (`apps/api/src/audit/`)
é rota de **tenant**, não de plataforma: passa pelo
`TenantContextInterceptor` como qualquer tela do produto e quem recorta as
linhas é a policy `tenant_read` de `audit_logs` (001, ampliada por 005) —
nenhum SQL novo foi preciso. `@Roles('tenant_admin')` +
`@RequiresPlan('premium')`, com a lista de papéis vindo de
`product-areas.ts` (área nova `audit`, também em `PREMIUM_ONLY_AREAS`), que
é de onde `GET /me/permissions` responde — é assim que a barra lateral do
`apps/web` sabe se desenha o link.

Três escolhas que a implementação registra por escrito, em
`tenant-audit-logs.service.ts`:

- **`platform_access` fica fora**, por lista fechada no DTO. Aquela linha
  tem `tenant_id` preenchido — o tenant de ORIGEM da conta de suporte,
  porque `audit_logs.tenant_id` é NOT NULL com FK — e não tem relação com a
  igreja que hospeda a conta. O RLS não pode barrar: para ele a linha é do
  tenant. Sobram `support_access` e `tenant_transfer`.
- **O nome do autor sai de `actor_name_snapshot`, nunca de join.** Sob o RLS
  do tenant, `user_accounts` só mostra conta do próprio tenant, e os dois
  autores que aparecem aqui tipicamente não estão nele. É o caso de uso que
  `AD-004` previu.
- **`ip`/`user_agent` não são devolvidos** — no console eles são rastro de
  quem opera a plataforma, para quem responde por ela; aqui seriam o IP do
  funcionário do suporte entregue ao cliente.

Tela em `apps/web/src/app/(admin)/auditoria/`, par visível do
`SupportSessionBanner`: a faixa avisa durante a sessão de suporte, a tela
responde depois. Testes em `apps/api/src/audit/*.spec.ts`,
`apps/web/src/app/(admin)/auditoria/page.test.tsx` e RLS em
`apps/api/test/rls/tenant-audit-read.spec.ts` (prova que um tenant não lê a
linha do outro, e que a escrita direta por `app_user` continua negada).

### ~~PROD-16 · Evento com inscrição (Starter, sem pagamento)~~ · fechado

Entregue em 2026-09-14 na **variante Starter**. A linha Premium do item — o
evento **com pagamento** — segue aberta e virou `PROD-24` abaixo; nenhuma
rota desta entrega tem `@RequiresPlan`, porque evento gratuito é dos dois
planos.

O evento não ganhou modelo próprio: `ContentPostType.event` já existia e o
que faltava era o post carregar **quando, onde e com quais regras de
inscrição** (`event_starts_at`, `event_ends_at`, `event_location`,
`registration_enabled`, `registration_limit`, `registration_deadline` em
`content_posts`). Quem ganhou tabela foi a inscrição: `EventRegistration`
(`20260914184045_add_event_registrations`), com RLS de **congregação** em
`015_rls_event_registrations.sql` — padrão B, o mesmo de 008/009/010 — e o
passo correspondente no `bootstrap-db.sh`, inclusive na verificação do passo
7.

Duas portas em `content/posts/:postId/registrations`, e não uma rota que
muda de forma conforme o papel: `.../me` (o próprio usuário se inscreve e
desiste — **sem corpo**, nome e pessoa saem do cadastro, então ninguém se
inscreve como outra pessoa) e a raiz, do organizador
(`admin_congregation`/`pastor`/`tenant_admin`), que lista, inscreve o
visitante ainda sem cadastro e cancela. `.../summary` dá vagas e prazo sem
a lista de nomes, para a tela de quem vai se inscrever.

As regras, e onde cada uma é decidida:

- **Prazo** fecha as inscrições; o **cancelamento não o respeita** — segurar
  a vaga de quem desistiu é o pior dos dois erros.
- **Lotado não recusa**: entra como `waitlisted`. Recusar devolveria erro a
  quem fez tudo certo e deixaria o organizador sem saber quantos ficaram de
  fora.
- **Cancelar uma confirmada promove a mais antiga da fila**, na mesma
  transação; cancelar quem já esperava não promove ninguém.
- A contagem que decide vaga é feita **dentro** da transação da escrita —
  lida antes, duas inscrições simultâneas no último lugar entrariam as duas.
- **Uma vaga por linha**: não há acompanhante. Escolha de escopo — "levo
  dois" tornaria a fila um problema de encaixe, e a igreja que precisa disso
  cadastra as duas pessoas.
- Reinscrição depois de cancelar **reaproveita a linha**; os dois índices
  únicos são parciais (por pessoa e por e-mail, ignorando as canceladas) e
  estão escritos à mão na migration, porque o Prisma não modela unique
  parcial.

No `apps/web`, `CreatePostModal` mostra o bloco de evento só em
`type: "event"` — e só manda esses campos nesse caso, porque o `PostsService`
recusa campo de evento fora do tipo, inclusive `registration_enabled: false`.
`PostDetailSheet` mostra data/local e monta o `EventRegistrationsPanel`, que
carrega e recarrega sozinho. Testes: `apps/api/src/content/
event-registrations.{service,controller}.spec.ts`, os DTOs, o bloco novo em
`posts.service.spec.ts`, `apps/api/test/rls/event-registrations.spec.ts`
(prova que a congregação irmã do mesmo tenant não lê nem escreve) e, no web,
`EventRegistrationsPanel.test.tsx` mais os blocos novos de
`CreatePostModal.test.tsx` e `PostDetailSheet.test.tsx`.

### ~~PROD-20 · Multiplicação de célula, árvore genealógica, semáforo de saúde, metas por rede~~ · fechado

Entregue em 2026-09-15. Renumerado de `PROD-15` em 2026-09-13 (esse ID
pertence ao item de infra OTA, fechado na seção 5) — ID não se recicla.
Escopo completo: multiplicação (Starter) + árvore genealógica, semáforo de
saúde e rede com meta (Premium).

`SmallGroup.parent_group_id`/`childGroups` já existiam sem nenhuma ação que
os usasse; o item inteiro nasceu em cima disso. `POST
/small-groups/:id/multiply` cria a célula filha (`parent_group_id` = mãe) e
move os `GroupMembership` escolhidos numa única transação, com
recontagem dentro dela contra corrida de duas multiplicações simultâneas;
`cell_leader` da própria célula multiplica sem depender de admin (checagem
de escopo no service, não um novo papel), e não tem `@RequiresPlan` — é
Starter.

O semáforo (`classifyHealth`) é calculado on-demand a partir do
`MAX(GroupMeeting.occurred_at)`, sem job novo: verde <14 dias, amarelo
14–27, vermelho ≥28 ou sem encontro registrado. `GET
/small-groups/:id/hierarchy` — que já existia (`getHierarchy`, CTE
recursiva, sem nenhum consumidor no front) — ganhou ancestrais (cadeia
iterativa, não uma segunda CTE) e `health_status` por nó, e passou a exigir
Premium; não quebrou nada porque não tinha consumidor antes desta entrega.

`Network` é tabela nova (`networks`, RLS em `016_rls_networks.sql`, mesmo
template de `014` — `tenant_congregation_isolation` simétrica, AD-001),
por congregação, com líder opcional e `health_goal_pct` opcional.
`GET /networks/:id/goal-status` agrega saúde de todas as células da rede
(`green+yellow` sobre o total = "não vermelho") — reusa `classifyHealth`,
não duplica o cálculo. `NetworksController` inteiro é Premium
(`@RequiresPlan` de classe, mesmo padrão de `AuditController`/
`DreController`).

No `apps/web`: wizard de multiplicar (seleção de membros + novo líder) no
`GroupDetailSheet`, visível também ao `cell_leader` dono da célula (não só
admin/pastor — achado de revisão corrigido antes do PR); indicador de saúde
(bolinha, oculta silenciosamente sem Premium); aba de árvore genealógica
(`NoAccessState` sem Premium); tela `/redes` (`(admin)` do `apps/web`, não
o app `apps/admin` — é dado de igreja, não de plataforma) para criar/editar
rede, vincular/desvincular célula e ver o status da meta.

Verificado por um Verifier independente (`.specs/features/
prod-20-multiplicacao-celula/`) com PASS após uma iteração de fix (gap de
teste em `getGoalStatus`, não bug de produção) e uma rodada de
`/code-review`+`pr-review` que corrigiu 3 achados antes do PR (botão de
multiplicar invisível ao `cell_leader`, `PATCH` de rede não limpando
campo com `undefined`, `leader_person_id` sem validação em
`NetworksService`). Três achados menores ficaram como pendência declarada,
ver `PEND-05`.

### ~~PROD-24 · Evento com inscrição paga (Premium)~~ · fechado (backend + painel do organizador)

Entregue em 2026-09-15, sobre a variante Starter do `PROD-16` acima.
`content_posts.registration_price` (`Decimal(12,2)`, NULL = gratuito) liga o
modo pago; setar preço exige plano Premium — quem cobra isso é o
`PostsService` (`assertRegistrationPricePlan`), não o banco, mesmo princípio
de `assertEventFields`.

Resposta à pergunta que o `PROD-16` deixou em aberto — **a vaga é confirmada
no webhook, nunca no pedido**, seguindo o mesmo padrão do `PixPayment` de
doação (`PixService.handleWebhook`, `pending → confirmed` por `updateMany`
condicional, idempotente à reentrega da Asaas):

- `EventRegistrationStatus` ganhou `pending_payment` — nasce assim no
  `POST .../registrations/me`, fora de `ACTIVE` (não ocupa vaga confirmada,
  não aparece na listagem padrão do organizador). `EventRegistrationPaymentStatus`
  (`not_required`/`pending`/`paid`/`refunded`) registra o lado do pagamento;
  `pix_payment_id` (`@unique`) liga a inscrição ao `PixPayment`.
- **A vaga é reservada no pedido, não no pagamento** — sem isso, dois
  pedidos simultâneos para o último lugar pagariam os dois e só um teria
  vaga. A reserva conta `confirmed` **e** `pending_payment` criado nas
  últimas 24h (a validade do QR da Asaas) contra `registration_limit`;
  passada a janela, a linha para de contar sozinha, sem job de expiração.
- **Sem fila de espera para evento pago** — cobrar por uma vaga incerta
  reabriria a pergunta de reembolso, que esta entrega não resolve; evento
  lotado recusa a tentativa (`400`). Escolha de escopo, registrada no
  cabeçalho de `EventRegistrationsService`.
- **Só o próprio inscrito paga.** `POST .../registrations` (organizador
  inscreve visitante) recusa post pago — não há vínculo de pagamento a gerar
  para uma inscrição feita por outra pessoa. Quem recebeu em espécie/fora do
  PIX segue sem tela nesta entrega.
- Falha da Asaas ao gerar o QR desfaz a reserva (`status: cancelled`) — não
  deixa vaga presa esperando um QR que não existe.
- `PixScenario` ganhou `event_registration`; `PixService.createForEventRegistration`
  é o mesmo mecanismo do cenário 2 (QR dinâmico), chamado sem `JwtPayload`
  (quem paga não é staff). Categoria financeira busca por `"inscri"`, com a
  mesma queda para `"Oferta"` de sempre — zero-config para tenant que não
  cadastrou categoria própria.
- **Módulo próprio** (`PixModule`, não `FinancialModule` inteiro): o
  `ContentModule` só precisa de `PixService`, e importar `FinancialModule`
  arrastaria `ExportController` → `archiver` (ESM-only) para o grafo do
  `ContentModule`, quebrando o Jest de módulos que nem tocam em exportação.

**Sem tela de member self-service** — mesma lacuna que o `PROD-16` já tinha:
não existe, em `apps/web` nem `apps/mobile`, nenhuma tela que chame
`POST .../registrations/me` (só o painel do organizador, que é
`admin_congregation`/`pastor`/`tenant_admin`). Sem essa tela, não há onde
mostrar o QR do PIX dinâmico que esta entrega devolve. O que o `apps/web`
ganhou: `EventRegistrationsPanel` mostra o preço e esconde "Inscrever" do
organizador em evento pago (com a nota de que só o inscrito paga), e
`CreatePostModal` ganhou o campo de preço, condicionado a inscrição ligada.
A tela de member (provavelmente `apps/mobile`, que é onde o membro consome
conteúdo) é trabalho novo, não coberto aqui.

Testes: `event-registrations.service.spec.ts` (reserva/hold/24h, recusa de
organizador em evento pago, desfazer reserva em falha da Asaas),
`pix.service.spec.ts` (`createForEventRegistration`, webhook com
`scenario: event_registration` finalizando a inscrição na mesma transação,
sem recibo), `posts.service.spec.ts`/`create-post.dto.spec.ts` (preço exige
Premium, `IsPositive`), `content.module.spec.ts`/`financial.module.spec.ts`
atualizados para o `PixModule` novo. RLS: nenhum script novo — a mudança é
só coluna em tabela existente (`event_registrations`), a policy de
`015_rls_event_registrations.sql` já cobre; `event-registrations.spec.ts`
roda sem alteração (a suíte inteira fecha hoje em 125 testes — a contagem
citada aqui na redação original, 118, era a de antes do `networks.spec.ts`
que o `PROD-20` trouxe no mesmo dia).

### Funcionalidade prevista, sem código

| ID | Módulo | Funcionalidade | Plano | Nota |
|---|---|---|---|---|

### ~~PROD-08 · Carnê do dizimista / relatório anual para IR~~ · fechado

Entregue em 2026-09-20, em `apps/api/src/financial/`. Reaproveita o mesmo
critério de "identificado" que `DonationReceiptService` (`PROD-03`) já usa —
receita, `donor_person_id` presente, `is_anonymous` falso — só que somado por
ano-calendário em vez de por transação, e sem exigir e-mail cadastrado (o
tesoureiro é quem gera e entrega o documento, não é envio automático).

- `AnnualDonationReportService` novo, com três métodos: `buildReport`
  (doador + ano → lista de contribuições e total), `listDonorsForYear`
  (agregação por doador via `groupBy`, para o tesoureiro gerar em lote) e
  `generatePdf` (monta o "Carnê do Dizimista", mesmo padrão `pdfmake` do
  `DonationReceiptService`/`DrePdfService`, incluindo o mesmo bloqueio de
  `setLocalAccessPolicy`/`setUrlAccessPolicy`).
- Duas rotas em `DonationReceiptsController` (que já mora em `PixModule`,
  não em `FinancialModule` — decisão de `PROD-24` para não arrastar o
  `archiver` ESM-only no grafo de DI; `AnnualDonationReportService` foi
  registrado nesse mesmo módulo, não no `FinancialModule`):
  `GET /financial/donation-receipts/annual/summary?year=2026` (lista todos
  os doadores do ano com total e contagem, para o tesoureiro decidir para
  quem gerar) e `GET /financial/donation-receipts/annual/:personId?year=2026`
  (PDF do carnê individual, `StreamableFile`). Mesmo trio de guardas do
  resto do financeiro Premium (`JwtAuthGuard, RolesGuard, PlanGuard` +
  `@RequiresPlan('premium')`), mesmos papéis de leitura
  (`PRODUCT_AREA_READ_ROLES.financial`). A rota `annual/summary` é
  registrada **antes** de `annual/:personId` no controller — de propósito,
  para o router não tentar casar "summary" como `personId`.
- **Sem persistência em R2 nem tabela nova** — decisão deliberada, diferente
  do recibo por doação. O recibo (`PROD-03`) nasce de um pagamento PIX já
  confirmado e imutável, por isso faz sentido gravá-lo uma vez. O carnê
  anual é uma soma recalculável a qualquer momento a partir de
  `FinancialTransaction`; persisti-lo exigiria migration + script de RLS
  novo (a ordem frágil que o `CLAUDE.md` documenta em `bootstrap-db.sh`) só
  para guardar um PDF que o tesoureiro pode reemitir com o mesmo resultado
  a qualquer hora. Gerado sob demanda e devolvido como `StreamableFile`,
  mesmo padrão de `DrePdfService.generatePdf`/`DreController.exportPdf`
  (que também não persiste).
- **Sem filtro de `status`** na soma — mesmo precedente do `DreService`, que
  também soma o tenant inteiro sem olhar `status` da transação
  (`pending`/`paid`/`confirmed`).
- **Sem CPF** — o schema não modela esse campo em `Person`, então o carnê
  não o traz. Mesmo espírito de `PROD-03`: o PDF não é documento fiscal (não
  modela CNPJ/razão social da igreja), e o rodapé diz isso explicitamente,
  porque aqui o documento se apresenta como prova para a declaração de IR do
  doador — mais motivo para deixar claro o que ele não é.
- **Escopo do tenant inteiro, não por congregação** — mesmo recorte que
  `DonationReceiptService.list` já usa; um doador pode ter contribuído em
  mais de uma congregação do mesmo tenant ao longo do ano.
- Testes: `annual-donation-report.service.spec.ts` (soma, filtro do
  período/critério de identificação, agregação e ordenação da listagem,
  doador de outro tenant vira 404, PDF gerado mesmo sem contribuição no
  ano) e `donation-receipts.controller.spec.ts` (as duas rotas novas,
  incluindo os headers de download do PDF). `financial.module.spec.ts`
  ganhou a instância nova no smoke test de compilação do módulo.
- **Ficou de fora**: geração em lote de um PDF por doador de uma vez
  (endpoint dispara N `generatePdf`, um ZIP ou downloads sequenciais). O
  endpoint de `annual/summary` cobre a decisão de "para quem gerar"; falta
  a ação de "gerar todos" em si. Não entrou porque o padrão de ZIP do
  módulo (`ZipExportService`, `archiver`) vive em `FinancialModule`, e
  `DonationReceiptsController` está em `PixModule` justamente para não
  arrastar esse pacote ESM-only — misturar os dois exigiria repensar a
  fronteira entre os dois módulos, não só adicionar uma rota. Sem tela no
  `apps/web`/`apps/admin` consumindo nenhuma das duas rotas ainda, também de
  propósito — a tarefa pediu o back-end.

### ~~PROD-17 · Segmentação avançada de notificações (comportamento, engajamento, inativos)~~ · fechado (Premium)

Entregue em 2026-09-20, sobre a segmentação básica já existente
(`AudienceSegment`/`SegmentCriteriaDto`) — três critérios novos e aditivos em
`segment-criteria.dto.ts`: `inactive_since` (sem nenhum sinal de engajamento
há N dias), `group_attendance_gap` (sem presença em `GroupMeeting` — célula —
há N dias) e `high_engagement` (N ou mais sinais de engajamento numa janela).
"Sinal de engajamento" é o que o schema já tinha por outro motivo, sem
tracking novo: `VisitRecord` (visita), `AttendanceRecord` (presença em
reunião de célula) e `MaterialOpenRecord` (abertura de material de estudo,
`PROD-10`). **Não existe critério de "abriu/não abriu notificação"** — decisão
registrada no cabeçalho do DTO: `NotificationDispatch.reached`/`opened` é
agregado por disparo (quantos no total), não por destinatário, e não dá para
responder "esta pessoa abriu" sem inventar tracking novo, o que o item
pediu para evitar.

**Premium via checagem no service, mesmo princípio do `PROD-24`
(`registration_price`).** `SegmentsService.create`/`.update` chamam
`assertBehaviorCriteriaPlan(dto.criteria, user.plan)` antes de gravar —
`ForbiddenException` quando `criteria` usa qualquer um dos três critérios
avançados e o plano não é Premium. Os critérios básicos (papel, congregação,
célula, faixa etária) continuam nos dois planos, na mesma rota e no mesmo
DTO — por isso o gate é no service, não um `@RequiresPlan('premium')` no
controller, que bloquearia os básicos junto.

**Resolução muda de mecanismo quando o segmento é avançado.** A segmentação
básica nunca resolveu destinatário nenhum: `NotificationsService.buildFilters`
monta filtro de **tag** do OneSignal (`tenant_id`/`congregation_id`/`pg_ids`/
`role`), e quem casa tag com device é o próprio OneSignal — não existe tag de
"sem presença há N dias". Por isso, quando qualquer segmento de uma chamada
(`notifyPost`/`sendManualNotification`) tem critério avançado, a chamada
inteira (todos os segmentos, básicos inclusive) muda para resolução direta:
consulta os `UserAccount` ativos e com `person_id` do tenant, filtra pelos
critérios básicos do próprio segmento (congregação/papel/célula) e pelos
avançados, e envia por `include_external_user_ids` — o mesmo valor que
`OneSignal.login(payload.sub)` grava como external id do device em
`onesignal-client.ts` (MOB-07, ou seja, `UserAccount.id`). OR entre segmentos
vira união com deduplicação das listas de conta. A preferência de categoria
(`pref_<categoria>`, MOB-10b) continua respeitada, com o mesmo default
(`NotificationPreference` sem linha = não desativou), só em `notifyPost` —
`sendManualNotification` já não filtrava por categoria antes (sem
`ContentPostType`) e continua sem filtrar. Sem destinatário elegível, não
chama o OneSignal (evita erro da API com lista vazia) e grava o dispatch como
`sent` sem `onesignal_id` — não é falha do envio.

Testes: `segment-criteria.dto.spec.ts` (validação dos três critérios novos e
`hasBehaviorCriteria`), `segments.service.spec.ts` (gate de plano em
`create`/`update`, básico continua liberado no Starter) e
`notifications.service.spec.ts` (resolução por `external_user_ids`, filtro
básico dentro da consulta avançada, os três critérios isoladamente, união e
deduplicação entre segmentos, preferência de categoria e o caminho sem
destinatário elegível).

### ~~PROD-25 · Tela de member self-service para inscrição em evento~~ · fechado

Entregue em 2026-09-16, no `apps/mobile`. Fecha a lacuna que o `PROD-16`
abriu em 2026-09-14 e que o `PROD-24` agravou em 2026-09-15: `POST
.../registrations/me` existia desde então sem nenhum consumidor — só o
painel do organizador chamava a API de inscrição —, e o QR do PIX dinâmico
que `registerSelf` passou a devolver para evento pago não tinha onde
aparecer. **Nada de backend nesta entrega**: nenhuma rota, migration ou
script de RLS novo. É tela sobre API pronta.

**`apps/mobile`, não `apps/web`** — a pergunta que o item deixou em aberto.
O `apps/web` é só `(admin)` e `(public)`: não tem área de membro nenhuma, e
criar uma (grupo de rota, layout, nav, guard) seria trabalho maior que a
tela em si. O mobile já tem `app/post/[id].tsx` e `content-client.ts`, e é
onde o membro consome conteúdo.

- `app/post/[id].tsx` ganhou o bloco de **quando e onde**
  (`event_starts_at`/`event_location` — campos que a API já devolvia, porque
  `findOne` não tem `select`, e que nenhuma tela mostrava) e monta o
  `EventRegistrationPanel` **só quando `registration_enabled`**: post comum
  não paga as duas chamadas.
- `EventRegistrationPanel` é o par que faltava do `EventRegistrationsPanel`
  do web. Bate em `.../registrations/summary` e `.../registrations/me`, e
  **em nenhum momento** na raiz `GET .../registrations` — essa é do
  organizador e responde 403 para `member`. Não há função para ela no
  `content-client.ts`, de propósito.
- A tela reflete as regras que o backend já decidiu, sem duplicá-las:
  lotado **e gratuito** oferece "Entrar na fila de espera" (a API não
  recusa, entra como `waitlisted`); lotado **e pago** não oferece botão
  nenhum (a API responde 400 — não há fila quando se cobra); prazo vencido
  esconde o botão de inscrever mas **mantém o de cancelar**, porque o
  cancelamento não respeita o prazo.
- Erro de ação mostra a **mensagem da própria API** quando ela é 4xx
  ("Vagas esgotadas para este evento"): são escritas para o usuário final.
  5xx e erro de rede caem no texto genérico — "Serviço PIX indisponível"
  não ajuda quem está tentando pagar.
- **Evento pago**: QR como `Image` de `data:image/png;base64,…` (a Asaas
  devolve `encodedImage` sem o prefixo, quem monta a URI é a tela), payload
  copia-e-cola em `<Text selectable>` mais botão "Copiar código PIX" com
  **`expo-clipboard`** — dependência nova do `orbien-mobile`, instalada da
  raiz, sem config plugin. Falha ao copiar não esconde o código.
- **Limitação conhecida, declarada em tela**: o QR só existe na resposta do
  `POST`. `GET .../registrations/me` devolve a inscrição, não o payload do
  PIX, então quem sai da tela antes de pagar perde o código — a nota abaixo
  do QR manda cancelar e se inscrever de novo, que gera outro. Resolver
  isso de verdade seria trabalho de backend (expor o `qr_code` do
  `PixPayment` ligado à inscrição), fora do escopo desta entrega; nasceu
  como `PEND-07` na seção 8.
- `formatBRL` (`src/lib/format/currency.ts`) é manual pelo mesmo motivo que
  `date.ts` documenta: sem `Intl` completo o Hermes cai em en-US **em
  silêncio**, e "R$ 1.234,56" viraria "R$1,234.56". O web segue com
  `toLocaleString`, e está certo lá.

**Correção de bug pré-existente, arrastada por esta entrega.** `ApiClient`
(`src/lib/api/client.ts`) chamava `response.json()` em toda resposta 2xx que
não fosse 204. O Nest serializa `null` como **200 com corpo vazio**
(`isNil(body)` → `response.send()` no `ExpressAdapter`), então `JSON.parse("")`
jogava. Duas rotas caem nisso: `GET .../registrations/me` (o caminho principal
desta tela — membro que ainda não se inscreveu) e `GET
/volunteers/unavailability` num mês sem registro, que **já estava quebrada em
produção** desde o MOB-08 pelo mesmo motivo, mostrando erro de carga no lugar
do estado vazio. O client agora lê o corpo como texto e devolve `undefined`
quando ele é vazio; 204 segue sem ler corpo nenhum.

**Achados de revisão corrigidos antes do PR** (`/code-review` + `pr-review`,
dimensões B e C — A não se aplica, não há `apps/api/**` no diff): além do bug
acima, o painel era montado só com `registration_enabled`, e desligar as
inscrições tirava o botão de cancelar de quem já estava inscrito (agora a tela
monta o painel para todo post de evento e **o painel** decide não desenhar
nada); `Promise.all` no carregamento fazia um 5xx em `.../me` apagar preço,
vagas e prazo já carregados (virou `allSettled`, com as duas metades
independentes); o erro de carga não usava `describeLoadError` nem oferecia
retry, divergindo das outras 12 superfícies de carga do app; e
`numberOfLines={3}` truncava o payload do PIX, justamente o fallback de quem
não conseguiu copiar.

**Pendência de deploy — não vai por OTA.** `expo-clipboard` é módulo nativo,
então só entra em binário novo. O `runtimeVersion` é `appVersion` e o
`autoIncrement` do profile `production` mexe em build number, não em
`version`: publicar só um update OTA deixaria o app quebrando em
`Clipboard.setStringAsync` nos binários antigos. Esta entrega **exige build
nova com bump de `version`** antes de qualquer update no mesmo canal.

Testes: `EventRegistrationPanel.test.tsx` (30 casos — os dois caminhos de
lotado, prazo, os três status, QR/copiar, as duas metades do carregamento,
retry, inscrição desligada com e sem inscrito, e a trava de toque duplo, que
evita duas cobranças de PIX), `currency.test.ts`, os blocos novos de
`content-client.test.ts`, `client.test.ts` (corpo vazio e 204) e
`__tests__/app/post/[id].test.tsx`. A suíte do mobile fecha em **313 testes
em 43 suítes**, com a cobertura acima do piso do `jest.config.js`
(94,63 / 86,26 / 94,37 / 98,33).

> `PROD-11` (alerta de ausência consecutiva para o líder, Módulo 3, Starter)
> **fechou em 2026-09-16**. A conta já existia —
> `SmallGroupsService.checkAbsenceAlerts`, em
> `GET /small-groups/:id/absence-alerts` — e faltavam as duas pontas que
> fazem dela um *alerta*: a tela que pergunta e o job que empurra sem que
> ninguém pergunte. As duas entraram.
>
> No `apps/web`, aba "Ausências" na `GroupDetailSheet` (`AbsenceAlertsPanel`),
> montada só quando a aba abre — mesmo padrão da aba "Conversa" do `PROD-09`.
> A aba aparece para `canEdit` **ou** `isCellLeader`, que é exatamente o
> `ALERT_ROLES` da rota: papel, não "líder desta célula". Não é descuido — a
> rota é assim, e o `isLeaderOfGroup` do `PROD-20` existe para a escrita
> (multiplicar), não para leitura operacional. O painel distingue 403 de
> lista vazia pelo motivo da pendência nº 10, o mesmo do
> `PrayerRequestsPanel`: "sem acesso" e "ninguém faltou" são respostas
> diferentes.
>
> O push é o `SmallGroupsAbsenceNotifier` (`0 9 * * 1`, semanal): varre todos
> os tenants por `prisma.system` — cron não tem request nem contexto de
> tenant, mesma razão do `PersonsRetentionNotifier` — e avisa o líder de cada
> célula que tem ausente. O filtro é `person_id` do
> `small_groups.leader_person_id`, não a tag `role: cell_leader`: a falta é da
> célula dele, e a tag pegaria todo líder da congregação. Semanal porque o
> alerta só muda quando uma reunião é registrada, e célula reúne uma vez por
> semana; diário repetiria o mesmo aviso sem informação nova.
>
> A regra de "ausente" ficou escrita **duas vezes** — em Prisma no service
> (rota, sob RLS, com contexto do request) e em SQL no notifier (cross-tenant,
> N queries do Prisma não se pagariam). É duplicação consciente e o cabeçalho
> do notifier a declara: as duas precisam dizer a mesma coisa, porque tela e
> push divergindo é pior do que qualquer uma das duas estar errada sozinha.
> O SQL foi conferido contra o Postgres local com cenário montado à mão —
> célula sem reunião não gera alerta, célula com menos de 3 reuniões usa as
> que tem, e presença numa 4ª reunião mais antiga não tira ninguém da lista.
>
> O `joined_at` **entrou na mesma rodada**, depois de o dev pedir o ajuste
> antes de fechar: a janela é por membro, não pela célula — só conta reunião
> posterior à entrada da pessoa, e presença anterior a ela também não vale.
> Quem entrou depois das três não aparece no alerta. Mudou o que a rota
> responde, o que é comportamento em produção; foi decisão declarada, não
> silêncio. Nasceu como `PEND-06` e fechou no mesmo dia (seção 7).
>
> E a paridade entre as duas definições **deixou de depender de disciplina**:
> `test/integration/small-groups-absence-alerts.spec.ts` monta um cenário só
> (janela de 3 com uma quarta reunião fora dela, membro que entrou depois,
> membro que entrou no meio, presença registrada antes da entrada) e exige a
> mesma resposta da rota (Prisma, sob RLS, via `runAsTenant`) e do job (SQL,
> cross-tenant, via `absencesByGroup`). Conferido nos dois sentidos: quebrar o
> `joined_at` só no SQL derruba a suíte, quebrar só no service também.

> `PROD-04` (página pública de doação, Cenário 3) **fechou em 2026-09-12**. A
> API já existia (`POST /financial/pix/public-donation`, pública, com
> throttle e honeypot) e faltava só a tela. Ficou em `apps/web`, não em
> `apps/site`, porque a página depende de `tenant_slug` — é doação de uma
> igreja específica, não conteúdo institucional da Orbien — em
> `/doar/[tenant_slug]`, sem grupo de rota autenticada (mesmo padrão de
> `esqueci-senha`/`redefinir-senha`). Chama `POST
> /financial/pix/public-donation` pelo cliente compartilhado (`src/lib/api.ts`),
> que já resolve para `/api-proxy` em produção. É só o Cenário 3 Starter —
> chave PIX para cópia manual, com nome do doador e da igreja; o QR dinâmico
> do Cenário 3 Premium (ADR-007) segue sem tela, porque exige o fluxo
> autenticado de `POST /financial/pix/dynamic`, que essa página pública não
> usa.

> `PROD-09` (chat fechado por célula, Módulo 3, Starter) **fechou em
> 2026-09-14**. Tabela nova `group_messages`
> (`20260914120000_add_group_messages`) com RLS de congregação já na
> primeira versão (`012_rls_group_messages.sql`, AD-001 — caso de 007/008,
> não de 009/010: nunca teve a `tenant_isolation` fraca de 001). Três rotas
> em `/small-groups/:groupId/messages` (POST, GET, DELETE), com a mesma
> regra de `PROD-01`: **participação, não papel** — toda rota exige
> `GroupMembership` no grupo, inclusive para `pastor`, `admin_congregation`
> e `tenant_admin`. O RLS é o piso (tenant + congregação) e não conhece
> participação em grupo; quem fecha o chat na célula é o
> `GroupMessagesService`. Paginação por cursor (`before`/`after` sobre o par
> `created_at`+`id`), não por página: a lista cresce pelo fim e `offset`
> repetiria ou pularia mensagem. Apagar é **soft delete** (`deleted_at`) —
> autor ou líder da célula, pela `GroupMembership.role` — e a mensagem vira
> lápide na conversa, sem abrir buraco no histórico e deixando rastro da
> moderação. No `apps/web`, aba "Conversa" na `GroupDetailSheet`
> (`GroupChatPanel`), montada só quando a aba abre, com polling de 15s
> pedindo só o que chegou depois da última mensagem. **Não** tem tempo real
> (não há gateway de websocket na API e nada mais na base tem) nem
> notificação push de mensagem nova — se isso for pedido, é trabalho
> próprio, não ajuste deste.

**Conferido e entregue**, apesar de soar parecido com os de cima — para não
virar trabalho repetido: detecção de duplicados no cadastro e na importação,
métricas de notificação da OneSignal (`reached`/`opened`, sincronizadas), OC
imprimível em PDF, exportação contábil OFX, forecast financeiro, PIX nos três
cenários com webhook da Asaas, e o indicador de abertura de material por
membro (histórico de versões é `PROD-10` acima, já fechado).

> `PROD-18` (OTA via Expo Updates) fechou em 2026-09-13 por ser o mesmo
> item que `PROD-15` (seção 5, "Infra básica de expo-updates") — duas
> entradas para a mesma entrega, uma fechada e outra não. A nota que dizia
> "`expo-updates` não está no `apps/mobile`" estava desatualizada desde
> 2026-09-12: o pacote está instalado e a infra descrita em `PROD-15` cobre
> exatamente o que esta linha pedia.

> `PROD-04` (página pública de doação, Cenário 3) fechou em 2026-09-13, pelo
> PR #86 (sessão paralela a esta, com `/code-review` e a skill `pr-review`
> já rodados): `apps/web/src/app/(public)/doar/[tenant_slug]/page.tsx`, sem
> login, chama `POST /financial/pix/public-donation` (já existia) e mostra a
> chave PIX manual para copiar — não há QR Asaas aqui, isso é o Cenário 2
> (Premium). Esta sessão tinha uma implementação equivalente e a descartou
> em favor da do PR #86, mais revisada; ver a decisão registrada na conversa
> desta rodada. Ao mesclar o PR #86, conferir que o link ainda bate
> (`[tenant_slug]`, não `[tenant]`).

> `PROD-06` (fila CRM de trials/inadimplentes) e `PROD-19` (domínio próprio
> e termos de uso por tenant) **fecharam em 2026-09-13**:
>
> - `PROD-06` — `ListCrmQueueService` (`GET
>   /platform/tenants/crm-queue`) separa trial vencido sem conversão
>   (`status = trial` + `trial_ends_at` no passado) de inadimplente (`status
>   = suspended`), e `apps/admin` ganhou a aba **CRM** para o time comercial
>   abrir sessão de suporte a partir da fila.
> - `PROD-19` — só o registro, não o provisionamento: `BrandingConfig`
>   ganhou `custom_domain` (único) e `terms_url`, graváveis por
>   `tenant_admin` em plano Premium via `PATCH /settings` (`dto.branding`).
>   Apontar o domínio de fato — DNS/CNAME, certificado — é passo de infra
>   que este PR não faz; falta decidir isso à parte antes de anunciar a
>   funcionalidade como usável.

> `PROD-13` ("Encontre uma célula") **fechou em 2026-09-14**. São duas rotas
> públicas novas em `apps/api`, no mesmo prefixo `public/` do cadastro de
> visitante por QR: `GET /public/small-groups?tenant_slug=` lista as células
> `is_public` da igreja (sem líder e sem contato de ninguém — só os campos
> `public_*`, endereço, coordenada, horário, tipo e congregação) e
> `POST /public/small-groups/:id/visit-request` grava o "quero visitar". A
> tela é `apps/web/src/app/(public)/celulas/[tenant_slug]/page.tsx`, sem grupo
> de rota autenticada, mesmo padrão de `/doar/[tenant_slug]`: mapa (Leaflet +
> OpenStreetMap, sem chave de API, carregado por `import()` dentro do efeito
> porque o Leaflet toca `document`), filtros de texto/tipo/congregação
> resolvidos no cliente e ordenação por proximidade quando o visitante
> permite a geolocalização.
>
> Duas coisas que valem registro:
>
> - **O pedido de visita não é `VisitRecord`.** Quem clica ainda não foi a
>   lugar nenhum, e `VisitRecord` conta visita acontecida — é o que alimenta a
>   reclassificação automática de visitante para frequentador
>   (`ClassificationService.checkAutoReclassification`, 3 visitas em 60 dias).
>   Gravar interesse ali inflaria classificação sem ninguém ter aparecido. Daí
>   a tabela própria, `small_group_visit_requests`
>   (`20260914182840_add_small_group_visit_requests`).
> - **O plano público ganhou ramo de RLS próprio**, em
>   `013_rls_small_groups_public.sql` (leitura) e
>   `014_rls_small_group_visit_requests.sql` (escrita), os dois fora do
>   histórico do Prisma e ligados no `bootstrap-db.sh` como os anteriores.
>   Toda policy pública exige `app_current_user() IS NULL`: como o
>   `TenantContextInterceptor` fixa `app.user_id` em toda requisição
>   autenticada, esses ramos são inalcançáveis de dentro do produto e não
>   afrouxam o isolamento por congregação de quem está logado. O público lê
>   célula pública (e só o tipo e a congregação dessa célula) e **escreve**
>   pedido de visita, sem poder lê-lo de volta — por isso o insert é
>   `$executeRaw`, e não `create` do Prisma, que usa RETURNING. Provas em
>   `apps/api/test/rls/small-groups-public.spec.ts`.
>
> A tela do outro lado veio depois, no `PROD-23` (2026-09-16) — a nota está
> logo abaixo.

> `PROD-23` (tela da liderança para os pedidos de visita) **fechou em
> 2026-09-16**. Não houve mudança em `apps/api`: a rota
> `GET /small-groups/:id/visit-requests` já existia desde o `PROD-13`, com
> `ALERT_ROLES` (`tenant_admin`, `admin_congregation`, `pastor`,
> `cell_leader`) — o trabalho inteiro foi no `apps/web`, e nenhum script de
> RLS foi tocado (`014_rls_small_group_visit_requests.sql` já cobre a
> leitura autenticada).
>
> Ficou como aba **"Visitas"** da `GroupDetailSheet`
> (`apps/web/src/components/groups/VisitRequestsPanel.tsx`), e não como tela
> própria: o pedido é de uma célula, e quem vai responder já está com a
> gaveta daquela célula aberta. Montada só quando a aba abre, pelo mesmo
> motivo de "Oração", "Conversa" e "Genealogia" — aqui com um peso a mais,
> porque a requisição responde 403 para quem abre a gaveta sem papel de
> liderança, e esse custo não deve existir em toda abertura.
>
> O 403 vira `NoAccessState`, não lista vazia. É a mesma regra do
> `PrayerRequestsPanel`, por outro motivo: lá a API exige participação no
> grupo, aqui exige papel. "Nenhum pedido de visita recebido" e "você não
> tem acesso" são leituras opostas, e a primeira, dita no lugar da segunda,
> faz o líder concluir que ninguém se interessou pela célula dele.
>
> **O painel só lê.** Não há rota de escrita e não deveria haver: a
> liderança responde por telefone ou e-mail — daí os contatos saírem como
> link `tel:`/`mailto:`, que é a única ação que existe ali — e o registro da
> visita que de fato aconteceu continua sendo `VisitRecord`, que é outra
> coisa (ver a nota do `PROD-13`, logo acima). `created_at` é instante, não
> data civil, então sai por `formatInstant`.

### ~~PROD-07 · Conciliação bancária (importar OFX)~~ · fechado

Entregue em 2026-09-20, só backend. `financial/export/` já gerava OFX
(`export.service.ts`); faltava o caminho inverso — importar o extrato do
banco e casar com os `FinancialTransaction` já lançados no Orbien.

**Endpoints**, os dois Premium (`@RequiresPlan('premium')`, mesmo portão do
resto do financeiro) e com os mesmos papéis de `financial/export`
(`treasurer`, `admin_congregation`, `tenant_admin` — sem `secretary`,
porque conciliação é decisão de quem responde pelo caixa, não lançamento):

- `POST /financial/import/ofx` — upload (`multipart/form-data`, campo
  `file`, `.ofx`/`.qfx`, limite 10 MB, como o de `persons/import`). Faz
  parse, tenta casar cada transação do extrato e devolve o relatório.
- `GET /financial/import/ofx/unmatched` — lista as linhas sem match
  (`?import_job_id=` filtra por importação), paginada.

**Formato aceito**: OFX 1.x (SGML), o mais comum em banco brasileiro —
tags sem fechamento (`<FITID>ABC123`, sem `</FITID>`), que é como bancos
exportam de verdade, mas também fecha com o estilo do nosso próprio
`export.service.ts` (`<FITID>ABC123</FITID>`), já que SGML aceita as duas.
Lib escolhida: `node-ofx-parser` — não há parser de OFX no `package.json`
da raiz; entre as duas libs desse nicho no npm (`ofx` e
`node-ofx-parser`, ambas derivadas do mesmo `chilts/node-ofx` original),
`node-ofx-parser` depende de `fast-xml-parser` (mantido) em vez de
`xml2json` (sem release desde 2015) — instalada da raiz,
`npm install node-ofx-parser -w orbien-backend`, único lockfile.

**Regra de match**: valor exato + `TRNTYPE`/sinal do `TRNAMT` batendo com o
tipo da categoria (`CREDIT` → `income`, `DEBIT` → `expense`) + `occurred_at`
dentro de ±3 dias de `DTPOSTED` (compensação bancária) + `status` em
`paid`/`confirmed`. Mais de um candidato → fica o de menor diferença de
dias. Uma `FinancialTransaction` casa com **no máximo uma** linha de
extrato — `bank_statement_transactions.financial_transaction_id` é
`@unique`, então isso vale mesmo entre importações diferentes, não só
dentro da mesma. **Não muda `FinancialTransaction.status`** ao casar: o
match é só o vínculo de conciliação (`bank_statement_transactions`), quem
fecha o livro-caixa continua sendo a exportação contábil
(`ExportService.markConfirmed`), que já existia e não foi tocada.

**Reimport do mesmo extrato não duplica**: `FITID` é a chave do banco por
natureza (todo banco garante unicidade dele dentro da conta), e
`@@unique([tenant_id, congregation_id, fitid])` em
`bank_statement_transactions` é o que torna isso verdade aqui — a segunda
importação do mesmo arquivo reconhece cada `FITID` já visto e conta como
`duplicates`, sem criar linha nem tentar casar de novo.

**Decisões de escopo**:

- **Sem tabela de job própria** — `OfxImportService` reaproveita
  `ImportJob` (`type: 'financial_ofx'`), o mesmo modelo genérico que
  `PersonsImportService` usa. O relatório (`{ job_id, total, matched,
  unmatched, duplicates, errors }`) é montado a partir dele mais a
  contagem de `bank_statement_transactions`, sem tabela nova só para
  progresso de import.
- **Tabela nova, só uma**: `bank_statement_transactions` — uma linha por
  transação do extrato, com o `financial_transaction_id` (nulo = ainda sem
  match) que sustenta a listagem de não-casados.
- **RLS Padrão B**, o mesmo de `export_jobs`/`import_jobs`
  (`20260613000000_add_export_import_jobs`): tabela nova, sem policy
  anterior para o passo 4 do `bootstrap-db.sh` derrubar, então a
  `ENABLE`/`FORCE ROW LEVEL SECURITY` e a policy nascem dentro da própria
  migration do Prisma
  (`20260920022955_add_bank_statement_transactions`) — **sem** entrar em
  `bootstrap-db.sh`. O passo 7 continua cobrindo isso pelo catch-all
  genérico (qualquer tabela em `public` sem RLS habilitado derruba o
  passo), do mesmo jeito que já cobre `export_jobs`/`import_jobs` sem
  checagem nomeada própria — confirmado rodando `bootstrap-db.sh` do zero
  depois da migration.
- **Tenant + congregação, sem exceção de `tenant_admin`** — ao contrário de
  `financial_transactions`/`cost_centers` (que usam
  `app_congregation_allowed()`, com a exceção), esta tabela segue o
  isolamento simples de `export_jobs`/`import_jobs`: é artefato de
  importação, não o livro-caixa em si, e nada no produto hoje pede que
  `tenant_admin` veja conciliação de outra congregação sem entrar nela.
  Sem teste de isolamento dedicado em `test/rls/isolation.spec.ts`, pelo
  mesmo motivo — `export_jobs`/`import_jobs` também não têm.
- **Sem caminho assíncrono**: diferente de `persons/import` (split em 500
  linhas) e `financial/export` (split em 92 dias), a importação de OFX é
  sempre síncrona — extrato bancário mensal não chega a milhares de
  linhas. Limite de sanidade: 5000 transações por arquivo (mesma ordem de
  grandeza do `MAX_IMPORT_ROWS` de `persons/import`), acima disso é 400.
- **Tela de conciliação manual não entra nesta entrega** — só a rota de
  listagem dos não-casados (`GET .../unmatched`), como o prompt permitia.

Testes: `ofx-import.service.spec.ts` (extensão/tamanho inválidos, OFX sem
transação, match por valor+data, sem candidato, reimport não duplica,
linha sem `FITID` vira erro sem contar no total, auditoria que falha não
desfaz a importação, filtro de não-casados por tenant/congregação e por
`import_job_id`), `ofx-import.controller.spec.ts` (delega ao service, papel
e plano exigidos), `financial.module.spec.ts` atualizado com o controller e
o service novos. `npm run test:rls -w orbien-backend` roda sem alteração —
138 testes em 9 suítes, sem mudança de número: nenhum arquivo de RLS
`0NN_*` novo, e a tabela nova não tem suíte própria pela decisão acima.

### ~~PROD-05 · Sugestão automática de escala por disponibilidade e rodízio~~ · fechado

Entregue em 2026-09-20: `GET /celebrations/instances/:instanceId/schedule/suggest`,
no mesmo `CelebrationScheduleController` (herda `@RequiresPlan('premium')` de
classe — o módulo inteiro já é Premium, não precisou de decorator próprio) e
os mesmos `MANAGE_ROLES` de `getSchedule`/`addMinistry`. Serviço novo,
`CelebrationScheduleSuggestionService`, sem tabela nova — cruza dado que já
existia:

- **Funções a preencher são as já vinculadas à escala** (`CelebrationMinistry`
  criado por `addMinistry`/`applyTemplate`), não um formulário à parte — a
  sugestão preenche, não decide, quais funções a celebração precisa.
- **Disponibilidade declarada** (`VolunteerProfile.availability`, Json
  `{dia: slot[]}`) é checada contra o dia da semana de `scheduled_date` e um
  balde de horário derivado de `Celebration.start_time`
  (`<12h` manhã, `12–18h` tarde, `≥18h` noite — mesmos três rótulos que o
  cadastro já usa). Quem não declarou o dia/horário não é sugerido: não dá
  para confirmar disponibilidade a partir do silêncio.
- **Indisponibilidade pontual** (`VolunteerUnavailabilityDate`) exclui pela
  data exata da instância, mesma consulta de
  `CelebrationAssignmentService.checkUnavailability`.
- **Rodízio**: ordena por menos vezes atribuído à mesma função primeiro e,
  empatado, por quem serviu há mais tempo (nunca serviu conta como "há mais
  tempo" possível). Histórico conta `pending`/`confirmed`; `declined` e
  `swapped` não contam — o voluntário não chegou a servir naquele slot.
  Sem corte por janela de tempo (ex. "últimos 6 meses"): um número mágico
  sem evidência de que o rodízio real do cliente zero precisa disso, e é
  mais fácil apertar depois do que adivinhar agora.
- **Não filtra por dupla escalação na mesma celebração** (mesma pessoa em
  duas funções do mesmo culto): igreja pequena escala a mesma pessoa em som
  e recepção com frequência, e o próprio schema não impede isso hoje
  (`@@unique` de `CelebrationAssignment` é por função, não por instância).
- **Teto de 10 sugestões por função** (`MAX_SUGGESTIONS_PER_MINISTRY`),
  com `eligible_count` informando o total elegível — evita payload grande
  em ministério com dezenas de voluntários; quem decide de fato escalar usa
  o `POST .../assignments` que já existia, então o teto não bloqueia nada.
- **Sem tela no `apps/web`**: o padrão de UI de escala
  (`AssignmentsPanel`/equivalente) já existe, mas encaixar "sugerir e um
  clique aplica" nele é decisão de fluxo (lista simples? um botão por
  função? aplica direto ou só preenche o formulário?) que vale ficar para
  quem for desenhar a tela, não decidida aqui às pressas. Fica como API
  pronta, mesmo padrão do `PROD-23`.

Testes: `celebration-schedule-suggestion.service.spec.ts` (instância
inexistente, sem escala, sem ministério, já atribuído, sem disponibilidade
declarada, indisponibilidade pontual, ordenação de rodízio, `declined`/
`swapped` fora da contagem, `availability` em formato inesperado tratado
como indisponível em vez de lançar) e o `controller.spec.ts`/
`module.spec.ts` do módulo atualizados para o provider novo. RLS: nenhum
script novo — só leitura de tabelas que já existiam sob RLS
(`volunteer_ministries`, `volunteer_unavailability_dates`,
`celebration_assignments`), mesmas policies que `celebration-assignment.service.ts`
já usa.

### ~~PROD-12 · Check-in de membros por QR no encontro~~ · fechado

Entregue em 2026-09-20. `QrToken` (schema) continua exclusivo do cadastro de
visitante (`apps/api/src/visitor/`) — não foi tocado. Este item é caminho
novo, sob o próprio modelo: `MeetingCheckinToken`
(`20260920022631_add_meeting_checkin_tokens`), um por `GroupMeeting`.

- **Dois endpoints em `MeetingsController`**, mesmo prefixo `small-groups/`:
  `POST /small-groups/meetings/:meetingId/checkin-token` (líder gera/renova,
  `MEETING_WRITE_ROLES` — os mesmos que já escrevem presença manual em
  `recordAttendance`) e `POST /small-groups/meetings/checkin` (membro usa o
  token, `MEETING_LIST_READ_ROLES`, o mesmo conjunto de `findByGroup`). O
  segundo não leva `:meetingId` no path — o token já identifica o encontro,
  então quem escaneia não precisa saber o id da reunião de antemão.
- **Expiração em duas camadas, com papéis diferentes.** `expires_at` no
  token (`CHECKIN_TOKEN_TTL_MINUTES = 240`, 4h) é o que barra check-in tarde
  demais depois que o QR já foi mostrado; gerar de novo rotaciona o token no
  mesmo `upsert` (chave única em `group_meeting_id`), o que revoga o QR
  anterior sem precisar de um `is_active` — quem escaneou o antigo cai no
  mesmo "inválido ou expirado". Já `CHECKIN_MAX_MEETING_AGE_HOURS = 24` roda
  na **geração**, não no check-in: barra o líder de abrir check-in por QR
  para um `GroupMeeting` lançado tarde, de forma manual, com `occurred_at` de
  mais de um dia atrás — o resto do módulo permite `occurred_at` livre na
  criação, então sem este limite "encontro que já fechou" só seria barrado
  por coincidência, se sobrasse um token velho ainda dentro da janela de 4h.
  Os dois números são escolha desta entrega, sem pedido explícito de
  produto — documentados aqui por serem decisão, não os únicos valores
  possíveis.
- **Participação, não papel — mesmo princípio de `PEND-01`/`PROD-01`, sem
  exceção para liderança.** `resolveParticipantPersonId` (refatorado de
  `assertParticipant`, que passa a chamá-lo) exige `GroupMembership` real na
  célula do encontro para *qualquer* papel, inclusive `cell_leader` — ao
  contrário de `findByGroup`, aqui não há bypass por
  `MEETING_PRIVILEGED_ROLES`. Um `cell_leader` só se auto-marca presente na
  própria célula porque também tem uma linha de `GroupMembership`
  (`role: leader`) nela; de qualquer outra, cai no mesmo 403 que um `member`
  qualquer.
- **Sem duplicar presença**: `checkin` confere `AttendanceRecord` existente
  (chave `group_meeting_id`+`person_id`) antes de criar e devolve
  `already_checked_in` em vez de tentar de novo — o `unique` da tabela já
  garantia a integridade, isto evita o 500 de violação de constraint.
- **RLS**: tabela nova, `018_rls_meeting_checkin_tokens.sql`, Padrão B — o
  mesmo de `012_rls_group_messages.sql`, já usado no módulo (congregação, sem
  `app_current_user() IS NOT NULL`, porque quem decide validade e
  participação é o `MeetingsService`, não a policy). Ligado no
  `bootstrap-db.sh` no mesmo lugar de 012/014/015/016 (nasce certa, sem
  `tenant_isolation` de 001 para o passo 4 derrubar) e com verificação
  própria no passo 7. `test/rls/meeting-checkin-tokens.spec.ts` (6 casos,
  mesmo roteiro de `networks.spec.ts`) prova o isolamento por congregação —
  a suíte de RLS fecha em **144 testes em 10 suítes** (a última contagem
  registrada aqui, 125 em 7, já estava desatualizada por `audit-writes.spec.ts`
  e `auth-tables.spec.ts`, que a varredura de 2026-09-15 não tinha contado;
  ficam registrados agora que apareceram). `PEND-08` (seção 7) documenta um
  alerta de portão que este arquivo dispara, deliberadamente aceito.
- **Tela**: só o lado do líder, no `apps/web`. `GroupDetailSheet`, aba
  "Reuniões", ganhou "Gerar código de check-in" dentro do encontro expandido
  (mesmo `canEdit` que já libera "Registrar reunião") — mostra o código e a
  validade, com botão de copiar e "Renovar". **É código em texto, não uma
  imagem de QR**: nenhuma das duas apps tem hoje um consumidor que escaneie
  algo (nenhuma biblioteca de QR no `apps/web`, nenhuma câmera integrada em
  lugar nenhum da base) — a especificação do item permite "QR (ou código)",
  e gerar uma imagem sem quem a leia seria trabalho sem uso imediato. **O
  lado do membro (escanear/informar o código) não entrou nesta sessão.**
  Mesma pergunta que o `PROD-25` já respondeu para inscrição em evento: o
  `apps/web` é `(admin)`/`(public)`, sem área de membro — não caberia lá — e
  o `apps/mobile` é onde o membro já consome conteúdo. Diferente do
  `PROD-25`, aqui a tela do membro não é só consumir uma API pronta: exigiria
  decidir entre digitar o código à mão ou apontar a câmera (novo pacote,
  `expo-camera` ou `expo-barcode-scanner`, com o mesmo custo de build nova —
  não OTA — que o `expo-clipboard` do `PROD-25` documentou), o que é escopo
  maior que "tela sobre API pronta". Fica para trabalho à parte; a API está
  pronta e testada para consumir de lá quando entrar.

Testes: `meetings.service.spec.ts` (`createCheckinToken` e `checkin` — 8
casos novos, incluindo o encontro velho demais para gerar QR, token expirado,
não-membro com token válido e não-duplicação) e `meetings.controller.spec.ts`
(papéis dos dois endpoints novos e delegação), além de
`meeting-checkin.dto.spec.ts`. `GroupDetailSheet.test.tsx` ganhou 3 casos
(gera e renova, erro de rede sem travar a tela, botão ausente sem `canEdit`).
Nenhuma suíte existente mudou de comportamento.

---

## 7. Pendências de código

### ~~PEND-01 · `small-groups` não confere participação real~~ · fechado

Fechado em 2026-09-12: `MeetingsController.findByGroup` e
`MeetingsService.listMaterials` agora exigem `GroupMembership` real via
`MeetingsService.assertParticipant` (resolve o `person_id` da conta
autenticada, mesmo padrão do `PrayerRequestsService.requireMembership` da
`PROD-01`), mas **com** exceção de papel — diferente da referência dos
pedidos de oração. A pergunta que ficava em aberto ("quais papéis de
liderança mantêm a visão de grupo que não lideram") foi respondida mantendo
o comportamento já registrado em produção: `tenant_admin`,
`admin_congregation`, `pastor`, `secretary`, `cell_leader` e `treasurer`
continuam vendo grupos que não lideram; só quem só tem `member` precisa da
participação real. Diferente dos pedidos de oração, que não tinham
comportamento anterior para quebrar.

### ~~PEND-02 · Vocabulário de status do `apps/admin` ≠ `PlanStatus` da API~~ · fechado

Fechado em 2026-09-13: os seis literais de `apps/admin/src/app/(platform)/tenants/page.tsx`
(o tipo `Tenant.plan_status`, `STATUS_LABELS` e `STATUS_CLS`) trocaram
`past_due`/`canceled` por `suspended`/`cancelled`, batendo com o enum
`PlanStatus` do schema. Rótulo de `suspended` ficou "Suspenso" — não havia um
rótulo anterior para esse valor, porque ele nunca tinha renderizado direito.
`page.test.tsx` ajustado para os literais corretos.

O botão de cancelar/reativar no console e o teste que trava o mapa contra o
enum (como `permissions.test.ts` faz no web) ficaram de fora — não é o mesmo
achado, é trabalho novo; abrir como pendência própria se for para frente.

### ~~PEND-03 · O front duplica as listas de papéis da API~~ · fechado

Fechado no PR #75, em 2026-09-11, exatamente pela "forma certa" que este
documento descrevia: `apps/api/src/auth/product-areas.ts` passa a ser o dono
de "quem lê cada área", `GET /me/permissions` responde a partir dele, e o
`apps/web` parou de manter a sétima cópia em `src/lib/permissions.ts`.

O sinal que este item esperava — "a primeira vez que alguém mexer no `@Roles`
e esquecer do `permissions.ts`" — não precisou chegar.

### PEND-04 · Resíduos de RLS abertos por desenho · dívida

- **`user_accounts` e `role_assignments` seguem com `orbien_app_auth
  USING (true)` na LEITURA.** A escrita fechou em 2026-09-16 (ação B) e
  `audit_logs` saiu da policy (ação A) — ver o registro no fim do item. O que
  resta é o `USING (true)`: quem lê por esse caminho lê as linhas de todos os
  tenants. Fechar isso é a ação D, e exige mover as leituras do login para
  função `SECURITY DEFINER`.
- **Nenhuma tabela de plataforma tem `FORCE ROW LEVEL SECURITY`.** O dono
  (`postgres`, que é o `prisma.system`) passa por cima — é o mesmo desenho do
  `fix_rls_enforcement`, e é o que permite o `seed.ts` existir.
- **Rate limit de login por IP** depende de `X-Forwarded-For` confiável atrás
  do Render. O recorte por origem fechou em 2026-09-07 com
  `app.set('trust proxy', 1)`; o que resta é decisão de infra, não código.

**Revisitado em 2026-09-13, sem mudança de código.** Dos três pontos, dois
não são código (rate limit é infra) e o terceiro segue exatamente como o
texto acima descreve: mapear o que `AuthService`/`JwtStrategy` de fato leem
antes do `SET LOCAL ROLE` para trocar `USING (true)` por um `USING` que só
libera essas colunas — não as linhas inteiras — é auditoria de segurança do
caminho de login, não um fix de uma tarde, e um `USING` errado quebra login
em produção sem aviso. Ficou como pergunta, não decisão: seguir com o
`USING (true)` conhecido, ou priorizar esse mapeamento como trabalho próprio
antes de mexer na policy?

**Mapeamento feito em 2026-09-16** (sem mudança de código — o item continua
aberto, isto só troca a suposição por evidência). Três achados que mudam o
enquadramento do ponto acima:

- **O alcance não é só o login.** `JwtStrategy.validate()`
  (`apps/api/src/auth/strategies/jwt.strategy.ts:22`) roda como `orbien_app`
  em **toda** requisição autenticada, não só no login — porque usa o client
  Prisma base (`this.prisma.userAccount`), que não entra na transação em que
  o `TenantContextInterceptor` faz `SET LOCAL ROLE app_user`; Guards rodam
  antes de Interceptors no ciclo do Nest. `AuthService.impersonate()`
  (`auth.service.ts:361`) tem o mesmo problema. É estrutural: qualquer método
  de `AuthService`/`JwtStrategy` que use o client base em vez de
  `this.prisma.client` roda como `orbien_app` por construção, não só "antes
  de existir contexto".
- **A policy é `FOR ALL`/`WITH CHECK (true)`, não só leitura.** Está em
  `20260608175621_fix_orbien_app_auth_policies` (migration datada normal,
  histórico do Prisma — não um dos scripts `0NN_rls_*.sql`), em 7 tabelas:
  `tenants`, `congregations`, `user_accounts`, `role_assignments`,
  `refresh_tokens`, `branding_configs`, `tenant_plans`, `audit_logs`. Busca
  por escrita via client base a `user_accounts`/`role_assignments`/
  `audit_logs` não achou nenhuma ocorrência — o `WITH CHECK (true)` nessas
  três é permissão morta hoje, mas aberta no banco.
- **`audit_logs` não parece ter consumidor real da policy no fluxo de
  auth.** A escrita de auditoria vai por `audit_insert()` (`SECURITY
  DEFINER`, ignora RLS); nenhuma leitura/escrita direta a `audit_logs` foi
  encontrada em `auth.service.ts`/`jwt.strategy.ts`. É candidato a ser o
  ponto mais barato de apertar primeiro, possivelmente sem o mapeamento fino
  que as outras duas tabelas exigem.

Proposta que ficou registrada: `GRANT SELECT` restrito às colunas que o login
de fato consome em `user_accounts`
(`id`/`email`/`password_hash`/`is_active`/`tenant_id`/`congregation_id`) e
`role_assignments` (`role_code`/`congregation_id`/`user_account_id`); trocar
`FOR ALL` por `FOR SELECT` fecha a escrita morta; restringir por **linha**
(não só coluna) exigiria mover essas leituras para uma função
`SECURITY DEFINER` — mudança de arquitetura, maior que fechar a escrita ou a
coluna.

**Ações A e B aplicadas em 2026-09-16** (`017_rls_auth_tables.sql`,
`test/rls/auth-tables.spec.ts`, passo 7 do `bootstrap-db.sh`). `audit_logs`
saiu inteira da policy; `user_accounts` e `role_assignments` passaram de
`FOR ALL` para `FOR SELECT`, sem `WITH CHECK`. As ações C e D seguem abertas,
com o enquadramento corrigido abaixo. As duas pontas não verificadas
fecharam, as duas negativas:

- **Nenhum script numerado recria a policy.** `orbien_app_auth` só existia na
  migration datada; as citações em `001_rls_setup.sql:495` e
  `013_rls_small_groups_public.sql:37` são comentário. O estado do banco
  conferia com o texto da migration — oito tabelas, `cmd=ALL`, `qual=true`,
  `with_check=true`, `relforcerowsecurity=f`.
- **Nenhuma escrita por `$executeRaw` fora do client base.** O único raw que
  alcança `audit_logs` é `audit.interceptor.ts:113`, via `audit_insert()`, e
  o nome do ator por `resolve_actor_name()` — as duas `SECURITY DEFINER`.

Três correções ao mapeamento, achadas ao aplicar:

- **A escrita não era toda morta.** `refresh_tokens` tem INSERT e UPDATE vivos
  pelo client base (`auth.service.ts:254`, `:283`, `:293`, `:327`, `:478`) —
  login, refresh e logout. O `FOR SELECT` vale nas três tabelas do texto
  acima; estendido às sete, derruba a autenticação. O passo 7 do
  `bootstrap-db.sh` passou a falhar nos **dois** sentidos: se a policy voltar
  a `FOR ALL` onde foi apertada, e se sumir de `refresh_tokens`.
- **A ação C (coluna) não é "sem tocar em código".** As quatro consultas do
  login usam `include:`, não `select:` (`auth.service.ts:110`, `:190`,
  `:238`, `:371`), e `include` faz o Prisma pedir **todas** as colunas
  escalares do model — de `user_accounts`, `tenants` e `tenant_plans`. Com a
  lista de colunas proposta, todo login falharia com 42501. Trocar esses
  quatro `include` por `select` explícito é **pré-requisito** de C.
  `role_assignments` e `jwt.strategy.ts:22` já usam `select`.
- **O alcance já passou de auth, e não é "rota pública futura".**
  `public-small-groups.service.ts:163` e `:168` leem `tenants` e
  `branding_configs` pelo client base, sem JWT e sem `SET LOCAL ROLE` — o
  `runInTx` de lá só fixa `app.tenant_id`. São quatro tabelas com consumidor
  público hoje (`tenants`, `congregations`, `branding_configs`,
  `tenant_plans`), e é por isso que nenhuma delas entrou em A/B.

O `017` declara a policy nas **oito** tabelas, não só nas três que muda. Não é
estilo: a policy nasceu numa migration datada, que `migrate deploy` aplica uma
vez só — num banco já provisionado o `bootstrap-db.sh` não teria por onde
recriá-la se fosse derrubada, e o portão do passo 7 falharia sem conserto
possível a não ser SQL manual. Descoberto ao testar o portão de propósito.

Continua em aberto, como pergunta: priorizar **C** (trocar os `include` por
`select` e restringir por coluna as quatro tabelas de consumidor público) ou
**D** (`SECURITY DEFINER`, restrição por linha) como trabalho próprio, ou
parar aqui — A e B fecharam a permissão sem chamador, e o que sobra é o
`USING (true)` de leitura, que é o desenho original do item.

### ~~PEND-05 · Três achados menores de PROD-20, declarados no PR~~ · fechado

Achados de `/code-review`+`pr-review` na feature `prod-20-multiplicacao-celula`
que o dev decidiu não bloquear o PR — nenhum era vazamento de isolamento nem
bug de produção. **Os três fecharam em 2026-09-16 (`70b62fa`)**, e a
verificação abaixo é contra a árvore, não contra a mensagem do commit:

- **`bootstrap-db.sh` passo 7 sem assertiva SQL dedicada para `networks`.** O
  catch-all genérico já cobria ausência total de RLS; o que faltava era a
  checagem de simetria específica, que pega um `USING`/`WITH CHECK` divergente
  escrito à mão numa mudança futura no `016_rls_networks.sql`. Entrou no mesmo
  formato das de 007–010/012 (nome da policy + `with_check IS NOT DISTINCT
  FROM qual`).
- **`MultiplyGroupModal` e `NetworkFormModal` engoliam erro ao carregar
  pessoas** (`.catch(() => {})` no `GET /persons`), e
  `apps/web/src/app/(admin)/redes/page.tsx` (`loadManageGroups`) fazia o mesmo
  com `GET /small-groups`. Não resta nenhum `.catch(() => {})` nos três
  arquivos.
- **Sem cobertura E2E** para os dois fluxos de escrita novos. Existem agora
  `apps/web/e2e/multiplicar-celula.spec.ts` e `apps/web/e2e/redes.spec.ts` —
  é o e2e que o item pedia, e que o PR #95 (cobertura de componente) não
  entregava.

### ~~PEND-06 · Alerta de ausência ignora quem entrou depois~~ · fechado

Nasceu e fechou em 2026-09-16, dentro do `PROD-11`. `checkAbsenceAlerts`
(rota) e `SmallGroupsAbsenceNotifier` (job semanal) contavam como ausente
todo membro sem `attendance_records` nas 3 últimas reuniões da célula —
**inclusive quem entrou depois delas**. Membro adicionado hoje entraria no
alerta de segunda-feira como se tivesse faltado três vezes.

Apresentado como achado antes de fechar o `PROD-11`, como manda o
`CLAUDE.md` — muda o que a rota responde, que é comportamento em produção —
e o dev respondeu ajustar antes. A janela passou a ser **por membro**: só
reunião com `occurred_at >= group_memberships.joined_at`, e a mesma condição
no lado da presença, para que presença anterior à entrada não conte como
presença (nem a falta dela como falta). Membro sem nenhuma reunião aplicável
sai do alerta.

Mudou nos dois lugares na mesma alteração, que era a exigência: corrigir só
um lado reintroduziria a divergência que o cabeçalho do notifier proíbe. É
o que `test/integration/small-groups-absence-alerts.spec.ts` agora mede —
ver a nota do `PROD-11` na seção 6.

### PEND-07 · O QR do PIX da inscrição só existe na resposta do POST · dívida

Nasceu declarada no `PROD-25` (2026-09-16), com a limitação escrita na
própria tela — não é achado que sobrou de revisão. Nasceu como `PEND-06`
e foi renumerada no merge com a `main`: o `PROD-11` fechou um `PEND-06`
próprio no mesmo dia, em outra branch, e ID não se recicla.

`POST .../registrations/me` devolve `{ registration, payment }` em evento
pago, e o `payment.qr_code`/`qr_code_image` **só existe ali**: `GET
.../registrations/me` devolve a linha de `event_registrations`, que guarda
`pix_payment_id` mas não o payload. Quem gera o QR e sai da tela antes de
pagar não tem como voltar a ele.

O contorno em produção funciona e está dito em tela ("cancele a inscrição e
inscreva-se de novo para gerar outro") — cancelar solta o `identity` que
bloquearia a segunda tentativa, e a nova gera outro QR válido por 24h. O
custo é uma cobrança órfã na Asaas por tentativa abandonada.

A correção é de backend, não de tela: expor o `qr_code` do `PixPayment`
ligado à inscrição em `findMine` quando `status = pending_payment` e o QR
ainda estiver dentro da janela de 24h. Fora do escopo do `PROD-25`, que é
tela sobre API pronta.

### PEND-08 · `pre-push.sh` só reconhece `test/rls/isolation.spec.ts` · dívida

Achado do próprio portão ao fechar `PROD-12` (2026-09-20), aceito sem ajuste
— registrado por escrito em vez de corrigido por conta própria, como o
`CLAUDE.md` pede para alerta de portão.

O passo "tabela nova exige RLS e teste de isolamento"
(`scripts/pre-push.sh:93-105`) confere ENABLE ROW LEVEL SECURITY em qualquer
script `0NN_rls_*.sql` — isso funciona —, mas o caso de teste só procura o
nome da tabela (ou seu delegate Prisma) dentro de **um arquivo fixo**,
`test/rls/isolation.spec.ts`. Desde que o módulo passou a preferir um arquivo
dedicado por tabela nova (`networks.spec.ts`, `event-registrations.spec.ts`,
agora `meeting-checkin-tokens.spec.ts`), esse caminho ficou incompleto: o
alerta dispara mesmo com isolamento provado, só que no arquivo errado.

Evidência: `networks` (`PROD-20`, 2026-09-15) já dispara o mesmo alerta hoje
— zero ocorrências de `network` em `isolation.spec.ts` — e nunca foi
registrado como pendência; `event_registrations` (`PROD-16`) tem os dois,
arquivo dedicado **e** um caso em `isolation.spec.ts`, então não dispara.
`meeting_checkin_tokens` (`PROD-12`) segue o padrão de `networks`: só arquivo
dedicado, então também dispara.

Decisão desta sessão: não editar `pre-push.sh` fora do que foi pedido. É
alerta, não bloqueio (`alerta`, não `bloqueia`), e a suíte dedicada prova o
isolamento de verdade — o portão está incompleto, não errado. Corrigir
precisaria decidir entre estender a lista de arquivos que o `grep` varre ou
aceitar duplicar o caso em `isolation.spec.ts` como `event_registrations`
faz; as duas têm custo (a primeira mexe num script comum a todo o time, a
segunda é o retrabalho que motivou ter arquivo dedicado). Fica para quem
decidir se vale ajustar o script ou vale mais duplicar o caso.

---

## 8. Ajustes — documento, rótulo e portão

Nenhum muda comportamento. Todos são documento ou rótulo divergindo do que a
árvore mede — exatamente o que a feature `mapa-monorepo-e-portoes` nasceu para
caçar, e o que sobrou declarado da rodada 3 do Verifier.

Nenhum item pendente: `AJU-07`, o último em aberto, fechou em 2026-09-16.

### ~~AJU-07 · `scripts/pre-push.sh` imprimia "118 testes de RLS"~~ · fechado

Terceira ocorrência da mesma deriva que `AJU-01`/`AJU-02` já tinham fechado
duas vezes: `scripts/pre-push.sh:149` imprimia `passa "118 testes de RLS"`
enquanto a suíte fechava em 125 — o `016_rls_networks.sql` e o
`test/rls/networks.spec.ts` do `PROD-20` (2026-09-15) mudaram o número.

Era rótulo, não comportamento: o `passa`/`bloqueia` sempre veio do código de
saída do Jest, não da contagem, então o portão decidia certo e só reportava
errado.

**Fechado em 2026-09-16 (`70b62fa`), pela saída que o item preferia:** o
literal saiu, e `scripts/pre-push.sh:152` passou a ler `Tests: N passed` da
própria saída do Jest (`RLS_SUMMARY`), com fallback para "testes de RLS" se o
`grep` não achar a linha. A pergunta que o item carregava — se valia seguir
escrevendo contagem literal num portão que a envelhece a cada feature com
tabela nova — ficou respondida na prática: a quarta deriva não chegou a
existir. Quando `test/rls/auth-tables.spec.ts` (`PEND-04`, ações A e B) levou
a suíte de 125 para 133 no mesmo dia, o `pre-push.sh` acompanhou sozinho, e
só as contagens de `docs/PLANO.md` e `docs/TESTES.md` precisaram de mão.

> `AJU-05` está na seção 5 (mobile), junto do resto do que falta para a loja.

> **`AJU-01`, `AJU-02` e `AJU-03` fecharam em 2026-09-14.** Os três eram só
> rótulo desatualizado, sem mudança de comportamento: `scripts/pre-push.sh:149`
> passou a imprimir "118 testes de RLS" (era "39 testes de RLS"); em
> `docs/TESTES.md`, as menções não-datadas de contagem de RLS em `:236`, `:334`
> e no bloco de comandos da Fase 13 (a mensagem "39, depois 54 — a suíte
> cresceu desde então") foram para 118, e a de e2e do web foi de "12 testes em
> 8 arquivos" para "16 testes em 10 arquivos". A linha `:53` ("Ponto de partida
> medido em 2026-09-02: 1 suíte na API, 39 testes de RLS") ficou como estava —
> é medição histórica datada, não contagem corrente, e "corrigi-la" para 118
> reescreveria o passado.

> **`AJU-06` fechou em 2026-09-13.** A tabela de traceability de
> `.specs/features/mapa-monorepo-e-portoes/spec.md` agora diz o que a rodada
> 3 do Verifier apurou: MAP-01…MAP-09 `✅ Verified`, MAP-10 `❌ Needs Fix`
> (com o motivo e o `file:line` dos gaps, ver `validation.md` daquela
> feature). MAP-10 em si continua aberto — o item fechado era só o board
> mentir sobre o estado.

> **`AJU-04`, retomado em 2026-09-12** (tentando corrigir o build do
> `orbien-admin` para o portão de PROD-10): o mesmo crash —
> `TypeError: Cannot read properties of null (reading 'useContext')`
> pré-renderizando `/_global-error` — reproduz isolado em `orbien-web`,
> `orbien-site` e `orbien-admin`, com e sem `--force`, contradizendo o "exit
> 0" medido em 2026-09-10. Achados novos desta rodada:
> - **Confirmado como bug aberto do próprio Next 16.2.x/16.3.x, não deste
>   repositório** — é a issue [vercel/next.js#95741](https://github.com/vercel/next.js/issues/95741)
>   (mesmas versões, 16.2.6/16.2.10, mesmo erro), com a mesma causa já
>   isolada na Fase 10 de `docs/TESTES.md`: race condition do Turbopack ao
>   agrupar rotas não relacionadas num mesmo passo de render. A issue segue
>   sem fix — fechada por "sem link de reprodução válido" apesar de ter um,
>   e outras do mesmo sintoma (#86178, #84994, #85668) fecharam do mesmo
>   jeito.
> - **Bump para `16.3.5`** (a última estável, testado via `npm install
>   next@16.3.5 --no-save` e revertido com `npm ci` depois) **reproduz
>   igual** — a Fase 10 já tinha testado até `16.3.4`; a família 16.x inteira
>   segue afetada.
> - `--debug-prerender` (flag nova, não testada na Fase 10) faz o build
>   passar, mas troca `NODE_ENV` para `development` e desliga minificação —
>   não serve para build de produção real, só confirma que o problema é de
>   agendamento do prerender.
> - Isolar só `experimental.prerenderEarlyExit: false` (a causa que o
>   `--debug-prerender` aponta) **piora**: em vez de só `/_global-error`,
>   todas as rotas do `orbien-admin` passam a falhar com o mesmo erro. Testado
>   e revertido — não é workaround viável.
> - `orbien-admin` e `orbien-site` não tinham `app/global-error.tsx`
>   (`orbien-web` já tinha, da própria Fase 10). Adicionado aos dois agora,
>   com teste — é a prática recomendada pelo Next e os três apps deveriam ter
>   de qualquer forma, mas **não corrige o build**, como a Fase 10 já tinha
>   provado para o `web`.
>
> Não há workaround de código para o crash em si. O board do Vercel/Next não
> aponta correção.
>
> **Resolvido em 2026-09-12, no próprio PR #84:** o build real da Vercel
> passou — `orbien-web` saiu como `Ready` (deploy de preview concluído) no
> commit que inclui exatamente o código que trava `next build` local neste
> sandbox. Confirma que o crash é específico deste ambiente de
> desenvolvimento/CI (a mesma classe de corrida de scheduling do Turbopack
> que a issue upstream descreve, sensível a como o build é agendado —
> `--debug-prerender` já apontava nessa direção). **`scripts/pre-push.sh`
> não deveria mais bloquear o push por isso** — o build real de produção não
> quebra. Ação que falta: trocar o `bloqueia` de `npx turbo run build` por
> `alerta` especificamente para o padrão desse crash (prerender de
> `/_global-error`/`/_not-found`), mantendo bloqueio para qualquer outra
> falha de build.
>
> **`AJU-04` fechou em 2026-09-13** — essa ação foi feita:
> `scripts/pre-push.sh` grifa a saída do build por
> `Cannot read properties of null (reading 'useContext')` junto de
> `/_global-error`/`/_not-found` antes de decidir; batendo o padrão, vira
> `alerta` (com o link da issue upstream); qualquer outra falha de build
> continua `bloqueia`. O bug do Next em si segue aberto e sem fix — o que
> fechou foi só o portão bloquear o push por ele.

O buraco do portão que a mesma rodada apontou — `scripts/pre-push.sh` sem
`mobile` na alternação da regra de fronteira — **fechou** em `08e0640`, junto
das três contradições de `docs/TESTES.md`.

---

## 9. Decisões de produto em aberto

Estes dependem de uma decisão explícita antes de virar trabalho. Não são
compromissos: são o que o material de produto deixa em aberto.

### ~~DEC-06 · Onde os testes rodam e sobre qual tenant~~ · decidido e executado

Decidido em 2026-09-17, junto com o `PROD-23`: **só `teste1-church` e
`teste2-church` podem ser usados para teste**, em qualquer ambiente, produção
inclusive. Nenhum outro tenant — `doca-church` é a igreja do cliente zero, e
teste que a toca é incidente, não teste. A regra está em `/CLAUDE.md` e
detalhada em `docs/AMBIENTES.md`, que passa a ser a fonte única sobre
ambientes, contas e credenciais.

Três consequências que já entraram:

- **`apps/api/prisma/seed.ts` cria os três tenants**, não mais um só. A criação
  virou `seedTenant(spec)` sobre uma lista — os de teste nascem com celebração,
  ministério e voluntários, o mesmo mínimo que a suíte de e2e precisa, para que
  nenhum spec tenha motivo de procurar dado noutro tenant. `fvargaspf@gmail.com`
  passa a acumular `tenant_admin` do `doca-church` **e** `platform_support`;
  `fernando.vargas@fill.tech` fica como conta quebra-vidro da plataforma.
- **O CI ganhou `e2e-prod`**, rodando a mesma suíte contra
  `web.useorbien.com` sobre `teste1-church`. Não substitui o `e2e` local, que
  segue provando a suíte contra banco limpo — e `needs: [e2e]` garante que
  produção só é tocada depois que o job determinístico passou. É o primeiro job
  do repositório que precisa de secret, o que quebra o "PR de fork roda igual"
  do cabeçalho do workflow: `e2e-prod` se pula em fork, porque secret não chega lá.
- **Dois scripts novos**: `scripts/provisionar-tenants-teste.sh` (cria os dois
  em produção por `POST /platform/tenants`, a rota atômica — não por SQL) e
  `scripts/limpar-tenant.sh` (esvazia um tenant preservando plano, branding,
  congregações, plano de contas de sistema e as contas indicadas, com a mesma
  senha). O segundo descobre as tabelas do catálogo, não de lista escrita à
  mão: são 66 tabelas com `tenant_id` hoje e a lista cresce a cada migration.

### ~~DEC-01 · Gating por plano~~ · decidido e executado

Decidido em 2026-09-12: implementar tudo que a matriz Starter × Premium já
tem código para gatear, sem inventar gate para `PROD-`/`DEC-` que ainda não
tem funcionalidade nenhuma por trás.

- `PlanGuard` + `@RequiresPlan('premium')` (mesmo formato de
  `@Roles`/`RolesGuard`), lendo `user.plan` do token.
- Módulo Celebrações/OC inteiro vira Premium — 9 controllers. A área
  `celebrations` sai de `GET /me/permissions` para tenant Starter, e a
  sidebar do `apps/web` já para de mostrar o link sem mudança nenhuma no
  front (reaproveita `isForbidden`/`NoAccessState`, que já tratam 403
  genérico).
- Financeiro: DRE, exportação contábil (CSV/OFX/PDF/ZIP/SPED), forecast e
  PIX cenário 2 (dinâmico) viram Premium; dashboard semanal e PIX cenário
  1/3 continuam nos dois planos.
- Teto de 300 membros ativos do Starter (`MemberCapService`), conferido nos
  três pontos onde uma `Person` pode virar `member` — consulta o plano no
  banco, não na claim do token, por ser limite de negócio, não de sessão.

**O que ficou de fora, e por quê:** o resto da matriz não tem código para
gatear — não é gate pendente, é feature pendente (ver os `PROD-` marcados
Premium na seção 6). `POST /internal/celebrations/*` (scheduler,
`platform_support`) ficou fora de propósito: roda entre tenants, não é
acesso de cliente.

**Risco conhecido, não verificado:** o gate assume que o cliente zero (Doca
Church) está em Premium, como o `prisma/seed.ts` registra — não há acesso ao
banco de produção nesta sessão para confirmar que o `TenantPlan` real bate
com isso. Se divergir, o tenant real perde acesso ao módulo de Celebrações
que já usa.

`DEC-03` continua condicionado a este item ter fechado.

### DEC-02 · White-label premium (build por tenant via EAS)

A arquitetura está pronta e é decisão registrada (AD-002 em `.specs/STATE.md`:
um só codebase, variantes por profile do EAS + `app.config.js` dinâmico). Falta
o pipeline de release por tenant e a submissão de loja por igreja — e o Starter
chegar às lojas antes, o que depende da seção 5.

### DEC-05 · Granularidade de channel do OTA por tenant

A infra básica de `expo-updates` está pronta (`PROD-15`, seção 5): um
channel por build profile (`development`/`preview`/`production`), que cobre
a variante genérica multi-tenant de hoje. Quando `DEC-02` sair do papel e
existir build própria por tenant via EAS, falta decidir se cada tenant
personalizado ganha o próprio channel (isolamento total — um update pensado
pro app genérico nunca alcança uma build de tenant) ou se channel continua
por profile e a distinção fica só na build (mais simples, mas um update teria
que ser compatível com todo tenant que escuta aquele channel). Condicionado a
`DEC-02` ter pipeline de release por tenant definido.

### DEC-03 · Primeiro cliente Premium fora do cliente zero

Condicionado ao fechamento do ciclo de conformidade e ao `DEC-01`.

### DEC-04 · Diferenciais de IA

Cuidado pastoral preditivo, classificação de doações, projeção financeira —
listados na tabela comparativa de `produto-gestao-igrejas-mvp.md` (seção 5).
Nenhum tem desenho técnico.

---

## 10. Como manter este documento

- **Item novo nasce aqui**, com ID no próximo número livre do seu prefixo. ID
  não se recicla: item fechado sai da lista, o número não volta.
- **Ao fechar**, remova o item e registre no commit o que foi decidido —
  inclusive quando a decisão for aceitar o comportamento atual. Se o achado
  tiver história que vale guardar (evidência, diagnóstico, incidente), o lugar
  dela é `PENDENCIAS.md`, como as dez numeradas originais.
- **Achado de revisão ou alerta de portão vira pergunta, não decisão
  unilateral** — a regra do `CLAUDE.md` vale aqui: apresente o achado com a
  evidência e pergunte se segue assim ou ajusta antes.
- Não duplique aqui o detalhe de portão de CI ou de plano de testes: isso mora
  em `CI.md` e `TESTES.md`. Este documento é sobre o que falta, não sobre como
  o portão funciona.
