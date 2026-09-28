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
