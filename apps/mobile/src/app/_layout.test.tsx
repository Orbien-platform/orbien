// Testes derivados do Done-when de T14 (tasks.md):
// - unauthenticated renderiza a tela de login (via router mock)
// - authenticated renderiza o shell placeholder
// e de T16 (wiring do ThemeProvider, MOB-03):
// - dois brandings diferentes produzem cor/logo diferentes no shell
import { act, render, screen, waitFor } from "@testing-library/react-native";

const mockUseAuth = jest.fn();
jest.mock("../lib/auth/auth-provider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockUseAuth(),
}));

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: (...args: unknown[]) => mockSetItem(...args),
}));

const mockAuthenticatedRequest = jest.fn();
jest.mock("../lib/auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
}));

jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  return {
    // Renderiza o que o shell autenticado (T16) realmente passa em
    // screenOptions, para o teste poder inspecionar cor/logo aplicados —
    // um mock que ignorasse as props não provaria o wiring do tema.
    Stack: (props: { screenOptions?: { headerStyle?: { backgroundColor?: string }; headerTitle?: () => React.ReactNode } }) => {
      const HeaderTitle = props.screenOptions?.headerTitle;
      return (
        <>
          <Text testID="shell-placeholder">shell</Text>
          <Text testID="header-color">{props.screenOptions?.headerStyle?.backgroundColor ?? ""}</Text>
          {HeaderTitle ? HeaderTitle() : null}
        </>
      );
    },
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
  };
});

import RootLayout from "./_layout";

describe("RootLayout — guarda de navegação", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockAuthenticatedRequest.mockResolvedValue({
      branding: { app_name: null, primary_color: null, logo_url: null, splash_url: null },
    });
  });

  it("status unauthenticated: renderiza redirect para /login, não o shell", async () => {
    mockUseAuth.mockReturnValue({ status: "unauthenticated" });

    await act(async () => {
      render(<RootLayout />);
    });

    expect(screen.getByTestId("redirect").props.children).toBe("/login");
    expect(screen.queryByTestId("shell-placeholder")).toBeNull();
  });

  it("status authenticated: renderiza o shell placeholder, sem redirect", async () => {
    mockUseAuth.mockReturnValue({ status: "authenticated" });

    await act(async () => {
      render(<RootLayout />);
    });

    expect(screen.getByTestId("shell-placeholder")).toBeTruthy();
    expect(screen.queryByTestId("redirect")).toBeNull();
  });

  it("status loading: mostra splash, sem redirect nem shell", async () => {
    mockUseAuth.mockReturnValue({ status: "loading" });

    await act(async () => {
      render(<RootLayout />);
    });

    expect(screen.getByTestId("splash")).toBeTruthy();
    expect(screen.queryByTestId("redirect")).toBeNull();
    expect(screen.queryByTestId("shell-placeholder")).toBeNull();
  });

  describe("T16: wiring do ThemeProvider — dois tenants, dois temas", () => {
    it("tenant A: aplica a cor primária e o logo de A no header do shell", async () => {
      mockUseAuth.mockReturnValue({
        status: "authenticated",
        session: { accessToken: "token-a", refreshToken: "r", accessTokenExpiresAt: Date.now() + 900_000 },
      });
      mockAuthenticatedRequest.mockResolvedValue({
        branding: {
          app_name: "Igreja A",
          primary_color: "#111111",
          logo_url: "https://a.example/logo.png",
          splash_url: null,
        },
      });

      await act(async () => {
        render(<RootLayout />);
      });

      await waitFor(() => {
        expect(screen.getByTestId("header-color").props.children).toBe("#111111");
      });
      expect(screen.getByTestId("header-logo").props.source.uri).toBe("https://a.example/logo.png");
    });

    it("tenant B: aplica cor e logo diferentes de A, no mesmo shell", async () => {
      mockUseAuth.mockReturnValue({
        status: "authenticated",
        session: { accessToken: "token-b", refreshToken: "r", accessTokenExpiresAt: Date.now() + 900_000 },
      });
      mockAuthenticatedRequest.mockResolvedValue({
        branding: {
          app_name: "Igreja B",
          primary_color: "#222222",
          logo_url: "https://b.example/logo.png",
          splash_url: null,
        },
      });

      await act(async () => {
        render(<RootLayout />);
      });

      await waitFor(() => {
        expect(screen.getByTestId("header-color").props.children).toBe("#222222");
      });
      expect(screen.getByTestId("header-logo").props.source.uri).toBe("https://b.example/logo.png");
      expect(screen.getByTestId("header-color").props.children).not.toBe("#111111");
      expect(screen.getByTestId("header-logo").props.source.uri).not.toBe("https://a.example/logo.png");
    });

    it("tenant sem branding customizado: header cai no default, sem logo (AC 2)", async () => {
      mockUseAuth.mockReturnValue({
        status: "authenticated",
        session: { accessToken: "token-c", refreshToken: "r", accessTokenExpiresAt: Date.now() + 900_000 },
      });
      mockAuthenticatedRequest.mockResolvedValue({
        branding: { app_name: null, primary_color: null, logo_url: null, splash_url: null },
      });

      await act(async () => {
        render(<RootLayout />);
      });

      await waitFor(() => {
        expect(mockAuthenticatedRequest).toHaveBeenCalled();
      });

      expect(screen.queryByTestId("header-logo")).toBeNull();
      expect(screen.getByTestId("header-app-name")).toBeTruthy();
    });
  });
});
