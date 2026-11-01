// Kids — check-in do filho (T32, KIDS-08): turma sugerida pela idade, fora da
// faixa (confirmação / recusa), quem entrega, 409 e as sessões abertas de hoje
// (sem culto na rota).
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => ({ childId: "c1" }),
}));

const mockGetChild = jest.fn();
const mockListOpen = jest.fn();
const mockCheckIn = jest.fn();
jest.mock("../../../lib/kids/kids-client", () => ({
  ...jest.requireActual("../../../lib/kids/kids-client"),
  getChild: (...a: unknown[]) => mockGetChild(...a),
  listOpenSessions: (...a: unknown[]) => mockListOpen(...a),
  checkInChild: (...a: unknown[]) => mockCheckIn(...a),
}));
const mockGetMyPersonId = jest.fn();
jest.mock("../../../lib/privacidade/privacidade-client", () => ({
  getMyPersonId: (...a: unknown[]) => mockGetMyPersonId(...a),
}));

import { HttpError, NetworkError } from "../../../lib/api/errors";
import CheckinScreen from "../../../app/kids/checkin/[childId]";

// Fixa "hoje" para a idade: nascida em 2024-07-26, em 2026-10-26 tem 27 meses.
const NOW = new Date("2026-10-26T12:00:00Z");
const guardian = (id: string, person: string, over: object = {}) => ({
  id,
  guardian_person_id: person,
  full_name: `Resp ${id}`,
  phone: null,
  photo_url: null,
  relationship: "mãe",
  can_pickup: true,
  is_primary: false,
  ...over,
});
const FICHA = {
  id: "c1",
  full_name: "Ana Souza",
  birth_date: "2024-07-26T00:00:00.000Z",
  household_id: "h",
  allergies: null,
  medical_notes: null,
  guardians: [guardian("g1", "p1", { is_primary: true })],
};
const room = (id: string, name: string, min: number, max: number, lenient = false) => ({
  session_id: `s-${id}`,
  status: "open" as const,
  room: { id, name, min_age_months: min, max_age_months: max, allows_out_of_range: lenient },
  instance: { id: "i1", scheduled_date: "2026-10-26", celebration_name: "Culto da família", start_time: "10:00" },
});
const MATERNAL = room("m", "Maternal", 12, 35);
const JUNIOR = room("j", "Júnior", 72, 120, true);

async function renderScreen() {
  await act(async () => {
    render(<CheckinScreen />);
  });
}
async function press(testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}

describe("CheckinScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "setTimeout", "clearTimeout"] });
    mockGetChild.mockResolvedValue(FICHA);
    mockListOpen.mockResolvedValue([MATERNAL, JUNIOR]);
    mockGetMyPersonId.mockResolvedValue("p1");
  });
  afterEach(() => jest.useRealTimers());

  it("sugere a turma pela idade e faz o check-in indo para o código", async () => {
    mockCheckIn.mockResolvedValue({ id: "k1", code: "7KQ2" });
    await renderScreen();
    expect(screen.getByText("Pela idade")).toBeTruthy();
    expect(screen.getByText(/1 ano a 2 anos e 11 meses/)).toBeTruthy();

    await press("checkin-fazer");
    expect(mockCheckIn).toHaveBeenCalledWith("s-m", { child_id: "c1", guardian_person_id: "p1" });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/kids/codigo/[id]", params: { id: "c1", feito: "1" } });
  });

  it("oferece 'Mostrar QR para o check-in' sem tirar o check-in manual por turma", async () => {
    await renderScreen();
    expect(screen.getByTestId("checkin-fazer")).toBeTruthy();
    expect(screen.getByTestId("checkin-turma-s-m")).toBeTruthy();
    await press("checkin-qr");
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/kids/qr/[childId]", params: { childId: "c1" } });
  });

  it("lista as sessões abertas do dia com culto, horário e faixa, sem instanceId na rota", async () => {
    await renderScreen();
    expect(mockListOpen).toHaveBeenCalledWith();
    expect(screen.getByText("Maternal")).toBeTruthy();
    expect(screen.getByText("Júnior")).toBeTruthy();
    expect(screen.getByText("Culto da família às 10:00 · 1 ano a 2 anos e 11 meses")).toBeTruthy();
    expect(screen.getAllByText("Pela idade")).toHaveLength(1);
  });

  it("culto sem horário mostra só o nome", async () => {
    mockListOpen.mockResolvedValue([
      { ...MATERNAL, instance: { ...MATERNAL.instance, start_time: null } },
    ]);
    await renderScreen();
    expect(screen.getByText("Culto da família · 1 ano a 2 anos e 11 meses")).toBeTruthy();
  });

  it("mostra a alergia da criança antes de confirmar", async () => {
    mockGetChild.mockResolvedValue({ ...FICHA, allergies: "amendoim" });
    await renderScreen();
    expect(screen.getByText("Alergia: amendoim")).toBeTruthy();
  });

  it("fora da faixa, turma que aceita pede confirmação e só então grava com confirm_out_of_range", async () => {
    mockCheckIn
      .mockRejectedValueOnce(new HttpError(422, { code: "OUT_OF_RANGE_CONFIRM", requires_confirmation: true }))
      .mockResolvedValueOnce({ id: "k1", code: "7KQ2" });
    await renderScreen();
    await press("checkin-turma-s-j");
    await press("checkin-fazer");

    expect(screen.getByTestId("checkin-confirmar")).toBeTruthy();
    expect(screen.getByText(/Júnior recebe de 6 anos a 10 anos/)).toBeTruthy();
    expect(screen.getByText(/Ana tem 2 anos e 3 meses/)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();

    await press("checkin-confirmar-sim");
    expect(mockCheckIn).toHaveBeenLastCalledWith("s-j", {
      child_id: "c1",
      guardian_person_id: "p1",
      confirm_out_of_range: true,
    });
    expect(mockReplace).toHaveBeenCalled();
  });

  it("recusar a confirmação volta à escolha da turma sem gravar", async () => {
    mockCheckIn.mockRejectedValueOnce(new HttpError(422, { code: "OUT_OF_RANGE_CONFIRM" }));
    await renderScreen();
    await press("checkin-turma-s-j");
    await press("checkin-fazer");
    await press("checkin-confirmar-nao");
    expect(screen.queryByTestId("checkin-confirmar")).toBeNull();
    expect(mockCheckIn).toHaveBeenCalledTimes(1);
  });

  it("turma que não aceita fora da faixa: mensagem, sem confirmação", async () => {
    mockListOpen.mockResolvedValue([MATERNAL, room("b", "Bebês", 0, 11)]);
    mockCheckIn.mockRejectedValue(new HttpError(422, { code: "kids_out_of_range", message: "Criança fora da faixa etária da turma" }));
    await renderScreen();
    await press("checkin-turma-s-b");
    await press("checkin-fazer");
    expect(screen.getByTestId("checkin-message").props.children).toBe(
      "Esta turma não aceita a idade da criança. Escolha outra turma.",
    );
    expect(screen.queryByTestId("checkin-confirmar")).toBeNull();
  });

  it("criança já presente (409) mostra a regra da API", async () => {
    mockCheckIn.mockRejectedValue(new HttpError(409, { message: "Esta criança já está presente" }));
    await renderScreen();
    await press("checkin-fazer");
    expect(screen.getByTestId("checkin-message").props.children).toBe("Esta criança já está presente");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("falha de rede no envio cai na mensagem genérica", async () => {
    mockCheckIn.mockRejectedValue(new NetworkError());
    await renderScreen();
    await press("checkin-fazer");
    expect(screen.getByTestId("checkin-message").props.children).toBe(
      "Não foi possível fazer o check-in. Tente novamente.",
    );
  });

  describe("quem entrega", () => {
    const TWO = {
      ...FICHA,
      guardians: [guardian("g1", "p1", { is_primary: true }), guardian("g2", "p2", { relationship: "avó" })],
    };

    it("padrão é a própria pessoa da conta, e dá para trocar", async () => {
      mockGetChild.mockResolvedValue(TWO);
      mockGetMyPersonId.mockResolvedValue("p2");
      mockCheckIn.mockResolvedValue({});
      await renderScreen();
      await press("checkin-fazer");
      expect(mockCheckIn).toHaveBeenLastCalledWith("s-m", { child_id: "c1", guardian_person_id: "p2" });

      await press("checkin-entrega-g1");
      await press("checkin-fazer");
      expect(mockCheckIn).toHaveBeenLastCalledWith("s-m", { child_id: "c1", guardian_person_id: "p1" });
    });

    it("sem saber quem é a conta, o responsável principal entrega", async () => {
      mockGetChild.mockResolvedValue(TWO);
      mockGetMyPersonId.mockRejectedValue(new NetworkError());
      mockCheckIn.mockResolvedValue({});
      await renderScreen();
      await press("checkin-fazer");
      expect(mockCheckIn).toHaveBeenLastCalledWith("s-m", { child_id: "c1", guardian_person_id: "p1" });
    });

    it("sem nenhum responsável, o botão fica desabilitado", async () => {
      mockGetChild.mockResolvedValue({ ...FICHA, guardians: [] });
      await renderScreen();
      await press("checkin-fazer");
      expect(mockCheckIn).not.toHaveBeenCalled();
    });
  });

  it("trocar de turma limpa o aviso anterior", async () => {
    mockCheckIn.mockRejectedValue(new HttpError(409, { message: "Esta criança já está presente" }));
    await renderScreen();
    await press("checkin-fazer");
    await press("checkin-turma-s-j");
    expect(screen.queryByTestId("checkin-message")).toBeNull();
  });

  describe("estados sem ação", () => {
    it("sem culto kids hoje, manda procurar o líder", async () => {
      mockListOpen.mockResolvedValue([]);
      await renderScreen();
      expect(screen.getByTestId("checkin-sem-turma")).toBeTruthy();
      expect(screen.getByText("Hoje não há turma aberta.")).toBeTruthy();
      expect(screen.getByText("Procure o líder kids.")).toBeTruthy();
      expect(screen.queryByTestId("checkin-fazer")).toBeNull();
    });

    it("sem nascimento, não escolhe turma", async () => {
      mockGetChild.mockResolvedValue({ ...FICHA, birth_date: null });
      await renderScreen();
      expect(screen.getByTestId("checkin-sem-nascimento")).toBeTruthy();
    });

    it("erro de rede ao carregar oferece tentar de novo", async () => {
      mockListOpen.mockRejectedValueOnce(new NetworkError());
      await renderScreen();
      expect(screen.getByTestId("checkin-error")).toBeTruthy();
      await press("checkin-retry");
      expect(screen.getByTestId("checkin-fazer")).toBeTruthy();
    });
  });
});
