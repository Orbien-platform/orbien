# ADRs — Architecture Decision Records
## Church Platform

Cada decisão de arquitetura relevante é registrada aqui.
Formato: contexto → decisão → consequências → status.
Status possíveis: `proposto` · `decidido` · `depreciado` · `substituído`

---

## ADR-001 — Estratégia de multi-tenancy

**Data:** 2026-05
**Status:** `decidido`

**Contexto**
O sistema precisa suportar múltiplos tenants (denominações e congregações) com isolamento completo de dados, personalização visual e hierarquia de 3 níveis (plataforma → denominação → congregação).

**Decisão**
**(C) Tabela compartilhada com `tenant_id` + Row-Level Security (RLS) no Postgres.**

**Consequências**
- Todo registro carrega `tenant_id` + `congregation_id` — queries sempre filtradas por escopo
- Migrations centralizadas, operação simples, custo baixo
- RLS é a camada de segurança principal — precisa de testes rigorosos e revisão de segurança antes do go-live
- Isolamento físico (schema/banco separado) pode ser oferecido como add-on enterprise futuro sem reescrever a base

---

## ADR-002 — Stack de backend

**Data:** 2026-05
**Status:** `decidido`

**Contexto**
API robusta para suportar multi-tenant, autenticação própria, filas de notificação, webhooks de PIX e lógica de negócio dos 4 módulos do MVP.

**Decisão**
**(A) Node.js + NestJS.**

**Consequências**
- Ecossistema JavaScript unificado em toda a stack (NestJS + Next.js + React Native)
- NestJS tem estrutura forte (módulos, DI, guards, interceptors) — facilita organização multi-tenant
- Excelente integração com Prisma (ADR-010)
- Claude Code opera com alta precisão nessa stack
- Grande pool de devs JavaScript no Brasil para eventual contratação

---

## ADR-003 — Stack de frontend web (admin)

**Data:** 2026-05
**Status:** `decidido`

**Contexto**
Painel administrativo web usado por secretaria, tesoureiro, pastor e líderes. Inclui páginas públicas (formulário de visitante via QR code, página "encontre uma célula", recibo de doação).

**Decisão**
**(A) Next.js + Tailwind + Shadcn/UI.**

**Consequências**
- SSR nativo para páginas públicas (formulário de visitante, "encontre uma célula") — melhor performance e SEO
- Shadcn/UI acelera o design system — componentes de alta qualidade prontos para customizar
- Deploy natural na Vercel (ADR-008)
- Tailwind alinha com React Native via NativeWind no mobile — tokens compartilháveis

---

## ADR-004 — Stack de mobile

**Data:** 2026-05
**Status:** `decidido`

**Contexto**
App mobile white-label para membros e liderança. Precisa de temas dinâmicos por tenant, notificações push, QR code e câmera.

**Decisão**
**(A) React Native + Expo.**

**Consequências**
- Ecossistema JavaScript unificado com backend e frontend web
- Expo abstrai certificados APNs/FCM — zero configuração de push no MVP
- OTA updates (Expo Updates) permitem corrigir bugs sem passar pela loja
- White-label via tema dinâmico carregado por tenant_id no login
- EAS Build (Expo Application Services) para builds de produção e builds por tenant no plano premium

---

## ADR-005 — Modelo de white-label no mobile

**Data:** 2026-05
**Status:** `decidido`

**Contexto**
Como o app chega nas mãos do membro de cada igreja cliente.

**Decisão**
**(C) Híbrido: app único com skins para plano starter, build por tenant para plano premium.**

**Consequências**
- Plano starter: um app nas lojas com tema carregado dinamicamente pelo tenant_id — lançamento rápido, uma release serve todos
- Plano premium: build próprio por tenant via EAS Build — cada igreja tem seu app com nome e ícone próprios nas lojas
- Dois pipelines de release para manter (starter + premium), mas EAS automatiza grande parte
- White-label premium vira alavanca comercial importante — diferencial contra InPeace e inChurch

---

## ADR-006 — Autenticação e autorização

**Data:** 2026-05
**Status:** `decidido`

**Contexto**
Sistema com múltiplos papéis e escopos (denominação, congregação, célula). Banco no Supabase mas tratado como Postgres puro para evitar vendor lock-in.

**Decisão**
**Auth próprio no NestJS: JWT (access token curto) + refresh token (rotation), Argon2 para hash de senhas. Supabase usado apenas como Postgres gerenciado — Supabase Auth não é usado.**

**Consequências**
- Zero vendor lock-in em autenticação — migrar o banco no futuro é só trocar a connection string
- Responsabilidade de segurança é nossa — requer implementação cuidadosa de refresh token rotation, revogação e proteção contra timing attacks
- Controle total sobre claims do JWT (tenant_id, congregation_id, roles) — essencial para o RLS
- MFA pode ser adicionado depois sem dependência de fornecedor externo
- Guards do NestJS + decorators customizados para autorização por escopo

---

## ADR-007 — Provedor de PIX e modelo de doação

**Data:** 2026-05
**Status:** `decidido`

**Contexto**
PIX é o único método de doação online no MVP. Igrejas podem não ter CNPJ ou preferir não usar provedor. Plataforma precisa de modelo de receita sobre transações.

**Decisão**
**Asaas como provedor de PIX, com três cenários de doação:**

**Cenário 1 — Igreja sem CNPJ ou que não quer usar provedor (plano básico)**
- Sistema exibe chave PIX cadastrada da igreja
- Botão "Copiar chave PIX" — usuário vai ao próprio banco e faz a transferência manualmente
- Sistema não processa o pagamento — zero integração com provedor, zero custo
- Limitação: sem confirmação automática, sem recibo automático, sem registro automático no financeiro

**Cenário 2 — Igreja com CNPJ usando provedor (plano pro)**
- PIX dinâmico com QR code identificado por doador e categoria via Asaas
- Confirmação automática via webhook → lançamento automático no financeiro
- Recibo automático por email/PDF
- PIX recorrente (PIX Automático via Asaas) — diferencial premium
- Split automático: plataforma retém ~1% por transação (Asaas cobra ~1% → custo efetivo ~2% para a igreja)

**Cenário 3 — Doação avulsa sem login (página pública)**
- Página pública de doação acessível por link/QR sem autenticação
- Plano básico: exibe chave PIX para cópia manual
- Plano pro: exibe QR dinâmico identificado + chave para cópia manual

**Consequências**
- PIX recorrente (Asaas) é o principal benefício do plano pro — âncora comercial forte
- Split de ~1% cria receita transacional para a plataforma além da mensalidade
- Cenário 1 elimina objeção de igrejas sem CNPJ ou sem disposição para pagar taxas
- Migração de provedor no futuro é possível — lógica de doação abstraída em serviço dedicado no NestJS

---

## ADR-008 — Infraestrutura e deploy

**Data:** 2026-05
**Status:** `decidido`

**Contexto**
Infraestrutura para MVP com zero DevOps, custo controlado e caminho claro para escala. LGPD exige atenção à localização dos dados.

**Decisão (original, 2026-05)**
**(A) Railway (backend NestJS) + Vercel (frontend Next.js) + Supabase (Postgres gerenciado) + Cloudflare R2 (storage).**

**Consequências (na época)**
- Zero DevOps no MVP — foco total em produto
- Supabase tem região São Paulo (sa-east-1) — LGPD atendida para dados pessoais
- Cloudflare R2 tem edge no Brasil e zero custo de egress — ideal para mídia (fotos, documentos, áudios)
- Railway suporta NestJS nativamente com deploy via git push
- Vercel é o par natural do Next.js — preview deployments por PR inclusos
- Quando escalar para AWS/GCP: migração cirúrgica — sem dependências proprietárias em nenhuma camada
- Supabase não é usado para Auth, Storage ou Realtime — apenas Postgres gerenciado

**Atualização — backend migrado de Railway para Render**
**Status:** `superseded parcialmente` (a parte de backend hosting; Vercel, Supabase e R2 permanecem como decididos)

**Motivo:** custo zero em Render para o estágio atual do projeto, sem perda de
funcionalidade relevante para o MVP (deploy via git push, variáveis de
ambiente, Docker). O restante da decisão (A) continua válido.

- `orbien-api` roda hoje em Render (Docker; build context é a raiz do
  monorepo — ver `render.yaml` no repositório)
- `DATABASE_URL`/`DIRECT_URL` apontam para o mesmo Supabase, sem mudança de
  schema ou de role `orbien_app`
- Toda referência a "Railway" em documentação anterior a esta atualização
  deve ser lida como Render
- Preencher aqui a data exata da migração (log de deploy/commit) se for
  necessário para auditoria formal

---

## ADR-009 — Notificações push

**Data:** 2026-05
**Status:** `decidido`

**Contexto**
Notificações são centrais no produto: escalas de voluntários, materiais de PG, avisos, aniversários, recibos de doação. Precisa de segmentação, agendamento e métricas.

**Decisão**
**(A) Expo Notifications (camada de device) + OneSignal (camada de disparo e métricas).**

**Consequências**
- Expo abstrai FCM (Android) e APNs (iOS) — zero configuração de certificados no MVP
- OneSignal entrega dashboard de métricas (entrega, abertura, clique), segmentação por tags e API de disparo server-side
- Plano gratuito do OneSignal suporta até 10k subscribers — suficiente para validar MVP com várias igrejas
- NestJS chama API do OneSignal para disparos automáticos (escala publicada, material disponível, aniversário, etc.)
- Tags do OneSignal espelham metadados do tenant: tenant_id, congregation_id, role, pg_ids

---

## ADR-010 — ORM e acesso ao banco

**Data:** 2026-05
**Status:** `decidido`

**Contexto**
ORM para NestJS com suporte a Postgres, migrations versionadas e boa DX em schema complexo multi-tenant.

**Decisão**
**(A) Prisma.**

**Consequências**
- Schema declarativo (`schema.prisma`) — fonte única de verdade do modelo de dados
- Migrations versionadas e rastreáveis no git
- Cliente TypeScript gerado automaticamente — autocomplete completo no NestJS
- Claude Code opera com alta precisão em Prisma — acelera implementação
- Prisma não abstrai RLS — policies continuam sendo SQL puro aplicado via migration
- Para queries muito complexas ou de alta performance, Prisma permite `$queryRaw` com SQL direto

---

*Última atualização: 2026-05 — todos os ADRs do MVP decididos.*

---

## ADR-011 — Módulo de Celebrações e Ordem de Celebração (OC)

**Data:** 2026-05
**Status:** `decidido`

**Contexto**
Dor validada no cliente zero (Doca Church): usavam Voluts para montar a Ordem de Celebração, ficaram sem ferramenta após migrar para Eklesia. OC hoje é informal. O Host precisa de uma fonte única de verdade no dia do culto — digital (app) e imprimível (PDF).

A OC não é um documento avulso: é um template de etapas vinculado a uma Celebração recorrente, que consome automaticamente as escalas já cadastradas no Módulo 1 (Voluntários).

**Decisão**
Módulo nativo de Celebrações e OC entra no MVP como última feature da Fase 3, com dependência explícita do módulo de Voluntários e Escalas.

**Escopo decidido**

Entidades:
- `Celebration`: celebração recorrente (nome, dia, horário, recorrência)
- `CelebrationInstance`: ocorrência específica gerada pela recorrência
- `ServiceOrder`: template de OC vinculado à Celebration
- `ServiceOrderItem`: etapa da OC (nome, horário, duração, responsável)
- `Setlist`: sub-bloco de músicas dentro de uma etapa de louvor
- `SetlistSong`: música individual (título, tom, BPM, link)

Integrações:
- `ServiceOrderItem` com `role` = ministério → puxa automaticamente voluntários escalados via Módulo 1
- Notificação push via OneSignal para Host (X horas antes) e equipe escalada (quando OC publicada)
- Exportação PDF via Cloudflare R2 com identidade visual do tenant

**Consequências**
- Diferencial claro contra concorrentes: InPeace usa Voluts (parceiro externo), inChurch não tem OC nativa
- Dependência do Módulo 1 (Escalas) — não pode ser implementado antes
- Setlist integrada na OC elimina necessidade de ferramenta externa para o time de louvor
- PDF exportável resolve o fluxo do Host sem depender de conectividade no dia
- Modelo de dados de Setlist é simples mas deve ser extensível (cifras, transposição, integração com Planning Center em fase futura)

