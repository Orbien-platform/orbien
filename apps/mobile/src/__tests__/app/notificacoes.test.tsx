// Testes de NotificacoesScreen (MOB-10, T13 do tasks.md). Derivados do
// Done-when: mount sem preferência salva mostra as 4 ligadas (AC1),
// toggle bem-sucedido persiste e sincroniza tag (AC2/AC1 da segunda
// história), toggle com falha reverte e mostra erro (AC3), duas
// categorias tocadas em sequência rápida não se atropelam (Edge Case).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockGetNotificationPreferences = jest.fn();
const mockUpdateNotificationPreferences = jest.fn();
jest.mock("../../lib/notifications/notification-preferences-client", () => ({
  getNotificationPreferences: (...args: unknown[]) => mockGetNotificationPreferences(...args),
  updateNotificationPreferences: (...args: unknown[]) => mockUpdateNotificationPreferences(...args),
}));

const mockSyncNotificationPreferenceTags = jest.fn();
jest.mock("../../lib/notifications/onesignal-client", () => ({
  syncNotificationPreferenceTags: (...args: unknown[]) => mockSyncNotificationPreferenceTags(...args),
}));

import NotificacoesScreen from "../../app/notificacoes";

const ALL_ON = { avisos: true, oracao: true, eventos: true, devocional: true };

describe("NotificacoesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mount sem preferência salva mostra as 4 categorias ligadas (AC1)", async () => {
    mockGetNotificationPreferences.mockResolvedValue(ALL_ON);

    await act(async () => {
      render(<NotificacoesScreen />);
    });

    expect(screen.getByTestId("switch-avisos").props.value).toBe(true);
    expect(screen.getByTestId("switch-oracao").props.value).toBe(true);
    expect(screen.getByTestId("switch-eventos").props.value).toBe(true);
    expect(screen.getByTestId("switch-devocional").props.value).toBe(true);
  });

  it("desligar uma categoria persiste otimisticamente, chama PATCH da categoria isolada e sincroniza a tag ao suceder (AC2)", async () => {
    mockGetNotificationPreferences.mockResolvedValue(ALL_ON);
    const updated = { ...ALL_ON, oracao: false };
    mockUpdateNotificationPreferences.mockResolvedValue(updated);

    await act(async () => {
      render(<NotificacoesScreen />);
    });
    await waitFor(() => screen.getByTestId("switch-oracao"));

    await act(async () => {
      fireEvent(screen.getByTestId("switch-oracao"), "valueChange", false);
    });

    // Estado otimista já reflete desligado antes do PATCH resolver.
    expect(screen.getByTestId("switch-oracao").props.value).toBe(false);

    await waitFor(() => {
      expect(mockUpdateNotificationPreferences).toHaveBeenCalledWith({ oracao: false });
    });
    await waitFor(() => {
      expect(mockSyncNotificationPreferenceTags).toHaveBeenCalledWith(updated);
    });
  });

  it("toggle com falha reverte o estado visual e mostra erro, sem deixar a UI divergir do servidor (AC3)", async () => {
    mockGetNotificationPreferences.mockResolvedValue(ALL_ON);
    mockUpdateNotificationPreferences.mockRejectedValue(new Error("falha de rede"));

    await act(async () => {
      render(<NotificacoesScreen />);
    });
    await waitFor(() => screen.getByTestId("switch-eventos"));

    await act(async () => {
      fireEvent(screen.getByTestId("switch-eventos"), "valueChange", false);
    });

    await waitFor(() => {
      expect(screen.getByTestId("save-error")).toBeTruthy();
    });
    expect(screen.getByTestId("switch-eventos").props.value).toBe(true);
    expect(mockSyncNotificationPreferenceTags).not.toHaveBeenCalled();
  });

  it("duas categorias diferentes tocadas em sequência rápida não se atropelam (Edge Case — fila por categoria, não global)", async () => {
    mockGetNotificationPreferences.mockResolvedValue(ALL_ON);
    let resolveAvisos: (value: unknown) => void;
    const avisosPromise = new Promise((resolve) => {
      resolveAvisos = resolve;
    });
    mockUpdateNotificationPreferences.mockImplementationOnce(() => avisosPromise);
    mockUpdateNotificationPreferences.mockResolvedValueOnce({ ...ALL_ON, eventos: false });

    await act(async () => {
      render(<NotificacoesScreen />);
    });
    await waitFor(() => screen.getByTestId("switch-avisos"));

    // Desliga "avisos" (fica pendente) e, sem esperar, "eventos".
    await act(async () => {
      fireEvent(screen.getByTestId("switch-avisos"), "valueChange", false);
    });
    await act(async () => {
      fireEvent(screen.getByTestId("switch-eventos"), "valueChange", false);
    });

    // "eventos" não espera a resposta pendente de "avisos" para resolver.
    await waitFor(() => {
      expect(screen.getByTestId("switch-eventos").props.value).toBe(false);
    });
    expect(mockSyncNotificationPreferenceTags).toHaveBeenCalledWith({ ...ALL_ON, eventos: false });

    // resposta atrasada de "avisos" chega depois — aplica normalmente.
    await act(async () => {
      resolveAvisos!({ ...ALL_ON, avisos: false, eventos: false });
    });
    await waitFor(() => {
      expect(screen.getByTestId("switch-avisos").props.value).toBe(false);
    });
  });

  it("erro ao carregar preferências mostra mensagem visível", async () => {
    mockGetNotificationPreferences.mockRejectedValue(new Error("falha de rede"));

    await act(async () => {
      render(<NotificacoesScreen />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("load-error")).toBeTruthy();
    });
  });
});
