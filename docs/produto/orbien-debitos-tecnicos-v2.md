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
**Prioridade:** 🟡 Pré-lançamento
**Depende de:** Sprint 5 concluído ✅
**Resolve junto com:** —

### Contexto
Quando um novo tenant é criado, o fluxo atual **não cria automaticamente** um registro `Person` para o usuário admin nem vincula o `person_id` no `UserAccount`. O seed foi corrigido manualmente para o ambiente de desenvolvimento, mas o fluxo de produto (formulário de cadastro → criação automática) não existe. Sem isso, o admin do tenant não aparece como pessoa no sistema e não pode receber notificações, ser escalado como voluntário ou ter histórico de doações.

### Critério de conclusão
- [ ] `POST /auth/register` (ou equivalente de onboarding) cria `Person` automaticamente na mesma transação
- [ ] `UserAccount.person_id` é preenchido na criação
- [ ] Seed de categorias padrão (12 itens) é executado automaticamente ao criar a congregação
- [ ] Fluxo testado end-to-end: criar tenant → logar → verificar que person_id está presente no JWT
- [ ] Sem impacto nos tenants existentes (Doca Church)

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
**Prioridade:** 🟡 Pré-lançamento (obrigatório antes de dados reais)
**Depende de:** Sprint 5 concluído ✅
**Resolve junto com:** —

### Contexto
O mapeamento LGPD (`orbien-lgpd-mapping.md`) especifica em detalhes a função `anonymizePerson()` e o fluxo de `deletePerson()` com soft delete + hard delete após 30 dias. O schema tem campos `deleted_at` e `anonymized_at` em `Person`. Nenhuma das duas funções está implementada no código NestJS. Sem isso, não é possível atender direitos do titular (Art. 18 LGPD) com clientes reais.

### Critério de conclusão
- [ ] `PATCH /persons/:id/anonymize` implementado (roles: admin_congregation, tenant_admin)
- [ ] `DELETE /persons/:id` implementado com soft delete (sets `deleted_at`) — rejeita se há `financial_transaction.donor_person_id` apontando para essa pessoa (obrigar anonimização)
- [ ] Job cron diário que hard-deleta dados sensíveis 30 dias após `deleted_at`
- [ ] Audit log criado em ambas as operações
- [ ] `GET /persons` e todos os endpoints de listagem filtram `deleted_at IS NULL`
- [ ] Teste: anonimizar pessoa → verificar que name = 'ANONIMIZADO', phone = null, email = null
- [ ] Teste: deletar pessoa com doações → receber erro 409 com instrução de anonimizar

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
**Prioridade:** ⚪ Desejável (pré-lançamento)
**Depende de:** Sprint 9 (exportação contábil — boa janela para fazer junto)
**Resolve junto com:** Sprint 9

### Contexto
Especificado no `produto-gestao-igrejas-mvp.md` como diferencial de migração. A maior dor de igrejas que saem de planilhas ou de outro sistema (Eklesia, InPeace) é a importação inicial de pessoas. Sem esse recurso, o onboarding da Doca Church e de futuros clientes será manual. Agrupado com o Sprint 9 porque a infraestrutura de processamento de arquivos (R2 + worker) já estará disponível.

### Critério de conclusão
- [ ] `POST /persons/import` recebe multipart com arquivo CSV ou XLSX
- [ ] Mapeamento de colunas guiado: frontend exibe preview com sugestão de mapeamento (nome, telefone, email, sexo, data nascimento, classificação)
- [ ] Deduplicação por telefone durante a importação — linhas duplicadas geram alerta, não erro
- [ ] Consentimento LGPD em lote: importação cria `consent_record` com fonte `import`
- [ ] Relatório de resultado: X importados, Y duplicatas ignoradas, Z erros
- [ ] Limite de 5.000 linhas por importação (processamento assíncrono acima de 500)

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
| DT-02 | Migração Supabase sa-east-1 | 🔴 Bloqueante | Pendente — requer janela de manutenção |
| DT-03 | Timeout 30s | 🟡 Temporário | Some com DT-02 |
| DT-04 | Onboarding de tenant | 🟡 Pré-lançamento | Desbloqueado (Sprint 5 concluído) |
| DT-05 | Soft delete + anonimização LGPD | 🟡 Pré-lançamento | Desbloqueado (Sprint 5 concluído) |
| DT-06 | Importação CSV/Excel | ⚪ Desejável | Sprint 9 |

---

*Atualizado em 2026-06-08 · DT-01 fechado, DT-02 atualizado com notas pós-DT-01.*

