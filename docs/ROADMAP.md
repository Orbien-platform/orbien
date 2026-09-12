# Roadmap — Orbien

Este documento traduz o material de produto em `docs/produto/` para o estado
atual do repositório: o que já foi entregue, o que ficou diferente do
planejado originalmente, e a visão de ciclos de entrega daqui para frente.
Onde os dois divergem, este arquivo descreve o que existe — os arquivos em
`docs/produto/` continuam valendo como registro histórico de decisão, não
como retrato do presente.

## Visão do produto

Orbien é uma plataforma SaaS white-label de gestão de igrejas, multi-tenant
em três níveis (plataforma → denominação/tenant → congregação), com quatro
módulos originais — Membros e Voluntários, Financeiro, Pequenos Grupos,
Conteúdos e Notificações — mais um quinto módulo nativo, Celebrações e Ordem
de Celebração (OC), acrescentado a partir da dor validada no cliente zero
(Doca Church). O detalhamento funcional de cada módulo está em
`docs/produto/produto-gestao-igrejas-mvp.md`; as decisões de arquitetura que
sustentam isso estão em `docs/produto/adrs-architecture-decisions.md`.

## O que já foi entregue

A base de `api`, `site` e `web` corresponde à Fase 6 do
`orbien-guia-fases-execucao.md` (sistema web — backend + frontend). A ela se
somaram dois apps a mais: o `admin`, que não estava no plano original, e o
`mobile`, que estava (Fase 7) e foi retomado — cinco no total:

| Área | Estado |
|---|---|
| Auth + multi-tenant + papéis | Entregue — JWT próprio, RLS por `tenant_id`/`congregation_id`, papéis granulares |
| Módulo 1 — Membros e Voluntários | Entregue, incluindo escalas, trocas e check-in |
| Módulo 2 — Financeiro | Entregue — plano de contas, lançamentos, PIX cenários 1–3, DRE, fluxo de caixa, exportação contábil |
| Módulo 3 — Pequenos Grupos | Entregue — cadastro, reuniões, presença, biblioteca de materiais agendados |
| Módulo 4 — Conteúdos e Notificações | Entregue — posts, notificações, segmentação |
| Módulo 5 — Celebrações e OC | Entregue — `Celebration`, `CelebrationInstance`, `ServiceOrder`/`ServiceOrderItem`, `Setlist`, integração com escalas do Módulo 1 |
| Plano de plataforma (Nível 0) | Entregue e além do escopo original — `apps/admin`, `@PlatformRoute()`, `platform_support`, sessão de suporte cross-origin, auditoria de acesso de plataforma, cancelamento/reativação de `TenantPlan` (sem tela) |
| Retenção de dados (LGPD, seção 5) | Entregue nas 4 categorias de pessoa + aviso semanal ao admin; faltam auditoria (2 anos) e consentimento (5 anos pós-revogação) — ver "Ciclo atual" |
| App mobile (Fase 7, ADR-004/ADR-005) | **Entregue na variante Starter** — `apps/mobile` (Expo + React Native). Verificados: MOB-01/02 (sessão e fila de refresh serializada), MOB-03 (tema por tenant em runtime), MOB-04/05 (escala, check-in, indisponibilidade), MOB-06/07 (feed de conteúdo, push OneSignal com deep link), MOB-08 (Celebrações e OC), MOB-09 (Pequenos Grupos), MOB-11/12 (workspace e config dinâmica de identidade). Falta MOB-10 (preferências de notificação, P3). Ver `.specs/features/app-mobile/` |
| Infra | Entregue com a atualização do ADR-008: Render, runtime Node (backend) + Vercel (site/web/admin) + EAS Build (mobile) + Supabase + Cloudflare R2 |

Isso cobre a Fase 1 e a Fase 2 do roadmap de MVP original (seção 4 de
`produto-gestao-igrejas-mvp.md`) por inteiro, e a maior parte da Fase 3 —
incluindo a peça que o próprio documento marcava como última do MVP
(Celebrações e OC, dependente do módulo de voluntários).

O plano de plataforma (Nível 0 — `apps/admin`, login próprio, impersonação
com sessão de suporte) não estava especificado nos documentos de produto
originais; nasceu durante a execução das Fases 4–7 do
`orbien-guia-fases-execucao.md` e está registrado nas regras do
`CLAUDE.md` na raiz do monorepo, que são a fonte de verdade sobre como esse
plano funciona hoje.

## Onde o plano original ficou para trás

- **App mobile (Fase 7, ADR-004/ADR-005):** era o item mais antigo desta lista
  — até 2026-09-08 este documento registrava a ausência do app nativo e tratava
  como decisão de produto em aberto se a Fase 7 voltaria ao roadmap ou se o
  `apps/web` assumiria esse uso. **Resolvido:** a decisão foi tomada em favor
  da Fase 7 e a variante Starter está entregue, com `apps/mobile` como quinto
  app do monorepo. O que sobrou dela está em "O que falta no mobile", logo
  abaixo — execução, não decisão.
- **Contratos e documentos legais** (`church-platform-documentos-legais.md`,
  `contrato-church-platform-v4.md`) seguem como rascunhos com marcações
  `[REVISÃO JURÍDICA OBRIGATÓRIA]` não resolvidas — nenhum indício no
  repositório de que passaram por revisão de advogado.
- **Mapeamento LGPD** (`orbien-lgpd-mapping.md`) tem checklist de
  pré-go-live e itens em aberto para revisão jurídica (seção 10 do próprio
  arquivo) que também não têm registro de terem sido fechados.
- Os débitos técnicos de Sprints 1–5 (`orbien-debitos-tecnicos*.md`) foram
  substituídos, como mecanismo de acompanhamento, pelo formato vivo de
  `docs/PENDENCIAS.md` — que documenta achados mais recentes (o mais
  recente registrado ali é de 2026-09-03, sobre RLS do plano de
  plataforma).

## O que falta no mobile

A variante Starter está entregue e verificada, mas isso não é o mesmo que
publicável. O que separa uma coisa da outra, hoje:

- ~~**`ORBIEN_API_URL` não está no profile `production` do `eas.json`.**~~
  Fechado em 2026-09-11 (PR #72). O `production` define
  `ORBIEN_API_URL=https://orbien-api.onrender.com/api`, como os dois profiles
  `preview` — uma build de loja não sai mais apontando para o default de
  `localhost:3000` do `app.config.js`.
- ~~**O app id do OneSignal é placeholder.**~~ Fechado no mesmo PR:
  `ORBIEN_ONESIGNAL_APP_ID` está no profile `production`, com o mesmo app id
  do `ONESIGNAL_APP_ID` da API — é o mesmo app no dashboard da OneSignal, um
  lado manda push e o outro registra o device. Os profiles `preview` e
  `generic` seguem no placeholder de propósito: são builds internos e não
  faz sentido gastar cota do app real.
- **`DEPLOY.md` não tem parte de mobile.** Cobre API, site, web e admin; não
  há procedimento escrito de build de produção, submissão às lojas nem OTA
  (Expo Updates, que o ADR-004 prevê e o v1 explicitamente adiou). O
  `apps/mobile/README.md` cobre credenciais e profiles, mas não é o
  documento de deploy do monorepo.
- **MOB-10 — preferências de notificação por usuário** (P3). Único requisito
  funcional do `app-mobile/spec.md` ainda pendente.

O primeiro é operacional, não de produto: não exige decisão, só execução.
Estão aqui, e não em `docs/PENDENCIAS.md`, porque são o que falta para um
módulo do roadmap chegar ao usuário — não achados de revisão.

## Ciclos de entrega

O trabalho já não segue mais os sprints numerados dos briefings originais
(6, 9, 10) nem as fases nomeadas do guia de execução — o histórico de commits
mostra entrega contínua por PR, com CI (`docs/CI.md`) como portão. A visão de
ciclo daqui para frente:

### Ciclo anterior — fechamento do plano de plataforma e consolidação de segurança (concluído)

As dez pendências abertas pelo primeiro run de CI (RLS por congregação e por
plataforma, auditoria de sessão de suporte, rate limiting de login, rotas
públicas mortas, cadastro por QR, telas sem estado de "sem acesso") estão
todas fechadas em `docs/PENDENCIAS.md`. Três resíduos ficaram registrados
como "aberto por desenho" — decisão consciente, não trabalho esquecido — e
não bloqueiam o ciclo:

- rodar o `bootstrap-db.sh` completo em produção (ação operacional, não
  código — sem isso o RLS do plano de plataforma não vale em produção);
- rate limit de login por IP, além do atual por identificador — depende de
  `X-Forwarded-For` confiável atrás do Render, decisão de infra;
- `user_accounts`/`role_assignments`/`audit_logs` seguem com
  `orbien_app_auth USING (true)` — só importa se nascer rota pública nova
  que as toque.

### Ciclo atual — fechamento de conformidade

- Revisão jurídica formal dos documentos legais e do contrato v4
- Resolução dos itens marcados `[REVISÃO JURÍDICA OBRIGATÓRIA]`
- Checklist de pré-go-live da seção 9 de `orbien-lgpd-mapping.md`
- ~~Job de retenção de dados (anonimização/eliminação automática) — hoje
  descrito no mapeamento LGPD como plano, sem confirmação de que existe como
  cron no `apps/api`~~ **Entregue.** A afirmação já estava obsoleta quando foi
  escrita: o `PersonsRetentionScheduler` (DT-05/DT-07) rodava desde antes,
  para 2 das 4 categorias da seção 5 do mapeamento. As outras duas fecharam
  em 2026-09-11 — ver abaixo.

**O que a retenção cobre hoje** (`apps/api/src/persons/`,
feature `.specs/features/reten-dados-fim-contrato/`):

| O que | Prazo | Onde |
|---|---|---|
| Visitante sem evolução (seção 5) | 1 ano | `purgeInactivePersons` (cron 4h) |
| Membro sem vínculo financeiro (seção 5) | 2 anos | `purgeInactivePersons` (cron 4h) |
| Dado financeiro — doador (seção 5) | 5 anos após o fim do contrato | `purgeFinancialDonorsAfterContractEnd` (cron 5h) |
| Dado de menor de 18 anos (seção 5) | 30 dias após o fim do contrato | `purgeMinorsAfterContractEnd` (cron 6h) |
| Exclusão a pedido do titular (Art. 18, DT-05) | 30 dias após o soft delete | `purgeExpiredSoftDeletes` (cron 3h) |
| Aviso ao admin de prazo vencendo em 7 dias (seção 5.1) | semanal | `PersonsRetentionNotifierService` (segunda, 8h) |

Todas anonimizam (`anonymizedFields()`), nunca fazem `DELETE` físico: a
`financial_transaction` fica intacta, que é a obrigação fiscal — o que sai é o
cadastro da pessoa. O marco de "fim do contrato" é
`TenantPlan.cancelled_at`, campo novo, escrito por
`POST /platform/tenants/:id/cancel` e limpo por `.../reactivate`
(`CancelTenantPlanService`, rota de plataforma). É o fluxo mínimo para o campo
ter um escritor — **não** é uma jornada de billing, e não tem tela no
`apps/admin`: hoje só se cancela um tenant chamando a rota.

**O que falta da seção 5.** A tabela de retenção do mapeamento tem oito
linhas; as que falam de cadastro de pessoa estão cobertas pelos crons acima.
Sobram as duas que não são cadastro, declaradas fora do escopo daquela
entrega:

- retenção de **logs de acesso e auditoria** (2 anos, Marco Civil Art. 15);
- retenção de **registros de consentimento** (5 anos após a revogação).

### Ciclos seguintes — decisão de produto, não apenas execução

Estes dependem de uma decisão explícita antes de virar trabalho de
implementação — não são compromissos, são o que o material de produto deixa
em aberto:

1. ~~**Mobile:** retomar a Fase 7 ou assumir o `apps/web` como superfície
   mobile.~~ **Decidido e executado** — Fase 7, variante Starter, entregue em
   2026-09. O que resta dela não é decisão, é execução: ver "O que falta no
   mobile" acima.
2. **Diferenciais de IA** listados na tabela comparativa de
   `produto-gestao-igrejas-mvp.md` (seção 5) — cuidado pastoral preditivo,
   classificação de doações, projeção financeira — nenhum tem desenho
   técnico ainda.
3. **White-label premium (build por tenant via EAS)** — a arquitetura já está
   pronta e é decisão registrada (AD-002 em `.specs/STATE.md`: um só codebase,
   variantes por profile do EAS + `app.config.js` dinâmico). O que falta é o
   pipeline de release por tenant e a submissão de loja por igreja — e o
   Starter chegar às lojas antes, o que depende de "O que falta no mobile".
4. **Gating por plano.** `TenantPlan` existe no schema, é gravado no
   provisionamento e desde 2026-09-11 tem ciclo de vida — `status` e
   `cancelled_at` mudam por `POST /platform/tenants/:id/cancel` e
   `/reactivate`. Mas nenhum ponto do código lê o **plano**: nem a matriz de
   funcionalidade Starter × Premium de `pricing-church-platform.md`, nem o
   teto de 300 membros ativos do Starter. Hoje os dois planos são o mesmo
   produto, e o item 5 depende disto. Cancelar também não corta acesso: só
   marca a data que os jobs de retenção usam.
5. **Primeiro cliente Premium fora do cliente zero** — condicionado ao
   fechamento do ciclo de conformidade e ao item 4.

## Como manter este documento

Atualize a seção "O que já foi entregue" quando um módulo novo for
concluído, e a seção "Ciclos de entrega" quando o ciclo atual fechar. Não
duplique aqui o detalhe de achados de segurança ou de portão de CI — isso
mora em `docs/PENDENCIAS.md`, que é o documento vivo. Este arquivo é sobre
direção, não sobre o dia a dia da revisão.
