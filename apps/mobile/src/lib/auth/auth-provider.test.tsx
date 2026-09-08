// Testes derivados do Done-when de T12 (tasks.md):
// - sem sessão salva -> status resolve para unauthenticated
// - com sessão salva válida -> status resolve para authenticated
// - logout() chamado no contexto reflete unauthenticated imediatamente
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text, TouchableOpacity } from "react-native";

const mockOnSessionExpired = jest.fn();

jest.mock("./auth-client", () => ({
  getSession: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  onSessionExpired: (listener: () => void) => mockOnSessionExpired(listener),
}));

import { getSession, logout as authLogout } from "./auth-client";
import { AuthProvider, useAuth } from "./auth-provider";

const VALID_SESSION = {
  accessToken: "a",
  refreshToken: "r",
  accessTokenExpiresAt: Date.now() + 60_000,
};

function StatusProbe() {
  const { status } = useAuth();
  return <Text testID="status">{status}</Text>;
}

function StatusAndLogoutProbe() {
  const { status, logout } = useAuth();
  return (
    <>
      <Text testID="status">{status}</Text>
      <TouchableOpacity testID="logout-button" onPress={logout}>
        <Text>sair</Text>
      </TouchableOpacity>
    </>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnSessionExpired.mockReturnValue(() => {});
  });

  it("sem sessão salva: status resolve para unauthenticated", async () => {
    (getSession as jest.Mock).mockResolvedValue(null);

    await render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").props.children).toBe("unauthenticated");
    });
  });

  it("com sessão salva válida: status resolve para authenticated", async () => {
    (getSession as jest.Mock).mockResolvedValue(VALID_SESSION);

    await render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").props.children).toBe("authenticated");
    });
  });

  it("logout() chamado no contexto reflete status unauthenticated imediatamente, sem esperar reload", async () => {
    (getSession as jest.Mock).mockResolvedValue(VALID_SESSION);
    (authLogout as jest.Mock).mockResolvedValue(undefined);

    await render(
      <AuthProvider>
        <StatusAndLogoutProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").props.children).toBe("authenticated");
    });

    await fireEvent.press(screen.getByTestId("logout-button"));

    expect(screen.getByTestId("status").props.children).toBe("unauthenticated");
    expect(authLogout).toHaveBeenCalledTimes(1);
  });

  it("AC 4: sessão encerrada por falha de renovação (onSessionExpired) reflete unauthenticated, sem chamar logout()", async () => {
    (getSession as jest.Mock).mockResolvedValue(VALID_SESSION);
    let capturedListener: (() => void) | undefined;
    mockOnSessionExpired.mockImplementation((listener: () => void) => {
      capturedListener = listener;
      return () => {};
    });

    await render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").props.children).toBe("authenticated");
    });

    await act(async () => {
      capturedListener?.();
    });

    expect(screen.getByTestId("status").props.children).toBe("unauthenticated");
    // SecureStore já foi limpo por auth-client antes de notificar — o
    // AuthProvider só precisa refletir o status, não chamar logout() de novo.
    expect(authLogout).not.toHaveBeenCalled();
  });
});
