// QR de autocadastro em tela cheia: aponta para a página pública da igreja
// e não mostra QR nenhum quando não há endereço para montar.
import { render, screen, fireEvent } from "@testing-library/react-native";

let mockParams: Record<string, string | undefined> = {};
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack }),
}));

let mockExtra: Record<string, unknown> | undefined = {};
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

const mockUseTheme = jest.fn();
jest.mock("../../lib/theme/theme-provider", () => ({
  useTheme: () => mockUseTheme(),
}));

const mockPresentation = jest.fn();
jest.mock("../../lib/qr/use-presentation-mode", () => ({
  usePresentationMode: () => mockPresentation(),
}));

jest.mock("../../components/QrCode", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    QrCode: ({ value, testID }: { value: string; testID?: string }) => (
      <Text testID={testID}>{value}</Text>
    ),
  };
});

import { palettes } from "../../lib/theme/tokens";
import AutocadastroQrScreen from "../../app/autocadastro-qr";

describe("AutocadastroQrScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { token: "tok-1", title: "Culto da manhã" };
    mockExtra = { webUrl: "https://app.orbien.app" };
    mockUseTheme.mockReturnValue({
      colors: palettes.dark,
      appName: "Igreja de Teste 1",
      tenantSlug: "teste1-church",
    });
  });

  it("mostra o QR da página pública de autocadastro, em modo apresentação", async () => {
    await render(<AutocadastroQrScreen />);

    expect(mockPresentation).toHaveBeenCalled();
    expect(screen.getByTestId("autocadastro-qr-code")).toHaveTextContent(
      "https://app.orbien.app/visitante/teste1-church/tok-1",
    );
    expect(screen.getByTestId("autocadastro-qr-origem")).toHaveTextContent("Culto da manhã");
  });

  it("sem título, usa o nome da igreja", async () => {
    mockParams = { token: "tok-1" };
    await render(<AutocadastroQrScreen />);
    expect(screen.getByTestId("autocadastro-qr-origem")).toHaveTextContent("Igreja de Teste 1");
  });

  it.each([
    ["sem webUrl no build", () => (mockExtra = {})],
    ["sem extra nenhum", () => (mockExtra = undefined)],
    ["sem slug da igreja", () => mockUseTheme.mockReturnValue({ colors: palettes.dark, appName: "X", tenantSlug: null })],
    ["sem token", () => (mockParams = {})],
  ])("%s: não mostra QR que leva a lugar nenhum", async (_label, arrange) => {
    arrange();
    await render(<AutocadastroQrScreen />);

    expect(screen.getByTestId("autocadastro-qr-sem-endereco")).toBeTruthy();
    expect(screen.queryByTestId("autocadastro-qr-code")).toBeNull();
  });

  it("fechar volta para a lista", async () => {
    await render(<AutocadastroQrScreen />);
    fireEvent.press(screen.getByTestId("fullscreen-fechar"));
    expect(mockBack).toHaveBeenCalled();
  });
});
