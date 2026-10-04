import { act, render } from "@testing-library/react-native";

const mockUseKeepAwake = jest.fn();
jest.mock("expo-keep-awake", () => ({
  useKeepAwake: (...args: unknown[]) => mockUseKeepAwake(...args),
}));

const mockGetBrightness = jest.fn();
const mockSetBrightness = jest.fn();
jest.mock("expo-brightness", () => ({
  getBrightnessAsync: () => mockGetBrightness(),
  setBrightnessAsync: (value: number) => mockSetBrightness(value),
}));

import { usePresentationMode } from "./use-presentation-mode";

function Probe() {
  usePresentationMode();
  return null;
}

describe("usePresentationMode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetBrightness.mockResolvedValue(undefined);
  });

  it("mantém a tela acesa, sobe o brilho e devolve o de antes ao sair", async () => {
    mockGetBrightness.mockResolvedValue(0.4);
    const view = await render(<Probe />);
    await act(async () => undefined);

    expect(mockUseKeepAwake).toHaveBeenCalledWith("orbien-qr");
    expect(mockSetBrightness).toHaveBeenLastCalledWith(1);

    await act(async () => {
      view.unmount();
    });
    expect(mockSetBrightness).toHaveBeenLastCalledWith(0.4);
  });

  it("aparelho sem controle de brilho não quebra a tela nem tenta restaurar", async () => {
    mockGetBrightness.mockRejectedValue(new Error("indisponível"));
    const view = await render(<Probe />);
    await act(async () => undefined);

    await act(async () => {
      view.unmount();
    });
    expect(mockSetBrightness).not.toHaveBeenCalled();
  });

  it("saiu antes de ler o brilho: não sobe nem restaura", async () => {
    let resolve!: (value: number) => void;
    mockGetBrightness.mockReturnValue(new Promise<number>((r) => (resolve = r)));
    const view = await render(<Probe />);
    await act(async () => {
      view.unmount();
    });

    await act(async () => {
      resolve(0.5);
    });
    expect(mockSetBrightness).not.toHaveBeenCalled();
  });

  it("falha ao restaurar é ignorada", async () => {
    mockGetBrightness.mockResolvedValue(0.3);
    const view = await render(<Probe />);
    await act(async () => undefined);
    mockSetBrightness.mockRejectedValue(new Error("x"));
    await act(async () => {
      view.unmount();
    });
    expect(mockSetBrightness).toHaveBeenLastCalledWith(0.3);
  });
});
