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

Última varredura completa contra a `main`: **2026-09-12** (revista depois dos
PRs #74, #75 e #76, que entraram no mesmo dia).

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
| Módulo 4 — Conteúdos e Notificações | Entregue — posts, notificações, segmentação básica, métricas da OneSignal |
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

### Funcionalidade prevista, sem código

| ID | Módulo | Funcionalidade | Plano | Nota |
|---|---|---|---|---|
| `PROD-04` | 2 | Página pública de doação (Cenário 3) | Starter | **A API está pronta** — `POST /financial/pix/public-donation`, público e com throttle. Não há tela em `apps/web` nem em `apps/site` que a chame |
| `PROD-05` | 1 | Sugestão automática de escala por disponibilidade e rodízio | Premium | Existia no sistema antigo (`/volunteers/schedules/.../suggest`) e saiu junto com ele; `CelebrationSchedule` nunca teve |
| `PROD-06` | 1 | Fila CRM de trials não convertidos e inadimplentes | Premium | — |
| `PROD-07` | 2 | Conciliação bancária (importar OFX) | Premium | O OFX que existe é de **exportação** contábil |
| `PROD-08` | 2 | Carnê do dizimista / relatório anual para IR | Premium | — |
| `PROD-09` | 3 | Chat fechado por célula | Starter | — |
| `PROD-11` | 3 | Alerta de ausência consecutiva para o líder | Starter | — |
| `PROD-12` | 3 | Check-in de membros por QR no encontro | Starter | `QrToken` é do cadastro de visitante; presença de encontro é lista manual (`createMany`) |
| `PROD-13` | 3 | "Encontre uma célula" (mapa público, filtros, botão visitar) | Starter | `SmallGroup.is_public` existe e é filtrável, mas não há rota pública nem tela |
| `PROD-15` | 3 | Multiplicação de célula, árvore genealógica, semáforo de saúde, metas por rede | Starter (multiplicação) / Premium (resto) | — |
| `PROD-16` | 4 | Evento com inscrição | Starter (sem pagamento) / Premium (com) | `ContentPostType.event` existe como tipo de post; não há modelo de inscrição |
| `PROD-17` | 4 | Segmentação avançada (comportamento, engajamento, inativos) | Premium | A básica existe (`AudienceSegment`) |
| `PROD-18` | Plataforma | OTA via Expo Updates | Starter e Premium | `expo-updates` não está no `apps/mobile`; o ADR-004 prevê e o v1 adiou |
| `PROD-19` | Plataforma | Domínio próprio por tenant, termos de uso próprios por tenant | Premium | — |

**Conferido e entregue**, apesar de soar parecido com os de cima — para não
virar trabalho repetido: detecção de duplicados no cadastro e na importação,
métricas de notificação da OneSignal (`reached`/`opened`, sincronizadas), OC
imprimível em PDF, exportação contábil OFX, forecast financeiro, PIX nos três
cenários com webhook da Asaas, e o indicador de abertura de material por
membro.

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

### PEND-02 · Vocabulário de status do `apps/admin` ≠ `PlanStatus` da API · defeito

`PlanStatus` (`apps/api/prisma/schema.prisma:1400-1405`) tem `active`, `trial`,
`suspended` e `cancelled`, e é o valor cru que `ListTenantsService` devolve
(`list-tenants.service.ts:88`). A lista de tenants do console declara outros
quatro — `trial`, `active`, `past_due`, `canceled` — nos três lugares em que
trata status: o tipo (`apps/admin/src/app/(platform)/tenants/page.tsx:20`),
`STATUS_LABELS` (`:35`) e `STATUS_CLS` (`:42`).

São duas divergências: `canceled` × `cancelled` (um `l` a menos) e `past_due` ×
`suspended` (nome que não existe no enum). Nos dois casos o selo renderiza
vazio e sem cor, porque o `if` da linha `:159` testa só se `plan_status` é
truthy. O tipo do `page.tsx` não protege: é escrito à mão, e o `apps/admin`
não pode importar de `apps/api`.

Só virou alcançável quando `POST /platform/tenants/:id/cancel` nasceu
(2026-09-11): antes, nada colocava um `TenantPlan` em `cancelled`.

Fix: seis literais no `page.tsx`. Vale decidir junto se o console ganha o
botão de cancelar/reativar (hoje a rota só responde a chamada direta) e se um
teste trava o mapa contra o enum, como `permissions.test.ts` já faz no web com
os papéis do `seed.ts`.

### ~~PEND-03 · O front duplica as listas de papéis da API~~ · fechado

Fechado no PR #75, em 2026-09-11, exatamente pela "forma certa" que este
documento descrevia: `apps/api/src/auth/product-areas.ts` passa a ser o dono
de "quem lê cada área", `GET /me/permissions` responde a partir dele, e o
`apps/web` parou de manter a sétima cópia em `src/lib/permissions.ts`.

O sinal que este item esperava — "a primeira vez que alguém mexer no `@Roles`
e esquecer do `permissions.ts`" — não precisou chegar.

### PEND-04 · Resíduos de RLS abertos por desenho · dívida

- **`user_accounts`, `role_assignments` e `audit_logs` seguem com
  `orbien_app_auth USING (true)`.** Não incomoda nas rotas autenticadas (que
  rodam como `app_user`), mas qualquer rota pública futura que toque essas
  tabelas as lê inteiras. Fechar exige mapear o que o login precisa ler antes
  de existir contexto.
- **Nenhuma tabela de plataforma tem `FORCE ROW LEVEL SECURITY`.** O dono
  (`postgres`, que é o `prisma.system`) passa por cima — é o mesmo desenho do
  `fix_rls_enforcement`, e é o que permite o `seed.ts` existir.
- **Rate limit de login por IP** depende de `X-Forwarded-For` confiável atrás
  do Render. O recorte por origem fechou em 2026-09-07 com
  `app.set('trust proxy', 1)`; o que resta é decisão de infra, não código.

---

## 8. Ajustes — documento, rótulo e portão

Nenhum muda comportamento. Todos são documento ou rótulo divergindo do que a
árvore mede — exatamente o que a feature `mapa-monorepo-e-portoes` nasceu para
caçar, e o que sobrou declarado da rodada 3 do Verifier.

| ID | O quê | Onde | Medido hoje |
|---|---|---|---|
| `AJU-01` | Rótulo "39 testes de RLS" no portão de pre-push | `scripts/pre-push.sh:120` | 61 testes em 2 suítes |
| `AJU-02` | Contagem de RLS envelhecida | `docs/TESTES.md:53`, `:236`, `:334` dizem 39; `:1149`, `:1204` dizem 54 | 61 |
| `AJU-03` | Contagem de e2e do web envelhecida | `docs/TESTES.md:1153` diz 12 em 8 arquivos | 16 em 10 |
| `AJU-04` | "`turbo run build --filter=orbien-web` continua vermelho" | `docs/TESTES.md`, "Pendências abertas" | **Vermelho de novo em 2026-09-12, agora nos 3 apps Next** — ver nota abaixo |
| `AJU-06` | Os dez `MAP-NN` parados em "Implementing / Aguardando Verifier" | `.specs/features/mapa-monorepo-e-portoes/spec.md:226-235` | 9 verificados em 3 rodadas. Sugestão do relatório: MAP-01…09 ✅ Verified, MAP-10 ❌ Needs Fix |

> `AJU-05` está na seção 5 (mobile), junto do resto do que falta para a loja.

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

O buraco do portão que a mesma rodada apontou — `scripts/pre-push.sh` sem
`mobile` na alternação da regra de fronteira — **fechou** em `08e0640`, junto
das três contradições de `docs/TESTES.md`.

---

## 9. Decisões de produto em aberto

Estes dependem de uma decisão explícita antes de virar trabalho. Não são
compromissos: são o que o material de produto deixa em aberto.

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
