// Kids — turma da sessão para a equipe (T33, KIDS-09): roster sem código,
// entrega por código com recusa genérica, override do líder com motivo.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    useLocalSearchParams: () => ({ id: "s1" }),
    useFocusEffect: (callback: () => () => void) => {
      useEffect(() => callback(), [callback]);
    },
  };
});

let mockRoles: string[] = ["volunteer"];
jest.mock("../../../lib/auth/auth-provider", () => ({
  useAuth: () => ({ session: { accessToken: "tok" } }),
}));
jest.mock("../../../lib/auth/jwt", () => ({
  decodeJwtPayload: () => ({ roles: mockRoles }),
}));

const mockGetRoster = jest.fn();
const mockCheckOut = jest.fn();
const mockOverride = jest.fn();
jest.mock("../../../lib/kids/kids-client", () => ({
  ...jest.requireActual("../../../lib/kids/kids-client"),
  getRoster: (...a: unknown[]) => mockGetRoster(...a),
  checkOut: (...a: unknown[]) => mockCheckOut(...a),
  checkOutOverride: (...a: unknown[]) => mockOverride(...a),
}));

import { HttpError, NetworkError } from "../../../lib/api/errors";
import SessaoScreen from "../../../app/kids/sessao/[id]";

const item = (id: string, name: string, over: object = {}) => ({
  checkin_id: id,
  checked_in_at: "2026-10-26T13:00:00Z",
  age_override: false,
  child: { id: `c-${id}`, full_name: name, birth_date: "2022-01-01T00:00:00Z" },
  guardian: { person_id: "p1", full_name: "Marta Souza" },
  has_allergy: false,
  allergies: null,
  ...over,
});
const roster = (items: ReturnType<typeof item>[], capacity: number | null = 12) => ({
  session: { id: "s1", status: "open", room: { id: "r1", name: "Maternal", capacity } },
  present_count: items.length,
  items,
});

async function renderScreen() {
  await act(async () => {
    render(<SessaoScreen />);
  });
}
async function press(testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}
async function type(testID: string, text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByTestId(testID), text);
  });
}

describe("SessaoScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoles = ["volunteer"];
  });

  it("lista as crianças presentes, a contagem com a capacidade e nunca o código", async () => {
    mockGetRoster.mockResolvedValue(roster([item("k1", "Ana Souza"), item("k2", "Beto Lima")]));
    await renderScreen();
    expect(mockGetRoster).toHaveBeenCalledWith("s1");
    expect(screen.getByText("Ana Souza")).toBeTruthy();
    expect(screen.getByText("Beto Lima")).toBeTruthy();
    expect(screen.getAllByText("Entregue por Marta Souza")).toHaveLength(2);
    expect(screen.getByTestId("sessao-contagem").props.children).toEqual(["2 crianças presentes", " de 12"]);
    expect(screen.queryByTestId("sessao-codigo")).toBeNull();
  });

  it("uma criança, sem capacidade definida", async () => {
    mockGetRoster.mockResolvedValue(roster([item("k1", "Ana Souza")], null));
    await renderScreen();
    expect(screen.getByTestId("sessao-contagem").props.children).toEqual(["1 criança presente", ""]);
  });

  it("alergia aparece com ícone e texto; sem alergia, nada", async () => {
    mockGetRoster.mockResolvedValue(
      roster([item("k1", "Ana Souza", { has_allergy: true, allergies: "amendoim" }), item("k2", "Beto Lima")]),
    );
    await renderScreen();
    expect(screen.getByText("Alergia: amendoim")).toBeTruthy();
    expect(screen.queryByTestId("presente-k2-alergia")).toBeNull();
  });

  it("turma vazia convida a esperar o check-in", async () => {
    mockGetRoster.mockResolvedValue(roster([]));
    await renderScreen();
    expect(screen.getByTestId("sessao-vazia")).toBeTruthy();
    expect(screen.getByText("Nenhuma criança presente")).toBeTruthy();
  });

  describe("entrega por código", () => {
    beforeEach(() => {
      mockGetRoster.mockResolvedValue(roster([item("k1", "Ana Souza"), item("k2", "Beto Lima")]));
    });

    it("entrega com o código, tira a criança da lista e confirma 'Criança entregue'", async () => {
      mockCheckOut.mockResolvedValue({ id: "k1" });
      await renderScreen();
      await press("presente-k1-entregar");
      await type("sessao-codigo", "7kq2");
      await type("sessao-quem", "Marta Souza");
      await press("sessao-confirmar");

      expect(mockCheckOut).toHaveBeenCalledWith("k1", { code: "7kq2", picked_up_by_name: "Marta Souza" });
      expect(screen.queryByText("Ana Souza")).toBeNull();
      expect(screen.getByText("Beto Lima")).toBeTruthy();
      expect(screen.getByTestId("sessao-entregue").props.children).toBe("Criança entregue");
    });

    it("sem código e nome, o botão não envia", async () => {
      await renderScreen();
      await press("presente-k1-entregar");
      await press("sessao-confirmar");
      expect(mockCheckOut).not.toHaveBeenCalled();
    });

    it("recusa 403 mostra a mensagem genérica, sem dizer o que falhou", async () => {
      mockCheckOut.mockRejectedValue(new HttpError(403, { message: "Não foi possível confirmar a retirada. Chame o líder kids." }));
      await renderScreen();
      await press("presente-k1-entregar");
      await type("sessao-codigo", "ZZZZ");
      await type("sessao-quem", "Fulano");
      await press("sessao-confirmar");

      expect(screen.getByTestId("sessao-recusa").props.children).toBe(
        "Este código não é de quem está buscando. Chame o líder kids.",
      );
      expect(screen.getByText("Ana Souza")).toBeTruthy();
      expect(screen.queryByTestId("sessao-entregue")).toBeNull();
    });

    it("falha de rede cai na mensagem genérica de ação", async () => {
      mockCheckOut.mockRejectedValue(new NetworkError());
      await renderScreen();
      await press("presente-k1-entregar");
      await type("sessao-codigo", "7KQ2");
      await type("sessao-quem", "Marta");
      await press("sessao-confirmar");
      expect(screen.getByTestId("sessao-recusa").props.children).toBe(
        "Não foi possível entregar a criança. Tente novamente.",
      );
    });

    it("cancelar fecha o formulário", async () => {
      await renderScreen();
      await press("presente-k1-entregar");
      await press("sessao-cancelar");
      expect(screen.queryByTestId("sessao-codigo")).toBeNull();
      expect(screen.getByTestId("presente-k1-entregar")).toBeTruthy();
    });

    it("voluntário não vê o override", async () => {
      await renderScreen();
      await press("presente-k1-entregar");
      expect(screen.queryByTestId("sessao-override")).toBeNull();
    });
  });

  describe("override do líder", () => {
    beforeEach(() => {
      mockRoles = ["ministry_leader"];
      mockGetRoster.mockResolvedValue(roster([item("k1", "Ana Souza")]));
    });

    async function openOverride() {
      await renderScreen();
      await press("presente-k1-entregar");
      await press("sessao-override");
    }

    it("pede motivo e quem retira, e entrega sem código", async () => {
      mockOverride.mockResolvedValue({ id: "k1" });
      await openOverride();
      expect(screen.queryByTestId("sessao-codigo")).toBeNull();
      await type("sessao-motivo", "Esqueceu o código; conferi o documento");
      await type("sessao-quem", "Marta Souza");
      await press("sessao-confirmar");

      expect(mockOverride).toHaveBeenCalledWith("k1", {
        reason: "Esqueceu o código; conferi o documento",
        picked_up_by_name: "Marta Souza",
      });
      expect(mockCheckOut).not.toHaveBeenCalled();
      expect(screen.getByTestId("sessao-entregue")).toBeTruthy();
    });

    it("motivo curto demais não envia", async () => {
      await openOverride();
      await type("sessao-motivo", "ok");
      await type("sessao-quem", "Marta");
      await press("sessao-confirmar");
      expect(mockOverride).not.toHaveBeenCalled();
    });

    it("403 do override não usa a mensagem de código errado", async () => {
      mockOverride.mockRejectedValue(new HttpError(403, { message: "Forbidden" }));
      await openOverride();
      await type("sessao-motivo", "Esqueceu o código; conferi o documento");
      await type("sessao-quem", "Marta");
      await press("sessao-confirmar");
      expect(screen.getByTestId("sessao-recusa").props.children).toBe(
        "Não foi possível entregar a criança. Tente novamente.",
      );
    });
  });

  describe("carregamento", () => {
    it("sem permissão na turma (403), explica quem vê a lista", async () => {
      mockGetRoster.mockRejectedValue(new HttpError(403, { message: "Forbidden" }));
      await renderScreen();
      expect(screen.getByTestId("sessao-forbidden")).toBeTruthy();
    });

    it("erro de rede oferece tentar de novo", async () => {
      mockGetRoster.mockRejectedValueOnce(new NetworkError()).mockResolvedValueOnce(roster([]));
      await renderScreen();
      expect(screen.getByTestId("sessao-error")).toBeTruthy();
      await press("sessao-retry");
      expect(screen.getByTestId("sessao-vazia")).toBeTruthy();
    });
  });

  it("resposta que chega depois de sair da tela é descartada (sucesso, 403 e erro)", async () => {
    for (const settle of [
      (r: { res: (v: unknown) => void; rej: (e: unknown) => void }) => r.res(roster([])),
      (r: { res: (v: unknown) => void; rej: (e: unknown) => void }) => r.rej(new HttpError(403, {})),
      (r: { res: (v: unknown) => void; rej: (e: unknown) => void }) => r.rej(new NetworkError()),
    ]) {
      const handle = { res: (_v: unknown): void => undefined, rej: (_e: unknown): void => undefined };
      mockGetRoster.mockReturnValueOnce(
        new Promise((res, rej) => {
          handle.res = res;
          handle.rej = rej;
        }),
      );
      let view!: Awaited<ReturnType<typeof render>>;
      await act(async () => {
        view = await render(<SessaoScreen />);
      });
      await act(async () => {
        await view.unmount();
      });
      await act(async () => settle(handle));
      expect(screen.queryByTestId("sessao-vazia")).toBeNull();
      expect(screen.queryByTestId("sessao-forbidden")).toBeNull();
      expect(screen.queryByTestId("sessao-error")).toBeNull();
    }
  });

});
