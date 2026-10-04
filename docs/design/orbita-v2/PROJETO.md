# Órbita v2 — projeto de implementação

**O que já foi aplicado da direção Órbita e o que falta, por superfície.**
A direção em si (tokens, arquitetura de informação, regras de interação) está
no [`README.md`](README.md) deste pacote. Este documento acompanha a execução.

- **Item no plano:** `PROD-29` em [`docs/PLANO.md`](../../PLANO.md). O plano
  continua sendo a fonte única do que falta; este arquivo detalha o item.
- **Atualizado em:** 2026-10-04.
- **Branch da primeira entrega:** `feat/orbita-v2-tokens-e-menu`.

## Resumo

| Superfície | Estado | O que tem | O que falta |
|---|---|---|---|
| Site (`apps/site`) | **Entregue** | As 8 páginas da v2 e as 5 de apoio (hub de funcionalidades, contato, LGPD, login e 404), só no tema escuro, com tokens, fontes, títulos, CTAs, órbita no hero e brilho do CTA final | Itens menores em [§2.3](#23-o-que-ficou-de-fora) |
| Painel (`apps/web`) | **Começado** | Tokens, fontes, botão pill, títulos em serifa, menu em seções, identidade da igreja no menu, caminho no topo e anéis no fundo | Todas as telas da v2 e o header completo — [§3.2](#32-o-que-falta) |
| App (`apps/mobile`) | **Não começado** | — | Tokens, fontes, navegação em 5 abas e as telas — [§4](#4-app-apps-mobile) |
| Console (`apps/admin`) | **Fora do pacote** | — | O README não traz desenho para ele; decidir se herda os tokens — [§5](#5-decisões-em-aberto) |

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
- **Ícone do site** (`icon.tsx`, `apple-icon.tsx`). Continua com o desenho da
  v1, que é o mesmo nos três apps. Trocar exige desenho novo.
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
- [ ] **Coroa nos itens Premium e convite "Disponível no plano Premium".**
  Depende de a sessão do web saber o plano da igreja, e hoje não sabe.
- [ ] **Terminologia da igreja** (célula/PG/GC) em menus e títulos. Depende de
  configuração nova na API, que hoje não existe.
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

## 4. App (`apps/mobile`)

Nada da Órbita foi aplicado ainda. O app segue a v1:
- DM Sans e DM Mono por `@expo-google-fonts`;
- tokens em `src/lib/theme/tokens.ts`, a partir do `STYLE-GUIDE.md`.

**Tokens e base**
- [ ] Trocar as primitivas de `src/lib/theme/tokens.ts` pelos valores da
  Órbita e manter o tema da igreja em runtime. O teal fica fixo; `--brand` é
  da igreja.
- [ ] Fontes:
  - instalar `@expo-google-fonts/geist`, `@expo-google-fonts/geist-mono` e
    `@expo-google-fonts/instrument-serif` pela raiz, por peso, e conferir
    antes se os pacotes existem nessas versões;
  - fonte nova exige build nativa, não OTA.
- [ ] Atualizar `apps/mobile/STYLE-GUIDE.md`, que hoje deriva do guia v1.
- [ ] Estado **sem conexão**, além dos quatro estados obrigatórios.

**Navegação.** As abas passam a ser **Início · Conteúdo · Bíblia · {termo} ·
Mais**. Hoje são Home · Grupos · Conteúdo · Perfil, e a Bíblia não é aba.

**Telas** (protótipo em `produto/proto/app-*.jsx`):

| Grupo | Tela | Hoje no app |
|---|---|---|
| Acesso | Login com transição que aplica cor e logo da igreja (sem biometria) | `login.tsx` |
| Abas | Início: destaque em carrossel, blocos por papel, escalas, grupos, avisos | `(tabs)/index.tsx` |
| Abas | Conteúdo e detalhe da publicação | `(tabs)/conteudo.tsx`, `post/[id].tsx` |
| Abas | Bíblia | `biblia/*` |
| Abas | {termo}: a célula | `(tabs)/grupos.tsx`, `grupo/*` |
| Abas | Mais | novo |
| Célula | Presença (líder): todos marcados como presentes, toque desmarca | `grupo/encontro/[id]/presenca.tsx` |
| Célula | QR de check-in (líder) e leitura do QR (membro) | novo — a leitura pede câmera, ver `PROD-12` |
| Serviço | Minhas escalas, pedir troca, indisponibilidade | `escala.tsx`, `indisponibilidade.tsx` |
| Serviço | Celebração (OC, setlist, minha função; modo ao vivo do Host) | `celebracao/[id].tsx` (o modo ao vivo é `PROPOSTA`) |
| Pessoal | Contribuir (PIX; Starter = chave, Premium = QR + recorrente) | `dizimo-automatico.tsx` (atrás de `PROD-28`) |
| Pessoal | Notificações (central + preferências) | `notificacoes.tsx` |
| Pessoal | Meu perfil e Privacidade (LGPD) | `(tabs)/perfil.tsx`; a LGPD depende de `CONF-03` |
| Liderança | Cadastro de visitante (deduplicação por telefone) e QR de autocadastro | novo (`API`) |

---

## 5. Decisões em aberto

1. **Console (`apps/admin`).** O pacote v2 não o desenha. Duas opções:
   herdar os tokens do painel, ou continuar na v1 por ser ferramenta interna.
2. **Tema claro do site.** A v2 é só escura, e o site deixou de seguir o modo
   claro do sistema operacional. Se o claro tiver de voltar, falta o desenho.
3. **Ícone/favicon** da Orbien na direção nova.
4. **Copy do site:** os títulos da v2 contra os do React (§2.3), e a menção
   a "Precision Modern".
5. **Plano na sessão do web.** É pré-requisito da coroa Premium e do convite
   no Starter. A rota `GET /me/permissions` já traz `features`, e poderia
   trazer o plano.
6. **Terminologia configurável.** O site já promete ("Posso chamar de EBD…?"),
   mas a API não tem esse campo.
