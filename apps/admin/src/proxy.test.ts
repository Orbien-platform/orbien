import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

function makeRequest(pathname: string, cookies: Record<string, string> = {}) {
  return {
    url: `https://admin.orbien.app${pathname}`,
    nextUrl: { pathname },
    cookies: {
      get: (name: string) =>
        name in cookies ? { name, value: cookies[name] } : undefined,
    },
  } as unknown as NextRequest;
}

describe("proxy do console", () => {
  it("sem o marcador de sessão manda para o login, guardando a origem", () => {
    const resposta = proxy(makeRequest("/tenants"));

    expect(resposta.status).toBe(307);
    const destino = new URL(resposta.headers.get("location")!);
    expect(destino.pathname).toBe("/login");
    expect(destino.searchParams.get("from")).toBe("/tenants");
  });

  it("preserva o caminho profundo na volta", () => {
    const resposta = proxy(makeRequest("/tenants/abc/detalhe"));

    const destino = new URL(resposta.headers.get("location")!);
    expect(destino.searchParams.get("from")).toBe("/tenants/abc/detalhe");
  });

  it("com o marcador deixa passar", () => {
    const resposta = proxy(makeRequest("/tenants", { auth_session: "1" }));

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("location")).toBeNull();
  });

  it("só protege as rotas de plataforma — o login fica de fora do matcher", () => {
    expect(config.matcher).toEqual(["/tenants/:path*", "/waitlist/:path*"]);
    expect(config.matcher.some((m) => m.startsWith("/login"))).toBe(false);
  });
});
