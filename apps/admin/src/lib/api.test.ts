import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from "axios";
import axios from "axios";
import type { default as ApiPadrao } from "./api";
import { clearTokens, getAccessToken, saveTokens } from "./auth";

/**
 * `isRefreshing` e `failedQueue` são estado de módulo. Cada teste recebe uma
 * instância nova para não herdar a fila do anterior — ver o `it` sobre o
 * 401 sem refresh token, que deixa `isRefreshing` preso em `true`.
 */
let api: typeof ApiPadrao;

type ErroDeTeste = AxiosError & {
  config: InternalAxiosRequestConfig & { _retry?: boolean };
};

interface GerenciadorDeInterceptors<T> {
  handlers: Array<{ fulfilled?: T; rejected?: T } | null> | undefined;
}

// `handlers` não é público na tipagem do axios, mas é onde ele registra os
// interceptors — é o jeito de exercitá-los sem subir servidor.
function aoRequisitar(instancia: AxiosInstance) {
  const manager = instancia.interceptors
    .request as unknown as GerenciadorDeInterceptors<
    (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig
  >;
  return manager.handlers![0]!.fulfilled!;
}

function aoFalhar(instancia: AxiosInstance) {
  const manager = instancia.interceptors
    .response as unknown as GerenciadorDeInterceptors<
    (error: ErroDeTeste) => Promise<unknown>
  >;
  return manager.handlers![0]!.rejected!;
}

function erro(overrides: Record<string, unknown> = {}): ErroDeTeste {
  return {
    response: { status: 401 },
    config: { headers: {} as Record<string, string>, ...overrides },
  } as unknown as ErroDeTeste;
}

/** Adapter que responde 200 sem rede, para o retry da requisição original. */
function adapterQueResponde() {
  api.defaults.adapter = vi.fn().mockResolvedValue({
    data: { ok: true },
    status: 200,
    statusText: "OK",
    headers: {},
    config: {},
  });
}

const locationOriginal = window.location;

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  api = (await import("./api")).default;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...locationOriginal, href: "" },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: locationOriginal,
  });
  vi.restoreAllMocks();
  api.defaults.adapter = undefined;
});

describe("interceptor de requisição", () => {
  it("anexa o access token quando há sessão", () => {
    saveTokens("at-1", "rt-1", "suporte@orbien.app");

    const config = aoRequisitar(api)({
      headers: {},
    } as unknown as InternalAxiosRequestConfig);

    expect(config.headers.Authorization).toBe("Bearer at-1");
  });

  it("sem sessão não inventa cabeçalho", () => {
    clearTokens();

    const config = aoRequisitar(api)({
      headers: {},
    } as unknown as InternalAxiosRequestConfig);

    expect(config.headers.Authorization).toBeUndefined();
  });
});

describe("interceptor de resposta — o que passa direto", () => {
  it("erro que não é 401 sobe intacto", async () => {
    const original = erro({ headers: {} });
    (original.response as { status: number }).status = 500;

    await expect(aoFalhar(api)(original)).rejects.toBe(original);
  });

  it("401 num retry não tenta renovar de novo", async () => {
    const original = erro({ _retry: true });

    await expect(aoFalhar(api)(original)).rejects.toBe(original);
  });

  it("401 do login da plataforma sobe intacto — senão a tela perde a mensagem", async () => {
    // A rota de login deste console é `/auth/platform/login`. Se ela entrasse
    // no ramo de refresh, o `location.href = "/login"` recarregaria a página
    // e apagaria o erro que a tela acabou de mostrar.
    saveTokens("at-1", "rt-1", "suporte@orbien.app");
    const original = erro({ url: "/auth/platform/login" });

    await expect(aoFalhar(api)(original)).rejects.toBe(original);
    expect(window.location.href).toBe("");
    expect(getAccessToken()).toBe("at-1");
  });

  it("401 de /auth/login e de logout também ficam fora do refresh", async () => {
    await expect(aoFalhar(api)(erro({ url: "/auth/login" }))).rejects.toBeDefined();
    expect(window.location.href).toBe("");
  });
});

describe("interceptor de resposta — renovação", () => {
  it("renova, regrava os tokens e refaz a requisição original", async () => {
    saveTokens("at-velho", "rt-1", "suporte@orbien.app");
    vi.spyOn(axios, "post").mockResolvedValue({
      data: { access_token: "at-novo", refresh_token: "rt-2" },
    });
    adapterQueResponde();

    const original = erro();
    const resultado = (await aoFalhar(api)(original)) as { data: unknown };

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh"),
      { refresh_token: "rt-1" }
    );
    expect(getAccessToken()).toBe("at-novo");
    expect(original.config.headers.Authorization).toBe("Bearer at-novo");
    expect(resultado.data).toEqual({ ok: true });
  });

  it("sem refresh token limpa a sessão e vai para o login", async () => {
    localStorage.setItem("access_token", "at-1");
    const original = erro();

    await expect(aoFalhar(api)(original)).rejects.toBe(original);

    expect(getAccessToken()).toBeNull();
    expect(window.location.href).toBe("/login");
  });

  it("depois de um 401 sem refresh token, o próximo 401 fica preso na fila", async () => {
    // ACHADO, registrado sem correção: o retorno antecipado do ramo "sem
    // refresh token" acontece ANTES do `try`, então o `finally` que zera
    // `isRefreshing` não roda. A partir daí todo 401 entra na fila e espera
    // por uma renovação que ninguém vai disparar. O `apps/web` tinha o mesmo
    // defeito e o corrigiu (commit 88bf9ee); este arquivo veio de lá antes
    // disso. O teste fixa o comportamento atual para que a correção seja uma
    // mudança visível.
    localStorage.setItem("access_token", "at-1");
    await expect(aoFalhar(api)(erro())).rejects.toBeDefined();

    saveTokens("at-1", "rt-1", "suporte@orbien.app");
    const post = vi.spyOn(axios, "post");

    let resolvida = false;
    void aoFalhar(api)(erro()).then(() => (resolvida = true));
    await Promise.resolve();

    expect(post).not.toHaveBeenCalled();
    expect(resolvida).toBe(false);
  });

  it("sem window (SSR) não tenta navegar", async () => {
    // O caminho "sem refresh token" não chama a API, então dá para exercitá-lo
    // com `window` ausente sem passar pelo axios, que precisa dele.
    localStorage.setItem("access_token", "at-1");
    const original = erro();
    const janela = globalThis.window;
    // @ts-expect-error simula ambiente sem window
    delete globalThis.window;

    try {
      await expect(aoFalhar(api)(original)).rejects.toBe(original);
    } finally {
      globalThis.window = janela;
    }
  });

  it("refresh recusado limpa a sessão e propaga o erro do refresh", async () => {
    saveTokens("at-1", "rt-1", "suporte@orbien.app");
    const falha = new Error("refresh_failed");
    vi.spyOn(axios, "post").mockRejectedValue(falha);

    await expect(aoFalhar(api)(erro())).rejects.toBe(falha);

    expect(getAccessToken()).toBeNull();
    expect(window.location.href).toBe("/login");
  });

  it("enfileira os 401 concorrentes e renova uma vez só", async () => {
    saveTokens("at-1", "rt-1", "suporte@orbien.app");
    let liberar!: (v: unknown) => void;
    vi.spyOn(axios, "post").mockReturnValue(
      new Promise((resolve) => (liberar = resolve))
    );
    adapterQueResponde();

    const primeira = aoFalhar(api)(erro());
    const segunda = aoFalhar(api)(erro());

    liberar({ data: { access_token: "at-novo", refresh_token: "rt-2" } });

    await expect(primeira).resolves.toBeDefined();
    await expect(segunda).resolves.toBeDefined();
    // A fila é o que evita duas rotações concorrentes — a API revoga a
    // família inteira ao ver refresh token reusado.
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it("a falha do refresh em andamento derruba quem estava na fila", async () => {
    saveTokens("at-1", "rt-1", "suporte@orbien.app");
    let rejeitar!: (e: unknown) => void;
    vi.spyOn(axios, "post").mockReturnValue(
      new Promise((_, reject) => (rejeitar = reject))
    );

    const primeira = aoFalhar(api)(erro());
    const segunda = aoFalhar(api)(erro());

    const falha = new Error("refresh_failed");
    rejeitar(falha);

    await expect(primeira).rejects.toBe(falha);
    await expect(segunda).rejects.toBe(falha);
  });

  it("depois de um refresh malsucedido o próximo 401 tenta de novo", async () => {
    saveTokens("at-1", "rt-1", "suporte@orbien.app");
    vi.spyOn(axios, "post").mockRejectedValueOnce(new Error("primeira falha"));

    await expect(aoFalhar(api)(erro())).rejects.toThrow("primeira falha");

    saveTokens("at-1", "rt-1", "suporte@orbien.app");
    vi.spyOn(axios, "post").mockResolvedValue({
      data: { access_token: "at-novo", refresh_token: "rt-2" },
    });
    adapterQueResponde();

    await expect(aoFalhar(api)(erro())).resolves.toBeDefined();
  });
});
