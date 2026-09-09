// Tela Perfil — aba nova. Cobre as duas lacunas que ela fecha:
// - `useAuth().logout` existia e nenhuma tela o chamava (não havia como
//   sair da conta pelo app)
// - override manual de claro/escuro (§8 do STYLE-GUIDE.md)
// e a regra de plano do §6: "Powered by Orbien" no Starter, removido no
// Premium.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockLogout = jest.fn();
const mockUseAuth = jest.fn();
jest.mock("../../../lib/auth/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockSetPreference = jest.fn();
const mockUseTheme = jest.fn();
jest.mock("../../../lib/theme/theme-provider", () => ({
  useTheme: () => mockUseTheme(),
}));

const mockDecodeJwtPayload = jest.fn();
jest.mock("../../../lib/auth/jwt", () => ({
  decodeJwtPayload: (...args: unknown[]) => mockDecodeJwtPayload(...args),
}));

import { palettes } from "../../../lib/theme/tokens";
import PerfilScreen from "../../../app/(tabs)/perfil";

function themeValue(preference = "system") {
  return {
    primaryColor: "#1E3A7B",
    accentColor: "#00B8A2",
    logoUrl: null,
    appName: "Igreja Teste",
    scheme: "light" as const,
    isDark: false,
    preference,
    setPreference: mockSetPreference,
    colors: palettes.light,
    shadow: { sm: {}, md: {}, lg: {} },
  };
}

describe("PerfilScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      session: { accessToken: "token", refreshToken: "r", accessTokenExpiresAt: Date.now() },
      logout: mockLogout,
    });
    mockUseTheme.mockReturnValue(themeValue());
    mockDecodeJwtPayload.mockReturnValue({
      sub: "u1",
      tenant_id: "t1",
      congregation_id: "c1",
      roles: ["volunteer"],
      plan: "starter",
      exp: 0,
    });
    mockLogout.mockResolvedValue(undefined);
  });

  it("mostra o nome do app e os papéis do token, traduzidos", async () => {
    mockDecodeJwtPayload.mockReturnValue({
      sub: "u1",
      tenant_id: "t1",
      congregation_id: "c1",
      roles: ["cell_leader", "volunteer"],
      plan: "starter",
      exp: 0,
    });

    await act(async () => {
      render(<PerfilScreen />);
    });

    expect(screen.getByTestId("perfil-app-name").props.children).toBe("Igreja Teste");
    expect(screen.getByTestId("perfil-roles")).toHaveTextContent("Líder de célula · Voluntário");
  });

  it("papel desconhecido aparece como veio do token, sem quebrar a tela", async () => {
    mockDecodeJwtPayload.mockReturnValue({
      sub: "u1",
      tenant_id: "t1",
      congregation_id: "c1",
      roles: ["papel_novo_da_api"],
      plan: "starter",
      exp: 0,
    });

    await act(async () => {
      render(<PerfilScreen />);
    });

    expect(screen.getByTestId("perfil-roles")).toHaveTextContent("papel_novo_da_api");
  });

  it("escolher um modo chama setPreference com a opção tocada (§8)", async () => {
    await act(async () => {
      render(<PerfilScreen />);
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("tema-dark"));
    });

    expect(mockSetPreference).toHaveBeenCalledWith("dark");
  });

  it("sair da conta chama logout", async () => {
    await act(async () => {
      render(<PerfilScreen />);
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("logout-button"));
    });

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it("plano starter mostra 'Powered by Orbien' (§6)", async () => {
    await act(async () => {
      render(<PerfilScreen />);
    });

    expect(screen.getByTestId("powered-by")).toBeTruthy();
  });

  it("plano premium não mostra 'Powered by Orbien' (§6)", async () => {
    mockDecodeJwtPayload.mockReturnValue({
      sub: "u1",
      tenant_id: "t1",
      congregation_id: "c1",
      roles: ["member"],
      plan: "premium",
      exp: 0,
    });

    await act(async () => {
      render(<PerfilScreen />);
    });

    expect(screen.queryByTestId("powered-by")).toBeNull();
  });

  it("token sem plano legível mostra a atribuição — default é atribuir", async () => {
    mockDecodeJwtPayload.mockReturnValue(null);

    await act(async () => {
      render(<PerfilScreen />);
    });

    expect(screen.getByTestId("powered-by")).toBeTruthy();
    expect(screen.queryByTestId("perfil-roles")).toBeNull();
  });
});
