# Guia de Execução — Fases 4-7 e Partes 2-4 do Ecossistema Claude
## Orbien — Plataforma de Gestão White-label de Igrejas

**Versão:** 1.0 — 2026-05
**Status:** documento de consulta operacional
**Pré-requisito:** Fases 0 a 3 já concluídas (estratégia, marca, design system, arquitetura)

---

## Convenções deste guia

Cada passo é sinalizado com a ferramenta correta:

- 💬 **Chat do Project** — discussão, decisão, spec, crítica, copy, planejamento
- 🎨 **Claude Design** — geração visual, design system, telas, mockups, iteração de UI
- ⌨️ **Claude Code** — implementação real no repositório, código que vai pra produção
- 📋 **Trabalho fora do Claude** — registros legais, contas em fornecedores, deploys, conta nas lojas

---

# PARTE I — Fases 4 a 7

## Fase 4 · Site institucional + landing de vendas

**Duração estimada:** 1-2 semanas
**Objetivo:** ter presença web no ar com captação de leads antes do produto rodar.

### Por que começar antes do produto pronto

A captação de lista de espera valida demanda real, gera prova social para o cliente zero e cria pressão saudável de cronograma. O site é também a primeira aplicação da marca Orbien e do design system fora do produto.

### Conteúdo a produzir

**Sitemap mínimo:**
- Home (proposta de valor, prova social, CTA principal)
- Funcionalidades (uma página por módulo dos 5 do MVP)
- Preços (Starter e Premium conforme `pricing-church-platform.md`)
- Sobre / Manifesto
- Blog (estrutura preparada, sem conteúdo ainda)
- Contato e demo
- Login (placeholder para quando o produto rodar)

**Conteúdo a escrever:**
- Headline e subheadline da home
- Proposta de valor em 3 pilares
- Copy de cada funcionalidade alinhada ao tom de voz Orbien (`orbien-brand-guidelines.md`)
- Página de preços com tabela comparativa Starter × Premium
- FAQ (pelo menos 12 perguntas reais)
- Página "Sem CNPJ? Sem problema." — diferencial estratégico contra Eklesia e InPeace
- Casos de uso por persona (Pastor, Secretária, Tesoureiro, Líder de PG)

### Como executar

#### 💬 Chat — `Site · Conteúdo e Copy`
- Discutir headline e proposta de valor
- Escrever copy seguindo tom de voz (próximo mas profissional, sem "usuário", sem "revolucionário")
- Iterar microcopy de cada CTA
- Definir estrutura de cada página com bullet points

#### 🎨 Claude Design — `Orbien Site v1`
- Gerar wireframes de baixa fidelidade primeiro (estrutura, hierarquia)
- Aplicar design tokens Orbien (Navy, Teal, DM Sans, Inter, espaçamento, raios)
- Iterar telas em alta fidelidade — home, funcionalidades, preços
- Aplicar dark mode como padrão visual primeiro
- Exportar como HTML standalone

#### ⌨️ Claude Code — repositório `orbien-site`
- Inicializar Next.js + Tailwind + Shadcn/UI com os design tokens do guideline
- Implementar páginas a partir do HTML exportado do Claude Design
- Configurar SSG (Static Site Generation) — site não precisa de SSR pesado
- Integrar captura de email via formulário (lista de espera)
- Deploy na Vercel com domínio `orbien.app`

#### 📋 Trabalho fora do Claude
- Registrar domínios (`orbien.app`, `orbien.com.br`, `orbien.church`)
- Configurar DNS para Vercel
- Configurar email transacional (Resend ou similar) para confirmar inscrição na lista de espera
- Configurar Google Analytics 4 ou Plausible (preferir Plausible por LGPD)

### Saída esperada
- Site no ar em `orbien.app`
- Pelo menos uma página por módulo, página de preços e FAQ
- Lista de espera capturando emails
- Versão mobile testada (mobile-first é não-negociável)

---

## Fase 5 · Fluxo de venda

**Duração estimada:** 1 semana
**Objetivo:** ter a jornada de aquisição mapeada e os materiais de venda prontos para conversar com a Doca Church (cliente zero) e prospects similares.

### Mapa do funil

```
Lead (lista de espera ou indicação)
   ↓
Conversa inicial (WhatsApp / call)
   ↓
Demo de 20 minutos
   ↓
Trial guiado de 14 dias (sem PIX)
   ↓
Contrato (12 meses)
   ↓
Onboarding (até 30 dias)
   ↓
Cliente ativo
   ↓
Expansão (Starter → Premium ou denominação)
```

### Conteúdo a produzir

**Pitch deck (20-25 slides):**
- Problema (gestão de igreja brasileira hoje)
- Por que agora (Eklesia ainda não é mobile, InPeace caro, inChurch corporativo demais)
- Demo em 5 telas
- Modelo comercial (Starter / Premium)
- Diferenciais (PIX 3 cenários, OC nativa, white-label real)
- Cliente zero como prova social (após Doca assinar)
- Time
- Roadmap pós-MVP
- Pedido (assinatura, indicação ou conversa)

**Roteiro de demo de 20 minutos:**
- Hook inicial (problema do pastor)
- 5 telas-chave demonstradas ao vivo
- Q&A
- Próximo passo (trial ou contrato)

**Modelo de proposta comercial em Word (.docx):**
- Capa com identidade visual
- Resumo executivo
- Escopo dos módulos contratados
- Valores (Starter ou Premium, transacional)
- Prazo de implantação
- SLAs
- Assinatura

**Playbook de onboarding:**
- Checklist do dia 0 ao dia 30
- Reuniões marcadas (kickoff, treinamento, primeiro culto, retrospectiva)
- Pontos de contato (semana 1, 3, 7, 10 — conforme régua já definida)

### Como executar

#### 💬 Chat — `Vendas · Pitch e Materiais`
- Estruturar storytelling do pitch deck slide a slide
- Escrever conteúdo de cada slide com microcopy Orbien
- Roteiro de demo com script de fala (não improvisar)
- Texto da proposta comercial
- Argumentos de objeção e respostas prontas

#### 🎨 Claude Design — `Orbien Pitch Deck`
- Aplicar design tokens em slides
- Gerar mockups de tela para os slides de demo (pode ser screenshots reais quando o produto existir)
- Exportar slide a slide ou como PDF

#### ⌨️ Claude Code — gerar arquivos finais
- Converter conteúdo do pitch deck em PPTX usando skill pptx
- Gerar proposta comercial DOCX
- Configurar tracking de propostas (status, valor, data)

#### 📋 Trabalho fora do Claude
- Conta de CRM mínima (HubSpot free, Pipedrive ou planilha estruturada no início)
- Conta de assinatura digital (D4Sign, ClickSign ou Autentique)
- Conta de calendário com link de agendamento (Cal.com ou Calendly)

### Saída esperada
- Pitch deck pronto para apresentar
- Proposta comercial padrão pronta
- Roteiro de demo memorizado
- Régua de onboarding documentada
- Ferramentas comerciais configuradas

---

## Fase 6 · Sistema (web admin) — Backend + Frontend

**Duração estimada:** 8-12 semanas
**Objetivo:** construir o sistema módulo por módulo, na ordem do roadmap MVP.

### Princípios não-negociáveis nesta fase

1. **Multi-tenant desde o primeiro endpoint** — todo registro carrega `tenant_id` + `congregation_id`
2. **RLS ativado desde a primeira migration** — seguindo `orbien-rls-strategy.md`
3. **LGPD desde o cadastro inicial** — consentimento registrado, retenção mapeada
4. **Audit log imutável** — toda operação sensível registrada
5. **Mobile-first em todas as telas** — secretária e pastor operam pelo celular

### Ordem sugerida de implementação

Cada bloco abaixo é um sprint de 1-2 semanas.

#### Sprint 1 — Fundação técnica
- Repositório monorepo (`orbien-platform`) com backend (NestJS) e frontend (Next.js) + scripts compartilhados
- Setup Prisma + Postgres no Supabase
- Migrations iniciais com schema base e RLS aplicado
- Auth (JWT + Argon2 + refresh token rotation)
- Middleware de tenant context (injeta `tenant_id` / `congregation_id` no Postgres)
- Estrutura de papéis (`Role`, `RoleAssignment`) e guards no NestJS
- CI/CD básico (GitHub Actions + Render + Vercel)

#### Sprint 2 — Pessoas (cadastro completo)
- CRUD de `Person`, `Household`
- Classificação obrigatória (visitor/attendee/member) com histórico
- Tags livres e tags do sistema
- Detecção de duplicidade no cadastro (fuzzy match em telefone + nome)
- Importação CSV/Excel com mapeamento guiado de colunas
- Tela de listagem com filtros (classificação, congregação, tags)

#### Sprint 3 — Cadastro rápido de visitante
- Endpoint público autenticado por `tenant_slug` para QR
- Formulário enxuto (nome, telefone, email opcional, sexo)
- Consentimento LGPD obrigatório (`consent_record`)
- Deduplicação por telefone com alerta ao operador
- Reclassificação automática visitor → attendee em nova visita
- Tela de geração de QR por origem (culto, PG, evento)
- Página pública responsiva mobile-first

#### Sprint 4 — Dashboard demográfico
- Endpoint agregado por sexo, faixa etária, classificação
- Tela web com gráficos (Recharts ou Visx)
- Filtros por congregação e período
- Cruzamento sexo × faixa etária

#### Sprint 5 — Pequenos grupos (estrutura básica)
- CRUD de `SmallGroup`, `GroupMembership`
- Hierarquia (rede/setor → supervisor → líder → célula)
- Registro de reunião (`GroupMeeting`) com presença
- Check-in via QR code no encontro
- Dashboard do líder (presenças, visitantes, ofertas)

#### Sprint 6 — Biblioteca de materiais de PG
- CRUD de `StudyMaterial` com 3 fontes (PDF upload, DOC upload, editor rico)
- Editor de texto rico (TipTap ou similar)
- Agendamento de publicação (`publish_at`)
- Distribuição automática para integrantes dos PGs-alvo
- Notificação push via OneSignal no momento da disponibilização
- Indicador de abertura por integrante do PG

#### Sprint 7 — Financeiro (plano de contas + lançamentos)
- CRUD de `FinancialCategory` (hierarquia sintético/analítico)
- CRUD de `CostCenter`
- Lançamentos manuais de receita e despesa
- Anexo de comprovantes (Cloudflare R2)
- Recorrência (receita e despesa)
- Import de OFX para conciliação bancária

#### Sprint 8 — Doação PIX (3 cenários)
- Cenário 1: cadastro de chave PIX manual com QR estático
- Cenário 2: integração Asaas (QR dinâmico identificado, webhook, lançamento automático)
- Cenário 3: página pública de doação avulsa
- Geração de recibo PDF automática
- Histórico de doação visível ao próprio doador no app

#### Sprint 9 — Dashboard financeiro semanal + forecast
- Gráfico de entradas semanais (mês vigente × mês anterior)
- Indicadores resumo (total, variação %, ticket médio)
- Gráfico de forecast (3, 6, 12 meses com base em recorrência + sazonalidade)
- Filtros por congregação e centro de custo

#### Sprint 10 — Exportação contábil
- Export Excel/CSV padronizado (data, histórico, conta, débito, crédito, centro de custo)
- Export OFX
- Export PDF (razão e diário)
- ZIP com comprovantes anexados
- Painel de saúde financeira do pastor (3 KPIs)

#### Sprint 11 — Conteúdos e notificações
- CRUD de `ContentPost` (8 tipos: post, sermon_video, audio, devotional, study, event, notice, prayer)
- Editor com preview multi-plataforma
- Agendamento futuro
- Segmentação via `AudienceSegment`
- Disparo de push via OneSignal
- Métricas (entrega, abertura, clique)

#### Sprint 12 — Voluntariado e escalas
- CRUD de `Ministry`, `VolunteerProfile`
- Criação manual de escalas
- Sugestão automática com rodízio justo
- Confirmação/recusa pelo voluntário no app
- Troca peer-to-peer
- Check-in no dia do serviço

#### Sprint 13-14 — Celebrações e OC
- CRUD de `Celebration` com recorrência
- Geração de `CelebrationInstance`
- Template de `ServiceOrder` com `ServiceOrderItem` ordenado
- Vinculação automática de escalas
- Sub-bloco `Setlist` com `SetlistSong`
- Visualização no app (Host)
- Exportação PDF

### Como executar cada sprint

#### 💬 Chat — `Sistema · Backend · [Sprint X]`
- Detalhar spec da feature antes de codar
- Discutir edge cases
- Validar contratos de API (request/response)
- Revisar abordagem técnica antes de mandar para o Claude Code

#### 🎨 Claude Design — `Orbien Telas · [Módulo X]`
- Gerar telas de admin web e mobile do membro
- Aplicar design system Orbien
- Iterar até aprovação visual
- Exportar HTML para handoff

#### ⌨️ Claude Code — repositório `orbien-platform`
- Implementar endpoints NestJS com Prisma
- Implementar telas Next.js a partir do HTML do Claude Design
- Aplicar policies RLS em migrations
- Escrever testes de isolamento (RLS) e testes de regra de negócio
- Abrir PR, revisar, merge, deploy

#### 📋 Trabalho fora do Claude
- Configurar Asaas (conta sandbox primeiro, depois produção)
- Configurar OneSignal (apps iOS e Android registrados)
- Configurar Cloudflare R2 buckets
- Configurar Supabase com região São Paulo

### Saída esperada por sprint
- Feature merged em main
- Migrations aplicadas em staging e produção
- Testes de isolamento passando
- Tela disponível no painel admin
- Documentação curta da feature

---

## Fase 7 · Aplicativo mobile

**Duração estimada:** 6-10 semanas (pode rodar em paralelo com Fase 6 a partir do Sprint 3)
**Objetivo:** ter o app white-label nas mãos dos membros da Doca Church.

### Princípios não-negociáveis

1. **White-label desde o primeiro componente** — toda cor, logo e nome carregados de tema dinâmico via `tenant_id`
2. **Mobile-first não é só responsivo** — UX desenhada pensando em uso de uma mão, com polegar
3. **Offline-first onde fizer sentido** — OC do dia, materiais de PG, devocional devem funcionar sem conexão
4. **Notificações como diferencial** — preferências granulares por categoria

### Setup inicial do mobile

- Monorepo: app fica em `apps/mobile` no mesmo repositório do backend e web
- Stack: React Native + Expo SDK + NativeWind (para reutilizar tokens Tailwind)
- Tema dinâmico carregado no login do tenant
- EAS Build configurado desde o início (mesmo no plano starter)
- Expo Notifications + OneSignal integrado
- Expo Router para navegação

### Telas principais do MVP

#### App do membro (audiência ampla)
- Splash com identidade visual do tenant
- Login (membro pode logar com telefone via OTP ou email/senha)
- Home / Timeline com posts segmentados
- Meu perfil (editar dados, histórico de doação, preferências de notificação)
- Doar (PIX QR dinâmico ou chave manual conforme cenário do tenant)
- Encontre uma célula (mapa, filtros, "quero visitar")
- Meu PG (materiais disponíveis, próximas reuniões, chat)
- Devocional do dia
- Pedidos de oração
- Avisos / Notificações

#### App do líder e voluntário (audiência liderança)
- Minha célula (membros, presenças, reuniões)
- Registrar reunião (formulário rápido, QR code para check-in)
- Distribuir material (acessar biblioteca do PG)
- Minha escala (próximos serviços, confirmar/recusar)
- Solicitar troca de escala

#### App do Host (módulo 5)
- OC do dia (etapas, horários, responsáveis, setlist do louvor)
- Confirmar etapa concluída
- Anotações da celebração

### Como executar

#### 💬 Chat — `App · Arquitetura e Telas`
- Discutir navegação (tab bar vs. stack)
- Definir estrutura de pastas e padrões
- Validar regras de tema dinâmico
- Revisar UX de cada fluxo antes de implementar

#### 🎨 Claude Design — `Orbien App v1`
- Gerar telas mobile com design tokens Orbien
- Aplicar variação de tema (mostrar como fica com 2-3 cores de tenant diferentes)
- Especificar comportamento de gestos (swipe, pull-to-refresh, long press)
- Exportar HTML / capturas para handoff

#### ⌨️ Claude Code — repositório `orbien-platform/apps/mobile`
- Inicializar Expo + NativeWind + Expo Router
- Implementar tema dinâmico (Context que carrega tokens do tenant)
- Implementar telas a partir do design exportado
- Integrar OneSignal e Expo Notifications
- Configurar EAS Build profiles (dev, staging, production)
- Configurar OTA updates (Expo Updates)

#### 📋 Trabalho fora do Claude
- Conta Apple Developer Program ($99/ano)
- Conta Google Play Console ($25 único)
- Para clientes Premium: conta Apple e Google da igreja-cliente, com você como admin delegado
- Configurar TestFlight e Internal Testing para validação interna antes da submissão

### Saída esperada
- App nas lojas (App Store e Google Play) sob a conta Orbien (modelo Starter)
- Cliente zero (Doca Church) testando em produção
- OTA updates funcionando para correções rápidas
- Build dedicado via EAS pronto para o primeiro cliente Premium

---

# PARTE II — Partes 2, 3 e 4 do Guia do Ecossistema

## Parte 2 — Recursos e atalhos do Claude que você deve usar

### 💬 Chat do Project (Church Platform)
**Quando usar:** discussão estratégica, decisão de produto, escrita de spec, revisão crítica, escrita de copy, planejamento de sprint, debate de UX.

**Padrão de nomenclatura de conversas:**
- `Estratégia · [tema]`
- `Marca · [tema]`
- `Produto · [módulo] · [feature]`
- `Design · [plataforma] · [tela]`
- `Sistema · Backend · [feature]`
- `Sistema · Frontend · [feature]`
- `App · [feature]`
- `Vendas · [material]`
- `Revisão crítica · [escopo]`

**Práticas que multiplicam produtividade:**
- Uma conversa por escopo bem definido — não misture financeiro com PG na mesma conversa
- Use a busca em chats passados — não recrie contexto desnecessariamente
- Cole prints de telas, sites de concorrentes, decisões anteriores
- Quando uma decisão for tomada, peça para o Claude registrar em ADR ou no documento de produto

### 🎨 Claude Design
**Quando usar:** geração de design system, mockups de tela, iteração visual, exploração de variações, exportação HTML para handoff.

**Práticas que multiplicam produtividade:**
- Comece pelo design system base antes de qualquer tela específica
- Use uma conversa única por projeto de design — o contexto acumulado garante consistência
- Anexe `orbien-brand-guidelines.md` no início para o Claude Design usar os tokens reais
- Após cada tela aprovada, exporte como HTML e leve para o chat do Project para revisão crítica
- Não use Claude Design para discussões — ele é gerador, não conselheiro

### ⌨️ Claude Code
**Quando usar:** qualquer escrita de código que vai para produção, refatoração, criação de migrations, debug, testes.

**Setup inicial:**
```bash
npm install -g @anthropic-ai/claude-code
cd orbien-platform
claude code init
```

**Crie um `CLAUDE.md` na raiz do repo com:**
- Stack decidida (NestJS, Prisma, Next.js, Shadcn/UI, React Native + Expo)
- Regras de multi-tenant (todo registro tem `tenant_id` + `congregation_id`)
- Padrões de RLS (referenciar `orbien-rls-strategy.md`)
- Padrões de auth (referenciar `orbien-lgpd-mapping.md`)
- Comandos comuns (`pnpm dev`, `pnpm test`, `pnpm migrate`)
- Estrutura de pastas
- Lista de skills instaladas (frontend-design)

**Práticas que multiplicam produtividade:**
- Instale a skill `frontend-design` globalmente (`~/.claude/skills/frontend-design/`)
- Para cada feature, abra issue no GitHub primeiro com a spec discutida no chat — Claude Code lê a issue
- Use `claude code` com mensagem clara: "implemente o endpoint POST /people seguindo a spec da issue #42"
- Sempre rode testes localmente antes de mergear
- Use o plugin do Figma se você tiver mockups lá; senão, o HTML do Claude Design serve como referência

### Outros recursos do ecossistema

- **Claude in Chrome** — útil para análise competitiva (abrir site da Eklesia/inChurch com Claude lendo a página junto)
- **Pesquisa em chats passados** — sempre que precisar resgatar uma decisão
- **Skills nativas** — usar para gerar PPTX (pitch deck), DOCX (proposta), PDF (recibos), XLSX (planilhas comerciais)
- **Memória do Project** — fixar decisões com "lembre-se que..." nas configurações
- **Visão (upload de imagem)** — calibrar gosto, comparar com concorrentes, validar designs

---

## Parte 3 — Rotina semanal sugerida

### Segunda-feira — Planejamento
**💬 Chat · `Planejamento · Sprint W##`**
- Revisar o que foi feito na semana anterior
- Definir 1-3 prioridades da semana
- Quebrar em tarefas executáveis
- Atualizar documento de roadmap se algo mudar

### Terça a quinta — Execução

**Manhãs em 💬 Chat:**
- Discutir spec da feature do dia
- Validar abordagem
- Resolver dúvidas de regra de negócio

**Tardes em ⌨️ Claude Code:**
- Implementar o que foi discutido de manhã
- Abrir PRs, revisar, mergear
- Rodar testes

**Em paralelo em 🎨 Claude Design:**
- Iterar telas que dependem de discussão de produto
- Exportar quando aprovado para servir de referência ao Claude Code

### Sexta-feira — Revisão crítica
**💬 Chat · `Revisão crítica · W##`**

Conversa nova, sem contexto, onde você cola o que foi feito na semana e pede análise crítica:
- Riscos não endereçados
- Dívida técnica acumulada
- Gaps de UX descobertos
- Falhas de segurança ou LGPD
- Inconsistências de design ou copy

Isso é ouro e quase ninguém faz. Reserve 1-2 horas todas as sextas.

### Cadência mensal

**Final do mês — `Estratégia · Retrospectiva mensal`:**
- O que foi entregue vs. planejado
- Recalibrar roadmap se necessário
- Atualizar pricing e ICP se aprendizado pediu
- Decisões de arquitetura novas viram ADRs

---

## Parte 4 — Próximos passos concretos após este documento

Use esta seção como checklist linear.

### Imediato (esta semana)

- [ ] **💬 Chat — abrir conversa `Site · Estrutura e Conteúdo`** para começar a Fase 4
- [ ] **📋 Fora do Claude — registrar domínio `orbien.app`** (já decidido na estratégia)
- [ ] **📋 Fora do Claude — abrir conta Supabase com região São Paulo**
- [ ] **📋 Fora do Claude — abrir conta Render, Vercel, Cloudflare R2, OneSignal, Asaas (sandbox)**

### Próximas 2 semanas

- [ ] **🎨 Claude Design — gerar Orbien Site v1** seguindo design system
- [ ] **⌨️ Claude Code — inicializar repositório `orbien-site`** e implementar landing
- [ ] **💬 Chat — iniciar conversa `Vendas · Pitch Deck`**
- [ ] **🎨 Claude Design — gerar Orbien Pitch Deck**

### Próximas 4 semanas

- [ ] **⌨️ Claude Code — inicializar monorepo `orbien-platform`** com NestJS + Next.js + estrutura mobile
- [ ] **⌨️ Claude Code — primeira migration com schema base + RLS** seguindo `orbien-rls-strategy.md`
- [ ] **⌨️ Claude Code — implementar auth (JWT + Argon2 + refresh)**
- [ ] **⌨️ Claude Code — implementar middleware multi-tenant**
- [ ] **💬 Chat — `Sistema · Backend · Sprint 2` (Pessoas)** — começar a spec do cadastro completo

### Marco de 90 dias

- Site no ar com lista de espera ativa
- Pitch deck pronto, primeira apresentação à Doca Church feita
- Auth + multi-tenant + pessoas + cadastro rápido + dashboard demográfico em produção
- Cliente zero (Doca) usando em ambiente staging para validar

### Marco de 6 meses

- MVP completo dos 5 módulos
- App nas lojas (Starter)
- Doca Church em produção como cliente zero
- Pelo menos 2 leads qualificados além da Doca
- Primeiro caso de uso documentado e publicável

---

## Lembretes finais

- **Não pule a Fase 4.** Site no ar antes do produto pronto valida demanda e gera pressão saudável.
- **Não codifique sem ter a spec discutida no chat.** Voltar para corrigir feature é 5x mais caro.
- **Não desenhe sem ter o fluxo decidido.** Design sem decisão de produto vira retrabalho.
- **Revisão crítica de sexta-feira é não-negociável.** É o que evita acumular dívida invisível.
- **Sempre que decidir algo grande, registre.** ADR para arquitetura, doc de produto para escopo, brand guidelines para marca.

---

*Documento de consulta operacional — Orbien*
*Versão 1.0 · 2026-05*

