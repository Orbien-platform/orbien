// Testes derivados do Done-when de T6 (tasks.md, MOB-09-01/02): lista os
// grupos com nome/horário/papel, estado vazio, erro de rede, e navegação
// pro detalhe do grupo.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

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

    expect(screen.getByTestId("grupo-sg1")).toBeTruthy();
    expect(screen.getByText("Grupo do Bairro — Líder — 19:30")).toBeTruthy();
  });

  it("grupo sem meeting_time não mostra o horário", async () => {
    mockListMyGroups.mockResolvedValue([
      { id: "sg1", name: "Grupo da Vila", meeting_time: null, recurrence: null, role: "member" },
    ]);

    await act(async () => {
      render(<GruposScreen />);
    });

    expect(screen.getByText("Grupo da Vila — Membro")).toBeTruthy();
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
