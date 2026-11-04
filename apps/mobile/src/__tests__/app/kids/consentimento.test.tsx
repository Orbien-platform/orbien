// Kids — termo de consentimento (T31, KIDS-06): aceite versionado e revogação.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockGetStatus = jest.fn();
const mockAccept = jest.fn();
const mockRevoke = jest.fn();
jest.mock("../../../lib/kids/kids-client", () => ({
  ...jest.requireActual("../../../lib/kids/kids-client"),
  getConsentStatus: (...a: unknown[]) => mockGetStatus(...a),
  acceptConsent: (...a: unknown[]) => mockAccept(...a),
  revokeConsent: (...a: unknown[]) => mockRevoke(...a),
}));

import NetInfo from "@react-native-community/netinfo";
import { HttpError, NetworkError } from "../../../lib/api/errors";
import ConsentimentoScreen from "../../../app/kids/consentimento";

const PENDING = { valid: false, term_version: "kids-2026-10", term_text: "Autorizo a igreja a tratar os dados." };

async function renderScreen() {
  await act(async () => {
    render(<ConsentimentoScreen />);
  });
}

async function press(testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}

describe("ConsentimentoScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("mostra o termo e aceita com a versão que a tela mostrou", async () => {
    mockGetStatus.mockResolvedValueOnce(PENDING).mockResolvedValueOnce({ ...PENDING, valid: true });
    mockAccept.mockResolvedValue(undefined);
    await renderScreen();
    expect(screen.getByText("Autorizo a igreja a tratar os dados.")).toBeTruthy();
    expect(screen.getByText("Versão kids-2026-10")).toBeTruthy();

    await press("consent-accept");
    expect(mockAccept).toHaveBeenCalledWith("kids-2026-10");
    expect(screen.getByTestId("consent-active")).toBeTruthy();
    expect(screen.queryByTestId("consent-accept")).toBeNull();
  });

  it("falha no aceite mostra o erro e mantém o botão", async () => {
    mockGetStatus.mockResolvedValue(PENDING);
    mockAccept.mockRejectedValue(new NetworkError());
    await renderScreen();
    await press("consent-accept");
    expect(screen.getByTestId("consent-error").props.children).toBe(
      "Não foi possível registrar o aceite. Tente novamente.",
    );
    expect(screen.getByTestId("consent-accept")).toBeTruthy();
  });

  it("termo trocado no servidor (409) recarrega o termo novo", async () => {
    mockGetStatus
      .mockResolvedValueOnce(PENDING)
      .mockResolvedValueOnce({ ...PENDING, term_version: "kids-2026-11", term_text: "Texto novo." });
    mockAccept.mockRejectedValue(
      new HttpError(409, { code: "kids_term_outdated", message: "O termo foi atualizado; leia a versão vigente antes de aceitar" }),
    );
    await renderScreen();
    await press("consent-accept");
    expect(screen.getByText("Texto novo.")).toBeTruthy();
    expect(screen.getByTestId("consent-error")).toBeTruthy();
  });

  it("revogar pede confirmação e depois revoga", async () => {
    mockGetStatus.mockResolvedValueOnce({ ...PENDING, valid: true }).mockResolvedValueOnce(PENDING);
    mockRevoke.mockResolvedValue(undefined);
    await renderScreen();
    expect(mockRevoke).not.toHaveBeenCalled();

    await press("consent-revoke");
    expect(screen.getByText(/não é possível fazer novos check-ins/)).toBeTruthy();
    expect(mockRevoke).not.toHaveBeenCalled();

    await press("consent-revoke-confirm");
    expect(mockRevoke).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("consent-accept")).toBeTruthy();
  });

  it("desistir da revogação mantém o consentimento", async () => {
    mockGetStatus.mockResolvedValue({ ...PENDING, valid: true });
    await renderScreen();
    await press("consent-revoke");
    await press("consent-revoke-cancel");
    expect(screen.getByTestId("consent-revoke")).toBeTruthy();
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("falha na revogação mostra o erro", async () => {
    mockGetStatus.mockResolvedValue({ ...PENDING, valid: true });
    mockRevoke.mockRejectedValue(new NetworkError());
    await renderScreen();
    await press("consent-revoke");
    await press("consent-revoke-confirm");
    expect(screen.getByTestId("consent-error").props.children).toBe("Não foi possível revogar. Tente novamente.");
  });

  it("erro ao carregar o termo oferece tentar de novo", async () => {
    mockGetStatus.mockRejectedValueOnce(new NetworkError()).mockResolvedValueOnce(PENDING);
    await renderScreen();
    expect(screen.getByTestId("consent-load-error")).toBeTruthy();
    await press("consent-retry");
    expect(screen.getByTestId("consent-accept")).toBeTruthy();
  });

  describe("sem conexão: relê sozinha quando a conexão volta (PROD-32)", () => {
    type NetState = { isConnected: boolean; isInternetReachable: boolean };
    let emit: (state: NetState) => void;
    const OFFLINE = { isConnected: false, isInternetReachable: false };
    const ONLINE = { isConnected: true, isInternetReachable: true };

    beforeEach(() => {
      jest.useFakeTimers();
      emit = () => undefined;
      (NetInfo.addEventListener as jest.Mock).mockImplementation((cb: (state: NetState) => void) => {
        emit = cb;
        return jest.fn();
      });
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("cai, volta e faz uma única releitura", async () => {
      mockGetStatus.mockReset();
      mockGetStatus.mockRejectedValueOnce(new NetworkError());
      mockGetStatus.mockResolvedValue(PENDING);
      await renderScreen();
      expect(screen.getByTestId("consent-load-error")).toBeTruthy();
      expect(mockGetStatus).toHaveBeenCalledTimes(1);

      emit(OFFLINE);
      emit(ONLINE);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });

      expect(mockGetStatus).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Autorizo a igreja a tratar os dados.")).toBeTruthy();
      // Só leitura: a releitura nunca aceita nem revoga o termo.
      expect(mockAccept).not.toHaveBeenCalled();
      expect(mockRevoke).not.toHaveBeenCalled();
    });

    it("já online, sem ter visto a conexão cair, não recarrega", async () => {
      mockGetStatus.mockReset();
      mockGetStatus.mockRejectedValue(new NetworkError());
      await renderScreen();
      expect(screen.getByTestId("consent-load-error")).toBeTruthy();

      emit(ONLINE);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });

      expect(mockGetStatus).toHaveBeenCalledTimes(1);
    });
  });
});
