# Brand Guidelines
## Orbien — Plataforma de Gestão e App White-label para Igrejas

**Versão:** 1.0
**Status:** decidido
**Última atualização:** 2026-05

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

### 3.1 Direção visual
**Precision Modern** — minimalismo técnico com calor suficiente. Rigor sem frieza. Muito espaço negativo, tipografia com contraste de peso, paleta fria ancorada em Navy com acento Teal.

### 3.2 Paleta de cores

#### Tokens de cor (CSS variables)

```css
/* Cores de marca */
--color-navy:          #1E3A7B;   /* Primária · CTAs · links · interativos */
--color-navy-dark:     #162D62;   /* Hover e pressed states do Navy */
--color-navy-dim:      #D4DCEF;   /* Fundo de badge Navy (light) */
--color-navy-dim-dark: #1A2540;   /* Fundo de badge Navy (dark) */

--color-teal:          #00B8A2;   /* Acento · sucesso · semáforo verde · deltas positivos */
--color-teal-dark:     #00CDB5;   /* Teal em dark mode */
--color-teal-dim:      #D0F5F1;   /* Fundo de badge Teal (light) */
--color-teal-dim-dark: #0A2E2A;   /* Fundo de badge Teal (dark) */

/* Cores funcionais */
--color-crimson:       #C0392B;   /* Erro · alerta funcional · validação de campo · semáforo vermelho */
--color-crimson-dark:  #E05444;   /* Crimson em dark mode */
--color-crimson-dim:   #FDECEA;   /* Fundo de alerta erro (light) */

--color-burgundy:      #991B1B;   /* Badge de status grave: inadimplente, suspenso, bloqueado */
--color-burgundy-dim:  #F5E6E6;   /* Fundo de badge Burgundy (light) */

/* Neutros */
--color-ink:           #0F1117;   /* Texto primário (light) · fundo base (dark) */
--color-parchment:     #F5F4F1;   /* Fundo base (light) */
--color-surface:       #FFFFFF;   /* Cards e superfícies elevadas (light) */
--color-surface-dark:  #13151E;   /* Cards e superfícies elevadas (dark) */
--color-subtle:        #EEECEA;   /* Hover · fundo de KPI · surface sutil (light) */
--color-subtle-dark:   #1C1F2B;   /* Hover · fundo de KPI · surface sutil (dark) */
--color-stone:         #5C5A56;   /* Texto secundário (light) */
--color-muted:         #9B9893;   /* Texto terciário · labels (light) */
--color-border:        #E0DDD9;   /* Bordas padrão (light) */
--color-border-dark:   #232634;   /* Bordas padrão (dark) */
```

#### Regras de uso
- **Navy** é a única cor de CTA primário. Nunca usar Teal ou Crimson em botão primário.
- **Teal** é reservado para feedback positivo, deltas de crescimento e semáforo verde. Não usar em texto corrido.
- **Crimson** é exclusivo para estados de erro, alertas críticos e semáforo vermelho. Não usar decorativamente.
- **Burgundy** é exclusivo para badges de status grave (inadimplente, suspenso, bloqueado). Não usar em botões.
- Nunca combinar Navy + Burgundy no mesmo componente — conflito semântico (ação vs. alerta grave).

### 3.3 Tipografia

#### Famílias
| Família | Uso | Import |
|---|---|---|
| **DM Sans** | Todo o produto — display, headings, body, labels, botões | Google Fonts |
| **DM Mono** | Dados técnicos, IDs, valores monetários formatados, labels de sistema | Google Fonts |

#### Escala tipográfica

| Nome | Família | Peso | Tamanho | Tracking | Uso |
|---|---|---|---|---|---|
| Display | DM Sans | 300 | 48–80px | −3% | Títulos de página, hero |
| Display Bold | DM Sans | 600 | 48–80px | −3% | Destaque no display |
| Heading 1 | DM Sans | 500 | 28–32px | −2% | Título de seção principal |
| Heading 2 | DM Sans | 500 | 22–24px | −1.5% | Título de card ou modal |
| Heading 3 | DM Sans | 500 | 18px | −1% | Subtítulo de seção |
| Body | DM Sans | 300 | 15–16px | 0 | Texto corrido |
| Body Medium | DM Sans | 400 | 14–15px | 0 | Texto de formulário, descrições |
| Label | DM Sans | 500 | 11–12px | +10% | Labels de campo, categorias (caps) |
| Caption | DM Sans | 400 | 11px | +4% | Meta informações, timestamps |
| Mono | DM Mono | 400 | 12–13px | +4% | IDs, códigos, valores técnicos |
| Mono Label | DM Mono | 500 | 10–11px | +12% | Labels de seção (caps) |

#### Regras tipográficas
- Nunca usar peso 400 onde 300 ou 500 funcionam — o contraste de peso é a principal ferramenta expressiva
- Texto de botão: sempre DM Sans 500, nunca 600
- Valores monetários (R$ 12.400): DM Mono 500 para o número, DM Sans 400 para o símbolo
- Texto de alerta/erro: DM Sans 400 para body, 600 para título do alerta

### 3.4 Iconografia
- Biblioteca recomendada: **Lucide Icons** (já incluída via `lucide-react` no stack)
- Stroke width padrão: 1.5px
- Nunca usar ícones filled junto de ícones outlined no mesmo contexto
- Tamanhos padrão: 16px (inline), 20px (botão), 24px (card/ação), 32px (estado vazio)

### 3.5 Espaçamento
Base 4px. Escala: 4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 · 64 · 80 · 96px.

Regra prática:
- Espaçamento interno de componente (padding): múltiplos de 4 (12, 16, 24)
- Gap entre componentes: múltiplos de 8 (8, 16, 24, 32)
- Margem de seção: 64px ou 80px

### 3.6 Border radius
| Contexto | Valor |
|---|---|
| Botão | 8px |
| Card | 12px |
| Modal | 16px |
| Badge / pill | 100px |
| Avatar | 10px |
| Input | 8px |
| Tooltip | 6px |

### 3.7 Sombras
```css
--shadow-sm: 0 1px 3px rgba(15,17,23,.06), 0 1px 2px rgba(15,17,23,.04);
--shadow-md: 0 4px 16px rgba(15,17,23,.08), 0 2px 6px rgba(15,17,23,.05);
--shadow-lg: 0 12px 40px rgba(15,17,23,.12), 0 4px 12px rgba(15,17,23,.06);
```
Em dark mode: substituir `rgba(15,17,23,X)` por `rgba(0,0,0,X*2.5)`.

### 3.8 Logo
**Status:** em desenvolvimento. Três conceitos de brief encaminhados para designer:
- **Conceito A:** Wordmark com contraste de peso — "or" e "en" em 300, "bi" em 600 com Navy
- **Conceito B:** Ícone orbital (órbita + ponto Teal) + wordmark
- **Conceito C:** Marca modular em grid para dark mode nativo

Até logo final aprovado, usar wordmark tipográfico: `orbien` em DM Sans 500, Navy.

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
- "Powered by Orbien" no rodapé — fonte 10px, Stone (#5C5A56), discreta
- Ícone do app: logo da plataforma com skin de cor da igreja

### 5.2 App mobile (Premium — build próprio via EAS)
- Logo da igreja como único ativo de marca
- Sem nenhuma referência visual ao Orbien
- Ícone do app: logo da igreja

### 5.3 Painel web (admin)
- Header: logo da plataforma + nome da congregação
- Sidebar: Navy como cor de fundo opcional ou Ink (dark mode padrão)
- Favicon: ícone Orbien (até logo final, usar "O" em Navy)

### 5.4 Emails transacionais
- Remetente: `noreply@orbien.app` (ou domínio da igreja no Premium)
- Header do email: logo Orbien (Starter) ou logo da igreja (Premium)
- Footer: "Enviado via Orbien · Política de Privacidade · Cancelar inscrição"
- Tom: mesmo tom de voz do produto — nunca marketing agressivo em email transacional

### 5.5 Documentos (contratos, PDFs)
- Tipografia: DM Sans para títulos, sistema para corpo (compatibilidade)
- Cor de destaque em documentos: Navy — nunca Crimson ou Teal
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


