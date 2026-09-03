# Pendências

Achados mapeados, com a evidência que os produziu e o que foi decidido sobre
cada um. Nenhum foi corrigido por decisão unilateral — a regra do `CLAUDE.md` é
que achado de portão vira pergunta.

Origem: primeiro run de CI da história do repositório, no
[PR #1](https://github.com/Orbien-platform/orbien/pull/1)
([run 33669099196](https://github.com/Orbien-platform/orbien/actions/runs/33669099196)),
em 2026-09-02. O `ci.yml` estava entre os commits ainda não enviados para a
`main`, então nada disso tinha como aparecer antes.

| # | Pendência | Gravidade | Situação |
|---|---|---|---|
| 1 | RLS não isola por congregação dentro do mesmo tenant | segurança | ✔ fechada no código — **falta rodar o bootstrap em produção** |
| 2 | Lint do `site` quebrado no estado commitado | portão | ✔ fechada |
| 3 | E2E depende de dados que o seed não cria | portão | ✔ fechada — seed estendido |
| 4 | 6 mudanças de comportamento do `c84fc02` sem cobertura permanente | risco de regressão | ○ **aberta por decisão** |
| 5 | Lint em `apps/api` | portão | ✔ fechada — lint nos 3 apps, portão verde |

> Em 2026-09-03 as cinco foram revistas. A nº 4 e a nº 5 nasceram nessa
> revisão — a nº 4 já estava decidida como aberta e só não tinha registro
> escrito; a nº 5 apareceu ali. Quatro fecharam.
>
> **A única aberta é a nº 4**, cobertura de teste, deixada aberta por decisão
> do dev — não será executada agora. A nº 1 está fechada no código e tem um
> passo operacional pendente: rodar o `bootstrap-db.sh` contra o Supabase de
> produção.

O job `Unidade e cobertura` passou (53s). Nenhuma das três originais é causada
pela Fase 0 do [plano de testes](TESTES.md).

---

## 1. RLS não isolava por congregação — resolvido

**Diagnóstico original estava incompleto.** Ele concluiu que "as políticas de
RLS consideram `tenant_id` e não `congregation_id`". A conclusão é verdadeira
sobre o `001_rls_setup.sql`, e falsa sobre o banco: a migration
`20260608144811_fix_congregation_isolation_policies` faz
`DROP POLICY tenant_isolation` e cria `tenant_congregation_isolation` em 17
tabelas. A policy existe.

### Causa real: ordem no bootstrap

`scripts/bootstrap-db.sh` roda as migrations **antes** do `001_rls_setup.sql`,
porque o `001` precisa das tabelas existindo. Consequência: a migration remove
a policy fraca e cria a forte, e então o `001` recria a fraca por cima.
Policies `PERMISSIVE` se combinam com **OR** — a mais fraca ganha, e o
isolamento por congregação deixa de valer.

Medido em banco recém-provisionado: **15 tabelas** ficavam com as duas
policies, entre elas `persons`. No banco de desenvolvimento, só a forte existe
(o `001` foi aplicado antes da migration, na ordem histórica).

### Segundo defeito, encontrado no caminho

O `001` definia as funções de contexto lendo `app.current_tenant_id`,
`app.current_congregation_id` e `app.current_user_id`. O interceptor da
aplicação escreve `app.tenant_id`, `app.congregation_id` e `app.user_id` — e a
migration `20260608130316_fix_rls_enforcement` já corrigia isso, sendo também
sobrescrita pelo `001`.

Efeito num banco novo: as funções devolviam NULL, **toda** policy negava, e a
API respondia listas vazias sem erro nenhum. Foi o que fez a pendência nº 3
parecer só falta de dado de seed.

Os testes de RLS não pegavam porque `test/helpers/rls.ts` escreve as duas
grafias de chave.

### Correções

1. Passo novo no bootstrap: onde existe `tenant_congregation_isolation`, a
   `tenant_isolation` redundante é removida.
2. Asserção na verificação do bootstrap: se qualquer tabela ficar com as duas,
   falha alto. Testada nos dois sentidos.
3. `001_rls_setup.sql` alinhado às chaves que o interceptor escreve, com
   comentário explicando que divergir faz toda policy negar em silêncio.

### Evidência

Banco provisionado do zero com o bootstrap corrigido:

```
tabelas com as duas policies: 0
persons: tenant_congregation_isolation
Tests: 39 passed, 39 total
```

### Auditoria do alcance — 2026-09-03

A pergunta em aberto era: o teste prova o isolamento no **banco**; e as queries
que dependem de filtrar `congregation_id` no código? Auditado agora. Três
descobertas, em ordem de importância.

**1. A policy de congregação cobre 22 das 45 tabelas que têm
`congregation_id`.** As outras 23 têm só `tenant_isolation` — isolam tenant, não
congregação:

```
audience_segments        celebration_instances  celebrations
consent_records          content_posts          export_jobs
group_meeting_materials  group_types            import_jobs
ministries               notification_dispatches person_tags
prayer_requests          qr_tokens              role_assignments
service_order_items      service_orders         setlist_songs
setlists                 user_accounts          volunteer_ministries
volunteer_profiles       audit_logs
```

A cobertura vem de dois arquivos: 15 tabelas em
`20260608144811_fix_congregation_isolation_policies` e 7 em
`002_rls_celebration_schedules.sql`. `donation_receipts` e
`transaction_attachments` aparecem no primeiro arquivo mas são tenant-only de
propósito — não têm `congregation_id` (está comentado no SQL).

**2. Para `tenant_admin`, o banco não isola congregação — por desenho.** O
`USING` da policy forte é:

```sql
tenant_id = app_current_tenant()
AND (
  congregation_id = app_current_congregation()
  OR app_has_role('tenant_admin')
  OR app_has_role('denomination_admin')
)
```

Só o `WITH CHECK` (escrita) exige a congregação sem escapatória. Ou seja: para
os dois papéis administrativos, **leitura** entre congregações é permitida pelo
banco em todas as 45 tabelas, e o isolamento é inteiramente responsabilidade do
código. A conta que o seed cria e que o e2e usa é `tenant_admin` — então o e2e
nunca exercita o caminho em que o banco nega.

**3. No código, o padrão está certo — com uma exceção encontrada.** 42 dos 48
services citam `congregation_id`. Varredura de todas as queries Prisma nas 23
tabelas sem policy de congregação: 80 chamadas sem `congregation_id` no `where`
literal, das quais 16 sem nenhuma menção a congregação no método inteiro.
Triadas uma a uma, 15 das 16 são legítimas:

- globais por definição — `forgotPassword`/`resetPassword` buscam conta por
  e-mail; `resolvePersonId` e `resolveTenantAdmin` resolvem por id de usuário
  ou por tenant;
- cron sem contexto de requisição — `publishScheduledPosts`, `syncMetrics`,
  `celebration-scheduler`, os `markProcessing`/`markDone`/`markError` de job
  não têm congregação de onde partir;
- guardadas por leitura escopada anterior — `segments.update` e
  `segments.remove` chamam `findOne(id, user)`, que filtra tenant **e**
  congregação, antes de operar por id.

A exceção é real:

> **`MeetingsService.removeMaterial`** — `apps/api/src/small-groups/meetings.service.ts:205`
>
> Recebe só `meetingId` e `materialId`; o controller
> (`meetings.controller.ts:104`) não passa o `JwtPayload`. Busca o vínculo em
> `group_meeting_materials` — tabela **sem** policy de congregação — pela chave
> `(meeting_id, material_id)` e apaga. Não há leitura escopada antes.
>
> `addMaterial` e `listMaterials` no mesmo arquivo validam a reunião em
> `group_meetings`, que **tem** a policy forte; por isso criação e listagem
> estão cobertas e só a remoção escapa. Cross-tenant continua barrado pela
> policy de tenant. O que passa é cross-congregação dentro do mesmo tenant,
> para quem tenha `MATERIAL_WRITE_ROLES` e conheça os dois UUIDs.

### Decidido em 2026-09-03: tenant é a fronteira, congregação não

**As 23 tabelas ficam tenant-only de propósito.** O produto é white-label por
cliente; o cliente é o tenant, e é ele que precisa estar isolado. Decisão do
dev, registrada aqui para quem chegar depois não "corrigir" isso.

O que sustenta a decisão no estado atual do código:

- O JWT carrega **uma** congregação e não há seletor de congregação em lugar
  nenhum do `apps/web` — não existe fluxo em que um usuário troque de
  congregação dentro da sessão.
- O seed cria **uma** congregação por tenant.

O que a contradiz, e fica registrado como tensão conhecida:

- O cabeçalho do `schema.prisma` diz *"Multi-tenant 3 níveis"*, e as 45 tabelas
  carregam `congregation_id` — o nível foi desenhado como fronteira, não como
  rótulo.
- Existem dois papéis distintos no seed, `tenant_admin` e `admin_congregation`.
  A distinção só significa alguma coisa se congregação isolar.
- 22 tabelas **já têm** a policy forte. Se congregação não é fronteira, elas é
  que estão fora do padrão — e é justamente a policy forte que a pendência nº 1
  passou a fazer valer.

Consequência prática: enquanto um tenant tiver uma só congregação, os dois
modelos são indistinguíveis. A decisão só será testada quando existir cliente
com duas. **Se isso acontecer, releia esta seção antes de vender o segundo
campus.**

### As outras duas perguntas — resolvidas em 2026-09-03

1. ~~As 23 tabelas ficam tenant-only?~~ — **sim**, ver acima.
2. ~~O `OR app_has_role('tenant_admin')` é a política desejada?~~ — **sim, a
   cláusula fica**, e o entorno dela foi corrigido. Detalhe abaixo.
3. ~~`removeMaterial` valida a reunião?~~ — **corrigido.**

#### A cláusula está certa; o entorno não estava

`tenant_admin` é transversal às congregações do cliente por definição — é o que
o separa de `admin_congregation`, e é coerente com tenant ser a fronteira.
Mantida. Três defeitos ao redor dela, todos fechados.

**a) A escrita não acompanhava a leitura — confirmado com teste.**

`USING` abria exceção para `tenant_admin`; `WITH CHECK` não. Num `UPDATE` o
Postgres avalia os dois — `USING` na linha antiga, `WITH CHECK` na nova — então
o admin lia a linha da congregação irmã e falhava ao gravar.

Reproduzido contra Postgres 17 provisionado do zero pelo `bootstrap-db.sh`:

```
● 4b › tenant_admin na A-Main ATUALIZA pessoa da A-Second
  PostgresError { code: "42501",
    message: "new row violates row-level security policy for table \"persons\"" }
```

Corrigido por `prisma/migrations/003_rls_admin_write.sql`: o predicado de
congregação virou uma função, `app_congregation_allowed(TEXT)`, usada nos dois
lados da policy. O script percorre `pg_policies` e faz `ALTER POLICY` em toda
policy chamada `tenant_congregation_isolation` — as 22 de hoje e as que vierem
depois — em vez de repetir 22 blocos. Idempotente, e falha alto se não achar
nenhuma (sinal de que rodou fora de ordem).

**b) `denomination_admin` não existe** — o papel era citado em nove pontos de
`001`/`002` e não está na tabela `roles`; `role_assignments.role_code` é FK com
`RESTRICT`, então nenhuma atribuição podia tê-lo. O mesmo `ALTER POLICY` do
`003` reescreveu as policies sem a cláusula.

**c) O ramo do admin não era testado.** `app_has_role()` resolve o usuário por
`app.user_id`, e nem `runAsTenant` nem `runAsTenantWithRole` setavam essa
chave — `app_has_role()` devolvia sempre `false`, e os 39 testes exercitavam só
o ramo estrito. Correto, mas metade da policy.

Entrou o helper `runAsUser(tenantId, congregationId, userId)` em
`test/helpers/rls.ts` e o bloco `4b` no `isolation.spec.ts`, com três testes —
`tenant_admin` lê a congregação irmã, `admin_congregation` **não** lê, e
`tenant_admin` grava nela. O segundo é o que prova que alinhar o `WITH CHECK`
não afrouxou nada para quem não é admin.

**Duas asserções novas no `bootstrap-db.sh`**, no passo de verificação, ambas
testadas nos dois sentidos:

- nenhuma `tenant_congregation_isolation` pode ter `USING` diferente de
  `WITH CHECK` — quebrando uma policy de propósito, o bootstrap para com
  *"ha 1 policy(s) ... onde a escrita nao acompanha a leitura"*;
- nenhuma policy pode citar `denomination_admin`.

#### `removeMaterial` — corrigido

`MeetingsService.removeMaterial` agora lê a reunião em `group_meetings` — que
tem a policy de congregação — antes de apagar o vínculo em
`group_meeting_materials`, que só tem a de tenant. É o que `addMaterial` e
`listMaterials` já faziam; só a remoção escapava. O controller não precisou
mudar: quem barra é o RLS na leitura da reunião, não um parâmetro a mais.

#### Evidência final

Banco provisionado do zero, com o `003` na sequência:

```
▶ 3/7 → 001_rls_setup.sql → 002_rls_celebration_schedules.sql → 003_rls_admin_write.sql
▶ 6/7 Verificando...  (todas as asserções passaram)
Tests: 42 passed, 42 total
```

Eram 39. Os 3 novos são o bloco `4b`.

### Falta aplicar em produção

O código está fechado; o **banco de produção não**. Os scripts de RLS ficam
fora do histórico do Prisma e só o `bootstrap-db.sh` os aplica — o Supabase de
produção segue com as policies antigas até alguém rodar, da máquina local:

```bash
cd apps/api
DIRECT_URL='postgresql://postgres:<senha>@<host>:5432/postgres' \
ORBIEN_APP_PASSWORD='<senha-do-app>' \
bash scripts/bootstrap-db.sh
```

Idempotente, sem `--seed`. Enquanto não rodar, um `tenant_admin` que edite
registro de congregação irmã recebe 42501 em produção. Registrado também em
`DEPLOY.md`, seção 1.8.

---

## 2. Lint do `site` quebrado no estado commitado

**Resolvido** em `chore/harness-ci-e-lint`, commit `c84fc02` — *"fix(web,site):
zera os erros de lint sem alterar regra nem comportamento"*, 20 arquivos. Fica
registrado aqui porque o diagnóstico explica por que o portão passava na
máquina e falhava no CI. Enquanto o PR #1 esteve aberto, a correção não estava
na branch dele e o job `Build, tipos e lint` ficou vermelho por este motivo —
histórico, o PR foi mergeado.

### Evidência

```
✖ 12 problems (10 errors, 2 warnings)
```

Seis arquivos, todos em `apps/site/src/`:

- `app/login/page.tsx` — `Link` importado e não usado
- `components/funcionalidades/conteudos/ConteudosHero.tsx`
- `components/home/Credibility.tsx`
- `components/lgpd/LgpdContent.tsx`
- `components/precos/FeatureCompare.tsx`
- `components/sobre/EstagioAtual.tsx`

O grosso é `react/no-unescaped-entities`: aspas literais em JSX que precisam
virar `&quot;`.

### Por que passa na máquina e falha no CI

Os seis arquivos estão modificados no working tree local **sem commit**, e as
modificações são exatamente a correção. Exemplo, em `Credibility.tsx`:

```diff
-<span style={{ color: "var(--navy-accent)", fontWeight: 600 }}>"</span>
+<span style={{ color: "var(--navy-accent)", fontWeight: 600 }}>&quot;</span>
```

`npx turbo run lint` na máquina lê o working tree e passa; o CI lê o commit e
falha. Não é divergência de configuração de eslint entre os ambientes.

### O que restou

Nada. A ordem de merge que faltava resolveu-se sozinha: o PR #1 foi mergeado em
2026-09-03T00:43Z e `chore/harness-ci-e-lint` está inteiramente contida na
`main` (`git log main..origin/chore/harness-ci-e-lint` é vazio). Verificado em
2026-09-03: `npx turbo run lint` sai com código 0.

Mas a mesma verificação abriu a pendência nº 5 — o portão cobre 2 apps, não os
3 que o `docs/CI.md` afirmava.

---

## 3. E2E dependia de dados que o seed não criava — resolvido

Os dois specs falhavam por falta de dado, antes de tocar a tela: o seed não
criava celebração nem ministério.

**Mas isso era metade da causa.** Mesmo depois de estender o seed, a API
continuava devolvendo listas vazias — porque o defeito de chaves de contexto
descrito na pendência nº 1 fazia toda policy negar. O dado existia e o RLS o
escondia.

### Correções

- Seed estendido com uma celebração, um ministério e dois voluntários
  vinculados a ele (um líder, um comum).
- Perfil de voluntário para a **conta admin** também: a aba de
  indisponibilidade é visível para qualquer usuário logado, e
  `UnavailabilityService.resolveProfile` responde 404 para quem não tem perfil
  — a tela abria com erro para a própria conta que o e2e usa.
- `docs/CI.md` corrigido: ele afirmava que o seed carregava "ministérios e
  voluntários", o que era falso e foi a premissa que fez o job ser desenhado
  como autocontido.

### Evidência

API e web locais contra banco provisionado do zero, como o job faz:

```
/celebrations           1 item
/volunteers/ministries  1 item
/persons                4 itens
2 passed (5.3s)
```

### Nota histórica

O diagnóstico original propunha duas saídas — estender o seed ou fazer as
fixtures criarem tudo. A primeira foi escolhida: dado de base pertence ao seed,
dado efêmero às fixtures.

<!-- resto do diagnóstico original preservado abaixo -->

1. **Estender o seed** com uma celebração e ao menos um ministério com
   voluntário. Torna o e2e de fato autocontido, que era a intenção declarada.
   Custo: o seed passa a carregar dado de teste, o que é aceitável enquanto
   ele for só de CI e desenvolvimento.
2. **Os specs criarem o próprio fixture** via API antes de rodar. Mais
   isolado, mais lento, e `fixtures.ts` já faz metade disso — o
   `upcomingInstance` cria a instância, só não cria a celebração de base.

A opção 1 é a menor mudança; a 2 é a mais robusta. Nenhuma foi escolhida.

---

## 4. Seis mudanças de comportamento do `c84fc02` sem cobertura permanente

**Aberta por decisão, não por esquecimento.** Ficou registrada aqui em
2026-09-03 porque até então só existia na mensagem do commit — quem chegasse
depois não teria como saber que estas seis coisas mudaram.

O commit `c84fc02` — *"fix(web,site): zera os erros de lint sem alterar regra
nem comportamento"*, 20 arquivos — zerou 27 erros de lint por transformação
real, sem tocar config e sem adicionar nenhum `eslint-disable` (verificado:
`git show c84fc02 | grep '^+.*eslint-disable'` não devolve nada; o único
`exhaustive-deps` desativado em `PostDetailSheet.tsx` veio de `42e34fa`, antes).

O título diz "sem alterar comportamento" e isso é falso em seis pontos. Não
foram apresentadas uma a uma antes do push:

| # | Mudança | Como foi verificada |
|---|---|---|
| 1 | Resets de sheet migraram da abertura para o fechamento | navegador |
| 2 | Recarga após mutação incrementa um tick em vez de aguardar o load | navegador |
| 3 | Cancelamento em todos os loads convertidos (resposta antiga não sobrescreve estado novo) | navegador |
| 4 | Contador `fetchRef` de grupos e pessoas substituído pelo cancelamento | spec temporário |
| 5 | Criar registro em conteúdo/grupos/pessoas: 2 fetches → 1 | spec temporário |
| 6 | Removido o effect que pré-preenchia o mapa de presença no `RegisterMeetingModal` | equivalência por leitura |

Conteúdo, grupos e pessoas foram verificadas com specs temporários, que não
ficaram. As três telas não têm cobertura de e2e permanente — nenhuma das seis
tem teste que pegue uma regressão.

### Revisão de 2026-09-03

As seis foram relidas contra o código atual. Nenhuma se mostrou defeituosa:

- **1 e 6 são a mesma técnica.** O reset no fechamento
  (`RegisterMeetingModal.tsx:258`, `onOpenChange={(v) => { if (!v) reset(); ... }}`)
  cobre todos os caminhos de saída do modal. O effect removido em (6) apenas
  pré-preenchia todos os membros com `false`; as três leituras usam
  `attendance[personId] ?? false` e a contagem só olha `true`, então o mapa
  esparso é equivalente. Resta um caso de borda **não alcançável hoje**: se o
  `GroupDetailSheet` trocasse de grupo com o modal aberto, o mapa não seria
  limpo — antes o effect limparia, porque dependia de `members`.
- **2 e 3 estão corretas** no padrão `requestKey = id|tick` + `loadedKey`, com
  `signal.cancelled` checado antes de cada `setState` e o `loadedKey` marcado
  no `.finally` só se não cancelado. Em `PostDetailSheet.tsx:144-167` a falha
  de rede mantém `post` nulo e o render (`:279`) cai em `isLoading || !post`,
  ou seja, o spinner permanece — igual ao comportamento anterior.
- **4 e 5** só têm evidência em specs que não existem mais.

Conclusão da revisão: **o risco não é o código estar errado hoje, é não haver
nada que avise quando parar de estar.** Dez arquivos usam
`loadedFor`/`loadedKey` e nenhum deles tem teste.

### Pergunta em aberto

Cobrir as três telas (conteúdo, grupos, pessoas) no e2e, o que fecha 4 e 5 e dá
rede para 1, 2 e 3 — ou aceitar declaradamente o risco e fechar esta pendência
como "revisada, sem cobertura por escolha"?

---

## 5. Lint em `apps/api` — resolvido

A decisão nº 4 do [plano de CI](CI.md) afirmava que o eslint tinha sido
*"adicionado agora"* em `apps/api`. Não tinha: nem config, nem devDependency,
nem script. Foi adicionado de verdade em 2026-09-03 — a decisão é ter lint em
tudo.

### O que entrou

- `apps/api/eslint.config.mjs`: `@eslint/js` recommended +
  `typescript-eslint` recommended, a mesma base que o Nest gera. **Sem**
  `recommendedTypeChecked`: essa variante precisa do programa do tsc a cada run
  e encarece o portão — se um dia entrar, que seja com o custo medido.
- `"lint": "eslint"` no `package.json`, igual a `web` e `site`.
- devDeps: `eslint`, `@eslint/js`, `typescript-eslint`, `globals`.
- Uma regra ajustada, e só uma: `no-unused-vars` com `argsIgnorePattern: "^_"`.
  O código já marca "não usado de propósito" com underscore — `_tx` nos
  callbacks de transação do Prisma, `_depth` na recursão de grupos. Alinha a
  regra à convenção existente e **não muda uma linha de código**. Sem ela
  seriam 17 erros; com ela, 12.

### Os 12 erros, e o que cada um era

O medo declarado era "virar um segundo `c84fc02`" — ou seja, o lint forçar
reescrita de lógica, como aconteceu no `web` e virou a pendência nº 4. **Não
aconteceu.** Dos 12, nove eram ruído puro e três eram achados.

Ruído — import morto, variável morta, um `prefer-const`. Apagados sem tocar em
comportamento:

- `content/dto/segment-criteria.dto.ts` — import `IsObject`
- `persons/dto/import-confirm.dto.ts` — import `IsUUID`
- `volunteers/dto/create-volunteer-profile.dto.ts` — import `Transform`, e a
  const `DAYS`, que só existia para derivar `DayKey` via `typeof` e virou a
  união de literais direto. `SLOTS` ficou: essa é usada em runtime, no
  `@IsIn(SLOTS)`
- `celebrations/service-order-items.service.ts:94` — `let` → `const`
- `test/rls/isolation.spec.ts` — cinco ids de fixture capturados e nunca usados
  em asserção. Os registros continuam sendo criados: são a contraparte que os
  testes de vazamento precisam existir; só as variáveis saíram

Achados de verdade:

1. **`persons.service.ts:98`** recebia `user: JwtPayload` e o ignorava — um
   parâmetro documentando um escopo que nunca foi implementado. Foi o fio que
   levou ao item (a) da pendência nº 1. Com o `WITH CHECK` alinhado, o escopo é
   do RLS e o parâmetro saiu, junto com o argumento no controller. `remove`, no
   mesmo arquivo, já não recebia `user` — agora os dois seguem a mesma
   convenção.
2. **`financial/dashboard.service.ts:96`** — `lastExp`, a quarta agregação do
   `Promise.all`, tinha o resultado descartado: `vs_last_month_pct` compara
   receita apenas. A query ia ao banco a cada carga do dashboard sem servir a
   nada. Removida — uma ida a menos, mesma saída. *Se a intenção era mostrar
   variação de despesa também, o cálculo nunca chegou a existir; isso é produto,
   não lint.*
3. Os cinco ids de fixture, que pareciam ruído, mostraram que o
   `isolation.spec.ts` montava a congregação A-Second e nunca a usava numa
   asserção de papel — o que virou o bloco `4b`.

### Estado

```
$ npx turbo run lint
 Tasks:    3 successful, 3 total
```

Três apps, portão verde. Restam os 2 avisos dos fronts, os dois deixados de
propósito em `c84fc02` — `canView` não usado em celebrações e o
`exhaustive-deps` pré-existente em conteúdo.

### Nada em aberto nesta pendência

---

## Registro

Ao resolver uma pendência, remova a seção e registre no commit o que foi
decidido — inclusive quando a decisão for aceitar o comportamento atual.
