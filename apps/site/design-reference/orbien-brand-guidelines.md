# Brand Guidelines
## Orbien — Plataforma de Gestão e App White-label para Igrejas

**Versão:** 2.0 (seção 3)
**Status:** decidido
**Última atualização:** 2026-11

> **Seção 3 reescrita para a direção Órbita v2 (2026-11).** Cor, tipografia e
> forma seguem `docs/design/orbita-v2/README.md` e a execução por superfície
> está em `docs/design/orbita-v2/PROJETO.md`. Posicionamento, nome, voz e tom
> (seções 1, 2 e 4) não mudaram.

---

## 1. Propósito e Posicionamento

### 1.1 Por que existimos
Igrejas de pequeno e médio porte no Brasil são mal atendidas por software de gestão: sistemas caros demais, feios demais, ou que exigem CNPJ para funcionar de verdade. O Orbien existe para dar a essas igrejas uma plataforma moderna, bonita e acessível — sem abrir mão de segurança, LGPD e rigor técnico.

### 1.2 Para quem somos

**ICP primário (igreja-alvo):**
- Porte: 50–300 membros ativos
- Perfil: evangélica (batista, assembleia, presbiteriana, carismática independente), liderança 30–50 anos
- Dor principal: sistema atual feio, limitado ou caro; sem app próprio sem CNPJ
- Região: Sul e Sudeste do Brasil (expansão nacional fase 2)

**Personas principais:**
- **Pastor:** decisor de compra. Usa smartphone, tem WhatsApp Business. Precisa de visão consolidada sem complexidade.
- **Secretária/Tesoureiro:** usuário intenso. Opera o sistema diariamente. Precisa de eficiência, não de beleza.
- **Líder de Pequeno Grupo:** usuário móvel. Registra reuniões e presença pelo celular, geralmente no mesmo dia.
- **Membro:** usuário ocasional. Acessa perfil, pedidos de oração, timeline e histórico de contribuição.

### 1.3 O que nos diferencia
- **App com identidade visual da igreja sem exigir CNPJ** — o Eklesia (principal substituto) não oferece isso
- **UX moderna e mobile-first** em um mercado com design datado
- **PIX nativo** com 3 cenários de doação, incluindo recorrente (dízimo automático)

### 1.4 Tagline
> **"Gestão que serve. Igreja que cresce."**

**Tagline alternativa (contexto de onboarding/marketing):**
> "A plataforma de gestão para igrejas que ainda não precisam de um sistema complexo — mas já merecem um bonito."

---

## 2. Nome

### 2.1 Nome escolhido
**Orbien**

### 2.2 Critérios que guiaram a escolha
- Pronunciável em português (or-bi-en)
- Sem referências bíblicas clichês
- Funciona para B2B (venda para igrejas) e B2C (uso pelo membro)
- Sugere abrangência, conexão e estrutura — conversa com plataforma completa
- Adaptável ao white-label: "tecnologia Orbien" aparece discretamente; a marca da igreja tem protagonismo
- Não conflita com concorrentes registrados (validação formal INPI pendente)

### 2.3 Uso do nome em co-branding
| Contexto | Regra |
|---|---|
| App Starter | "Powered by Orbien" visível no rodapé |
| App Premium | Sem menção ao Orbien no app — marca da igreja com protagonismo total |
| Materiais de venda | "Orbien" como marca principal |
| Contratos | "Church Platform" como razão social (a definir) · "Orbien" como nome de produto |
| Suporte ao usuário final | "Suporte Orbien" ou "Atendimento Orbien" |

### 2.4 Domínios e handles
- Site principal: **orbien.app**
- Proteção: orbien.org · orbien.church · orbien.com.br
- Instagram: @orbienapp (a confirmar disponibilidade)
- App Store / Google Play: Orbien

> ⚠ **Pendente:** registro formal no Registro.br + busca de marca INPI classes 38 e 42.

---

## 3. Identidade Visual

Direção **Órbita** (v2, 2026-10). A fonte dos valores é o handoff em
`docs/design/orbita-v2/README.md`; a execução, por superfície, está em
`docs/design/orbita-v2/PROJETO.md`. Esta seção resume o que é regra de marca.

### 3.1 Direção visual
**Órbita** — noturna, nítida, com um ponto de luz no que importa. Fundo quase
preto azulado, texto quente, um único acento (teal) e anéis concêntricos com um
satélite teal como assinatura: hero do site e fundo do painel. Elevação por
borda e brilho, quase sem sombra.

### 3.2 Paleta

Tema escuro é o padrão. O site é só escuro; painel e app alternam com o claro.

| Papel | Escuro | Claro |
|---|---|---|
| Fundo | `#05070F` | `#F4F3EF` |
| Superfície | `#0B0F1D` (cards: gradiente `#0C1121` → `#090C18`) | `#FFFFFF` |
| Sutil (campos, hover) | `#121729` | `#ECEBE6` |
| Texto | `#F2F1EE` | — |
| Texto secundário | `#A9AEBD` | — |
| Texto de apoio | `#6C7286` | — |
| Borda | `rgba(255,255,255,.08)`; forte `.16` | `#E2E0DA` |
| Teal (acento da Orbien) | `#00E5C7` | `#007F70` (texto) |
| Atenção | texto `#F2C766`, fundo `rgba(242,199,102,.12)` | — |
| Erro | texto `#FF7A6B`, fundo `rgba(255,122,107,.12)`; sólido `#C0392B` | — |
| Marca padrão | `#1E3A7B`, brilho `#2B4FA8` | — |

#### Regras de uso
- **Teal é da Orbien e não muda com a igreja.** No site é a cor do CTA. No
  produto, o primário é `--brand`, a cor da igreja (padrão `#1E3A7B`).
- No escuro, texto na cor da igreja usa `brand 45%` misturado com branco; o
  fundo suave usa `brand 28%` misturado com o fundo.
- Teal marca destaque, progresso e estado "ok". Não vai em texto corrido.
- Crimson é exclusivo de erro, alerta crítico e sessão de suporte. Não é
  decoração.
- Nunca combinar a cor da igreja com Crimson no mesmo componente: ação e
  alerta grave não se misturam.

### 3.3 Tipografia

| Família | Uso |
|---|---|
| **Geist** (300–600) | Todo o texto de interface e corpo |
| **Geist Mono** (400/500) | Números, rótulos e cabeçalho de tabela |
| **Instrument Serif** (400) | `h1`/`h2` do **site**. No painel, no console e no app os títulos usam Geist 500 com tracking fechado (decisão de 2026-10-10) |

- Site: `h1` em `clamp(52px, 7.2vw, 104px)`, line-height .98. Ênfase em itálico
  teal.
- Produto: corpo 14px; título de página 28px em Geist 500.
- Rótulo: Geist Mono, 10,5–11px, caixa alta, tracking .14em. Mínimo de 11px em
  texto de leitura; a miniatura de tela dos heros do site pode ir a 10px.
- Valores monetários e números de tabela em Geist Mono.
- As fontes ficam no repositório (`src/fonts/`, licença OFL ao lado) e
  carregam por `next/font/local`; nunca `next/font/google`.

### 3.4 Iconografia
- Lucide, traço de 1,6px. Nunca ícone cheio junto de ícone de contorno.
- Tamanhos: 16px (inline), 20px (botão), 24px (card/ação), 32px (estado vazio).

### 3.5 Espaçamento
Base 4px. Escala: 4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 · 64 · 80 · 96px.
Padding interno em múltiplos de 4; gap entre componentes em múltiplos de 8;
margem de seção de 64px ou 80px.

### 3.6 Forma
| Contexto | Valor |
|---|---|
| Botão, badge, segmentado | pill (999px); alturas 30 / 36 / 46px no produto, 42 / 52px no site |
| Card | 14px no painel; 16–20px no app |
| Modal | 20px |
| Campo | 10px |

### 3.7 Elevação
Quase nenhuma sombra no escuro: a elevação vem de borda e de brilho
(`0 0 30px` da cor). Modal e menu flutuante: `0 30px 80px rgba(0,0,0,.6)`.

### 3.8 Logo
A marca é um anel com o satélite teal (`OrbLogo` do protótipo da v2), usada no
ícone dos três apps, no favicon, no header, no rodapé e na tela "em breve" do
site. O wordmark segue em minúsculas: `orbien`, em Geist 500.

---

## 4. Tom de Voz

### 4.1 Posição no eixo formal/informal
**Próximo, mas profissional.** Não é o banco falando com você. Não é um amigo descontraído. É o consultor de confiança que fala de igual para igual com o pastor — claro, direto, sem enrolação.

| Eixo | Posição | Exemplo |
|---|---|---|
| Formal ←→ Informal | Centro-informal | "Sua igreja está pronta." não "Prezado senhor pastor" |
| Técnico ←→ Emocional | Centro-técnico | Dados precisos com contexto humano |
| Distante ←→ Próximo | Próximo | "Vamos lá" não "Prossiga" |
| Neutro ←→ Motivacional | Levemente motivacional | "Crescendo bem" não "INCRÍVEL!" |

### 4.2 Palavras âmbar — usar com intenção

| Palavra | Contexto correto |
|---|---|
| simples | Quando for genuinamente simples. Não como eufemismo para "básico". |
| moderno | Só quando o produto justifica. Não como adjetivo vazio. |
| comunidade | Preferível a "base de membros" em comunicação com o membro |
| cuidado | No contexto pastoral e de suporte. Não no contexto técnico. |
| crescimento | Dados de membro e financeiro. Com número para sustentar. |

### 4.3 Palavras vermelho — nunca usar

| Palavra / Expressão | Por quê evitar |
|---|---|
| revolucionário | Clichê de startup. Nenhuma iglesia vai acreditar. |
| ecossistema | Jargão tech que o pastor não usa |
| sinergia / engajamento | Corporativês vazio |
| usuário | Dizer "membro", "pastor", "secretária" — nunca "usuário" |
| plataforma robusta | Robusta para quem? Vazio. |
| Clique aqui | Substituir por ação específica: "Cadastrar visitante", "Ver relatório" |
| Ops! | Diminui a seriedade em mensagem de erro real |
| Ei, [nome]! | Tom de startup jovem que conflita com o contexto pastoral |

### 4.4 Microcopy — exemplos por contexto

**Onboarding**
- ✅ "Sua igreja está cadastrada. Agora convide sua secretária."
- ❌ "Parabéns! Você completou o cadastro com sucesso!"

**Estado vazio (lista de membros)**
- ✅ "Nenhum membro cadastrado ainda. Comece pelo cadastro rápido de visitante."
- ❌ "Ops! Parece que não há membros aqui ainda."

**Erro de formulário**
- ✅ "Telefone inválido — verifique o DDD e os dígitos."
- ❌ "Ocorreu um erro. Tente novamente."

**Confirmação de ação destrutiva**
- ✅ "Remover Marina Rodrigues? Essa ação não pode ser desfeita."
- ❌ "Tem certeza que deseja excluir este registro?"

**Sucesso após doação**
- ✅ "Doação registrada. Recibo enviado para marina@email.com."
- ❌ "Sua doação foi processada com sucesso! 🎉"

**Bloqueio por inadimplência**
- ✅ "Acesso suspenso por pendência financeira. Entre em contato com o suporte."
- ❌ "Sua conta foi bloqueada devido a falta de pagamento."

**Trial expirando**
- ✅ "Seu período gratuito termina em 3 dias. Escolha um plano para continuar."
- ❌ "ATENÇÃO: Trial expirando! Não perca o acesso!"

**Tooltip de campo sensível (financeiro)**
- ✅ "Visível apenas para o tesoureiro e o pastor."
- ❌ "Dado protegido por LGPD."

### 4.5 Linguagem por persona
| Persona | Tom | Evitar |
|---|---|---|
| Pastor | Visão, contexto, confiança. Dados com significado. | Detalhes técnicos desnecessários |
| Secretária/Tesoureiro | Eficiência, precisão, confirmações claras | Explicações longas de features |
| Líder de PG | Ação rápida, feedback imediato | Menus complexos, muitos cliques |
| Membro | Acolhedor, simples, não intimidador | Qualquer jargão técnico ou eclesiástico excessivo |

---

## 5. Aplicações da Marca

### 5.1 App mobile (Starter — app-pai com skin)
- Logo da igreja em destaque
- Cores da igreja como primária (carregadas via `tenant_id`)
- "Powered by Orbien" no rodapé — fonte 10px, texto de apoio, discreta
- Ícone do app: logo da plataforma com skin de cor da igreja

### 5.2 App mobile (Premium — build próprio via EAS)
- Logo da igreja como único ativo de marca
- Sem nenhuma referência visual ao Orbien
- Ícone do app: logo da igreja

### 5.3 Painel web (admin)
- Header: logo da plataforma + nome da congregação
- Sidebar: superfície escura da Órbita (tema escuro padrão); item ativo na cor da igreja
- Favicon: a marca da Órbita (anel com satélite teal)

### 5.4 Emails transacionais
- Remetente: `noreply@orbien.app` (ou domínio da igreja no Premium)
- Header do email: logo Orbien (Starter) ou logo da igreja (Premium)
- Footer: "Enviado via Orbien · Política de Privacidade · Cancelar inscrição"
- Tom: mesmo tom de voz do produto — nunca marketing agressivo em email transacional

### 5.5 Documentos (contratos, PDFs)
- Tipografia: Geist para títulos, sistema para corpo (compatibilidade)
- Cor de destaque em documentos: azul da marca (`#1E3A7B`) — nunca Crimson
- Footer de documento: "Orbien · orbien.app"

---

## 6. O que este guia não cobre (próximos passos)

- [ ] Logo final aprovado (aguarda designer)
- [ ] Motion guidelines detalhado (duração, easing, princípios de animação)
- [ ] Guia de fotografia / ilustração (quando aplicável)
- [ ] Variações de logo (horizontal, vertical, ícone isolado, versão monocromática)
- [ ] Guia de aplicação em materiais físicos (crachá, banner de evento, cartão)

---

*Orbien — Plataforma de Gestão e App White-label para Igrejas*
*Documento interno — versão 1.0 · 2026-05*


