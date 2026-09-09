# orbien-mobile

App nativo (Expo + React Native + TypeScript) do Orbien. Ver
`.specs/features/app-mobile/` na raiz do monorepo para spec/design/tasks.

A base visual é o [`STYLE-GUIDE.md`](./STYLE-GUIDE.md) deste diretório —
tokens de cor e tipografia (os mesmos de `apps/web`), alvo de toque, sombra
por plataforma, tema por tenant e modo claro/escuro. A §10 dele mapeia cada
regra ao arquivo que a implementa; o resumo operacional está em `AGENTS.md`.

## Design system

| Camada | Onde |
|---|---|
| Tokens (cor, tipografia, espaço, raio, sombra, ícone) | `src/lib/theme/tokens.ts` |
| Papel semântico + tema do tenant + claro/escuro | `src/lib/theme/theme-provider.tsx` (`useTheme()`) |
| Fontes da marca (DM Sans / DM Mono) | `src/lib/theme/fonts.ts` |
| Ícones (lista fechada, lucide) | `src/lib/theme/icons.ts` |
| Componentes (botão, card, badge, input, estado vazio…) | `src/components/` |

Dois imports que parecem inofensivos e não são, os dois medidos no
`expo export`:

- `lucide-react-native` (barril) reexporta ~1600 ícones — importe sempre
  pelo subpath, o que `src/lib/theme/icons.ts` já faz. Pelo barril, um único
  teste de tela passou de 1,7s para 69s.
- `@expo-google-fonts/dm-sans` (barril) faz `require` dos 18 pesos e
  itálicos (~1MB de `.ttf`) — `src/lib/theme/fonts.ts` importa peso a peso e
  empacota só os 6 que a escala usa (322KB).

## Rodar localmente

A partir da raiz do monorepo (instale sempre com `npm install` na raiz —
não há lockfile dentro de `apps/mobile`):

```sh
npm run dev:mobile
# equivalente a: turbo run dev --filter=orbien-mobile (expo start)
```

Ou direto no workspace:

```sh
npm run dev -w orbien-mobile
```

Abra no Expo Go (dispositivo físico) ou num simulador iOS/Android a partir
do QR code/menu que o Metro bundler mostra.

## Build profiles (EAS)

`eas.json` define três profiles de **distribuição** — `development`,
`preview`, `production` — todos herdando (`extends`) do profile
`generic`, que é a única **identidade de app** que existe no v1 (Starter
multi-tenant, ver `.specs/STATE.md` AD-001). Nenhum deles é
white-label: o nome/ícone/bundle id que cada build recebe vêm de
`app.config.js`, que lê as envs do próprio `eas.json` (`ORBIEN_APP_NAME`,
`ORBIEN_APP_SLUG`, `ORBIEN_APP_SCHEME`, `ORBIEN_BUNDLE_ID`) ou cai no
default Orbien se nenhuma estiver setada. O mesmo vale para os assets:
`ORBIEN_APP_ICON`, `ORBIEN_ADAPTIVE_ICON_FOREGROUND`,
`ORBIEN_ADAPTIVE_ICON_BACKGROUND`, `ORBIEN_ADAPTIVE_ICON_MONOCHROME`,
`ORBIEN_SPLASH_ICON` e `ORBIEN_SPLASH_BACKGROUND`.

```sh
npx eas build --profile development --platform ios
npx eas build --profile preview --platform android
npx eas build --profile production --platform all
```

O CI (`.github/workflows/ci.yml`, job `mobile-eas-build`) dispara os builds
`preview` (Android) e `preview-ios-simulator` (iOS) automaticamente a cada
push na `main` que altere `apps/mobile/**`, depois que lint/build/test
passarem. `ORBIEN_API_URL` nesses dois profiles aponta para a API publicada
no Render (`https://orbien-api.onrender.com/api`), não para `localhost`.

### Ícone e splash

Os PNGs de `assets/` são a marca Orbien — a mesma órbita/núcleo/satélite do
`BrandMark` de `apps/site/src/components/layout/Header.tsx`, nas cores navy
`#1E3A7B` e teal `#00B8A2`. Eles não são desenhados à mão: saem de SVG
rasterizado, e a geometria está documentada em
`src/lib/splash/animated-splash.tsx` (as constantes em unidades do viewBox
22×22 do site).

A splash tem duas camadas que precisam combinar:

- a **nativa**, montada pelo plugin `expo-splash-screen` em `app.config.js`
  a partir de `assets/splash-icon.png` — só o anel e o núcleo, com
  `imageWidth: 200`;
- a **animada** (`src/lib/splash/animated-splash.tsx`), que desenha o mesmo
  PNG no mesmo tamanho e acrescenta o satélite percorrendo a órbita.

O layout raiz segura a nativa com `preventAutoHideAsync()` em escopo de
módulo e só chama `hideAsync()` no `onLayout` da animada — quando o primeiro
frame do JS já existe. Se mexer no `imageWidth`, na cobertura da marca
dentro do PNG ou no `backgroundColor`, os dois lados têm que mudar juntos,
senão a troca "pula". `splashIconWidth`/`splashBackground` em
`extra` existem exatamente para a camada JS ler o que a nativa recebeu.

### Portão de bundle no `build`

`npm run build` aqui é `tsc --noEmit && expo export --platform android`, e
o `expo export` não é redundante com o `tsc`: ele é o único portão que monta
o **grafo de rotas** do expo-router. O `require.context` em
`node_modules/expo-router/_ctx.android.js` varre a raiz de rotas com o filtro
`/.*\.[tj]sx?$/` e só exclui `+api`/`+html`/`+middleware` — qualquer arquivo
`.tsx` ali dentro entra no bundle como se fosse rota. Foi assim que
`src/app/_layout.test.tsx` arrastou o `@testing-library/react-native` (que faz
`require("console")`, módulo do Node sem resolução no Metro) e quebrou o bundle
JS dos builds de preview de 2026-09-08, com jest, tsc e eslint todos verdes —
nenhum dos três monta esse grafo. É por isso que os testes de rota vivem em
`src/__tests__/app/`, não ao lado das rotas.

Roda em todo PR pelo step "Build dos 4 apps" (`turbo run build`), custa ~10s
e derruba a mudança antes de gastar minuto de fila da EAS. `dist/` já está no
`.gitignore` e já é output declarado da task `build` no `turbo.json`, então
entra no cache do Turbo.

Só Android de propósito: não existe arquivo `.ios.*`/`.android.*`/`.native.*`
no `src`, então o grafo é único e uma plataforma basta. Se entrar arquivo
específico de plataforma, acrescente o export de `ios` ao script.

### iOS: Simulador vs. dispositivo físico

`preview-ios-simulator` (`ios.simulator: true`) gera um build **não
assinado**, que só roda no Simulador do Xcode — não precisa de conta Apple
Developer nem de credencial nenhuma, por isso é o que o CI dispara hoje.
Rodar em iPhone físico (ad-hoc, via `preview`, ou TestFlight, via
`production`) exige credenciais de assinatura da Apple que ainda não estão
configuradas neste projeto: conta Apple Developer Program, o(s)
dispositivo(s) de teste registrado(s) (`eas device:create`) e, para builds
não-interativos como o do CI, uma App Store Connect API Key cadastrada via
`eas credentials`. Nenhum desses dados fica no repositório.

`ORBIEN_ONESIGNAL_APP_ID` não está setado em nenhum profile hoje — sem
ele, `app.config.js` resolve para um placeholder
(`REPLACE_WITH_ONESIGNAL_APP_ID`). Antes de um build ir para uso real
(TestFlight/Play Console além de dev interno), configure o app id real
do OneSignal como secret do EAS (`eas secret:create`) e referencie-o via
`env` no profile correspondente.

### Onde entraria um profile de tenant (Premium, futuro)

A variante white-label por tenant (ADR-005, fora do escopo desta rodada
— ver `spec.md`, seção Out of Scope) entraria como um novo profile em
`eas.json`, por exemplo `whitelabel-<tenant>`, com seu próprio
`ORBIEN_APP_NAME`/`ORBIEN_BUNDLE_ID`/`ORBIEN_ONESIGNAL_APP_ID` em `env` —
sem herdar de `generic` (cada tenant tem sua própria identidade). Nenhum
arquivo de código-fonte compartilhado precisaria mudar para isso: é
exatamente o que `app.config.js` já garante (spec MOB-12, AC 3).
