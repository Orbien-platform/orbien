# Pricing & Funcionalidades por Plano
## Church Platform — SaaS White-label de Gestão de Igrejas

**Versão:** 1.1
**Status:** decidido
**Última atualização:** 2026-05
**Alterações v1.1:** alinhamento com produto-gestao-igrejas-mvp.md e ADRs — PIX cenário 3 no Starter, evento com inscrição no Starter, chat de célula, módulo OC/Celebrações no Premium, referências aos ADRs, seção de stack técnica adicionada.

---

## 1. Planos e Mensalidades

### 1.1 Tabela de preços

| Faixa | Membros ativos | Starter | Premium |
|---|---|---|---|
| Micro | até 50 | R$ 59,90/mês | R$ 99,90/mês |
| Pequena | 51–150 | R$ 89,90/mês | R$ 159,90/mês |
| Média | 151–300 | R$ 159,90/mês | R$ 249,00/mês |
| Crescimento | 301–600 | — | R$ 349,00/mês |
| Grande | 601+ | — | R$ 499,00/mês |

> Starter não está disponível acima de 300 membros ativos. Igrejas que ultrapassam esse limite migram obrigatoriamente para o Premium.

### 1.2 Regras de faixa

- Contagem de membros ativos é revisada mensalmente pelo sistema
- Ao atingir a faixa seguinte, a igreja recebe **30 dias de carência** antes da cobrança no novo valor
- O sistema notifica automaticamente a liderança ao se aproximar do limite (aviso em 80% e 100% do limite)

### 1.3 Desconto anual

- **10% de desconto** no primeiro ano para contratações no plano Premium
- Aplicável a todas as faixas do Premium
- Válido apenas na primeira contratação — renovações seguem tabela padrão com reajuste IGPM/IPCA

---

## 2. Filiais e Congregações Adicionais

- **Primeira congregação (sede):** inclusa em qualquer plano, sem custo adicional
- **Cada filial adicional:**

| Plano | Valor por filial/mês |
|---|---|
| Starter | R$ 49,90 |
| Premium | R$ 79,90 |

### Regras de filial

- Filial Premium herda todos os recursos do plano Premium da matriz
- Faturamento consolidado na matriz — um único contrato, uma única cobrança
- Usuários logados visualizam apenas os dados da unidade à qual pertencem como membros
- Gestores da plataforma web podem ter acesso multi-congregação conforme permissão configurada
- Critério de filial: unidade com endereço físico distinto e base de membros própria
- Arquitetura: todo registro carrega `tenant_id` + `congregation_id` com RLS no Postgres (ADR-001)

---

## 3. Taxa de Implantação (one-time)

| Cenário | Valor |
|---|---|
| Starter — sem publicação nas lojas | R$ 299,00 |
| Premium — com publicação nas lojas incluída | R$ 499,00 |
| Starter que deseja publicar nas lojas separadamente | R$ 799,00 |
| Migração assistida de dados (planilha ou outro sistema) | R$ 499,00 – R$ 999,00 |

> **Publicação nas lojas (Premium):** exige que a igreja crie conta própria na Apple Developer (US$ 99/ano) e Google Play Console (US$ 25 único). O processo de setup e publicação via EAS Build é realizado pela plataforma dentro do valor de implantação Premium (ADR-005).

> **Starter:** app opera no app-pai da plataforma com skin dinâmica carregada por `tenant_id`. OTA updates via Expo Updates permitem correções sem nova submissão às lojas. Exibe "Powered by Church Platform".

---

## 4. Receita Transacional

| Origem | Fee | Disponibilidade |
|---|---|---|
| PIX dinâmico via Asaas — Cenário 2 | 1% por transação | Somente Premium |
| PIX por chave manual — Cenário 1 | Sem fee | Starter e Premium |
| Página pública — QR dinâmico identificado — Cenário 3 Premium | 1% por transação | Somente Premium |
| Página pública — chave manual — Cenário 3 Starter | Sem fee | Starter e Premium |

> Fee de 1% retido via split automático no Asaas. A Asaas cobra ~1% adicionalmente, resultando em custo efetivo de ~2% para a igreja no plano Premium. Lógica de doação abstraída em serviço dedicado no NestJS para facilitar troca de provedor no futuro (ADR-007).

---

## 5. Funcionalidades por Plano

### 5.1 Módulo — Membros e Voluntários

| Funcionalidade | Starter | Premium |
|---|---|---|
| Cadastro completo de pessoas (dados pessoais, eclesiásticos, família) | ✅ | ✅ |
| Modelo de dados orientado a "pessoa" (Person + PersonRole + Household) | ✅ | ✅ |
| Cadastro rápido de visitante (formulário enxuto + QR code) | ✅ | ✅ |
| Consentimento LGPD obrigatório no cadastro (sem aceite, não conclui) | ✅ | ✅ |
| Classificação de vínculo (visitante · frequentador · membro) | ✅ | ✅ |
| Histórico de classificação (quem mudou, quando, motivo) | ✅ | ✅ |
| Reclassificação automática visitante → frequentador (3 visitas / 60 dias) | ✅ | ✅ |
| Deduplicação inteligente de cadastros (fuzzy matching) | ✅ | ✅ |
| Importação via CSV/Excel com mapeamento guiado de colunas | ✅ | ✅ |
| Dashboard demográfico (sexo, faixa etária, classificação) | ✅ | ✅ |
| Tags livres e tags do sistema | ✅ | ✅ |
| Núcleo familiar (Household) | ✅ | ✅ |
| Perfil de voluntário (ministérios, habilidades, disponibilidade) | ✅ | ✅ |
| Escalas manuais de voluntários | ✅ | ✅ |
| Confirmação/recusa de escala pelo voluntário no app | ✅ | ✅ |
| Solicitação de troca de escala peer-to-peer | ✅ | ✅ |
| Check-in de voluntário (QR code) | ✅ | ✅ |
| Sugestão automática de escala por disponibilidade e rodízio | ❌ | ✅ |
| Segmentação avançada para comunicação (comportamento, engajamento) | ❌ | ✅ |
| Fila CRM de trials não convertidos e inadimplentes | ❌ | ✅ |

---

### 5.2 Módulo — Financeiro

| Funcionalidade | Starter | Premium |
|---|---|---|
| Plano de contas hierárquico (sintético + analítico) | ✅ | ✅ |
| Centros de custo | ✅ | ✅ |
| Lançamentos manuais (receita e despesa) | ✅ | ✅ |
| Anexo de comprovantes em despesas | ✅ | ✅ |
| Recorrência de lançamentos (dízimo recorrente, aluguel) | ✅ | ✅ |
| PIX por chave manual — Cenário 1 (copia-e-cola, sem integração) | ✅ | ✅ |
| Página pública de doação — chave manual, Cenário 3 (link/QR estático) | ✅ | ✅ |
| Histórico de contribuição no perfil do membro | ✅ | ✅ |
| Relatórios básicos (receita por categoria, mês a mês) | ✅ | ✅ |
| Dashboard de entradas semanais | ✅ | ✅ |
| Log imutável de auditoria de lançamentos (quem criou, editou, quando) | ✅ | ✅ |
| PIX dinâmico com QR code identificado por doador e categoria — Cenário 2 | ❌ | ✅ |
| Confirmação automática de pagamento via webhook Asaas | ❌ | ✅ |
| **PIX recorrente — dízimo automático mensal (PIX Automático via Asaas)** | ❌ | ✅ |
| Recibo automático por email/PDF | ❌ | ✅ |
| Página pública de doação com QR dinâmico identificado — Cenário 3 Premium | ❌ | ✅ |
| DRE configurável | ❌ | ✅ |
| Fluxo de caixa | ❌ | ✅ |
| Gráfico de forecast (projeção 3, 6 e 12 meses) | ❌ | ✅ |
| Balancete por centro de custo | ❌ | ✅ |
| Exportação contábil (OFX, CSV padronizado, PDF razão/diário, SPED quando aplicável) | ❌ | ✅ |
| Anexação automática de comprovantes no pacote exportado (ZIP) | ❌ | ✅ |
| Carnê do dizimista / relatório anual para IR | ❌ | ✅ |
| Conciliação bancária básica (importar OFX) | ❌ | ✅ |

> **Permissões financeiras:** Tesoureiro vê tudo · Pastor vê resumos sem detalhe nominal (LGPD + ética) · Membro vê só o próprio histórico.

---

### 5.3 Módulo — Pequenos Grupos

| Funcionalidade | Starter | Premium |
|---|---|---|
| Tipos de grupo configuráveis (célula, GC, EBD, discipulado, interesse) | ✅ | ✅ |
| Hierarquia de grupos (rede/setor → supervisor → líder → célula) | ✅ | ✅ |
| Localização da célula (endereço + mapa) | ✅ | ✅ |
| Registro de reunião semanal (presença, visitantes, tema, observações) | ✅ | ✅ |
| Check-in de membros via QR code no encontro | ✅ | ✅ |
| Alerta de ausência consecutiva para o líder | ✅ | ✅ |
| Pedidos de oração da célula | ✅ | ✅ |
| Dashboard do líder (presenças, visitantes, ofertas) | ✅ | ✅ |
| Biblioteca de materiais de estudo (PDF, DOC, editor rico) | ✅ | ✅ |
| Agendamento de publicação de materiais (data/hora futura) | ✅ | ✅ |
| Data de expiração de material (some da biblioteca após a data) | ✅ | ✅ |
| Notificação automática ao publicar material | ✅ | ✅ |
| Histórico de versões de materiais | ✅ | ✅ |
| Indicador de abertura do material por membro do grupo | ✅ | ✅ |
| Chat fechado por célula (discussão do material) | ✅ | ✅ |
| Banco de estudos da denominação replicado nas congregações | ✅ | ✅ |
| "Encontre uma célula" no app (mapa público, filtros, botão visitar) | ✅ | ✅ |
| Dashboard de supervisor (células consolidadas) | ✅ | ✅ |
| Multiplicação de célula (LT herda membros, histórico de origem) | ✅ | ✅ |
| Dashboard pastoral (rede inteira, células estagnadas/crescendo) | ❌ | ✅ |
| Saúde da célula em semáforo (verde/amarelo/vermelho) | ❌ | ✅ |
| Árvore genealógica de células (visualização) | ❌ | ✅ |
| Metas de multiplicação por rede/supervisor | ❌ | ✅ |
| Taxa de conversão visitante → membro originada em célula | ❌ | ✅ |

---

### 5.4 Módulo — Conteúdos e Notificações

| Funcionalidade | Starter | Premium |
|---|---|---|
| Post de timeline (texto + imagem/vídeo) | ✅ | ✅ |
| Vídeo de pregação (upload ou link YouTube/Vimeo) | ✅ | ✅ |
| Áudio (link Spotify/SoundCloud) | ✅ | ✅ |
| Devocional / plano de leitura (cards diários) | ✅ | ✅ |
| Estudo/documento (PDF, ebook) | ✅ | ✅ |
| Aviso/comunicado oficial | ✅ | ✅ |
| Pedido de oração da liderança | ✅ | ✅ |
| Evento com inscrição (sem processamento de pagamento) | ✅ | ✅ |
| Evento com inscrição e pagamento integrado ao financeiro | ❌ | ✅ |
| Agendamento de publicação (data/hora futura) | ✅ | ✅ |
| Notificações push manuais | ✅ | ✅ |
| Notificações push automáticas (escala, aniversário, célula, recibo, material) | ✅ | ✅ |
| Preferências de notificação por categoria no app do membro | ✅ | ✅ |
| Métricas de notificação (entrega, abertura, clique) via OneSignal | ✅ | ✅ |
| Conteúdo da denominação replicado nas congregações (com opção de ocultar) | ✅ | ✅ |
| Segmentação básica (toda congregação, grupos, ministério, faixa etária) | ✅ | ✅ |
| Segmentação avançada (comportamento, engajamento, inativos no app) | ❌ | ✅ |

> Notificações: Expo Notifications (camada de device) + OneSignal (disparo e métricas). Tags do OneSignal espelham `tenant_id`, `congregation_id`, `role`, `pg_ids` (ADR-009).

---

### 5.5 Módulo — Celebrações e Ordem de Celebração (OC)

> Módulo nativo incluído na Fase 3 do MVP. Dependência: Módulo de Voluntários e Escalas precisa estar completo (ADR-011). Dor validada no cliente zero Doca Church.

| Funcionalidade | Starter | Premium |
|---|---|---|
| Cadastro de Celebração recorrente (culto, reunião, evento) | ❌ | ✅ |
| Template de Ordem de Celebração (OC) com etapas configuráveis | ❌ | ✅ |
| Vinculação automática de escalas do módulo de voluntários à OC | ❌ | ✅ |
| OC digital no app para o Host e equipe no dia do culto | ❌ | ✅ |
| OC imprimível (PDF) | ❌ | ✅ |
| Histórico de OCs anteriores | ❌ | ✅ |

---

### 5.6 Plataforma — App e Identidade Visual

| Funcionalidade | Starter | Premium |
|---|---|---|
| App mobile (iOS + Android) | ✅ | ✅ |
| Personalização de cores primária e secundária | ✅ | ✅ |
| Logo e ícone próprios | ✅ | ✅ |
| Splash screen personalizada | ✅ | ✅ |
| Nome do app personalizado | ✅ | ✅ |
| App no app-pai da plataforma (skin dinâmica via `tenant_id`) | ✅ | — |
| OTA updates via Expo Updates (correções sem passar pela loja) | ✅ | ✅ |
| App próprio nas lojas (conta Apple Developer + Google Play da própria igreja) | ❌ | ✅ |
| Build dedicado por tenant via EAS Build | ❌ | ✅ |
| Domínio próprio (`app.suaigreja.com.br`) — DNS configurado pela plataforma | ❌ | ✅ |
| Termos de uso próprios por tenant | ❌ | ✅ |
| "Powered by Church Platform" visível | ✅ | ❌ |

---

### 5.7 Plataforma — Infraestrutura e Segurança

| Funcionalidade | Starter | Premium |
|---|---|---|
| Multi-tenant com isolamento de dados por RLS no Postgres | ✅ | ✅ |
| Todo registro carrega `tenant_id` + `congregation_id` | ✅ | ✅ |
| LGPD — consentimento, histórico, exportação de dados pessoais | ✅ | ✅ |
| Dados religiosos tratados como dado sensível (LGPD Art. 11) | ✅ | ✅ |
| Autenticação JWT própria (access token curto + refresh token rotation) | ✅ | ✅ |
| Senhas com hash Argon2 (sem vendor externo de auth) | ✅ | ✅ |
| Papéis e permissões granulares por módulo e escopo | ✅ | ✅ |
| Log imutável de auditoria | ✅ | ✅ |
| Dados armazenados no Brasil (Supabase São Paulo sa-east-1) | ✅ | ✅ |
| Storage de mídia no Brasil (Cloudflare R2, zero custo de egress) | ✅ | ✅ |
| Suporte via email | ✅ | ✅ |
| Suporte via WhatsApp | ❌ | ✅ |
| SLA: 2h primeiro atendimento / 2 dias úteis resolução | ✅ | ✅ |

---

## 6. Modelo Comercial

| Item | Condição |
|---|---|
| Contrato mínimo | 12 meses com cobrança mensal |
| Multa rescisória | 35% do valor dos meses restantes |
| Reajuste anual | IGPM/IPCA (aplicado na renovação) |
| Trial | 14 dias gratuitos — app genérico, sem processamento de pagamentos, sem prorrogação |
| Pós-trial sem conversão | Suspensão automática no dia 15, régua de contato nos dias 15, 18 e 21 — fila CRM de trials não convertidos |
| Cobrança | Cartão de crédito ou PIX, vencimento fixo (1, 10 ou 20) |
| Inadimplência | Bloqueio após 5 dias do vencimento com aviso nos dias 1, 3 e 5 — fila CRM de inadimplentes para contato ativo |
| Cancelamento | Acesso até o último dia pago |
| Retenção de dados | 5 anos após cancelamento para todos os tipos de dado |
| Exportação de dados | Via chamado de atendimento dentro do período de retenção |

---

## 7. Stack Técnica (referência — ADRs)

| Camada | Tecnologia | ADR |
|---|---|---|
| Backend | Node.js + NestJS | ADR-002 |
| Frontend web | Next.js + Tailwind + Shadcn/UI | ADR-003 |
| Mobile | React Native + Expo | ADR-004 |
| White-label mobile | Skin dinâmica (Starter) + EAS Build por tenant (Premium) | ADR-005 |
| Auth | JWT próprio no NestJS + Argon2 | ADR-006 |
| PIX | Asaas — 3 cenários + split ~1% | ADR-007 |
| Infra | Render (backend) + Vercel (frontend) | ADR-008 |
| Banco | Supabase — Postgres puro (Auth/Storage/Realtime não utilizados) | ADR-008 |
| Storage | Cloudflare R2 | ADR-008 |
| Notificações | Expo Notifications + OneSignal | ADR-009 |
| ORM | Prisma | ADR-010 |
| Multi-tenancy | Tabela compartilhada + `tenant_id` + `congregation_id` + RLS Postgres | ADR-001 |

---

*Versão 1.1 — Atualizado com base em produto-gestao-igrejas-mvp.md e adrs-architecture-decisions.md em 2026-05.*

