// QR de check-in do líder (PROD-12): gera ao abrir, conta o tempo, renova,
// mostra quantos já entraram e traduz cada recusa da API num estado.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "m1" }),
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
}));

const mockCreateCheckinToken = jest.fn();
const mockGetMeeting = jest.fn();
jest.mock("../../../../../lib/pequenos-grupos/pequenos-grupos-client", () => ({
  createCheckinToken: (...args: unknown[]) => mockCreateCheckinToken(...args),
  getMeeting: (...args: unknown[]) => mockGetMeeting(...args),
}));

const mockPresentation = jest.fn();
jest.mock("../../../../../lib/qr/use-presentation-mode", () => ({
  usePresentationMode: () => mockPresentation(),
}));

// O desenho do QR tem teste próprio; aqui interessa o que vai dentro dele.
jest.mock("../../../../../components/QrCode", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    QrCode: ({ value, testID }: { value: string; testID?: string }) => (
      <Text testID={testID}>{value}</Text>
    ),
  };
});

import { HttpError, NetworkError } from "../../../../../lib/api/errors";
import CheckinQrScreen, { ATTENDANCE_POLL_MS } from "../../../../../app/grupo/encontro/[id]/qr";

const NOW = new Date(2026, 9, 4, 20, 0, 0).getTime();
const HOUR = 3_600_000;
const TOKEN_A = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const TOKEN_B = "9b2e1c3d-1111-4222-8333-444455556666";

function issued(token: string, from = NOW) {
  return { token, expires_at: new Date(from + 4 * HOUR).toISOString() };
}

function meeting(attendance: number, topic: string | null = "Estudo 12") {
  return {
    id: "m1",
    small_group_id: "sg1",
    occurred_at: new Date(NOW).toISOString(),
    topic,
    attendanceRecords: Array.from({ length: attendance }, (_, i) => ({ person_id: `p${i}` })),
  };
}

async function open() {
  const view = await render(<CheckinQrScreen />);
  await act(async () => undefined);
  return view;
}

describe("CheckinQrScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW });
    mockCreateCheckinToken.mockResolvedValue(issued(TOKEN_A));
    mockGetMeeting.mockResolvedValue(meeting(2));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("gera o código ao abrir e mostra validade, tempo restante e presenças", async () => {
    await open();

    expect(mockCreateCheckinToken).toHaveBeenCalledWith("m1");
    expect(mockPresentation).toHaveBeenCalled();
    expect(screen.getByTestId("checkin-qr-code")).toHaveTextContent(`orbien:checkin:${TOKEN_A}`);
    expect(screen.getByTestId("checkin-qr-validade")).toHaveTextContent("Válido até 00:00");
    expect(screen.getByTestId("checkin-qr-restante")).toHaveTextContent("4h restantes");
    expect(screen.getByTestId("checkin-qr-contagem")).toHaveTextContent("2 presenças registradas");
    expect(screen.getByText("Estudo 12")).toBeTruthy();
  });

  it("enquanto gera, diz que está gerando", async () => {
    mockCreateCheckinToken.mockReturnValue(new Promise(() => undefined));
    await open();
    expect(screen.getByTestId("checkin-qr-carregando")).toBeTruthy();
  });

  it("encontro sem tema e uma presença: rótulo neutro e singular", async () => {
    mockGetMeeting.mockResolvedValue(meeting(1, null));
    await open();
    expect(screen.getByText("Encontro")).toBeTruthy();
    expect(screen.getByTestId("checkin-qr-contagem")).toHaveTextContent("1 presença registrada");
  });

  it("a contagem regressiva anda e, no fim, o código aparece expirado", async () => {
    await open();

    await act(async () => {
      jest.advanceTimersByTime(HOUR + 30 * 60_000);
    });
    expect(screen.getByTestId("checkin-qr-restante")).toHaveTextContent("2h 30min restantes");

    await act(async () => {
      jest.advanceTimersByTime(2.5 * HOUR);
    });
    expect(screen.getByTestId("checkin-qr-expirado")).toHaveTextContent("Código expirado");
    expect(screen.getByTestId("checkin-qr-restante")).toHaveTextContent(
      "Gere um novo para continuar",
    );
    expect(screen.getByTestId("checkin-qr-renovar")).toHaveTextContent("Gerar novo código");
  });

  it("relê as presenças de tempos em tempos; falha na releitura não derruba a tela", async () => {
    await open();
    mockGetMeeting.mockResolvedValueOnce(meeting(5));
    await act(async () => {
      jest.advanceTimersByTime(ATTENDANCE_POLL_MS);
    });
    expect(screen.getByTestId("checkin-qr-contagem")).toHaveTextContent("5 presenças registradas");

    mockGetMeeting.mockRejectedValueOnce(new NetworkError());
    await act(async () => {
      jest.advanceTimersByTime(ATTENDANCE_POLL_MS);
    });
    expect(screen.getByTestId("checkin-qr-contagem")).toHaveTextContent("5 presenças registradas");
    expect(screen.getByTestId("checkin-qr-code")).toBeTruthy();
  });

  it("renovar troca o código e reabre as 4h", async () => {
    await open();
    await act(async () => {
      jest.advanceTimersByTime(HOUR);
    });
    mockCreateCheckinToken.mockResolvedValueOnce(issued(TOKEN_B, NOW + HOUR));

    await act(async () => {
      fireEvent.press(screen.getByTestId("checkin-qr-renovar"));
    });

    expect(mockCreateCheckinToken).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("checkin-qr-code")).toHaveTextContent(`orbien:checkin:${TOKEN_B}`);
    expect(screen.getByTestId("checkin-qr-restante")).toHaveTextContent("4h restantes");
  });

  it("toque duplo em Renovar gera uma vez só", async () => {
    await open();
    let resolve!: (value: unknown) => void;
    mockCreateCheckinToken.mockReturnValueOnce(new Promise((r) => (resolve = r)));

    await act(async () => {
      fireEvent.press(screen.getByTestId("checkin-qr-renovar"));
      fireEvent.press(screen.getByTestId("checkin-qr-renovar"));
    });
    await act(async () => {
      resolve(issued(TOKEN_B));
    });

    expect(mockCreateCheckinToken).toHaveBeenCalledTimes(2);
  });

  it("falha ao renovar mantém o código atual e diz até quando ele vale", async () => {
    await open();
    mockCreateCheckinToken.mockRejectedValueOnce(new NetworkError());

    await act(async () => {
      fireEvent.press(screen.getByTestId("checkin-qr-renovar"));
    });

    expect(screen.getByTestId("checkin-qr-code")).toHaveTextContent(`orbien:checkin:${TOKEN_A}`);
    expect(screen.getByTestId("checkin-qr-renovar-erro")).toHaveTextContent(
      "Não foi possível renovar. O código atual vale até 00:00.",
    );
  });

  it("falha ao gerar de novo depois de expirado pede para tentar de novo", async () => {
    await open();
    await act(async () => {
      jest.advanceTimersByTime(4 * HOUR);
    });
    mockCreateCheckinToken.mockRejectedValueOnce(new Error("500"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("checkin-qr-renovar"));
    });

    expect(screen.getByTestId("checkin-qr-renovar-erro")).toHaveTextContent(
      "Não foi possível gerar um novo código. Tente de novo.",
    );
  });

  it("encontro de mais de 24h (409): explica a regra e leva à lista de presença", async () => {
    mockCreateCheckinToken.mockRejectedValue(new HttpError(409, { message: "encerrado" }));
    await open();

    expect(screen.getByTestId("checkin-qr-encerrado")).toBeTruthy();
    expect(screen.getByText("Este encontro passou há mais de 24 horas.")).toBeTruthy();
    fireEvent.press(screen.getByTestId("checkin-qr-ir-presenca"));
    expect(mockReplace).toHaveBeenCalledWith("/grupo/encontro/m1/presenca");
  });

  it("papel sem permissão (403) mostra o cadeado", async () => {
    mockCreateCheckinToken.mockRejectedValue(new HttpError(403, {}));
    await open();
    expect(screen.getByTestId("checkin-qr-sem-acesso")).toBeTruthy();
  });

  it("sem conexão: erro com tentar de novo, que gera o código", async () => {
    mockCreateCheckinToken.mockRejectedValueOnce(new NetworkError());
    await open();

    expect(screen.getByTestId("checkin-qr-erro")).toBeTruthy();
    expect(
      screen.getByText("Não foi possível carregar o código de check-in. Verifique sua conexão."),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("checkin-qr-retry"));
    });
    expect(screen.getByTestId("checkin-qr-code")).toBeTruthy();
  });

  it("erro do servidor não fala de conexão", async () => {
    mockCreateCheckinToken.mockRejectedValue(new HttpError(500, {}));
    await open();
    expect(screen.getByText("Não foi possível carregar o código de check-in.")).toBeTruthy();
  });

  it("fechar volta para a tela anterior, também no estado de erro", async () => {
    mockCreateCheckinToken.mockRejectedValue(new HttpError(403, {}));
    await open();
    fireEvent.press(screen.getByTestId("fullscreen-fechar"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("ignora o código e a falha que chegam depois de a tela fechar", async () => {
    let resolve!: (value: unknown) => void;
    mockCreateCheckinToken.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const first = await render(<CheckinQrScreen />);
    await act(async () => {
      first.unmount();
    });
    await act(async () => {
      resolve(issued(TOKEN_A));
    });

    let reject!: (reason: unknown) => void;
    mockCreateCheckinToken.mockReturnValueOnce(new Promise((_, r) => (reject = r)));
    const second = await render(<CheckinQrScreen />);
    await act(async () => {
      second.unmount();
    });
    await act(async () => {
      reject(new NetworkError());
    });

    expect(mockCreateCheckinToken).toHaveBeenCalledTimes(2);
  });

  it("ignora a contagem que chega depois de a tela fechar", async () => {
    let resolve!: (value: unknown) => void;
    mockGetMeeting.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const view = await open();
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      resolve(meeting(3));
    });
    expect(mockGetMeeting).toHaveBeenCalledTimes(1);
  });
});
