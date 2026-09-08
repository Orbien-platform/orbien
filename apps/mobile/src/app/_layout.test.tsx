// Testes derivados do Done-when de T14 (tasks.md):
// - unauthenticated renderiza a tela de login (via router mock)
// - authenticated renderiza o shell placeholder
import { render, screen } from "@testing-library/react-native";

const mockUseAuth = jest.fn();
jest.mock("../lib/auth/auth-provider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockUseAuth(),
}));

jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  return {
    Stack: () => <Text testID="shell-placeholder">shell</Text>,
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
  };
});

import RootLayout from "./_layout";

describe("RootLayout — guarda de navegação", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("status unauthenticated: renderiza redirect para /login, não o shell", async () => {
    mockUseAuth.mockReturnValue({ status: "unauthenticated" });

    await render(<RootLayout />);

    expect(screen.getByTestId("redirect").props.children).toBe("/login");
    expect(screen.queryByTestId("shell-placeholder")).toBeNull();
  });

  it("status authenticated: renderiza o shell placeholder, sem redirect", async () => {
    mockUseAuth.mockReturnValue({ status: "authenticated" });

    await render(<RootLayout />);

    expect(screen.getByTestId("shell-placeholder")).toBeTruthy();
    expect(screen.queryByTestId("redirect")).toBeNull();
  });

  it("status loading: mostra splash, sem redirect nem shell", async () => {
    mockUseAuth.mockReturnValue({ status: "loading" });

    await render(<RootLayout />);

    expect(screen.getByTestId("splash")).toBeTruthy();
    expect(screen.queryByTestId("redirect")).toBeNull();
    expect(screen.queryByTestId("shell-placeholder")).toBeNull();
  });
});
