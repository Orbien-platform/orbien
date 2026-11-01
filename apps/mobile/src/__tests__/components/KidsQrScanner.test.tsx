// Leitor de QR do Kids (MOB-3): permissão de câmera em todos os estados, com
// o caminho de digitar o código sempre à mão; trava de leitura repetida.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

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

import { QrScanner } from "../../components/kids/QrScanner";

const scan = (data: string) =>
  (mockCameraProps.onBarcodeScanned as (r: { type: string; data: string }) => void)({ type: "qr", data });

describe("QrScanner", () => {
  const onClose = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    mockCameraProps = {};
    mockRequestPermission.mockResolvedValue({ granted: true });
  });

  it("enquanto o sistema responde, mostra o carregando", async () => {
    mockPermission = null;
    await render(<QrScanner onScan={() => true} onClose={onClose} />);
    expect(screen.getByTestId("scanner-carregando")).toBeTruthy();
  });

  it("permissão ainda não dada: explica, pede a câmera e oferece digitar o código", async () => {
    mockPermission = { granted: false, canAskAgain: true };
    await render(<QrScanner onScan={() => true} onClose={onClose} />);
    expect(screen.getByTestId("scanner-permissao-pedir")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("scanner-permitir"));
    });
    expect(mockRequestPermission).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("scanner-digitar"));
    expect(onClose).toHaveBeenCalled();
  });

  it("pedido de permissão que falha não derruba a tela", async () => {
    mockPermission = { granted: false, canAskAgain: true };
    mockRequestPermission.mockRejectedValue(new Error("x"));
    await render(<QrScanner onScan={() => true} onClose={onClose} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("scanner-permitir"));
    });
    expect(screen.getByTestId("scanner-permissao-pedir")).toBeTruthy();
  });

  it("câmera negada de vez: estado claro, ajustes e o caminho de digitar o código", async () => {
    mockPermission = { granted: false, canAskAgain: false };
    const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    await render(<QrScanner onScan={() => true} onClose={onClose} />);
    expect(screen.getByTestId("scanner-permissao-negada")).toBeTruthy();
    expect(screen.queryByTestId("scanner-camera")).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId("scanner-ajustes"));
    });
    expect(open).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("scanner-digitar"));
    expect(onClose).toHaveBeenCalled();
    open.mockRestore();
  });

  it("ajustes que falham ao abrir não derrubam a tela", async () => {
    mockPermission = { granted: false, canAskAgain: false };
    const open = jest.spyOn(Linking, "openSettings").mockRejectedValue(new Error("x"));
    await render(<QrScanner onScan={() => true} onClose={onClose} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("scanner-ajustes"));
    });
    expect(screen.getByTestId("scanner-permissao-negada")).toBeTruthy();
    open.mockRestore();
  });

  it("aceita a leitura uma vez só: com o código no quadro, as repetições não passam", async () => {
    mockPermission = { granted: true, canAskAgain: true };
    const onScan = jest.fn().mockReturnValue(true);
    await render(<QrScanner onScan={onScan} onClose={onClose} />);
    scan("kidsci1.a.b");
    scan("kidsci1.a.b");
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it("código recusado não repete o aviso, mas outro código ainda é lido", async () => {
    mockPermission = { granted: true, canAskAgain: true };
    const onScan = jest.fn().mockReturnValue(false);
    await render(<QrScanner onScan={onScan} onClose={onClose} notice="Este QR não é do Kids." />);
    scan("https://x");
    scan("https://x");
    expect(onScan).toHaveBeenCalledTimes(1);
    scan("outro");
    expect(onScan).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("scanner-aviso").props.children).toBe("Este QR não é do Kids.");
  });

  it("falha ao abrir a câmera: erro, nova tentativa e digitar o código", async () => {
    mockPermission = { granted: true, canAskAgain: true };
    await render(<QrScanner onScan={() => true} onClose={onClose} />);
    await act(async () => (mockCameraProps.onMountError as () => void)());
    expect(screen.getByTestId("scanner-camera-erro")).toBeTruthy();
    fireEvent.press(screen.getByTestId("scanner-digitar"));
    expect(onClose).toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByTestId("scanner-camera-retry"));
    });
    expect(screen.getByTestId("scanner-camera")).toBeTruthy();
  });
});
