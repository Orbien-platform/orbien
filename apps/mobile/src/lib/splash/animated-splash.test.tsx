// Cobre o contrato visual da splash animada: a marca e o satélite estão na
// tela, `onReady` avisa quando o primeiro frame foi desenhado (é o gatilho
// para esconder a splash nativa), "reduzir movimento" desliga a órbita e,
// terminado o boot, a splash fecha a volta do satélite antes de sair.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { splashIconWidth: 200, splashBackground: "#1E3A7B" } },
  },
}));

import { AnimatedSplash } from "./animated-splash";

describe("AnimatedSplash", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  });

  it("desenha a marca e o satélite sobre o fundo da splash nativa", async () => {
    await act(async () => {
      render(<AnimatedSplash />);
    });

    expect(screen.getByTestId("splash-logo")).toBeTruthy();
    expect(screen.getByTestId("splash-satellite")).toBeTruthy();
    expect(screen.getByTestId("splash")).toHaveStyle({ backgroundColor: "#1E3A7B" });
    // `splash-icon.png` já traz o satélite assado (posição de repouso); a
    // máscara na cor do fundo o apaga assim que o JS monta, para o satélite
    // animado (acima dela) ser o único visível — sem "fantasma" parado.
    expect(screen.getByTestId("splash-satellite-mask")).toHaveStyle({
      backgroundColor: "#1E3A7B",
    });
    // Sem "reduzir movimento" a opacidade do satélite é interpolada pela
    // órbita — nunca o `1` fixo do caminho reduzido (é o que faz o teste de
    // baixo distinguir os dois casos).
    expect(screen.getByTestId("splash-satellite")).not.toHaveStyle({ opacity: 1 });
  });

  it("avisa `onReady` no layout — quando o primeiro frame já existe", async () => {
    const onReady = jest.fn();

    await act(async () => {
      render(<AnimatedSplash onReady={onReady} />);
    });
    expect(onReady).not.toHaveBeenCalled();

    fireEvent(screen.getByTestId("splash"), "layout", {
      nativeEvent: { layout: { width: 390, height: 844, x: 0, y: 0 } },
    });

    expect(onReady).toHaveBeenCalled();
  });

  it("com 'reduzir movimento' ligado, o satélite fica parado e opaco", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);

    await act(async () => {
      render(<AnimatedSplash />);
    });

    expect(screen.getByTestId("splash-satellite")).toHaveStyle({ opacity: 1 });
  });

  describe("saída", () => {
    // `setImmediate` fica real: o Promise do preset do RN resolve por ele, e
    // congelá-lo deixaria a resposta de "reduzir movimento" nunca chegar.
    beforeEach(() => jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] }));
    afterEach(() => jest.useRealTimers());

    it("com o boot pronto logo, espera a primeira volta inteira e só então sai", async () => {
      const onFinish = jest.fn();
      const view = await render(<AnimatedSplash onFinish={onFinish} />);

      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      await view.rerender(<AnimatedSplash done onFinish={onFinish} />);

      // Volta de 1800 ms + fade de 320 ms, contados da montagem.
      await act(async () => {
        jest.advanceTimersByTime(1800 - 200 + 300);
      });
      expect(onFinish).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(20);
      });
      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it("com o boot pronto no meio da segunda volta, sai na virada dela", async () => {
      const onFinish = jest.fn();
      const view = await render(<AnimatedSplash onFinish={onFinish} />);

      await act(async () => {
        jest.advanceTimersByTime(2500);
      });
      await view.rerender(<AnimatedSplash done onFinish={onFinish} />);

      await act(async () => {
        jest.advanceTimersByTime(3600 - 2500 + 319);
      });
      expect(onFinish).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it("com 'reduzir movimento', sai assim que o boot termina", async () => {
      jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
      const onFinish = jest.fn();

      await act(async () => {
        render(<AnimatedSplash done onFinish={onFinish} />);
      });
      await act(async () => {
        jest.advanceTimersByTime(320);
      });

      expect(onFinish).toHaveBeenCalledTimes(1);
    });
  });
});
