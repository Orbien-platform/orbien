# Orbien — Style Guide Visual · App Mobile

*React Native + Expo · v0.1 · deriva de `orbien-brand-guidelines.md`*

Este documento cobre o que o brand guideline web **não** cobre: como os mesmos tokens se comportam em mobile — touch, safe area, elevation, tema dinâmico por tenant em runtime.

> **Como ler este guia.** As seções 1–8 são a regra de design. A seção 10 é o mapa de onde cada regra está implementada neste app, e a 9 lista o que ainda não está fechado. Ao mexer em tela, o caminho é: regra na seção correspondente → token em `src/lib/theme/tokens.ts` → componente em `src/components/`.

---

## 1. Setup de tokens

Os tokens abaixo espelham `orbien-brand-guidelines.md` §3.2. Fonte única de verdade continua sendo o CSS do web (`apps/web/src/app/globals.css`, bloco `@theme inline`) — aqui é a tradução para o app.

```js
// forma canônica dos tokens (a implementação está em src/lib/theme/tokens.ts — ver §10)
colors: {
  navy:     { DEFAULT: "#1E3A7B", dark: "#162D62", dim: "#D4DCEF", dimDark: "#1A2540" },
  teal:     { DEFAULT: "#00B8A2", dark: "#00CDB5", dim: "#D0F5F1", dimDark: "#0A2E2A" },
  crimson:  { DEFAULT: "#C0392B", dark: "#E05444", dim: "#FDECEA" },
  burgundy: { DEFAULT: "#991B1B", dim: "#F5E6E6" },
  ink: "#0F1117",
  parchment: "#F5F4F1",
  surface: { DEFAULT: "#FFFFFF", dark: "#13151E" },
  subtle:  { DEFAULT: "#EEECEA", dark: "#1C1F2B" },
  stone: "#5C5A56",
  muted: "#9B9893",
  border: { DEFAULT: "#E0DDD9", dark: "#232634" },
},
fontFamily: {
  sans:            ["DMSans_400Regular"],
  "sans-light":    ["DMSans_300Light"],
  "sans-medium":   ["DMSans_500Medium"],
  "sans-semibold": ["DMSans_600SemiBold"],
  mono:            ["DMMono_400Regular"],
  "mono-medium":   ["DMMono_500Medium"],
},
borderRadius: { btn: 8, card: 12, modal: 16, pill: 999, input: 8 },
```

**Regra importante para white-label:** `navy` e `teal` acima são os defaults da plataforma. No runtime, o tenant sobrescreve via **theme context**, não em build time (ver §6). Nunca hardcode `navy` em componente que deve respeitar a cor do tenant — use o `primaryColor`/`accentColor` do `useTheme()`, que resolvem para o token do tenant carregado no login.

### Fontes (Expo)

```bash
npx expo install @expo-google-fonts/dm-sans @expo-google-fonts/dm-mono expo-font
```

Pesos a carregar: `DMSans_300Light`, `DMSans_400Regular`, `DMSans_500Medium`, `DMSans_600SemiBold`, `DMMono_400Regular`, `DMMono_500Medium`. Bloquear render com `SplashScreen.preventAutoHideAsync()` até `useFonts()` resolver — nunca deixar o app piscar com a fonte do sistema.

---

## 2. Tipografia mobile

Mesma lógica de peso do web (contraste 300/500 é a ferramenta expressiva), com tamanhos reduzidos para telas pequenas — a escala web de 48–80px não existe em mobile.

| Token | Peso | Tamanho | Line height | Uso |
|---|---|---|---|---|
| `display` | 300 | 32px | 38px | Título de tela cheia (splash, onboarding) |
| `h1` | 500 | 24px | 30px | Título de tela (header de stack) |
| `h2` | 500 | 20px | 26px | Título de seção / card grande |
| `h3` | 500 | 16px | 22px | Subtítulo, título de list item |
| `body` | 300 | 15px | 22px | Texto corrido |
| `body-medium` | 400 | 14px | 20px | Formulário, descrição |
| `label` | 500 | 11px | 14px | Label de campo, categoria (caps, +10% tracking) |
| `caption` | 400 | 11px | 14px | Timestamp, meta info |
| `mono` | 400 | 13px | 18px | Valores monetários, IDs |
| `button` | 500 | 15px | — | Sempre 500, nunca 600 (idêntico ao web) |

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

RN não interpreta `box-shadow` do web. Cada plataforma resolve sombra de forma diferente — isso precisa estar explícito ou o dev improvisa valores inconsistentes.

| Token | iOS | Android |
|---|---|---|
| `sm` | offset `0,1` · opacity 0.06 · radius 3 | elevation 2 |
| `md` | offset `0,4` · opacity 0.08 · radius 10 | elevation 6 |
| `lg` | offset `0,8` · opacity 0.12 · radius 20 | elevation 12 |

Uso: `sm` em card de lista, `md` em modal/bottom sheet, `lg` reservado para o FAB de "cadastro rápido de visitante" (§7) — é o único elemento que deve competir visualmente com a tab bar.

**Dark mode:** Android elevation não muda de cor; em dark, compensar aumentando o `elevation` em +2 (sombra pura fica quase invisível em fundo escuro). iOS: `shadowOpacity` sobe para ~0.35 em dark, senão a sombra some no fundo `#13151E`.

---

## 5. Border radius e iconografia

Idêntico ao web (§3.6 do brand guideline): botão 8px, card 12px, modal/bottom sheet 16px, badge/pill 100px, input 8px, avatar 10px.

**Ícones:** `lucide-react-native` (mesma família do `lucide-react` no web — consistência entre plataformas é o ponto).
- Stroke width: 1.5px, sempre outline — nunca filled, mesma regra do web
- Tamanhos: 18px (inline com texto), 22px (tab bar inativa), 24px (ação em card, header), 28px (tab bar ativa / estado vazio)
- Tab bar ativa usa a cor de destaque do tenant; inativa usa `muted`

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
- **Destaque sobre superfície usa `accentReadable`**, não `accentColor` cru: é o accent quando ele passa AA sobre `bgSurface`, e o `primaryColor` quando não passa. É o que resolve o conflito entre o §5 (tab bar ativa usa accent) e o AA do §8.
- Contraste mínimo, dividido entre os dois lados, porque cada um resolve o que o outro não pode:
  - **`primary` é barrada no cadastro** quando falha AA (4.5:1) contra branco — `IsAccessibleBrandColor`, em `apps/api/src/common/validators/brand-color.validator.ts`, mais o aviso equivalente na tela de Configurações do web. Tem de ser no cadastro porque há consumidor da mesma cor que não pode escolher par legível: `pdf-export.service.ts` a usa como **cor de texto sobre papel branco**, e uma cor clara sai ilegível no PDF da escala sem ninguém descobrir.
  - **`accent` só tem o formato validado.** Ele é ícone/label sobre superfície, e as superfícies são duas: exigir AA nas duas rejeitaria o próprio teal da plataforma (~2.4:1 sobre branco, ~9:1 sobre o fundo escuro). Quem resolve em runtime é o `accentReadable`.
  - O front **degrada** cor inválida (ignora a camada e cai na de baixo) em vez de aplicá-la. Degradar não é validar: é a rede de segurança para o que já está gravado.
- **Starter:** rodapé "Powered by Orbien" fixo, `stone`, no fundo de telas-chave. **Premium:** removido, conforme `orbien-brand-guidelines.md` §5.2. O plano vem do `plan` no JWT.

---

## 7. Componentes-chave mobile

Specs mínimas dos componentes que aparecem em quase toda tela — antes de desenhar telas específicas dos módulos, valide contra isto.

**Botão primário**
- Altura 48px, padding horizontal 20px, radius 8px, cor primária do tenant, texto `button` token, branco
- Estado pressed: opacity 0.85 (não usar cor de hover — mobile não tem hover)
- Estado loading: spinner substitui texto, largura do botão não muda (evita layout shift)
- O rótulo **não** é travado em uma linha: com `numberOfLines={1}`, uma medição apertada (fonte da marca recém-carregada, escala de texto grande do sistema, dois botões dividindo a linha) cortava a palavra — "Entrar" virava "Entr...". A altura é `minHeight`, então o botão cresce em vez de espremer o texto.
- Estado disabled: fundo `subtle`, texto `muted`

**Header de stack (só nas telas de detalhe)**
- As cinco abas rodam **sem** header: a tab bar já identifica a tela, e uma barra de 56px + safe area repetindo a marca em toda tela custa mais espaço útil do que entrega. A safe area superior das abas fica no `View` que envolve o navigator (`src/app/(tabs)/_layout.tsx`).
- Tela de detalhe (aberta a partir de uma aba) **tem** header: fundo na cor da marca, título `h3` centralizado, sem sombra, e o botão de voltar só com a seta (`headerBackButtonDisplayMode: "minimal"` — sem isso o iOS escreve o nome da rota anterior ao lado dela, que é o grupo de abas e aparece como "(tabs)").
- Toda rota de detalhe declara `title` no `Stack.Screen`: é ele que nomeia a tela e o retorno.

**Marca em tela**
- A identidade aparece **uma vez**, no topo do conteúdo da primeira aba (`BrandHeader`), não em barra repetida.
- Logo do tenant quando existe; a marca da Orbien (vetor, `BrandMark`) quando não existe **e** quando a URL do tenant não carrega — `<Image>` com URI quebrada não desenha nada e não avisa, o que aparecia como um retângulo vazio no topo da tela.
- Nome do app vem sempre de `useTheme().appName`, nunca de literal.

**Bottom tab bar**
- Altura 56px + safe area inset bottom
- Máximo 5 itens (regra dura — acima disso, usar "Mais" agregando)
- Ícone 22px inativo / 28px ativo, label 11px abaixo, `label` token

**Card de lista (membro, célula, transação)**
- Padding 16px, radius 12px, `shadow-sm`, gap 12px entre cards
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

| Papel semântico | Light | Dark | Uso |
|---|---|---|---|
| `bgBase` | `#F5F4F1` (parchment) | `#0F1117` (ink) | Fundo de tela |
| `bgSurface` | `#FFFFFF` | `#13151E` | Card, bottom sheet, header |
| `bgSubtle` | `#EEECEA` | `#1C1F2B` | Pressed, fundo de KPI |
| `textPrimary` | `#0F1117` (ink) | `#F5F4F1` (parchment) | Texto principal |
| `textSecondary` | `#5C5A56` (stone) | `#9B9893` (muted) | Texto de apoio |
| `textTertiary` | `#9B9893` (muted) | `#5C5A56`* | Labels, captions |
| `border` | `#E0DDD9` | `#232634` | Divisores, contorno de input |
| `badgeNavyBg` | `#D4DCEF` (navy-dim) | `#1A2540` (navy-dim-dark) | Fundo de badge "vínculo" |
| `successDim` | `#D0F5F1` (teal-dim) | `#0A2E2A` (teal-dim-dark) | Fundo de badge sucesso |
| `dangerDim` | `#FDECEA` (crimson-dim) | `#3A1815`* | Fundo de badge erro |
| `success` / `accent` | `#00B8A2` | `#00CDB5` (teal-dark) | Ícone ativo, delta positivo |

\* Não definido em `orbien-brand-guidelines.md` — ainda a fechar com design (ver §9).

**Regra de contraste:** `textPrimary` sobre `bgBase`/`bgSurface` precisa manter AA (4.5:1) nos dois modos — já garantido pelos pares acima, mas revalidar se qualquer token for ajustado.

**Cor do tenant (`primary`/`accent` do white-label, §6) não muda entre light e dark** — é a mesma cor da marca da igreja nos dois modos. O que muda é só o fundo/superfície ao redor dela. Se o tenant escolheu uma cor muito clara (ex.: amarelo pastel) e ela precisa funcionar como CTA em fundo escuro também, validar contraste contra `bgSurface` **dark**, não só light — é o caso que mais frequentemente falha.

### Comportamento e implementação

- Seguir `Appearance.getColorScheme()` do sistema por padrão, com override manual em Configurações (light / dark / sistema)
- Resolver o token semântico já correto no `ThemeContext`, para não espalhar condicional de modo por toda a tela
- Testar especificamente: elevation do Android em dark (§4 — sombra pura some em fundo escuro, compensar com +2 de elevation), e ícones de mapa/foto que podem precisar de variante dark
- Status bar: `light-content` em dark mode, `dark-content` em light mode — trocar dinamicamente, não fixar. A exceção é a tela de detalhe, que desenha o header na cor (escura) da marca sob a status bar: ali é sempre `light`, nos dois modos.
- Imagens/logo do tenant: pedir versão do logo para fundo escuro no onboarding do tenant (Premium) — logo com texto escuro sobre fundo `#13151E` é o erro mais comum de white-label em dark mode

---

## 9. O que este guia não cobre ainda

- [ ] `textTertiary` (dark) e `dangerDim` (dark) não têm valor fechado no brand guideline — hoje é estimativa (`#5C5A56` e `#3A1815`), confirmar com design
- [ ] Motion/transição entre telas (Expo Router default vs custom)
- [ ] Mensagem de erro por causa: `describeLoadError` (`src/lib/api/load-error.ts`) já separa "sem resposta do servidor" de "servidor respondeu com erro" — falta o caso de **offline detectado** (rede ausente antes mesmo de tentar), que pede `@react-native-community/netinfo`
- [ ] Estados de erro de rede / offline (materiais de PG e devocional precisam funcionar offline — ver `orbien-guia-fases-execucao.md`)
- [ ] Variação do ícone do app por tenant (Starter usa skin, Premium build própria via EAS)
- [ ] Biblioteca de ilustração para estados vazios
- [ ] Logo na camada de build: uma versão personalizada configura ícone e splash por env, mas o `logoUrl` só vem do runtime — um logo embutido precisaria de asset no bundle, não de URL. Enquanto isso, a versão personalizada mostra a marca da Orbien até o primeiro `GET /settings` (a cor, essa sim, já vem da build)
- [ ] Renomear `branding_configs.secondary_color` para `accent_color`: a coluna do tenant é anterior ao design system. A da congregação já nasceu `accent_color`, e a API expõe as duas como `accent_color` — o desalinhamento é só no nome da coluna do tenant, e sair dele é migration própria
- [ ] Bottom sheet e FAB (§7) ainda não têm uso no app — os módulos que os pedem (cadastro rápido de visitante) não existem aqui

---

## 10. Onde cada regra está implementada

O guia é a regra; esta seção é o mapa. Mexer em uma coluna sem olhar a outra é o que faz o app e o guia divergirem.

| Guia | Implementação |
|---|---|
| §1 tokens de cor, fonte, radius | `src/lib/theme/tokens.ts` (`brand`, `fontFamily`, `radius`) |
| §1 carregamento de fonte | `src/lib/theme/fonts.ts` (`useAppFonts`), gate do splash em `src/app/_layout.tsx` |
| §2 escala tipográfica | `tokens.ts` → `typography` |
| §3 espaçamento, alvo de toque, padding de tela | `tokens.ts` → `spacing`, `touchTarget`, `screenPadding`; `src/components/Screen.tsx` |
| §4 sombra por plataforma e por modo | `tokens.ts` → `shadows(isDark)`, exposto como `useTheme().shadow` |
| §5 iconografia | `src/lib/theme/icons.ts` (lista fechada), `tokens.ts` → `iconSize`, `ICON_STROKE_WIDTH` |
| §6 cadeia de resolução da paleta | `src/lib/theme/brand-theme.ts` (camadas), `app.config.js` (camada de build) |
| §6 tema por tenant | `src/lib/theme/theme-provider.tsx` (`primaryColor`, `accentColor`, `accentReadable`, `logoUrl`, `appName`) |
| §6/§8 contraste medido (`textOnBrand`, `accentReadable`) | `src/lib/theme/color.ts` |
| §6 validação AA no cadastro | `apps/api/src/common/validators/brand-color.validator.ts`, `apps/web/src/app/(admin)/configuracoes/page.tsx` |
| §7 botão | `src/components/AppButton.tsx` |
| §7 tab bar | `src/app/(tabs)/_layout.tsx` |
| §7 header de stack (só no detalhe) | `src/app/_layout.tsx` |
| §7 marca em tela | `src/components/BrandHeader.tsx`, `BrandLogo.tsx`, `BrandMark.tsx` |
| §7 card de lista | `src/components/Card.tsx` + `Avatar.tsx` / `DateBlock.tsx` |
| §7 badge de status | `src/components/Badge.tsx` |
| §8 papéis semânticos e modo claro/escuro | `tokens.ts` → `palettes`; resolução em `theme-provider.tsx`; override manual em `src/app/(tabs)/perfil.tsx` |
| §8 status bar dinâmica | `src/app/_layout.tsx` |

### Por que não `tailwind.config.js` / NativeWind

O §1 do guia foi escrito como um `tailwind.config.js`. Neste app os mesmos valores vivem em `src/lib/theme/tokens.ts`, em TypeScript, por duas razões que vêm do próprio guia:

1. O §6 determina que a cor do tenant seja resolvida **em runtime**, pelo theme context, e não pelo Tailwind config — que é build time. Ou seja: justamente as cores que mais aparecem em tela (CTA, ícone ativo, destaque) nunca poderiam sair de lá.
2. O §8 recomenda "resolver o token semântico já correto no `ThemeContext` para não espalhar condicional de modo por toda a tela". Com (1) e (2), o que sobraria para o Tailwind seriam as primitivas — que é exatamente o que `tokens.ts` declara, com tipo e com o `Palette` semântico em cima.

Adotar NativeWind depois continua possível e não invalida nada aqui: os tokens já estão num módulo só, no formato que um `theme.extend` consome. O que **não** deve acontecer é existir um `tailwind.config.js` de fachada, sem NativeWind instalado, como terceira fonte de verdade de cor ao lado deste arquivo e do CSS do web.

### Desvios conscientes

- **Tab bar ativa (§5)** usa `accentReadable`, não o `accentColor` cru. Com a paleta da plataforma isso resolve para o navy (~8.6:1 sobre branco), porque o teal dá ~2.4:1 e o label tem 11px — abaixo do AA que o §8 exige. Uma versão personalizada com accent de contraste próprio passa a usá-lo sem tocar em tela nenhuma. Não é mais um desvio codificado à mão: é a regra dos dois parágrafos do guia aplicada junto.
- **"Powered by Orbien" (§6)** usa o token `caption` (11px), não 10px: o §2 fixa 11px como mínimo absoluto de acessibilidade. Aparece na tela de Perfil, condicionado a `plan !== "premium"` (o plano vem do JWT). Não aparece no login, onde ainda não há token para saber o plano.
- **Fonte (§1)** não bloqueia para sempre: se o carregamento falhar, `useAppFonts` libera o render com a fonte do sistema. Travar o app no splash por um asset que nunca vai resolver é pior que a fonte errada.

---

*Orbien — Style Guide Mobile · deriva de `orbien-brand-guidelines.md` v1.0*
