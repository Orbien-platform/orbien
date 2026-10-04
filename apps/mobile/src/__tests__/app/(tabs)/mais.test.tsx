// Aba Mais (v2): cada linha aparece só para quem pode usá-la — escalas e
// celebrações pela área `volunteers`, o cadastro de visitante pelos papéis
// que `POST /visitors` aceita (líder de célula incluso), e o "Sair" sempre.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { webUrl: "https://app.example" } } },
}));

const mockOpenBrowser = jest.fn();
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args),
}));

const mockLogout = jest.fn();
const mockUseAuth = jest.fn();
jest.mock("../../../lib/auth/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockDecodeJwtPayload = jest.fn();
jest.mock("../../../lib/auth/jwt", () => ({
  decodeJwtPayload: (...args: unknown[]) => mockDecodeJwtPayload(...args),
}));

const mockFetchAsaas = jest.fn();
jest.mock("../../../lib/pix-recorrente/pix-recorrente-client", () => ({
  fetchAsaasPaymentsEnabled: () => mockFetchAsaas(),
}));

const mockUseTheme = jest.fn();
jest.mock("../../../lib/theme/theme-provider", () => ({
  useTheme: () => mockUseTheme(),
}));

import { palettes } from "../../../lib/theme/tokens";
import MaisScreen from "../../../app/(tabs)/mais";

function payload(roles: string[], plan: "starter" | "premium" = "starter") {
  return { sub: "u1", tenant_id: "t1", congregation_id: "c1", roles, plan, exp: 0 };
}

async function renderMais() {
  await act(async () => {
    render(<MaisScreen />);
  });
}

describe("MaisScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      session: { accessToken: "token", refreshToken: "r", accessTokenExpiresAt: Date.now() },
      areas: ["volunteers"],
      logout: mockLogout,
    });
    mockDecodeJwtPayload.mockReturnValue(payload(["volunteer"]));
    mockFetchAsaas.mockResolvedValue(false);
    mockOpenBrowser.mockResolvedValue(undefined);
    mockLogout.mockResolvedValue(undefined);
    mockUseTheme.mockReturnValue({
      appName: "Igreja Teste",
      primaryColor: "#1E3A7B",
      tenantSlug: "igreja-teste",
      colors: palettes.dark,
      shadow: { sm: {}, md: {}, lg: {} },
    });
  });

  it("voluntário vê escalas e celebrações, que abrem as pilhas", async () => {
    await renderMais();

    await act(async () => {
      fireEvent.press(screen.getByTestId("mais-escalas"));
    });
    expect(mockPush).toHaveBeenCalledWith("/escala");

    await act(async () => {
      fireEvent.press(screen.getByTestId("mais-celebracoes"));
    });
    expect(mockPush).toHaveBeenCalledWith("/celebracoes");
  });

  it("sem a área volunteers, escalas e celebrações não aparecem", async () => {
    mockUseAuth.mockReturnValue({
      session: { accessToken: "token", refreshToken: "r", accessTokenExpiresAt: Date.now() },
      areas: ["content"],
      logout: mockLogout,
    });
    await renderMais();

    expect(screen.queryByTestId("mais-escalas")).toBeNull();
    expect(screen.queryByTestId("mais-celebracoes")).toBeNull();
    expect(screen.getByTestId("mais-notificacoes")).toBeTruthy();
  });

  it("membro não vê a seção de liderança", async () => {
    mockDecodeJwtPayload.mockReturnValue(payload(["member"]));
    await renderMais();

    expect(screen.queryByTestId("mais-visitante")).toBeNull();
  });

  it("secretaria vê o cadastro de visitante", async () => {
    mockDecodeJwtPayload.mockReturnValue(payload(["secretary"]));
    await renderMais();

    await act(async () => {
      fireEvent.press(screen.getByTestId("mais-visitante"));
    });
    expect(mockPush).toHaveBeenCalledWith("/visitante");
  });

  it("líder de célula vê o cadastro — é quem recebe o visitante no encontro", async () => {
    mockDecodeJwtPayload.mockReturnValue(payload(["cell_leader"]));
    await renderMais();

    expect(screen.getByTestId("mais-visitante")).toBeTruthy();
  });

  it("Contribuir abre a página de doação da igreja", async () => {
    await renderMais();

    await act(async () => {
      fireEvent.press(screen.getByTestId("mais-contribuir"));
    });
    expect(mockOpenBrowser).toHaveBeenCalledWith("https://app.example/doar/igreja-teste");
  });

  it("dízimo automático só com a trava ligada e plano Premium", async () => {
    mockDecodeJwtPayload.mockReturnValue(payload(["member"], "premium"));
    mockFetchAsaas.mockResolvedValue(true);
    await renderMais();

    expect(screen.getByTestId("mais-dizimo-automatico")).toBeTruthy();
  });

  it("dízimo automático some com a trava desligada", async () => {
    mockDecodeJwtPayload.mockReturnValue(payload(["member"], "premium"));
    await renderMais();

    expect(screen.queryByTestId("mais-dizimo-automatico")).toBeNull();
  });

  it("perfil e privacidade abrem as pilhas, e Sair encerra a sessão", async () => {
    await renderMais();

    await act(async () => {
      fireEvent.press(screen.getByTestId("mais-perfil"));
    });
    expect(mockPush).toHaveBeenCalledWith("/perfil");

    await act(async () => {
      fireEvent.press(screen.getByTestId("mais-privacidade"));
    });
    expect(mockPush).toHaveBeenCalledWith("/privacidade");

    await act(async () => {
      fireEvent.press(screen.getByTestId("mais-sair"));
    });
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
