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
    delete process.env.ORBIEN_PRIMARY_COLOR;
    delete process.env.ORBIEN_ACCENT_COLOR;
    delete process.env.ORBIEN_SPLASH_BACKGROUND;
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

  // Camada de build da paleta (§6 do STYLE-GUIDE.md): é o que permite uma
  // versão personalizada já abrir na cor da igreja antes do login, quando
  // ainda não há token para chamar GET /settings.
  describe("paleta de build (brandTheme)", () => {
    function splashBackgroundOf(resolved) {
      const splashPlugin = resolved.plugins.find(
        (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
      );
      return splashPlugin[1].backgroundColor;
    }

    it("versão genérica: cai na paleta da plataforma, e a splash segue a primária", () => {
      const resolved = loadConfig()({ config: {} });

      expect(resolved.extra.brandTheme).toEqual({
        primaryColor: "#1E3A7B",
        accentColor: "#00B8A2",
      });
      expect(splashBackgroundOf(resolved)).toBe("#1E3A7B");
    });

    it("versão personalizada: lê a paleta de env e a splash acompanha a primária", () => {
      process.env.ORBIEN_PRIMARY_COLOR = "#7C2D12";
      process.env.ORBIEN_ACCENT_COLOR = "#F59E0B";

      const resolved = loadConfig()({ config: {} });

      expect(resolved.extra.brandTheme).toEqual({
        primaryColor: "#7C2D12",
        accentColor: "#F59E0B",
      });
      // Setar a paleta já acerta a splash: sem env extra dizendo o mesmo.
      expect(splashBackgroundOf(resolved)).toBe("#7C2D12");
    });

    it("ORBIEN_SPLASH_BACKGROUND ainda vence, para a splash divergir do CTA de propósito", () => {
      process.env.ORBIEN_PRIMARY_COLOR = "#7C2D12";
      process.env.ORBIEN_SPLASH_BACKGROUND = "#000000";

      const resolved = loadConfig()({ config: {} });

      expect(resolved.extra.brandTheme.primaryColor).toBe("#7C2D12");
      expect(splashBackgroundOf(resolved)).toBe("#000000");
    });
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

// O nome que a tela de login desenha (src/app/login.tsx) é
// `useTheme().appName` — sem sessão, `Constants.expoConfig.name`
// (PLATFORM_THEME em src/lib/theme/brand-theme.ts), que app.config.js
// resolve de ORBIEN_APP_NAME. Numa build de verdade quem seta essa env é o
// `env` do profile em eas.json, não o default deste arquivo: um erro de
// digitação lá não quebra teste nem lint — sai impresso na primeira tela do
// app. Estes testes fecham essa brecha, amarrando a identidade dos profiles
// à mesma que app.config.js resolve sem env nenhuma.
describe("eas.json", () => {
  const IDENTITY_ENVS = [
    "ORBIEN_APP_NAME",
    "ORBIEN_APP_SLUG",
    "ORBIEN_APP_SCHEME",
    "ORBIEN_BUNDLE_ID",
  ];

  function easJson() {
    return require("./eas.json");
  }

  it("o profile generic declara a mesma identidade Orbien que app.config.js resolve sem env", () => {
    const defaults = loadConfig()({ config: {} });
    const genericEnv = easJson().build.generic.env;

    expect(genericEnv.ORBIEN_APP_NAME).toBe(defaults.name);
    expect(genericEnv.ORBIEN_APP_SLUG).toBe(defaults.slug);
    expect(genericEnv.ORBIEN_APP_SCHEME).toBe(defaults.scheme);
    expect(genericEnv.ORBIEN_BUNDLE_ID).toBe(defaults.ios.bundleIdentifier);
    expect(genericEnv.ORBIEN_BUNDLE_ID).toBe(defaults.android.package);
  });

  // `generic` é a única identidade de app do v1 (AD-001): todo profile de
  // distribuição herda dele e nenhum redefine nome, slug, scheme ou bundle
  // id por conta própria — quem quiser uma identidade nova cria um profile
  // de tenant, não sobrescreve a genérica.
  //
  // A lista sai do próprio eas.json em vez de ser escrita aqui: um profile
  // novo entra coberto no dia em que é criado, que é justamente quando a
  // identidade tem chance de divergir sem ninguém notar.
  it.each(Object.keys(require("./eas.json").build).filter((name) => name !== "generic"))(
    "o profile %s herda a identidade do generic sem redefini-la",
    (profileName) => {
      const profile = easJson().build[profileName];

      expect(profile.extends).toBe("generic");
      for (const identityEnv of IDENTITY_ENVS) {
        expect(profile.env ?? {}).not.toHaveProperty(identityEnv);
      }
    },
  );
});
