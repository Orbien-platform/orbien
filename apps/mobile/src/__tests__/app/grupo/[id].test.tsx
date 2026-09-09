// Testes derivados do Done-when de T7 (tasks.md, MOB-09-03): encontros
// ordenados por occurred_at desc, estado vazio, erro, navegação.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "sg1" }),
  useRouter: () => ({ push: mockPush }),
}));

const mockListMeetings = jest.fn();
jest.mock("../../../lib/pequenos-grupos/pequenos-grupos-client", () => ({
  listMeetings: (...args: unknown[]) => mockListMeetings(...args),
}));

import GrupoScreen from "../../../app/grupo/[id]";

describe("GrupoScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lista os encontros ordenados por occurred_at desc (MOB-09-03)", async () => {
    mockListMeetings.mockResolvedValue([
      { id: "m1", occurred_at: "2026-08-01T19:00:00.000Z", topic: "Encontro antigo" },
      { id: "m2", occurred_at: "2026-09-01T19:00:00.000Z", topic: "Encontro recente" },
    ]);

    await act(async () => {
      render(<GrupoScreen />);
    });

    const list = screen.getByTestId("grupo-meetings-list");
    expect(list.props.data.map((m: { id: string }) => m.id)).toEqual(["m2", "m1"]);
  });

  it("lista vazia mostra 'Nenhum encontro registrado.'", async () => {
    mockListMeetings.mockResolvedValue([]);

    await act(async () => {
      render(<GrupoScreen />);
    });

    expect(screen.getByTestId("grupo-empty")).toBeTruthy();
    expect(screen.getByText("Nenhum encontro registrado.")).toBeTruthy();
  });

  it("erro de rede mostra estado de erro explícito", async () => {
    mockListMeetings.mockRejectedValue(new Error("network"));

    await act(async () => {
      render(<GrupoScreen />);
    });

    expect(screen.getByTestId("grupo-error")).toBeTruthy();
    expect(
      screen.getByText("Não foi possível carregar os encontros. Verifique sua conexão."),
    ).toBeTruthy();
  });

  it("erro de rede oferece tentar novamente, que refaz a busca", async () => {
    mockListMeetings.mockRejectedValueOnce(new Error("network"));
    mockListMeetings.mockResolvedValueOnce([
      { id: "m1", occurred_at: "2026-09-01T19:00:00.000Z", topic: "Encontro" },
    ]);

    await act(async () => {
      render(<GrupoScreen />);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("grupo-retry"));
    });

    expect(mockListMeetings).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("encontro-m1")).toBeTruthy();
  });

  it("toque num encontro navega para /grupo/encontro/[id]", async () => {
    mockListMeetings.mockResolvedValue([
      { id: "m1", occurred_at: "2026-09-01T19:00:00.000Z", topic: "Encontro" },
    ]);

    await act(async () => {
      render(<GrupoScreen />);
    });
    fireEvent.press(screen.getByTestId("encontro-m1"));

    expect(mockPush).toHaveBeenCalledWith("/grupo/encontro/m1");
  });
});
