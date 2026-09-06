# Briefing de sessão — Sprint 9
## Orbien API · Exportação Contábil + DRE + Importação CSV

Cole este prompt inteiro para abrir a sessão no novo chat.

---

## Contexto do projeto

Estou construindo o **Orbien** — SaaS white-label de gestão de igrejas, multi-tenant em 3 níveis (plataforma → denominação → congregação), voltado para igrejas evangélicas brasileiras de 50–300 membros.

**Repositório:** `orbien-api`  
**Domínio:** `useorbien.com`  
**Cliente zero:** Doca Church, Passo Fundo/RS

---

## Stack (não questionar — já está nos ADRs)

- Backend: NestJS + Prisma 6 + Postgres (Supabase como Postgres gerenciado — Auth/Storage do Supabase NÃO são usados)
- Auth: JWT próprio + Argon2
- ORM: Prisma
- Infra: Render (backend) + Vercel (frontend) + Cloudflare R2 (storage)
- Notificações: OneSignal
- PIX: Asaas
- Multi-tenancy: tabela compartilhada + tenant_id + congregation_id + RLS Postgres

---

## Estado atual — Sprints 1–8 concluídos

| Sprint | Módulo | Commits |
|---|---|---|
| S1 | Fundação (schema, auth JWT, RLS) | — |
| S2 | Pessoas (CRUD, deduplicação, QR check-in, dashboard demográfico) | — |
| S3 | Pequenos Grupos (hierarquia, presença, alertas) | — |
| S4 | Materiais de Estudo (upload R2, scheduler, OneSignal) | — |
| S5 | Financeiro (PIX manual + Asaas, categorias, transações, dashboard/forecast, webhooks) | — |
| S6 | Conteúdo e Notificações (AudienceSegment, ContentPost, auto-publish, métricas) | — |
| S7 | Voluntariado e Escalas (ministérios, perfis, escalas, slots, assignments, swap, check-in QR) | dd4b2be→33ffab2 |
| S8 | Celebrações e OC (Celebration, CelebrationInstance, ServiceOrder, Setlist, PDF pdfmake, schedulers) | da485b7→[último] |

**RLS: 24/24 ✅**

---

## Padrões obrigatórios (não alterar)

```
prisma.client   → request handlers (RLS ativo via TenantContextInterceptor + AsyncLocalStorage)
prisma.system   → schedulers e background jobs (BYPASSRLS — postgres role, DIRECT_URL)
@Transform      → conversão de query booleans (nunca @Type(() => Boolean))
runInTx         → operações M:N e multi-tabela (delete + createMany atomicamente)
withTx          → passagem de contexto de transação sem segurar conexão PgBouncer
```

---

## Credenciais de teste

```
fvargaspf@gmail.com       → tenant_admin + admin_congregation · tenant: doca-church
fernando.vargas@fill.tech → platform_support
API prefix: /api
```

---

## Débitos técnicos — status

| ID | Descrição | Status |
|---|---|---|
| DT-01 | RLS Isolation Test Suite | ✅ 24/24 |
| DT-02 | Migração Supabase us-west-1 → sa-east-1 | 🔴 Go-live blocker |
| DT-03 | Timeout 30s | 🟡 Monitorar em prod |
| DT-04 | Onboarding de tenant automatizado | 🔵 Desbloqueado |
| DT-05 | Soft delete + anonimização LGPD | 🔵 Desbloqueado |
| DT-06 | Importação CSV/Excel (pessoas) | ⬜ Este sprint |

---

## Escopo da Sprint 9

### Objetivo

Último sprint de backend antes do frontend. Dois entregáveis independentes:

**A) Exportação contábil** (Premium) — módulo financeiro já existe (S5); este sprint adiciona as exportações formais sobre os dados já lançados.

**B) Importação CSV/Excel de pessoas** (DT-06) — facilita migração de igrejas que vêm de planilha ou de outro sistema.

---

## A) Exportação Contábil

### Formatos requeridos

| Formato | Uso | Obs |
|---|---|---|
| **CSV padronizado** | Envio ao contador | Colunas: data, histórico, conta contábil, débito, crédito, centro de custo, documento |
| **OFX** | Conciliação em software contábil | Padrão Open Financial Exchange — amplamente aceito |
| **PDF razão/diário** | Relatório formal assinável | Gerado com pdfmake (mesmo padrão do S8) |
| **ZIP com comprovantes** | Pacote completo | Comprovantes R2 dos lançamentos do período selecionado |
| **SPED Contábil (ECD)** | Obrigação fiscal (quando aplicável) | Escopo limitado: gerar arquivo ECD com lançamentos do período — não validar SPED completo |

### Seleção de período

- Mês fechado, trimestre, ano fiscal
- Filtro por congregação e centro de custo

### DRE

- Demonstração de Resultado do Exercício configurável
- Receitas agrupadas por categoria × Despesas agrupadas por categoria
- Resultado líquido do período
- Comparativo período atual × período anterior
- Export PDF (pdfmake) e CSV

### Permissões

- `tesoureiro`, `admin_congregation`, `tenant_admin` → acesso completo
- `pastor` → vê DRE e totais; sem detalhe nominal por lançamento (LGPD + ética)
- `secretary` → sem acesso à exportação contábil

---

## B) Importação CSV/Excel de Pessoas (DT-06)

### Fluxo

```
POST /persons/import          → recebe arquivo (CSV ou XLSX, máx 10MB)
                                parse das primeiras 5 linhas
                                retorna preview + sugestão de mapeamento de colunas

POST /persons/import/confirm  → recebe mapeamento confirmado
                                processa linhas:
                                  deduplicação por telefone (mesmo padrão S2)
                                  se duplicata: skip + incluir no relatório
                                  se novo: criar Person + ConsentRecord
                                           (source: 'import', consent_text: 'Importado em lote por admin')
                                  classificação default: visitor se não mapeado
                                retorna ImportResult: { imported, skipped, errors: [{row, reason}] }
```

### Limites

- Até 500 linhas: processamento síncrono
- Acima de 500: job assíncrono → retornar `job_id`
- Multi-tenant: todo Person criado leva `tenant_id` + `congregation_id` do usuário autenticado
- Audit log: `action: 'persons.batch_import'`, `after: { count: imported }`

### Colunas mapeáveis

`nome` · `telefone` · `email` · `sexo` · `birth_date` · `classificação`

---

## Entidades novas (verificar se já existem no schema.prisma antes de criar migration)

| Tabela | Campos principais |
|---|---|
| `export_jobs` | id · tenant_id · congregation_id · type (csv/ofx/pdf/zip/sped/dre) · status (pending/processing/done/error) · period_start · period_end · file_url (R2) · error_message · created_by · created_at |
| `import_jobs` | id · tenant_id · congregation_id · type (persons) · status · total_rows · imported · skipped · errors (jsonb) · created_by · created_at |

> Exportações pequenas (CSV, PDF simples) podem ser síncronas e retornar URL diretamente.  
> Exportações grandes (ZIP com comprovantes, SPED) devem ser assíncronas com `export_jobs`.

---

## Passos sugeridos

1. **DRE** — serviço + endpoint GET (síncrono, dados já no banco do S5)
2. **Export CSV padronizado + OFX** — síncrono para períodos ≤ 3 meses; assíncrono acima
3. **Export PDF razão/diário** — pdfmake (mesmo padrão S8)
4. **Export ZIP com comprovantes** — assíncrono, `export_jobs`, upload R2
5. **Export SPED ECD** — arquivo texto formato SPED, assíncrono
6. **Importação CSV/Excel de pessoas** (DT-06)
7. **Testes consolidados + RLS**

---

## Como quero que você atue

- Multi-tenant desde o primeiro endpoint (tenant_id + congregation_id em tudo)
- prisma.client em handlers, prisma.system em jobs assíncronos
- LGPD: pastor não vê detalhe nominal em exportações — só totais
- Código TypeScript estrito, NestJS com decorators, Prisma para banco
- Quando eu disser "pode codar": entregue código pronto para colar
- Faça perguntas quando faltar contexto crítico, mas só uma por vez
- Respostas diretas — sem padding

**Gere o briefing completo da Sprint 9 seguindo o formato dos sprints anteriores, com os passos de implementação e prompts prontos para o Claude Code.**

