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

import IndisponibilidadeScreen from "../../app/indisponibilidade";

describe("IndisponibilidadeScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-09-08T12:00:00Z"));
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
});
