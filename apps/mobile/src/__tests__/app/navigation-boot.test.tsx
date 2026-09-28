// Repro do bug de boot no simulador (iPhone 17 Pro / iOS 26.5): a tela
// ficava em branco com o "Carregando…" re-renderizando. Diferente de
// `_layout.test.tsx` — que mocka `expo-router` inteiro e por isso não vê o
// problema —, aqui o router REAL monta a árvore de rotas de `src/app`.
import { waitFor } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      name: "Orbien",
      extra: { apiUrl: "http://localhost:3000", oneSignalAppId: "app-id" },
    },
  },
}));

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  setOptions: jest.fn(),
  hideAsync: jest.fn(async () => undefined),
}));

const mockGetItemAsync = jest.fn();
jest.mock("expo-secure-store", () => ({
  getItemAsync: (...a: unknown[]) => mockGetItemAsync(...a),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

jest.mock("react-native-onesignal", () => ({
  OneSignal: {
    initialize: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    Notifications: {
      requestPermission: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    User: { addTags: jest.fn(), removeTags: jest.fn() },
  },
}));

const mockFetchAreas = jest.fn();
jest.mock("../../lib/permissions/permissions-client", () => ({
  fetchAreas: () => mockFetchAreas(),
}));

describe("boot do app (router real, rotas de src/app)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // A splash não some no instante em que o boot termina: fecha a volta do
    // satélite e sai em fade. "Reduzir movimento" pula a volta, e o que
    // sobra é só o fade — é o que o `waitFor` abaixo espera.
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    mockGetItemAsync.mockResolvedValue(null);
    mockFetchAreas.mockResolvedValue(null);
  });

  it("sem sessão salva: sai do splash e chega na tela de login", async () => {
    const app = await renderRouter("src/app", { initialUrl: "/" });

    expect(await app.findByTestId("email-input")).toBeTruthy();
    await waitFor(() => expect(app.queryByTestId("splash")).toBeNull());
  });

  it("com sessão salva: monta o shell autenticado, sem splash nem login", async () => {
    mockGetItemAsync.mockResolvedValue(
      JSON.stringify({
        accessToken: "token",
        refreshToken: "refresh",
        accessTokenExpiresAt: Date.now() + 900_000,
      }),
    );

    const app = await renderRouter("src/app", { initialUrl: "/" });

    // A Home é a rota inicial das tabs (T5,
    // .specs/features/mobile-home-redesign/); `home-greeting` aparece
    // porque a saudação (HOME-01) não depende de rede — o que importa aqui
    // é que o shell autenticado montou, em vez de ficar preso no splash.
    expect(await app.findByTestId("home-greeting")).toBeTruthy();
    await waitFor(() => expect(app.queryByTestId("splash")).toBeNull());
    expect(app.queryByTestId("email-input")).toBeNull();
  });

  it("sessão member-only (sem volunteers): shell autenticado monta sem a aba Escala na tab bar", async () => {
    mockGetItemAsync.mockResolvedValue(
      JSON.stringify({
        accessToken: "token",
        refreshToken: "refresh",
        accessTokenExpiresAt: Date.now() + 900_000,
      }),
    );
    mockFetchAreas.mockResolvedValue(["content"]);

    const app = await renderRouter("src/app", { initialUrl: "/" });

    // Mesmo shell autenticado do teste acima — o conteúdo da rota index
    // (Home) não muda, só a aba Escala some da tab bar.
    expect(await app.findByTestId("home-greeting")).toBeTruthy();
    await waitFor(() => expect(app.queryByTestId("splash")).toBeNull());

    expect(app.queryByText("Escala")).toBeNull();
    // As demais abas continuam normais.
    expect(app.queryByText("Grupos")).toBeTruthy();
  });
});
