// Cadeia de resolução da paleta (src/lib/theme/brand-theme.ts, §6 do
// STYLE-GUIDE.md). É o que faz a mesma base servir à versão genérica e às
// personalizadas: só muda quais camadas estão preenchidas.
//
// `expo-constants` é mockado por teste porque a camada de build lê dele —
// é justamente a diferença entre uma build genérica e uma personalizada.
const mockExpoConfig = jest.fn();
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockExpoConfig();
    },
  },
}));

import { brand } from "./tokens";

const GENERIC_BUILD = {
  name: "Orbien",
  extra: { brandTheme: { primaryColor: brand.navy, accentColor: brand.teal } },
};

// Uma build própria de tenant: nome e paleta vindos das envs que
// app.config.js lê (ORBIEN_APP_NAME, ORBIEN_PRIMARY_COLOR, ORBIEN_ACCENT_COLOR).
const CUSTOM_BUILD = {
  name: "Igreja Videira",
  extra: { brandTheme: { primaryColor: "#7C2D12", accentColor: "#F59E0B" } },
};

function load() {
  // resetModules por teste: `PLATFORM_THEME` lê `Constants.expoConfig` no
  // escopo do módulo (é o nome do app), então o módulo precisa recarregar
  // depois de o mock mudar.
  jest.resetModules();
  return require("./brand-theme") as typeof import("./brand-theme");
}

describe("versão genérica — paleta chega em runtime", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExpoConfig.mockReturnValue(GENERIC_BUILD);
  });

  it("sem cache nem rede, usa a paleta da plataforma", () => {
    const { buildTimeLayer, resolveBrandTheme } = load();

    const theme = resolveBrandTheme(buildTimeLayer(), {}, {});

    expect(theme.primaryColor).toBe(brand.navy);
    expect(theme.accentColor).toBe(brand.teal);
    expect(theme.appName).toBe("Orbien");
    expect(theme.logoUrl).toBeNull();
  });

  it("o branding do tenant vence a plataforma", () => {
    const { brandingLayer, buildTimeLayer, resolveBrandTheme } = load();

    const theme = resolveBrandTheme(
      buildTimeLayer(),
      {},
      brandingLayer({
        app_name: "Igreja Central",
        primary_color: "#0F766E",
        logo_url: "https://cdn.example/logo.png",
        splash_url: null,
      }),
    );

    expect(theme.primaryColor).toBe("#0F766E");
    expect(theme.appName).toBe("Igreja Central");
    expect(theme.logoUrl).toBe("https://cdn.example/logo.png");
    // A API não expõe accent: continua o da plataforma (§9 do guia).
    expect(theme.accentColor).toBe(brand.teal);
  });

  it("o runtime vence o cache — troca de cor no admin aparece sem novo boot", () => {
    const { brandingLayer, buildTimeLayer, resolveBrandTheme } = load();

    const cached = brandingLayer({
      app_name: "Igreja Central",
      primary_color: "#0F766E",
      logo_url: null,
      splash_url: null,
    });
    const runtime = brandingLayer({
      app_name: "Igreja Central",
      primary_color: "#B91C1C",
      logo_url: null,
      splash_url: null,
    });

    expect(resolveBrandTheme(buildTimeLayer(), cached, runtime).primaryColor).toBe("#B91C1C");
  });

  it("campo nulo no branding não apaga a camada de baixo (AC 2)", () => {
    const { brandingLayer, buildTimeLayer, resolveBrandTheme } = load();

    const cached = brandingLayer({
      app_name: "Igreja Central",
      primary_color: "#0F766E",
      logo_url: "https://cdn.example/logo.png",
      splash_url: null,
    });
    // Tenant sem branding customizado: todos os campos nulos.
    const runtime = brandingLayer({
      app_name: null,
      primary_color: null,
      logo_url: null,
      splash_url: null,
    });

    const theme = resolveBrandTheme(buildTimeLayer(), cached, runtime);

    expect(theme.primaryColor).toBe("#0F766E");
    expect(theme.appName).toBe("Igreja Central");
    expect(theme.logoUrl).toBe("https://cdn.example/logo.png");
  });

  it("cor inválida da API é ignorada, sem quebrar a tela", () => {
    const { brandingLayer, buildTimeLayer, resolveBrandTheme } = load();

    const theme = resolveBrandTheme(
      buildTimeLayer(),
      {},
      brandingLayer({
        app_name: "Igreja Central",
        // valor que a plataforma aceitaria mas de que não se mede
        // contraste — e do qual, portanto, não se deriva textOnBrand
        primary_color: "rgb(15, 118, 110)",
        logo_url: null,
        splash_url: null,
      }),
    );

    expect(theme.primaryColor).toBe(brand.navy);
    // o resto do branding continua valendo
    expect(theme.appName).toBe("Igreja Central");
  });
});

describe("versão personalizada — paleta embutida na build", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExpoConfig.mockReturnValue(CUSTOM_BUILD);
  });

  it("antes do login, a paleta da build já vale (splash e tela de login)", () => {
    const { buildTimeLayer, resolveBrandTheme } = load();

    const theme = resolveBrandTheme(buildTimeLayer(), {}, {});

    expect(theme.primaryColor).toBe("#7C2D12");
    expect(theme.accentColor).toBe("#F59E0B");
    expect(theme.appName).toBe("Igreja Videira");
  });

  it("o runtime ainda pode sobrescrever a paleta da build", () => {
    const { brandingLayer, buildTimeLayer, resolveBrandTheme } = load();

    const theme = resolveBrandTheme(
      buildTimeLayer(),
      {},
      brandingLayer({
        app_name: null,
        primary_color: "#1D4ED8",
        logo_url: null,
        splash_url: null,
      }),
    );

    expect(theme.primaryColor).toBe("#1D4ED8");
    // accent não vem da API: o da build permanece
    expect(theme.accentColor).toBe("#F59E0B");
    // app_name nulo não apaga o nome da build
    expect(theme.appName).toBe("Igreja Videira");
  });
});

describe("build com paleta malformada", () => {
  it("extra sem brandTheme resolve para a plataforma, sem lançar", () => {
    // É o caso de um app.config antigo, ou do mock de expo-constants em
    // teste de navegação.
    mockExpoConfig.mockReturnValue({ name: "Orbien", extra: { apiUrl: "x" } });
    const { buildTimeLayer, resolveBrandTheme } = load();

    expect(buildTimeLayer()).toEqual({ primaryColor: undefined, accentColor: undefined });
    expect(resolveBrandTheme(buildTimeLayer()).primaryColor).toBe(brand.navy);
  });

  it("expoConfig ausente resolve para a plataforma, com appName vazio", () => {
    mockExpoConfig.mockReturnValue(undefined);
    const { PLATFORM_THEME, buildTimeLayer, resolveBrandTheme } = load();

    expect(PLATFORM_THEME.appName).toBe("");
    expect(resolveBrandTheme(buildTimeLayer()).primaryColor).toBe(brand.navy);
  });

  it("env com cor inválida não vaza para a paleta", () => {
    mockExpoConfig.mockReturnValue({
      name: "Igreja Videira",
      extra: { brandTheme: { primaryColor: "marrom", accentColor: "#F59E0B" } },
    });
    const { buildTimeLayer, resolveBrandTheme } = load();

    const theme = resolveBrandTheme(buildTimeLayer());

    expect(theme.primaryColor).toBe(brand.navy);
    expect(theme.accentColor).toBe("#F59E0B");
  });
});
