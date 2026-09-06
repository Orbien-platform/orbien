# Documentação de produto — Orbien

Os 12 arquivos desta pasta vieram do Project do Claude usado para desenhar o
Orbien (ADRs, especificação de produto, pricing, LGPD, contratos e os
briefings de sprint que guiaram as sessões de implementação). Eles foram
trazidos para o monorepo em 2026-09 para deixarem de viver só no Project e
passarem a ser versionados junto do código que descrevem.

Nessa importação, toda referência a **Railway** foi atualizada para
**Render** — o backend migrou de hospedagem depois que a maior parte destes
documentos foi escrita (ver ADR-008 em `adrs-architecture-decisions.md`).
Fora isso, o conteúdo é o mesmo que orientou o desenvolvimento até a Sprint
10; não foi re-escrito para refletir o estado atual do código linha a linha.

**Para o estado atual do projeto — o que já foi entregue, o que está em
aberto e os próximos ciclos — ver [`docs/ROADMAP.md`](../ROADMAP.md).** Os
arquivos abaixo são a base de decisão histórica, não o retrato do presente.

## Índice

| Arquivo | Conteúdo | Status |
|---|---|---|
| [`adrs-architecture-decisions.md`](adrs-architecture-decisions.md) | ADR-001 a ADR-011 — multi-tenancy, stack, auth, PIX, infra, notificações, ORM, módulo de Celebrações | Decisões vigentes; ADR-008 atualizado (Render) |
| [`produto-gestao-igrejas-mvp.md`](produto-gestao-igrejas-mvp.md) | Especificação funcional dos 5 módulos do MVP + comparativo com InPeace/inChurch + roadmap de 3 fases | Base do MVP; roadmap desta seção 4 está superado por `docs/ROADMAP.md` |
| [`pricing-church-platform.md`](pricing-church-platform.md) | Planos Starter/Premium, filiais, taxa de implantação, receita transacional, matriz de funcionalidade por plano | Decidido, v1.1 |
| [`orbien-lgpd-mapping.md`](orbien-lgpd-mapping.md) | Mapeamento técnico de conformidade LGPD — classificação de dados, consentimento, direitos do titular, retenção, auditoria | Visão de engenharia; itens jurídicos seguem em aberto (seção 10 do próprio arquivo) |
| [`church-platform-documentos-legais.md`](church-platform-documentos-legais.md) | Rascunhos: Termos B2B, Termos do usuário final, Política de Privacidade, Política de Cookies, texto de consentimento LGPD | ⚠️ Rascunho — não publicar sem revisão jurídica (marcações `[REVISÃO JURÍDICA OBRIGATÓRIA]` no texto) |
| [`contrato-church-platform-v4.md`](contrato-church-platform-v4.md) | Minuta de contrato de prestação de serviços SaaS, v4, com anexos comerciais e DPA | ⚠️ Rascunho — mesma ressalva jurídica acima |
| [`orbien-debitos-tecnicos.md`](orbien-debitos-tecnicos.md) | Débitos técnicos mapeados nas Sprints 1–4 | Histórico — ver `docs/PENDENCIAS.md` para achados mais recentes |
| [`orbien-debitos-tecnicos-v2.md`](orbien-debitos-tecnicos-v2.md) | Débitos técnicos mapeados nas Sprints 1–5 (revisão do anterior) | Histórico — ver `docs/PENDENCIAS.md` para achados mais recentes |
| [`orbien-guia-fases-execucao.md`](orbien-guia-fases-execucao.md) | Guia operacional das Fases 4–7 do plano de execução original | Histórico — fases já concluídas; console de plataforma (`apps/admin`) nasceu aqui |
| [`orbien-sprint6-briefing.md`](orbien-sprint6-briefing.md) | Briefing de sessão — Sprint 6 (Conteúdo e Notificações) | Histórico |
| [`orbien-sprint9-session-prompt.md`](orbien-sprint9-session-prompt.md) | Briefing de sessão — Sprint 9 (Exportação contábil, DRE, importação CSV) | Histórico |
| [`orbien-s10-session-prompt.md`](orbien-s10-session-prompt.md) | Briefing de sessão — Sprint 10 (frontend web) | Histórico |

## Como isto se relaciona com o resto de `docs/`

- `docs/MONOREPO.md`, `docs/CI.md`, `docs/TESTES.md`, `docs/PENDENCIAS.md`
  descrevem o repositório **como ele é hoje** — convenções, portões de CI,
  achados de revisão.
- Esta pasta (`docs/produto/`) descreve **por que o produto é como é** —
  as decisões de arquitetura e de negócio que vieram antes do código.
- `docs/ROADMAP.md` faz a ponte entre os dois: o que este material planejou,
  o que já saiu e o que vem a seguir.
