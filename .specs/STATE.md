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
