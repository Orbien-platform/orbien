// app.config.js dinâmico (MOB-12, AD-001 em .specs/STATE.md): identidade do
// app (nome, ícone, bundle id/package, scheme, app id do OneSignal) resolve
// a partir de env/eas.json `extra`, nunca de literal em código-fonte
// compartilhado. Sem nenhuma env de tenant setada (perfil `generic` do v1),
// resolve para a identidade padrão Orbien — ver spec.md, MOB-12 AC 2.
//
// Função pura de `process.env`: nenhuma chamada de rede em build time (Tech
// Decisions do design.md).

const DEFAULT_APP_NAME = "Orbien";
const DEFAULT_SLUG = "orbien";
const DEFAULT_SCHEME = "orbien";
const DEFAULT_BUNDLE_ID = "com.orbien.app";
// Placeholder: o app id real do OneSignal do profile `generic` é segredo de
// ambiente (EAS secret/env), nunca literal aqui — ver README (seção "Build
// profiles", T6) para onde configurá-lo por profile.
const DEFAULT_ONESIGNAL_APP_ID = "REPLACE_WITH_ONESIGNAL_APP_ID";
// Identidade visual: os assets em `assets/` são a marca Orbien (o mesmo
// desenho do BrandMark de apps/site/src/components/layout/Header.tsx —
// órbita, núcleo e satélite). Um profile de tenant sobrescreve pelos
// caminhos abaixo, como faz com nome e bundle id.
const DEFAULT_ICON = "./assets/icon.png";
const DEFAULT_ADAPTIVE_ICON_FOREGROUND = "./assets/android-icon-foreground.png";
const DEFAULT_ADAPTIVE_ICON_BACKGROUND = "./assets/android-icon-background.png";
const DEFAULT_ADAPTIVE_ICON_MONOCHROME = "./assets/android-icon-monochrome.png";
// Splash: só o anel e o núcleo da marca. O satélite entra como camada
// animada em JS (src/lib/splash/animated-splash.tsx), que continua de onde
// a splash nativa parou — por isso o PNG nativo não pode trazê-lo.
const DEFAULT_SPLASH_ICON = "./assets/splash-icon.png";
const DEFAULT_SPLASH_BACKGROUND = "#1E3A7B";
// Largura da marca na splash, em dp. O overlay animado usa o mesmo número
// (SPLASH_ICON_WIDTH em src/lib/splash/animated-splash.tsx) para a troca do
// nativo para o JS não mudar o tamanho do logo na tela.
const SPLASH_ICON_WIDTH = 200;
// SPEC_DEVIATION (T9, MOB-01): não é campo de identidade (MOB-12) — é a URL
// da API que o ApiClient (apps/mobile/src/lib/api/client.ts) lê de
// `Constants.expoConfig.extra.apiUrl`, nunca hardcoded (design.md,
// Components > ApiClient). Default aponta para a API local (mesma porta
// default de apps/api/src/main.ts).
const DEFAULT_API_URL = "http://localhost:3000";

/** @param {{ config: import('expo/config').ExpoConfig }} params */
module.exports = ({ config }) => {
  const appName = process.env.ORBIEN_APP_NAME || DEFAULT_APP_NAME;
  const slug = process.env.ORBIEN_APP_SLUG || DEFAULT_SLUG;
  const scheme = process.env.ORBIEN_APP_SCHEME || DEFAULT_SCHEME;
  const bundleId = process.env.ORBIEN_BUNDLE_ID || DEFAULT_BUNDLE_ID;
  const oneSignalAppId =
    process.env.ORBIEN_ONESIGNAL_APP_ID || DEFAULT_ONESIGNAL_APP_ID;
  const apiUrl = process.env.ORBIEN_API_URL || DEFAULT_API_URL;
  const icon = process.env.ORBIEN_APP_ICON || DEFAULT_ICON;
  const splashIcon = process.env.ORBIEN_SPLASH_ICON || DEFAULT_SPLASH_ICON;
  const splashBackground =
    process.env.ORBIEN_SPLASH_BACKGROUND || DEFAULT_SPLASH_BACKGROUND;

  // Modo do plugin (ambiente de APNs, iOS) — não é campo de identidade
  // (MOB-12): EAS injeta EAS_BUILD_PROFILE automaticamente em todo build,
  // sem precisar de env nova por profile em eas.json (design.md, Rodada 4,
  // Tech Decisions).
  const oneSignalPluginMode =
    process.env.EAS_BUILD_PROFILE === "production" ? "production" : "development";

  return {
    ...config,
    name: appName,
    slug,
    scheme,
    icon,
    ios: {
      ...config.ios,
      bundleIdentifier: bundleId,
    },
    android: {
      ...config.android,
      package: bundleId,
      adaptiveIcon: {
        ...config.android?.adaptiveIcon,
        foregroundImage:
          process.env.ORBIEN_ADAPTIVE_ICON_FOREGROUND || DEFAULT_ADAPTIVE_ICON_FOREGROUND,
        backgroundImage:
          process.env.ORBIEN_ADAPTIVE_ICON_BACKGROUND || DEFAULT_ADAPTIVE_ICON_BACKGROUND,
        monochromeImage:
          process.env.ORBIEN_ADAPTIVE_ICON_MONOCHROME || DEFAULT_ADAPTIVE_ICON_MONOCHROME,
      },
    },
    // onesignal-expo-plugin precisa ser o primeiro do array — exigência do
    // próprio plugin (evita erro de header nativo "OneSignal/OneSignal.h
    // not found"), ver design.md Rodada 4 (MOB-07).
    plugins: [
      ["onesignal-expo-plugin", { mode: oneSignalPluginMode }],
      [
        "expo-splash-screen",
        {
          image: splashIcon,
          backgroundColor: splashBackground,
          imageWidth: SPLASH_ICON_WIDTH,
          resizeMode: "contain",
        },
      ],
      ...(config.plugins ?? []),
    ],
    extra: {
      ...config.extra,
      oneSignalAppId,
      apiUrl,
      // Lido por src/lib/splash/animated-splash.tsx para casar com a splash
      // nativa configurada acima.
      splashBackground,
      splashIconWidth: SPLASH_ICON_WIDTH,
      eas: {
        // Vínculo do workspace ao projeto no EAS (fernandovargas/orbien).
        // Config dinâmica não recebe isso automaticamente do `eas init` —
        // ver https://docs.expo.dev/workflow/configuration/#dynamic-configuration-with-appconfigjs
        projectId: "01382e40-702e-4eb0-b46f-c05723f32575",
      },
    },
  };
};
