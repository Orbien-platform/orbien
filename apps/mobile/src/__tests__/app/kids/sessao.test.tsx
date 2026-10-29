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

type Permission = { granted: boolean; canAskAgain: boolean };
let mockPermission: Permission = { granted: true, canAskAgain: true };
let mockCameraProps: Record<string, unknown> = {};
jest.mock("expo-camera", () => {
  const { View } = jest.requireActual("react-native");
  return {
    useCameraPermissions: () => [mockPermission, jest.fn()],
    CameraView: (props: Record<string, unknown>) => {
      mockCameraProps = props;
      return <View testID={props.testID as string} />;
    },
  };
});

const mockCheckInByQr = jest.fn();
const mockCheckOutByQr = jest.fn();
const mockGetRoster = jest.fn();
const mockCheckOut = jest.fn();
const mockOverride = jest.fn();
jest.mock("../../../lib/kids/kids-client", () => ({
  ...jest.requireActual("../../../lib/kids/kids-client"),
  getRoster: (...a: unknown[]) => mockGetRoster(...a),
  checkOut: (...a: unknown[]) => mockCheckOut(...a),
  checkInByQr: (...a: unknown[]) => mockCheckInByQr(...a),
  checkOutByQr: (...a: unknown[]) => mockCheckOutByQr(...a),
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
    mockPermission = { granted: true, canAskAgain: true };
    mockCameraProps = {};
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

  describe("Ler QR (MOB-3)", () => {
    const CHECKIN_QR = "kidsci1.tok.seg";
    const CHECKOUT_QR = "kidsco1.k1.7KQ2.assinatura";

    function scan(data: string) {
      const onScanned = mockCameraProps.onBarcodeScanned as (r: { type: string; data: string }) => void;
      onScanned({ type: "qr", data });
    }
    async function openScanner() {
      await press("sessao-ler-qr");
    }
    async function scanAndSettle(data: string) {
      await act(async () => {
        scan(data);
      });
    }

    beforeEach(() => {
      mockGetRoster.mockResolvedValue(roster([item("k1", "Ana Souza"), item("k2", "Beto Lima")]));
    });

    describe("QR de check-in", () => {
      it("faz o check-in pela sessão da tela, fecha o leitor e atualiza a lista", async () => {
        mockCheckInByQr.mockResolvedValue({ id: "k9" });
        await renderScreen();
        await openScanner();
        await scanAndSettle(CHECKIN_QR);

        expect(mockCheckInByQr).toHaveBeenCalledWith("s1", { qr: CHECKIN_QR });
        expect(screen.getByTestId("sessao-qr-mensagem").props.children).toBe("Check-in feito");
        expect(screen.queryByTestId("scanner")).toBeNull();
        expect(mockGetRoster).toHaveBeenCalledTimes(2);
      });

      it("QR que não é do Kids fica no leitor com o aviso e não chama a API", async () => {
        await renderScreen();
        await openScanner();
        await scanAndSettle("https://exemplo.com/cardapio");
        expect(screen.getByTestId("scanner-aviso")).toBeTruthy();
        expect(screen.getByTestId("scanner")).toBeTruthy();
        expect(mockCheckInByQr).not.toHaveBeenCalled();
        expect(mockCheckOutByQr).not.toHaveBeenCalled();
      });

      it("403 mostra só a mensagem genérica, sem dizer se expirou, foi usado ou é falso", async () => {
        mockCheckInByQr.mockRejectedValue(new HttpError(403, { message: "qr expirado" }));
        await renderScreen();
        await openScanner();
        await scanAndSettle(CHECKIN_QR);
        expect(screen.getByTestId("sessao-qr-mensagem").props.children).toBe(
          "Não foi possível validar o QR. Peça um novo ao responsável.",
        );
      });

      it("fora da faixa que aceita: pede confirmação e reenvia com confirm_out_of_range", async () => {
        mockCheckInByQr
          .mockRejectedValueOnce(new HttpError(422, { code: "OUT_OF_RANGE_CONFIRM", message: "fora" }))
          .mockResolvedValueOnce({ id: "k9" });
        await renderScreen();
        await openScanner();
        await scanAndSettle(CHECKIN_QR);
        expect(screen.getByTestId("sessao-qr-confirmar")).toBeTruthy();
        expect(screen.queryByTestId("sessao-qr-mensagem")).toBeNull();

        await press("sessao-qr-confirmar-sim");
        expect(mockCheckInByQr).toHaveBeenLastCalledWith("s1", { qr: CHECKIN_QR, confirm_out_of_range: true });
        expect(screen.queryByTestId("sessao-qr-confirmar")).toBeNull();
        expect(screen.getByTestId("sessao-qr-mensagem").props.children).toBe("Check-in feito");
      });

      it("recusar a confirmação de faixa descarta o pedido", async () => {
        mockCheckInByQr.mockRejectedValue(new HttpError(422, { code: "OUT_OF_RANGE_CONFIRM" }));
        await renderScreen();
        await openScanner();
        await scanAndSettle(CHECKIN_QR);
        await press("sessao-qr-confirmar-nao");
        expect(screen.queryByTestId("sessao-qr-confirmar")).toBeNull();
        expect(mockCheckInByQr).toHaveBeenCalledTimes(1);
      });

      it("turma que não aceita a idade, regra da API (409) e falha de rede têm mensagem própria", async () => {
        mockCheckInByQr.mockRejectedValueOnce(new HttpError(422, { code: "kids_out_of_range" }));
        await renderScreen();
        await openScanner();
        await scanAndSettle(CHECKIN_QR);
        expect(screen.getByTestId("sessao-qr-mensagem").props.children).toBe(
          "Esta turma não aceita a idade da criança. Use outra turma.",
        );

        mockCheckInByQr.mockRejectedValueOnce(new HttpError(409, { message: "A criança já está presente." }));
        await openScanner();
        await scanAndSettle(CHECKIN_QR);
        expect(screen.getByTestId("sessao-qr-mensagem").props.children).toBe("A criança já está presente.");

        mockCheckInByQr.mockRejectedValueOnce(new NetworkError());
        await openScanner();
        await scanAndSettle(CHECKIN_QR);
        expect(screen.getByTestId("sessao-qr-mensagem").props.children).toBe(
          "Não foi possível fazer o check-in. Tente novamente.",
        );
      });
    });

    describe("QR de check-out", () => {
      it("acha o check-in pelo id embutido, pede quem retira e entrega com o qr (sem digitar código)", async () => {
        mockCheckOutByQr.mockResolvedValue({ id: "k1" });
        await renderScreen();
        await openScanner();
        await scanAndSettle(CHECKOUT_QR);

        expect(screen.getByTestId("sessao-qr-lido")).toBeTruthy();
        expect(screen.queryByTestId("sessao-codigo")).toBeNull();
        await press("sessao-confirmar");
        expect(mockCheckOutByQr).not.toHaveBeenCalled();

        await type("sessao-quem", "Marta Souza");
        await press("sessao-confirmar");
        expect(mockCheckOutByQr).toHaveBeenCalledWith("k1", { qr: CHECKOUT_QR, picked_up_by_name: "Marta Souza" });
        expect(mockCheckOut).not.toHaveBeenCalled();
        expect(screen.queryByText("Ana Souza")).toBeNull();
        expect(screen.getByTestId("sessao-entregue")).toBeTruthy();
      });

      it("QR de criança que não está na lista desta turma não abre entrega", async () => {
        await renderScreen();
        await openScanner();
        await scanAndSettle("kidsco1.outro.7KQ2.assinatura");
        expect(screen.getByTestId("sessao-qr-mensagem").props.children).toBe(
          "Esta criança não está na lista desta turma.",
        );
        expect(screen.queryByTestId("sessao-qr-lido")).toBeNull();
      });

      it("a equipe pode trocar o QR pelo código digitado", async () => {
        await renderScreen();
        await openScanner();
        await scanAndSettle(CHECKOUT_QR);
        await press("sessao-digitar-codigo");
        expect(screen.getByTestId("sessao-codigo")).toBeTruthy();
        expect(screen.queryByTestId("sessao-qr-lido")).toBeNull();
      });

      it("recusa 403 do QR é a mesma mensagem do código errado", async () => {
        mockCheckOutByQr.mockRejectedValue(new HttpError(403, { message: "x" }));
        await renderScreen();
        await openScanner();
        await scanAndSettle(CHECKOUT_QR);
        await type("sessao-quem", "Fulano");
        await press("sessao-confirmar");
        expect(screen.getByTestId("sessao-recusa").props.children).toBe(
          "Este código não é de quem está buscando. Chame o líder kids.",
        );
      });
    });

    describe("recusas seguidas no mesmo check-in", () => {
      async function refuseByQr(times: number) {
        mockCheckOutByQr.mockRejectedValue(new HttpError(403, { message: "x" }));
        for (let i = 0; i < times; i += 1) {
          await openScanner();
          await scanAndSettle(CHECKOUT_QR);
          await type("sessao-quem", "Fulano");
          await press("sessao-confirmar");
        }
      }

      it("até a segunda recusa não escala; na terceira manda chamar o líder kids", async () => {
        await renderScreen();
        await refuseByQr(2);
        expect(screen.queryByTestId("sessao-lider")).toBeNull();
        await refuseByQr(1);
        expect(screen.getByTestId("sessao-lider").props.children).toMatch(/Chame o líder kids/);
        // A API segue respondendo o mesmo 403: a mensagem da recusa não muda.
        expect(screen.getByTestId("sessao-recusa").props.children).toBe(
          "Este código não é de quem está buscando. Chame o líder kids.",
        );
      });

      it("para o líder, a retirada por exceção vira o botão principal", async () => {
        mockRoles = ["ministry_leader"];
        await renderScreen();
        await refuseByQr(3);
        const override = screen.getByTestId("sessao-override");
        expect(screen.getByText("Autorizar sem código (retirada por exceção)")).toBeTruthy();
        await act(async () => {
          fireEvent.press(override);
        });
        expect(screen.getByTestId("sessao-motivo")).toBeTruthy();
      });

      it("voluntário vê o aviso para chamar o líder e não ganha a exceção", async () => {
        await renderScreen();
        await refuseByQr(3);
        expect(screen.getByTestId("sessao-lider")).toBeTruthy();
        expect(screen.queryByTestId("sessao-override")).toBeNull();
      });

      it("conta QR e código digitado juntos, e só por check-in", async () => {
        mockCheckOut.mockRejectedValue(new HttpError(403, { message: "x" }));
        await renderScreen();
        await refuseByQr(2);
        await press("sessao-digitar-codigo");
        await type("sessao-codigo", "ZZZZ");
        await type("sessao-quem", "Fulano");
        await press("sessao-confirmar");
        expect(screen.getByTestId("sessao-lider")).toBeTruthy();

        // Outra criança começa do zero.
        await press("sessao-cancelar");
        await press("presente-k2-entregar");
        await type("sessao-codigo", "ZZZZ");
        await type("sessao-quem", "Fulano");
        await press("sessao-confirmar");
        expect(screen.queryByTestId("sessao-lider")).toBeNull();
      });

      it("recusa de outro tipo (rede) não conta", async () => {
        mockCheckOutByQr.mockRejectedValue(new NetworkError());
        await renderScreen();
        for (let i = 0; i < 3; i += 1) {
          await openScanner();
          await scanAndSettle(CHECKOUT_QR);
          await type("sessao-quem", "Fulano");
          await press("sessao-confirmar");
        }
        expect(screen.queryByTestId("sessao-lider")).toBeNull();
      });
    });

    describe("câmera", () => {
      it("permissão negada: estado claro e o caminho de digitar o código segue funcionando", async () => {
        mockPermission = { granted: false, canAskAgain: false };
        await renderScreen();
        await openScanner();
        expect(screen.getByTestId("scanner-permissao-negada")).toBeTruthy();

        await press("scanner-digitar");
        expect(screen.queryByTestId("scanner-permissao-negada")).toBeNull();
        await press("presente-k1-entregar");
        expect(screen.getByTestId("sessao-codigo")).toBeTruthy();
      });

      it("abrir a entrega fecha o leitor", async () => {
        await renderScreen();
        await openScanner();
        expect(screen.getByTestId("scanner")).toBeTruthy();
        await press("presente-k1-entregar");
        expect(screen.queryByTestId("scanner")).toBeNull();
      });
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
