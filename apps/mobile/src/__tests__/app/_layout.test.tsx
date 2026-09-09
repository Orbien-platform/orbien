// Fora de `src/app` de propósito: arquivo `.tsx` na raiz de rotas entra no
// bundle pelo `require.context` do expo-router e arrasta o
// @testing-library/react-native, que não resolve no Metro. Ver README,
// "Portão de bundle no `build`".
// Testes derivados do Done-when de T14 (tasks.md):
// - unauthenticated libera só a rota de login (via router mock)
// - authenticated libera as rotas autenticadas
// e de T16 (wiring do ThemeProvider, MOB-03):
// - dois brandings diferentes produzem cor/logo diferentes no shell
import { act, render, screen, waitFor } from "@testing-library/react-native";

const mockUseAuth = jest.fn();
jest.mock("../../lib/auth/auth-provider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockUseAuth(),
}));

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  setOptions: jest.fn(),
  hideAsync: jest.fn(async () => undefined),
}));

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: (...args: unknown[]) => mockSetItem(...args),
}));

const mockAuthenticatedRequest = jest.fn();
jest.mock("../../lib/auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
}));

// NotificationsProvider (MOB-07) usa o SDK real do OneSignal, que não
// resolve em Jest (sem binário nativo linkado) — este teste cobre só o
// wiring de AuthGate/ThemeProvider, o comportamento de push já tem
// cobertura própria em notifications-provider.test.tsx.
jest.mock("../../lib/notifications/notifications-provider", () => ({
  NotificationsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  // O mock precisa refletir a forma real do layout raiz (ver
  // navigation-boot.test.tsx, que roda o router de verdade): um único
  // `<Stack>` sempre montado, com as rotas ligadas/desligadas por
  // `<Stack.Protected guard>`. Renderiza o que o shell passa em
  // screenOptions para o teste poder inspecionar cor/logo aplicados — um
  // mock que ignorasse as props não provaria o wiring do tema.
  const Stack = (props: {
    screenOptions?: {
      headerStyle?: { backgroundColor?: string };
      headerTitle?: () => React.ReactNode;
    };
    children?: React.ReactNode;
  }) => {
    const HeaderTitle = props.screenOptions?.headerTitle;
    return (
      <>
        <Text testID="shell-placeholder">shell</Text>
        <Text testID="header-color">{props.screenOptions?.headerStyle?.backgroundColor ?? ""}</Text>
        {HeaderTitle ? HeaderTitle() : null}
        {props.children}
      </>
    );
  };
  const StackScreen = ({ name }: { name: string }) => <Text testID={`screen-${name}`}>{name}</Text>;
  StackScreen.displayName = "Stack.Screen";
  const StackProtected = ({ guard, children }: { guard: boolean; children?: React.ReactNode }) =>
    guard ? <>{children}</> : null;
  StackProtected.displayName = "Stack.Protected";
  Stack.Screen = StackScreen;
  Stack.Protected = StackProtected;

  return { Stack };
});

import RootLayout from "../../app/_layout";

describe("RootLayout — guarda de navegação", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockAuthenticatedRequest.mockResolvedValue({
      branding: { app_name: null, primary_color: null, logo_url: null, splash_url: null },
    });
  });

  it("status unauthenticated: libera só a rota de login, sem as rotas autenticadas", async () => {
    mockUseAuth.mockReturnValue({ status: "unauthenticated" });

    await act(async () => {
      render(<RootLayout />);
    });

    // O navigator continua montado (é o que o expo-router exige do layout
    // raiz); quem muda é o conjunto de rotas liberadas.
    expect(screen.getByTestId("shell-placeholder")).toBeTruthy();
    expect(screen.getByTestId("screen-login")).toBeTruthy();
    expect(screen.queryByTestId("screen-(tabs)")).toBeNull();
    expect(screen.queryByTestId("splash")).toBeNull();
  });

  it("status authenticated: libera as rotas autenticadas e tira o login", async () => {
    mockUseAuth.mockReturnValue({ status: "authenticated" });

    await act(async () => {
      render(<RootLayout />);
    });

    expect(screen.getByTestId("shell-placeholder")).toBeTruthy();
    expect(screen.getByTestId("screen-(tabs)")).toBeTruthy();
    expect(screen.queryByTestId("screen-login")).toBeNull();
    expect(screen.queryByTestId("splash")).toBeNull();
  });

  it("status loading: splash por cima, mas com o navigator já montado", async () => {
    mockUseAuth.mockReturnValue({ status: "loading" });

    await act(async () => {
      render(<RootLayout />);
    });

    expect(screen.getByTestId("splash")).toBeTruthy();
    // O navigator tem que existir já no primeiro render — foi trocá-lo pelo
    // splash que travou o boot no simulador.
    expect(screen.getByTestId("shell-placeholder")).toBeTruthy();
    expect(screen.queryByTestId("screen-(tabs)")).toBeNull();
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
