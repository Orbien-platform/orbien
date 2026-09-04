import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  getAccessToken: vi.fn(),
  getRefreshToken: vi.fn(),
  saveTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import api from "./api";
import axios from "axios";
import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from "./auth";

type FakeAxiosError = AxiosError & { config: InternalAxiosRequestConfig & { _retry?: boolean } };

interface InterceptorManager<T> {
  handlers: Array<{ fulfilled?: T; rejected?: T } | null> | undefined;
}

// `handlers` não é tipado como público pela declaração do axios, mas é como
// o próprio axios registra e percorre os interceptors — é o jeito padrão de
// testar um interceptor sem montar um servidor HTTP de verdade.
function requestFulfilled(instance: AxiosInstance = api) {
  const manager = instance.interceptors.request as unknown as InterceptorManager<
    (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig
  >;
  return manager.handlers![0]!.fulfilled!;
}

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

describe("interceptor de requisição", () => {
  beforeEach(() => {
    vi.mocked(getAccessToken).mockReturnValue(null);
  });

  it("adiciona o Authorization quando há token", () => {
    vi.mocked(getAccessToken).mockReturnValue("abc123");

    const config = requestFulfilled()({ headers: {} } as InternalAxiosRequestConfig);

    expect((config.headers as Record<string, string>).Authorization).toBe("Bearer abc123");
  });

  it("não adiciona Authorization quando não há token", () => {
    const config = requestFulfilled()({ headers: {} } as InternalAxiosRequestConfig);

    expect((config.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

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

  it("repassa quando a própria chamada de login falhou", async () => {
    const error = makeError({ url: "/auth/login" });

    await expect(responseRejected()(error)).rejects.toBe(error);
  });
});

describe("interceptor de resposta — refresh de token", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.mocked(getAccessToken).mockReturnValue("expired-token");
    vi.mocked(getRefreshToken).mockReturnValue("refresh-token");
    vi.mocked(saveTokens).mockClear();
    vi.mocked(clearTokens).mockClear();
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

  it("com refresh bem-sucedido: salva os novos tokens e refaz a chamada original", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({
      data: { access_token: "new-access", refresh_token: "new-refresh" },
    });
    api.defaults.adapter = vi.fn().mockResolvedValue({
      data: { ok: true },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {},
    });

    const error = makeError();
    const result = (await responseRejected()(error)) as { data: unknown; status: number };

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh"),
      { refresh_token: "refresh-token" }
    );
    expect(saveTokens).toHaveBeenCalledWith("new-access", "new-refresh");
    expect((error.config.headers as Record<string, string>).Authorization).toBe("Bearer new-access");
    expect(result.data).toEqual({ ok: true });
    expect(result.status).toBe(200);
  });

  it("quando o refresh falha: limpa tudo, manda para /login e propaga o erro do refresh", async () => {
    const refreshError = new Error("refresh_failed");
    vi.spyOn(axios, "post").mockRejectedValue(refreshError);

    const error = makeError();

    await expect(responseRejected()(error)).rejects.toBe(refreshError);

    expect(clearTokens).toHaveBeenCalled();
    expect(window.location.href).toBe("/login");
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

    resolveRefresh({ data: { access_token: "new-access", refresh_token: "new-refresh" } });

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

  it("sem window: não tenta redirecionar quando o refresh falha", async () => {
    const originalWindow = globalThis.window;
    vi.spyOn(axios, "post").mockRejectedValue(new Error("refresh_failed"));
    // @ts-expect-error simula ambiente sem window (SSR)
    delete globalThis.window;

    try {
      await expect(responseRejected()(makeError())).rejects.toThrow("refresh_failed");
      expect(clearTokens).toHaveBeenCalled();
    } finally {
      globalThis.window = originalWindow;
    }
  });

  // O caminho "sem refresh token" retorna antes do try/finally que zera
  // `isRefreshing`, então o módulo fica com isRefreshing=true para sempre
  // depois dele — por isso os dois casos abaixo reimportam o módulo do zero
  // (vi.resetModules) em vez de reusar o `api` do topo do arquivo. Ver nota
  // no relatório da Fase 7.
  it("sem refresh token: limpa tudo e manda para /login", async () => {
    vi.resetModules();
    const auth = await import("./auth");
    vi.mocked(auth.getRefreshToken).mockReturnValue(null);
    const freshApi = (await import("./api")).default;
    const error = makeError();

    await expect(responseRejected(freshApi)(error)).rejects.toBe(error);

    expect(auth.clearTokens).toHaveBeenCalled();
    expect(window.location.href).toBe("/login");
  });

  it("sem refresh token e sem window: não tenta redirecionar", async () => {
    vi.resetModules();
    const auth = await import("./auth");
    vi.mocked(auth.getRefreshToken).mockReturnValue(null);
    const freshApi = (await import("./api")).default;
    const originalWindow = globalThis.window;
    // @ts-expect-error simula ambiente sem window (SSR)
    delete globalThis.window;

    try {
      const error = makeError();
      await expect(responseRejected(freshApi)(error)).rejects.toBe(error);
      expect(auth.clearTokens).toHaveBeenCalled();
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
