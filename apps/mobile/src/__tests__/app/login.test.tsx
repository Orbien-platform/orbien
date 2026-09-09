// Fora de `src/app` de propósito: arquivo `.tsx` na raiz de rotas entra no
// bundle pelo `require.context` do expo-router e arrasta o
// @testing-library/react-native, que não resolve no Metro. Ver README,
// "Portão de bundle no `build`".
// Testes derivados do Done-when de T13 (tasks.md) e do AC 2 de MOB-01
// (spec.md): mesma mensagem de erro genérica, independente do motivo.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockLogin = jest.fn();
jest.mock("../../lib/auth/auth-provider", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

import LoginScreen from "../../app/login";

describe("LoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // A tela não navega: quem troca de rota é o `Stack.Protected` do layout
  // raiz, quando `status` vira "authenticated" (ver navigation-boot.test.tsx,
  // que cobre a transição com o router real).
  it("submit com credenciais válidas (mock) chama login com o que foi digitado", async () => {
    mockLogin.mockResolvedValue(undefined);

    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByTestId("tenant-slug-input"), "igreja-teste");
    await fireEvent.changeText(screen.getByTestId("email-input"), "a@b.com");
    await fireEvent.changeText(screen.getByTestId("password-input"), "senha123");
    await fireEvent.press(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("igreja-teste", "a@b.com", "senha123");
    });
    expect(screen.queryByTestId("login-error")).toBeNull();
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
    },
  );
});
