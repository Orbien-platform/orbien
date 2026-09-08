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
jest.mock("./onesignal-client", () => ({
  initializeOneSignal: (...args: unknown[]) => mockInitializeOneSignal(...args),
  registerDevice: (...args: unknown[]) => mockRegisterDevice(...args),
  unregisterDevice: (...args: unknown[]) => mockUnregisterDevice(...args),
  onNotificationClick: (...args: unknown[]) => {
    mockOnNotificationClick(...args);
    return mockRemoveClickListener;
  },
}));

import { NotificationsProvider } from "./notifications-provider";

describe("NotificationsProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it("clique em push com post_id navega para /post/:id", async () => {
    mockUseAuth.mockReturnValue({ session: null });

    await act(async () => {
      render(
        <NotificationsProvider>
          <Text>conteúdo</Text>
        </NotificationsProvider>,
      );
    });

    const clickHandler = mockOnNotificationClick.mock.calls[0]![0];
    clickHandler("post-1");

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
