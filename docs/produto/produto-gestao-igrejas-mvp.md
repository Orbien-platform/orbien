# Produto de Gestão de Igrejas — White-label, Multi-igreja e Multicongregação

**Documento de iniciação de produto · v0.1**
Base comparativa: InPeace + inChurch (líderes no Brasil/LATAM)
Escopo inicial: 4 módulos — Membros & Voluntários · Financeiro · Pequenos Grupos · Conteúdos & Notificações

---

## 1. Princípios arquiteturais do produto

Antes de detalhar módulos, três decisões transversais que afetam todo o sistema:

### 1.1 Multi-tenant em três níveis (white-label · denominação · congregação)

A arquitetura precisa suportar três níveis hierárquicos desde o dia 1, ou vira retrabalho gigante depois:

- **Nível 0 — Plataforma (você):** opera o SaaS, vende para denominações ou igrejas isoladas.
- **Nível 1 — Tenant raiz (denominação ou igreja-sede):** dona da marca, app personalizado, identidade visual, contratos, billing consolidado.
- **Nível 2 — Congregações/filiais:** unidades operacionais. Cada uma tem membros, financeiro, células e agenda próprios, mas podem compartilhar conteúdos do Nível 1.

Isso é o que inChurch chama de "multigestor" e é o que permite vender para denominações como Metodista Wesleyana (763 igrejas) num único contrato.

**Decisão técnica:** todo registro (membro, lançamento, célula, post) carrega `tenant_id` + `congregation_id`. Queries sempre filtram por escopo. Use row-level security (Postgres RLS) ou equivalente.

### 1.2 White-label real, não só "logo trocada"

A diferença entre concorrente médio e líder é o quão profundo vai a personalização. Mínimo viável:

- Cores primária/secundária, logo, ícone, splash, nome do app
- Domínio próprio para o site (`app.igrejaexemplo.com.br`)
- Publicação nas lojas com conta da própria igreja (App Store Connect + Google Play Console) ou via app-pai com skins
- Termos de uso e política de privacidade próprios por tenant

**Decisão de produto:** decidir cedo entre dois modelos — (a) **app único com skins dinâmicas** (mais rápido de evoluir, restringe customização) ou (b) **build por tenant** (mais lento, mas cada igreja tem seu app nas lojas). inChurch e InPeace usam (b) para clientes grandes e (a) para planos starter. Recomendo começar por (a) com plano de migração para (b) no plano premium.

### 1.3 Modelo de dados orientado a "pessoa", não a "membro"

Membro, voluntário, líder de célula, dizimista, visitante, criança no infantil — são **papéis** que uma mesma pessoa pode acumular. Se você modelar como tabelas separadas (que é o erro comum), depois sofre para cruzar dados. Modele:

- `Person` (entidade única)
- `PersonRole` (relacionamento N:N com tipos: visitante, membro, líder, voluntário, etc.)
- `Household` (família/núcleo) — útil para infantil e cuidado pastoral

Esse é o segredo do "perfil 360°" que tanto inChurch quanto InPeace anunciam.

---

## 2. Análise comparativa por módulo + Especificação do MVP

### Módulo 1 — Gestão de Membros e Voluntários

#### Como os concorrentes resolvem

**InPeace**
- Cadastro completo de membros e visitantes
- Detecção de cadastros duplicados
- Autoatualização de dados pelo membro via app
- Sistema de papéis granular: Hierarchy Manager, Administrator, Content Manager, People Manager, Event Manager, Cell Manager, Financial Manager, Group Leader, Standard User
- Voluntariado via parceiro Voluts: check-in, escalas automáticas por IA, troca de escalas peer-to-peer, notificações WhatsApp, perfil de disponibilidade e habilidades

**inChurch**
- Cadastro centralizado integrado com site, app, totem e maquininha
- Autocadastro e autoedição
- Segmentação por grupos para comunicação direcionada
- Relatórios de frequência
- Validação de cartão de membro via app de gestão

#### O que entra no MVP

**Cadastro e perfil**
- Pessoa: dados pessoais, contato, endereço, foto, data de nascimento, estado civil, profissão
- Família/núcleo: vincular pessoas em domicílios
- Dados eclesiásticos: data de batismo, data de membresia, denominação anterior, congregação de origem
- **Classificação de vínculo** (campo obrigatório, exclusivo): `visitante` · `frequentador` · `membro`
  - *Visitante:* primeira(s) visita(s), ainda sem vínculo
  - *Frequentador:* presença recorrente, mas sem membresia formalizada
  - *Membro:* membresia formalizada (com data de membresia preenchida)
  - Mudança de classificação fica registrada em histórico (quem mudou, quando, motivo)
- Tags livres + tags do sistema (em discipulado, em batismo, recém-chegado, etc.) — complementam a classificação principal sem substituí-la
- Histórico de presença (vem do módulo de grupos/eventos)
- Histórico de contribuição (vem do financeiro, com permissão restrita)

**Cadastro rápido de visitante**
- Formulário enxuto com apenas: nome, telefone, email (opcional), sexo (masculino · feminino · prefiro não informar)
- **Consentimento LGPD obrigatório:** checkbox "Aceito receber comunicações da igreja" exibido antes do envio; sem aceite, o cadastro não é concluído. Registro do consentimento guarda data, hora, IP/dispositivo e versão do termo
- Disponível em três formatos:
  - Tela na plataforma (admin/secretaria cadastra)
  - Link público compartilhável (QR code para uso em culto, PG, eventos)
  - Acesso direto no app de liderança/voluntários
- **Origem do cadastro** (campo obrigatório, automático ou selecionável): culto · pequeno grupo · evento · outro
  - Em links públicos, a origem é pré-codificada no link (ex: QR do culto de domingo já registra "culto")
  - Em cadastros internos, o operador escolhe a origem
  - Quando origem é "PG" ou "evento", o sistema vincula automaticamente à reunião/evento ativo selecionado

**Deduplicação no cadastro rápido**
- No momento do envio, sistema busca por telefone igual na base
- **Cadastro interno (operador):** se encontrar correspondência, exibe alerta: "Já existe [Nome] com este telefone — deseja registrar nova visita ou abrir cadastro existente?"
  - Opções: (a) registrar nova visita vinculada ao cadastro existente, (b) abrir cadastro existente para edição, (c) prosseguir com novo cadastro (caso seja outra pessoa com mesmo telefone, ex: familiar)
- **Auto-cadastro via link público (QR code):** deduplicação silenciosa — registra nova visita no cadastro existente sem criar duplicata
  - Tela de sucesso exibe mensagem amigável ao visitante: "Tudo certo, [Nome]! Seu cadastro já está com a gente. Registramos sua presença hoje. Que bom ter você de volta!"
  - Sem expor detalhes técnicos ou levantar suspeita de erro

**Reclassificação automática visitante → frequentador**
- Critério: pessoa classificada como "visitante" que atinge **3 visitas registradas em um período de 60 dias** é reclassificada automaticamente para "frequentador"
- Contagem considera qualquer origem (culto, PG, evento, outro)
- A mudança é registrada no histórico de classificação (motivo: "reclassificação automática — 3 visitas em 60 dias")
- Reclassificação no sentido inverso (frequentador → visitante por inatividade) **fica fora do MVP**
- Visitante cadastrado já entra na base com classificação "visitante" e pode ser enriquecido depois com dados completos

**Filtros na listagem de pessoas**
- Por origem do cadastro (culto, PG, evento, outro)
- Por data do cadastro
- Por evento ou PG específico de origem
- Cruzamento com sexo, faixa etária e classificação

**Dashboard demográfico**
- Quantidade total de membros, frequentadores e visitantes (com filtro por classificação)
- Distribuição por sexo (gráfico de barras ou pizza)
- Distribuição por faixa etária (0-12, 13-17, 18-24, 25-34, 35-44, 45-59, 60+, configurável)
- Filtros por congregação, período de entrada e classificação de vínculo
- Visualização cruzada (sexo × faixa etária)

**Voluntariado**
- Perfil de voluntário: ministérios em que serve, funções, habilidades, disponibilidade semanal recorrente, restrições
- Escalas: criação manual + sugestão automática baseada em disponibilidade e rodízio justo
- Confirmação/recusa pelo voluntário no app, com prazo
- Solicitação de troca peer-to-peer (sistema busca substituto compatível)
- Check-in no dia do serviço (QR code ou geofencing)
- Histórico de serviço e tempo de ministério
- Termo de voluntariado digital aceito no cadastro (LGPD-friendly, exigência cresce no setor)

**Permissões**
- Papéis pré-definidos: Super Admin (tenant), Admin Congregação, Pastor, Secretaria, Tesoureiro, Líder de Célula, Líder de Ministério, Voluntário, Membro
- Permissões granulares por módulo + escopo (toda a igreja vs. minha célula vs. meu ministério)

**Diferencial sugerido pro MVP**
- **Detecção de duplicidade inteligente** no cadastro (nome + telefone + nascimento via fuzzy matching). Concorrentes anunciam isso como diferencial — colocar de saída.
- **Importação de planilha CSV/Excel** com mapeamento de colunas guiado. Maior dor na migração de igreja que sai de planilha ou de outro sistema.

---

### Módulo 2 — Gestão Financeira

#### Como os concorrentes resolvem

**inChurch** (mais robusto que InPeace nesse módulo)
- Integração nativa com maquininha de cartão, totem, site e app — todas as fontes de receita convergem
- Plano de contas hierárquico com categorias de receita e despesa
- Centros de custo e centros de recebimento (rateio)
- DRE (Demonstração de Resultado do Exercício)
- Fluxo de caixa
- Anexo de documentos (notas fiscais, boletos, comprovantes)
- Doação recorrente (cartão de crédito programado, "débito automático no crédito")
- Categorização automática por tipo (dízimo, oferta, doação especial)
- Orçamento anual com comparativo realizado vs. previsto
- Histórico de contribuição no perfil de cada pessoa
- Transparência: doador vê histórico próprio no app

**InPeace**
- Módulo financeiro mais simples, em evolução
- Maquininhas próprias (InPeace Pay)
- Recebimento via app
- Relatórios e dashboards

#### O que entra no MVP

**Plano de contas e estrutura**
- Plano de contas hierárquico (níveis sintéticos + analíticos)
- Categorias de receita: dízimo, oferta, oferta missionária, oferta de construção, doação especial, venda de produtos, ingresso de evento, taxa de curso, outros
- Categorias de despesa configuráveis pela igreja
- Centros de custo (ex: Ministério Infantil, Ministério de Casais, Construção, Manutenção)
- Vinculação receita/despesa → centro de custo

**Lançamentos**
- Entrada manual (secretaria registra dízimo recebido em culto)
- Entrada automática via doações online recebidas (ver bloco "Doação online")
- Despesas: lançamento manual com anexo de comprovante
- Recorrência: tanto receita (dízimo recorrente do membro) quanto despesa (aluguel mensal)
- Conciliação bancária básica (importar OFX)

**Doação online (essencial) — MVP somente PIX**
- PIX dinâmico com QR code identificado por doador e por categoria
- PIX copia-e-cola
- Doador escolhe categoria (dízimo, oferta, missões, fundo X)
- Doador escolhe se quer doação anônima ou identificada
- **Doação recorrente via PIX** (PIX Automático / agendado)
- Recibo automático por email/PDF (importante para isenção de IR)
- *Fora do MVP (fase 2):* cartão de crédito, cartão de débito, boleto, recorrência no cartão

**Relatórios**
- DRE configurável
- Fluxo de caixa
- Balancete por centro de custo
- Receita por categoria, mês a mês
- **Gráfico de forecast** (projeção de receita e fluxo de caixa para os próximos 3, 6 e 12 meses, baseada em histórico, recorrências ativas e sazonalidade)
- Top contribuintes (anônimo agregado por padrão; identificado só com permissão alta)
- Carnê do dizimista / relatório anual para IR
- Exportação CSV/PDF/Excel

**Dashboard de entradas semanais**
- Gráfico de barras com entradas semana a semana
- Comparativo lado a lado: mês vigente × mês anterior
- Divisão por categoria de receita (dízimo, oferta, missionária, etc.) em série empilhada ou alternável
- Indicadores resumo: total do mês vigente, total do mês anterior, variação percentual, ticket médio por contribuinte
- Filtro por congregação e por centro de custo

**Exportação contábil**
- Exportação em formato padrão de mercado para envio ao contador:
  - **SPED Contábil (ECD)** — quando aplicável à entidade
  - **Arquivo OFX** — para conciliação no software contábil
  - **Excel/CSV padronizado** — colunas: data, histórico, conta contábil, débito, crédito, centro de custo, documento (formato amplamente aceito por escritórios contábeis)
  - **PDF de razão e diário** — relatórios formais assináveis
- Seleção de período (mês fechado, trimestre, ano)
- Anexação automática dos comprovantes vinculados aos lançamentos no pacote exportado (ZIP)

**Permissões e auditoria**
- Tesoureiro vê tudo
- Pastor vê resumos sem detalhe nominal por padrão (LGPD + ética)
- Membro vê só o próprio histórico
- Log imutável de lançamentos (quem criou, quem editou, quando) — auditoria é tema sensível em igreja

**Diferencial sugerido**
- **Painel de saúde financeira em tempo real** na home do app do pastor (3 KPIs: arrecadação do mês vs. mês anterior, % de membros dizimistas ativos, fluxo de caixa projetado 90 dias)
- **PIX com identificação automática** via descrição do pagamento — concorrentes ainda dependem muito da maquininha física

---

### Módulo 3 — Gestão de Pequenos Grupos (Células)

#### Como os concorrentes resolvem

**InPeace**
- Hierarquia de coordenação (coordenador → líder → líder em treinamento → membros)
- Papéis de célula com acesso restrito à própria célula
- Distribuição de estudos
- Relatório de presença
- Líder vê dashboard só do que lidera

**inChurch**
- Gestão de células integrada à membresia
- Comunicação segmentada por grupo
- Relatórios consolidados pela igreja
- Multiplicação de células mapeada

#### O que entra no MVP

**Estrutura**
- Tipos de grupo configuráveis: célula, GC (grupo caseiro), grupo de discipulado, classe de EBD, grupo de interesse
- Hierarquia: rede/setor → supervisor → líder de célula → célula
- Localização da célula (endereço + mapa) — útil para visitante achar célula perto de casa
- Dia/hora de encontro, recorrência
- Foto, descrição, público-alvo (jovens, casais, mulheres, misto)

**Operação semanal**
- Líder registra reunião: data, presentes, visitantes, oferta arrecadada (se houver), tema estudado, observações pastorais
- Check-in pelos próprios membros via QR code (líder gera o QR no encontro)
- Ausência consecutiva dispara alerta para líder ("Maria não vem há 3 semanas")
- Pedidos de oração da célula

**Multiplicação e crescimento**
- Marcar célula como "em multiplicação" → líder em treinamento herda metade dos membros
- Histórico de origem (de qual célula veio essa célula)
- Árvore genealógica de células (visualização)
- Metas de multiplicação por rede/supervisor

**Relatórios**
- Dashboard de líder: minha célula (presenças, visitantes, ofertas)
- Dashboard de supervisor: minhas células consolidadas
- Dashboard pastoral: rede inteira, identificação de células estagnadas/crescendo
- Taxa de conversão visitante → membro originada em célula

**Materiais de estudo (biblioteca de PG)**
- Cadastro de material com três origens:
  - Upload de arquivo PDF
  - Upload de arquivo DOC/DOCX
  - Criação manual em editor de texto rico embutido (negrito, listas, títulos, imagens, links)
- Metadados do material: título, descrição/resumo, autor, tags, grupo-alvo (todos os PGs, tipos específicos ou PGs selecionados)
- **Data de disponibilização** (publicação agendada): material fica oculto até a data e hora configuradas
- Data de expiração opcional (material some da biblioteca após a data)
- Versão atual + histórico de versões
- Chat fechado por célula (discussão do material)

**Distribuição e notificação automática**
- Na data de disponibilização, o sistema:
  - Publica o material no app de todos os cadastrados em algum PG do grupo-alvo (membros, frequentadores e visitantes vinculados — não restringe por classificação)
  - Envia notificação push: "Novo material disponível: [título]"
  - Aciona email para quem optou por receber por email
- Indicador no app do líder: quantos do seu PG já abriram o material
- Banco de estudos publicado por denominação (Nível 1) ou igreja local (Nível 2), respeitando hierarquia

**Diferencial sugerido**
- **"Encontre uma célula" no app público do membro** com mapa, filtros (público, dia da semana, distância), e botão "quero visitar" que avisa o líder
- **Saúde da célula em semáforo:** verde/amarelo/vermelho baseado em frequência média, % de novos visitantes, ofertas e regularidade do líder em reportar. Pastor vê sem precisar abrir relatório.

---

### Módulo 4 — Gestão de Conteúdos e Notificações do App

#### Como os concorrentes resolvem

**inChurch**
- Timeline do usuário com notícias, eventos, palavras, destaques
- Mensagens em texto, áudio ou vídeo (integrado YouTube e SoundCloud)
- Páginas personalizadas (institucional, equipe ministerial)
- Grupos segmentados — notificação só para o público relevante (ex: evento jovem só vai para 14-25 anos)
- Notificações push ilimitadas
- Compartilhamento de e-books, estudos, artigos, manuais
- Planos de leitura bíblica
- Live multicast: app + site + redes sociais simultaneamente, inclusive nas redes sociais dos próprios membros

**InPeace**
- Mural de avisos
- Culto ao vivo
- Notificações push
- Personalização visual completa do app

#### O que entra no MVP

**Tipos de conteúdo**
- Post de timeline (texto + imagem/vídeo)
- Vídeo de pregação (upload direto ou link YouTube/Vimeo)
- Áudio (podcast da pregação, link Spotify/SoundCloud)
- Devocional/plano de leitura (sequência de cards diários)
- Estudo/documento (PDF, ebook)
- Evento (com inscrição e pagamento — integra ao financeiro)
- Aviso/comunicado oficial
- Pedido de oração da liderança

**Publicação**
- Editor com preview do que aparece no app
- Agendamento de publicação (data/hora futura)
- Segmentação: toda a congregação, lista de grupos específicos, ministério, faixa etária, "só membros", "só voluntários", etc.
- Conteúdo de Nível 1 (denominação) replicado automaticamente nas congregações (com opção de cada congregação ocultar)
- Conteúdo de Nível 2 (congregação) visível só para sua membresia

**Notificações push**
- Disparo manual junto à publicação
- Disparo automático em eventos do sistema (escala publicada, dia da escala, célula amanhã, novo pedido de oração na minha célula, recibo de doação, aniversariante, etc.)
- Preferências de notificação por categoria no app do membro
- Métricas: taxa de entrega, abertura, clique

**Diferencial sugerido**
- **Editor unificado com preview multi-plataforma:** mesma publicação ajusta-se automaticamente ao formato do app, do site e dos canais oficiais da igreja
- **Segmentação inteligente por comportamento:** identificar e sugerir audiências (ex: "membros que não abrem o app há 30 dias" para comunicado de reengajamento)

---

### Módulo 5 — Celebrações e Ordem de Celebração (OC)

> **Origem:** dor validada no cliente zero (Doca Church). Usavam Voluts para OC, ficaram sem ferramenta após migrar para Eklesia. OC hoje é informal (WhatsApp/papel).
> **Dependência:** requer Módulo 1 (Voluntários e Escalas) implementado antes.
> **Posição no roadmap:** última feature da Fase 3.

**Celebração**
- Cadastro de celebração recorrente: nome, dia da semana, horário, tipo (culto domingo, culto mid-week, evento especial)
- Recorrência configurável (semanal, quinzenal, mensal)
- Cada ocorrência gera uma instância com data específica

**Ordem de Celebração (OC)**
- Template de etapas vinculado à Celebração recorrente
- Cada etapa tem: nome, horário de início, duração estimada, responsável (pessoa fixa ou ministério/escala)
- Etapas vinculadas a ministério puxam automaticamente quem está escalado naquele dia (integração com Módulo 1)
- Reordenação de etapas por drag-and-drop

**Bloco de Louvor (sub-bloco da etapa de louvor)**
- Dentro da etapa de louvor: setlist de músicas com ordem definida
- Cada música: título, tom, BPM (opcional), link (YouTube, cifra, letra) — opcional
- Setlist visível para a equipe de louvor e para o Host na mesma tela da OC

**Visualização no dia**
- App: OC do dia acessível para Host e liderança — etapas, horários, responsáveis e setlist numa tela só
- PDF: exportação da OC com identidade visual da igreja, pronto para imprimir

**Notificações automáticas**
- Lembrete para o Host X horas antes da celebração (configurável)
- Notificação para equipe escalada quando a OC do dia for publicada/finalizada

---

## 3. Stack e arquitetura — decisões fechadas

Todas as decisões registradas nos ADRs. Resumo:

- **Backend:** Node.js + NestJS
- **Frontend web:** Next.js + Tailwind + Shadcn/UI
- **Mobile:** React Native + Expo
- **Banco:** Supabase (Postgres puro — Auth/Storage/Realtime do Supabase não utilizados)
- **Auth:** JWT próprio no NestJS + Argon2
- **ORM:** Prisma
- **Storage:** Cloudflare R2
- **Infra:** Render (backend) + Vercel (frontend)
- **Notificações:** Expo Notifications + OneSignal
- **PIX:** Asaas (3 cenários de doação + split ~1% para a plataforma)
- **Multi-tenancy:** tabela compartilhada + RLS no Postgres

---

## 4. Roadmap MVP sugerido (3 fases, ~6 meses)

**Fase 1 — Fundação (6-8 semanas)**
- Auth + multi-tenant + papéis
- Cadastro de pessoas, famílias, congregações
- Cadastro rápido de visitante + deduplicação + reclassificação automática
- App do membro (read-only): timeline, perfil, pedidos de oração
- Web admin: dashboard básico, dashboard demográfico

**Fase 2 — Operação (8-10 semanas)**
- Financeiro: plano de contas, lançamentos manuais, doação PIX (3 cenários), recibos, dashboard semanal
- Pequenos grupos: cadastro, reuniões, presença, biblioteca de materiais agendados, busca pública
- Conteúdo: posts, notificações, segmentação

**Fase 3 — Diferenciação (6-8 semanas)**
- Voluntariado: escalas, trocas, check-in
- Doação recorrente via PIX
- DRE, fluxo de caixa, gráfico de forecast, exportação contábil
- **Celebrações e OC** (depende de voluntariado estar pronto)

---

## 5. Concorrentes — onde você pode ganhar

| Frente | InPeace | inChurch | Oportunidade |
|---|---|---|---|
| Financeiro robusto | Médio | Forte | Empatar com inChurch e adicionar PIX nativo melhor |
| Multi-tenant denominacional | Médio | Forte | Empatar |
| Voluntariado | Via parceiro (Voluts) | Fraco | **Nativo e completo já no MVP** |
| Conteúdo e comunicação | Médio | Forte | Empatar + segmentação inteligente |
| Pequenos grupos | Médio | Médio | **Saúde de célula em semáforo + mapa público** |
| Celebrações e OC | Via parceiro (Voluts) | Inexistente | **Nativo e integrado com escalas — diferencial claro** |
| UX/Design | Datado | Datado | **Vantagem clara possível em 2026** |
| IA aplicada | Nenhuma | Nenhuma | **Espaço aberto: cuidado pastoral preditivo, classificação de doações, projeção financeira** |
| LGPD/segurança | Pouco evidente | Pouco evidente | **Postura forte vira diferencial em denominações grandes** |

