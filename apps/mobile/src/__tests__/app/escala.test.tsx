// Testes derivados do Done-when de T7 (tasks.md, Rodada 2, MOB-04) e de T5
// (.specs/features/mobile-home-redesign/tasks.md, MHR-03): lista renderiza
// (AC 1), confirmar/recusar atualiza sem refetch (AC 2), check-in some após
// sucesso (AC 3), erro de rede mostra estado explícito (Edge Case da spec).
// Migrado 1:1 de src/__tests__/app/(tabs)/index.test.tsx — mesma suíte, só
// o import do componente mudou de `(tabs)/index` para `escala` (T5).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockGetMyAssignments = jest.fn();
const mockRespondToAssignment = jest.fn();
const mockCheckIn = jest.fn();
jest.mock("../../lib/escala/escala-client", () => ({
  getMyAssignments: (...args: unknown[]) => mockGetMyAssignments(...args),
  respondToAssignment: (...args: unknown[]) => mockRespondToAssignment(...args),
  checkIn: (...args: unknown[]) => mockCheckIn(...args),
}));

import { HttpError, NetworkError } from "../../lib/api/errors";
import EscalaScreen from "../../app/escala";

const PENDING_ASSIGNMENT = {
  id: "a1",
  status: "pending",
  notified_at: null,
  responded_at: null,
  checked_in_at: null,
  celebration: { id: "c1", name: "Culto de domingo" },
  ministry: { id: "m1", name: "Louvor" },
  scheduled_date: "2026-09-13T13:00:00.000Z",
  setlist: null,
};

const CONFIRMED_ASSIGNMENT = {
  ...PENDING_ASSIGNMENT,
  id: "a2",
  status: "confirmed",
};

describe("EscalaScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("carrega e lista os assignments retornados por getMyAssignments (AC 1)", async () => {
    mockGetMyAssignments.mockResolvedValue([PENDING_ASSIGNMENT]);

    await act(async () => {
      render(<EscalaScreen />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("assignment-a1")).toBeTruthy();
    });
    expect(mockGetMyAssignments).toHaveBeenCalledTimes(1);
  });

  it("mostra o dia do culto com o horário da celebração, não a véspera em UTC-3 (PEND-12)", async () => {
    mockGetMyAssignments.mockResolvedValue([
      {
        ...PENDING_ASSIGNMENT,
        scheduled_date: "2026-09-27T00:00:00.000Z",
        celebration: { ...PENDING_ASSIGNMENT.celebration, start_time: "19:00" },
      },
    ]);

    await act(async () => {
      render(<EscalaScreen />);
    });

    expect(screen.getByText("dom, 27 set · 19:00")).toBeTruthy();
    expect(screen.getByText("27")).toBeTruthy();
  });

  it("confirmar um slot pendente chama respondToAssignment e atualiza a lista sem refetch (AC 2)", async () => {
    mockGetMyAssignments.mockResolvedValue([PENDING_ASSIGNMENT]);
    mockRespondToAssignment.mockResolvedValue({ ...PENDING_ASSIGNMENT, status: "confirmed" });

    await act(async () => {
      render(<EscalaScreen />);
    });
    await waitFor(() => screen.getByTestId("confirm-a1"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("confirm-a1"));
    });

    await waitFor(() => {
      expect(mockRespondToAssignment).toHaveBeenCalledWith("a1", "confirmed");
    });
    // sem refetch: getMyAssignments chamado só uma vez (no mount).
    expect(mockGetMyAssignments).toHaveBeenCalledTimes(1);
    // botões de confirmar/recusar somem (status não é mais pending).
    expect(screen.queryByTestId("confirm-a1")).toBeNull();
  });

  it("recusar um slot pendente segue o mesmo padrão para declined (AC 2)", async () => {
    mockGetMyAssignments.mockResolvedValue([PENDING_ASSIGNMENT]);
    mockRespondToAssignment.mockResolvedValue({ ...PENDING_ASSIGNMENT, status: "declined" });

    await act(async () => {
      render(<EscalaScreen />);
    });
    await waitFor(() => screen.getByTestId("decline-a1"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("decline-a1"));
    });

    await waitFor(() => {
      expect(mockRespondToAssignment).toHaveBeenCalledWith("a1", "declined");
    });
    expect(screen.queryByTestId("decline-a1")).toBeNull();
  });

  it("check-in em slot confirmado chama checkIn e o botão desaparece após sucesso (AC 3)", async () => {
    mockGetMyAssignments.mockResolvedValue([CONFIRMED_ASSIGNMENT]);
    mockCheckIn.mockResolvedValue({ ...CONFIRMED_ASSIGNMENT, checked_in_at: "2026-09-13T13:05:00.000Z" });

    await act(async () => {
      render(<EscalaScreen />);
    });
    await waitFor(() => screen.getByTestId("check-in-a2"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("check-in-a2"));
    });

    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith("a2");
    });
    expect(screen.queryByTestId("check-in-a2")).toBeNull();
  });

  it("erro ao confirmar/recusar mostra mensagem de erro visível, sem crash silencioso (Fix 1)", async () => {
    mockGetMyAssignments.mockResolvedValue([PENDING_ASSIGNMENT]);
    mockRespondToAssignment.mockRejectedValue(new Error("falha de rede"));

    await act(async () => {
      render(<EscalaScreen />);
    });
    await waitFor(() => screen.getByTestId("confirm-a1"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("confirm-a1"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("escala-action-error")).toBeTruthy();
    });
    // slot continua pending — nenhuma atualização otimista foi aplicada.
    expect(screen.getByTestId("confirm-a1")).toBeTruthy();
  });

  it("erro ao fazer check-in mostra mensagem de erro visível (Fix 1)", async () => {
    mockGetMyAssignments.mockResolvedValue([CONFIRMED_ASSIGNMENT]);
    mockCheckIn.mockRejectedValue(new Error("falha de rede"));

    await act(async () => {
      render(<EscalaScreen />);
    });
    await waitFor(() => screen.getByTestId("check-in-a2"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("check-in-a2"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("escala-action-error")).toBeTruthy();
    });
  });

  it("check-in duplicado (409) é no-op silencioso, sem mensagem de erro (design.md)", async () => {
    mockGetMyAssignments.mockResolvedValue([CONFIRMED_ASSIGNMENT]);
    mockCheckIn.mockRejectedValue(new HttpError(409, { message: "já feito" }));

    await act(async () => {
      render(<EscalaScreen />);
    });
    await waitFor(() => screen.getByTestId("check-in-a2"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("check-in-a2"));
    });

    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith("a2");
    });
    expect(screen.queryByTestId("escala-action-error")).toBeNull();
  });

  it("erro de rede ao carregar mostra estado de erro explícito, não lista vazia", async () => {
    mockGetMyAssignments.mockRejectedValue(new Error("falha de rede"));

    await act(async () => {
      render(<EscalaScreen />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("escala-error")).toBeTruthy();
    });
    expect(screen.queryByTestId("escala-list")).toBeNull();
  });

  it("botão de indisponibilidade navega para /indisponibilidade", async () => {
    mockGetMyAssignments.mockResolvedValue([]);

    await act(async () => {
      render(<EscalaScreen />);
    });
    await waitFor(() => screen.getByTestId("indisponibilidade-link"));

    fireEvent.press(screen.getByTestId("indisponibilidade-link"));

    expect(mockPush).toHaveBeenCalledWith("/indisponibilidade");
  });

  it("duplo toque em Confirmar antes da resposta dispara só uma chamada (guard de duplo toque)", async () => {
    mockGetMyAssignments.mockResolvedValue([PENDING_ASSIGNMENT]);
    mockRespondToAssignment.mockResolvedValue({ ...PENDING_ASSIGNMENT, status: "confirmed" });

    await act(async () => {
      render(<EscalaScreen />);
    });
    await waitFor(() => screen.getByTestId("confirm-a1"));

    // dois toques síncronos, um logo após o outro: o guard (checado antes
    // do primeiro `await` de handleRespond) bloqueia o segundo mesmo que a
    // resposta do primeiro já esteja resolvida — `await` sempre adia a
    // continuação para um microtask, então o segundo toque, ainda síncrono,
    // encontra o id já marcado como pendente.
    await act(async () => {
      fireEvent.press(screen.getByTestId("confirm-a1"));
      fireEvent.press(screen.getByTestId("confirm-a1"));
    });

    expect(mockRespondToAssignment).toHaveBeenCalledTimes(1);
  });

  it("duplo toque em Fazer check-in antes da resposta dispara só uma chamada (guard de duplo toque)", async () => {
    mockGetMyAssignments.mockResolvedValue([CONFIRMED_ASSIGNMENT]);
    mockCheckIn.mockResolvedValue({ ...CONFIRMED_ASSIGNMENT, checked_in_at: "2026-09-13T13:05:00.000Z" });

    await act(async () => {
      render(<EscalaScreen />);
    });
    await waitFor(() => screen.getByTestId("check-in-a2"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("check-in-a2"));
      fireEvent.press(screen.getByTestId("check-in-a2"));
    });

    expect(mockCheckIn).toHaveBeenCalledTimes(1);
  });

  it("ignora a lista que chega depois de a tela desmontar", async () => {
    let resolve!: (value: unknown) => void;
    mockGetMyAssignments.mockReturnValue(new Promise((r) => (resolve = r)));

    const view = await render(<EscalaScreen />);
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      resolve([PENDING_ASSIGNMENT]);
    });

    expect(screen.queryByTestId("assignment-a1")).toBeNull();
  });

  it("ignora a falha que chega depois de a tela desmontar", async () => {
    let reject!: (reason: unknown) => void;
    mockGetMyAssignments.mockReturnValue(new Promise((_, r) => (reject = r)));

    const view = await render(<EscalaScreen />);
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      reject(new Error("falha de rede"));
    });

    expect(screen.queryByTestId("escala-error")).toBeNull();
  });

  it("sem conexão, o erro de carga diz para verificar a conexão", async () => {
    mockGetMyAssignments.mockRejectedValue(new NetworkError());

    await render(<EscalaScreen />);

    await waitFor(() => {
      expect(screen.getByText(/Verifique sua conexão/)).toBeTruthy();
    });
  });

  it("responder um slot não mexe nos outros da lista, e slot sem data não mostra a linha de horário", async () => {
    const semData = { ...CONFIRMED_ASSIGNMENT, scheduled_date: "sem data" };
    mockGetMyAssignments.mockResolvedValue([PENDING_ASSIGNMENT, semData]);
    mockRespondToAssignment.mockResolvedValue({ ...PENDING_ASSIGNMENT, status: "confirmed" });

    await render(<EscalaScreen />);
    await waitFor(() => screen.getByTestId("confirm-a1"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("confirm-a1"));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("confirm-a1")).toBeNull();
    });
    expect(screen.getByTestId("assignment-a2")).toBeTruthy();
  });
});
