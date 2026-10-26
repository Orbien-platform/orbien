// Kids — lista de filhos (T31, KIDS-04): linhas, vazio, erro, retomada.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (callback: () => () => void) => {
      useEffect(() => callback(), [callback]);
    },
  };
});

const mockListChildren = jest.fn();
jest.mock("../../../lib/kids/kids-client", () => ({
  ...jest.requireActual("../../../lib/kids/kids-client"),
  listChildren: (...args: unknown[]) => mockListChildren(...args),
}));

import { NetworkError } from "../../../lib/api/errors";
import KidsScreen from "../../../app/kids/index";

const NOW = new Date("2026-10-26T12:00:00Z");

async function press(testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}

describe("KidsScreen (filhos do responsável)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "setTimeout", "clearTimeout"] });
  });
  afterEach(() => jest.useRealTimers());

  it("lista os filhos como linhas, com nome e idade", async () => {
    mockListChildren.mockResolvedValue([
      { id: "c1", full_name: "Ana Souza", birth_date: "2024-07-26T00:00:00.000Z", household_id: "h" },
      { id: "c2", full_name: "Beto Souza", birth_date: null, household_id: "h" },
    ]);
    await act(async () => {
      render(<KidsScreen />);
    });
    expect(screen.getByText("Ana Souza")).toBeTruthy();
    expect(screen.getByText("2 anos e 3 meses")).toBeTruthy();
    expect(screen.getByText("Beto Souza")).toBeTruthy();

    await press("kids-child-c1");
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/kids/crianca/[id]", params: { id: "c1" } });
  });

  it("sem filhos, convida a cadastrar", async () => {
    mockListChildren.mockResolvedValue([]);
    await act(async () => {
      render(<KidsScreen />);
    });
    expect(screen.getByTestId("kids-empty")).toBeTruthy();
    expect(screen.getByText("Nenhum filho cadastrado")).toBeTruthy();
  });

  it("não mostra 'nenhum filho' antes da resposta chegar", async () => {
    mockListChildren.mockReturnValue(new Promise(() => undefined));
    await act(async () => {
      render(<KidsScreen />);
    });
    expect(screen.queryByTestId("kids-empty")).toBeNull();
  });

  it("ação fixa cadastra criança e o termo tem entrada própria", async () => {
    mockListChildren.mockResolvedValue([]);
    await act(async () => {
      render(<KidsScreen />);
    });
    await press("kids-add");
    await press("kids-consent-link");
    expect(mockPush.mock.calls).toEqual([["/kids/crianca/novo"], ["/kids/consentimento"]]);
  });

  it("falha de rede mostra o estado de erro e tenta de novo", async () => {
    mockListChildren.mockRejectedValueOnce(new NetworkError());
    await act(async () => {
      render(<KidsScreen />);
    });
    expect(screen.getByTestId("kids-error")).toBeTruthy();
    expect(screen.getByText(/Verifique sua conexão/)).toBeTruthy();

    mockListChildren.mockResolvedValueOnce([]);
    await press("kids-retry");
    expect(screen.getByTestId("kids-empty")).toBeTruthy();
  });

  it("erro do servidor não culpa a conexão", async () => {
    mockListChildren.mockRejectedValueOnce(new Error("500"));
    await act(async () => {
      render(<KidsScreen />);
    });
    expect(screen.getByText("Não foi possível carregar seus filhos.")).toBeTruthy();
  });
});
