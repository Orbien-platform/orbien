// Testes de NotificacoesScreen (MOB-10, T13 do tasks.md). Derivados do
// Done-when: mount sem preferência salva mostra as 4 ligadas (AC1),
// toggle bem-sucedido persiste e sincroniza tag (AC2/AC1 da segunda
// história), toggle com falha reverte e mostra erro (AC3), duas
// categorias tocadas em sequência rápida não se atropelam (Edge Case).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockGetNotificationPreferences = jest.fn();
const mockUpdateNotificationPreferences = jest.fn();
jest.mock("../../lib/notifications/notification-preferences-client", () => ({
  getNotificationPreferences: (...args: unknown[]) => mockGetNotificationPreferences(...args),
  updateNotificationPreferences: (...args: unknown[]) => mockUpdateNotificationPreferences(...args),
}));

const mockSyncNotificationPreferenceTags = jest.fn();
jest.mock("../../lib/notifications/onesignal-client", () => ({
  syncNotificationPreferenceTags: (...args: unknown[]) => mockSyncNotificationPreferenceTags(...args),
}));

import NetInfo from "@react-native-community/netinfo";
import { NetworkError } from "../../lib/api/errors";
import NotificacoesScreen from "../../app/notificacoes";

const ALL_ON = { avisos: true, oracao: true, eventos: true, devocional: true, biblia: true, kids: true };

describe("NotificacoesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("desligar Kids manda só { kids: false } e sincroniza pref_kids", async () => {
    mockGetNotificationPreferences.mockResolvedValue(ALL_ON);
    const updated = { ...ALL_ON, kids: false };
    mockUpdateNotificationPreferences.mockResolvedValue(updated);

    await act(async () => {
      render(<NotificacoesScreen />);
    });
    expect(screen.getByText("Kids: criança entregue")).toBeTruthy();
    expect(screen.getByTestId("switch-kids").props.value).toBe(true);

    await act(async () => {
      fireEvent(screen.getByTestId("switch-kids"), "valueChange", false);
    });

    expect(mockUpdateNotificationPreferences).toHaveBeenCalledWith({ kids: false });
    expect(mockSyncNotificationPreferenceTags).toHaveBeenCalledWith(updated);
    expect(screen.getByTestId("switch-kids").props.value).toBe(false);
  });

  it("mount sem preferência salva mostra as 5 categorias ligadas (AC1)", async () => {
    mockGetNotificationPreferences.mockResolvedValue(ALL_ON);

    await act(async () => {
      render(<NotificacoesScreen />);
    });

    expect(screen.getByTestId("switch-avisos").props.value).toBe(true);
    expect(screen.getByTestId("switch-oracao").props.value).toBe(true);
    expect(screen.getByTestId("switch-eventos").props.value).toBe(true);
    expect(screen.getByTestId("switch-devocional").props.value).toBe(true);
    expect(screen.getByTestId("switch-biblia").props.value).toBe(true);
    expect(screen.getByText("Respostas na Bíblia")).toBeTruthy();
  });

  it("desligar uma categoria persiste otimisticamente, chama PATCH da categoria isolada e sincroniza a tag ao suceder (AC2)", async () => {
    mockGetNotificationPreferences.mockResolvedValue(ALL_ON);
    const updated = { ...ALL_ON, oracao: false };
    mockUpdateNotificationPreferences.mockResolvedValue(updated);

    await act(async () => {
      render(<NotificacoesScreen />);
    });
    await waitFor(() => screen.getByTestId("switch-oracao"));

    await act(async () => {
      fireEvent(screen.getByTestId("switch-oracao"), "valueChange", false);
    });

    // Estado otimista já reflete desligado antes do PATCH resolver.
    expect(screen.getByTestId("switch-oracao").props.value).toBe(false);

    await waitFor(() => {
      expect(mockUpdateNotificationPreferences).toHaveBeenCalledWith({ oracao: false });
    });
    await waitFor(() => {
      expect(mockSyncNotificationPreferenceTags).toHaveBeenCalledWith(updated);
    });
  });

  it("desligar as respostas na Bíblia manda só { biblia: false } e sincroniza pref_biblia", async () => {
    mockGetNotificationPreferences.mockResolvedValue(ALL_ON);
    const updated = { ...ALL_ON, biblia: false };
    mockUpdateNotificationPreferences.mockResolvedValue(updated);

    await act(async () => {
      render(<NotificacoesScreen />);
    });
    await waitFor(() => screen.getByTestId("switch-biblia"));

    await act(async () => {
      fireEvent(screen.getByTestId("switch-biblia"), "valueChange", false);
    });

    await waitFor(() => {
      expect(mockUpdateNotificationPreferences).toHaveBeenCalledWith({ biblia: false });
    });
    await waitFor(() => {
      expect(mockSyncNotificationPreferenceTags).toHaveBeenCalledWith(updated);
    });
    expect(screen.getByTestId("switch-biblia").props.value).toBe(false);
  });

  it("toggle com falha reverte o estado visual e mostra erro, sem deixar a UI divergir do servidor (AC3)", async () => {
    mockGetNotificationPreferences.mockResolvedValue(ALL_ON);
    mockUpdateNotificationPreferences.mockRejectedValue(new Error("falha de rede"));

    await act(async () => {
      render(<NotificacoesScreen />);
    });
    await waitFor(() => screen.getByTestId("switch-eventos"));

    await act(async () => {
      fireEvent(screen.getByTestId("switch-eventos"), "valueChange", false);
    });

    await waitFor(() => {
      expect(screen.getByTestId("save-error")).toBeTruthy();
    });
    expect(screen.getByTestId("switch-eventos").props.value).toBe(true);
    expect(mockSyncNotificationPreferenceTags).not.toHaveBeenCalled();
  });

  it("duas categorias diferentes tocadas em sequência rápida não se atropelam (Edge Case — fila por categoria, não global)", async () => {
    mockGetNotificationPreferences.mockResolvedValue(ALL_ON);
    let resolveAvisos: (value: unknown) => void;
    const avisosPromise = new Promise((resolve) => {
      resolveAvisos = resolve;
    });
    mockUpdateNotificationPreferences.mockImplementationOnce(() => avisosPromise);
    mockUpdateNotificationPreferences.mockResolvedValueOnce({ ...ALL_ON, eventos: false });

    await act(async () => {
      render(<NotificacoesScreen />);
    });
    await waitFor(() => screen.getByTestId("switch-avisos"));

    // Desliga "avisos" (fica pendente) e, sem esperar, "eventos".
    await act(async () => {
      fireEvent(screen.getByTestId("switch-avisos"), "valueChange", false);
    });
    await act(async () => {
      fireEvent(screen.getByTestId("switch-eventos"), "valueChange", false);
    });

    // "eventos" não espera a resposta pendente de "avisos" para resolver.
    await waitFor(() => {
      expect(screen.getByTestId("switch-eventos").props.value).toBe(false);
    });
    expect(mockSyncNotificationPreferenceTags).toHaveBeenCalledWith({ ...ALL_ON, eventos: false });

    // resposta atrasada de "avisos" chega depois — aplica normalmente.
    await act(async () => {
      resolveAvisos!({ ...ALL_ON, avisos: false, eventos: false });
    });
    await waitFor(() => {
      expect(screen.getByTestId("switch-avisos").props.value).toBe(false);
    });
  });

  it("uma segunda escrita da mesma categoria continua salvando depois de a primeira falhar (regressão)", async () => {
    mockGetNotificationPreferences.mockResolvedValue(ALL_ON);
    mockUpdateNotificationPreferences.mockRejectedValueOnce(new Error("falha de rede"));
    const updated = { ...ALL_ON, oracao: false };
    mockUpdateNotificationPreferences.mockResolvedValueOnce(updated);

    await act(async () => {
      render(<NotificacoesScreen />);
    });
    await waitFor(() => screen.getByTestId("switch-oracao"));

    // Primeiro toggle falha e reverte.
    await act(async () => {
      fireEvent(screen.getByTestId("switch-oracao"), "valueChange", false);
    });
    await waitFor(() => {
      expect(screen.getByTestId("switch-oracao").props.value).toBe(true);
    });

    // Segundo toggle da MESMA categoria precisa disparar um PATCH novo —
    // sem o fix, a cadeia armazenada ficava permanentemente rejeitada e
    // updateNotificationPreferences nunca era chamado de novo.
    await act(async () => {
      fireEvent(screen.getByTestId("switch-oracao"), "valueChange", false);
    });

    await waitFor(() => {
      expect(mockUpdateNotificationPreferences).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId("switch-oracao").props.value).toBe(false);
    });
    expect(mockSyncNotificationPreferenceTags).toHaveBeenCalledWith(updated);
  });

  it("erro ao carregar preferências mostra mensagem visível", async () => {
    mockGetNotificationPreferences.mockRejectedValue(new Error("falha de rede"));

    await act(async () => {
      render(<NotificacoesScreen />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("load-error")).toBeTruthy();
    });
  });

  it("ignora a resposta que chega depois de a tela desmontar", async () => {
    let resolve!: (value: unknown) => void;
    mockGetNotificationPreferences.mockReturnValue(new Promise((r) => (resolve = r)));

    const view = await render(<NotificacoesScreen />);
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      resolve(ALL_ON);
    });

    expect(mockGetNotificationPreferences).toHaveBeenCalled();
  });

  it("ignora a falha que chega depois de a tela desmontar", async () => {
    let reject!: (reason: unknown) => void;
    mockGetNotificationPreferences.mockReturnValue(new Promise((_, r) => (reject = r)));

    const view = await render(<NotificacoesScreen />);
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      reject(new Error("falha de rede"));
    });

    expect(mockGetNotificationPreferences).toHaveBeenCalled();
  });

  it("dois toques seguidos na mesma categoria: a resposta do primeiro não sobrescreve o segundo", async () => {
    mockGetNotificationPreferences.mockResolvedValue(ALL_ON);
    mockUpdateNotificationPreferences
      .mockResolvedValueOnce({ ...ALL_ON, oracao: false })
      .mockResolvedValueOnce(ALL_ON);

    await render(<NotificacoesScreen />);
    await waitFor(() => screen.getByTestId("switch-oracao"));

    await act(async () => {
      fireEvent(screen.getByTestId("switch-oracao"), "valueChange", false);
      fireEvent(screen.getByTestId("switch-oracao"), "valueChange", true);
    });

    await waitFor(() => expect(mockUpdateNotificationPreferences).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockSyncNotificationPreferenceTags).toHaveBeenCalledTimes(1));
    expect(mockSyncNotificationPreferenceTags).toHaveBeenCalledWith(ALL_ON);
    expect(screen.getByTestId("switch-oracao").props.value).toBe(true);
  });

  it("dois toques seguidos na mesma categoria: a falha do primeiro não reverte o segundo", async () => {
    mockGetNotificationPreferences.mockResolvedValue(ALL_ON);
    mockUpdateNotificationPreferences
      .mockRejectedValueOnce(new Error("falha de rede"))
      .mockResolvedValueOnce(ALL_ON);

    await render(<NotificacoesScreen />);
    await waitFor(() => screen.getByTestId("switch-oracao"));

    await act(async () => {
      fireEvent(screen.getByTestId("switch-oracao"), "valueChange", false);
      fireEvent(screen.getByTestId("switch-oracao"), "valueChange", true);
    });

    await waitFor(() => expect(mockSyncNotificationPreferenceTags).toHaveBeenCalledWith(ALL_ON));
    expect(screen.getByTestId("switch-oracao").props.value).toBe(true);
    expect(screen.queryByText(/Não foi possível salvar/)).toBeNull();
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

    async function reconnect() {
      emit(OFFLINE);
      emit(ONLINE);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
    }

    it("cai, volta e faz uma única releitura", async () => {
      mockGetNotificationPreferences.mockRejectedValueOnce(new NetworkError());
      mockGetNotificationPreferences.mockResolvedValue({ ...ALL_ON, kids: false });
      await act(async () => {
        render(<NotificacoesScreen />);
      });
      expect(screen.getByTestId("load-error")).toBeTruthy();

      await reconnect();

      expect(mockGetNotificationPreferences).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId("load-error")).toBeNull();
      expect(screen.getByTestId("switch-kids").props.value).toBe(false);
      expect(mockUpdateNotificationPreferences).not.toHaveBeenCalled();
    });

    it("já online, sem ter visto a conexão cair, não recarrega", async () => {
      mockGetNotificationPreferences.mockRejectedValue(new NetworkError());
      await act(async () => {
        render(<NotificacoesScreen />);
      });
      emit(ONLINE);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expect(mockGetNotificationPreferences).toHaveBeenCalledTimes(1);
    });

    it("erro de servidor não assina a rede nem recarrega", async () => {
      mockGetNotificationPreferences.mockRejectedValue(new Error("500"));
      await act(async () => {
        render(<NotificacoesScreen />);
      });
      await reconnect();
      expect(mockGetNotificationPreferences).toHaveBeenCalledTimes(1);
    });

    it("com chave já mexida, a volta NÃO sobrescreve: mostra o aviso e só relê ao toque", async () => {
      mockGetNotificationPreferences.mockRejectedValueOnce(new NetworkError());
      mockGetNotificationPreferences.mockResolvedValue(ALL_ON);
      mockUpdateNotificationPreferences.mockResolvedValue({ ...ALL_ON, avisos: false });
      await act(async () => {
        render(<NotificacoesScreen />);
      });
      await act(async () => {
        fireEvent(screen.getByTestId("switch-avisos"), "valueChange", false);
      });
      expect(screen.getByTestId("switch-avisos").props.value).toBe(false);

      await reconnect();

      expect(mockGetNotificationPreferences).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("switch-avisos").props.value).toBe(false);
      expect(screen.getByTestId("reconnect-notice")).toBeTruthy();

      await act(async () => {
        fireEvent.press(screen.getByTestId("reconnect-notice"));
      });
      expect(mockGetNotificationPreferences).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId("reconnect-notice")).toBeNull();
      expect(screen.queryByTestId("load-error")).toBeNull();
    });
  });
});
