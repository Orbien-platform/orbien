// Testes de onesignal-client (MOB-07, T4 do tasks.md).

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { oneSignalAppId: "app-id-teste" },
    },
  },
}));

const mockInitialize = jest.fn();
const mockLogin = jest.fn();
const mockLogout = jest.fn();
const mockAddTags = jest.fn();
const mockRequestPermission = jest.fn();
const mockAddEventListener = jest.fn();
const mockRemoveEventListener = jest.fn();

jest.mock("react-native-onesignal", () => ({
  OneSignal: {
    initialize: (...args: unknown[]) => mockInitialize(...args),
    login: (...args: unknown[]) => mockLogin(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
    User: {
      addTags: (...args: unknown[]) => mockAddTags(...args),
    },
    Notifications: {
      requestPermission: (...args: unknown[]) => mockRequestPermission(...args),
      addEventListener: (...args: unknown[]) => mockAddEventListener(...args),
      removeEventListener: (...args: unknown[]) => mockRemoveEventListener(...args),
    },
  },
}));

import {
  initializeOneSignal,
  onNotificationClick,
  registerDevice,
  unregisterDevice,
} from "./onesignal-client";

function makeToken(payload: object): string {
  const base64url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${base64url({ alg: "HS256" })}.${base64url(payload)}.signature`;
}

describe("onesignal-client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("initializeOneSignal", () => {
    it("inicializa o SDK com o appId de Constants.expoConfig.extra e pede permissão", () => {
      initializeOneSignal();

      expect(mockInitialize).toHaveBeenCalledWith("app-id-teste");
      expect(mockRequestPermission).toHaveBeenCalledWith(true);
    });
  });

  describe("registerDevice", () => {
    it("chama login com o sub e addTags com tenant_id/congregation_id/role do token", () => {
      const token = makeToken({
        sub: "user-1",
        tenant_id: "tenant-1",
        congregation_id: "cong-1",
        roles: ["member", "volunteer"],
        exp: 1893456000,
      });

      registerDevice(token);

      expect(mockLogin).toHaveBeenCalledWith("user-1");
      expect(mockAddTags).toHaveBeenCalledWith({
        tenant_id: "tenant-1",
        congregation_id: "cong-1",
        role: "member",
      });
    });

    it("token indecodificável: não chama login nem addTags", () => {
      registerDevice("token-invalido");

      expect(mockLogin).not.toHaveBeenCalled();
      expect(mockAddTags).not.toHaveBeenCalled();
    });
  });

  describe("unregisterDevice", () => {
    it("chama OneSignal.logout()", () => {
      unregisterDevice();

      expect(mockLogout).toHaveBeenCalled();
    });
  });

  describe("onNotificationClick", () => {
    it("chama o handler com o post_id do evento", () => {
      const handler = jest.fn();
      onNotificationClick(handler);

      const listener = mockAddEventListener.mock.calls[0]![1];
      listener({ notification: { additionalData: { post_id: "post-1" } } });

      expect(handler).toHaveBeenCalledWith("post-1");
    });

    it("não chama o handler quando o evento não tem post_id", () => {
      const handler = jest.fn();
      onNotificationClick(handler);

      const listener = mockAddEventListener.mock.calls[0]![1];
      listener({ notification: { additionalData: {} } });
      listener({ notification: {} });

      expect(handler).not.toHaveBeenCalled();
    });

    it("devolve uma função que remove o listener", () => {
      const handler = jest.fn();
      const unsubscribe = onNotificationClick(handler);

      unsubscribe();

      expect(mockRemoveEventListener).toHaveBeenCalledWith(
        "click",
        mockAddEventListener.mock.calls[0]![1],
      );
    });
  });
});
