// Leitor do QR de check-in (PROD-12): permissão de câmera nos três estados,
// leitura que ignora código alheio, envio único e cada resposta da API.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
}));

type Permission = { granted: boolean; canAskAgain: boolean } | null;
let mockPermission: Permission = null;
const mockRequestPermission = jest.fn();
let mockCameraProps: Record<string, unknown> = {};
jest.mock("expo-camera", () => {
  const { View } = jest.requireActual("react-native");
  return {
    useCameraPermissions: () => [mockPermission, mockRequestPermission],
    CameraView: (props: Record<string, unknown>) => {
      mockCameraProps = props;
      return <View testID={props.testID as string} />;
    },
  };
});

const mockCheckIn = jest.fn();
jest.mock("../../lib/pequenos-grupos/pequenos-grupos-client", () => ({
  checkIn: (...args: unknown[]) => mockCheckIn(...args),
}));

import { HttpError, NetworkError } from "../../lib/api/errors";
import CheckinScannerScreen, { WRONG_CODE_HINT_MS } from "../../app/checkin";

const TOKEN = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

function scan(data: string) {
  const onScanned = mockCameraProps.onBarcodeScanned as
    | ((result: { type: string; data: string }) => void)
    | undefined;
  onScanned?.({ type: "qr", data });
}

async function openWithCamera() {
  mockPermission = { granted: true, canAskAgain: true };
  await render(<CheckinScannerScreen />);
}

describe("CheckinScannerScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCameraProps = {};
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockCheckIn.mockResolvedValue({ status: "checked_in", group_meeting_id: "m1" });
  });

  describe("permissão da câmera", () => {
    it("enquanto o sistema responde, mostra o carregando", async () => {
      mockPermission = null;
      await render(<CheckinScannerScreen />);
      expect(screen.getByTestId("checkin-permissao-carregando")).toBeTruthy();
    });

    it("ainda não concedida: explica para que serve e pede", async () => {
      mockPermission = { granted: false, canAskAgain: true };
      await render(<CheckinScannerScreen />);

      expect(screen.getByTestId("checkin-permissao-pedir")).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByTestId("checkin-permitir"));
      });
      expect(mockRequestPermission).toHaveBeenCalled();
    });

    it("pedido que falha não quebra a tela", async () => {
      mockPermission = { granted: false, canAskAgain: true };
      mockRequestPermission.mockRejectedValue(new Error("x"));
      await render(<CheckinScannerScreen />);
      await act(async () => {
        fireEvent.press(screen.getByTestId("checkin-permitir"));
      });
      expect(screen.getByTestId("checkin-permissao-pedir")).toBeTruthy();
    });

    it("bloqueada: manda para os ajustes do aparelho", async () => {
      mockPermission = { granted: false, canAskAgain: false };
      const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
      await render(<CheckinScannerScreen />);

      expect(screen.getByTestId("checkin-permissao-negada")).toBeTruthy();
      expect(screen.queryByTestId("checkin-permitir")).toBeNull();
      await act(async () => {
        fireEvent.press(screen.getByTestId("checkin-abrir-ajustes"));
      });
      expect(openSettings).toHaveBeenCalled();
    });

    it("ajustes indisponíveis não quebram a tela", async () => {
      mockPermission = { granted: false, canAskAgain: false };
      jest.spyOn(Linking, "openSettings").mockRejectedValue(new Error("x"));
      await render(<CheckinScannerScreen />);
      await act(async () => {
        fireEvent.press(screen.getByTestId("checkin-abrir-ajustes"));
      });
      expect(screen.getByTestId("checkin-permissao-negada")).toBeTruthy();
    });
  });

  it("concedida: abre a câmera traseira lendo só QR", async () => {
    await openWithCamera();
    expect(screen.getByTestId("checkin-camera")).toBeTruthy();
    expect(mockCameraProps).toEqual(
      expect.objectContaining({
        facing: "back",
        active: true,
        barcodeScannerSettings: { barcodeTypes: ["qr"] },
      }),
    );
  });

  it("QR do líder: envia o token e confirma a presença", async () => {
    await openWithCamera();
    await act(async () => {
      scan(`orbien:checkin:${TOKEN}`);
    });

    expect(mockCheckIn).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByTestId("checkin-sucesso")).toBeTruthy();
    expect(screen.getByText("Presença confirmada")).toBeTruthy();
    fireEvent.press(screen.getByTestId("checkin-concluir"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("presença que já estava registrada diz isso, sem erro", async () => {
    mockCheckIn.mockResolvedValue({ status: "already_checked_in", group_meeting_id: "m1" });
    await openWithCamera();
    await act(async () => {
      scan(TOKEN);
    });
    expect(screen.getByText("Você já estava na lista")).toBeTruthy();
  });

  it("vários disparos do mesmo QR enviam uma vez só e pausam a câmera", async () => {
    let resolve!: (value: unknown) => void;
    mockCheckIn.mockReturnValue(new Promise((r) => (resolve = r)));
    await openWithCamera();
    const onScanned = mockCameraProps.onBarcodeScanned as (r: { type: string; data: string }) => void;

    await act(async () => {
      onScanned({ type: "qr", data: TOKEN });
      onScanned({ type: "qr", data: TOKEN });
    });

    expect(mockCheckIn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("checkin-enviando")).toBeTruthy();
    expect(mockCameraProps.active).toBe(false);
    expect(mockCameraProps.onBarcodeScanned).toBeUndefined();

    await act(async () => {
      resolve({ status: "checked_in", group_meeting_id: "m1" });
    });
  });

  it("QR que não é de check-in: avisa uma vez, segue lendo e o aviso some", async () => {
    jest.useFakeTimers();
    try {
      await openWithCamera();
      await act(async () => {
        scan("https://example.com/cardapio");
      });
      expect(screen.getByTestId("checkin-qr-errado")).toBeTruthy();
      expect(mockCheckIn).not.toHaveBeenCalled();

      // O mesmo código continua no quadro: não reabre o aviso.
      await act(async () => {
        scan("https://example.com/cardapio");
      });

      await act(async () => {
        jest.advanceTimersByTime(WRONG_CODE_HINT_MS);
      });
      expect(screen.queryByTestId("checkin-qr-errado")).toBeNull();

      await act(async () => {
        scan(TOKEN);
      });
      expect(mockCheckIn).toHaveBeenCalledWith(TOKEN);
    } finally {
      jest.useRealTimers();
    }
  });

  it("código expirado (404): pede o código atual ao líder e deixa ler de novo", async () => {
    mockCheckIn.mockRejectedValueOnce(new HttpError(404, { message: "QR code inválido ou expirado" }));
    await openWithCamera();
    await act(async () => {
      scan(TOKEN);
    });

    expect(screen.getByTestId("checkin-expired")).toBeTruthy();
    expect(screen.queryByTestId("checkin-reenviar")).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId("checkin-ler-de-novo"));
    });
    expect(screen.getByTestId("checkin-camera")).toBeTruthy();

    await act(async () => {
      scan(TOKEN);
    });
    expect(mockCheckIn).toHaveBeenCalledTimes(2);
  });

  it("quem não é do grupo (403) recebe o cadeado", async () => {
    mockCheckIn.mockRejectedValue(new HttpError(403, {}));
    await openWithCamera();
    await act(async () => {
      scan(TOKEN);
    });
    expect(screen.getByTestId("checkin-not-member")).toBeTruthy();
    expect(screen.getByText("Você não está neste grupo.")).toBeTruthy();
  });

  it("sem conexão: guarda o código lido e reenvia o mesmo", async () => {
    mockCheckIn.mockRejectedValueOnce(new NetworkError());
    await openWithCamera();
    await act(async () => {
      scan(TOKEN);
    });

    expect(screen.getByText("Sem conexão para confirmar a presença.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("checkin-reenviar"));
    });
    expect(mockCheckIn).toHaveBeenLastCalledWith(TOKEN);
    expect(screen.getByTestId("checkin-sucesso")).toBeTruthy();
  });

  it("erro do servidor não fala de conexão", async () => {
    mockCheckIn.mockRejectedValue(new HttpError(500, {}));
    await openWithCamera();
    await act(async () => {
      scan(TOKEN);
    });
    expect(screen.getByText("Não foi possível confirmar a presença.")).toBeTruthy();
  });

  it("câmera que não abre: explica e remonta ao tentar de novo", async () => {
    await openWithCamera();
    await act(async () => {
      (mockCameraProps.onMountError as (e: { message: string }) => void)({ message: "ocupada" });
    });
    expect(screen.getByTestId("checkin-camera-erro")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("checkin-camera-retry"));
    });
    expect(screen.getByTestId("checkin-camera")).toBeTruthy();
  });

  it("fechar volta para a tela anterior", async () => {
    await openWithCamera();
    fireEvent.press(screen.getByTestId("fullscreen-fechar"));
    expect(mockBack).toHaveBeenCalled();
  });
});
