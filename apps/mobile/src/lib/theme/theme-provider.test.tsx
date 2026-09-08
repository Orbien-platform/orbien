// Testes derivados do Done-when de T15 (tasks.md) e dos ACs da história
// "Tema por tenant (white-label dinâmico)" em spec.md:
// - AC 3: cache em AsyncStorage é aplicado antes do GET /settings resolver
// - AC 2: branding nulo/sem customização -> tema default, sem erro visível
// - AC 2: GET /settings falha (erro de rede) -> tema cacheado permanece
import { Text } from "react-native";
import { act, render, screen, waitFor } from "@testing-library/react-native";

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: (...args: unknown[]) => mockSetItem(...args),
}));

const mockGet = jest.fn();
jest.mock("../api/client", () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args) },
}));

const mockUseAuth = jest.fn();
jest.mock("../auth/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

import { ThemeProvider, useTheme, DEFAULT_THEME } from "./theme-provider";

function ThemeProbe() {
  const theme = useTheme();
  return (
    <>
      <Text testID="primaryColor">{theme.primaryColor}</Text>
      <Text testID="logoUrl">{theme.logoUrl ?? "sem-logo"}</Text>
      <Text testID="appName">{theme.appName}</Text>
    </>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      session: { accessToken: "token-abc", refreshToken: "r", accessTokenExpiresAt: Date.now() + 900_000 },
    });
  });

  it("AC 3: reaplica o branding cacheado do AsyncStorage antes do GET /settings resolver", async () => {
    mockGetItem.mockResolvedValue(
      JSON.stringify({
        app_name: "Igreja Cache",
        primary_color: "#00ff00",
        logo_url: "https://cache.example/logo.png",
        splash_url: null,
      }),
    );

    // GET /settings não resolve até o teste liberar (delay controlado) —
    // prova que o cache é aplicado sem esperar a rede.
    let releaseNetwork: (value: unknown) => void = () => {};
    mockGet.mockReturnValue(
      new Promise((resolve) => {
        releaseNetwork = resolve;
      }),
    );

    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("primaryColor").props.children).toBe("#00ff00");
    });
    expect(screen.getByTestId("logoUrl").props.children).toBe("https://cache.example/logo.png");
    expect(screen.getByTestId("appName").props.children).toBe("Igreja Cache");

    // rede ainda não respondeu neste ponto — a asserção acima só passou
    // por causa do cache.
    expect(mockGet).toHaveBeenCalledWith("/settings", { token: "token-abc" });

    await act(async () => {
      releaseNetwork({
        branding: {
          app_name: "Igreja Rede",
          primary_color: "#0000ff",
          logo_url: "https://rede.example/logo.png",
          splash_url: null,
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("primaryColor").props.children).toBe("#0000ff");
    });

    // sucesso da rede regrava o cache com o branding novo (não o antigo).
    expect(mockSetItem).toHaveBeenCalledWith(
      "orbien.branding",
      JSON.stringify({
        app_name: "Igreja Rede",
        primary_color: "#0000ff",
        logo_url: "https://rede.example/logo.png",
        splash_url: null,
      }),
    );
  });

  it("AC 2: tenant sem branding customizado (campos nulos) cai no tema default, sem erro visível", async () => {
    mockGetItem.mockResolvedValue(null);
    mockGet.mockResolvedValue({
      branding: { app_name: null, primary_color: null, logo_url: null, splash_url: null },
    });

    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>,
      );
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });

    expect(screen.getByTestId("primaryColor").props.children).toBe(DEFAULT_THEME.primaryColor);
    expect(screen.getByTestId("logoUrl").props.children).toBe("sem-logo");
    expect(screen.getByTestId("appName").props.children).toBe(DEFAULT_THEME.appName);
  });

  it("AC 2: GET /settings falha (erro de rede) -> mantém o tema cacheado, sem erro visível", async () => {
    mockGetItem.mockResolvedValue(
      JSON.stringify({
        app_name: "Igreja Cache",
        primary_color: "#abcdef",
        logo_url: null,
        splash_url: null,
      }),
    );
    mockGet.mockRejectedValue(new Error("Erro de rede"));

    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("primaryColor").props.children).toBe("#abcdef");
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });

    // erro de rede não derruba o tema já aplicado nem lança/propaga nada
    // que o teste precisasse capturar com try/catch — se propagasse, o
    // .catch do componente não existiria e o teste falharia por rejeição
    // não tratada.
    expect(screen.getByTestId("primaryColor").props.children).toBe("#abcdef");
    // falha de rede não regrava o cache com lixo/branding vazio.
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it("AC 2: sem cache e GET /settings falha -> tema default, sem erro visível", async () => {
    mockGetItem.mockResolvedValue(null);
    mockGet.mockRejectedValue(new Error("Erro de rede"));

    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>,
      );
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });

    expect(screen.getByTestId("primaryColor").props.children).toBe(DEFAULT_THEME.primaryColor);
    expect(screen.getByTestId("appName").props.children).toBe(DEFAULT_THEME.appName);
  });
});
