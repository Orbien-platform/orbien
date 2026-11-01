// Testes de NotificationsProvider (MOB-07, T5 do tasks.md).
import { Text } from "react-native";
import { act, render, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseAuth = jest.fn();
jest.mock("../auth/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockInitializeOneSignal = jest.fn();
const mockRegisterDevice = jest.fn();
const mockUnregisterDevice = jest.fn();
const mockOnNotificationClick = jest.fn();
const mockRemoveClickListener = jest.fn();
const mockSyncNotificationPreferenceTags = jest.fn();
const mockRegisterPersonTag = jest.fn();
jest.mock("./onesignal-client", () => ({
  registerPersonTag: (...args: unknown[]) => mockRegisterPersonTag(...args),
  initializeOneSignal: (...args: unknown[]) => mockInitializeOneSignal(...args),
  registerDevice: (...args: unknown[]) => mockRegisterDevice(...args),
  unregisterDevice: (...args: unknown[]) => mockUnregisterDevice(...args),
  syncNotificationPreferenceTags: (...args: unknown[]) => mockSyncNotificationPreferenceTags(...args),
  onNotificationClick: (...args: unknown[]) => {
    mockOnNotificationClick(...args);
    return mockRemoveClickListener;
  },
}));

const mockGetNotificationPreferences = jest.fn();
jest.mock("./notification-preferences-client", () => ({
  getNotificationPreferences: (...args: unknown[]) => mockGetNotificationPreferences(...args),
}));

const mockGetMyPersonId = jest.fn();
jest.mock("../privacidade/privacidade-client", () => ({
  getMyPersonId: (...args: unknown[]) => mockGetMyPersonId(...args),
}));

import { NotificationsProvider } from "./notifications-provider";

describe("NotificationsProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNotificationPreferences.mockResolvedValue({
      avisos: true,
      oracao: true,
      eventos: true,
      devocional: true,
      biblia: true,
      kids: true,
    });
    mockGetMyPersonId.mockResolvedValue("person-9");
  });

  it("inicializa o SDK e registra o listener de clique no mount", async () => {
    mockUseAuth.mockReturnValue({
      session: { accessToken: "token-abc", refreshToken: "r", accessTokenExpiresAt: Date.now() + 900_000 },
    });

    await act(async () => {
      render(
        <NotificationsProvider>
          <Text>conteúdo</Text>
        </NotificationsProvider>,
      );
    });

    expect(mockInitializeOneSignal).toHaveBeenCalled();
    expect(mockOnNotificationClick).toHaveBeenCalledWith(expect.any(Function));
  });

  it("sessão presente no mount: registra o dispositivo com o accessToken", async () => {
    mockUseAuth.mockReturnValue({
      session: { accessToken: "token-abc", refreshToken: "r", accessTokenExpiresAt: Date.now() + 900_000 },
    });

    await act(async () => {
      render(
        <NotificationsProvider>
          <Text>conteúdo</Text>
        </NotificationsProvider>,
      );
    });

    expect(mockRegisterDevice).toHaveBeenCalledWith("token-abc");
  });

  it("sessão presente: grava a tag person_id com a pessoa da conta (destino do push de escala e Kids)", async () => {
    mockUseAuth.mockReturnValue({
      session: { accessToken: "token-abc", refreshToken: "r", accessTokenExpiresAt: Date.now() + 900_000 },
    });

    await act(async () => {
      render(
        <NotificationsProvider>
          <Text>conteúdo</Text>
        </NotificationsProvider>,
      );
    });

    expect(mockRegisterPersonTag).toHaveBeenCalledWith("person-9");
  });

  it("não conseguir descobrir a pessoa não derruba o app nem grava tag", async () => {
    mockGetMyPersonId.mockRejectedValue(new Error("rede fora"));
    mockUseAuth.mockReturnValue({
      session: { accessToken: "token-abc", refreshToken: "r", accessTokenExpiresAt: Date.now() + 900_000 },
    });

    await act(async () => {
      render(
        <NotificationsProvider>
          <Text>conteúdo</Text>
        </NotificationsProvider>,
      );
    });

    expect(screen.getByText("conteúdo")).toBeTruthy();
    expect(mockRegisterPersonTag).not.toHaveBeenCalled();
  });

  it("sessão encerrada antes da resposta: a tag da pessoa anterior não vai para o aparelho", async () => {
    let resolvePerson: (id: string) => void = () => undefined;
    mockGetMyPersonId.mockReturnValue(new Promise<string>((resolve) => (resolvePerson = resolve)));
    mockUseAuth.mockReturnValue({
      session: { accessToken: "token-abc", refreshToken: "r", accessTokenExpiresAt: Date.now() + 900_000 },
    });

    let view!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      view = await render(
        <NotificationsProvider>
          <Text>conteúdo</Text>
        </NotificationsProvider>,
      );
    });
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      resolvePerson("person-9");
    });

    expect(mockRegisterPersonTag).not.toHaveBeenCalled();
  });

  it("sem sessão no mount: não registra o dispositivo", async () => {
    mockUseAuth.mockReturnValue({ session: null });

    await act(async () => {
      render(
        <NotificationsProvider>
          <Text>conteúdo</Text>
        </NotificationsProvider>,
      );
    });

    expect(mockRegisterDevice).not.toHaveBeenCalled();
  });

  it("sessão presente: busca preferências e sincroniza as tags com o resultado (MOB-10b, AC2)", async () => {
    const prefs = { avisos: true, oracao: false, eventos: true, devocional: false, biblia: false, kids: true };
    mockGetNotificationPreferences.mockResolvedValue(prefs);
    mockUseAuth.mockReturnValue({
      session: { accessToken: "token-abc", refreshToken: "r", accessTokenExpiresAt: Date.now() + 900_000 },
    });

    await act(async () => {
      render(
        <NotificationsProvider>
          <Text>conteúdo</Text>
        </NotificationsProvider>,
      );
    });

    expect(mockGetNotificationPreferences).toHaveBeenCalled();
    expect(mockSyncNotificationPreferenceTags).toHaveBeenCalledWith(prefs);
  });

  it("GET de preferências falhando (rede) não lança erro não tratado nem impede a navegação (MOB-10b, AC2)", async () => {
    mockGetNotificationPreferences.mockRejectedValue(new Error("rede fora"));
    mockUseAuth.mockReturnValue({
      session: { accessToken: "token-abc", refreshToken: "r", accessTokenExpiresAt: Date.now() + 900_000 },
    });

    await act(async () => {
      render(
        <NotificationsProvider>
          <Text>conteúdo</Text>
        </NotificationsProvider>,
      );
    });

    expect(screen.getByText("conteúdo")).toBeTruthy();
    expect(mockSyncNotificationPreferenceTags).not.toHaveBeenCalled();
  });

  it("sem sessão no mount: não busca preferências", async () => {
    mockUseAuth.mockReturnValue({ session: null });

    await act(async () => {
      render(
        <NotificationsProvider>
          <Text>conteúdo</Text>
        </NotificationsProvider>,
      );
    });

    expect(mockGetNotificationPreferences).not.toHaveBeenCalled();
  });

  it("desmontar o provider (equivalente ao AuthGate trocar para /login) de-registra o dispositivo", async () => {
    mockUseAuth.mockReturnValue({
      session: { accessToken: "token-abc", refreshToken: "r", accessTokenExpiresAt: Date.now() + 900_000 },
    });

    const view = await render(
      <NotificationsProvider>
        <Text>conteúdo</Text>
      </NotificationsProvider>,
    );

    await act(async () => {
      view.unmount();
    });

    expect(mockUnregisterDevice).toHaveBeenCalled();
  });

  it("clique em push navega para a rota que o cliente resolveu", async () => {
    mockUseAuth.mockReturnValue({ session: null });

    await act(async () => {
      render(
        <NotificationsProvider>
          <Text>conteúdo</Text>
        </NotificationsProvider>,
      );
    });

    const clickHandler = mockOnNotificationClick.mock.calls[0]![0];
    clickHandler("/post/post-1");

    expect(mockPush).toHaveBeenCalledWith("/post/post-1");
  });

  it("renderiza os children normalmente", async () => {
    mockUseAuth.mockReturnValue({ session: null });

    await act(async () => {
      render(
        <NotificationsProvider>
          <Text>conteúdo</Text>
        </NotificationsProvider>,
      );
    });

    expect(screen.getByText("conteúdo")).toBeTruthy();
  });
});
