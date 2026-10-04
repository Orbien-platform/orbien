# Orbien — Style Guide Visual · App Mobile

*React Native + Expo · v0.2 · direção "Órbita" (v2) — `docs/design/orbita-v2/README.md`*

> **v2.** Cor, tipografia e forma seguem a Órbita: tema escuro como padrão (fundo `#05070F`), Geist na interface, Geist Mono em rótulos e números, Instrument Serif nos títulos, botão em pill. Onde este guia e o `README.md` da v2 divergirem, vale o README. A seção 3 de `orbien-brand-guidelines.md` é da v1 e foi substituída.

Este documento cobre o que o brand guideline web **não** cobre: como os mesmos tokens se comportam em mobile — touch, safe area, elevation, tema dinâmico por tenant em runtime.

> **Como ler este guia.** As seções 1–8 são a regra de design. A seção 10 é o mapa de onde cada regra está implementada neste app, e a 9 lista o que ainda não está fechado. Ao mexer em tela, o caminho é: regra na seção correspondente → token em `src/lib/theme/tokens.ts` → componente em `src/components/`.

---

## 1. Setup de tokens

Os tokens abaixo espelham a Órbita (`docs/design/orbita-v2/README.md`, "Design Tokens"). A fonte única de verdade continua sendo o CSS do web (`apps/web/src/app/globals.css`, tema claro em `:root` e escuro em `.dark`) — aqui é a tradução para o app. As chaves são as da v1 (`navy`, `teal`, `ink`…) com valor novo: nenhuma tela precisou mudar para herdar a Órbita.

```js
// forma canônica dos tokens (a implementação está em src/lib/theme/tokens.ts — ver §10)
colors: {
  navy:    { DEFAULT: "#1E3A7B", glow: "#2B4FA8" },        // cor padrão da igreja (--brand)
  teal:    { DEFAULT: "#00B8A2", dark: "#00E5C7", ink: "#007F70" }, // da Orbien, não muda com a igreja
  amber:   { DEFAULT: "#D4A437", ink: "#8A6512", dark: "#F2C766" },
  crimson: { DEFAULT: "#C0392B", ink: "#A52F23", dark: "#FF7A6B" },
  night: "#05070F",     // fundo do escuro
  snow: "#F2F1EE",      // texto do escuro
  ink: "#0F1117", parchment: "#F4F3EF",
  surface: { DEFAULT: "#FFFFFF", dark: "#0B0F1D" },
  subtle:  { DEFAULT: "#ECEBE6", dark: "#121729" },
  stone:   { DEFAULT: "#5C5A56", dark: "#A9AEBD" },
  muted:   { DEFAULT: "#8A8782", dark: "#6C7286" },
  border:  { DEFAULT: "#E2E0DA", dark: "rgba(255,255,255,.08)" },
  borderStrong: { DEFAULT: "#C8C5C0", dark: "rgba(255,255,255,.16)" },
},
fontFamily: {
  sans: ["Geist_400Regular"], "sans-light": ["Geist_300Light"],
  "sans-medium": ["Geist_500Medium"], "sans-semibold": ["Geist_600SemiBold"],
  mono: ["GeistMono_400Regular"], "mono-medium": ["GeistMono_500Medium"],
  serif: ["InstrumentSerif_400Regular"], "serif-italic": ["InstrumentSerif_400Regular_Italic"],
},
borderRadius: { btn: 999, card: 18, modal: 20, pill: 999, input: 10, avatar: 10 },
```

**Regra importante para white-label:** `navy` e `teal` acima são os defaults da plataforma. No runtime, o tenant sobrescreve via **theme context**, não em build time (ver §6). Nunca hardcode `navy` em componente que deve respeitar a cor do tenant — use o `primaryColor`/`accentColor` do `useTheme()`, que resolvem para o token do tenant carregado no login.

### Fontes (Expo)

```bash
npm install @expo-google-fonts/geist @expo-google-fonts/geist-mono @expo-google-fonts/instrument-serif -w orbien-mobile
```

Pesos a carregar, cada um pelo subpath do peso (o barril do pacote empacota os 18 arquivos): `Geist_300Light`, `Geist_400Regular`, `Geist_500Medium`, `Geist_600SemiBold`, `GeistMono_400Regular`, `GeistMono_500Medium`, `InstrumentSerif_400Regular`, `InstrumentSerif_400Regular_Italic`. Bloquear render com `SplashScreen.preventAutoHideAsync()` até `useFonts()` resolver — nunca deixar o app piscar com a fonte do sistema. **Fonte nova exige build nativa**: não sai por OTA.

---

## 2. Tipografia mobile

Títulos em Instrument Serif (a voz da Órbita), interface em Geist, números e rótulos em Geist Mono. A serifa só tem o peso 400 — nunca aplicar `fontWeight` por cima, o RN sintetiza um negrito falso.

| Token | Família | Tamanho | Line height | Uso |
|---|---|---|---|---|
| `display` | Instrument Serif | 36px | 40px | Tela cheia (splash, transição de entrada) |
| `h1` | Instrument Serif | 30px | 34px | Título de aba e de tela grande, saudação da Home |
| `h2` | Instrument Serif | 24px | 28px | Título de seção, título do destaque |
| `h3` | Geist 500 | 16px | 22px | Título de card, item de lista, header de pilha |
| `body` | Geist 400 | 15px | 22px | Texto corrido |
| `body-medium` | Geist 400 | 14px | 20px | Formulário, descrição |
| `label` | Geist Mono 500 | 11px | 16px | Rótulo de seção e de campo — **caixa alta por estilo** (`textTransform`), tracking .14em. A string fica em caixa normal, para leitor de tela e testes |
| `caption` | Geist 400 | 11px | 14px | Timestamp, meta info, rótulo da tab bar (em 500) |
| `mono` | Geist Mono 400 | 13px | 18px | Valores monetários, IDs |
| `button` | Geist 500 | 15px | — | Sempre 500, nunca 600 (idêntico ao web) |

**Mínimo absoluto: 11px.** Nunca ir abaixo disso mesmo em caption — acessibilidade e leitura em telas pequenas.

**Dynamic Type (iOS) / Font Scaling (Android):** respeitar `allowFontScaling` como `true` no texto de corpo e labels. Desabilitar (`false`) apenas em: números de KPI grandes, badges de status curtos, ícones com texto fixo — onde o layout quebraria.

---

## 3. Espaçamento e touch targets

Base 4px, igual ao web — mas mobile tem uma regra que o web não tem: **área mínima de toque**.

| Elemento | Valor mínimo |
|---|---|
| Touch target (botão, ícone tocável, item de lista) | 44×44pt (iOS) / 48×48dp (Android) — usar **48** como padrão único |
| Espaço entre dois elementos tocáveis adjacentes | 8px |
| Padding horizontal de tela | 16px (telas até 375px) / 20px (telas maiores) |
| Padding de card | 16px |
| Gap entre cards em lista | 12px |
| Bottom safe area (tab bar, botão fixo) | `useSafeAreaInsets().bottom` + 8px, nunca valor fixo |

Regra prática: se o elemento visual (ícone, texto) é menor que 48px, o **touch target invisível** ao redor precisa completar 48px via `hitSlop` ou padding — nunca deixar alvo de toque menor que isso, mesmo que o design pareça "compacto o suficiente".

---

## 4. Superfícies: shadow (iOS) vs elevation (Android)

RN não interpreta `box-shadow` do web. Na Órbita a elevação no **escuro** é borda + brilho, quase sem sombra; no claro a sombra continua discreta.

| Token | Claro (iOS · Android) | Escuro (iOS · Android) | Uso |
|---|---|---|---|
| `sm` | `0,1` · 0.06 · r3 · elev 2 | nenhuma — a borda `border` faz o papel | Card de lista |
| `md` | `0,4` · 0.08 · r10 · elev 6 | `0,16` · 0.5 · r30 · elev 10 | Modal, bottom sheet |
| `lg` | `0,8` · 0.12 · r20 · elev 12 | `0,30` · 0.6 · r40 · elev 16 | FAB |

O `md`/`lg` do escuro traduzem o `0 30px 80px rgba(0,0,0,.6)` do README: só o que flutua de verdade ganha sombra.

---

## 5. Border radius e iconografia

Órbita: botão, badge e segmentado em **pill**; card 18px (o README pede 16–20 no app); modal/bottom sheet 20px; input 10px; avatar e quadrado de ícone 10px. Caixa que não é botão (alerta, miniatura, versículo) usa o raio do input, não o do botão.

**Ícones:** `lucide-react-native` (mesma família do `lucide-react` no web — consistência entre plataformas é o ponto).
- Traço de 1.6px, sempre outline; a aba ativa engrossa para 2
- Tamanhos: 18px (inline com texto), 22px (tab bar inativa), 24px (ação em card, header), 28px (tab bar ativa / estado vazio)
- Tab bar ativa usa `accentReadable` — no escuro, o teal da Orbien; inativa usa `textTertiary`

**Assinatura visual:** anéis concêntricos com o satélite teal girando (26s, linear) — na splash animada. `orbit` em `tokens.ts` guarda raios e período.

---

## 6. Tema dinâmico (white-label em runtime)

Este é o núcleo do mobile que o guia web não precisa resolver: **a mesma build (Starter) roda com cores diferentes por tenant**, carregadas depois do login — não em build time.

```ts
type TenantTheme = {
  primary: string;    // substitui navy
  accent: string;     // substitui teal — se o tenant não definir, cai no teal default
  logoUrl: string;
  appName: string;
};
```

### As duas formas do app

O app roda de duas formas, e as duas usam **o mesmo caminho de código**. A diferença é só quais camadas da cadeia abaixo estão preenchidas.

| | Versão genérica (Starter) | Versão personalizada (Premium) |
|---|---|---|
| Build | uma, para todos os tenants | própria por tenant, via EAS profile |
| De onde vem a paleta | runtime (`GET /settings`), no login | embutida na build, e o runtime ainda pode sobrescrever |
| Antes do login (splash, tela de login) | paleta da plataforma no 1º acesso; do cache do último login em diante | já na cor da igreja, desde o primeiro frame |
| Como se configura | admin do tenant grava `primary_color` | `ORBIEN_PRIMARY_COLOR` / `ORBIEN_ACCENT_COLOR` no profile do EAS |

### Cadeia de resolução

Da menor para a maior precedência. Cada camada é **parcial**: campo ausente, nulo ou inválido cai para a de baixo, nunca para vazio.

1. **plataforma** — navy/teal. Sempre completa; é o piso que garante que nunca existe UI sem tema.
2. **build** — `ORBIEN_PRIMARY_COLOR`/`ORBIEN_ACCENT_COLOR`, via `app.config.js` → `extra.brandTheme`. É a **única camada disponível antes do login**, e por isso a que pinta splash e login numa versão personalizada. O fundo da splash nativa e o satélite da splash animada derivam dela.
3. **cache** — último `GET /settings` bem-sucedido, em AsyncStorage. Numa versão genérica é o que faz o segundo login em diante já abrir na cor da igreja.
4. **runtime** — `GET /settings` desta sessão. Manda, porque é o único que reflete uma troca de cor feita agora no admin.

Regras:
- **Nunca** usar a primitiva `navy` diretamente em componente de produto — sempre o `primaryColor`/`accentColor` resolvidos pelo `ThemeContext`.
- Cores **funcionais** (`crimson`, `burgundy`, `teal` de sucesso) **nunca** são sobrescritas pelo tenant — erro é sempre crimson, independente da marca da igreja. Só `primary` (CTA) e opcionalmente `accent` são customizáveis.
- A API resolve as duas em `GET /settings` → `branding.primary_color` / `branding.accent_color`, cada uma por congregação e depois por tenant. No banco: `congregations.primary_color`/`congregations.accent_color` e, no nível do tenant, `branding_configs.primary_color`/`branding_configs.secondary_color` (nome anterior ao design system — ver §9).
- **Texto sobre a cor da marca é medido, não fixo.** `colors.textOnBrand` é derivado da cor resolvida pela razão de contraste (`readableOn`, `src/lib/theme/color.ts`), não fixado em branco: um tenant de amarelo pastel receberia branco sobre claro. Isto é o que permite a paleta mudar de verdade sem cada tela saber disso.
- **Destaque sobre superfície usa `accentReadable`**, não `accentColor` cru: é o accent quando ele passa AA sobre `bgSurface`, e o `primaryColor` quando não passa. É o que resolve o conflito entre o §5 (tab bar ativa usa accent) e o AA do §8. O teal da plataforma tem um tom por modo — `#00E5C7` no escuro, `#007F70` no claro — e os dois passam AA.
- **Texto e ícone na cor da igreja usam `brandInk`**, não `primaryColor`: no escuro é `color-mix(brand 45%, branco)`, porque o navy puro some no fundo noturno; no claro é a própria cor. O fundo suave da marca é `brandSoft` (`brand 28%` com o fundo, no escuro). `primaryColor` fica para **fundo** (CTA, avatar, transição de entrada).
- **Terminologia:** como a igreja chama o pequeno grupo (célula, PG, GC) vem de `branding.group_term_singular`/`_plural` no `GET /settings` e chega às telas por `useGroupTerm()` (`src/lib/theme/terminology.ts`). Troca só o substantivo isolado (aba, título); frase com artigo fica em "grupo", porque o termo não traz o gênero.
- Contraste mínimo, dividido entre os dois lados, porque cada um resolve o que o outro não pode:
  - **`primary` é barrada no cadastro** quando falha AA (4.5:1) contra branco — `IsAccessibleBrandColor`, em `apps/api/src/common/validators/brand-color.validator.ts`, mais o aviso equivalente na tela de Configurações do web. Tem de ser no cadastro porque há consumidor da mesma cor que não pode escolher par legível: `pdf-export.service.ts` a usa como **cor de texto sobre papel branco**, e uma cor clara sai ilegível no PDF da escala sem ninguém descobrir.
  - **`accent` só tem o formato validado.** Ele é ícone/label sobre superfície, e as superfícies são duas: exigir AA nas duas rejeitaria o próprio teal da plataforma (~2.4:1 sobre branco, ~9:1 sobre o fundo escuro). Quem resolve em runtime é o `accentReadable`.
  - O front **degrada** cor inválida (ignora a camada e cai na de baixo) em vez de aplicá-la. Degradar não é validar: é a rede de segurança para o que já está gravado.
- **Starter:** rodapé "Powered by Orbien" fixo, `stone`, no fundo de telas-chave. **Premium:** removido, conforme `orbien-brand-guidelines.md` §5.2. O plano vem do `plan` no JWT.

---

## 7. Componentes-chave mobile

Specs mínimas dos componentes que aparecem em quase toda tela — antes de desenhar telas específicas dos módulos, valide contra isto.

**Botão primário**
- Altura 48px, padding horizontal 20px, **pill**, cor primária do tenant, texto `button` token, `textOnBrand`
- Secundário: pill transparente com borda `borderStrong` e texto `textPrimary` — sem cor de marca, que sumiria no escuro. Ghost: texto `brandInk`
- Estado pressed: opacity 0.85 (não usar cor de hover — mobile não tem hover)
- Estado loading: spinner substitui texto, largura do botão não muda (evita layout shift)
- O rótulo **não** é travado em uma linha: com `numberOfLines={1}`, uma medição apertada (fonte da marca recém-carregada, escala de texto grande do sistema, dois botões dividindo a linha) cortava a palavra — "Entrar" virava "Entr...". A altura é `minHeight`, então o botão cresce em vez de espremer o texto.
- Estado disabled: fundo `subtle`, texto `muted`

**Header de stack (só nas telas de detalhe)**
- As abas rodam **sem** header, com o título da aba em `h1` serifado no topo do conteúdo: a tab bar já identifica a tela, e uma barra de 56px + safe area repetindo a marca em toda tela custa mais espaço útil do que entrega. A safe area superior das abas fica no `View` que envolve o navigator (`src/app/(tabs)/_layout.tsx`).
- Tela de detalhe (aberta a partir de uma aba) **tem** header: fundo `bgBase` (o mesmo da tela, como o `AppHeader` da v2), título `h3` centralizado em `textPrimary`, voltar em `brandInk`, sem filete, e o botão de voltar só com a seta (`headerBackButtonDisplayMode: "minimal"` — sem isso o iOS escreve o nome da rota anterior ao lado dela, que é o grupo de abas e aparece como "(tabs)").
- Toda rota de detalhe declara `title` no `Stack.Screen`: é ele que nomeia a tela e o retorno.

**Marca em tela**
- A identidade aparece **uma vez**, no topo do conteúdo da primeira aba (`BrandHeader`), não em barra repetida.
- Logo do tenant quando existe; a marca da Orbien (vetor, `BrandMark`) quando não existe **e** quando a URL do tenant não carrega — `<Image>` com URI quebrada não desenha nada e não avisa, o que aparecia como um retângulo vazio no topo da tela.
- Nome do app vem sempre de `useTheme().appName`, nunca de literal.

**Bottom tab bar**
- Altura 56px + safe area inset bottom
- Cinco itens, na ordem da v2: **Início · Conteúdo · Bíblia · {termo} · Mais**. É o máximo (regra dura); o resto mora na Mais
- Ícone 22px inativo / 28px ativo, rótulo `caption` em Geist 500 abaixo — nome de lugar, lido de relance, não o mono caixa-alta do `label`

**Lista agrupada** (`ListGroup` — a `AList` do protótipo, usada na Mais)
- Um card só, linhas de 52px separadas por filete, quadrado de ícone de 32px, título + linha de apoio, chevron quando navega
- Ação destrutiva (Sair) em `danger`, sem chevron

**Transição de entrada** (`ChurchWelcome`)
- Depois do login (não no boot já logado): tela cheia na `primaryColor`, logo e nome da igreja, "Aplicando a identidade da sua igreja…", até o `GET /settings` resolver — mínimo 900 ms, teto 3 s, sai em fade de 180 ms (sem animação com "reduzir movimento")

**Card de lista (membro, célula, transação)**
- Padding 16px, radius 18px, borda `border` (no escuro é ela que separa o card do fundo), `shadow-sm`, gap 12px entre cards
- Avatar/ícone à esquerda (40px), conteúdo central, badge/valor à direita
- Toque no card inteiro navega — nunca exigir toque em área específica dentro do card

**Badge de status** (vínculo: membro/frequentador/visitante; financeiro: inadimplente/suspenso)
- Radius pill (100px), padding 4px×10px, `label` token
- Cores conforme §3.2 do brand guideline — dot + texto, nunca só cor de fundo (acessibilidade para daltonismo)

**Bottom sheet** (substitui modal em mobile — preferir sempre que a ação for de contexto único, ex: cadastro rápido de visitante)
- Radius 16px só no topo, `shadow-lg`, handle bar de 4px centralizado no topo
- Fecha com swipe down ou tap fora

**FAB de cadastro rápido de visitante**
- 56px diâmetro, cor de destaque, `shadow-lg`, posição fixa bottom-right respeitando safe area + 16px
- Único FAB do app — não introduzir outros para não competir por atenção

---

## 8. Light e dark — tokens semânticos

Nunca referenciar cor primitiva (`ink`, `parchment`, `subtle-dark`) direto no componente. Usar sempre o **papel semântico** abaixo, que resolve para o valor certo conforme o modo ativo. Isso é o que permite trocar de tema sem tocar em nenhuma tela.

| Papel semântico | Claro | Escuro (padrão) | Uso |
|---|---|---|---|
| `bgBase` | `#F4F3EF` | `#05070F` | Fundo de tela |
| `bgSurface` | `#FFFFFF` | `#0B0F1D` | Card, bottom sheet, tab bar |
| `bgSubtle` | `#ECEBE6` | `#121729` | Pressed, campo, segmentado |
| `textPrimary` | `#0F1117` | `#F2F1EE` | Texto principal |
| `textSecondary` | `#5C5A56` | `#A9AEBD` | Texto de apoio |
| `textTertiary` | `#8A8782` | `#6C7286` | Rótulos, legendas |
| `border` / `borderStrong` | `#E2E0DA` / `#C8C5C0` | `rgba(255,255,255,.08)` / `.16` | Divisórias / campo, botão secundário |
| `badgeNavyBg` / `badgeNavyText` | `#E4E8F1` / `#1E3A7B` | `#0D1530` / `#9AA8C8` | Badge "vínculo" |
| `success` / `successDim` | `#007F70` / `#D0F5F1` | `#00E5C7` / teal a 12% | Estado ok, progresso |
| `warning` / `warningDim` | `#8A6512` / `#F7EDD3` | `#F2C766` / amber a 12% | Atenção, prazo perto |
| `danger` / `dangerDim` | `#C0392B` / `#FDECEA` | `#FF7A6B` / crimson a 12% | Erro, crítico |

**Regra de contraste:** `textPrimary` sobre `bgBase`/`bgSurface` precisa manter AA (4.5:1) nos dois modos — já garantido pelos pares acima, mas revalidar se qualquer token for ajustado.

**Cor do tenant (`primary`/`accent` do white-label, §6) não muda entre light e dark** — é a mesma cor da marca da igreja nos dois modos. O que muda é só o fundo/superfície ao redor dela. Se o tenant escolheu uma cor muito clara (ex.: amarelo pastel) e ela precisa funcionar como CTA em fundo escuro também, validar contraste contra `bgSurface` **dark**, não só light — é o caso que mais frequentemente falha.

### Comportamento e implementação

- **Escuro é o padrão da Órbita.** Sem escolha gravada, o app abre no escuro; o Perfil oferece claro, escuro e "seguir o sistema"
- Resolver o token semântico já correto no `ThemeContext`, para não espalhar condicional de modo por toda a tela
- Testar especificamente: ícones de mapa/foto que podem precisar de variante dark
- Status bar: `light-content` em dark mode, `dark-content` em light mode — trocar dinamicamente, não fixar. Como o header das pilhas também fica sobre `bgBase`, a regra vale para toda tela.
- Imagens/logo do tenant: pedir versão do logo para fundo escuro no onboarding do tenant (Premium) — logo com texto escuro sobre fundo `#05070F` é o erro mais comum de white-label em dark mode

---

## 9. O que este guia não cobre ainda

- [x] `textTertiary` e `dangerDim` no escuro — fechados pela Órbita (`#6C7286` e crimson a 12%)
- [ ] Motion/transição entre telas: a v2 pede fade + translateY(3px) de 180 ms; hoje vale o default do Expo Router
- [ ] Mensagem de erro por causa: `describeLoadError` (`src/lib/api/load-error.ts`) já separa "sem resposta do servidor" de "servidor respondeu com erro" — falta o caso de **offline detectado** (rede ausente antes mesmo de tentar), que pede `@react-native-community/netinfo`
- [ ] Estados de erro de rede / offline (materiais de PG e devocional precisam funcionar offline — ver `orbien-guia-fases-execucao.md`)
- [ ] Variação do ícone do app por tenant (Starter usa skin, Premium build própria via EAS)
- [ ] Biblioteca de ilustração para estados vazios
- [ ] Logo na camada de build: uma versão personalizada configura ícone e splash por env, mas o `logoUrl` só vem do runtime — um logo embutido precisaria de asset no bundle, não de URL. Enquanto isso, a versão personalizada mostra a marca da Orbien até o primeiro `GET /settings` (a cor, essa sim, já vem da build)
- [ ] Renomear `branding_configs.secondary_color` para `accent_color`: a coluna do tenant é anterior ao design system. A da congregação já nasceu `accent_color`, e a API expõe as duas como `accent_color` — o desalinhamento é só no nome da coluna do tenant, e sair dele é migration própria
- [ ] Bottom sheet e FAB (§7) ainda não têm uso no app — o cadastro de visitante entrou como pilha aberta pela Mais, que é o que a v2 desenha

---

## 10. Onde cada regra está implementada

O guia é a regra; esta seção é o mapa. Mexer em uma coluna sem olhar a outra é o que faz o app e o guia divergirem.

| Guia | Implementação |
|---|---|
| §1 tokens de cor, fonte, radius | `src/lib/theme/tokens.ts` (`brand`, `fontFamily`, `radius`, `buttonHeight`, `orbit`) |
| §1 carregamento de fonte | `src/lib/theme/fonts.ts` (`useAppFonts`), gate do splash em `src/app/_layout.tsx` |
| §2 escala tipográfica | `tokens.ts` → `typography` |
| §3 espaçamento, alvo de toque, padding de tela | `tokens.ts` → `spacing`, `touchTarget`, `screenPadding`; `src/components/Screen.tsx` |
| §4 sombra por plataforma e por modo | `tokens.ts` → `shadows(isDark)`, exposto como `useTheme().shadow` |
| §5 iconografia | `src/lib/theme/icons.ts` (lista fechada), `tokens.ts` → `iconSize`, `ICON_STROKE_WIDTH` |
| §6 cadeia de resolução da paleta | `src/lib/theme/brand-theme.ts` (camadas), `app.config.js` (camada de build) |
| §6 tema por tenant | `src/lib/theme/theme-provider.tsx` (`primaryColor`, `accentColor`, `accentReadable`, `logoUrl`, `appName`) |
| §6/§8 contraste medido (`textOnBrand`, `accentReadable`) e mistura (`brandInk`, `brandSoft`) | `src/lib/theme/color.ts` (`readableOn`, `mixHex`) |
| §6 terminologia da igreja | `src/lib/theme/terminology.ts` (`useGroupTerm`), campo em `brand-theme.ts` |
| §6 validação AA no cadastro | `apps/api/src/common/validators/brand-color.validator.ts`, `apps/web/src/app/(admin)/configuracoes/page.tsx` |
| §7 botão | `src/components/AppButton.tsx` |
| §7 tab bar | `src/app/(tabs)/_layout.tsx` |
| §7 lista agrupada | `src/components/ListGroup.tsx` (tela Mais: `src/app/(tabs)/mais.tsx`) |
| §7 transição de entrada | `src/components/ChurchWelcome.tsx`, ligada em `src/app/_layout.tsx` |
| §7 header de stack (só no detalhe) | `src/app/_layout.tsx` |
| §7 marca em tela | `src/components/BrandHeader.tsx`, `BrandLogo.tsx`, `BrandMark.tsx` |
| §7 card de lista | `src/components/Card.tsx` + `Avatar.tsx` / `DateBlock.tsx` |
| §7 badge de status | `src/components/Badge.tsx` |
| §8 papéis semânticos e modo claro/escuro | `tokens.ts` → `palettes`; resolução em `theme-provider.tsx`; override manual em `src/app/perfil.tsx` |
| §8 status bar dinâmica | `src/app/_layout.tsx` |

### Por que não `tailwind.config.js` / NativeWind

O §1 do guia foi escrito como um `tailwind.config.js`. Neste app os mesmos valores vivem em `src/lib/theme/tokens.ts`, em TypeScript, por duas razões que vêm do próprio guia:

1. O §6 determina que a cor do tenant seja resolvida **em runtime**, pelo theme context, e não pelo Tailwind config — que é build time. Ou seja: justamente as cores que mais aparecem em tela (CTA, ícone ativo, destaque) nunca poderiam sair de lá.
2. O §8 recomenda "resolver o token semântico já correto no `ThemeContext` para não espalhar condicional de modo por toda a tela". Com (1) e (2), o que sobraria para o Tailwind seriam as primitivas — que é exatamente o que `tokens.ts` declara, com tipo e com o `Palette` semântico em cima.

Adotar NativeWind depois continua possível e não invalida nada aqui: os tokens já estão num módulo só, no formato que um `theme.extend` consome. O que **não** deve acontecer é existir um `tailwind.config.js` de fachada, sem NativeWind instalado, como terceira fonte de verdade de cor ao lado deste arquivo e do CSS do web.

### Desvios conscientes

- **Tab bar ativa (§5)** usa `accentReadable`, não o `accentColor` cru. Com a paleta da plataforma isso resolve para o teal do modo ativo (`#00E5C7` no escuro, `#007F70` no claro), que passa AA nos dois. Um accent da igreja sem contraste cai no `primaryColor`, sem tocar em tela nenhuma.
- **"Powered by Orbien" (§6)** usa o token `caption` (11px), não 10px: o §2 fixa 11px como mínimo absoluto de acessibilidade. Aparece na tela de Perfil, condicionado a `plan !== "premium"` (o plano vem do JWT). Não aparece no login, onde ainda não há token para saber o plano.
- **Fonte (§1)** não bloqueia para sempre: se o carregamento falhar, `useAppFonts` libera o render com a fonte do sistema. Travar o app no splash por um asset que nunca vai resolver é pior que a fonte errada.

---

*Orbien — Style Guide Mobile · v0.2 · direção Órbita (`docs/design/orbita-v2/`)*
