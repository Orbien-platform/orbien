// Vive fora de `src/app` de propósito: o `require.context` do expo-router
// (node_modules/expo-router/_ctx.android.js) varre a raiz de rotas com o
// filtro /.*\.[tj]sx?$/ e só exclui `+api`/`+html`/`+middleware` — arquivo
// `.test.tsx` ali dentro entra no bundle como se fosse rota e arrasta o
// @testing-library/react-native, que faz require("console"). Módulo do Node
// não resolve no Metro: quebra o bundle na EAS (build de preview de
// 2026-09-08), sem que jest/tsc/lint percebam — nenhum dos três monta o
// grafo de rotas.
// Testes derivados do Done-when de T13 (tasks.md) e do AC 2 de MOB-01
// (spec.md): mesma mensagem de erro genérica, independente do motivo.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockLogin = jest.fn();
jest.mock("../../lib/auth/auth-provider", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

import LoginScreen from "../../app/login";

describe("LoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("submit com credenciais válidas (mock) navega para a rota inicial", async () => {
    mockLogin.mockResolvedValue(undefined);

    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByTestId("tenant-slug-input"), "igreja-teste");
    await fireEvent.changeText(screen.getByTestId("email-input"), "a@b.com");
    await fireEvent.changeText(screen.getByTestId("password-input"), "senha123");
    await fireEvent.press(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
    expect(mockLogin).toHaveBeenCalledWith("igreja-teste", "a@b.com", "senha123");
  });

  it.each([
    ["senha errada", new Error("Credenciais inválidas")],
    ["tenant não encontrado", new Error("Tenant não encontrado")],
    ["erro de rede", new Error("Erro de rede")],
  ])(
    "submit com erro (%s, mock rejeita) mostra a mesma mensagem genérica, independentemente do motivo simulado",
    async (_label, thrown) => {
      mockLogin.mockRejectedValue(thrown);

      await render(<LoginScreen />);
      await fireEvent.press(screen.getByTestId("login-submit"));

      await waitFor(() => {
        expect(screen.getByTestId("login-error").props.children).toBe(
          "Não foi possível entrar. Confira os dados e tente novamente.",
        );
      });
      expect(mockReplace).not.toHaveBeenCalled();
    },
  );
});
