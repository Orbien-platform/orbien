# Mapeamento LGPD — Orbien (Visão de Engenharia)

**Documento técnico de conformidade · v0.1**
Complementa os documentos legais já existentes (DPA, Política de Privacidade, Contrato v4).
Audiência: backend, frontend, DevOps. Não substitui revisão jurídica.

---

## 1. Por que igreja é caso especial em LGPD

Filiação religiosa é classificada pelo **Art. 11 da LGPD como dado pessoal sensível**. O tratamento exige base legal mais restrita que dados comuns: consentimento específico, ou exercício regular de direitos pela entidade religiosa, ou outras bases do Art. 11.

**Consequência prática:**
- Toda pessoa cadastrada como `member` ou `attendee` em uma congregação tem dado sensível registrado pelo simples vínculo
- Visitantes (sem vínculo eclesiástico formalizado) não geram dado sensível pelo vínculo, mas o cadastro ainda é dado pessoal comum
- Crianças (menores de 18) exigem consentimento dos responsáveis legais (Art. 14)

Toda decisão de modelagem e exposição leva isso em conta.

---

## 2. Classificação de dados por categoria

### 2.1 Dado pessoal sensível (Art. 5º, II e Art. 11)

| Campo / contexto | Onde fica | Base legal aplicada |
|---|---|---|
| Vínculo eclesiástico (member, attendee, leader) | `person.classification`, `person_role` | Consentimento OU exercício regular de direitos pela entidade religiosa (a confirmar com jurídico) |
| Histórico de classificação | `classification_history` | Idem |
| Participação em ministérios | `volunteer_profile`, `ministry` | Idem |
| Participação em grupos | `group_membership` | Idem |
| Pedidos de oração que revelem dado sensível | conteúdo de `prayer_request` | Consentimento explícito do titular |

### 2.2 Dado pessoal comum (Art. 5º, I)

| Campo | Onde fica | Base legal |
|---|---|---|
| Nome, telefone, email | `person` | Consentimento (cadastro) ou execução de contrato (admin) |
| Endereço | `person`, `household` | Idem |
| Foto | `person.photo_url` (storage R2) | Consentimento explícito |
| Sexo, data de nascimento | `person` | Consentimento |
| Estado civil, profissão | `person` | Consentimento |

### 2.3 Dado financeiro

| Campo | Onde fica | Base legal | Retenção mínima |
|---|---|---|---|
| Lançamentos de doação identificada | `financial_transaction.donor_person_id` | Execução de contrato + obrigação legal contábil | 5 anos (legislação fiscal) |
| Recibos emitidos | `transaction_attachment` | Obrigação legal | 5 anos |
| Dados de PIX (txid, status) | `pix_payment` | Execução de contrato | 5 anos |

### 2.4 Dado de crianças (Art. 14)

| Contexto | Tratamento |
|---|---|
| Cadastro de criança no ministério infantil | Responsabilidade da Igreja, consentimento dos responsáveis legais |
| Foto de criança | Consentimento expresso dos responsáveis, com finalidade específica |
| Anonimização em relatórios públicos | Obrigatória — nunca expor nome de menor em página pública (ex: "encontre uma célula") |

**Decisão de produto:** o MVP **não trata cadastros do ministério infantil** diretamente — fica para fase futura. Quando entrar, requer fluxo de consentimento específico do responsável.

### 2.5 Dado de autenticação e auditoria

| Campo | Onde fica | Base legal | Retenção |
|---|---|---|---|
| Senha (hash Argon2) | `user_account.password_hash` | Execução de contrato | Enquanto conta ativa |
| Tokens JWT (refresh) | `refresh_token` (com rotation) | Execução de contrato | Conforme expiração |
| Logs de acesso | `audit_log` | Legítimo interesse (Marco Civil Art. 15) | 2 anos |
| IP, user-agent | `consent_record`, `audit_log` | Legítimo interesse | 2 anos |

---

## 3. Consentimento — implementação técnica

### 3.1 Pontos de coleta de consentimento

| Cenário | Versão do termo | Campos coletados |
|---|---|---|
| Cadastro rápido de visitante (QR público) | `visitor_consent_v1` | Aceito comunicações + ciência do uso |
| Cadastro completo de membro (autoatualização) | `member_consent_v1` | Aceito comunicações + tratamento de dado religioso |
| Onboarding de admin/secretária | `staff_consent_v1` | Aceito tratamento de dados em nome da entidade |
| Doação avulsa (página pública) | `donor_consent_v1` | Aceito uso para emissão de recibo |

### 3.2 Schema obrigatório do consent_record

```sql
CREATE TABLE consent_record (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  congregation_id uuid NOT NULL,
  person_id uuid NOT NULL REFERENCES person(id),
  version text NOT NULL,              -- ex: 'visitor_consent_v1'
  consented_at timestamptz NOT NULL,
  ip inet NOT NULL,
  user_agent text NOT NULL,
  origin text NOT NULL,               -- service|small_group|event|other
  revoked_at timestamptz,             -- preenchido em caso de revogação
  revocation_reason text
);

CREATE INDEX idx_consent_person ON consent_record(person_id, consented_at DESC);
```

**Regras de negócio aplicadas no NestJS:**
- Não permitir cadastro de visitante sem `consent_record` correspondente criado na mesma transação
- Não permitir envio de notificação push/email para pessoa cuja última versão de consentimento foi revogada
- Histórico de consentimento é imutável (somente INSERT, nunca UPDATE/DELETE — exceto preenchimento de `revoked_at`)

### 3.3 Versionamento de termos

Todo termo de consentimento exibido ao usuário fica versionado em arquivo Markdown no repositório do projeto:

```
/legal/
  /consent-terms/
    visitor_consent_v1.md
    visitor_consent_v2.md  ← quando texto mudar
    member_consent_v1.md
```

Frontend renderiza a versão vigente. `consent_record.version` aponta para a versão exibida no momento do aceite. Histórico nunca é alterado.

---

## 4. Direitos do titular (Art. 18) — implementação

### 4.1 Confirmação e acesso (Art. 18, I e II)

**Membro autenticado:**
- Endpoint `GET /me/personal-data` retorna JSON completo de tudo que está em `person` + relacionamentos
- Inclui: consentimentos, histórico de classificação, doações próprias, participações em grupos, escalas

**Pessoa não autenticada (ex: visitante):**
- Solicitação manual via canal de privacidade (email DPO)
- Suporte gera relatório usando ferramenta interna autenticada e auditada
- SLA: 15 dias úteis

### 4.2 Correção (Art. 18, III)

- Membro autenticado edita dados básicos no app (`PATCH /me`)
- Dados sensíveis (classificação, ministérios) só por admin da congregação
- Toda alteração registrada em `audit_log` com `before` / `after`

### 4.3 Anonimização, bloqueio ou eliminação (Art. 18, IV)

**Anonimização (preferida quando há retenção obrigatória):**

```typescript
// Função aplicada quando pessoa solicita esquecimento mas há vínculo financeiro
async function anonymizePerson(personId: string, tenantId: string) {
  await prisma.$transaction([
    prisma.person.update({
      where: { id: personId },
      data: {
        full_name: 'ANONIMIZADO',
        phone: null,
        email: null,
        photo_url: null,
        birth_date: null,
        tags: [],
        anonymized_at: new Date(),
        anonymization_reason: 'Solicitação do titular - Art. 18, LGPD',
      },
    }),
    // financial_transaction.donor_person_id permanece, mas joins agora vão para registro anonimizado
    prisma.consentRecord.updateMany({
      where: { person_id: personId },
      data: { revoked_at: new Date(), revocation_reason: 'Anonimização solicitada' },
    }),
    prisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        action: 'person.anonymized',
        subject_person_id: personId,
        // ...
      },
    }),
  ]);
}
```

**Eliminação (quando não há vínculo financeiro/legal):**

```typescript
async function deletePerson(personId: string) {
  // 1. Verificar: existe financial_transaction com donor_person_id = personId?
  //    Se sim, OBRIGAR anonimização em vez de delete
  // 2. Cascade: group_membership, attendance_record, consent_record, etc.
  // 3. Soft delete em person com deleted_at + razão
  // 4. Hard delete dos dados sensíveis após 30 dias
  // 5. Audit log imutável permanece (com person_id, sem PII)
}
```

### 4.4 Portabilidade (Art. 18, V)

- Endpoint `GET /me/export` gera ZIP com:
  - `person.json` — dados cadastrais
  - `consents.json` — histórico de consentimentos
  - `groups.json` — grupos em que participou
  - `donations.json` — histórico de doações próprias
  - `photos/` — fotos enviadas
- Disponível para download por 7 dias após geração

### 4.5 Revogação de consentimento (Art. 18, IX)

- Membro autenticado pode revogar via `POST /me/revoke-consent` indicando versão
- Sistema marca `consent_record.revoked_at` e remove pessoa de campanhas de notificação
- Dados continuam armazenados sob base legal de retenção (se aplicável) ou são eliminados em 30 dias

---

## 5. Retenção de dados

| Categoria | Prazo de retenção | Base legal |
|---|---|---|
| Dados financeiros e transacionais | 5 anos após o fim do contrato | Obrigação legal (Res. CFC 1.330/2011) |
| Cadastro de membro com histórico financeiro | 5 anos | Vinculado ao prazo financeiro |
| Cadastro de membro sem vínculo financeiro | 2 anos após inatividade | Legítimo interesse |
| Cadastro de visitante sem evolução | 1 ano após último contato | Legítimo interesse mínimo |
| Logs de acesso e auditoria | 2 anos | Marco Civil Art. 15 |
| Registros de consentimento | 5 anos após revogação | Evidência de conformidade |
| Dados de menor de 18 anos | Eliminação em 30 dias após fim do contrato | Sem base legal residual |
| Dados sensíveis religiosos sem vínculo financeiro | 2 anos após inatividade | Resolução de disputas |

### 5.1 Job de retenção

Job diário no NestJS (cron) que:
1. Identifica `person` com `last_activity < hoje - retenção aplicável`
2. Aplica anonimização ou eliminação conforme regra
3. Registra em `audit_log` cada ação
4. Notifica admin da congregação semanalmente sobre dados próximos do limite

---

## 6. Suboperadores e transferência internacional

Documento legal lista todos os suboperadores. Resumo técnico:

| Suboperador | Função | Local | Transferência internacional |
|---|---|---|---|
| Supabase | Postgres gerenciado | sa-east-1 (São Paulo) | Não |
| Render | Hospedagem backend | EUA (Oregon) | Sim — cláusulas contratuais padrão |
| Vercel | Hospedagem frontend | US/edge global | Sim — cláusulas contratuais padrão |
| Cloudflare R2 | Storage de mídia | edge Brasil | Não (configurado para sa-east) |
| Asaas | PIX | Brasil | Não |
| OneSignal | Notificações push | EUA | Sim — cláusulas + dados não-PII (apenas tokens e tags) |

**Decisão técnica para OneSignal:** nunca enviar nome, email ou dado financeiro como tag. Tags permitidas: `tenant_id`, `congregation_id`, `role`, `pg_ids`, `language`. Conteúdo da notificação não inclui PII além do primeiro nome (quando estritamente necessário ao contexto).

---

## 7. Logs e auditoria

### 7.1 Eventos obrigatoriamente logados

- Login (sucesso e falha) com IP
- Alteração de papel (`role_assignment`)
- Alteração de classificação (`classification_history`)
- Lançamento financeiro (criação, edição, exclusão — valor anterior preservado)
- Exclusão de pessoa
- Exportação de dados pessoais
- Revogação de consentimento
- Acesso de suporte impersonando tenant

### 7.2 Schema de audit_log

```sql
CREATE TABLE audit_log (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  congregation_id uuid,
  actor_user_id uuid REFERENCES user_account(id),
  subject_person_id uuid REFERENCES person(id),
  entity text NOT NULL,        -- 'person', 'financial_transaction', etc.
  action text NOT NULL,         -- 'created', 'updated', 'deleted', 'anonymized'
  before jsonb,                 -- estado anterior (NULL para create)
  after jsonb,                  -- estado novo (NULL para delete)
  ip inet,
  user_agent text,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_tenant_at ON audit_log(tenant_id, at DESC);
CREATE INDEX idx_audit_subject ON audit_log(subject_person_id);
```

**Imutabilidade:** trigger Postgres rejeita UPDATE e DELETE em `audit_log`. Apenas INSERT é permitido.

```sql
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
  EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
  EXECUTE FUNCTION audit_log_immutable();
```

---

## 8. Incidentes de segurança

### 8.1 Detecção
- Alertas em queries cross-tenant suspeitas
- Anomalias de volume (export massivo, acesso fora de horário)
- Falhas repetidas de autenticação

### 8.2 Resposta (SLA contratual: notificação em 72h)
1. Conter — revogar tokens, isolar tenant afetado
2. Avaliar — natureza, volume, dados afetados
3. Notificar a Igreja CONTRATANTE (Controladora)
4. Apoiar notificação à ANPD se aplicável
5. Documentar causa-raiz e medidas corretivas
6. Reter registro do incidente por 2 anos

---

## 9. Checklist de conformidade — pré-go-live

- [ ] Todas as tabelas com PII têm RLS ativo
- [ ] Suite de testes de isolamento passando
- [ ] Termo de consentimento revisado por jurídico para cada cenário
- [ ] Fluxo de cadastro rápido bloqueado sem consentimento aceito
- [ ] Endpoints de exportação de dados implementados e testados
- [ ] Endpoints de anonimização e exclusão implementados e testados
- [ ] Job de retenção configurado e dry-run validado
- [ ] Audit log imutável funcionando
- [ ] Documentação de incident response disponível para o time
- [ ] DPO ou ponto focal de privacidade definido
- [ ] DPA assinado com todos os suboperadores listados
- [ ] Cláusulas de transferência internacional revisadas
- [ ] Política de privacidade publicada em endpoint público
- [ ] Termos de uso publicados em endpoint público

---

## 10. Itens em aberto para revisão jurídica

Os itens abaixo já foram sinalizados nos documentos legais e seguem pendentes:

1. Base legal definitiva para dados religiosos (consentimento vs. exercício regular de direitos pela entidade)
2. Necessidade formal de DPO (Encarregado de Proteção de Dados)
3. Mecanismo definitivo de adequação para transferência internacional (OneSignal)
4. Base legal para dados de crianças (responsabilidade exclusiva da Igreja ou co-responsabilidade)

Engenharia segue as definições padrão deste documento; jurídico pode ajustar termos e prazos sem mudança de modelagem.

---

*Última atualização: 2026-05 — versão inicial técnica.*

