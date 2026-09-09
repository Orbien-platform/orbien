// Repro do bug de boot no simulador (iPhone 17 Pro / iOS 26.5): a tela
// ficava em branco com o "Carregando…" re-renderizando. Diferente de
// `_layout.test.tsx` — que mocka `expo-router` inteiro e por isso não vê o
// problema —, aqui o router REAL monta a árvore de rotas de `src/app`.
import { renderRouter } from "expo-router/testing-library";

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

describe("boot do app (router real, rotas de src/app)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemAsync.mockResolvedValue(null);
  });

  it("sem sessão salva: sai do splash e chega na tela de login", async () => {
    const app = await renderRouter("src/app", { initialUrl: "/" });

    expect(await app.findByTestId("email-input")).toBeTruthy();
    expect(app.queryByTestId("splash")).toBeNull();
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

    // A tela de Escala é a rota inicial das tabs; o `escala-error` aparece
    // porque não há API neste ambiente — o que importa aqui é que o shell
    // autenticado montou, em vez de ficar preso no splash.
    expect(await app.findByTestId("escala-error")).toBeTruthy();
    expect(app.queryByTestId("splash")).toBeNull();
    expect(app.queryByTestId("email-input")).toBeNull();
  });
});
