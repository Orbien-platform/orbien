import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function makeRequest(temSessao: boolean, pathname: string): NextRequest {
  return {
    cookies: { has: () => temSessao },
    nextUrl: { pathname },
    url: `http://localhost${pathname}`,
    headers: new Headers({ host: "localhost" }),
  } as unknown as NextRequest;
}

describe("proxy", () => {
  it("redireciona para /login preservando o destino quando não há sessão", async () => {
    const response = await proxy(makeRequest(false, "/dashboard"));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("from")).toBe("/dashboard");
  });

  it("deixa passar quando há cookie de sessão", async () => {
    const response = await proxy(makeRequest(true, "/pessoas"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("não exige sessão em / (pública, mesmo estando no matcher pelo rewrite de domínio)", async () => {
    const response = await proxy(makeRequest(false, "/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("não exige sessão em /celulas", async () => {
    const response = await proxy(makeRequest(false, "/celulas"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("proxy — domínio próprio", () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  function requestFromHost(host: string, pathname: string): NextRequest {
    return {
      cookies: { has: () => false },
      nextUrl: {
        pathname,
        clone: () => new URL(pathname, `https://${host}`),
      },
      url: `https://${host}${pathname}`,
      headers: new Headers({ host }),
    } as unknown as NextRequest;
  }

  beforeEach(() => {
    process.env = { ...originalEnv, NEXT_PUBLIC_WEB_HOST: "web.useorbien.com" };
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  it("não chama o backend quando o host é o próprio apps/web", async () => {
    global.fetch = vi.fn();
    await proxy(requestFromHost("web.useorbien.com", "/"));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reescreve / para /doar/{slug} quando o domínio resolve", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tenant_slug: "igreja-modelo" }),
    });
    const response = await proxy(requestFromHost("doar.igreja.com.br", "/"));
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/public/domains/resolve?host=doar.igreja.com.br"),
    );
    expect(response.headers.get("x-middleware-rewrite")).toContain("/doar/igreja-modelo");
  });

  it("deixa cair no roteamento normal quando o domínio não resolve", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    const response = await proxy(requestFromHost("nao-cadastrado.com", "/"));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("deixa cair no roteamento normal quando o backend está fora do ar", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const response = await proxy(requestFromHost("doar.igreja.com.br", "/"));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("não tenta resolver caminho fora do mapa", async () => {
    global.fetch = vi.fn();
    await proxy(requestFromHost("doar.igreja.com.br", "/dashboard"));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
