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
| 10 | Tela sem permissão diz "nada cadastrado" em vez de "sem acesso" — vale para as 8 telas de `(admin)` | UX | ✔ fechada — 403 distinguido de lista vazia, sidebar filtrada por papel |

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
  `SupportSessionBanner` — o par visível do `AuditInterceptor` —, agora com
  botão de encerrar. Fechado de vez na Fase 4, junto da troca de `localStorage`
  por cookie `HttpOnly` (ver abaixo): o token do fragmento é postado em `POST
  /api/session/suporte` e vira cookie ali mesmo, então a janela em que ele é
  legível por script é o intervalo entre o `location.hash` e essa chamada.
- ~~**A sessão pode escrever**, não só ler.~~ Decisão fechada na Fase 5,
  em 2026-09-04: só lê. O `RolesGuard` passou a checar o método HTTP antes de
  liberar `support_session` — GET e HEAD continuam satisfazendo qualquer
  `@Roles`, qualquer outro verbo cai na checagem normal de papel, que nega,
  porque `platform_support` não está em nenhuma lista de `@Roles` de dado de
  igreja. Não precisou de mudança no RLS: a exceção sempre foi só do guard,
  nunca de uma policy.
- ~~**`audit_logs` de `support_access` nunca teve tela.**~~ Fechado na Fase
  5, em 2026-09-04. O dado é gravado desde a Fase 1 e ninguém tinha olhado.
  `GET /platform/audit-logs/support-access` (mesma marcação de plataforma das
  outras rotas — `@Roles('platform_support')` + `@PlatformRoute()`) e a tela
  `apps/admin/(platform)/auditoria`. O filtro por `action` é fixo no backend,
  não vem da query: a rota responde uma pergunta só. Precisou de RLS novo —
  `005_rls_audit_platform_read.sql` abre `audit_logs` para
  `app_platform_access()` no `USING`, sem tocar o `WITH CHECK`, que não existe
  numa policy `FOR SELECT`: a escrita segue reservada a `audit_insert()`.
- ~~**Sem limite de tentativa no login da plataforma.**~~ Fechado em
  2026-09-05, por tabela e não por Redis — não há Redis provisionado, e a
  escolha foi declarada. `login_attempts` (migration comum
  `20260905000000_add_login_attempts`, com `ENABLE`+`FORCE ROW LEVEL SECURITY`
  e nenhuma policy, o mesmo desenho de `password_reset_tokens`: só
  `prisma.system` alcança, porque a tabela guarda o e-mail tentado). O
  `LoginRateLimitService` cobre as três rotas de credencial de uma vez:
  `POST /auth/login` e `POST /auth/platform/login` com 5 **falhas** por 15
  minutos — acerto zera a janela, então quem sabe a senha nunca esbarra no
  limite —, e `forgot-password` com os mesmos 3 pedidos por hora que já tinha,
  agora fora do `Map` por processo, que com N instâncias no Render valia 1/N e
  sumia a cada deploy. As chaves são por rota e, no login do produto, por
  tenant: bloquear um e-mail numa igreja não bloqueia a mesma pessoa em outra,
  que é outra conta. O 429 do `forgot-password` não sai — a resposta segue
  genérica, senão ela contaria que alguém andou pedindo redefinição para
  aquele e-mail.

  **O recorte por origem foi fechado em 2026-09-07.** `main.ts` passou a
  chamar `app.set('trust proxy', 1)`: a Render termina TLS na borda e
  encaminha por um único proxy interno, que escreve `X-Forwarded-For` com o IP
  real do cliente — cabeçalho que quem faz a requisição não alcança, só a
  borda da Render o define. Sem isso `req.ip` era o endereço desse proxy,
  igual para todo mundo, e qualquer limite por IP agrupava o tráfego inteiro
  numa origem só (ou nenhuma, dependendo de como a Render reutiliza conexões).
  `1` diz ao Express para confiar só nesse último salto.

  Com `req.ip` confiável, `login`, `platform/login` e `forgot-password` em
  `auth.controller.ts` ganharam `ThrottlerGuard` — o mesmo mecanismo que já
  protegia `waitlist` e `visitor/register` por IP, reaproveitado em vez de
  inventar um segundo limitador. Os dois recortes convivem porque cobrem
  ataques diferentes: o `LoginRateLimitService` (por e-mail) barra quem tenta
  muitas senhas contra a mesma conta, de qualquer lugar; o `ThrottlerGuard`
  (por IP, `req.ip` — 20/15min em `login`, 10/15min em `platform/login`,
  10/hora em `forgot-password`) barra quem varre muitos e-mails diferentes do
  mesmo lugar. `platform/login` ficou mais apertado por ser a porta que leva
  ao console da plataforma.

  **A migration precisa rodar antes do deploy da API.** Ela é comum (sai por
  `prisma migrate deploy`, sem depender do `bootstrap-db.sh`), mas as
  migrations do projeto são manuais: subir o código antes de aplicá-la deixa as
  rotas de login batendo numa tabela que não existe.
- ~~**TTL** do token de impersonação é o padrão de access token — 15 minutos.~~
  Fechado na Fase 5, em 2026-09-04: caiu para 5 minutos, dedicado
  (`IMPERSONATE_TOKEN_TTL`, separado de `ACCESS_TOKEN_TTL`). Continua sem
  refresh token, então a sessão de suporte **não se renova** — 5 minutos
  depois `GET /api/session` responde 401, o middleware barra a navegação e o
  suporte volta para `/login`. É o comportamento desejado; renovar sozinha uma
  sessão que enxerga dado de igreja alheia é o que não se quer. ~~O que falta é
  aviso antes de expirar, hoje inexistente.~~ Fechado em 2026-09-05, na `main`,
  por `fa85de2`: a faixa do `SupportSessionBanner` conta o tempo restante e
  muda de cor no último minuto. O prazo vem do `exp` do token, exposto em
  `SessionUser.expires_at`, e o relógio recalcula a partir de `Date.now()` a
  cada tique em vez de decrementar o estado — aba em segundo plano tem
  `setInterval` estrangulado pelo browser, e um contador cego atrasaria em
  relação ao token.

  **Foi implementado duas vezes, em paralelo.** Esta branch tinha a mesma
  feature, escrita sem saber da outra, e a duplicata foi descartada no merge —
  a da `main` já estava mesclada, e divergir dela custaria mais do que ganharia.
  Não é acidente isolado: o próprio `fa85de2` diz ter refeito o trabalho por
  cima da `main` pelo mesmo motivo. O que evita a terceira vez é olhar as
  branches abertas antes de pegar um item deste documento — e marcar aqui,
  quando pegar, que o item está sendo feito.
- **A sessão de impersonação não cruza tenant**, e isso continua estrutural: o
  token fixa um tenant, e o `IS NULL` de `app_platform_access()` fecha o ramo
  de plataforma justamente quando há tenant fixado. Suporte a vários clientes
  exige impersonar um por vez. O que mudou na Fase 2 é o outro caminho: sem
  impersonar ninguém, `platform_support` enxerga os N tenants nas tabelas de
  plataforma. Ver a pendência nº 7.

---

## Token do web em `localStorage` — resolvido na Fase 4

Levantado ao fechar a ponte admin → web, em 2026-09-03. Não era achado da
Fase 3: é anterior a ela e valia para o app inteiro, não só para a sessão de
suporte.

### O que estava errado

`src/lib/auth.ts` guardava access e refresh token em `localStorage`. Qualquer
script rodando na origem — um XSS, uma dependência comprometida — lia a
credencial inteira e podia usá-la de qualquer lugar, pelos 7 dias do refresh
token. O cookie `auth_session=1` que existia ao lado não era credencial: era
só um flag para o middleware, que não enxerga `localStorage`.

Discutiu-se trocar o **fragmento** da URL do handoff por um código de troca de
uso único. Não foi feito, e a razão está registrada aqui para não voltar como
pergunta: fragmento já mantém o token fora do `Referer`, do log da Vercel e do
histórico (`replaceState` apaga a entrada). O que o código de troca fecharia a
mais — a janela de milissegundos em `location.hash` e o link que continua
válido se vazar — não se sustenta contra quem lê o `hash`, porque esse mesmo
alguém lê o storage em seguida; e o link só existe na mão do operador de
suporte, que pode emitir outro quando quiser. O buraco real era o storage.

### O que passou a valer

A sessão do web vive em três cookies `HttpOnly`, `SameSite=Lax`:
`orbien_at` (access, TTL do token), `orbien_rt` (refresh, 7 dias) e
`orbien_id` (e-mail e, em sessão de suporte, o nome da igreja — dado de
exibição, não credencial).

- `/api-proxy` deixou de ser `rewrite` do `next.config` e virou Route Handler:
  é ele que lê o cookie e monta o `Authorization`. É o único ponto do web que
  vê o access token.
- `/api/session` cria (POST), lê (GET) e encerra (DELETE) a sessão. O corpo de
  erro do login sobe intacto, porque a tela distingue `TENANT_NOT_FOUND` de
  401 de 5xx pelo que a API respondeu.
- `/api/session/refresh` rotaciona. Fica **fora** do proxy de propósito: a API
  revoga a família inteira de refresh tokens ao detectar reuso, então duas
  rotações concorrentes derrubam a sessão. Quem serializa continua sendo a
  fila do interceptor do Axios — que agora não manipula token nenhum, só sabe
  *quando* renovar.
- O middleware lê os cookies da sessão direto, e o flag `auth_session` sumiu
  junto com o risco de ele discordar da verdade.

### O que quebrou junto, e como foi fechado

Trocar o `rewrite` por Route Handler pôs toda chamada de dado dentro de uma
função da Vercel — e função da Vercel tem teto de **4,5 MB de corpo de
requisição**. O upload de mídia aceita 50 MB dos dois lados
(`useFileUpload.ts` e `posts.controller.ts`). O `rewrite` resolvia na camada
de roteamento e o corpo ia direto para o Render, sem passar por função; o
handler não. Achado pela revisão, não pelos testes: `next dev` não impõe
limite nenhum, então o defeito só apareceria depois do deploy.

O upload saiu do proxy. Vai direto do browser para a API, em dois passos:

1. `POST /content/posts/:id/upload-ticket`, pelo proxy — corpo minúsculo, o
   cookie faz o trabalho. Exige `WRITE_ROLES` e confirma que o post existe,
   para o 404 não chegar depois de 50 MB de rede.
2. O arquivo sobe direto para a API com o **ticket** no `Authorization`.

O ticket é o único token que o JavaScript da página chega a ver, então foi
desenhado para não servir para mais nada: 5 minutos, `roles: []`, preso ao
post em `upload_target`, e recusado em qualquer rota que não tenha
`@UploadTicketRoute()`. A recusa mora no `JwtAuthGuard`, e não no
`RolesGuard`, porque `RolesGuard` libera cedo toda rota sem `@Roles` — um
ticket vazado alcançaria justamente essas. O ramo do ticket no `RolesGuard`
vem **antes** do de `support_session`: ticket emitido dentro de uma sessão de
suporte continua preso ao seu alvo, senão deixaria de ser um ticket.

O preço é o upload virar a única chamada cross-origin do `web`: o domínio dele
precisa estar em `ALLOWED_ORIGINS` no Render, e `NEXT_PUBLIC_API_UPLOAD_URL`
expõe a URL da API no bundle — que nunca foi segredo, só não era usada de lá.

Cookie `HttpOnly` não fecha o XSS. Troca "roubar a credencial e usar de
qualquer lugar por 7 dias" por "agir de dentro da aba enquanto ela existe",
que é bem menos. O que continua aberto é `SameSite=Lax` como única defesa de
CSRF no `/api-proxy`: Lax não envia cookie em requisição cross-site que não
seja navegação de topo, e navegação de topo só faz GET, cuja resposta o
atacante não lê por falta de CORS. É suficiente hoje; deixa de ser se alguma
rota de escrita passar a aceitar GET.

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

## 10. Tela sem permissão diz "nada cadastrado" em vez de "sem acesso" — resolvida

### O que apareceu

O aviso `'canView' is assigned a value but never used` em
`apps/web/src/app/(admin)/celebracoes/page.tsx:63`, no run de CI de 2026-09-03
que passou verde com 7 annotations.

### O que era — e o que não era

`canView` era `canEdit || ministry_leader/secretary`: exatamente os cinco papéis
de `READ_ROLES` em `apps/api/src/celebrations/celebrations.controller.ts:17`.
Não havia exposição de dado. O servidor é a autoridade e ela está de pé —
`volunteer` e `member` levam 403 em `GET /celebrations` com ou sem a variável.

O que a variável morta revelava é outra coisa. `components/layout/sidebar.tsx`
não filtra nenhum link por papel, e `loadCelebrations` engole o 403 com
`.catch(() => setCelebrations([]))`. Quem não tem acesso vê **"Nenhuma
celebração cadastrada."** e conclui que a igreja não tem culto — não que lhe
falta permissão. Vale para as 8 telas de `(admin)`: nenhuma tem estado de "sem
permissão", e `canView` não aparecia em nenhum outro lugar do `web`.

### Decisão

Remover `canView` — é código morto, e o que ela espelhava o servidor já garante.
Não criar um estado de "sem permissão" em uma única tela: seria um padrão de uma
página só, divergindo das outras sete. O tratamento certo é igual para as oito —
filtrar o sidebar por papel, e distinguir 403 de lista vazia no `catch` — e é
unidade de trabalho própria, não parte de uma limpeza de lint.

### Fechada em 2026-09-05 — as duas metades, nas oito telas

`canView` já tinha saído; o que faltava era o padrão. Entraram três peças
compartilhadas, e nenhuma tela ganhou solução própria:

- **`isForbidden(error)`** em `src/lib/api.ts` — 403 e só 403. O 401 fica de
  fora de propósito: quem o trata é o interceptor de renovação logo acima, e o
  que sobra dele já é redirecionamento para `/login`.
- **`<NoAccessState resource=…>`** em `src/components/ui/` — ocupa o lugar do
  estado vazio, dentro da tabela ou do card que já têm borda. Sem moldura
  própria, para não empilhar caixas.
- **`canAccessRoute()`** em `src/lib/permissions.ts` — o mapa rota → papéis que
  o sidebar usa para não desenhar link que só levaria a 403.

Cada tela passou a guardar `accessDenied` e a alimentá-lo do `catch`:
`pessoas`, `grupos`, `celebracoes` (nas duas abas), `conteudo`, `voluntarios` e
`financeiro`. O `dashboard` é diferente e ficou diferente: ele monta de quatro
chamadas em `allSettled` e já renderizava o que carregasse; o que mudou é que
**quatro** 403 deixam de virar "Não foi possível carregar os dados" e passam a
dizer que o painel está fora do alcance do papel — uma falha de rede continua
sendo erro. `configuracoes` não entrou porque não tem o defeito: `GET /settings`
não tem `@Roles`, e a tela já mostrava erro de carga, não estado vazio.

**A autoridade continua sendo o servidor.** O mapa de `permissions.ts` é
conveniência de navegação: divergir dele do `@Roles` da API é cosmético nos dois
sentidos — link a menos (a tela segue alcançável pela URL) ou link a mais (a
tela responde "sem acesso"). Em nenhum caso abre dado. Um teste trava que o mapa
só cite papéis que existem em `prisma/seed.ts`, porque papel escrito errado ali
vira link que nunca aparece — falha silenciosa.

A sessão de suporte vê tudo, como já via: `support_session` satisfaz qualquer
`@Roles` em GET no `RolesGuard`, e esconder links dela seria mentir sobre o que
ela alcança — o rastro em `audit_logs` é o contrapeso, e ele existe.

Coberto por: `permissions.test.ts`, `NoAccessState.test.tsx`, cinco casos novos
em `sidebar.test.tsx` (voluntário, tesoureiro, líder de ministério, sessão de
suporte, sem sessão), o par 403/500 em cada tela alterada, e o caso de corrida
do `financeiro` — um 403 atrasado de um refresh anterior não apaga a tela já
carregada. Cobertura de `src/app/**` e `src/lib/**` segue em 100%, que é o
piso que o `vitest.config.ts` exige.

### Nada em aberto nesta pendência

---

## `refresh()` não reconferia `is_active` — resolvida

Apareceu na revisão da Fase 3, em 2026-09-03, na dimensão de isolamento, junto
de um achado sobre o `impersonate` que foi fechado na própria fase (ver abaixo).
Não é introduzida pela fase; o que a fase faz é passar a depender dela.

### O achado vizinho, que fechou

`AuthService.impersonate` autorizava com
`requestingUser.roles.includes('platform_support')` e nada mais — sem predicado
de banco, diferente das rotas de plataforma, que respondem a
`app_is_platform_support()`. E o token que ela emite carrega
`support_session: true`, marca que satisfaz **qualquer** `@Roles` no
`RolesGuard`. É a rota mais poderosa do sistema, e era a única do plano de
plataforma decidindo por valor vindo de fora do banco.

Fechado na Fase 3: `impersonate` passou a resolver o papel em
`role_assignments`. O ganho é um só e é o que importa — papel revogado vale na
hora, onde antes o `roles` do JWT continuava afirmando `platform_support` por
até 15 minutos, com a cadeia de refresh renovando. De passagem, a união de
`rolesForToken()` deixou de ampliar quem chega ali.

O `is_active: true` entrou na mesma consulta, mas é redundância deliberada, não
ganho: **`JwtStrategy.validate` já confere `is_active` em toda requisição
autenticada**, então conta desativada leva 401 antes de alcançar o serviço.
Descoberto ao ver o teste novo esperar 403 e receber 401 — a expectativa estava
errada, não o código.

### O que estava aberto

`AuthService.refresh` valida existência do hash, `revoked_at` e `expires_at` —
não relê `is_active`. Desativar uma conta não impede a **rotação**: o refresh
continua trocando o token e emitindo access tokens com `platform_support`.

O impacto é menor do que a primeira leitura sugeria, e é por causa do
`JwtStrategy`: os tokens emitidos assim não servem para nada, porque toda
requisição autenticada relê `is_active` e devolve 401. Ou seja, desativar a
conta **corta o acesso**; o que não corta é a cadeia girando. Fica registrado
como higiene — refresh token de conta desativada devia ser revogado, não
renovado — e porque o console de plataforma agora vive de refresh a cada 15
minutos, o que torna esse caminho quente onde antes era eventual.

Verificado por leitura de `refresh()` e de `jwt.strategy.ts`, e pelo 401 do
teste `conta desativada não abre sessão de suporte`.

### Fechada em 2026-09-05

`refresh` passou a conferir `is_active` depois do `revoked_at` e do
`expires_at`, e conta desativada **derruba a família inteira** de refresh
tokens — a mesma contenção da detecção de reuso logo acima, e pela mesma razão:
o que se quer é encerrar a sessão, não invalidar um elo e deixar os outros de
pé. O `include` já trazia o `userAccount`, então não custou consulta nova.

O ganho continua sendo o que estava escrito acima — higiene, não fechamento de
brecha: quem barra o acesso é o `JwtStrategy.validate`, em toda requisição. O
que muda é que a cadeia para de girar.

Coberto por `conta desativada não rotaciona, e a família inteira é revogada`,
que afirma as três coisas: nenhum refresh token novo, nenhum access token
assinado, e o `updateMany` que revoga tudo que estava ativo.

---

## O front duplica as listas de papéis da API — aberta, por decisão

Não é defeito: é a dívida que a nº 10 aceitou conscientemente, escrita aqui
porque decisão que só existe na cabeça de quem decidiu não sobrevive ao próximo
mês.

### O que existe hoje

`apps/web/src/lib/permissions.ts` repete, em `NAV_READ_ROLES`, os papéis de
leitura de seis áreas — a mesma informação que vive no `@Roles` de cada
controller da API. O sidebar a usa para não desenhar link que só levaria a 403.

Repetir foi a escolha porque a alternativa direta está barrada pela regra do
monorepo: nada que roda na Vercel importa código de `apps/api`, e os deploys são
independentes. Um pacote compartilhado resolveria o import e criaria outro
problema — front e API passariam a subir acoplados por versão de pacote, que é
exatamente o que a independência dos deploys existe para evitar.

### Por que não dói hoje

Divergir do servidor é cosmético nos dois sentidos: link a menos (a tela segue
alcançável pela URL, e responde "sem acesso" se for o caso) ou link a mais (a
tela responde "sem acesso"). Em nenhum caso abre dado — a autoridade é o
`@Roles`, avaliado pelo `RolesGuard`, e por baixo dele o RLS.

O modo de falha silenciosa — papel escrito errado virando link que nunca
aparece, que foi exatamente o defeito do `'tesoureiro'` do lado da API — já tem
portão: um teste em `permissions.test.ts` trava que o mapa só cite papéis que
existem em `prisma/seed.ts`.

### A forma certa, quando for feita

A API expõe o que a sessão lê, e o front para de adivinhar: um
`GET /me/permissions` (ou um campo no que `/api/session` já devolve) respondendo
a lista de áreas legíveis por aquele token. Aí o mapa some, e com ele a chance
de divergir.

Tem decisão embutida que não é pequena: onde mora a lista canônica de "área do
produto" — hoje ela não existe em lugar nenhum, está espalhada nos `@Roles` de
cada controller. Fazer isso direito é criar esse conceito no backend, não só
adicionar uma rota.

### O sinal de que chegou a hora

Concreto, e vale esperar por ele: a primeira vez que alguém mexer no `@Roles` da
API e esquecer do `permissions.ts`. Enquanto o mapa não divergir na prática, o
custo de mantê-lo é menor que o de criar o conceito novo.

---

## `@Roles` citando papel que não existe na tabela `roles`

Apareceu em 2026-09-05, ao montar o mapa de papéis do sidebar (nº 10): as listas
do front precisavam espelhar as da API, e duas delas citavam coisas que não são
código de papel.

### O que era

O `RolesGuard` compara o literal do `@Roles` com `user.roles`, que vem de
`role_assignments` — ou seja, com o **código**. Literal que não é código não
casa com ninguém, e a rota fica fechada para aquele papel em silêncio: o guard
nega, e negar é o que ele faz o dia inteiro. Nenhum teste de rota pega, porque
cada um testa o que foi escrito.

- **`'tesoureiro'`** — o nome em português, não o código (`treasurer`) — em
  `DRE_ROLES` (`financial/dre.controller.ts`) e `EXPORT_ROLES`
  (`financial/export/export.controller.ts`). Efeito: o tesoureiro levava 403 no
  DRE e na exportação financeira. E no `isPastor` do DRE, um pastor que também
  é tesoureiro era tratado como pastor restrito, vendo a versão sem a coluna de
  total.
- **`'leader'`** em `MATERIALIZE_ROLES`
  (`celebrations/celebrations.controller.ts:18`) — os códigos são `cell_leader`
  e `ministry_leader`.

### Decisão — 2026-09-05

`'tesoureiro'` **corrigido** para `treasurer` nos dois controllers: é digitação,
e corrigi-la devolve o acesso a quem o desenho sempre disse que o tinha.

`'leader'` **não corrigido, e é a pendência que fica aberta.** A constante irmã
logo abaixo (`SCHEDULE_MATERIALIZE_ROLES`) usa `ministry_leader`, o que sugere
que era essa a intenção — mas trocar aqui **amplia** acesso a
`POST /celebrations/:id/materialize`, e ampliar acesso é decisão de produto, não
conserto de digitação. Hoje a rota está fechada para quem é só líder, e é assim
que ela vem se comportando desde sempre.

### O portão que passou a existir

`src/auth/roles-invariant.spec.ts` ganhou um segundo invariante: todo literal
dentro de `const *_ROLES = [...]` e de `@Roles(...)` tem que existir na lista de
códigos de `prisma/seed.ts` — e um terceiro teste confere que essa lista
acompanha o seed, para o invariante não passar a acusar papel legítimo. O
`'leader'` está numa allowlist nomeada, com o motivo escrito, e há teste que
cobra a remoção da entrada se o literal sumir do arquivo: exceção que sobrevive
ao próprio motivo é como um invariante apodrece.

---

## Provisionar a partir do lead da waitlist (Fase 4) — resolvido

Estava adiada por decisão desde 2026-09-03, registrada só como comentário em
`apps/admin/src/app/(platform)/waitlist/page.tsx`. Fechada em 2026-09-07.

### O que entrou

`ProvisionTenantDto` ganhou `waitlist_lead_id?` (UUID opcional).
`ProvisionTenantService.provision`, dentro da mesma transação que já cria
tenant/plano/branding/congregação/admin/papel:

1. Se `waitlist_lead_id` vier preenchido, busca o lead **antes** de criar
   qualquer coisa — lead inexistente vira 404, lead já vinculado a outro
   tenant (`tenant_id` não nulo) vira 409. Falhar cedo evita tenant órfão.
2. Depois de criar tudo, grava no lead `status=activated`, `activated_at` e
   `tenant_id` do tenant recém-criado — último passo da transação, então um
   tenant criado sem o lead marcado nunca fica persistido.

Não precisou de RLS novo: `waitlist_subscribers` já está no ramo
`app_platform_access()` desde o `004_rls_platform_plane.sql`.

No `apps/admin`, o `CreateTenantModal` (compartilhado entre `tenants/` e
`waitlist/`) ganhou uma prop `lead?` opcional: quando presente, prefille nome
(igreja ou, na falta, o nome do pastor), slug derivado, congregação sede e
e-mail do admin, manda `waitlist_lead_id` no POST e troca o texto do
título/botão para deixar claro que é provisionamento, não criação avulsa. A
tela da waitlist ganhou a coluna de ação "Provisionar" (some quando o lead já
tem `tenant_id`) que abre o mesmo modal.

O prefill é feito por `key` no componente, não por `useEffect` com `setState`
— trocar de lead remonta o modal com o estado inicial certo, sem cascata de
render nem o efeito colateral que o lint do projeto já rejeita noutro lugar.

### Verificação

`provision-tenant.service.spec.ts`: lead ativado na mesma transação (na
ordem certa, depois de `roleAssignment`), lead inexistente vira 404 sem criar
nada, lead já vinculado vira 409 sem criar nada. `CreateTenantModal.test.tsx`
e `waitlist/page.test.tsx`: prefill, envio do `waitlist_lead_id`, mensagem
própria para o 409 de corrida (duas abas provisionando o mesmo lead), e o
rótulo "Já provisionado" no lugar do botão quando `tenant_id` já existe.

---

## `persons` e `financial_categories` entram no plano de plataforma — DT-04

Achado ao implementar DT-04 (`docs/produto/orbien-debitos-tecnicos-v2.md`),
em 2026-09-07: `ProvisionTenantService.provision()` passou a criar também o
`Person` do admin e as 12 categorias financeiras padrão, na mesma transação
atômica que já cria tenant, plano, branding, congregação, conta admin e
papel — sem tenant fixado no contexto, porque é assim que `platform_support`
provisiona (`app_platform_access()` exige `app_current_tenant() IS NULL`).

### O que estava errado

`persons` e `financial_categories` usam `tenant_congregation_isolation` (ver
pendência nº 1), não a `tenant_isolation` simples que `004_rls_platform_plane.sql`
já abre em seis tabelas. O INSERT falhava com 42501 no meio da transação —
depois de já ter criado tenant, plano, branding, congregação, conta admin e
papel. `test/integration/platform-provisioning.spec.ts` pegou: 6 dos 7 testes
do describe caíram em cascata a partir do primeiro 500.

### Decisão — 2026-09-07, apresentada e confirmada pelo usuário

Estender o ramo de plataforma para essas duas tabelas, do mesmo jeito que
`004` já fez para `user_accounts`/`role_assignments` pelo mesmo motivo (o
próprio script já documentava esse precedente). Duas alternativas descartadas:

- `prisma.system` (BYPASSRLS) só para essas duas escritas — quebraria a
  atomicidade da transação única, que o serviço trata como propriedade
  importante (comentário no arquivo: "um tenant meio criado é pior que
  nenhum").
- Reverter a criação de `Person`/categorias e deixar DT-04 pela metade —
  descartada porque é justamente o que fecha o débito.

### O que entrou

`006_rls_platform_provisioning.sql`, rodando depois de `004` (depende de
`app_platform_access()`). Faz `ALTER POLICY tenant_congregation_isolation`
só em `persons` e `financial_categories`, por nome de tabela — não pelo loop
de `pg_policies` que `003_rls_admin_write.sql` usa, porque esse loop pegaria
as 22 tabelas que compartilham o nome da policy, e abrir o ramo de plataforma
nas outras 20 não tem motivo nenhum. `bootstrap-db.sh` ganhou o passo e mais
uma asserção na verificação, no mesmo formato das de `004`/`005`.

### Alcance

`app_platform_access()` continua exigindo `platform_support` resolvido no
banco **e** ausência de tenant no contexto. Qualquer rota autenticada normal
roda com tenant fixado (o `TenantContextInterceptor` sempre faz `set_config`),
então o primeiro termo do `OR` já resolve e o ramo de plataforma nunca chega
a ser avaliado fora de `ProvisionTenantService.provision()`. Não abre leitura
nem escrita de pessoas de tenants já existentes para o suporte.

---

## Registro

Ao resolver uma pendência, remova a seção e registre no commit o que foi
decidido — inclusive quando a decisão for aceitar o comportamento atual.
