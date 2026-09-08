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
