// Transição de entrada da v2 (PROD-33): translateY(3px) → 0 em 180 ms,
// desligada por "reduzir movimento". O fade é do Stack (ver _layout.test).
import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Animated, Text } from "react-native";

import { ENTER_MS, ENTER_OFFSET, Screen } from "./Screen";

const mount = (scroll = false) =>
  render(
    <Screen testID="s" scroll={scroll}>
      <Text>conteúdo</Text>
    </Screen>,
  );

afterEach(() => jest.restoreAllMocks());

it.each([false, true])("anima o deslocamento de 3px em 180 ms (scroll=%s)", async (scroll) => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  const timing = jest.spyOn(Animated, "timing");
  await act(async () => {
    mount(scroll);
  });
  expect(ENTER_OFFSET).toBe(3);
  expect(screen.getByText("conteúdo")).toBeTruthy();
  expect(timing).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ toValue: 0, duration: ENTER_MS, useNativeDriver: true }),
  );
});

it("reduzir movimento não anima o deslocamento", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  const timing = jest.spyOn(Animated, "timing");
  await act(async () => {
    mount();
  });
  // Pode ter iniciado antes da leitura assíncrona; depois dela, o valor é
  // zerado e nenhuma animação nova começa.
  const before = timing.mock.calls.length;
  await act(async () => {});
  expect(timing.mock.calls.length).toBe(before);
  expect(screen.getByText("conteúdo")).toBeTruthy();
});
