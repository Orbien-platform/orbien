// Fora de `src/app` de propósito: arquivo `.tsx` na raiz de rotas entra no
// bundle pelo `require.context` do expo-router e arrasta o
// @testing-library/react-native, que não resolve no Metro. Ver README,
// "Portão de bundle no `build`".
// Testes derivados do Done-when de T8 (tasks.md, Rodada 2): carrega o mês
// corrente (AC 4), salva com o shape esperado, e aplica só a resposta do
// mês selecionado por último quando duas respostas chegam fora de ordem
// (mesmo princípio do signal.cancelled de UnavailabilityPanel.tsx).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockGetUnavailability = jest.fn();
const mockSaveUnavailability = jest.fn();
jest.mock("../../lib/escala/escala-client", () => ({
  getUnavailability: (...args: unknown[]) => mockGetUnavailability(...args),
  saveUnavailability: (...args: unknown[]) => mockSaveUnavailability(...args),
}));

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
}));

const mockUseAuth = jest.fn();
jest.mock("../../lib/auth/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

import NetInfo from "@react-native-community/netinfo";
import { NetworkError } from "../../lib/api/errors";
import IndisponibilidadeScreen from "../../app/indisponibilidade";

describe("IndisponibilidadeScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-09-08T12:00:00Z"));
    mockUseAuth.mockReturnValue({ areas: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("carrega as datas indisponíveis do mês corrente (AC 4)", async () => {
    mockGetUnavailability.mockResolvedValue({ dates: [{ date: "2026-09-10" }] });

    await act(async () => {
      render(<IndisponibilidadeScreen />);
    });

    await waitFor(() => {
      expect(mockGetUnavailability).toHaveBeenCalledWith(9, 2026);
    });
    expect(screen.getByTestId("day-2026-09-10").props.accessibilityState.selected).toBe(
      true,
    );
  });

  it("salvar chama saveUnavailability com mês/ano/datas selecionadas", async () => {
    mockGetUnavailability.mockResolvedValue({ dates: [] });
    mockSaveUnavailability.mockResolvedValue({ dates: [{ date: "2026-09-15" }] });

    await act(async () => {
      render(<IndisponibilidadeScreen />);
    });
    await waitFor(() => screen.getByTestId("day-2026-09-15"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("day-2026-09-15"));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("notes-input"), "viagem");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("save-button"));
    });

    await waitFor(() => {
      expect(mockSaveUnavailability).toHaveBeenCalledWith(9, 2026, ["2026-09-15"], "viagem");
    });
    expect(screen.getByTestId("saved-message")).toBeTruthy();
  });

  it("trocar de mês rapidamente aplica só a resposta do mês selecionado por último, não a que chega por último no tempo", async () => {
    let resolveSeptember: (value: { dates: { date: string }[] }) => void;
    const septemberPromise = new Promise<{ dates: { date: string }[] }>((resolve) => {
      resolveSeptember = resolve;
    });
    mockGetUnavailability.mockImplementationOnce(() => septemberPromise);
    mockGetUnavailability.mockResolvedValueOnce({ dates: [{ date: "2026-10-05" }] });

    await act(async () => {
      render(<IndisponibilidadeScreen />);
    });
    await waitFor(() => {
      expect(mockGetUnavailability).toHaveBeenNthCalledWith(1, 9, 2026);
    });

    // troca para outubro antes da resposta de setembro chegar
    await act(async () => {
      fireEvent.press(screen.getByTestId("next-month"));
    });
    await waitFor(() => {
      expect(mockGetUnavailability).toHaveBeenNthCalledWith(2, 10, 2026);
    });

    // resposta obsoleta de setembro chega depois — não pode sobrescrever outubro
    await act(async () => {
      resolveSeptember({ dates: [{ date: "2026-09-10" }] });
    });

    expect(screen.getByTestId("current-month").props.children).toBe("Outubro 2026");
    expect(screen.getByTestId("day-2026-10-05").props.accessibilityState.selected).toBe(true);
    // a resposta obsoleta de setembro não marcou nada no mês exibido
    expect(screen.getByTestId("day-2026-10-10").props.accessibilityState.selected).toBe(false);
  });

  it("erro de rede ao carregar mostra mensagem de erro visível (Fix 1)", async () => {
    mockGetUnavailability.mockRejectedValue(new Error("falha de rede"));

    await act(async () => {
      render(<IndisponibilidadeScreen />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("load-error")).toBeTruthy();
    });
  });

  it("erro ao salvar mostra mensagem de erro visível, sem crash silencioso (Fix 1)", async () => {
    mockGetUnavailability.mockResolvedValue({ dates: [] });
    mockSaveUnavailability.mockRejectedValue(new Error("falha de rede"));

    await act(async () => {
      render(<IndisponibilidadeScreen />);
    });
    await waitFor(() => screen.getByTestId("save-button"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("save-button"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("save-error")).toBeTruthy();
    });
    expect(screen.queryByTestId("saved-message")).toBeNull();
  });

  it("sem a área volunteers: mostra tela sem acesso e não busca indisponibilidade (ACC-08)", async () => {
    mockUseAuth.mockReturnValue({ areas: ["content"] });

    await act(async () => {
      render(<IndisponibilidadeScreen />);
    });

    expect(screen.getByTestId("sem-acesso")).toBeTruthy();
    expect(screen.queryByTestId("days-grid")).toBeNull();
    expect(mockGetUnavailability).not.toHaveBeenCalled();
  });

  it("na tela sem acesso, o botão Voltar chama router.back()", async () => {
    mockUseAuth.mockReturnValue({ areas: ["content"] });

    await act(async () => {
      render(<IndisponibilidadeScreen />);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("back-button"));
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("com a área volunteers: carrega a tela normal, sem o guard de sem acesso", async () => {
    mockUseAuth.mockReturnValue({ areas: ["volunteers"] });
    mockGetUnavailability.mockResolvedValue({ dates: [] });

    await act(async () => {
      render(<IndisponibilidadeScreen />);
    });

    await waitFor(() => {
      expect(mockGetUnavailability).toHaveBeenCalledWith(9, 2026);
    });
    expect(screen.queryByTestId("sem-acesso")).toBeNull();
  });

  it("areas null (fail-open): carrega a tela normal, igual a ter acesso", async () => {
    mockUseAuth.mockReturnValue({ areas: null });
    mockGetUnavailability.mockResolvedValue({ dates: [] });

    await act(async () => {
      render(<IndisponibilidadeScreen />);
    });

    await waitFor(() => {
      expect(mockGetUnavailability).toHaveBeenCalledWith(9, 2026);
    });
    expect(screen.queryByTestId("sem-acesso")).toBeNull();
  });
  it("voltar um mês vai de setembro para agosto do mesmo ano", async () => {
    mockGetUnavailability.mockResolvedValue({ dates: [] });

    await render(<IndisponibilidadeScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("prev-month"));
    });

    expect(mockGetUnavailability).toHaveBeenLastCalledWith(8, 2026);
  });

  it("voltar de janeiro vai para dezembro do ano anterior", async () => {
    jest.setSystemTime(new Date("2026-01-15T12:00:00Z"));
    mockGetUnavailability.mockResolvedValue({ dates: [] });

    await render(<IndisponibilidadeScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("prev-month"));
    });

    expect(mockGetUnavailability).toHaveBeenLastCalledWith(12, 2025);
  });

  it("avançar de dezembro vai para janeiro do ano seguinte", async () => {
    jest.setSystemTime(new Date("2026-12-15T12:00:00Z"));
    mockGetUnavailability.mockResolvedValue({ dates: [] });

    await render(<IndisponibilidadeScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("next-month"));
    });

    expect(mockGetUnavailability).toHaveBeenLastCalledWith(1, 2027);
  });

  it("tocar de novo num dia marcado o desmarca", async () => {
    mockGetUnavailability.mockResolvedValue({ dates: [{ date: "2026-09-10" }] });

    await render(<IndisponibilidadeScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("day-2026-09-10").props.accessibilityState.selected).toBe(true),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("day-2026-09-10"));
    });

    expect(screen.getByTestId("day-2026-09-10").props.accessibilityState.selected).toBe(false);
  });

  it("resposta vazia da API (sem registro no mês) deixa todos os dias livres", async () => {
    mockGetUnavailability.mockResolvedValue(null);

    await render(<IndisponibilidadeScreen />);

    await waitFor(() => expect(mockGetUnavailability).toHaveBeenCalled());
    expect(screen.getByTestId("day-2026-09-10").props.accessibilityState.selected).toBe(false);
  });

  it("falha do mês anterior que chega depois da troca de mês é ignorada", async () => {
    let rejectSetembro!: (reason: unknown) => void;
    mockGetUnavailability
      .mockReturnValueOnce(new Promise((_, r) => (rejectSetembro = r)))
      .mockResolvedValue({ dates: [] });

    await render(<IndisponibilidadeScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("next-month"));
    });
    await act(async () => {
      rejectSetembro(new Error("falha de rede"));
    });

    expect(screen.queryByText(/Não foi possível carregar/)).toBeNull();
  });

  describe("sem conexão: relê sozinha quando a conexão volta (PROD-32)", () => {
    type NetState = { isConnected: boolean; isInternetReachable: boolean };
    let emit: (state: NetState) => void;
    const OFFLINE = { isConnected: false, isInternetReachable: false };
    const ONLINE = { isConnected: true, isInternetReachable: true };

    beforeEach(() => {
      emit = () => undefined;
      (NetInfo.addEventListener as jest.Mock).mockImplementation((cb: (state: NetState) => void) => {
        emit = cb;
        return jest.fn();
      });
    });

    async function reconnect() {
      emit(OFFLINE);
      emit(ONLINE);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
    }

    it("cai, volta e faz uma única releitura do mês", async () => {
      mockGetUnavailability.mockRejectedValueOnce(new NetworkError());
      mockGetUnavailability.mockResolvedValue({ dates: [{ date: "2026-09-10" }] });
      await act(async () => {
        render(<IndisponibilidadeScreen />);
      });
      expect(screen.getByTestId("load-error")).toBeTruthy();

      await reconnect();

      expect(mockGetUnavailability).toHaveBeenCalledTimes(2);
      expect(mockGetUnavailability).toHaveBeenLastCalledWith(9, 2026);
      expect(screen.getByTestId("day-2026-09-10").props.accessibilityState.selected).toBe(true);
      expect(mockSaveUnavailability).not.toHaveBeenCalled();
    });

    it("já online, sem ter visto a conexão cair, não recarrega", async () => {
      mockGetUnavailability.mockRejectedValue(new NetworkError());
      await act(async () => {
        render(<IndisponibilidadeScreen />);
      });
      emit(ONLINE);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expect(mockGetUnavailability).toHaveBeenCalledTimes(1);
    });

    it("com dia marcado, a volta NÃO sobrescreve: mostra o aviso e só relê ao toque", async () => {
      mockGetUnavailability.mockRejectedValueOnce(new NetworkError());
      mockGetUnavailability.mockResolvedValue({ dates: [{ date: "2026-09-10" }] });
      await act(async () => {
        render(<IndisponibilidadeScreen />);
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId("day-2026-09-15"));
      });

      await reconnect();

      expect(mockGetUnavailability).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("day-2026-09-15").props.accessibilityState.selected).toBe(true);
      expect(screen.getByTestId("reconnect-notice")).toBeTruthy();

      await act(async () => {
        fireEvent.press(screen.getByTestId("reconnect-notice"));
      });
      expect(mockGetUnavailability).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId("reconnect-notice")).toBeNull();
    });

    it("observação digitada também conta como edição pendente", async () => {
      mockGetUnavailability.mockRejectedValueOnce(new NetworkError());
      mockGetUnavailability.mockResolvedValue({ dates: [] });
      await act(async () => {
        render(<IndisponibilidadeScreen />);
      });
      await act(async () => {
        fireEvent.changeText(screen.getByTestId("notes-input"), "viagem");
      });
      await reconnect();
      expect(mockGetUnavailability).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("reconnect-notice")).toBeTruthy();
    });
  });
});
