// Testes derivados do Done-when de T6 (tasks.md, MOB-09-01/02): lista os
// grupos com nome/horário/papel, estado vazio, erro de rede, e navegação
// pro detalhe do grupo.
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockListMyGroups = jest.fn();
jest.mock("../../../lib/pequenos-grupos/pequenos-grupos-client", () => ({
  listMyGroups: (...args: unknown[]) => mockListMyGroups(...args),
}));

import GruposScreen from "../../../app/(tabs)/grupos";

describe("GruposScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lista os grupos com nome, papel e horário (AC1)", async () => {
    mockListMyGroups.mockResolvedValue([
      { id: "sg1", name: "Grupo do Bairro", meeting_time: "19:30", recurrence: "weekly", role: "leader" },
    ]);

    await act(async () => {
      render(<GruposScreen />);
    });

    const card = screen.getByTestId("grupo-sg1");
    expect(within(card).getByText("Grupo do Bairro")).toBeTruthy();
    expect(within(card).getByTestId("grupo-sg1-papel")).toHaveTextContent("Líder");
    expect(within(card).getByText("19:30")).toBeTruthy();
  });

  it("grupo sem meeting_time não mostra o horário", async () => {
    mockListMyGroups.mockResolvedValue([
      { id: "sg1", name: "Grupo da Vila", meeting_time: null, recurrence: null, role: "member" },
    ]);

    await act(async () => {
      render(<GruposScreen />);
    });

    const card = screen.getByTestId("grupo-sg1");
    expect(within(card).getByText("Grupo da Vila")).toBeTruthy();
    expect(within(card).getByTestId("grupo-sg1-papel")).toHaveTextContent("Membro");
    // sem meeting_time, a linha de horário não é renderizada
    expect(within(card).queryByText("19:30")).toBeNull();
  });

  it("lista vazia mostra 'Você não participa de nenhum grupo.' (AC2)", async () => {
    mockListMyGroups.mockResolvedValue([]);

    await act(async () => {
      render(<GruposScreen />);
    });

    expect(screen.getByTestId("grupos-empty")).toBeTruthy();
    expect(screen.getByText("Você não participa de nenhum grupo.")).toBeTruthy();
  });

  it("erro de rede mostra estado de erro explícito, não lista vazia (AC3)", async () => {
    mockListMyGroups.mockRejectedValue(new Error("network"));

    await act(async () => {
      render(<GruposScreen />);
    });

    expect(screen.getByTestId("grupos-error")).toBeTruthy();
    expect(
      screen.getByText("Não foi possível carregar seus grupos. Verifique sua conexão."),
    ).toBeTruthy();
  });

  it("erro de rede oferece tentar novamente, que refaz a busca (AC3)", async () => {
    mockListMyGroups.mockRejectedValueOnce(new Error("network"));
    mockListMyGroups.mockResolvedValueOnce([
      { id: "sg1", name: "Grupo do Bairro", meeting_time: null, recurrence: null, role: "member" },
    ]);

    await act(async () => {
      render(<GruposScreen />);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("grupos-retry"));
    });

    expect(mockListMyGroups).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("grupo-sg1")).toBeTruthy();
  });

  it("dois grupos com o mesmo nome aparecem ambos, distinguíveis por papel/horário (edge case)", async () => {
    mockListMyGroups.mockResolvedValue([
      { id: "sg1", name: "Célula Jovem", meeting_time: "19:00", recurrence: null, role: "leader" },
      { id: "sg2", name: "Célula Jovem", meeting_time: "20:00", recurrence: null, role: "member" },
    ]);

    await act(async () => {
      render(<GruposScreen />);
    });

    // Mesmo nome nos dois: o que os distingue é papel e horário, cada um
    // dentro do seu card.
    const first = screen.getByTestId("grupo-sg1");
    expect(within(first).getByTestId("grupo-sg1-papel")).toHaveTextContent("Líder");
    expect(within(first).getByText("19:00")).toBeTruthy();

    const second = screen.getByTestId("grupo-sg2");
    expect(within(second).getByTestId("grupo-sg2-papel")).toHaveTextContent("Membro");
    expect(within(second).getByText("20:00")).toBeTruthy();
  });

  it("toque num grupo navega para /grupo/[id]", async () => {
    mockListMyGroups.mockResolvedValue([
      { id: "sg1", name: "Grupo do Bairro", meeting_time: null, recurrence: null, role: "leader" },
    ]);

    await act(async () => {
      render(<GruposScreen />);
    });
    fireEvent.press(screen.getByTestId("grupo-sg1"));

    expect(mockPush).toHaveBeenCalledWith("/grupo/sg1");
  });
});
