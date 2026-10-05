# Órbita v2 — projeto de implementação

**O que já foi aplicado da direção Órbita e o que falta, por superfície.**
A direção em si (tokens, arquitetura de informação, regras de interação) está
no [`README.md`](README.md) deste pacote. Este documento acompanha a execução.

- **Item no plano:** `PROD-29` em [`docs/PLANO.md`](../../PLANO.md). O plano
  continua sendo a fonte única do que falta; este arquivo detalha o item.
- **Atualizado em:** 2026-10-04.
- **Branch da primeira entrega:** `feat/orbita-v2-tokens-e-menu`.
- **Branch da primeira entrega do app:** `claude/optimistic-davinci-q37vdu`.

## Resumo

| Superfície | Estado | O que tem | O que falta |
|---|---|---|---|
| Site (`apps/site`) | **Entregue** | As 8 páginas da v2 e as 5 de apoio (hub de funcionalidades, contato, LGPD, login e 404), só no tema escuro, com tokens, fontes, títulos, CTAs, órbita no hero e brilho do CTA final | Itens menores em [§2.3](#23-o-que-ficou-de-fora) |
| Painel (`apps/web`) | **Começado** | Tokens, fontes, botão pill, títulos em serifa, menu em seções, identidade da igreja no menu, caminho no topo e anéis no fundo | Todas as telas da v2 e o header completo — [§3.2](#32-o-que-falta) |
| App (`apps/mobile`) | **Começado** | Tokens, fontes, escuro como padrão, navegação em 5 abas, aba Mais, cadastro de visitante (líder incluso), Privacidade (LGPD), presença já marcada, transição de entrada, login, destaque da v2, QR de check-in (líder e leitor) e QR de autocadastro | Contribuir nativo e o resto das telas — [§4.2](#42-o-que-falta) |
| Console (`apps/admin`) | **Entregue** | Herda a linguagem do painel: tokens, fontes, tema escuro padrão, menu, títulos em serifa, botões pill, tabelas com cabeçalho mono, anéis no fundo — [§3.3](#33-console-appsadmin) | — |

---

## 1. Princípios desta implementação

- **Recriar com o que existe.** Os protótipos são HTML de referência. Nada
  deles é importado. Cada tela é refeita com os componentes, tokens e padrões
  de dados do app (`useEffect` + axios no web, Expo Router no mobile).
- **Nome antigo, valor novo.** Os tokens mantêm os nomes que as telas já usam
  (`navy`, `teal`, `stone`, `ink`, `--surface`, `--navy-accent`…) e trocam de
  valor. Assim uma tela ainda não refeita já herda a cor e a fonte certas, e a
  troca não vira um diff de centenas de arquivos.
- **Fontes no repositório.** Geist, Geist Mono e Instrument Serif ficam em
  `src/fonts/` (subset latin do @fontsource, licença OFL ao lado), carregadas
  por `next/font/local`. `next/font/google` já derrubou o CI uma vez (#128).
- **Etiquetas de origem do README:**
  - `EXISTE`: reestilizar e reposicionar;
  - `API`: implementar a tela;
  - `PROMESSA`: fora do escopo até decisão de produto;
  - `PROPOSTA`: validar antes.

  As etiquetas nunca aparecem na interface.
- **Teal é da Orbien e não muda com a igreja; `--brand` é da igreja.** No
  painel, o primário do produto é `--brand`. No site, o CTA é teal.

---

## 2. Site (`apps/site`)

### 2.1 O que foi feito

**Tokens** (`src/app/globals.css`)
- Paleta noturna da `site-orbita.css`. O site passou a ser **só escuro**,
  sem o modo claro automático que existia antes:
  - fundo `#05070F`;
  - superfícies `#0B0F1D` e `#121729`;
  - texto `#F2F1EE`, `#A9AEBD` e `#6C7286`;
  - bordas `rgba(255,255,255,.08 / .16)`;
  - teal `#00E5C7`;
  - `--navy-accent` `#7FA0E6`.
- Tokens novos: `--color-on-teal`, `--color-amber`, `--color-crimson-ink`,
  `--color-whatsapp` e `--color-navy-glow`.
- `::selection` em teal.

**Tipografia**
- `h1` e `h2` em Instrument Serif 400, por regra global fora de camada. Ela
  vence os `font-semibold` e `tracking-*` que cada seção trazia da v1.
- Título de abertura das páginas com o utilitário `text-display`
  (`clamp(52px, 7.2vw, 104px)`).
- Trecho em destaque com a classe `.heading-accent` (itálico teal), no lugar
  do `<strong>` navy.

**Componentes**
- **CTAs:** utilitários `cta-primary` (pill teal com texto escuro e brilho no
  hover) e `cta-secondary` (pill com borda; no hover a borda vira teal), em
  todos os botões do site. Os botões brancos das seções com fundo navy também
  viraram teal.
- **`SectionLabel`:** Geist Mono em caixa alta, `tracking .16em`, teal.
- **Header:** CTA "Lista de espera" em pill teal; borda fina.
- **Hero da home:**
  - anéis concêntricos com o satélite teal girando (26s);
  - entrada escalonada do texto (100/250/400/550 ms, 900 ms);
  - rótulos dos mockups em mono;
  - o satélite some no celular (passaria sobre os selos) e para com
    `prefers-reduced-motion`.
- **CTA final:** brilho teal subindo do rodapé e título em
  `clamp(48px, 7vw, 96px)`.

**Cor nos componentes.** Todo hex e `rgba(…)` fixo nos `.tsx` virou token —
são 34 arquivos. A regra 2 do `AGENTS.md` do site já proibia isso. As
exceções são `icon.tsx` e `apple-icon.tsx`, porque o Satori não lê variável
CSS. O semáforo usa teal, amber e crimson-ink, conforme o README.

**Regra de fontes.** A regra 4 do `apps/site/AGENTS.md` dizia "só DM Sans e
DM Mono". Agora diz Geist, Geist Mono e Instrument Serif.

**Guia de marca.** `design-reference/orbien-brand-guidelines.md` ganhou um
aviso: a seção 3 (cor, tipografia e forma) é da v1 e foi substituída por este
pacote.

**Correção de layout.** As faixas informativas de Membros e Pequenos grupos
quebravam o texto em colunas, porque o container é `flex` e o `<strong>` virava
item separado. O defeito já existia antes da v2.

### 2.2 Como foi validado

- **Testes unitários:** 282 testes do site (`npx vitest run` em `apps/site`).
- **Smoke e2e:** 18 casos contra o build de produção (`next start`).
- **Lint e typecheck** limpos.
- **Build** com `NODE_ENV=production`. Sem isso, o `next build` local quebra no
  prerender; é o ambiente, não o código.
- **Conferência visual** de todas as páginas em 1280px e 390px, contra
  `screenshots/site-*.png`. Nenhuma página tem rolagem horizontal no celular.

### 2.3 O que ficou de fora

- **Texto dos heros.** O HTML da v2 traz o texto de uma versão anterior do
  site (ex.: "Cada pessoa, uma história…"). O README diz que o conteúdo não
  muda, então valeu o texto do React, que é o que está no ar. Trocar algum
  título é decisão de copy, não de estilo.
- **Menção ao design anterior.** A página Sobre ainda cita "Precision Modern"
  como direção de design, em dois lugares (princípio "Rigor sem frieza" e a
  linha do tempo). É copy, e precisa de decisão.
- **Selos do hero nas outras páginas.** Os selos abaixo do CTA viraram mono
  só na home, que é onde o print da v2 mostra. Nas outras páginas seguem em
  sans.
- **Reescrita do guia de marca.** A seção 3 de
  `orbien-brand-guidelines.md` precisa ser reescrita para a Órbita. Por
  enquanto há só o aviso.

---

## 3. Painel (`apps/web`)

### 3.1 O que foi feito

- **Tokens** (`src/app/globals.css`):
  - Órbita com tema escuro como padrão (`defaultTheme="dark"`) e o claro
    alternável;
  - `navy` passa a apontar para `--brand`;
  - no escuro, `text-navy` e `text-crimson` usam a versão clara do tom;
  - elevação por borda, quase sem sombra no escuro.
- **Fontes:** Geist, Geist Mono e Instrument Serif. A DM saiu do web.
- **Primitivas:**
  - `<Button>` em pill;
  - utilitários `page-title` (Instrument Serif 28px) e `label-mono`;
  - título de todas as telas do `(admin)` com `page-title`.
- **Menu em seções** (`src/lib/navigation.ts`):
  - seções: Início, Pessoas, Comunidade, Cultos e serviço, Comunicação,
    Financeiro, Administração;
  - só entra no menu rota que existe;
  - `/redes` voltou ao menu;
  - `/voluntarios` aparece como **Ministérios** e `/conteudo` como
    **Publicações**.
- **Identidade da igreja** (`ChurchIdentityProvider`):
  - mostra nome e congregação no topo do menu, vindos de `GET /settings`;
  - aplica a `primary_color` em `--brand`;
  - substitui o "Doca Church" que estava fixo no menu.
- **Header:** caminho "Seção › Tela".
- **Fundo:** anéis da órbita, com o brilho da marca só no escuro.

### 3.2 O que falta

Rotas sugeridas pelo README: `/pessoas/:id`, `/grupos/:id`,
`/celebracoes/:id`, `/financeiro/{geral|lancamentos|doacoes|relatorios|conciliacao|exportacao|cadastros}`
e `/admin/{igreja|usuarios|identidade|plano|lgpd|auditoria}`.

**Shell e regras transversais**
- [ ] **Header completo:** busca (⌘K), tema, notificações e menu da conta
  ("Nome e e-mail", "Trocar senha", "Sair"). A frase "Escalas e perfil pessoal
  ficam no app" também entra no menu da conta.
- [x] **Coroa nos itens Premium e convite "Disponível no plano Premium"**
  (2026-10-04, branch `feat/plano-e-terminologia-no-painel`).
  - `GET /me/permissions` devolve `plan` e `upgrade_areas` (as áreas que o
    papel leria no Premium e o plano barra).
  - O menu mostra essas áreas com a coroa, em vez de escondê-las.
  - Celebrações e Auditoria abrem o `PremiumInvite` numa igreja Starter, sem
    pedir à API o dado que viria 403.
  - Ainda falta: as abas Premium *dentro* de telas que existem nos dois
    planos (DRE, Balancete, Conciliação… em Financeiro) continuam com o
    estado de cada aba, sem o convite.
- [x] **Terminologia da igreja** (2026-10-04, mesma branch).
  - O termo fica em `branding_configs.group_term_singular`/`_plural`, com o
    CHECK de que os dois andam juntos.
  - Grava por `PATCH /settings` (`tenant_admin`, nos dois planos) e lê por
    `GET /settings`.
  - Seção **Terminologia** em Configurações.
  - Aplicado no item do menu, no caminho do topo e no título da tela de grupos.
  - Ainda falta: textos dentro das telas ("Novo grupo", "2 grupos", "Buscar
    grupos…") e notificações. Trocar esses por um termo livre esbarra no
    gênero ("Novo grupo" × "Nova célula") e pede decidir se a igreja informa
    o gênero ou se o texto é reescrito para não depender dele.
- [ ] **Estados obrigatórios** em toda tela: skeleton, vazio, erro com
  "tentar de novo" e sem acesso.
- [ ] **Transições:** fade + translateY(3px), 180 ms.
- [ ] **Cards:** gradiente `#0C1121 → #090C18`, raio 14px.
- [ ] **Botões feitos à mão** com `rounded-[8px]` direto na tela passam a pill
  quando cada tela for refeita.

**Telas** — o rótulo diz o que cada uma exige:
- `EXISTE`: a tela existe; reestilizar e reposicionar.
- `API`: a API já tem a rota; falta a tela.
- `nova`: tela nova, sem rota pronta na API.

| Área | Tela | Base hoje | Origem |
|---|---|---|---|
| Início | Início por papel: pastor/admin, secretaria, tesoureiro, líder de ministério, supervisor/líder | `/dashboard` (igual para todos) | `EXISTE` + `API` |
| Pessoas | Lista e página da pessoa (seções com âncora) | `/pessoas` + `PersonSheet` | `EXISTE` → página |
| Pessoas | Visitantes (QR de autocadastro por origem) | — | `API` |
| Pessoas | Famílias | — | `API` |
| Pessoas | Indicadores (demográfico) | — | `API` |
| Comunidade | Lista e página do grupo: visão geral, membros, encontros, materiais, oração, chat, pedidos de visita, ausências, árvore | `/grupos` + `GroupDetailSheet` | `EXISTE` → página |
| Comunidade | Redes | `/redes` | `EXISTE` |
| Comunidade | Materiais (biblioteca) | só dentro do encontro | `API` |
| Comunidade | Saúde (Premium) | — | `API` |
| Cultos e serviço | Celebrações e página da celebração (OC, setlist, escala) | `/celebracoes` + `CelebrationDetailSheet` | `EXISTE` → página |
| Cultos e serviço | Escalas por período | — | `API` |
| Cultos e serviço | Ministérios | `/voluntarios` | `EXISTE` |
| Cultos e serviço | Repertório | `/repertorio` | `EXISTE` |
| Cultos e serviço | Modelos | aba de `/celebracoes` | `EXISTE` → área |
| Comunicação | Publicações e editor com prévia do app | `/conteudo` | `EXISTE` (prévia é nova) |
| Comunicação | Eventos | dentro do post | `EXISTE` → área |
| Comunicação | Destaques do app, Notificações, Públicos | abas de `/conteudo` | `EXISTE` → áreas |
| Financeiro | 7 sub-áreas: Visão geral, Lançamentos, Doações, Relatórios, Conciliação, Exportação, Cadastros | `/financeiro` com 9 abas | `EXISTE` → sub-áreas |
| Administração | 6 sub-áreas: Igreja e congregações, Usuários e papéis, Identidade e domínio, Plano e assinatura, Privacidade (LGPD), Auditoria | `/configuracoes` + `/auditoria` | `EXISTE` + `API` + `nova` |

**Sai do web:**
- "Meus turnos" e "Indisponibilidade" (em Ministérios) vão para o app;
- "Perfil" fica só no menu da conta.

---

### 3.3 Console (`apps/admin`)

O pacote v2 não desenha o console, e a decisão (2026-10-04) foi que ele
herda tudo do painel, com a mesma pegada de interface:

- mesmos tokens e fontes do `apps/web` (o `globals.css` é o do painel, sem o
  bloco de rich-text que o console não usa), tema escuro como padrão;
- menu no estilo do painel: marca da Órbita, rótulo de seção em mono, item
  ativo em `--brand`; título das telas em `page-title`;
- botões em pill (os feitos à mão nas telas e nos modais também), campos,
  avisos e cartões de opção com raio de 10px;
- `DataTable` com cabeçalho em Geist Mono caixa alta e raio de 14px — o do
  painel mudou junto, para as duas tabelas serem a mesma;
- ações da linha de Tenants agrupadas sem quebrar o texto do botão;
- anéis da órbita no fundo da área de conteúdo.

O console não tem cor de igreja: `--brand` fica no azul Orbien.

### 3.4 Ícone

A marca da v2 (`OrbLogo` do protótipo: um anel com o satélite teal) virou o
ícone dos três apps — `icon.tsx` (32px, fundo `#05070F`), `apple-icon.tsx`
(180px, com o brilho da marca atrás do anel) e um `favicon.ico` novo gerado do
ícone de 32px. A mesma marca substitui a elipse antiga no header, no rodapé e
na tela "em breve" do site.

## 4. App (`apps/mobile`)

### 4.1 O que foi feito (2026-10-04)

**Tokens e base**
- [x] **Tokens da Órbita** em `src/lib/theme/tokens.ts`, com o tema da
  igreja em runtime. Nome antigo, valor novo, como no web: fundo `#05070F`,
  superfícies `#0B0F1D`/`#121729`, texto `#F2F1EE`/`#A9AEBD`/`#6C7286`,
  bordas a 8% e 16%, amber e crimson funcionais. Escuro é o padrão; claro e
  "seguir o sistema" ficam no Perfil.
  - O teal é da Orbien e tem um tom por modo (`#00E5C7` no escuro, `#007F70`
    no claro); `--brand` é da igreja.
  - `brandInk` (`brand 45%` com branco, no escuro) para texto e ícone na cor
    da igreja e `brandSoft` (`brand 28%` com o fundo) para o fundo suave —
    `mixHex` em `color.ts` faz o `color-mix()` que o RN não tem. Todo texto
    e ícone que usava a cor pura passou a `brandInk`.
  - Forma: botão em pill, card 18px, modal 20px, campo 10px; elevação por
    borda no escuro (sombra só no que flutua). Ícones com traço 1.6.
- [x] **Fontes:** `@expo-google-fonts/geist`, `geist-mono` e
  `instrument-serif`, importadas por peso; DM Sans e DM Mono saíram. Títulos
  (`display`, `h1`, `h2`) em Instrument Serif; `label` em Geist Mono caixa
  alta com tracking .14em. **Fonte nova exige build nativa, não OTA.**
  Conferido no `expo export` de Android: as 8 fontes empacotadas.
- [x] **`apps/mobile/STYLE-GUIDE.md`** reescrito para a Órbita (v0.2).
- [x] **Estado sem conexão:** já existia — `describeLoadError` distingue
  "sem resposta do servidor" e as telas desenham o ícone de wifi com
  "Tentar novamente". O que a v2 pede a mais (a tela atualizar sozinha
  quando a conexão volta) precisa de `@react-native-community/netinfo` e
  ficou em §4.2.

**Navegação**
- [x] Abas **Início · Conteúdo · Bíblia · {termo} · Mais**. A Bíblia virou
  aba (`(tabs)/biblia.tsx`, a rota continua `/biblia`) e o Perfil virou
  pilha (`/perfil`), aberta pela Mais.
- [x] **{termo}:** o `GET /settings` já devolve
  `branding.group_term_singular`/`_plural`; o app lê por `useGroupTerm()`
  na aba e no título da tela de grupos. Mesma fronteira do painel: frases
  com artigo ficam em "grupo".
- [x] **Header das pilhas** sobre o fundo da tela (como o `AppHeader` do
  protótipo), voltar em `brandInk` — antes era uma barra na cor da marca.

**Telas**

| Grupo | Tela | Estado |
|---|---|---|
| Acesso | Login (sem escolher igreja, sem biometria) | [x] Título em serifa e "Sua conta já sabe qual é" |
| Acesso | Transição que aplica cor e logo da igreja | [x] `ChurchWelcome`: só depois de um login, até o `GET /settings` resolver (900 ms a 3 s) |
| Abas | Início: destaque | [x] Selo "Destaque" quando os posts foram escolhidos no painel; saudação em serifa |
| Abas | Conteúdo, Bíblia, {termo} | [x] Título da aba em serifa; o resto herda os tokens |
| Abas | Mais | [x] Escalas e Celebrações (área `volunteers`), Contribuir, Dízimo automático (trava `PROD-28` + Premium), Notificações, Perfil, Privacidade, Sair |
| Pessoal | Privacidade e meus dados (LGPD) | [x] Meus dados com correção, consentimentos com revogação, exportação pela folha de compartilhamento, pedido de exclusão cancelável (30 dias). API nova: rotas `/me` do `CONF-03` |
| Célula | Presença (líder): todos marcados, toque desmarca | [x] Na primeira chamada do encontro; com presença já registrada, ninguém vem pré-marcado. Falha mantém as marcações |
| Liderança | Cadastro de visitante (deduplicação por telefone) | [x] Fluxo da v2: sexo, origem, consentimento obrigatório; telefone repetido mostra quem o tem **antes** de criar ("registrar nova visita" ou "é outra pessoa"). API nova `POST /visitors`, aberta ao **líder de célula**. Para quem não lê pessoas (o líder), o duplicado vem reduzido — nome mascarado ("André C."), sem classificação — e toda consulta que acha alguém fica em `audit_logs` (decisão de 2026-10-04) |
| Célula | QR de check-in (líder) | [x] Do encontro e da presença; tela cheia, brilho máximo e tela acesa, validade e contagem regressiva, presenças relidas a cada 15 s, "Renovar código". As 4h e as 24h são da API; o 409 vira "passou há mais de 24 horas" com atalho para a lista. Abrir a tela gera o código (a API não lê o vigente) |
| Célula | Leitura do QR (membro) | [x] `/checkin` com `expo-camera`: permissão pedida, negada e bloqueada (abre os ajustes); ignora QR que não é de check-in; 404 "expirou ou foi renovado", 403 "não está neste grupo", sem conexão reenvia o mesmo código. Entrada no grupo e no encontro |
| Liderança | QR de autocadastro | [x] Mais › Liderança, mesmos papéis de `admin/visitor/qr`. Lista os ativos e projeta o escolhido em tela cheia; sem nenhum, cria o do culto. O QR abre a página pública `/visitante/{slug}/{token}` do web (`PROD-34`) |

### 4.2 O que falta

- [x] **Início por papel** (`PROD-30`) — feito em 2026-10-05: encontro de
  hoje (líder), próxima celebração (líder de ministério e acima), minhas
  escalas com confirmar/recusar e sino de notificações.
- [x] **Semáforo dos grupos** (pastor, Premium) — feito (2026-10-05):
  `GET /small-groups/health-summary` na API, bloco na Home do app e no Início
  do painel.
- [ ] **Início — o que ficou de fora:** eventos em que a pessoa se inscreveu
  (falta a rota do membro) e teste em aparelho.
- [x] **Privacidade (LGPD)** — feito (2026-10-04), com as rotas do titular
  na API (`CONF-03`).
- [x] **QR de check-in** (líder) e **leitura do QR** (membro, câmera —
  `PROD-12`) — feito (2026-10-04), ver as linhas "Célula" de §4.1.
- [x] **QR de autocadastro** (liderança) — feito no app (2026-10-04), com a
  página pública que o QR abre no `apps/web`, `/visitante/{slug}/{token}`
  (`PROD-34`).
- [ ] **QRs — o que ficou de fora:** limite do autocadastro por IP no wi-fi da
  igreja (`PEND-18`), teste em aparelho, gerenciar QR de autocadastro e
  leitura do código vigente (`PEND-19`).
- [x] **Cadastro de visitante pelo líder de célula** — feito (2026-10-04),
  `POST /visitors`.
- [ ] **Contribuir nativo** (`PROD-31`; o QR dinâmico e o recorrente dependem
  do `PROD-28`): hoje a Mais abre a página de doação do web.
- [ ] **Minhas escalas:** pedir troca e perfil de voluntário na mesma pilha.
- [ ] **Celebração:** minha função em destaque já existe; o modo ao vivo do
  Host é `PROPOSTA`.
- [ ] **Notificações:** central + preferências em abas (segmentado).
- [ ] **Sem conexão** que atualiza sozinho (`PROD-32`, `netinfo`).
- [ ] **Transições** fade + translateY(3px), 180 ms, entre telas (`PROD-33`).
- [ ] **Convite Premium** ("Disponível no plano Premium" + "Conhecer o
  Premium") onde o app hoje esconde o recurso.

---

## 5. Decisões

**Tomadas em 2026-10-04:**

1. **Console (`apps/admin`) herda tudo do painel** — feito, §3.3.
2. **O site não volta a ter tema claro.** A v2 é noturna e fica assim.
3. **Ícone novo** com a marca da v2 — feito, §3.4.
4. **Plano da igreja e terminologia configurável via API** — feito, §3.2.
   Correção do que este documento dizia antes: a sessão do web já tinha o
   plano (vem do token). O que faltava era saber *quais* áreas o Premium
   abriria para o papel — é o `upgrade_areas`.

**Ainda em aberto:**

1. **Copy do site:** os títulos da v2 contra os do React (§2.3), e a menção
   a "Precision Modern" na página Sobre.
