// Testes derivados do Done-when de T7 (tasks.md, Rodada 2, MOB-04) e de T5
// (.specs/features/mobile-home-redesign/tasks.md, MHR-03): lista renderiza
// (AC 1), confirmar/recusar atualiza sem refetch (AC 2), check-in some após
// sucesso (AC 3), erro de rede mostra estado explícito (Edge Case da spec).
// Migrado 1:1 de src/__tests__/app/(tabs)/index.test.tsx — mesma suíte, só
// o import do componente mudou de `(tabs)/index` para `escala` (T5).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
// `useFocusEffect` roda no primeiro foco e devolve a limpeza ao desmontar,
// como na navegação real.
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (callback: () => () => void) => {
      useEffect(() => callback(), [callback]);
    },
  };
});

const mockGetMyAssignments = jest.fn();
const mockRespondToAssignment = jest.fn();
const mockCheckIn = jest.fn();
const mockGetMySwapRequests = jest.fn();
const mockRespondToSwap = jest.fn();
const mockGetMyVolunteerProfile = jest.fn();
jest.mock("../../lib/escala/escala-client", () => ({
  getMyAssignments: (...args: unknown[]) => mockGetMyAssignments(...args),
  respondToAssignment: (...args: unknown[]) => mockRespondToAssignment(...args),
  checkIn: (...args: unknown[]) => mockCheckIn(...args),
  getMySwapRequests: (...args: unknown[]) => mockGetMySwapRequests(...args),
  respondToSwap: (...args: unknown[]) => mockRespondToSwap(...args),
  getMyVolunteerProfile: (...args: unknown[]) => mockGetMyVolunteerProfile(...args),
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

const SWAP_REQUEST = {
  id: "r1",
  status: "pending",
  message: null,
  created_at: "2026-09-01T12:00:00.000Z",
  responded_at: null,
  assignment: {
    id: "a1",
    scheduled_date: "2026-09-13T00:00:00.000Z",
    celebration: { name: "Culto de domingo", start_time: "09:30" },
    ministry: { id: "m1", name: "Louvor" },
  },
  requester: { volunteer_profile_id: "vp-me", full_name: "Caio Freitas" },
  target: null,
  accepted_by: null,
};

describe("EscalaScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMySwapRequests.mockResolvedValue({ incoming: [], outgoing: [] });
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

describe("EscalaScreen — troca e perfil (v2)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMySwapRequests.mockResolvedValue({ incoming: [], outgoing: [] });
  });

  it("escala pendente ou confirmada sem check-in oferece Pedir troca, que abre a pilha com o cabeçalho", async () => {
    mockGetMyAssignments.mockResolvedValue([
      { ...PENDING_ASSIGNMENT, scheduled_date: "2026-09-13T00:00:00.000Z", celebration: { id: "c1", name: "Culto", start_time: "09:30" } },
      CONFIRMED_ASSIGNMENT,
      { ...CONFIRMED_ASSIGNMENT, id: "a3", checked_in_at: "2026-09-13T12:00:00.000Z" },
      { ...PENDING_ASSIGNMENT, id: "a4", status: "declined" },
    ]);

    await render(<EscalaScreen />);
    await waitFor(() => screen.getByTestId("swap-a1"));

    expect(screen.getByTestId("swap-a2")).toBeTruthy();
    expect(screen.queryByTestId("swap-a3")).toBeNull();
    expect(screen.queryByTestId("swap-a4")).toBeNull();

    await fireEvent.press(screen.getByTestId("swap-a1"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/troca/[id]",
      params: { id: "a1", ministerio: "Louvor", quando: "dom, 13 set · 09:30" },
    });
  });

  it("escala sem data navega com o cabeçalho só do ministério", async () => {
    mockGetMyAssignments.mockResolvedValue([{ ...CONFIRMED_ASSIGNMENT, scheduled_date: "sem data" }]);

    await render(<EscalaScreen />);
    await waitFor(() => screen.getByTestId("swap-a2"));
    await fireEvent.press(screen.getByTestId("swap-a2"));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ params: { id: "a2", ministerio: "Louvor", quando: "" } }),
    );
  });

  it("escala com pedido em aberto mostra a quem foi pedido no lugar do botão", async () => {
    mockGetMyAssignments.mockResolvedValue([PENDING_ASSIGNMENT, CONFIRMED_ASSIGNMENT]);
    mockGetMySwapRequests.mockResolvedValue({
      incoming: [],
      outgoing: [
        SWAP_REQUEST,
        {
          ...SWAP_REQUEST,
          id: "r2",
          assignment: { ...SWAP_REQUEST.assignment, id: "a2" },
          target: { volunteer_profile_id: "vp-bia", full_name: "Bianca Lopes" },
        },
        // resolvido: não conta como aberto
        { ...SWAP_REQUEST, id: "r3", status: "declined", assignment: { ...SWAP_REQUEST.assignment, id: "a9" } },
      ],
    });

    await render(<EscalaScreen />);
    await waitFor(() => screen.getByTestId("swap-open-a1"));

    expect(screen.getByText("Troca pedida ao ministério")).toBeTruthy();
    expect(screen.getByText("Troca pedida a Bianca Lopes")).toBeTruthy();
    expect(screen.queryByTestId("swap-a1")).toBeNull();
  });

  it("falha ao carregar os pedidos não derruba as escalas, e a aba Trocas mostra os vazios", async () => {
    mockGetMyAssignments.mockResolvedValue([PENDING_ASSIGNMENT]);
    mockGetMySwapRequests.mockRejectedValue(new Error("500"));

    await render(<EscalaScreen />);
    await waitFor(() => screen.getByTestId("swap-a1"));

    await fireEvent.press(screen.getByTestId("escala-abas-trocas"));
    expect(screen.getByTestId("trocas-recebidas-vazio")).toBeTruthy();
    expect(screen.queryByTestId("escala-list")).toBeNull();
  });

  it("aba Trocas conta os pedidos recebidos e aceitar recarrega escalas e pedidos", async () => {
    mockGetMyAssignments.mockResolvedValue([]);
    mockGetMySwapRequests.mockResolvedValue({
      incoming: [{ ...SWAP_REQUEST, requester: { volunteer_profile_id: "vp-ana", full_name: "Ana Souza" } }],
      outgoing: [],
    });
    mockRespondToSwap.mockResolvedValue({ ...SWAP_REQUEST, status: "accepted" });

    await render(<EscalaScreen />);
    await waitFor(() => screen.getByLabelText("Trocas, 1 pendentes"));

    await fireEvent.press(screen.getByTestId("escala-abas-trocas"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("troca-aceitar-r1"));
    });

    expect(mockRespondToSwap).toHaveBeenCalledWith("r1", "accept");
    expect(mockGetMyAssignments).toHaveBeenCalledTimes(2);
    expect(mockGetMySwapRequests).toHaveBeenCalledTimes(2);
  });

  it("aba Meu perfil monta o painel do perfil; Próximas volta à lista", async () => {
    mockGetMyAssignments.mockResolvedValue([]);
    mockGetMyVolunteerProfile.mockReturnValue(new Promise(() => undefined));

    await render(<EscalaScreen />);
    await waitFor(() => screen.getByTestId("escala-empty"));

    await fireEvent.press(screen.getByTestId("escala-abas-perfil"));
    expect(mockGetMyVolunteerProfile).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("escala-list")).toBeNull();

    await fireEvent.press(screen.getByTestId("escala-abas-proximas"));
    expect(screen.getByTestId("escala-list")).toBeTruthy();
  });

  it("antes de os pedidos chegarem, a aba Trocas fica vazia e não há botão de troca", async () => {
    mockGetMyAssignments.mockResolvedValue([PENDING_ASSIGNMENT]);
    mockGetMySwapRequests.mockReturnValue(new Promise(() => undefined));

    await render(<EscalaScreen />);
    await waitFor(() => screen.getByTestId("assignment-a1"));
    expect(screen.queryByTestId("swap-a1")).toBeNull();

    await fireEvent.press(screen.getByTestId("escala-abas-trocas"));
    expect(screen.queryByTestId("trocas")).toBeNull();
  });

  it("pedidos que chegam depois de a tela desmontar são ignorados, sucesso ou falha", async () => {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: unknown) => void;
    mockGetMyAssignments.mockReturnValue(new Promise(() => undefined));
    mockGetMySwapRequests
      .mockReturnValueOnce(new Promise((r) => (resolve = r)))
      .mockReturnValueOnce(new Promise((_, r) => (reject = r)));

    const first = await render(<EscalaScreen />);
    await act(async () => first.unmount());
    const second = await render(<EscalaScreen />);
    await act(async () => second.unmount());
    await act(async () => {
      resolve({ incoming: [], outgoing: [] });
      reject(new Error("falha"));
    });

    expect(screen.queryByTestId("escala-abas")).toBeNull();
  });
});
