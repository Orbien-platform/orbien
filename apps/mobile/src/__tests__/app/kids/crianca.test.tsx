// Kids — ficha do filho (T31/T32, KIDS-04/05/07): alergia em destaque,
// autorizados (editar, remover), código do check-in aberto, erros.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
let mockParams: Record<string, string> = { id: "c1" };
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    useRouter: () => ({ push: mockPush }),
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (callback: () => () => void) => {
      useEffect(() => callback(), [callback]);
    },
  };
});

const mockGetChild = jest.fn();
const mockGetOpen = jest.fn();
const mockListOpen = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
jest.mock("../../../lib/kids/kids-client", () => ({
  ...jest.requireActual("../../../lib/kids/kids-client"),
  getChild: (...a: unknown[]) => mockGetChild(...a),
  getOpenCheckin: (...a: unknown[]) => mockGetOpen(...a),
  listOpenSessions: (...a: unknown[]) => mockListOpen(...a),
  updateGuardian: (...a: unknown[]) => mockUpdate(...a),
  removeGuardian: (...a: unknown[]) => mockRemove(...a),
}));

import { HttpError, NetworkError } from "../../../lib/api/errors";
import CriancaScreen from "../../../app/kids/crianca/[id]";

const GUARDIAN = {
  id: "g1",
  guardian_person_id: "p1",
  full_name: "Marta Souza",
  phone: null,
  photo_url: null,
  relationship: "mãe",
  can_pickup: true,
  is_primary: true,
};
const FICHA = {
  id: "c1",
  full_name: "Ana Souza",
  birth_date: "2024-07-26T00:00:00.000Z",
  household_id: "h",
  allergies: null,
  medical_notes: null,
  guardians: [GUARDIAN],
};
const OPEN = { id: "k1", session_id: "s1", room: { id: "r1", name: "Maternal" }, checked_in_at: "2026-10-26T13:00:00Z", code: "7KQ2" };

async function renderScreen() {
  await act(async () => {
    render(<CriancaScreen />);
  });
}
async function press(testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}

describe("CriancaScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: "c1" };
    mockGetChild.mockResolvedValue(FICHA);
    mockGetOpen.mockResolvedValue(null);
    mockListOpen.mockResolvedValue([]);
  });

  it("mostra a alergia com ícone e texto, e a observação de saúde", async () => {
    mockGetChild.mockResolvedValue({ ...FICHA, allergies: "amendoim", medical_notes: "usa inalador" });
    await renderScreen();
    expect(screen.getByText("Alergia: amendoim")).toBeTruthy();
    expect(screen.getByText("Observação: usa inalador")).toBeTruthy();
  });

  it("sem alergia nem observação, não desenha nenhum dos dois", async () => {
    await renderScreen();
    expect(screen.queryByTestId("crianca-alergia")).toBeNull();
    expect(screen.queryByTestId("crianca-observacao")).toBeNull();
    expect(screen.getByText("Ana Souza")).toBeTruthy();
  });

  it("ficha sem nascimento não inventa idade", async () => {
    mockGetChild.mockResolvedValue({ ...FICHA, birth_date: null });
    await renderScreen();
    expect(screen.queryByText(/ano|mês|meses/)).toBeNull();
  });

  it("lista os autorizados, com o principal marcado", async () => {
    await renderScreen();
    expect(screen.getByText("Marta Souza")).toBeTruthy();
    expect(screen.getByText("mãe")).toBeTruthy();
    expect(screen.getByText("Principal")).toBeTruthy();
  });

  it("trocar 'pode retirar' grava e recarrega a ficha", async () => {
    mockUpdate.mockResolvedValue({});
    await renderScreen();
    await act(async () => {
      fireEvent(screen.getByTestId("autorizado-g1-retirar"), "valueChange", false);
    });
    expect(mockUpdate).toHaveBeenCalledWith("g1", { can_pickup: false });
    expect(mockGetChild).toHaveBeenCalledTimes(2);
  });

  it("trocar o principal grava is_primary", async () => {
    mockUpdate.mockResolvedValue({});
    await renderScreen();
    await act(async () => {
      fireEvent(screen.getByTestId("autorizado-g1-principal"), "valueChange", false);
    });
    expect(mockUpdate).toHaveBeenCalledWith("g1", { is_primary: false });
  });

  it("remover o último principal mostra a regra da API e não recarrega", async () => {
    mockRemove.mockRejectedValue(new HttpError(422, { message: "A criança precisa de ao menos um responsável principal" }));
    await renderScreen();
    await press("autorizado-g1-remover");
    expect(screen.getByTestId("crianca-action-error").props.children).toBe(
      "A criança precisa de ao menos um responsável principal",
    );
    expect(mockGetChild).toHaveBeenCalledTimes(1);
  });

  it("remover com sucesso recarrega a ficha", async () => {
    mockRemove.mockResolvedValue(undefined);
    await renderScreen();
    await press("autorizado-g1-remover");
    expect(mockRemove).toHaveBeenCalledWith("g1");
    expect(mockGetChild).toHaveBeenCalledTimes(2);
  });

  it("falha de rede ao salvar cai na mensagem genérica", async () => {
    mockUpdate.mockRejectedValue(new NetworkError());
    await renderScreen();
    await act(async () => {
      fireEvent(screen.getByTestId("autorizado-g1-retirar"), "valueChange", false);
    });
    expect(screen.getByTestId("crianca-action-error").props.children).toBe("Não foi possível salvar. Tente novamente.");
  });

  it("adicionar autorizado abre a tela própria", async () => {
    await renderScreen();
    await press("autorizado-adicionar");
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/kids/crianca/[id]/autorizado", params: { id: "c1" } });
  });

  describe("check-in", () => {
    it("com check-in aberto, avisa a turma e oferece o código no rodapé", async () => {
      mockGetOpen.mockResolvedValue(OPEN);
      await renderScreen();
      expect(screen.getByText("Check-in feito na turma Maternal.")).toBeTruthy();
      expect(screen.queryByTestId("crianca-checkin")).toBeNull();
      await press("crianca-codigo");
      expect(mockPush).toHaveBeenCalledWith({ pathname: "/kids/codigo/[id]", params: { id: "c1" } });
    });

    const TODAY = [{ session_id: "s1", status: "open", room: {}, instance: { id: "i1" } }];

    it("sem sessão aberta hoje, não há ação de check-in nem de código", async () => {
      mockListOpen.mockResolvedValue([]);
      await renderScreen();
      expect(screen.queryByTestId("crianca-checkin")).toBeNull();
      expect(screen.queryByTestId("crianca-codigo")).toBeNull();
    });

    it("com sessão aberta hoje, oferece 'Fazer check-in' sem culto na rota", async () => {
      mockListOpen.mockResolvedValue(TODAY);
      await renderScreen();
      await press("crianca-checkin");
      expect(mockPush).toHaveBeenCalledWith({ pathname: "/kids/checkin/[childId]", params: { childId: "c1" } });
    });

    it("com sessão aberta hoje, oferece 'Mostrar QR para o check-in' ao lado do manual", async () => {
      mockListOpen.mockResolvedValue(TODAY);
      await renderScreen();
      expect(screen.getByTestId("crianca-checkin")).toBeTruthy();
      await press("crianca-qr");
      expect(mockPush).toHaveBeenCalledWith({ pathname: "/kids/qr/[childId]", params: { childId: "c1" } });
    });

    it("sem sessão aberta ou com a criança já presente, não oferece o QR", async () => {
      mockListOpen.mockResolvedValue([]);
      await renderScreen();
      expect(screen.queryByTestId("crianca-qr")).toBeNull();
    });

    it("com check-in aberto, não oferece novo check-in mesmo havendo sessão", async () => {
      mockGetOpen.mockResolvedValue(OPEN);
      mockListOpen.mockResolvedValue(TODAY);
      await renderScreen();
      expect(screen.queryByTestId("crianca-checkin")).toBeNull();
    });

    it("falha ao listar as sessões do dia não derruba a ficha nem oferece check-in", async () => {
      mockListOpen.mockRejectedValue(new NetworkError());
      await renderScreen();
      expect(screen.getByText("Ana Souza")).toBeTruthy();
      expect(screen.queryByTestId("crianca-checkin")).toBeNull();
    });

    it("falha ao consultar o check-in aberto não derruba a ficha", async () => {
      mockGetOpen.mockRejectedValue(new NetworkError());
      await renderScreen();
      expect(screen.getByText("Ana Souza")).toBeTruthy();
    });
  });

  it("erro ao carregar a ficha oferece tentar de novo", async () => {
    mockGetChild.mockRejectedValueOnce(new NetworkError());
    await renderScreen();
    expect(screen.getByTestId("crianca-error")).toBeTruthy();
    await press("crianca-retry");
    expect(screen.getByText("Ana Souza")).toBeTruthy();
  });

  it("recarga que falha depois de a ficha carregar mantém a ficha", async () => {
    mockUpdate.mockResolvedValue({});
    await renderScreen();
    mockGetChild.mockRejectedValue(new NetworkError());
    await act(async () => {
      fireEvent(screen.getByTestId("autorizado-g1-retirar"), "valueChange", false);
    });
    expect(screen.queryByTestId("crianca-error")).toBeNull();
    expect(screen.getByText("Ana Souza")).toBeTruthy();
  });

  it("resposta que chega depois de sair da tela é descartada (sucesso e erro)", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockGetChild.mockReturnValueOnce(new Promise((res) => (resolve = res)));
    let view!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      view = await render(<CriancaScreen />);
    });
    await act(async () => {
      await view.unmount();
    });
    await act(async () => resolve(FICHA));
    expect(screen.queryByText("Ana Souza")).toBeNull();

    let reject: (e: unknown) => void = () => undefined;
    mockGetChild.mockReturnValueOnce(new Promise((_res, rej) => (reject = rej)));
    await act(async () => {
      view = await render(<CriancaScreen />);
    });
    await act(async () => {
      await view.unmount();
    });
    await act(async () => reject(new NetworkError()));
    expect(screen.queryByTestId("crianca-error")).toBeNull();
  });

});
