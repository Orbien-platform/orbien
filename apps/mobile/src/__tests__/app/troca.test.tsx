// Pedir troca (v2, `TrocaScreen`): substitutos do ministério, pedido a um
// colega ou ao ministério inteiro, e os erros que a API devolve.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockBack = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));

const mockGetSwapCandidates = jest.fn();
const mockRequestSwap = jest.fn();
jest.mock("../../lib/escala/escala-client", () => ({
  getSwapCandidates: (...args: unknown[]) => mockGetSwapCandidates(...args),
  requestSwap: (...args: unknown[]) => mockRequestSwap(...args),
}));

import { HttpError, NetworkError } from "../../lib/api/errors";
import TrocaScreen from "../../app/troca/[id]";

const CANDIDATES = [
  { volunteer_profile_id: "vp-bia", full_name: "Bianca Lopes", availability: "free" },
  { volunteer_profile_id: "vp-tia", full_name: "Thiago Rocha", availability: "busy" },
  { volunteer_profile_id: "vp-ury", full_name: "Ursula Lima", availability: "unavailable" },
];

describe("TrocaScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: "a1", ministerio: "Mídia", quando: "dom, 13 set · 09:30" };
  });

  it("lista os substitutos com o porquê de cada um, sob o cabeçalho da escala", async () => {
    mockGetSwapCandidates.mockResolvedValue(CANDIDATES);
    await render(<TrocaScreen />);

    expect(await screen.findByText("Bianca Lopes")).toBeTruthy();
    expect(mockGetSwapCandidates).toHaveBeenCalledWith("a1");
    expect(screen.getByText("Mídia · dom, 13 set · 09:30")).toBeTruthy();
    expect(screen.getByText("Livre neste dia")).toBeTruthy();
    expect(screen.getByText("Já escalado em outro ministério neste culto")).toBeTruthy();
    expect(screen.getByText("Marcou indisponibilidade nesta data")).toBeTruthy();
  });

  it("pedir a um colega manda a mensagem e confirma a quem foi", async () => {
    mockGetSwapCandidates.mockResolvedValue(CANDIDATES);
    mockRequestSwap.mockResolvedValue({ id: "r1" });
    await render(<TrocaScreen />);
    await screen.findByText("Bianca Lopes");

    await fireEvent.changeText(screen.getByTestId("troca-mensagem"), "Viagem");
    await act(async () => {
      fireEvent.press(screen.getByTestId("pedir-vp-bia"));
    });

    expect(mockRequestSwap).toHaveBeenCalledWith("a1", "vp-bia", "Viagem");
    expect(screen.getByText("Pedido de troca enviado")).toBeTruthy();
    expect(screen.getByText(/Bianca Lopes recebe um aviso/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("troca-voltar"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("pedir ao ministério vai sem destinatário", async () => {
    mockGetSwapCandidates.mockResolvedValue(CANDIDATES);
    mockRequestSwap.mockResolvedValue({ id: "r1" });
    await render(<TrocaScreen />);
    await screen.findByText("Bianca Lopes");

    await act(async () => {
      fireEvent.press(screen.getByTestId("pedir-ministerio"));
    });

    expect(mockRequestSwap).toHaveBeenCalledWith("a1", undefined, "");
    expect(screen.getByText(/aceitar primeiro assume/)).toBeTruthy();
  });

  it("duplo toque envia um pedido só", async () => {
    let resolve!: (value: unknown) => void;
    mockGetSwapCandidates.mockResolvedValue(CANDIDATES);
    mockRequestSwap.mockReturnValue(new Promise((r) => (resolve = r)));
    await render(<TrocaScreen />);
    await screen.findByText("Bianca Lopes");

    await act(async () => {
      fireEvent.press(screen.getByTestId("pedir-vp-bia"));
      fireEvent.press(screen.getByTestId("pedir-ministerio"));
    });
    await act(async () => resolve({ id: "r1" }));

    expect(mockRequestSwap).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      new HttpError(409, { message: "Já existe um pedido de troca em aberto para esta escala" }),
      "Já existe um pedido de troca em aberto para esta escala",
    ],
    [new HttpError(422, { message: "Esta escala já passou" }), "Esta escala já passou"],
    [new NetworkError(), "Sem conexão. O pedido não foi enviado — tente de novo quando a conexão voltar."],
    [new HttpError(500, "erro"), "Não foi possível enviar o pedido. Tente de novo em instantes."],
  ])("falha ao pedir (%s) fica na tela, com a mensagem", async (err, message) => {
    mockGetSwapCandidates.mockResolvedValue(CANDIDATES);
    mockRequestSwap.mockRejectedValue(err);
    await render(<TrocaScreen />);
    await screen.findByText("Bianca Lopes");

    await act(async () => {
      fireEvent.press(screen.getByTestId("pedir-vp-bia"));
    });

    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByTestId("pedir-ministerio")).toBeTruthy();
  });

  it("ministério sem mais ninguém: diz a quem recorrer e não oferece pedido", async () => {
    mockParams = { id: "a1" };
    mockGetSwapCandidates.mockResolvedValue([]);
    await render(<TrocaScreen />);

    expect(await screen.findByTestId("troca-sem-candidatos")).toBeTruthy();
    expect(screen.queryByTestId("pedir-ministerio")).toBeNull();
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it.each([
    [new NetworkError(), /Verifique sua conexão/],
    [new HttpError(409, "Esta escala não pode mais ser trocada"), /Não foi possível carregar os substitutos/],
  ])("falha ao carregar (%s) vira estado de erro", async (err, text) => {
    mockGetSwapCandidates.mockRejectedValue(err);
    await render(<TrocaScreen />);
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it("ignora a resposta que chega depois de desmontar, sucesso ou falha", async () => {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: unknown) => void;
    mockGetSwapCandidates
      .mockReturnValueOnce(new Promise((r) => (resolve = r)))
      .mockReturnValueOnce(new Promise((_, r) => (reject = r)));

    const first = await render(<TrocaScreen />);
    await act(async () => first.unmount());
    const second = await render(<TrocaScreen />);
    await act(async () => second.unmount());
    await act(async () => {
      resolve(CANDIDATES);
      reject(new Error("falha"));
    });

    expect(screen.queryByText("Bianca Lopes")).toBeNull();
  });
});
