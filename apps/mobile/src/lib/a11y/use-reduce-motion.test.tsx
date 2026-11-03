import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { useReduceMotion } from "./use-reduce-motion";

const remove = jest.fn();
let onChange: (v: boolean) => void;

beforeEach(() => {
  jest.restoreAllMocks();
  remove.mockClear();
  jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((_: string, cb: (v: boolean) => void) => {
    onChange = cb;
    return { remove };
  }) as never);
});

it("lê o valor do sistema e acompanha mudanças", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  const { result, unmount } = await renderHook(() => useReduceMotion());
  await waitFor(() => expect(result.current).toBe(true));
  await act(async () => onChange(false));
  expect(result.current).toBe(false);
  await unmount();
  expect(remove).toHaveBeenCalled();
});

it("falha na leitura vale como movimento normal", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockRejectedValue(new Error("x"));
  const { result } = await renderHook(() => useReduceMotion());
  await waitFor(() => expect(result.current).not.toBeNull());
  await act(async () => {});
  expect(result.current).toBe(false);
});

it("desmontar antes da leitura não atualiza o estado", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  const { unmount } = await renderHook(() => useReduceMotion());
  await unmount();
  await act(async () => {});
});
