# Orbien — Débitos Técnicos
**Documento de trabalho · Sprints 1–5**
Cada item tem: contexto, critério de conclusão e prompt pronto para colar no Claude Code.

---

## DT-01 · RLS Isolation Test Suite
**Prioridade:** ✅ CONCLUÍDO (2026-06-08)
**Commits:** `f866c37` (fix_rls_enforcement) · `edc40dd` (fix_congregation_isolation_policies)

### O que foi feito

**Diagnóstico inicial:** 14 testes escritos, 12 falharam. O Prisma conectava como `postgres` (BYPASSRLS=true no Supabase), fazendo com que todas as policies RLS fossem ignoradas — dados de qualquer tenant eram visíveis para qualquer outro.

**Correção em 3 etapas:**

1. **Role dedicado `orbien_app`** — criado no Supabase via SQL Editor com `NOBYPASSRLS`. `DATABASE_URL` atualizada para conectar como `orbien_app.hyoundxedeqvjufbnvae`. `DIRECT_URL` mantida com `postgres` para migrations.

2. **FORCE ROW LEVEL SECURITY** — aplicado em 22 tabelas de dados via migration. Tabelas de auth (`user_accounts`, `refresh_tokens`, `role_assignments`) e tabelas de referência (`roles`, `tenants`) foram excluídas deliberadamente (precisam funcionar antes do SET LOCAL no fluxo de login).

3. **Padrão B (congregation isolation)** — policies atualizadas em 15 tabelas para filtrar por `congregation_id` além de `tenant_id`, com exceção para `tenant_admin` e `denomination_admin` que veem todas as congregações do tenant.

**Resultado final:** 14/14 testes passando. Zero regressão nos endpoints existentes.

### Critério de conclusão (todos cumpridos)
- [x] Helper `runAsTenant(tenantId, congregationId, fn)` implementado em `test/helpers/rls.ts`
- [x] Teste cross-tenant passando para: `person`, `financial_transaction`, `small_group`
- [x] Teste cross-congregation passando
- [x] Teste de INSERT com `tenant_id` errado sendo rejeitado (WITH CHECK)
- [x] Teste de UPDATE tentando trocar `tenant_id` sendo rejeitado
- [x] Teste de privacidade de doador: membro comum não vê doações de outro membro
- [x] `npm test -- --testPathPattern=rls` passando com 0 falhas

### Nota operacional
A `DATABASE_URL` em produção (Render) também precisa apontar para `orbien_app`. Ao fazer deploy, atualizar a variável de ambiente no Render com a mesma string do `.env` local. Sem isso, produção continua rodando como `postgres` sem RLS.

---

## DT-02 · Migração Supabase us-west-1 → sa-east-1
**Prioridade:** 🔴 Bloqueante para go-live
**Depende de:** Janela de manutenção acordada com Doca Church
**Resolve junto com:** DT-03 (o timeout de 30s some automaticamente)

### Contexto
O projeto Supabase está provisionado em `us-west-1` (Oregon, EUA). Dados pessoais de brasileiros armazenados fora do país exigem base legal explícita de transferência internacional (Art. 33 LGPD). A região `sa-east-1` (São Paulo) elimina esse risco.

**Atenção pós DT-01:** ao criar o novo projeto em sa-east-1, será necessário recriar o role `orbien_app` com as mesmas permissões (NOBYPASSRLS, GRANTs em todas as tabelas, FORCE RLS nas 22 tabelas). Incluir o SQL do role no script de migração.

### Critério de conclusão
- [ ] Novo projeto Supabase criado em `sa-east-1`
- [ ] Role `orbien_app` criado no novo projeto com mesmas permissões
- [ ] `pg_dump` do banco atual executado e verificado
- [ ] `pg_restore` no novo projeto executado e verificado
- [ ] `FORCE ROW LEVEL SECURITY` confirmado nas 22 tabelas
- [ ] Variáveis `DATABASE_URL` e `DIRECT_URL` atualizadas no Render
- [ ] `npx prisma migrate deploy` rodado no novo banco
- [ ] Seed de credenciais de teste re-executado
- [ ] Testes RLS passando no novo banco: `npm test -- --testPathPattern=rls`
- [ ] Health check da API passando (`GET /api/health`)
- [ ] Latência de query medida — esperado < 50ms vs ~200ms atual
- [ ] Projeto antigo (us-west-1) pausado (não deletar ainda — 30 dias de quarentena)

### Prompt para Claude Code
```
Preciso executar a migração do banco Supabase de us-west-1 para sa-east-1 no projeto Orbien.

Contexto:
- Backend NestJS no Render, usa DATABASE_URL via variável de ambiente
- ORM: Prisma 6 — migrations já aplicadas, schema em prisma/schema.prisma
- Banco atual: Supabase us-west-1 (Oregon)
- Destino: novo projeto Supabase sa-east-1 (São Paulo)
- Role de aplicação: orbien_app (NOBYPASSRLS) — precisa ser recriado no novo projeto
- FORCE RLS aplicado em 22 tabelas — confirmar após restore

Me guie pelo processo completo:
1. Comando pg_dump correto para exportar o banco atual (incluindo dados, schema e roles)
2. Como criar o novo projeto Supabase em sa-east-1
3. SQL para recriar role orbien_app com todas as permissões
4. Comando pg_restore para importar no novo banco
5. Como atualizar DATABASE_URL e DIRECT_URL no Render
6. Verificação: rodar testes RLS + contagem de registros
7. Como medir a latência antes e depois

Crie um script bash migration-verify.sh que:
- Conecta em ambos os bancos
- Compara contagem de registros em todas as tabelas principais
- Verifica que FORCE RLS está ativo nas 22 tabelas
- Verifica que orbien_app tem NOBYPASSRLS
- Retorna diff se houver divergência
```

---

## DT-03 · Transaction Timeout 30s
**Prioridade:** 🟡 Temporário
**Depende de:** DT-02 (migração de região)
**Resolve junto com:** DT-02 — some automaticamente após migração

### Contexto
O timeout de transação foi aumentado para 30s como workaround para a alta latência do banco em us-west-1 (~200ms por query). Após a migração para sa-east-1, a latência cai para ~30–50ms e o timeout pode voltar para o padrão de 10s. Não exige ação separada — registrado aqui apenas para não esquecer de reverter.

### Critério de conclusão
- [ ] DT-02 concluído
- [ ] Timeout revertido para 10s no `PrismaService` ou onde estiver configurado
- [ ] Nenhum timeout disparado em 48h de operação normal no novo banco

### Prompt para Claude Code
```
Após a migração do Supabase para sa-east-1 (DT-02), preciso reverter o timeout
de transação que foi aumentado para 30s como workaround de latência.

Localize onde o timeout de transação está configurado no projeto NestJS/Prisma
e reverta para 10s (ou o padrão recomendado para a stack).

Após a mudança, rode o script de testes de integração existente para confirmar
que nenhuma operação normal está estourando o novo timeout.
```

---

## DT-04 · Fluxo de Onboarding de Tenant
**Prioridade:** ✅ CONCLUÍDO (2026-09-07)
**Depende de:** Sprint 5 concluído ✅
**Resolve junto com:** —

### Contexto
Quando um novo tenant é criado, o fluxo atual **não cria automaticamente** um registro `Person` para o usuário admin nem vincula o `person_id` no `UserAccount`. O seed foi corrigido manualmente para o ambiente de desenvolvimento, mas o fluxo de produto (formulário de cadastro → criação automática) não existe. Sem isso, o admin do tenant não aparece como pessoa no sistema e não pode receber notificações, ser escalado como voluntário ou ter histórico de doações.

### Critério de conclusão
- [x] `POST /platform/tenants` (o onboarding real do produto — não existe self-signup, é rota de `platform_support`) cria `Person` automaticamente na mesma transação
- [x] `UserAccount.person_id` é preenchido na criação
- [x] Seed de categorias padrão (12 itens) é executado automaticamente ao criar a congregação
- [x] Fluxo testado: `provision-tenant.service.spec.ts` (unidade) e `test/integration/platform-provisioning.spec.ts` (HTTP, banco real) — confirmam `person_id` preenchido e as 12 categorias
- [x] Sem impacto nos tenants existentes (Doca Church) — tenant já provisionado não é tocado por este fluxo

### O que foi feito

`ProvisionTenantDto` ganhou o campo obrigatório `admin_name`. `ProvisionTenantService.provision()` passou a criar, na mesma transação: um `Person` para o admin (`full_name` + `email`), o `UserAccount` já com `person_id` preenchido, e as 12 `FinancialCategory` padrão (mesma lista do `prisma/seed.ts`) na congregação recém-criada. `apps/admin/src/components/tenants/CreateTenantModal.tsx` ganhou o campo "Nome do admin" para acompanhar o novo campo obrigatório da API.

Não existe (e não é o desenho do produto) um `POST /auth/register` self-service — onboarding de tenant é sempre operação de `platform_support` via `POST /platform/tenants`, ver `PENDENCIAS.md`.

**Achado no caminho, registrado e fechado em `PENDENCIAS.md`:** `persons` e `financial_categories` não faziam parte do ramo de plataforma que `004_rls_platform_plane.sql` abre — o INSERT falhava com 42501 dentro da transação de provisionamento. `006_rls_platform_provisioning.sql` estende o mesmo ramo (`app_platform_access()`) só a essas duas tabelas.

### Prompt para Claude Code
```
Preciso implementar o fluxo completo de onboarding de tenant no Orbien.

Contexto atual:
- Existe um endpoint de registro/criação de conta (ajuste o path conforme o código real)
- UserAccount tem campo person_id (nullable hoje, deve ser obrigatório após este DT)
- Seed manual existe em prisma/seed.ts para criar Person e vincular — precisa virar lógica de produto

O que implementar:
1. Na criação de UserAccount para um novo tenant admin:
   - Criar Person na mesma transação ($transaction) com dados básicos do formulário
   - Preencher UserAccount.person_id com o ID da pessoa criada
   - Executar seed das 12 categorias financeiras padrão para a congregação

2. Garantir que UserAccount sem person_id é tratado graciosamente nas queries
   que dependem de person (não quebrar tenants legados)

3. Teste: criar tenant via API → verificar que person_id está preenchido no UserAccount
   → verificar que 12 categorias foram criadas para a congregação

Credenciais de teste existentes: fvargaspf@gmail.com / A3dodfemf (doca-church)
Não altere o tenant Doca Church — crie um novo tenant nos testes.
```

---

## DT-05 · Soft Delete + Anonimização LGPD em Person
**Prioridade:** ✅ CONCLUÍDO (2026-09-07)
**Depende de:** Sprint 5 concluído ✅
**Resolve junto com:** —

### Contexto
O mapeamento LGPD (`orbien-lgpd-mapping.md`) especifica em detalhes a função `anonymizePerson()` e o fluxo de `deletePerson()` com soft delete + hard delete após 30 dias. O schema tem campos `deleted_at` e `anonymized_at` em `Person`. Nenhuma das duas funções está implementada no código NestJS. Sem isso, não é possível atender direitos do titular (Art. 18 LGPD) com clientes reais.

### Critério de conclusão
- [x] `PATCH /persons/:id/anonymize` implementado (roles: admin_congregation, tenant_admin)
- [x] `DELETE /persons/:id` implementado com soft delete (sets `deleted_at`) — rejeita com 409 se há `financial_transaction.donor_person_id` apontando para essa pessoa (obrigar anonimização)
- [x] Job cron diário (`PersonsRetentionScheduler`, 3h) que elimina dados sensíveis 30 dias após `deleted_at` — mantém o registro, para não quebrar integridade referencial
- [x] Audit log criado em ambas as operações (`person.deleted`, `person.anonymized`)
- [x] `GET /persons` filtra `deleted_at IS NULL` por padrão
- [x] Teste: anonimizar pessoa → verifica `full_name = 'ANONIMIZADO'`, `phone`/`email`/`photo_url`/`birth_date` nulos, consentimentos revogados
- [x] Teste: deletar pessoa com doações → 409 com instrução de anonimizar

### O que foi feito

Migration `20260907045316_add_person_soft_delete_lgpd` adiciona `deleted_at`, `anonymized_at` e `anonymization_reason` em `Person`. `PersonsService.remove()` deixou de fazer hard delete: agora verifica `financial_transaction.donor_person_id` (409 se houver), seta `deleted_at` e grava `AuditLog` (`person.deleted`). `PersonsService.anonymize()` é novo: zera os campos de identificação, revoga os `ConsentRecord` ativos e grava `AuditLog` (`person.anonymized`). `PersonsRetentionScheduler`, cron diário às 3h via `prisma.system` (cross-tenant, BYPASSRLS), elimina os dados sensíveis de quem foi soft-deletado há mais de 30 dias e não pediu anonimização explícita — reaproveitando os mesmos campos, então o registro nunca é apagado de fato. Cobertura em `persons.service.spec.ts`, `persons.controller.spec.ts`.

### Prompt para Claude Code
```
Preciso implementar soft delete e anonimização LGPD no módulo Persons do Orbien.

Referência: orbien-lgpd-mapping.md seção 4.3 — tem o spec completo das funções
anonymizePerson() e deletePerson() com toda a lógica de negócio.

Schema Person já tem: deleted_at (DateTime?), anonymized_at (DateTime?)

Implementar:

1. PersonsService.anonymize(personId, tenantId):
   - Dentro de $transaction: zerar name, phone, email, photo_url, birth_date, tags
   - Setar anonymized_at = now(), anonymization_reason = 'Solicitação do titular - Art. 18, LGPD'
   - Revogar todos os consent_record (revoked_at = now())
   - Criar AuditLog action: 'person.anonymized'
   - financial_transaction.donor_person_id permanece — join retorna registro anonimizado

2. PersonsService.softDelete(personId, tenantId):
   - Verificar se existe financial_transaction com donor_person_id = personId
   - Se sim: rejeitar com HttpException 409 "Pessoa tem histórico financeiro. Use anonimização."
   - Se não: setar deleted_at = now(), criar AuditLog action: 'person.deleted'

3. Job cron (PersonsService.purgeExpiredSoftDeletes):
   - Roda diariamente às 3h
   - Busca person com deleted_at < agora - 30 dias
   - Hard-deleta dados sensíveis (mantém o registro com id para integridade referencial)
   - Registra em AuditLog

4. Filtro global: adicionar where: { deleted_at: null } em todos os findMany de Person

5. Controllers:
   - PATCH /persons/:id/anonymize — roles: admin_congregation, tenant_admin
   - DELETE /persons/:id — roles: admin_congregation, tenant_admin

Testes:
- Anonimizar pessoa → verificar campos zerados
- Deletar pessoa sem doações → verificar deleted_at preenchido
- Deletar pessoa com doações → verificar erro 409
- GET /persons não retorna pessoas com deleted_at preenchido
```

---

## DT-06 · Importação CSV/Excel de Membros
**Prioridade:** ✅ CONCLUÍDO (2026-09-07)
**Depende de:** Sprint 9 (exportação contábil — boa janela para fazer junto)
**Resolve junto com:** Sprint 9

### Contexto
Especificado no `produto-gestao-igrejas-mvp.md` como diferencial de migração. A maior dor de igrejas que saem de planilhas ou de outro sistema (Eklesia, InPeace) é a importação inicial de pessoas. Sem esse recurso, o onboarding da Doca Church e de futuros clientes será manual. Agrupado com o Sprint 9 porque a infraestrutura de processamento de arquivos (R2 + worker) já estará disponível.

### Critério de conclusão
- [x] `POST /persons/import` (preview) + `POST /persons/import/confirm` recebem CSV ou XLSX
- [x] Mapeamento de colunas guiado: `preview()` sugere mapeamento (nome, telefone, email, sexo, data nascimento, classificação) por alias normalizado
- [x] Deduplicação por telefone durante a importação — linhas duplicadas viram `skipped`, não erro
- [x] Consentimento LGPD em lote: cada `Person` importada cria `ConsentRecord` com `origin: 'import'`
- [x] Relatório de resultado: `{ imported, skipped, errors }` (síncrono) ou `job_id` + `GET /persons/import/jobs/:id` (assíncrono)
- [x] Limite de 5.000 linhas por importação — processamento assíncrono acima de 500

### O que já existia e o que foi fechado agora

A implementação (`apps/api/src/persons/import/`) já estava completa e coberta por `persons-import.service.spec.ts` (678 linhas) quando este débito foi revisitado em 2026-09-07 — só faltava o teto de 5.000 linhas do critério de conclusão, que `preview()` não verificava. Adicionado (`MAX_IMPORT_ROWS`), com teste cobrindo o caso de 5.001 linhas.

### Prompt para Claude Code
```
Preciso implementar importação de membros via CSV/Excel no módulo Persons do Orbien.

Stack: NestJS + Prisma + Multer para upload + xlsx (ou papaparse) para parse.

Endpoint: POST /persons/import
- Recebe multipart/form-data com campo 'file' (CSV ou XLSX, máx 10MB)
- Header Authorization: Bearer JWT (roles: admin_congregation, tenant_admin)

Fluxo:
1. Upload do arquivo → parse das primeiras 5 linhas → retornar preview com sugestão de mapeamento
   de colunas para os campos Person (nome, telefone, email, sexo, birth_date, classificação)

2. POST /persons/import/confirm com mapeamento confirmado pelo usuário → processar linhas:
   - Para cada linha: verificar deduplicação por telefone (mesmo padrão do módulo Persons)
   - Se duplicata: marcar como skip, incluir no relatório
   - Se novo: criar Person + ConsentRecord (source: 'import', consent_text: 'Importado em lote por admin')
   - Classificação default: visitor se não mapeado

3. Retornar ImportResult: { imported: number, skipped: number, errors: Array<{row, reason}> }

Limite: processar sincrono até 500 linhas. Acima disso, agendar job assíncrono e retornar job_id.

Multi-tenant: todo Person criado leva tenant_id + congregation_id do usuário autenticado.
Audit log: AuditLog action: 'persons.batch_import' com after: { count: imported }
```

---

## Resumo de prioridades

| ID | Débito | Prioridade | Status |
|---|---|---|---|
| DT-01 | RLS Isolation Test Suite | ✅ Concluído | 14/14 testes passando · 2026-06-08 |
| DT-02 | Migração Supabase sa-east-1 | 🔴 Bloqueante | Pendente — requer janela de manutenção e credenciais de infra; fora do escopo executável por código |
| DT-03 | Timeout 30s | 🟡 Temporário | Some com DT-02 |
| DT-04 | Onboarding de tenant | ✅ Concluído | Person + person_id + 12 categorias · 2026-09-07 |
| DT-05 | Soft delete + anonimização LGPD | ✅ Concluído | anonymize/soft delete/retenção 30 dias · 2026-09-07 |
| DT-06 | Importação CSV/Excel | ✅ Concluído | já implementado; fechado o teto de 5.000 linhas · 2026-09-07 |

---

*Atualizado em 2026-09-07 · DT-04, DT-05 e DT-06 fechados. DT-02/DT-03 seguem pendentes: exigem infraestrutura (novo projeto Supabase, janela de manutenção) e credenciais que uma sessão de código não tem acesso.*

