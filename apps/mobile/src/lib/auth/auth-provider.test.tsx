// Testes derivados do Done-when de T12 (tasks.md):
// - sem sessão salva -> status resolve para unauthenticated
// - com sessão salva válida -> status resolve para authenticated
// - logout() chamado no contexto reflete unauthenticated imediatamente
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

const mockOnSessionExpired = jest.fn();

jest.mock("./auth-client", () => ({
  getSession: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  onSessionExpired: (listener: () => void) => mockOnSessionExpired(listener),
}));

const mockFetchAreas = jest.fn();
jest.mock("../permissions/permissions-client", () => ({
  fetchAreas: (...args: unknown[]) => mockFetchAreas(...args),
}));

import { getSession, login as authLogin, logout as authLogout } from "./auth-client";
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

function StatusAndAreasProbe() {
  const { status, areas } = useAuth();
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="areas">{areas === null ? "null" : areas.join(",")}</Text>
    </>
  );
}

// Captura `logout` do contexto sem depender de simulação de toque nativa
// (TouchableOpacity + fireEvent.press mostrou-se intermitentemente lento
// no CI, estourando o timeout do Jest mesmo em 20s — a asserção real deste
// teste é sobre o comportamento de AuthProvider.logout(), não sobre como um
// toque físico dispara onPress, então chamar a função direta é tão fiel ao
// contrato quanto simular o toque, e remove essa fonte de flake).
function StatusAndLogoutProbe({
  onLogoutCaptured,
}: {
  onLogoutCaptured: (logout: () => Promise<void>) => void;
}) {
  const { status, logout } = useAuth();
  onLogoutCaptured(logout);
  return <Text testID="status">{status}</Text>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnSessionExpired.mockReturnValue(() => {});
    mockFetchAreas.mockResolvedValue(null);
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

  it("getSession() rejeita (ex.: leitura do SecureStore falha): status resolve para unauthenticated em vez de travar em loading", async () => {
    (getSession as jest.Mock).mockRejectedValue(new Error("falha ao ler o SecureStore"));

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
    let capturedLogout: (() => Promise<void>) | undefined;

    await render(
      <AuthProvider>
        <StatusAndLogoutProbe
          onLogoutCaptured={(logout) => {
            capturedLogout = logout;
          }}
        />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").props.children).toBe("authenticated");
    });

    await act(async () => {
      await capturedLogout?.();
    });

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

  it("boot com sessão salva busca as áreas e as reflete no contexto", async () => {
    (getSession as jest.Mock).mockResolvedValue(VALID_SESSION);
    mockFetchAreas.mockResolvedValue(["volunteers", "content"]);

    await render(
      <AuthProvider>
        <StatusAndAreasProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("areas").props.children).toBe("volunteers,content");
    });
    expect(mockFetchAreas).toHaveBeenCalledTimes(1);
  });

  it("boot sem sessão salva não busca áreas", async () => {
    (getSession as jest.Mock).mockResolvedValue(null);

    await render(
      <AuthProvider>
        <StatusAndAreasProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").props.children).toBe("unauthenticated");
    });
    expect(mockFetchAreas).not.toHaveBeenCalled();
  });

  it("status vira authenticated sem esperar a resposta de áreas (fail-open enquanto pendente)", async () => {
    (getSession as jest.Mock).mockResolvedValue(VALID_SESSION);
    let resolveAreas: (value: string[] | null) => void = () => {};
    mockFetchAreas.mockReturnValue(
      new Promise<string[] | null>((resolve) => {
        resolveAreas = resolve;
      }),
    );

    await render(
      <AuthProvider>
        <StatusAndAreasProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").props.children).toBe("authenticated");
    });
    // `fetchAreas` ainda não respondeu — o contexto não travou esperando.
    expect(screen.getByTestId("areas").props.children).toBe("null");

    await act(async () => {
      resolveAreas(["volunteers"]);
      await Promise.resolve();
    });

    expect(screen.getByTestId("areas").props.children).toBe("volunteers");
  });

  it("login() busca as áreas depois de autenticar, sem atrasar a transição de status", async () => {
    (getSession as jest.Mock).mockResolvedValue(null);
    (authLogin as jest.Mock).mockResolvedValue(VALID_SESSION);
    mockFetchAreas.mockResolvedValue(["volunteers"]);
    let capturedLogin: ((email: string, password: string) => Promise<void>) | undefined;

    function LoginProbe({
      onLoginCaptured,
    }: {
      onLoginCaptured: (login: (email: string, password: string) => Promise<void>) => void;
    }) {
      const { status, areas, login } = useAuth();
      onLoginCaptured(login);
      return (
        <>
          <Text testID="status">{status}</Text>
          <Text testID="areas">{areas === null ? "null" : areas.join(",")}</Text>
        </>
      );
    }

    await render(
      <AuthProvider>
        <LoginProbe
          onLoginCaptured={(login) => {
            capturedLogin = login;
          }}
        />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("status").props.children).toBe("unauthenticated");
    });

    await act(async () => {
      await capturedLogin?.("ana@igreja.com", "123456");
    });

    expect(screen.getByTestId("status").props.children).toBe("authenticated");
    await waitFor(() => {
      expect(screen.getByTestId("areas").props.children).toBe("volunteers");
    });
  });

  it("logout() limpa as áreas junto do status", async () => {
    (getSession as jest.Mock).mockResolvedValue(VALID_SESSION);
    (authLogout as jest.Mock).mockResolvedValue(undefined);
    mockFetchAreas.mockResolvedValue(["volunteers"]);
    let capturedLogout: (() => Promise<void>) | undefined;

    function LogoutProbe({
      onLogoutCaptured,
    }: {
      onLogoutCaptured: (logout: () => Promise<void>) => void;
    }) {
      const { status, areas, logout } = useAuth();
      onLogoutCaptured(logout);
      return (
        <>
          <Text testID="status">{status}</Text>
          <Text testID="areas">{areas === null ? "null" : areas.join(",")}</Text>
        </>
      );
    }

    await render(
      <AuthProvider>
        <LogoutProbe
          onLogoutCaptured={(logout) => {
            capturedLogout = logout;
          }}
        />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("areas").props.children).toBe("volunteers");
    });

    await act(async () => {
      await capturedLogout?.();
    });

    expect(screen.getByTestId("status").props.children).toBe("unauthenticated");
    expect(screen.getByTestId("areas").props.children).toBe("null");
  });
});
