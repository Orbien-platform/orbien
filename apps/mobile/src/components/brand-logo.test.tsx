// Identidade em tela (o "quadrado preto" do topo da área logada): logo do
// tenant quando existe, marca da Orbien quando não existe — e também
// quando a URL do tenant não carrega.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockUseTheme = jest.fn();
jest.mock("../lib/theme/theme-provider", () => ({
  useTheme: () => mockUseTheme(),
}));

import { BrandHeader } from "./BrandHeader";
import { BrandLogo } from "./BrandLogo";

function theme(overrides: Record<string, unknown> = {}) {
  return {
    appName: "Orbien",
    logoUrl: null,
    primaryColor: "#1E3A7B",
    accentColor: "#00B8A2",
    isDark: false,
    colors: { textPrimary: "#12100E" },
    ...overrides,
  };
}

describe("BrandLogo", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sem logo do tenant: desenha a marca da plataforma", async () => {
    mockUseTheme.mockReturnValue(theme());

    await act(async () => {
      render(<BrandLogo />);
    });

    expect(screen.getByTestId("brand-mark")).toBeTruthy();
    expect(screen.queryByTestId("brand-logo")).toBeNull();
  });

  it("com logo do tenant: desenha o logo", async () => {
    mockUseTheme.mockReturnValue(theme({ logoUrl: "https://igreja.example/logo.png" }));

    await act(async () => {
      render(<BrandLogo />);
    });

    expect(screen.getByTestId("brand-logo").props.source.uri).toBe(
      "https://igreja.example/logo.png",
    );
  });

  it("logo do tenant que não carrega: cai na marca, não deixa buraco", async () => {
    mockUseTheme.mockReturnValue(theme({ logoUrl: "https://igreja.example/quebrado.png" }));

    await act(async () => {
      render(<BrandLogo />);
    });

    await act(async () => {
      fireEvent(screen.getByTestId("brand-logo"), "error");
    });

    expect(screen.getByTestId("brand-mark")).toBeTruthy();
    expect(screen.queryByTestId("brand-logo")).toBeNull();
  });
});

describe("BrandHeader", () => {
  beforeEach(() => jest.clearAllMocks());

  it("mostra o nome do tema, nunca um literal", async () => {
    mockUseTheme.mockReturnValue(theme({ appName: "Igreja Teste" }));

    await act(async () => {
      render(<BrandHeader />);
    });

    expect(screen.getByTestId("brand-header-name").props.children).toBe("Igreja Teste");
  });
});
