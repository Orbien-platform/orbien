import NetInfo from "@react-native-community/netinfo";
import { renderHook } from "@testing-library/react-native";

import { isOnline, SETTLE_MS, useReloadOnReconnect } from "./use-reload-on-reconnect";

type Listener = (s: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void;
const unsubscribe = jest.fn();
let listener: Listener;

const emit = (isConnected: boolean | null, isInternetReachable: boolean | null = isConnected) =>
  listener({ isConnected, isInternetReachable });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (NetInfo.addEventListener as jest.Mock).mockImplementation((cb: Listener) => {
    listener = cb;
    return unsubscribe;
  });
});
afterEach(() => jest.useRealTimers());

describe("isOnline", () => {
  it("só é offline quando o NetInfo diz false; null é desconhecido", async () => {
    expect(isOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
    expect(isOnline({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(isOnline({ isConnected: false, isInternetReachable: false })).toBe(false);
    expect(isOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });
});

describe("useReloadOnReconnect", () => {
  it("não assina a rede enquanto desligado", async () => {
    await renderHook(() => useReloadOnReconnect(false, jest.fn()));
    expect(NetInfo.addEventListener).not.toHaveBeenCalled();
  });

  it("conexão cai, volta e a tela recarrega uma vez", async () => {
    const reload = jest.fn();
    await renderHook(() => useReloadOnReconnect(true, reload));
    emit(false);
    emit(true);
    expect(reload).not.toHaveBeenCalled();
    jest.advanceTimersByTime(SETTLE_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    emit(true);
    jest.advanceTimersByTime(SETTLE_MS * 2);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("conexão que já estava ok não recarrega", async () => {
    const reload = jest.fn();
    await renderHook(() => useReloadOnReconnect(true, reload));
    emit(true);
    emit(true, null);
    jest.advanceTimersByTime(SETTLE_MS * 2);
    expect(reload).not.toHaveBeenCalled();
  });

  it("rede oscilando gera uma releitura só", async () => {
    const reload = jest.fn();
    await renderHook(() => useReloadOnReconnect(true, reload));
    emit(false);
    emit(true);
    jest.advanceTimersByTime(SETTLE_MS / 2);
    emit(false);
    emit(true);
    emit(true);
    jest.advanceTimersByTime(SETTLE_MS * 3);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("usa o reload mais recente e cancela tudo ao desmontar", async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender, unmount } = await renderHook(
      ({ fn }: { fn: () => void }) => useReloadOnReconnect(true, fn),
      { initialProps: { fn: first } },
    );
    await rerender({ fn: second });
    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
    emit(false);
    emit(true);
    jest.advanceTimersByTime(SETTLE_MS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    emit(false);
    emit(true);
    await unmount();
    jest.advanceTimersByTime(SETTLE_MS);
    expect(second).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalled();
  });
});
