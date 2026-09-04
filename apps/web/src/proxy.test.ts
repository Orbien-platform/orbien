import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { proxy } from "./proxy";

function makeRequest(temSessao: boolean, pathname: string): NextRequest {
  return {
    cookies: { has: () => temSessao },
    nextUrl: { pathname },
    url: `http://localhost${pathname}`,
  } as unknown as NextRequest;
}

describe("proxy", () => {
  it("redireciona para /login preservando o destino quando não há sessão", () => {
    const response = proxy(makeRequest(false, "/dashboard"));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("from")).toBe("/dashboard");
  });

  it("deixa passar quando há cookie de sessão", () => {
    const response = proxy(makeRequest(true, "/pessoas"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
