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

A base dos quatro apps do monorepo corresponde à Fase 6 do
`orbien-guia-fases-execucao.md` (sistema web — backend + frontend), mais um
quarto app que não estava no plano original:

| Área | Estado |
|---|---|
| Auth + multi-tenant + papéis | Entregue — JWT próprio, RLS por `tenant_id`/`congregation_id`, papéis granulares |
| Módulo 1 — Membros e Voluntários | Entregue, incluindo escalas, trocas e check-in |
| Módulo 2 — Financeiro | Entregue — plano de contas, lançamentos, PIX cenários 1–3, DRE, fluxo de caixa, exportação contábil |
| Módulo 3 — Pequenos Grupos | Entregue — cadastro, reuniões, presença, biblioteca de materiais agendados |
| Módulo 4 — Conteúdos e Notificações | Entregue — posts, notificações, segmentação |
| Módulo 5 — Celebrações e OC | Entregue — `Celebration`, `CelebrationInstance`, `ServiceOrder`/`ServiceOrderItem`, `Setlist`, integração com escalas do Módulo 1 |
| Plano de plataforma (Nível 0) | Entregue e além do escopo original — `apps/admin`, `@PlatformRoute()`, `platform_support`, sessão de suporte cross-origin, auditoria de acesso de plataforma |
| Infra | Entregue com a atualização do ADR-008: Render (backend) + Vercel (site/web/admin) + Supabase + Cloudflare R2 |

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

- **App mobile (Fase 7, ADR-004/ADR-005):** não existe `apps/mobile` no
  monorepo. Os quatro apps atuais são `api`, `site`, `web` e `admin` — todos
  Next.js ou NestJS. O app do membro/liderança planejado em React Native +
  Expo (com white-label via tema dinâmico ou build por tenant) segue como
  módulo não iniciado. Decidir se ele volta ao roadmap, ou se o `apps/web`
  passa a cobrir esse uso definitivamente, é uma decisão de produto em
  aberto — este documento não a antecipa.
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

## Ciclos de entrega

O trabalho já não segue mais os sprints numerados dos briefings originais
(6, 9, 10) nem as fases nomeadas do guia de execução — o histórico de commits
mostra entrega contínua por PR, com CI (`docs/CI.md`) como portão. A visão de
ciclo daqui para frente:

### Ciclo atual — fechamento do plano de plataforma e consolidação de segurança

Com o plano de plataforma (Nível 0) e o módulo de Celebrações entregues, o
ciclo em andamento é sobre fechar o que ficou pendente na régua de segurança
multi-tenant e no controle de acesso — a régua que o próprio `CLAUDE.md`
descreve em detalhe (RLS por congregação, `platform_support`, auditoria de
sessão de suporte, rate limiting de login). `docs/PENDENCIAS.md` é o
registro vivo desse trabalho.

### Próximo ciclo — fechamento de conformidade

- Revisão jurídica formal dos documentos legais e do contrato v4
- Resolução dos itens marcados `[REVISÃO JURÍDICA OBRIGATÓRIA]`
- Checklist de pré-go-live da seção 9 de `orbien-lgpd-mapping.md`
- Job de retenção de dados (anonimização/eliminação automática) — hoje
  descrito no mapeamento LGPD como plano, sem confirmação de que existe
  como cron no `apps/api`

### Ciclos seguintes — decisão de produto, não apenas execução

Estes dependem de uma decisão explícita antes de virar trabalho de
implementação — não são compromissos, são o que o material de produto deixa
em aberto:

1. **Mobile:** retomar a Fase 7 (React Native + Expo) como planejado, ou
   assumir formalmente o `apps/web` como a superfície mobile do produto.
2. **Diferenciais de IA** listados na tabela comparativa de
   `produto-gestao-igrejas-mvp.md` (seção 5) — cuidado pastoral preditivo,
   classificação de doações, projeção financeira — nenhum tem desenho
   técnico ainda.
3. **White-label premium (build por tenant via EAS)** — depende da decisão
   de mobile acima.
4. **Primeiro cliente Premium fora do cliente zero** — condicionado ao
   fechamento do ciclo de conformidade.

## Como manter este documento

Atualize a seção "O que já foi entregue" quando um módulo novo for
concluído, e a seção "Ciclos de entrega" quando o ciclo atual fechar. Não
duplique aqui o detalhe de achados de segurança ou de portão de CI — isso
mora em `docs/PENDENCIAS.md`, que é o documento vivo. Este arquivo é sobre
direção, não sobre o dia a dia da revisão.
