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

  return {
    ...config,
    name: appName,
    slug,
    scheme,
    ios: {
      ...config.ios,
      bundleIdentifier: bundleId,
    },
    android: {
      ...config.android,
      package: bundleId,
    },
    extra: {
      ...config.extra,
      oneSignalAppId,
      apiUrl,
    },
  };
};
