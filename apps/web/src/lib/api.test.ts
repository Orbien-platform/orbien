import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import api from "./api";
import axios from "axios";

type FakeAxiosError = AxiosError & { config: InternalAxiosRequestConfig & { _retry?: boolean } };

interface InterceptorManager<T> {
  handlers: Array<{ fulfilled?: T; rejected?: T } | null> | undefined;
}

// `handlers` não é tipado como público pela declaração do axios, mas é como
// o próprio axios registra e percorre os interceptors — é o jeito padrão de
// testar um interceptor sem montar um servidor HTTP de verdade.
function responseRejected(instance: AxiosInstance = api) {
  const manager = instance.interceptors.response as unknown as InterceptorManager<
    (error: FakeAxiosError) => Promise<unknown>
  >;
  return manager.handlers![0]!.rejected!;
}

function makeError(overrides: Record<string, unknown> = {}): FakeAxiosError {
  return {
    response: { status: 401 },
    config: { headers: {} as Record<string, string>, ...overrides },
  } as unknown as FakeAxiosError;
}

describe("interceptor de resposta — casos que apenas repassam o erro", () => {
  it("repassa erros que não são 401", async () => {
    const error = {
      response: { status: 500 },
      config: { headers: {} },
    } as unknown as FakeAxiosError;

    await expect(responseRejected()(error)).rejects.toBe(error);
  });

  it("repassa quando já é um retry (_retry)", async () => {
    const error = makeError({ _retry: true });

    await expect(responseRejected()(error)).rejects.toBe(error);
  });
});

describe("interceptor de resposta — refresh de token", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "" },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it("com refresh bem-sucedido: refaz a chamada original", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: {} });
    api.defaults.adapter = vi.fn().mockResolvedValue({
      data: { ok: true },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {},
    });

    const error = makeError();
    const result = (await responseRejected()(error)) as { data: unknown; status: number };

    expect(axios.post).toHaveBeenCalledWith("/api/session/refresh");
    expect(result.data).toEqual({ ok: true });
    expect(result.status).toBe(200);
  });

  it("quando o refresh falha: manda para /login e propaga o erro do refresh", async () => {
    const refreshError = new Error("refresh_failed");
    vi.spyOn(axios, "post").mockRejectedValue(refreshError);

    const error = makeError();

    await expect(responseRejected()(error)).rejects.toBe(refreshError);

    expect(window.location.href).toBe("/login");
  });

  it("sem window: não tenta redirecionar quando o refresh falha", async () => {
    const originalWindow = globalThis.window;
    vi.spyOn(axios, "post").mockRejectedValue(new Error("refresh_failed"));
    // @ts-expect-error simula ambiente sem window (SSR)
    delete globalThis.window;

    try {
      await expect(responseRejected()(makeError())).rejects.toThrow("refresh_failed");
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("enfileira requisições concorrentes enquanto o refresh está em andamento", async () => {
    let resolveRefresh: (value: unknown) => void = () => {};
    vi.spyOn(axios, "post").mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );
    api.defaults.adapter = vi.fn().mockResolvedValue({
      data: {},
      status: 200,
      statusText: "OK",
      headers: {},
      config: {},
    });

    const first = responseRejected()(makeError());
    const second = responseRejected()(makeError());

    resolveRefresh({ data: {} });

    await expect(first).resolves.toBeDefined();
    await expect(second).resolves.toBeDefined();
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it("propaga o erro para requisições enfileiradas quando o refresh que está em andamento falha", async () => {
    let rejectRefresh: (error: unknown) => void = () => {};
    vi.spyOn(axios, "post").mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRefresh = reject;
      })
    );

    const first = responseRejected()(makeError());
    const second = responseRejected()(makeError());

    const refreshError = new Error("refresh_failed");
    rejectRefresh(refreshError);

    await expect(first).rejects.toBe(refreshError);
    await expect(second).rejects.toBe(refreshError);
  });

  it("isRefreshing volta a false depois de um refresh malsucedido, liberando o próximo 401", async () => {
    vi.spyOn(axios, "post").mockRejectedValueOnce(new Error("primeira falha"));
    await expect(responseRejected()(makeError())).rejects.toThrow("primeira falha");

    vi.spyOn(axios, "post").mockResolvedValue({ data: {} });
    api.defaults.adapter = vi.fn().mockResolvedValue({
      data: {},
      status: 200,
      statusText: "OK",
      headers: {},
      config: {},
    });

    await responseRejected()(makeError());

    expect(axios.post).toHaveBeenCalled();
  });
});
