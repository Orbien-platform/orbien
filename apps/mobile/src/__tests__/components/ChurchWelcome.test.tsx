// Transição de entrada (v2): fica até o branding resolver, nunca menos que
// o mínimo e nunca mais que o teto.
import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

const mockTheme = { current: { brandingResolved: false } };
jest.mock("../../lib/theme/theme-provider", () => {
  const { palettes } = jest.requireActual("../../lib/theme/tokens");
  return {
    useTheme: () => ({
      appName: "Igreja Teste",
      primaryColor: "#1E3A7B",
      logoUrl: null,
      logoUrlDark: null,
      accentColor: "#00E5C7",
      isDark: true,
      colors: palettes.dark,
      ...mockTheme.current,
    }),
  };
});

import { ChurchWelcome, WELCOME_MAX_MS, WELCOME_MIN_MS } from "../../components/ChurchWelcome";

describe("ChurchWelcome", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockTheme.current = { brandingResolved: false };
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("mostra o nome da igreja", async () => {
    await render(<ChurchWelcome onFinish={jest.fn()} />);
    expect(screen.getByText("Igreja Teste")).toBeTruthy();
  });

  it("com o branding resolvido, sai depois do mínimo — não antes", async () => {
    mockTheme.current = { brandingResolved: true };
    const onFinish = jest.fn();
    await render(<ChurchWelcome onFinish={onFinish} />);

    await act(async () => {
      jest.advanceTimersByTime(WELCOME_MIN_MS - 1);
    });
    expect(onFinish).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("sem resposta do GET /settings, sai no teto", async () => {
    const onFinish = jest.fn();
    await render(<ChurchWelcome onFinish={onFinish} />);

    await act(async () => {
      jest.advanceTimersByTime(WELCOME_MAX_MS - 1);
    });
    expect(onFinish).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
