# orbien-mobile

App nativo (Expo + React Native + TypeScript) do Orbien. Ver
`.specs/features/app-mobile/` na raiz do monorepo para spec/design/tasks.

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
default Orbien se nenhuma estiver setada.

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
