// Fora de `src/app` de propósito, mesmo motivo de login.test.tsx: arquivo
// `.tsx` na raiz de rotas entra no bundle pelo `require.context` do
// expo-router e arrasta o @testing-library/react-native, que não resolve no
// Metro.
//
// Mesmo princípio de não vazar informação de login.test.tsx (AC 2, MOB-01):
// a tela sempre chega ao mesmo estado de sucesso, com e-mail cadastrado ou
// não, e mesmo se a chamada rejeitar.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockForgotPassword = jest.fn();
jest.mock("../../lib/auth/auth-client", () => ({
  forgotPassword: (...args: unknown[]) => mockForgotPassword(...args),
}));

// Modo escuro sob demanda: o resto do tema é o real.
const mockIsDark = { current: false };
jest.mock("../../lib/theme/theme-provider", () => {
  const actual = jest.requireActual("../../lib/theme/theme-provider");
  return { ...actual, useTheme: () => ({ ...actual.useTheme(), isDark: mockIsDark.current }) };
});

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

import ForgotPasswordScreen from "../../app/esqueci-senha";

const SUCCESS_MESSAGE =
  "Se o e-mail estiver cadastrado, você vai receber um link de redefinição em instantes.";

describe("ForgotPasswordScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDark.current = false;
  });

  it("submit com e-mail chama forgotPassword com o e-mail normalizado e mostra a mensagem de sucesso", async () => {
    mockForgotPassword.mockResolvedValue(undefined);

    await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId("forgot-password-email-input"), "A@B.com ");
    await fireEvent.press(screen.getByTestId("forgot-password-submit"));

    await waitFor(() => {
      expect(mockForgotPassword).toHaveBeenCalledWith("a@b.com");
    });
    expect(screen.getByTestId("forgot-password-success").props.children).toBe(SUCCESS_MESSAGE);
  });

  it("mesmo quando a chamada rejeita (erro de rede), mostra a mesma mensagem de sucesso — nunca revela o motivo", async () => {
    mockForgotPassword.mockRejectedValue(new Error("Erro de rede"));

    await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId("forgot-password-email-input"), "a@b.com");
    await fireEvent.press(screen.getByTestId("forgot-password-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("forgot-password-success").props.children).toBe(SUCCESS_MESSAGE);
    });
  });

  it("botão de voltar do estado de sucesso navega para o login", async () => {
    mockForgotPassword.mockResolvedValue(undefined);

    await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId("forgot-password-email-input"), "a@b.com");
    await fireEvent.press(screen.getByTestId("forgot-password-submit"));
    await waitFor(() => screen.getByTestId("forgot-password-back"));
    await fireEvent.press(screen.getByTestId("forgot-password-back"));

    expect(mockBack).toHaveBeenCalled();
  });

  it("link de cancelar navega para o login sem chamar forgotPassword", async () => {
    await render(<ForgotPasswordScreen />);
    await fireEvent.press(screen.getByTestId("forgot-password-cancel"));

    expect(mockBack).toHaveBeenCalled();
    expect(mockForgotPassword).not.toHaveBeenCalled();
  });
  it("submit com e-mail em branco não chama a API", async () => {
    await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId("forgot-password-email-input"), "   ");
    await fireEvent.press(screen.getByTestId("forgot-password-submit"));

    expect(mockForgotPassword).not.toHaveBeenCalled();
  });

  it("renderiza no modo escuro", async () => {
    mockIsDark.current = true;
    await render(<ForgotPasswordScreen />);
    expect(screen.getByTestId("forgot-password-submit")).toBeTruthy();
  });
});
