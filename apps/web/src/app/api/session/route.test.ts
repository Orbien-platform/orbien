import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "./route";
import { ACCESS_COOKIE, IDENTITY_COOKIE, REFRESH_COOKIE } from "@/lib/session";
import type { JwtPayload } from "@/lib/auth";

function makeToken(payload: Partial<JwtPayload>): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

function req(opts: {
  method?: string;
  cookie?: string;
  body?: unknown;
}): NextRequest {
  return new NextRequest("http://localhost/api/session", {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.body ? { "content-type": "application/json" } : {}),
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/session", () => {
  it("responde 401 com user null quando não há cookie nenhum", async () => {
    const res = await GET(req({}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ user: null });
    // Sem cookie para limpar, o Set-Cookie não deve aparecer.
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("responde 401 e limpa cookies quando o access token é ilegível", async () => {
    const res = await GET(req({ cookie: `${ACCESS_COOKIE}=garbage` }));
    expect(res.status).toBe(401);
    expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe("");
  });

  it("responde 401 e limpa cookies quando só a identidade existe (sem access)", async () => {
    const identity = encodeURIComponent(JSON.stringify({ email: "a@b.com" }));
    const res = await GET(req({ cookie: `${IDENTITY_COOKIE}=${identity}` }));
    expect(res.status).toBe(401);
    expect(res.cookies.get(IDENTITY_COOKIE)?.value).toBe("");
  });

  it("devolve o usuário da sessão quando identidade e access são válidos", async () => {
    const token = makeToken({
      sub: "u1",
      tenant_id: "t1",
      congregation_id: "c1",
      roles: ["tenant_admin"],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const identity = encodeURIComponent(JSON.stringify({ email: "ana@igreja.com" }));
    const res = await GET(
      req({ cookie: `${ACCESS_COOKIE}=${token}; ${IDENTITY_COOKIE}=${identity}` })
    );
    expect(res.status).toBe(200);
    const { user } = await res.json();
    expect(user).toMatchObject({ id: "u1", email: "ana@igreja.com", roles: ["tenant_admin"] });
  });
});

describe("POST /api/session (login)", () => {
  it("repassa status e corpo quando a API rejeita o login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: "TENANT_NOT_FOUND" }),
      })
    );
    const res = await POST(req({ method: "POST", body: { email: "a@b.com" } }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "TENANT_NOT_FOUND" });
  });

  it("repassa o status com corpo vazio quando o erro da API não vem em JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("not json");
        },
      })
    );
    const res = await POST(req({ method: "POST", body: { email: "a@b.com" } }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({});
  });

  it("responde 502 quando a resposta de login não decodifica", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "garbage", refresh_token: "r" }),
      })
    );
    const res = await POST(req({ method: "POST", body: { email: "a@b.com" } }));
    expect(res.status).toBe(502);
  });

  it("responde 502 quando o corpo não trouxe email", async () => {
    const token = makeToken({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: token, refresh_token: "r" }),
      })
    );
    const res = await POST(req({ method: "POST", body: {} }));
    expect(res.status).toBe(502);
  });

  it("grava os três cookies de sessão em um login bem-sucedido", async () => {
    const token = makeToken({
      sub: "u1",
      tenant_id: "t1",
      congregation_id: "c1",
      roles: ["tenant_admin"],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: token, refresh_token: "r1" }),
      })
    );
    const res = await POST(
      req({ method: "POST", body: { email: "ana@igreja.com", password: "x", tenant_slug: "doca" } })
    );
    expect(res.status).toBe(200);
    expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe(token);
    expect(res.cookies.get(REFRESH_COOKIE)?.value).toBe("r1");
    expect(res.cookies.get(IDENTITY_COOKIE)).toBeDefined();
    const { user } = await res.json();
    expect(user.email).toBe("ana@igreja.com");
  });
});

describe("DELETE /api/session (logout)", () => {
  it("limpa os cookies mesmo sem refresh token, sem chamar a API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await DELETE(req({ method: "DELETE" }));
    expect(res.status).toBe(204);
    expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revoga o refresh token na API e limpa os cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const res = await DELETE(req({ method: "DELETE", cookie: `${REFRESH_COOKIE}=r1` }));
    expect(res.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/logout"),
      expect.objectContaining({ method: "POST" })
    );
    expect(res.cookies.get(REFRESH_COOKIE)?.value).toBe("");
  });

  it("limpa os cookies mesmo quando a chamada de logout falha", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const res = await DELETE(req({ method: "DELETE", cookie: `${REFRESH_COOKIE}=r1` }));
    expect(res.status).toBe(204);
    expect(res.cookies.get(REFRESH_COOKIE)?.value).toBe("");
  });
});
