// Testes derivados do Done-when de T12 (tasks.md):
// - sem sessão salva -> status resolve para unauthenticated
// - com sessão salva válida -> status resolve para authenticated
// - logout() chamado no contexto reflete unauthenticated imediatamente
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text, TouchableOpacity } from "react-native";

jest.mock("./auth-client", () => ({
  getSession: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
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
});
