// Testes derivados da spec MOB-12 (AC 1/2/4) e do Done-when de T5:
// - AC 2: sem env de tenant setada, resolve para a identidade padrão Orbien.
// - AC 4: identidade lida sempre da config resolvida (extra), nunca de
//   literal hardcoded fora de app.config.js/eas.json — este teste é o que
//   fixa o contrato de quais chaves `extra` expõe para o resto do app ler.

const ORIGINAL_ENV = { ...process.env };

function loadConfig() {
  // require() (não import) de propósito: precisa recarregar o módulo a cada
  // teste para reagir às mudanças de process.env feitas via
  // jest.resetModules().
  return require("./app.config.js");
}

describe("app.config.js", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ORBIEN_APP_NAME;
    delete process.env.ORBIEN_APP_SLUG;
    delete process.env.ORBIEN_APP_SCHEME;
    delete process.env.ORBIEN_BUNDLE_ID;
    delete process.env.ORBIEN_ONESIGNAL_APP_ID;
    delete process.env.EAS_BUILD_PROFILE;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("resolve para a identidade padrão Orbien quando nenhuma env de tenant está setada (AC 2)", () => {
    const withDefaults = loadConfig();

    const resolved = withDefaults({ config: {} });

    expect(resolved.name).toBe("Orbien");
    expect(resolved.slug).toBe("orbien");
    expect(resolved.scheme).toBe("orbien");
    expect(resolved.ios.bundleIdentifier).toBe("com.orbien.app");
    expect(resolved.android.package).toBe("com.orbien.app");
    expect(resolved.extra.oneSignalAppId).toBe("REPLACE_WITH_ONESIGNAL_APP_ID");
  });

  it("lê a identidade de env quando setada, sem exigir literal no código (AC 1/4)", () => {
    process.env.ORBIEN_APP_NAME = "Igreja Teste";
    process.env.ORBIEN_APP_SLUG = "igreja-teste";
    process.env.ORBIEN_APP_SCHEME = "igrejateste";
    process.env.ORBIEN_BUNDLE_ID = "com.igrejateste.app";
    process.env.ORBIEN_ONESIGNAL_APP_ID = "11111111-1111-1111-1111-111111111111";

    const withEnv = loadConfig();
    const resolved = withEnv({ config: {} });

    expect(resolved.name).toBe("Igreja Teste");
    expect(resolved.slug).toBe("igreja-teste");
    expect(resolved.scheme).toBe("igrejateste");
    expect(resolved.ios.bundleIdentifier).toBe("com.igrejateste.app");
    expect(resolved.android.package).toBe("com.igrejateste.app");
    expect(resolved.extra.oneSignalAppId).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("resolve o plugin do OneSignal em modo development por padrão (fora de EAS)", () => {
    delete process.env.EAS_BUILD_PROFILE;
    const withDefaults = loadConfig();

    const resolved = withDefaults({ config: {} });

    expect(resolved.plugins[0]).toEqual(["onesignal-expo-plugin", { mode: "development" }]);
  });

  it("resolve o plugin do OneSignal em modo production quando EAS_BUILD_PROFILE=production", () => {
    process.env.EAS_BUILD_PROFILE = "production";
    const withProdProfile = loadConfig();

    const resolved = withProdProfile({ config: {} });

    expect(resolved.plugins[0]).toEqual(["onesignal-expo-plugin", { mode: "production" }]);
  });

  it("preserva o restante da config recebida (spread de config), sem sobrescrever campos não relacionados a identidade", () => {
    const withDefaults = loadConfig();

    const resolved = withDefaults({
      config: { orientation: "portrait", version: "1.0.0" },
    });

    expect(resolved.orientation).toBe("portrait");
    expect(resolved.version).toBe("1.0.0");
  });
});
