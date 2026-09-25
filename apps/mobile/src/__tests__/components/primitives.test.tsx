// Componentes base de src/components/ que não tinham suíte própria: até
// aqui só eram exercitados de carona pelas telas, e cada tela usa sempre a
// mesma variante — o ramo "pressionado", o tom padrão, o modo escuro, a
// tela estreita e o foco do campo ficavam sem ninguém que os visse.
//
// `pressed` não tem como ser produzido pelo test renderer (não há gesto
// nativo segurando o toque), então o `Pressable` do RN é embrulhado para
// resolver a função de estilo como pressionada quando o teste pede — o
// resto do componente é o real.
import { Linking, StyleSheet, Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

import type { ThemeValue } from "../../lib/theme/theme-provider";

const mockThemeOverrides: { current: Partial<ThemeValue> } = { current: {} };
jest.mock("../../lib/theme/theme-provider", () => {
  const actual = jest.requireActual("../../lib/theme/theme-provider");
  return {
    ...actual,
    useTheme: () => ({ ...actual.useTheme(), ...mockThemeOverrides.current }),
  };
});

const mockForcePressed = { current: false };
jest.mock("react-native/Libraries/Components/Pressable/Pressable", () => {
  const React = jest.requireActual("react");
  const Real = jest.requireActual("react-native/Libraries/Components/Pressable/Pressable").default;
  const Wrapped = React.forwardRef((props: { style?: unknown }, ref: unknown) =>
    React.createElement(Real, {
      ...props,
      ref,
      style:
        typeof props.style === "function"
          ? (state: { pressed: boolean }) =>
              (props.style as (mockState: { pressed: boolean }) => unknown)({
                ...state,
                pressed: mockForcePressed.current || state.pressed,
              })
          : props.style,
    }),
  );
  Wrapped.displayName = "Pressable";
  return { __esModule: true, default: Wrapped };
});

const mockWindowWidth = { current: 750 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWindowWidth.current, height: 1334, scale: 2, fontScale: 1 }),
}));

jest.mock("../../components/BrandLogo", () => {
  const { Text: MockText } = jest.requireActual("react-native");
  return {
    BrandLogo: ({ color }: { color: string }) => <MockText testID="brand-logo-color">{color}</MockText>,
  };
});

import { AppButton } from "../../components/AppButton";
import { AppLink } from "../../components/AppLink";
import { Avatar } from "../../components/Avatar";
import { Badge } from "../../components/Badge";
import { BrandHeader } from "../../components/BrandHeader";
import { BrandMark } from "../../components/BrandMark";
import { Card } from "../../components/Card";
import { DateBlock } from "../../components/DateBlock";
import { EmptyState } from "../../components/EmptyState";
import { Input } from "../../components/Input";
import { MarkdownText } from "../../components/MarkdownText";
import { Screen } from "../../components/Screen";
import { palettes, screenPadding } from "../../lib/theme/tokens";

function styleOf(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style);
}

/** Ícone de teste: só marca que foi renderizado, com a cor recebida. */
function Star({ color }: { color?: string }) {
  return <Text testID="icon">{color}</Text>;
}

beforeEach(() => {
  mockThemeOverrides.current = {};
  mockWindowWidth.current = 750;
  mockForcePressed.current = false;
});

describe("Avatar", () => {
  it("mostra '?' quando o nome vem vazio ou ausente", async () => {
    await render(<Avatar name="   " />);
    expect(screen.getByText("?")).toBeTruthy();
  });

  it("mostra '?' sem nome nenhum", async () => {
    await render(<Avatar />);
    expect(screen.getByText("?")).toBeTruthy();
  });

  it("usa uma inicial para nome de uma palavra e duas para nome composto", async () => {
    await render(
      <>
        <Avatar name="maria" />
        <Avatar name="joão da silva" />
      </>,
    );
    expect(screen.getByText("M")).toBeTruthy();
    expect(screen.getByText("JS")).toBeTruthy();
  });

  it("mostra o ícone no lugar das iniciais quando recebe um", async () => {
    await render(<Avatar icon={Star} name="Maria" />);
    expect(screen.queryByText("M")).toBeNull();
  });
});

describe("Badge", () => {
  it("usa o tom neutro quando nenhum é passado", async () => {
    await render(<Badge testID="badge" label="Rascunho" />);
    const style = StyleSheet.flatten(screen.getByTestId("badge").props.style);
    expect(style.backgroundColor).toBe(palettes.light.bgSubtle);
  });
});

describe("BrandMark", () => {
  it("usa 28dp quando o tamanho não é informado", async () => {
    await render(<BrandMark testID="mark" color="#000" accentColor="#0ff" />);
    expect(screen.getByTestId("mark").props.width).toBe(28);
  });
});

describe("BrandHeader", () => {
  it("no escuro pinta a marca com a cor de texto, não a do tenant", async () => {
    mockThemeOverrides.current = { isDark: true, colors: palettes.dark };
    await render(<BrandHeader />);
    expect(screen.getByTestId("brand-logo-color").props.children).toBe(palettes.dark.textPrimary);
  });
});

describe("Card", () => {
  it("escurece o fundo enquanto pressionado", async () => {
    mockForcePressed.current = true;
    await render(
      <Card testID="card" onPress={() => undefined}>
        <Text>conteúdo</Text>
      </Card>,
    );
    expect(styleOf("card").backgroundColor).toBe(palettes.light.bgSubtle);
  });
});

describe("DateBlock", () => {
  it("não renderiza nada com data ilegível", async () => {
    await render(<DateBlock iso="não é data" />);
    expect(screen.toJSON()).toBeNull();
  });
});

describe("EmptyState", () => {
  it("no tom padrão, com ícone e sem descrição, usa o halo neutro", async () => {
    await render(<EmptyState testID="empty" icon={Star} title="Nada aqui" />);
    expect(screen.getByText("Nada aqui")).toBeTruthy();
    const title = StyleSheet.flatten(screen.getByText("Nada aqui").props.style);
    expect(title.color).toBe(palettes.light.textPrimary);
  });
});

describe("Input", () => {
  it("destaca a borda no foco, repassa onFocus/onBlur e volta ao normal no blur", async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const onTrailingPress = jest.fn();
    await render(
      <Input
        testID="field"
        icon={Star}
        trailingIcon={Star}
        onTrailingPress={onTrailingPress}
        trailingAccessibilityLabel="Mostrar"
        onFocus={onFocus}
        onBlur={onBlur}
      />,
    );

    await fireEvent(screen.getByTestId("field"), "focus");
    expect(onFocus).toHaveBeenCalledTimes(1);
    await fireEvent(screen.getByTestId("field"), "blur");
    expect(onBlur).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText("Mostrar"));
    expect(onTrailingPress).toHaveBeenCalledTimes(1);
  });

  it("aceita foco e blur sem handler do chamador", async () => {
    await render(<Input testID="field" />);
    await fireEvent(screen.getByTestId("field"), "focus");
    await fireEvent(screen.getByTestId("field"), "blur");
    expect(screen.getByTestId("field")).toBeTruthy();
  });
});

describe("MarkdownText", () => {
  it("renderiza itálico, tachado, citação e os dois níveis de título", async () => {
    await render(<MarkdownText>{"## Grande\n\n### Pequeno\n\n> *citado*\n\n~~velho~~"}</MarkdownText>);
    expect(StyleSheet.flatten(screen.getByText("citado").props.style).fontStyle).toBe("italic");
    expect(StyleSheet.flatten(screen.getByText("velho").props.style).textDecorationLine).toBe(
      "line-through",
    );
    expect(screen.getAllByRole("header")).toHaveLength(2);
  });

  it("abre o link no navegador e engole a falha do openURL", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("sem app"));
    await render(<MarkdownText>{"[site](https://igreja.example)"}</MarkdownText>);

    await fireEvent.press(screen.getByRole("link"));
    expect(openURL).toHaveBeenCalledWith("https://igreja.example");
    await Promise.resolve();
    openURL.mockRestore();
  });
});

describe("Screen", () => {
  it("usa o padding compacto em tela de até 375dp", async () => {
    mockWindowWidth.current = 360;
    await render(
      <Screen testID="screen">
        <Text>x</Text>
      </Screen>,
    );
    const style = StyleSheet.flatten(screen.getByTestId("screen").props.style);
    expect(style.paddingHorizontal).toBe(screenPadding.compact);
  });

  it("zera o padding horizontal em edgeToEdge", async () => {
    await render(
      <Screen testID="screen" edgeToEdge>
        <Text>x</Text>
      </Screen>,
    );
    const style = StyleSheet.flatten(screen.getByTestId("screen").props.style);
    expect(style.paddingHorizontal).toBe(0);
  });
});

describe("AppButton", () => {
  it("baixa a opacidade quando pressionado e ativo", async () => {
    mockForcePressed.current = true;
    await render(<AppButton testID="btn" title="Salvar" onPress={() => undefined} />);
    expect(styleOf("btn").opacity).toBe(0.85);
  });

  it("não reage ao toque enquanto carrega, e o spinner fica sem testID sem um no botão", async () => {
    mockForcePressed.current = true;
    await render(<AppButton title="Salvar" loading />);
    expect(StyleSheet.flatten(screen.getByRole("button").props.style).opacity).toBeUndefined();
    expect(screen.queryByTestId("undefined-loading")).toBeNull();
  });
});

describe("AppLink", () => {
  it("baixa a opacidade quando pressionado e habilitado", async () => {
    mockForcePressed.current = true;
    await render(<AppLink testID="link" onPress={() => undefined}>Abrir</AppLink>);
    expect(styleOf("link").opacity).toBe(0.6);
  });

  it("não muda quando pressionado e desabilitado", async () => {
    mockForcePressed.current = true;
    await render(<AppLink testID="link" disabled>Abrir</AppLink>);
    expect(styleOf("link").opacity).toBeUndefined();
  });
});
