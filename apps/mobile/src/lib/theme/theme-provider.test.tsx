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

const mockAuthenticatedRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
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
      <Text testID="tenantSlug">{theme.tenantSlug ?? "sem-tenant-slug"}</Text>
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

  it("sem sessão: o cache empresta a COR do último tenant, nunca o nome nem o logo", async () => {
    // A tela de login de uma build genérica abria como "Doca Church", com o
    // logo da igreja, só porque o cache de branding sobrevive ao logout. A
    // cor é continuidade legítima; nome e logo antes de o usuário dizer em
    // que igreja entra são identidade errada.
    mockUseAuth.mockReturnValue({ session: null });
    mockGetItem.mockResolvedValue(
      JSON.stringify({
        branding: {
          app_name: "Doca Church",
          primary_color: "#00ff00",
          logo_url: "https://cache.example/logo.png",
          splash_url: null,
        },
        tenantSlug: "doca-church",
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
    expect(screen.getByTestId("appName").props.children).toBe(DEFAULT_THEME.appName);
    expect(screen.getByTestId("logoUrl").props.children).toBe("sem-logo");
    // tenantSlug é identidade, igual a nome/logo — não vaza sem sessão.
    expect(screen.getByTestId("tenantSlug").props.children).toBe("sem-tenant-slug");
    expect(mockAuthenticatedRequest).not.toHaveBeenCalled();
  });

  it("AC 3: reaplica o branding cacheado do AsyncStorage antes do GET /settings resolver", async () => {
    mockGetItem.mockResolvedValue(
      JSON.stringify({
        branding: {
          app_name: "Igreja Cache",
          primary_color: "#00ff00",
          logo_url: "https://cache.example/logo.png",
          splash_url: null,
        },
        tenantSlug: "igreja-cache",
      }),
    );

    // GET /settings não resolve até o teste liberar (delay controlado) —
    // prova que o cache é aplicado sem esperar a rede.
    let releaseNetwork: (value: unknown) => void = () => {};
    mockAuthenticatedRequest.mockReturnValue(
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
    expect(screen.getByTestId("tenantSlug").props.children).toBe("igreja-cache");

    // rede ainda não respondeu neste ponto — a asserção acima só passou
    // por causa do cache.
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/settings");

    await act(async () => {
      releaseNetwork({
        tenant: { slug: "igreja-rede" },
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
    expect(screen.getByTestId("tenantSlug").props.children).toBe("igreja-rede");

    // sucesso da rede regrava o cache com o branding e o tenantSlug novos
    // (não os antigos).
    expect(mockSetItem).toHaveBeenCalledWith(
      "orbien.branding",
      JSON.stringify({
        branding: {
          app_name: "Igreja Rede",
          primary_color: "#0000ff",
          logo_url: "https://rede.example/logo.png",
          splash_url: null,
        },
        tenantSlug: "igreja-rede",
      }),
    );
  });

  it("AC 2: tenant sem branding customizado (campos nulos) cai no tema default, sem erro visível", async () => {
    mockGetItem.mockResolvedValue(null);
    mockAuthenticatedRequest.mockResolvedValue({
      tenant: { slug: "igreja-sem-branding" },
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
      expect(mockAuthenticatedRequest).toHaveBeenCalled();
    });

    expect(screen.getByTestId("primaryColor").props.children).toBe(DEFAULT_THEME.primaryColor);
    expect(screen.getByTestId("logoUrl").props.children).toBe("sem-logo");
    expect(screen.getByTestId("appName").props.children).toBe(DEFAULT_THEME.appName);
    // tenantSlug não é branding customizável — vem do runtime mesmo sem
    // branding, porque só depende do tenant existir (T1: sempre presente).
    await waitFor(() => {
      expect(screen.getByTestId("tenantSlug").props.children).toBe("igreja-sem-branding");
    });
  });

  it("AC 2: GET /settings falha (erro de rede) -> mantém o tema cacheado, sem erro visível", async () => {
    mockGetItem.mockResolvedValue(
      JSON.stringify({
        branding: {
          app_name: "Igreja Cache",
          primary_color: "#abcdef",
          logo_url: null,
          splash_url: null,
        },
        tenantSlug: "igreja-cache",
      }),
    );
    mockAuthenticatedRequest.mockRejectedValue(new Error("Erro de rede"));

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
      expect(mockAuthenticatedRequest).toHaveBeenCalled();
    });

    // erro de rede não derruba o tema já aplicado nem lança/propaga nada
    // que o teste precisasse capturar com try/catch — se propagasse, o
    // .catch do componente não existiria e o teste falharia por rejeição
    // não tratada.
    expect(screen.getByTestId("primaryColor").props.children).toBe("#abcdef");
    expect(screen.getByTestId("tenantSlug").props.children).toBe("igreja-cache");
    // falha de rede não regrava o cache com lixo/branding vazio.
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it("AC 2: sem cache e GET /settings falha -> tema default, sem erro visível", async () => {
    mockGetItem.mockResolvedValue(null);
    mockAuthenticatedRequest.mockRejectedValue(new Error("Erro de rede"));

    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>,
      );
    });

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalled();
    });

    expect(screen.getByTestId("primaryColor").props.children).toBe(DEFAULT_THEME.primaryColor);
    expect(screen.getByTestId("appName").props.children).toBe(DEFAULT_THEME.appName);
    expect(screen.getByTestId("tenantSlug").props.children).toBe("sem-tenant-slug");
  });
});
