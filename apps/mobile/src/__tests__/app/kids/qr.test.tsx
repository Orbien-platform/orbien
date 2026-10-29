// Kids — QR do responsável para o check-in (MOB-1, KIDS-08): emissão, QR
// grande, contagem regressiva do TTL, expiração, "Gerar novo QR", leitura
// pela equipe (check-in aberto) e as recusas da API.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({ childId: "c1" }),
}));

const mockPresentation = jest.fn();
jest.mock("../../../lib/qr/use-presentation-mode", () => ({
  usePresentationMode: () => mockPresentation(),
}));

const mockIssue = jest.fn();
const mockGetOpen = jest.fn();
jest.mock("../../../lib/kids/kids-client", () => ({
  ...jest.requireActual("../../../lib/kids/kids-client"),
  issueCheckinQr: (...a: unknown[]) => mockIssue(...a),
  getOpenCheckin: (...a: unknown[]) => mockGetOpen(...a),
}));

import { HttpError, NetworkError } from "../../../lib/api/errors";
import QrCheckinScreen, { USED_POLL_MS } from "../../../app/kids/qr/[childId]";

const NOW = new Date("2026-10-29T12:00:00Z");
const issued = (ttlMs = 300_000, qr = "kidsci1.tok.seg") => ({
  qr,
  child_id: "c1",
  guardian_person_id: "p1",
  expires_at: new Date(Date.now() + ttlMs).toISOString(),
  ttl_seconds: 300,
});

async function renderScreen() {
  await act(async () => {
    render(<QrCheckinScreen />);
  });
}
async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}
async function press(testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}

describe("QrCheckinScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW });
    mockIssue.mockResolvedValue(issued());
    mockGetOpen.mockResolvedValue(null);
  });
  afterEach(() => jest.useRealTimers());

  it("emite o QR do filho da rota e o mostra grande, com o tempo que falta", async () => {
    await renderScreen();
    expect(mockIssue).toHaveBeenCalledWith("c1");
    expect(screen.getByTestId("qr-codigo")).toBeTruthy();
    expect(screen.getByTestId("qr-contagem").props.children).toBe("5:00");
    expect(mockPresentation).toHaveBeenCalled();
  });

  it("a contagem regressiva anda de segundo em segundo", async () => {
    await renderScreen();
    await advance(3000);
    expect(screen.getByTestId("qr-contagem").props.children).toBe("4:57");
  });

  it("ao expirar, esconde o QR e oferece 'Gerar novo QR', que emite outro", async () => {
    await renderScreen();
    await advance(300_000);
    expect(screen.queryByTestId("qr-codigo")).toBeNull();
    expect(screen.getByTestId("qr-expirado")).toBeTruthy();

    mockIssue.mockResolvedValueOnce(issued(300_000, "kidsci1.novo.seg"));
    await press("qr-novo");
    expect(mockIssue).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("qr-codigo")).toBeTruthy();
    expect(screen.getByTestId("qr-contagem").props.children).toBe("5:00");
  });

  it("depois da leitura pela equipe, confirma o check-in e leva ao código; ainda deixa gerar outro QR", async () => {
    await renderScreen();
    expect(mockGetOpen).not.toHaveBeenCalled();
    mockGetOpen.mockResolvedValue({ id: "k1", code: "7KQ2" });
    await advance(USED_POLL_MS);
    expect(mockGetOpen).toHaveBeenCalledWith("c1");
    expect(screen.getByTestId("qr-usado")).toBeTruthy();
    expect(screen.queryByTestId("qr-codigo")).toBeNull();

    await press("qr-ver-codigo");
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/kids/codigo/[id]", params: { id: "c1", feito: "1" } });

    await press("qr-novo");
    expect(mockIssue).toHaveBeenCalledTimes(2);
  });

  it("falha na consulta de leitura não derruba o QR", async () => {
    await renderScreen();
    mockGetOpen.mockRejectedValue(new NetworkError());
    await advance(USED_POLL_MS);
    expect(screen.getByTestId("qr-codigo")).toBeTruthy();
  });

  it("criança já presente (409): explica com a mensagem da API e leva ao código", async () => {
    mockIssue.mockRejectedValue(new HttpError(409, { message: "A criança já está presente na turma." }));
    await renderScreen();
    expect(screen.getByText("A criança já está presente na turma.")).toBeTruthy();
    expect(screen.queryByTestId("qr-codigo")).toBeNull();
    await press("qr-ver-codigo");
    expect(mockReplace).toHaveBeenCalled();
  });

  it("sem rede, mostra o erro e tenta de novo", async () => {
    mockIssue.mockRejectedValueOnce(new NetworkError());
    await renderScreen();
    expect(screen.getByTestId("qr-error")).toBeTruthy();
    await press("qr-retry");
    expect(screen.getByTestId("qr-codigo")).toBeTruthy();
  });

  it("erro de servidor (500) também cai no erro com nova tentativa, sem QR", async () => {
    mockIssue.mockRejectedValueOnce(new HttpError(500, undefined));
    await renderScreen();
    expect(screen.getByTestId("qr-error")).toBeTruthy();
    expect(screen.queryByTestId("qr-codigo")).toBeNull();
  });

  it("não desenha nada antes da resposta", async () => {
    mockIssue.mockReturnValue(new Promise(() => undefined));
    await renderScreen();
    expect(screen.queryByTestId("qr-codigo")).toBeNull();
    expect(screen.queryByTestId("qr-error")).toBeNull();
  });
});
