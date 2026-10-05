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
    expect(screen.queryByTestId("mais-autocadastro")).toBeNull();
    expect(screen.queryByTestId("mais-lideranca")).toBeNull();
  });

  it("pastor vê o QR de autocadastro, que abre a lista de QRs", async () => {
    mockDecodeJwtPayload.mockReturnValue(payload(["pastor"]));
    await renderMais();

    await act(async () => {
      fireEvent.press(screen.getByTestId("mais-autocadastro"));
    });
    expect(mockPush).toHaveBeenCalledWith("/autocadastro");
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
    // O QR de autocadastro não: `admin/visitor/qr` não aceita o papel.
    expect(screen.queryByTestId("mais-autocadastro")).toBeNull();
  });

  it("Contribuir abre a tela nativa de contribuir", async () => {
    await renderMais();

    await act(async () => {
      fireEvent.press(screen.getByTestId("mais-contribuir"));
    });
    expect(mockPush).toHaveBeenCalledWith("/contribuir");
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

  it("sem sessão legível e sem áreas: fail-open nas escalas, nenhum papel de liderança", async () => {
    mockUseAuth.mockReturnValue({ session: null, areas: null, logout: mockLogout });
    await renderMais();

    expect(screen.getByTestId("mais-escalas")).toBeTruthy();
    expect(screen.queryByTestId("mais-visitante")).toBeNull();
  });

  it("sem o slug da igreja, Contribuir não aparece", async () => {
    mockUseTheme.mockReturnValue({
      appName: "Igreja Teste",
      primaryColor: "#1E3A7B",
      tenantSlug: null,
      colors: palettes.dark,
      shadow: { sm: {}, md: {}, lg: {} },
    });
    await renderMais();
    expect(screen.queryByTestId("mais-contribuir")).toBeNull();
  });

  it("dízimo automático e notificações abrem as pilhas", async () => {
    mockDecodeJwtPayload.mockReturnValue(payload(["member"], "premium"));
    mockFetchAsaas.mockResolvedValue(true);
    await renderMais();

    await act(async () => {
      fireEvent.press(screen.getByTestId("mais-dizimo-automatico"));
    });
    expect(mockPush).toHaveBeenCalledWith("/dizimo-automatico");
    await act(async () => {
      fireEvent.press(screen.getByTestId("mais-notificacoes"));
    });
    expect(mockPush).toHaveBeenCalledWith("/notificacoes");
  });

  it("Sair mostra 'Saindo…' e ignora o segundo toque enquanto encerra", async () => {
    let finish!: () => void;
    mockLogout.mockReturnValue(new Promise<void>((r) => (finish = r)));
    await renderMais();

    await act(async () => {
      fireEvent.press(screen.getByTestId("mais-sair"));
    });
    expect(screen.getByText("Saindo…")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("mais-sair"));
    });
    expect(mockLogout).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish();
    });
    expect(screen.getByText("Sair")).toBeTruthy();
  });

  it("ignora a trava de pagamentos que responde depois de sair da tela", async () => {
    let resolve!: (value: boolean) => void;
    mockFetchAsaas.mockReturnValue(new Promise<boolean>((r) => (resolve = r)));
    const view = await render(<MaisScreen />);
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      resolve(true);
    });
    expect(mockFetchAsaas).toHaveBeenCalled();
  });
});
