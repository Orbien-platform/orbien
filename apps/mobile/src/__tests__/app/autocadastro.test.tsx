// QR de autocadastro (v2): lista só os ativos, abre o escolhido em tela
// cheia, cria o do culto quando não há nenhum e fecha a porta para quem
// não é da liderança.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseAuth = jest.fn();
jest.mock("../../lib/auth/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockDecodeJwtPayload = jest.fn();
jest.mock("../../lib/auth/jwt", () => ({
  decodeJwtPayload: (...args: unknown[]) => mockDecodeJwtPayload(...args),
}));

const mockListSignupQrs = jest.fn();
const mockCreateSignupQr = jest.fn();
jest.mock("../../lib/visitantes/visitantes-client", () => ({
  ...jest.requireActual("../../lib/visitantes/visitantes-client"),
  listSignupQrs: () => mockListSignupQrs(),
  createSignupQr: (...args: unknown[]) => mockCreateSignupQr(...args),
}));

import { HttpError, NetworkError } from "../../lib/api/errors";
import AutocadastroScreen from "../../app/autocadastro";

function qr(overrides: Record<string, unknown> = {}) {
  return {
    id: "q1",
    token: "tok-1",
    origin: "service",
    label: "Culto da manhã",
    is_active: true,
    scan_count: 12,
    created_at: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

async function open() {
  const view = await render(<AutocadastroScreen />);
  await act(async () => undefined);
  return view;
}

describe("AutocadastroScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ session: { accessToken: "token" } });
    mockDecodeJwtPayload.mockReturnValue({ roles: ["secretary"] });
  });

  it("lista só os QRs ativos, com origem e cadastros", async () => {
    mockListSignupQrs.mockResolvedValue([
      qr(),
      qr({ id: "q2", label: null, origin: "event", scan_count: 1 }),
      qr({ id: "q3", is_active: false }),
    ]);
    await open();

    expect(screen.getByTestId("autocadastro-qr-q1")).toHaveTextContent(/Culto da manhã/);
    expect(screen.getByTestId("autocadastro-qr-q1")).toHaveTextContent(/Culto · 12 cadastros/);
    // Sem rótulo, o título é a origem.
    expect(screen.getByTestId("autocadastro-qr-q2")).toHaveTextContent("EventoEvento · 1 cadastro");
    expect(screen.queryByTestId("autocadastro-qr-q3")).toBeNull();
  });

  it("tocar num QR abre a tela cheia com o token e o título", async () => {
    mockListSignupQrs.mockResolvedValue([qr()]);
    await open();

    fireEvent.press(screen.getByTestId("autocadastro-qr-q1"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/autocadastro-qr",
      params: { token: "tok-1", title: "Culto da manhã" },
    });
  });

  it("enquanto carrega, mostra o carregando", async () => {
    mockListSignupQrs.mockReturnValue(new Promise(() => undefined));
    await open();
    expect(screen.getByTestId("autocadastro-carregando")).toBeTruthy();
  });

  it("sem nenhum ativo: estado vazio cria o QR do culto e já o abre", async () => {
    mockListSignupQrs.mockResolvedValue([qr({ is_active: false })]);
    mockCreateSignupQr.mockResolvedValue(qr({ id: "q9", token: "tok-9", label: "Culto" }));
    await open();

    expect(screen.getByTestId("autocadastro-vazio")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("autocadastro-criar"));
    });

    expect(mockCreateSignupQr).toHaveBeenCalledWith("service", "Culto");
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/autocadastro-qr",
      params: { token: "tok-9", title: "Culto" },
    });
    expect(screen.getByTestId("autocadastro-qr-q9")).toBeTruthy();
  });

  it("toque duplo em criar cria um só", async () => {
    mockListSignupQrs.mockResolvedValue([]);
    let resolve!: (value: unknown) => void;
    mockCreateSignupQr.mockReturnValue(new Promise((r) => (resolve = r)));
    await open();

    await act(async () => {
      fireEvent.press(screen.getByTestId("autocadastro-criar"));
      fireEvent.press(screen.getByTestId("autocadastro-criar"));
    });
    await act(async () => {
      resolve(qr());
    });

    expect(mockCreateSignupQr).toHaveBeenCalledTimes(1);
  });

  it("falha ao criar avisa e deixa tentar de novo", async () => {
    mockListSignupQrs.mockResolvedValue([]);
    mockCreateSignupQr.mockRejectedValue(new NetworkError());
    await open();

    await act(async () => {
      fireEvent.press(screen.getByTestId("autocadastro-criar"));
    });
    expect(screen.getByTestId("autocadastro-criar-erro")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("papel sem acesso vê o cadeado e nem consulta a API", async () => {
    mockDecodeJwtPayload.mockReturnValue({ roles: ["cell_leader"] });
    await open();

    expect(screen.getByTestId("autocadastro-sem-acesso")).toBeTruthy();
    expect(mockListSignupQrs).not.toHaveBeenCalled();
  });

  it("sem sessão também é sem acesso", async () => {
    mockUseAuth.mockReturnValue({ session: null });
    await open();
    expect(screen.getByTestId("autocadastro-sem-acesso")).toBeTruthy();
  });

  it("token ilegível conta como sem papel", async () => {
    mockDecodeJwtPayload.mockReturnValue(null);
    await open();
    expect(screen.getByTestId("autocadastro-sem-acesso")).toBeTruthy();
  });

  it("403 da API vira o cadeado", async () => {
    mockListSignupQrs.mockRejectedValue(new HttpError(403, {}));
    await open();
    expect(screen.getByTestId("autocadastro-sem-acesso")).toBeTruthy();
  });

  it("erro de carga oferece tentar de novo, que refaz a busca", async () => {
    mockListSignupQrs.mockRejectedValueOnce(new NetworkError()).mockResolvedValueOnce([qr()]);
    await open();

    expect(screen.getByTestId("autocadastro-erro")).toBeTruthy();
    expect(
      screen.getByText("Não foi possível carregar os QRs de autocadastro. Verifique sua conexão."),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("autocadastro-retry"));
    });
    expect(screen.getByTestId("autocadastro-qr-q1")).toBeTruthy();
  });

  it("erro do servidor não fala de conexão", async () => {
    mockListSignupQrs.mockRejectedValue(new HttpError(500, {}));
    await open();
    expect(screen.getByText("Não foi possível carregar os QRs de autocadastro.")).toBeTruthy();
  });

  it("ignora a resposta e a falha que chegam depois de a tela fechar", async () => {
    let resolve!: (value: unknown) => void;
    mockListSignupQrs.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const first = await render(<AutocadastroScreen />);
    await act(async () => {
      first.unmount();
    });
    await act(async () => {
      resolve([qr()]);
    });

    let reject!: (reason: unknown) => void;
    mockListSignupQrs.mockReturnValueOnce(new Promise((_, r) => (reject = r)));
    const second = await render(<AutocadastroScreen />);
    await act(async () => {
      second.unmount();
    });
    await act(async () => {
      reject(new NetworkError());
    });

    expect(mockListSignupQrs).toHaveBeenCalledTimes(2);
  });
});
