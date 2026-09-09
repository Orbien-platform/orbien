// Modo claro/escuro do ThemeProvider (§8 do STYLE-GUIDE.md):
// - segue o sistema por padrão
// - a preferência gravada em AsyncStorage vence o sistema
// - a escolha do usuário grava, e o boot NÃO grava
// - a cor do tenant é a mesma nos dois modos; só a superfície muda
//
// Arquivo separado de theme-provider.test.tsx de propósito: aquele cobre o
// branding por tenant (AC 2/3 do spec.md) e afirma `setItem` não chamado,
// então misturar a preferência de modo ali confundiria as duas coisas.
import { Text } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: (...args: unknown[]) => mockSetItem(...args),
}));

jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: jest.fn(() => new Promise(() => {})),
}));

jest.mock("../auth/auth-provider", () => ({
  useAuth: () => ({ session: null }),
}));

// Mock no módulo específico do RN, e não em `react-native` inteiro:
// espalhar `...jest.requireActual("react-native")` dispara todos os
// getters lazy do índice (FlatList, SafeAreaView, ProgressBarAndroid…) e
// enche a saída de avisos de deprecação — além de acoplar o teste a tudo
// que o índice exporta. `useColorScheme` do índice é reexport deste
// arquivo, então mockar aqui é o mesmo efeito.
const mockUseColorScheme = jest.fn();
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockUseColorScheme(),
}));

import { brand, palettes } from "./tokens";
import { ThemeProvider, useTheme } from "./theme-provider";

function Probe() {
  const { scheme, isDark, preference, primaryColor, colors, setPreference } = useTheme();
  return (
    <>
      <Text testID="scheme">{scheme}</Text>
      <Text testID="isDark">{String(isDark)}</Text>
      <Text testID="preference">{preference}</Text>
      <Text testID="primaryColor">{primaryColor}</Text>
      <Text testID="bgBase">{colors.bgBase}</Text>
      <Text testID="textPrimary">{colors.textPrimary}</Text>
      <Text testID="set-dark" onPress={() => setPreference("dark")}>
        escuro
      </Text>
    </>
  );
}

async function renderProbe() {
  await act(async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
  });
}

describe("ThemeProvider — modo claro/escuro", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockUseColorScheme.mockReturnValue("light");
  });

  it("sem preferência gravada, segue o sistema (claro)", async () => {
    await renderProbe();

    expect(screen.getByTestId("preference").props.children).toBe("system");
    expect(screen.getByTestId("scheme").props.children).toBe("light");
    expect(screen.getByTestId("bgBase").props.children).toBe(palettes.light.bgBase);
    expect(screen.getByTestId("textPrimary").props.children).toBe(brand.ink);
  });

  it("sem preferência gravada, segue o sistema (escuro)", async () => {
    mockUseColorScheme.mockReturnValue("dark");
    await renderProbe();

    expect(screen.getByTestId("scheme").props.children).toBe("dark");
    expect(screen.getByTestId("isDark").props.children).toBe("true");
    expect(screen.getByTestId("bgBase").props.children).toBe(brand.ink);
    expect(screen.getByTestId("textPrimary").props.children).toBe(brand.parchment);
  });

  it("preferência gravada vence o sistema", async () => {
    mockUseColorScheme.mockReturnValue("light");
    mockGetItem.mockImplementation(async (key: string) =>
      key === "orbien.colorScheme" ? "dark" : null,
    );

    await renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId("scheme").props.children).toBe("dark");
    });
    expect(screen.getByTestId("preference").props.children).toBe("dark");
  });

  it("valor inválido no storage é ignorado — segue o sistema, sem erro visível", async () => {
    mockGetItem.mockImplementation(async (key: string) =>
      key === "orbien.colorScheme" ? '{"não":"é um modo"}' : null,
    );

    await renderProbe();

    expect(screen.getByTestId("preference").props.children).toBe("system");
    expect(screen.getByTestId("scheme").props.children).toBe("light");
  });

  it("o boot não grava preferência — só a escolha explícita do usuário grava", async () => {
    await renderProbe();

    expect(mockSetItem).not.toHaveBeenCalledWith("orbien.colorScheme", expect.anything());

    await act(async () => {
      fireEvent.press(screen.getByTestId("set-dark"));
    });

    expect(mockSetItem).toHaveBeenCalledWith("orbien.colorScheme", "dark");
    expect(screen.getByTestId("scheme").props.children).toBe("dark");
  });

  it("a cor do tenant é a mesma nos dois modos; o que muda é a superfície (§8)", async () => {
    await renderProbe();
    const primaryLight = screen.getByTestId("primaryColor").props.children;
    const bgLight = screen.getByTestId("bgBase").props.children;

    await act(async () => {
      fireEvent.press(screen.getByTestId("set-dark"));
    });

    expect(screen.getByTestId("primaryColor").props.children).toBe(primaryLight);
    expect(screen.getByTestId("bgBase").props.children).not.toBe(bgLight);
  });
});
