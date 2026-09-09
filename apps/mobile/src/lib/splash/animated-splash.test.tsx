// Cobre o contrato visual da splash animada: a marca e o satélite estão na
// tela, `onReady` avisa quando o primeiro frame foi desenhado (é o gatilho
// para esconder a splash nativa) e "reduzir movimento" desliga a órbita.
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
});
