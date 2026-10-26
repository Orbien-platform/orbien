// Kids — código de retirada (T32, KIDS-08): o código grande, a consulta
// posterior, o vazio e o erro.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

let mockParams: Record<string, string> = { id: "c1" };
jest.mock("expo-router", () => ({ useLocalSearchParams: () => mockParams }));

const mockGetOpen = jest.fn();
jest.mock("../../../lib/kids/kids-client", () => ({
  ...jest.requireActual("../../../lib/kids/kids-client"),
  getOpenCheckin: (...a: unknown[]) => mockGetOpen(...a),
}));

import { NetworkError } from "../../../lib/api/errors";
import CodigoScreen from "../../../app/kids/codigo/[id]";

const OPEN = {
  id: "k1",
  session_id: "s1",
  room: { id: "r1", name: "Maternal" },
  checked_in_at: "2026-10-26T13:05:00.000Z",
  code: "7KQ2",
};

async function renderScreen() {
  await act(async () => {
    render(<CodigoScreen />);
  });
}

describe("CodigoScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: "c1" };
  });

  it("mostra o código de retirada e a turma, consultando pelo id do filho", async () => {
    mockGetOpen.mockResolvedValue(OPEN);
    await renderScreen();
    expect(mockGetOpen).toHaveBeenCalledWith("c1");
    expect(screen.getByTestId("codigo-valor").props.children).toBe("7KQ2");
    expect(screen.getByText("Turma Maternal")).toBeTruthy();
    expect(screen.queryByTestId("codigo-feito")).toBeNull();
  });

  it("logo após o check-in, confirma com 'Check-in feito'", async () => {
    mockParams = { id: "c1", feito: "1" };
    mockGetOpen.mockResolvedValue(OPEN);
    await renderScreen();
    expect(screen.getByTestId("codigo-feito").props.children).toBe("Check-in feito");
  });

  it("sem check-in aberto, explica quando o código aparece", async () => {
    mockGetOpen.mockResolvedValue(null);
    await renderScreen();
    expect(screen.getByTestId("codigo-empty")).toBeTruthy();
    expect(screen.queryByTestId("codigo-valor")).toBeNull();
  });

  it("não desenha vazio nem código antes da resposta", async () => {
    mockGetOpen.mockReturnValue(new Promise(() => undefined));
    await renderScreen();
    expect(screen.queryByTestId("codigo-empty")).toBeNull();
    expect(screen.queryByTestId("codigo-valor")).toBeNull();
  });

  it("falha de rede mostra o erro e tenta de novo", async () => {
    mockGetOpen.mockRejectedValueOnce(new NetworkError()).mockResolvedValueOnce(OPEN);
    await renderScreen();
    expect(screen.getByTestId("codigo-error")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("codigo-retry"));
    });
    expect(screen.getByTestId("codigo-valor")).toBeTruthy();
  });
});
