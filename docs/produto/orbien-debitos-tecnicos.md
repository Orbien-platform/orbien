# Orbien — Débitos Técnicos
**Documento de trabalho · Sprints 1–4**
Cada item tem: contexto, critério de conclusão e prompt pronto para colar no Claude Code.

---

## DT-01 · RLS Isolation Test Suite
**Prioridade:** 🔴 Bloqueante para go-live
**Depende de:** Nada — pode rodar agora
**Resolve junto com:** —

### Contexto
A estratégia de RLS está documentada em `orbien-rls-strategy.md` e as policies foram aplicadas nas migrations dos Sprints 1–4, mas **nenhum teste automatizado foi executado formalmente**. O risco é real: se o contexto de tenant não for injetado corretamente em algum path code, o Postgres executa a query sem o `SET LOCAL` e retorna dados de outros tenants.

### Critério de conclusão
- [ ] Helper `runAsTenant(tenantId, congregationId, fn)` implementado em `test/helpers/rls.ts`
- [ ] Teste cross-tenant passando para: `person`, `financial_transaction`, `small_group`, `group_meeting`, `attendance_record`
- [ ] Teste cross-congregation passando para as mesmas tabelas
- [ ] Teste de INSERT com `tenant_id` errado sendo rejeitado (WITH CHECK)
- [ ] Teste de UPDATE tentando trocar `tenant_id` sendo rejeitado
- [ ] Teste de privacidade de doador: membro comum não vê doações de outro membro
- [ ] `npm test -- --testPathPattern=rls` passando com 0 falhas

### Prompt para Claude Code
```
Preciso implementar a suite de testes de isolamento RLS do Orbien.

Stack: NestJS + Prisma 6 + Postgres (Supabase). Multi-tenancy com tabela compartilhada,
tenant_id + congregation_id em cada registro. RLS via SET LOCAL em transactions Prisma.

Credenciais de teste disponíveis no seed:
- Tenant A: doca-church (fvargaspf@gmail.com)
- Precisamos criar um Tenant B só para os testes de isolamento

Crie em test/helpers/rls.ts:
- Função runAsTenant(tenantId: string, congregationId: string, fn: () => Promise<T>): Promise<T>
  que seta SET LOCAL app.tenant_id e app.congregation_id antes de executar fn

Crie test/rls/isolation.spec.ts com os seguintes cenários:
1. Cross-tenant read: usuário Tenant B não vê person do Tenant A
2. Cross-tenant write: INSERT com tenant_id do Tenant A sendo feito como Tenant B → rejeitar
3. Cross-congregation read: congregation X não vê person da congregation Y do mesmo tenant
4. Donor privacy: SELECT em financial_transaction com donor_person_id de outro membro retorna null
5. UPDATE tamper: tentativa de atualizar tenant_id de um registro → rejeitar

Tabelas a cobrir na primeira rodada: person, financial_transaction, small_group, group_meeting.

Siga o padrão Jest + Prisma. Use transações que fazem rollback ao final de cada teste para
não sujar o banco. Consulte orbien-rls-strategy.md para os padrões de policy aplicados.
```

---

## DT-02 · Migração Supabase us-west-1 → sa-east-1
**Prioridade:** 🔴 Bloqueante para go-live
**Depende de:** Janela de manutenção acordada com Doca Church
**Resolve junto com:** DT-03 (o timeout de 30s some automaticamente)

### Contexto
O projeto Supabase está provisionado em `us-west-1` (Oregon, EUA). Dados pessoais de brasileiros armazenados fora do país exigem base legal explícita de transferência internacional (Art. 33 LGPD). A região `sa-east-1` (São Paulo) elimina esse risco. A migração é cirúrgica: apenas a connection string muda no Render — sem reescrita de código.

### Critério de conclusão
- [ ] Novo projeto Supabase criado em `sa-east-1`
- [ ] `pg_dump` do banco atual executado e verificado
- [ ] `pg_restore` no novo projeto executado e verificado
- [ ] Variável `DATABASE_URL` no Render atualizada
- [ ] `npx prisma migrate deploy` rodado no novo banco (migrations idempotentes)
- [ ] Seed de credenciais de teste re-executado
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

Me guie pelo processo completo:
1. Comando pg_dump correto para exportar o banco atual (incluindo dados e schema)
2. Como criar o novo projeto Supabase e obter a connection string
3. Comando pg_restore para importar no novo banco
4. Como atualizar DATABASE_URL no Render sem downtime (deploy com nova variável)
5. Verificação: query de contagem em person, financial_transaction, small_group
6. Como medir a latência antes e depois

Importante: as migrations Prisma são idempotentes — após o restore, rodar
npx prisma migrate deploy para garantir que o migration_history está sincronizado.

Crie também um script bash migration-verify.sh que:
- Conecta em ambos os bancos
- Compara contagem de registros em todas as tabelas principais
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
**Depende de:** Sprint 5 concluído (Financial cria tabelas que precisam de seed)
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
**Depende de:** Sprint 5 concluído (financial_transaction com donor_person_id precisa existir)
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

| ID | Débito | Prioridade | Quando resolver |
|---|---|---|---|
| DT-01 | RLS Isolation Test Suite | 🔴 Bloqueante | Antes do go-live — pode rodar agora |
| DT-02 | Migração Supabase sa-east-1 | 🔴 Bloqueante | Antes do go-live — requer janela de manutenção |
| DT-03 | Timeout 30s | 🟡 Temporário | Some com DT-02 |
| DT-04 | Onboarding de tenant | 🟡 Pré-lançamento | Após Sprint 5 |
| DT-05 | Soft delete + anonimização LGPD | 🟡 Pré-lançamento | Após Sprint 5 |
| DT-06 | Importação CSV/Excel | ⚪ Desejável | Sprint 9 |

---

*Gerado em 2026-06-05 · Atualizar este documento ao fechar cada item.*

