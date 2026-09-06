# Briefing de sessão — Sprint 10
## Orbien · Frontend Web (Next.js + Tailwind + Shadcn/UI)

Cole este prompt inteiro para abrir a sessão no novo chat.

---

## Contexto do projeto

Estou construindo o **Orbien** — SaaS white-label de gestão de igrejas, multi-tenant em 3 níveis (plataforma → denominação → congregação), voltado para igrejas evangélicas brasileiras de 50–300 membros.

**Repositório backend:** `orbien-api` (Render)
**Repositório frontend:** a criar — `orbien-web` (Vercel)
**Domínio:** `useorbien.com`
**Cliente zero:** Doca Church, Passo Fundo/RS

---

## Stack (não questionar — já está nos ADRs)

- **Frontend:** Next.js 14 (App Router) + Tailwind + Shadcn/UI
- **Backend:** NestJS + Prisma 6 + Postgres — já completo (Sprints 1–9)
- **Auth:** JWT próprio (access token 15min + refresh rotation) — sem NextAuth, sem Supabase Auth
- **Infra:** Vercel (frontend) + Render (backend)
- **Ícones:** Lucide React (já no stack)
- **Fontes:** DM Sans + DM Mono (Google Fonts)

---

## Estado do backend — Sprints 1–9 concluídos ✅

Todos os endpoints estão implementados, testados e com RLS 24/24:

| Módulo | Prefixo | Status |
|---|---|---|
| Auth (login, refresh, logout, impersonação) | `/api/auth` | ✅ |
| Pessoas (CRUD, dedup, QR check-in, dashboard demográfico, importação CSV) | `/api/persons` | ✅ |
| Pequenos Grupos + Reuniões + Presença | `/api/groups` | ✅ |
| Materiais de Estudo + Upload R2 | `/api/study-materials` | ✅ |
| Financeiro (transações, categorias, PIX, dashboard, forecast, DRE, exportações) | `/api/financial` | ✅ |
| Conteúdo + Notificações (posts, segmentos, OneSignal) | `/api/content` | ✅ |
| Voluntariado + Escalas (ministérios, perfis, schedules, swap, check-in QR) | `/api/volunteers` | ✅ |
| Celebrações + OC (ServiceOrder, Setlist, PDF) | `/api/celebrations` | ✅ |

**Credenciais de teste:**
```
fvargaspf@gmail.com       → tenant_admin + admin_congregation · tenant: doca-church
fernando.vargas@fill.tech → platform_support
API base URL: https://orbien-api.onrender.com/api  (ou http://localhost:3000/api em dev)
```

---

## Design system — tokens definidos (não alterar)

### Paleta de cores
```css
--color-navy:          #1E3A7B;   /* CTA primário, links, interativos */
--color-navy-dark:     #162D62;   /* Hover/pressed do Navy */
--color-navy-dim:      #D4DCEF;   /* Fundo de badge Navy (light) */
--color-teal:          #00B8A2;   /* Acento, sucesso, deltas positivos */
--color-teal-dark:     #00CDB5;
--color-teal-dim:      #D0F5F1;
--color-crimson:       #C0392B;   /* Erro, alerta, semáforo vermelho */
--color-crimson-dark:  #E05444;
--color-crimson-dim:   #FDECEA;
--color-burgundy:      #991B1B;   /* Badge status grave */
--color-burgundy-dim:  #F5E6E6;
--color-ink:           #0F1117;   /* Texto primário */
--color-parchment:     #F5F4F1;   /* Fundo base */
--color-surface:       #FFFFFF;   /* Cards */
--color-surface-dark:  #13151E;
--color-subtle:        #EEECEA;   /* Hover, KPI backgrounds */
--color-subtle-dark:   #1C1F2B;
--color-stone:         #5C5A56;   /* Texto secundário */
--color-muted:         #9B9893;   /* Texto terciário */
--color-border:        #E0DDD9;
--color-border-dark:   #232634;
```

### Tipografia
- **DM Sans** — todo o produto (display, headings, body, labels, botões)
- **DM Mono** — valores monetários, IDs, dados técnicos
- Peso primário: 300 (body) e 500 (headings, botões) — nunca 400 onde 300 ou 500 funcionam

### Sombras
```css
--shadow-sm: 0 1px 3px rgba(15,17,23,.06), 0 1px 2px rgba(15,17,23,.04);
--shadow-md: 0 4px 16px rgba(15,17,23,.08), 0 2px 6px rgba(15,17,23,.05);
--shadow-lg: 0 12px 40px rgba(15,17,23,.12), 0 4px 12px rgba(15,17,23,.06);
```

### Border radius
Botão: 8px · Card: 12px · Modal: 16px · Badge: 100px · Input: 8px

### Ícones
Lucide React · stroke 1.5px · tamanhos: 16px (inline), 20px (botão), 24px (card)

### Regras de marca
- **Navy** é a única cor de CTA primário — nunca Teal ou Crimson em botão primário
- **Teal** = feedback positivo, deltas, semáforo verde
- **Crimson** = erro, alerta crítico
- Texto de botão: DM Sans 500, nunca 600
- Valores monetários: número em DM Mono 500, símbolo R$ em DM Sans 400
- Nunca usar "usuário" — usar "membro", "pastor", "secretária"
- Painel web (admin): logo Orbien no header + nome da congregação

---

## Arquitetura do frontend

### Multi-tenancy no frontend
- Tenant identificado via `tenant_slug` no login (salvo em cookie + contexto)
- Todas as chamadas à API carregam `Authorization: Bearer {access_token}`
- O backend resolve `tenant_id` via JWT — frontend não precisa enviar `tenant_id` explicitamente
- Refresh automático: interceptor Axios/fetch renova access token antes de expirar

### Estrutura de rotas (App Router)
```
app/
  (public)/
    login/                    → Login com tenant_slug + email + senha
    visitante/[tenant_slug]/  → Formulário de cadastro rápido de visitante (SSR, sem auth)
    doar/[tenant_slug]/       → Página pública de doação PIX (SSR, sem auth)
  (admin)/
    layout.tsx                → Shell: sidebar + header + tenant context
    dashboard/                → Dashboard principal (KPIs rápidos)
    pessoas/                  → Lista de membros + cadastro
    grupos/                   → Pequenos grupos
    financeiro/               → Financeiro + exportações
    conteudo/                 → Posts + notificações
    voluntarios/              → Ministérios + escalas
    celebracoes/              → OC + histórico
    configuracoes/            → Tenant settings
```

### Autenticação no frontend
- **Sem NextAuth** — JWT próprio
- Access token: `localStorage` ou cookie httpOnly (decidir na sessão)
- Refresh: interceptor automático antes de chamadas com token expirado
- Middleware Next.js para proteger rotas `(admin)/*`
- Logout: `POST /api/auth/logout` + limpar tokens

---

## Roles e o que cada um vê

| Role | Acesso |
|---|---|
| `tenant_admin` | Tudo — incluindo configurações de tenant |
| `admin_congregation` | Todos os módulos da sua congregação |
| `pastor` | Dashboard, pessoas (sem CPF/endereço), financeiro (só totais/DRE), conteúdo, celebrações |
| `tesoureiro` | Financeiro completo + exportações |
| `secretary` | Pessoas, grupos, conteúdo — sem financeiro |
| `ministry_leader` | Voluntários do seu ministério, escalas |
| `member` | App mobile apenas (não tem acesso ao painel web) |

---

## Escopo do Sprint 10

### Objetivo
Painel web funcional com os módulos de maior frequência de uso: autenticação, shell, dashboard, pessoas e financeiro básico.

### Módulos em ordem de prioridade

**P0 — Fundação (sem isso nada funciona)**
1. Setup do repositório (Next.js 14 App Router, Tailwind, Shadcn/UI, DM Sans/Mono)
2. Design tokens configurados no Tailwind + globals.css
3. Autenticação (login, refresh automático, logout, middleware de proteção de rotas)
4. Shell do admin (sidebar responsiva, header com tenant/user info, dark mode)

**P1 — Alta frequência de uso**
5. Dashboard principal (KPIs: total membros, novos este mês, doações da semana, próxima celebração)
6. Pessoas — listagem com busca/filtro + cadastro rápido de visitante integrado
7. Financeiro — dashboard semanal + lançamento manual de transação + DRE

**P2 — Completude do MVP**
8. Grupos — listagem + presenças
9. Voluntários — escalas publicadas + confirmação
10. Celebrações — OC do dia + PDF download
11. Conteúdo — listagem de posts + publicar/despublicar

---

## Passos de implementação

---

### Passo 1 — Setup + Design tokens + Shell

**Prompt para Claude Code:**
```
Sprint 10 · Passo 1 — Setup do repositório + design tokens + shell

Criar novo repositório Next.js 14 para o frontend do Orbien.

SETUP:
  npx create-next-app@latest orbien-web \
    --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

  Instalar dependências:
    npx shadcn@latest init
    npm install lucide-react axios @tanstack/react-query
    npm install next-themes  (dark mode)

DESIGN TOKENS — configurar em globals.css e tailwind.config.ts:

  globals.css — adicionar variáveis CSS:
    --color-navy: #1E3A7B
    --color-navy-dark: #162D62
    --color-navy-dim: #D4DCEF
    --color-teal: #00B8A2
    --color-teal-dark: #00CDB5
    --color-teal-dim: #D0F5F1
    --color-crimson: #C0392B
    --color-crimson-dark: #E05444
    --color-crimson-dim: #FDECEA
    --color-burgundy: #991B1B
    --color-burgundy-dim: #F5E6E6
    --color-ink: #0F1117
    --color-parchment: #F5F4F1
    --color-surface: #FFFFFF
    --color-surface-dark: #13151E
    --color-subtle: #EEECEA
    --color-subtle-dark: #1C1F2B
    --color-stone: #5C5A56
    --color-muted: #9B9893
    --color-border: #E0DDD9
    --color-border-dark: #232634
    --shadow-sm: 0 1px 3px rgba(15,17,23,.06), 0 1px 2px rgba(15,17,23,.04)
    --shadow-md: 0 4px 16px rgba(15,17,23,.08), 0 2px 6px rgba(15,17,23,.05)
    --shadow-lg: 0 12px 40px rgba(15,17,23,.12), 0 4px 12px rgba(15,17,23,.06)

  tailwind.config.ts — estender colors:
    navy: 'var(--color-navy)'
    teal: 'var(--color-teal)'
    crimson: 'var(--color-crimson)'
    ink: 'var(--color-ink)'
    parchment: 'var(--color-parchment)'
    surface: 'var(--color-surface)'
    stone: 'var(--color-stone)'
    muted: 'var(--color-muted)'
    border-default: 'var(--color-border)'

FONTES — layout.tsx raiz:
  import { DM_Sans, DM_Mono } from 'next/font/google'
  DM Sans: weights [300, 400, 500] subsets ['latin']
  DM Mono: weights [400, 500] subsets ['latin']
  Aplicar como variáveis CSS: --font-sans, --font-mono

SHELL DO ADMIN — src/app/(admin)/layout.tsx:
  Sidebar fixa (260px desktop, drawer mobile):
    - Logo Orbien no topo (wordmark "orbien" em DM Sans 500, Navy até logo final)
    - Nome da congregação abaixo do logo
    - Itens de nav com ícone Lucide + label:
        Dashboard (LayoutDashboard)
        Pessoas (Users)
        Grupos (UsersRound)
        Financeiro (Wallet)
        Conteúdo (Megaphone)
        Voluntários (CalendarDays)
        Celebrações (ChurchIcon / Star)
        Configurações (Settings)
    - Item ativo: fundo Navy/10, texto Navy, borda left 2px Navy
    - Ícones: Lucide 20px, stroke 1.5
  Header (60px):
    - Breadcrumb da página atual
    - Ícone de notificações (Bell, placeholder)
    - Avatar do usuário com dropdown (nome, role, logout)
  Main content: padding 24px, fundo parchment

  Dark mode:
    - next-themes com ThemeProvider
    - Botão de toggle no header
    - Usar variáveis CSS dark já definidas no globals.css

VARIÁVEIS DE AMBIENTE (.env.local):
  NEXT_PUBLIC_API_URL=http://localhost:3000/api

Testar: npm run dev → http://localhost:3001
Confirma: shell renderiza, sidebar com todos os itens, dark mode funciona, fontes DM Sans/Mono carregadas.
```

---

### Passo 2 — Autenticação (JWT próprio)

**Prompt para Claude Code:**
```
Sprint 10 · Passo 2 — Autenticação com JWT próprio

Contexto: Shell funcionando. Backend: POST /api/auth/login retorna
{ access_token, refresh_token, user: { id, name, email, roles, tenant_id, congregation_id } }
POST /api/auth/refresh recebe { refresh_token }, retorna novo { access_token, refresh_token }
POST /api/auth/logout invalida o refresh token

IMPLEMENTAR:

1. src/lib/api.ts — instância Axios com interceptors:
   - Base URL: process.env.NEXT_PUBLIC_API_URL
   - Request interceptor: adicionar Authorization header se access_token existir
   - Response interceptor: se 401 → tentar refresh → repetir request original
     Se refresh falhar → redirect para /login

2. src/lib/auth.ts — utilitários:
   - saveTokens(access, refresh): salva em localStorage
   - getAccessToken(): lê localStorage
   - clearTokens(): limpa localStorage
   - isTokenExpired(token): decodifica JWT e verifica exp

3. src/contexts/AuthContext.tsx — React Context:
   Estado: { user, isLoading, isAuthenticated }
   Métodos: login(email, password, tenant_slug), logout()
   Inicialização: ler tokens do localStorage, se existir → carregar user de GET /api/auth/me

4. src/app/(public)/login/page.tsx — página de login:
   Campos: email, senha, tenant_slug (label: "Código da sua igreja")
   Validação client-side: campos obrigatórios
   Erro 401: "E-mail ou senha inválidos"
   Erro 404 (tenant não existe): "Igreja não encontrada. Verifique o código."
   Submit: AuthContext.login() → redireciona para /dashboard
   Design: card centralizado, 400px max-width, logo Orbien no topo, botão Navy

5. src/middleware.ts — proteger rotas admin:
   matcher: ['/dashboard/:path*', '/pessoas/:path*', '/financeiro/:path*', ...]
   Se não autenticado → redirect para /login
   (usar cookie para SSR — salvar access_token em cookie httpOnly no login)

6. Hook src/hooks/useAuth.ts — atalho para useContext(AuthContext)

Testar:
  npm run dev
  # Acessar /dashboard sem login → redireciona para /login ✓
  # Login com fvargaspf@gmail.com / A3dodfemf / doca-church → vai para /dashboard ✓
  # F5 na página → continua logado (tokens persistidos) ✓
  # Logout → volta para /login ✓
  # Token expirado (simular removendo localStorage) → refresh automático ✓
```

---

### Passo 3 — Dashboard principal

**Prompt para Claude Code:**
```
Sprint 10 · Passo 3 — Dashboard principal

Contexto: Auth funcionando. Roteamento /dashboard protegido.

Endpoints que o dashboard consome:
  GET /api/persons/dashboard         → { total_members, new_this_month, visitors, classification_breakdown }
  GET /api/financial/dashboard       → { week_revenue, week_expenses, week_net, monthly_forecast }
  GET /api/celebrations (próxima)    → lista, pegar a mais próxima com status != 'finalized'
  GET /api/volunteers/schedules      → escalas da semana atual

IMPLEMENTAR: src/app/(admin)/dashboard/page.tsx

Layout (grid responsivo — 4 cols desktop, 2 cols tablet, 1 col mobile):

Linha 1 — KPI cards (4 itens):
  · Total de membros (número, delta vs. mês anterior com Teal se positivo)
  · Novos este mês (número, badge role-type: visitante/frequentador/membro)
  · Receitas da semana (DM Mono 500, R$, delta %)
  · Resultado líquido da semana (verde = positivo, vermelho = negativo)

Linha 2 — Cards maiores (2 cols):
  · Gráfico de membros por classificação (recharts PieChart — cores Navy/Teal/Stone/Muted)
  · Forecast financeiro (recharts BarChart — barras Navy para receita, Teal para resultado)

Linha 3 — Cards menores (2 cols):
  · Próxima celebração (título, data, horário, status da escala)
  · Alertas rápidos (grupos sem reunião > 14 dias, voluntários sem confirmação)

Componentes a criar:
  src/components/dashboard/KpiCard.tsx
    Props: title, value, delta?, deltaType ('up'|'down'), icon, suffix?
    Delta positivo: Teal + TrendingUp icon
    Delta negativo: Crimson + TrendingDown icon

  src/components/dashboard/SectionHeader.tsx
    Props: title, action? (link + label)

Estado de loading: skeleton loaders (Shadcn Skeleton) — não usar spinner global

Testar:
  npm run dev
  # Login → dashboard carrega com dados reais da API
  # KPIs com valores numéricos corretos
  # Gráfico de classificação renderizando
  # Responsivo: testar em 375px (mobile)
```

---

### Passo 4 — Módulo Pessoas

**Prompt para Claude Code:**
```
Sprint 10 · Passo 4 — Módulo Pessoas

Contexto: Dashboard funcionando.

Endpoints:
  GET    /api/persons?page=1&limit=20&search=&classification=&congregation_id=
  POST   /api/persons                  → criar membro/visitante
  GET    /api/persons/:id
  PATCH  /api/persons/:id
  POST   /api/persons/check-in/:token  → QR público (já existe no backend)
  POST   /api/persons/import           → preview CSV (multipart)
  POST   /api/persons/import/confirm   → confirmar importação

IMPLEMENTAR:

1. src/app/(admin)/pessoas/page.tsx — listagem:
   - Input de busca (debounce 300ms)
   - Filtros: classificação (visitante/frequentador/membro), congregação (se tenant_admin)
   - Tabela com colunas: nome, telefone, classificação (badge colorido), data cadastro, ações
   - Badges de classificação: visitante=Stone, frequentador=Navy dim, membro=Teal dim
   - Paginação (cursored via page/limit)
   - Botão "Cadastrar visitante" (abre modal) e "Importar CSV" (abre modal)
   - Row click → abre sheet lateral com detalhes da pessoa

2. src/components/persons/PersonSheet.tsx — sheet lateral de detalhes:
   - Dados pessoais (nome, telefone, email, nascimento, gênero)
   - Classificação atual com botão de reclassificação manual
   - Histórico de visitas (últimas 5)
   - Botão editar → formulário inline no sheet

3. src/components/persons/CreateVisitorModal.tsx — cadastro rápido:
   Campos: nome (required), telefone (required), email (optional)
   Inline consent: "Ao cadastrar, você confirma que o visitante autorizou o uso dos dados."
   Submeteu → toast de sucesso + fechar modal + atualizar lista

4. src/components/persons/ImportCsvModal.tsx — importação em 2 passos:
   Passo 1: upload de arquivo (drag & drop + click) → chama /persons/import → mostra preview
   Passo 2: mapeamento de colunas (selects para cada campo Orbien) → confirmar → mostra resultado
   { imported: N, skipped: N, errors: [...] }

Componentes compartilhados a criar neste passo:
  src/components/ui/DataTable.tsx — tabela reutilizável com colunas configuráveis
  src/components/ui/SearchInput.tsx — input com ícone Search e debounce
  src/components/ui/StatusBadge.tsx — badge de status genérico com variantes por tipo

Testar:
  # Listagem carrega pessoas do tenant doca-church
  # Busca por nome filtra em tempo real
  # Cadastro rápido de visitante cria pessoa e aparece na lista
  # Sheet de detalhes abre com dados corretos
  # Importação CSV: upload → preview com mapeamento → resultado
```

---

### Passo 5 — Módulo Financeiro

**Prompt para Claude Code:**
```
Sprint 10 · Passo 5 — Módulo Financeiro

Contexto: Pessoas funcionando.

Endpoints:
  GET  /api/financial/dashboard                → KPIs semanais + forecast
  GET  /api/financial/transactions?page=&...   → lista de transações
  POST /api/financial/transactions             → novo lançamento
  GET  /api/financial/categories               → categorias para select
  GET  /api/financial/dre?period_start=&period_end= → DRE
  POST /api/financial/export/csv              → download CSV
  POST /api/financial/export/pdf              → download PDF
  GET  /api/financial/export/jobs/:id         → polling
  GET  /api/financial/export/jobs/:id/download → presigned URL

IMPLEMENTAR:

1. src/app/(admin)/financeiro/page.tsx — hub financeiro com tabs:
   Tab "Visão Geral": dashboard semanal (reusar KpiCard do dashboard)
     - Receitas / Despesas / Resultado (semana atual)
     - Gráfico de barras semanal (recharts)
     - Forecast do mês (barra de progresso: realizado vs. projetado)

   Tab "Lançamentos": listagem de transações
     - Filtros: período (date range picker), categoria, tipo (receita/despesa)
     - Tabela: data, descrição, categoria, valor (Teal para receita, Crimson para despesa), ações
     - Botão "Novo lançamento" → modal

   Tab "DRE": demonstração de resultado
     - Date range picker de período
     - Tabela agrupada: Receitas por categoria / Despesas por categoria / Resultado líquido
     - Comparativo período anterior (delta %)
     - Botões: "Exportar PDF" e "Exportar CSV"

2. src/components/financial/NewTransactionModal.tsx:
   Campos: tipo (Receita/Despesa), categoria (select), valor (masked input R$),
           data, descrição
   Submit → toast + fechar + atualizar lista

3. src/components/financial/ExportButton.tsx:
   Props: type ('csv'|'ofx'|'pdf'|'zip'|'sped'), period
   Fluxo:
     - Períodos ≤ 92 dias: download direto (Blob response → <a download>)
     - Períodos > 92 dias: polling do job_id até status=done → abrir download_url
   Estado: idle → loading (spinner no botão) → done | error

4. Permissões no frontend:
   - Tab "DRE": esconder para secretary
   - Exportações: esconder para pastor e secretary
   - Valores nominais de lançamento: esconder para pastor (mostrar só totais)

Testar:
  # Dashboard financeiro com dados reais
  # Novo lançamento aparece na lista
  # DRE carrega com período padrão (mês atual)
  # Export CSV síncrono → download automático
  # Export assíncrono → spinner → download quando done
```

---

### Passo 6 — Testes consolidados + deploy Vercel

**Prompt para Claude Code:**
```
Sprint 10 · Passo 6 — Testes consolidados + deploy

TESTES FUNCIONAIS:
  1. Login / logout / refresh automático
  2. Dashboard carrega KPIs reais (não zeros)
  3. Pessoas: busca, cadastro, sheet de detalhes, importação CSV
  4. Financeiro: lançamento, DRE, export CSV síncrono, export assíncrono com polling
  5. Sidebar responsiva (mobile 375px: drawer com hamburger)
  6. Dark mode: todos os componentes usando variáveis CSS (sem hardcoded colors)
  7. Role-based UI: logar como pastor → verificar que exportações somem

ACESSIBILIDADE MÍNIMA:
  - Focus visible em todos os inputs e botões
  - Labels em todos os campos de formulário
  - Aria-labels em botões de ícone

DEPLOY:
  1. Criar projeto no Vercel vinculado ao repositório orbien-web
  2. Configurar variável de ambiente: NEXT_PUBLIC_API_URL=https://orbien-api.onrender.com/api
  3. Configurar domínio: app.useorbien.com (ou admin.useorbien.com)
  4. Verificar CORS no backend (Render): adicionar origin do Vercel ao allowedOrigins
  5. Smoke test em produção: login → dashboard → criar transação

Checklist de aprovação:
(1) Login funciona em produção com tenant doca-church ✓
(2) Dashboard com dados reais ✓
(3) CRUD de pessoas operacional ✓
(4) Financeiro com exportação funcionando ✓
(5) Dark mode sem artefatos visuais ✓
(6) Mobile 375px navegável ✓
(7) Deploy Vercel no ar em app.useorbien.com ✓
```

---

## Matriz de permissões · Sprint 10

| Seção | tenant_admin | admin_congregation | pastor | tesoureiro | secretary | ministry_leader |
|---|---|---|---|---|---|---|
| Dashboard (KPIs gerais) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pessoas — listagem | ✅ | ✅ | ✅ (sem CPF/endereço) | ✅ | ✅ | — |
| Pessoas — importação CSV | ✅ | ✅ | — | — | ✅ | — |
| Financeiro — visão geral | ✅ | ✅ | ✅ (só totais) | ✅ | — | — |
| Financeiro — lançamentos | ✅ | ✅ | — | ✅ | — | — |
| Financeiro — DRE | ✅ | ✅ | ✅ (só totais) | ✅ | — | — |
| Financeiro — exportações | ✅ | ✅ | — | ✅ | — | — |
| Configurações | ✅ | — | — | — | — | — |

---

## Decisões técnicas fechadas

1. **Sem NextAuth** — JWT próprio com interceptor Axios. Access token em localStorage + cookie httpOnly para SSR middleware.

2. **React Query (`@tanstack/react-query`)** — para cache, refetch automático e estados de loading/error. Não usar SWR.

3. **Shadcn/UI** — componentes base (Button, Input, Select, Dialog, Sheet, Tabs, Badge, Skeleton, Toast). Não criar componentes primitivos do zero.

4. **App Router** — não usar Pages Router. Server Components onde não precisar de estado; Client Components apenas onde necessário.

5. **Role-based UI** — verificar role via `useAuth()` para esconder seções. Não confiar apenas no backend — UI proativa evita confusão do usuário.

6. **Recharts** — para gráficos (já usado no backend para PDF; familiar). Não usar Chart.js.

7. **Valores monetários** — sempre DM Mono 500, `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

---

## Variáveis de ambiente

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Vercel (produção)
NEXT_PUBLIC_API_URL=https://orbien-api.onrender.com/api
```

---

## Débitos técnicos — status

| ID | Descrição | Status |
|---|---|---|
| DT-01 | RLS Isolation Test Suite | ✅ 24/24 |
| DT-02 | Migração Supabase us-west-1 → sa-east-1 | 🔴 **Go-live blocker — executar antes de produção** |
| DT-03 | Timeout 30s | 🟡 Monitorar |
| DT-04 | Onboarding de tenant automatizado | 🔵 Desbloqueado |
| DT-05 | Soft delete + anonimização LGPD | 🔵 Desbloqueado |
| DT-06 | Importação CSV/Excel (pessoas) | ✅ Concluído S9 |

---

## Roadmap após Sprint 10

| Sprint | Módulo | Dependência |
|---|---|---|
| **DT-02** | Migração Supabase sa-east-1 | Antes de qualquer dado real |
| **S11** | Frontend — Grupos, Voluntários, Celebrações, Conteúdo | S10 completo |
| **S12** | App mobile React Native + Expo | S11 completo |
| **S13** | Trial onboarding + checklist de ativação | S10+ |

---

*Gerado em: 2026-06-12 · orbien-web · Sprint 10 pronto para implementação*

