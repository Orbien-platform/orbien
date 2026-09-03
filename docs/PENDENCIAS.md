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
| 1 | RLS não isola por congregação dentro do mesmo tenant | segurança | ✔ fechada — `003` aplicado em produção em 2026-09-03 |
| 2 | Lint do `site` quebrado no estado commitado | portão | ✔ fechada |
| 3 | E2E depende de dados que o seed não cria | portão | ✔ fechada — seed estendido |
| 4 | 6 mudanças de comportamento do `c84fc02` sem cobertura permanente | risco de regressão | ✔ **fechada** — e2e nas três telas |
| 5 | Lint em `apps/api` | portão | ✔ fechada — lint nos 3 apps, portão verde |
| 6 | Sessão de suporte não levava a nada, e a auditoria dela era tripla­mente morta | segurança | ✔ fechada — `audit_insert()` aplicado em produção em 2026-09-03 |
| 7 | RLS das tabelas de plataforma não valia em produção: a app roda como `orbien_app`, que tem `USING (true)` nelas | segurança | ✔ fechada — interceptor troca para `app_user`; **falta rodar o bootstrap** |
| 8 | As duas rotas públicas do produto estavam mortas: `PrismaService.client` devolvia o cliente sem delegates de modelo | defeito | ✔ fechada |
| 9 | Cadastro de visitante por QR nunca conseguiu gravar sob RLS — rota pública sem contexto de tenant | defeito | ✔ fechada — contexto vem do QR token |

> Em 2026-09-03 as sete foram revistas e as sete fecharam. As nº 4, 5, 6 e 7
> nasceram no mesmo dia — a nº 4 já estava decidida como aberta e só não tinha
> registro escrito; a nº 5 apareceu na revisão; a nº 6 apareceu ao testar o
> resultado da nº 1 pelo navegador; a nº 7 apareceu ao abrir a Fase 2.
>
> As nº 8 e 9 não vieram do primeiro run de CI: apareceram em 2026-09-03, ao
> verificar a Fase 2 em produção. As duas são anteriores à fase e nenhuma tinha
> teste que as alcançasse.
>
> O passo operacional que restava foi feito em 2026-09-03: o
> `003_rls_admin_write.sql` e o `audit_insert()` corrigido da nº 6 estão
> aplicados no Supabase de produção e conferidos por leitura. O que segue
> pendente lá é o `004_rls_platform_plane.sql` da nº 7, e ele **não** deve ser
> colado no SQL Editor: precisa rodar depois do passo que remove as policies
> redundantes de tenant, e aplicar script de RLS fora de ordem é exatamente o
> defeito que a nº 1 documentou. O caminho é o `bootstrap-db.sh` inteiro.

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

### Aplicado em produção em 2026-09-03

O `003` foi rodado contra o Supabase e conferido: as 22 policies com
`USING != WITH CHECK` foram a zero, as 22 citações de `denomination_admin`
também, e `app_congregation_allowed` passou a existir. Fica registrado como
rodar de novo, porque os scripts de RLS ficam fora do histórico do Prisma e só
o `bootstrap-db.sh` os aplica:

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

### Fechada em 2026-09-03 — as três telas têm e2e

Entraram `e2e/pessoas.spec.ts`, `e2e/grupos.spec.ts` e `e2e/conteudo.spec.ts`.
A suíte foi de 2 para 5 specs, roda em ~22s contra build local e banco efêmero,
e duas execuções seguidas deixam o banco no estado do seed — a limpeza é feita
pela API na saída de cada spec.

O que cada comportamento ganhou:

| # | Como está coberto |
|---|---|
| 1 | pessoas: abre o sheet, entra em edição, fecha e reabre — tem que voltar em modo de leitura |
| 2 | conteúdo: filtro de status recarrega a lista; grupos: sheet reabre após mutação |
| 3, 4 | pessoas e grupos: dois termos de busca em sequência, sem esperar o primeiro — vence o último |
| 5 | as três: registro criado pela UI aparece na lista sem recarregar a página |

Mais as três telas afirmando ausência de erro de console e de resposta HTTP
inesperada, que é o que a verificação manual do `c84fc02` fazia a olho.

#### O que a verificação em dois sentidos revelou

Não bastou escrever o teste: cada asserção foi checada quebrando o
comportamento de propósito e conferindo que ela falha. Duas descobertas.

**A primeira versão da asserção de sheet não mordia.** Ela afirmava só o estado
final — "depois de clicar no segundo registro, o nome do primeiro não está na
tela". O auto-retry do Playwright espera a janela de estado sujo passar e dá o
teste por bom. Removido o reset no fechamento, o teste continuava verde.

**E o reset no fechamento não é o que protege a troca de registro.** Quem
protege é o carregamento derivado: `loadedFor !== personId` mostra o skeleton
enquanto o novo registro carrega, então o nome antigo não chega a aparecer nem
sem reset nenhum. Os dois mecanismos cobrem o mesmo caso, e por isso a troca de
registro não distingue um do outro.

O que **só** o reset protege é o estado de UI que não depende do id —
`isEditing`. Sem ele, fechar o sheet no meio de uma edição e reabrir devolve o
formulário aberto. É essa a asserção que ficou, e é a que falha quando o reset
sai:

```
✘ pessoas › lista, busca, sheet e cadastro
  Error: o sheet reabriu em modo de edição — o fechamento não resetou
```

Restaurado o reset, verde. Uma versão intermediária do teste segurava a
resposta da API com `page.route` para tornar a janela observável; foi removida
— só pegava o caso de os **dois** mecanismos estarem quebrados, ao custo de um
teste bem mais frágil.

### Nada em aberto nesta pendência

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

## 6. A sessão de suporte não levava a nada — e a auditoria dela estava morta em três lugares

Aberta e fechada em 2026-09-03. Chegou por um caminho torto: a conta
`fernando.vargas@fill.tech` mostrava *"Não foi possível carregar os dados"* no
dashboard, e a suspeita inicial recaiu sobre o `003_rls_admin_write.sql`,
aplicado minutos antes.

### Não era o `003`

`fernando.vargas@fill.tech` é `platform_support`, não `tenant_admin`. A tela
inicial faz quatro GETs — `/persons`, `/financial/transactions`,
`/celebrations`, `/celebrations/instances` — e só mostra aquela mensagem quando
**todos** falham (`dashboard/page.tsx:168`). `platform_support` não está em
nenhuma das listas de leitura dessas quatro rotas, então são quatro 403.

Provado com banco provisionado do zero, rodando as quatro rotas nas duas
contas, **com** e **sem** o `003`:

```
com 003     platform_support: 403 403 403 403   tenant_admin: 200 200 200 200
sem 003     platform_support: 403 403 403 403
            {"message":"Forbidden resource","error":"Forbidden","statusCode":403}
```

Idêntico. O 403 vem do `RolesGuard`, que roda antes de qualquer query — o RLS
nem é avaliado. E o `.github/workflows/ci.yml` já dizia, no job de e2e, que
*"platform_support leva 403 na maioria das rotas"*.

### O que era: um caminho projetado, e inacabado

`platform_support` não é papel esquecido — ele tem um acesso projetado e bom:
não vê dados de igreja de forma permanente, e sim abre uma **sessão de
suporte** por `POST /auth/impersonate`, que é explícita e auditada. A intenção
estava inteira. A implementação, não. Três defeitos empilhados:

**1. O token impersonado não abria nada.** `impersonate()` troca `tenant_id` e
`congregation_id` mas faz `roles: requestingUser.roles` — copia os papéis do
próprio suporte. O `RolesGuard` não tinha exceção para `support_session`, então
o token novo batia nos mesmos 403 do token velho. O caminho existia e não
levava a lugar nenhum.

**2. O `AuditInterceptor` nunca rodou.** Não estava registrado em lugar nenhum
— nem global, nem em controller. Código morto desde que foi escrito.

**3. A função `audit_insert()` nunca poderia ter funcionado.** Ela insere em
`audit_logs` sem `id`. No schema o campo é `@default(uuid())`, que no Prisma é
gerado **no cliente**: a coluna é NOT NULL e não tem `DEFAULT` no banco. Todo
INSERT falhava com 23502. E o único chamador — o interceptor do item 2 — tinha
`.catch(() => void 0)`, então o erro nunca apareceu nem em log.

Os três se escondiam um atrás do outro. O item 3 só ficou visível depois de
consertar 1 e 2, quando o teste de integração passou a exigir a linha de
auditoria e o log mostrou o 23502.

### Correções

1. `RolesGuard`: `support_session === true` satisfaz qualquer `@Roles`. É
   exceção larga de propósito. Preferida a forjar papéis do tenant alvo, que
   inventaria atribuição inexistente e ficaria invisível no token.
2. `AuditInterceptor` registrado como `APP_INTERCEPTOR` global. Por controller
   deixaria rota nova sem auditoria por esquecimento.
3. O interceptor passa a escrever por `audit_insert()`. A escrita anterior era
   `prisma.auditLog.create()`, ou seja um INSERT como `orbien_app` — e
   `audit_logs` só tem policy de SELECT para esse role. Era negado pelo RLS
   **além** de faltar o `id`. A falha agora vai para o log em vez de ser
   engolida; segue best-effort, porque auditoria que derruba requisição troca
   observabilidade por indisponibilidade.
4. `audit_insert()` gera o `id` com `gen_random_uuid()::text`.

### Evidência

Primeiro teste do projeto `integration` do repositório —
`test/integration/impersonation.spec.ts`, que sobe o `AppModule` e fala HTTP —
mais `roles.guard.spec.ts` no projeto `unit`:

```
unit         8 passed
integration  7 passed
rls         42 passed
```

Verificado nos dois sentidos: comentando a linha da exceção no guard, **2 testes
de unidade e 3 de integração falham** — e os que provam que `platform_support`
sem sessão continua barrado seguem passando.

> Nota de infraestrutura: subir o `AppModule` sob Jest alcança
> `financial/export`, que importa `archiver` — ESM-only, que o Jest no Node 22
> não consegue `require`. Resolvido com `moduleNameMapper` para
> `test/stubs/archiver.ts`, que estoura se alguém realmente tentar gerar um ZIP.

### Aplicado em produção — 2026-09-03

O `audit_insert()` corrigido vive no `001_rls_setup.sql`, que só o
`bootstrap-db.sh` aplica. Enquanto não rodava, a sessão de suporte funcionava
mas não deixava rastro — o guard liberava, o interceptor tentava gravar e o
banco recusava com 23502.

Fernando aplicou pelo SQL Editor do Supabase o `CREATE OR REPLACE FUNCTION
audit_insert()` na versão da `main` (a que gera `gen_random_uuid()::text`), com
um smoke test que chamou a função de verdade e foi removido depois. Conferido
por leitura contra o banco:

```
audit_insert: gera id = true | SECURITY DEFINER = true
policies de congregação: 22 | desalinhadas 0 | com papel fantasma 0
linhas de smoke_test ainda no banco: 0
```

Registro feito a partir do relato da sessão que conduziu a aplicação; esta
sessão não tem acesso ao banco de produção e não repetiu as leituras.

### Continua em aberto, por desenho

- ~~**Não existe UI.**~~ Fechado na Fase 3, em 2026-09-03. A sessão é aberta
  pela lista de tenants do `apps/admin` ("Entrar no web como suporte"), que
  chama `POST /auth/impersonate` e entrega o token ao `apps/web` em
  `/suporte/sessao`, pelo **fragmento** da URL — as duas origens são
  diferentes (`admin.` e o app do tenant) e `localStorage` é por origem, então
  não havia caminho por baixo. Fragmento e não query porque fragmento não
  chega ao servidor: fica fora do log da Vercel, do `Referer` e de qualquer
  proxy. Enquanto a sessão vale, o `web` mostra a faixa do
  `SupportSessionBanner` — o par visível do `AuditInterceptor`.
- **A sessão pode escrever**, não só ler. Decisão adiada.
- **TTL** do token de impersonação é o padrão de access token — 15 minutos.
  Continua sendo o padrão, mas agora tem consequência visível: `impersonate`
  não emite refresh token, então a sessão de suporte **não se renova**. Aos 15
  minutos o interceptor do Axios não acha refresh e devolve o suporte para
  `/login`. É o comportamento desejado; renovar sozinha uma sessão que enxerga
  dado de igreja alheia é o que não se quer. O que falta é aviso antes de
  expirar, hoje inexistente.
- **A sessão de impersonação não cruza tenant**, e isso continua estrutural: o
  token fixa um tenant, e o `IS NULL` de `app_platform_access()` fecha o ramo
  de plataforma justamente quando há tenant fixado. Suporte a vários clientes
  exige impersonar um por vez. O que mudou na Fase 2 é o outro caminho: sem
  impersonar ninguém, `platform_support` enxerga os N tenants nas tabelas de
  plataforma. Ver a pendência nº 7.

---

## 7. RLS de plataforma não valia em produção — resolvido

Achado ao abrir a Fase 2 (plano de plataforma), em 2026-09-03.

### O que estava errado

`20260608175621_fix_orbien_app_auth_policies` criou, em `tenants`,
`congregations`, `branding_configs`, `tenant_plans`, `user_accounts`,
`role_assignments` e `audit_logs`:

```sql
CREATE POLICY orbien_app_auth ON tenants
  AS PERMISSIVE FOR ALL TO orbien_app
  USING (true) WITH CHECK (true);
```

Existe por um motivo real: login e bootstrap público rodam antes de haver
contexto. O problema é que a requisição **autenticada** também rodava como
`orbien_app` — o `TenantContextInterceptor` fazia `set_config` e nunca
`SET LOCAL ROLE`. Policies `PERMISSIVE` combinam com **OR**, então o
`OR true` ganhava do `tenant_id = app_current_tenant()` em toda requisição.

O comentário do passo 5 do `bootstrap-db.sh` dizia "o `SET LOCAL ROLE app_user`
que o backend usa". O backend não usava. Quem usava era só
`test/helpers/rls.ts` — por isso a suíte de RLS passava: `runAsTenantWithRole`
e `runAsUser` trocam de role, e `runAsTenant`, o helper que espelha produção,
não é usado nessas sete tabelas.

### Decisão

Fechar dentro da Fase 2, não depois: a política de plataforma não teria
significado nenhum enquanto o `OR true` estivesse por cima dela.

O interceptor passa a fazer `SET LOCAL ROLE app_user` antes do `set_config`.
Policy só se aplica ao role corrente e aos que ele herda; `app_user` **não** é
membro de `orbien_app`, então as policies de auth deixam de ser alcançáveis a
partir de uma requisição autenticada. O caminho pré-autenticação continua como
`orbien_app` e não muda — ele nem passa pelo interceptor, porque não tem
`req.user`.

`waitlist_subscribers` entrou junto: ficou fora do `001` inteiro, sem `ENABLE`
e sem policy. O `004` habilita RLS e escreve os dois caminhos legítimos — o
cadastro público (INSERT como `orbien_app`, sem contexto) e o admin
(`platform_support` sem tenant, como `app_user`).

### Verificação

`test/rls/platform-plane.spec.ts`, nos dois sentidos: `platform_support` sem
contexto lista N tenants e provisiona; o mesmo usuário com tenant fixado (o
token de impersonação) vê um só, e `tenant_admin` sem contexto não vê nenhum.

`src/common/interceptors/tenant-context.interceptor.spec.ts` prende as duas
decisões do interceptor sem precisar de banco.

`test/integration/platform-provisioning.spec.ts` mede o caminho inteiro por
HTTP: as três marcas (`@Roles`, `@PlatformRoute()`, interceptor) só funcionam
juntas, e nenhum teste de unidade prova que elas se encontram numa requisição
de verdade. Provisiona, confere as seis peças no banco, loga com o admin
recém-criado e confere a linha de `platform_access`.

Tudo isso rodou contra `postgres:17-alpine` local, provisionado pelo
`bootstrap-db.sh` completo — o mesmo caminho do CI: 54 testes de RLS e 13 de
integração, verdes.

E a suíte de e2e junto, que é o que importa aqui: o `SET LOCAL ROLE app_user`
alcança **toda** rota autenticada do produto, não só as de plataforma, e é a
primeira vez que essas rotas são avaliadas sob RLS de verdade. API e web em pé
localmente contra o banco semeado, os 5 specs passam (pessoas, grupos,
conteúdo, escala, templates). Sem isso o risco da mudança ficaria medido só
pelo lado da API.

O `AuditInterceptor` passou a gravar `platform_access` nas rotas marcadas com
`@PlatformRoute()`. Ele só olhava `support_session`, e um `platform_support`
logado normalmente não tem essa marca: `POST /platform/tenants` criava uma
igreja inteira sem deixar rastro. São exceções diferentes — `support_access` é
o contrapeso do `RolesGuard` dentro de um tenant, `platform_access` é o
contrapeso do ramo de RLS que abre os N tenants — e por isso viraram duas
`action` distintas em vez de uma só. O `tenant_id` da coluna é o do ator (o
token do suporte não carrega o tenant da ação); qual tenant foi criado vai em
`after.subject_tenant_id`. Coberto por
`src/common/interceptors/audit.interceptor.spec.ts`, que o interceptor não
tinha.

Duas asserções novas no passo de verificação do `bootstrap-db.sh`: o
`orbien_app` tem que poder `SET ROLE app_user` (sem isso a API inteira para com
42501), e as seis policies do plano de plataforma têm que existir e ser
simétricas.

### Continua em aberto, por desenho

- **`user_accounts`, `role_assignments` e `audit_logs` seguem com
  `orbien_app_auth USING (true)`.** Não incomoda mais nas rotas autenticadas
  (que agora são `app_user`), mas qualquer rota pública futura que toque essas
  tabelas as lê inteiras. Fechar isso exige mapear o que o login precisa ler
  antes de existir contexto — trabalho próprio, não da Fase 2.
- **Nenhuma tabela de plataforma tem `FORCE ROW LEVEL SECURITY`.** O dono
  (`postgres`, que é o `prisma.system`) segue passando por cima. É o mesmo
  desenho do `fix_rls_enforcement`, e é o que permite o `seed.ts` existir.
- **Falta rodar o bootstrap em produção**, como na nº 6. Até lá as rotas de
  plataforma respondem vazio.

---

## 8. As rotas públicas estavam mortas — resolvido

Achado em 2026-09-03, ao verificar em produção o cadastro público da waitlist
depois do `004`. O sintoma parecia RLS; não era.

### O que estava errado

```
[ExceptionsHandler] Cannot read properties of undefined (reading 'create')
    at WaitlistService.subscribe (dist/src/waitlist/waitlist.service.js:22:57)
```

O Prisma 6 devolve um **Proxy** do construtor, e é o proxy — não o objeto que
ele embrulha — que resolve os delegates de modelo (`person`,
`waitlistSubscriber`, ...). Dentro de um getter do protótipo o `this` é o alvo
cru: tem `$connect` e `$transaction`, e nenhum modelo.

```
client !== service        : true
client.$connect           : function
keys em client            : _originalClient,_runtimeDataModel,...
client.person             : undefined
client.waitlistSubscriber : undefined
```

`get client()` devolvia `this`. Então **todo caminho sem transação ativa**
recebia um cliente sem modelos. Só não quebrou o produto inteiro porque quem
passa pelo `TenantContextInterceptor` recebe o `tx` pela AsyncLocalStorage, e
o `tx` tem os delegates — ou seja, o defeito atingia exatamente as rotas que
ninguém testava.

Duas rotas, as duas voltadas para o cliente final:

- `POST /api/public/waitlist` — o formulário de captação do site;
- `POST /api/public/visitor/register` — o cadastro de visitante por QR.

Reproduzido localmente byte a byte contra o mesmo build: não era ambiente, não
era pooler, não era RLS.

### Decisão

No construtor o `this` ainda é o proxy — é o único lugar onde dá para guardar a
referência boa:

```
private readonly proxied: PrismaClient;
constructor() { super(); this.proxied = this as unknown as PrismaClient; }
get client() { return txStorage.getStore() ?? this.proxied; }
```

Verificado nos dois sentidos: desfazendo a correção, o teste novo falha.

### Verificação

`src/prisma/prisma.service.spec.ts` — sem banco, afirma que os delegates
existem quando não há transação. É o teste que teria pego isso no dia.

`test/integration/public-routes.spec.ts` — as duas rotas por HTTP. A suíte de
RLS chamava o Prisma direto, sem passar pelo Nest: media a policy e não o
caminho, e por isso não via nada.

> Nota: `GET /admin/waitlist` sofria do mesmo mal e foi consertado por acidente
> na Fase 2, que passou a colocar o `TenantContextInterceptor` nesse
> controller.

---

## 9. Visitante por QR nunca gravou sob RLS — resolvido

Apareceu atrás da nº 8: com o `client` corrigido o fluxo finalmente chegou ao
banco, e parou em

```
42501: new row violates row-level security policy for table "persons"
```

`registerViaQr` abre `runInTx` sem contexto nenhum — rota pública não tem JWT,
logo o interceptor não roda e `app.tenant_id` fica nulo. `persons`,
`consent_records` e `visit_records` têm `FORCE ROW LEVEL SECURITY` com policy
por tenant desde junho. Ou seja: o cadastro por QR nunca funcionou sob RLS, e o
`TypeError` da nº 8 escondia isso.

### Decisão

O contexto passa a vir do **próprio QR token**, dentro da transação:

```sql
set_config('app.tenant_id', <do token>, true),
set_config('app.congregation_id', <do token>, true)
```

O que autoriza a escrita é o token: ele é emitido por alguém do tenant, guarda
`tenant_id` e `congregation_id`, e já foi validado antes (existe e está ativo).
O contexto vem dele e **não** do corpo da requisição — o visitante não
influencia em qual tenant grava. `set_config(..., true)` é local à transação,
então nada vaza para a próxima requisição do pool.

É um caminho sem autenticação que escreve em `persons`, e isso é deliberado:
já era a função do produto antes do RLS existir. O que mudou é que agora ele
grava no tenant que o token diz, em vez de não gravar em lugar nenhum.

Verificado nos dois sentidos: removendo o `set_config`, o teste volta a falhar
com o mesmo 42501.

---

## Registro

Ao resolver uma pendência, remova a seção e registre no commit o que foi
decidido — inclusive quando a decisão for aceitar o comportamento atual.
