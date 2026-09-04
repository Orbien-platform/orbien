import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { DELETE, GET, POST } from "./route";
import {
  ACCESS_COOKIE,
  IDENTITY_COOKIE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
} from "@/lib/session";

/** Token com payload legível — assinatura não importa: ninguém valida aqui. */
function makeToken(payload: Record<string, unknown>): string {
  return `h.${btoa(JSON.stringify(payload))}.s`;
}

const payload = {
  sub: "user-1",
  tenant_id: "tenant-1",
  congregation_id: "cong-1",
  roles: ["tenant_admin"],
  plan: "pro",
  iat: 0,
  exp: 9999999999,
};

/** NextRequest o suficiente para o handler: cookies e corpo. */
function makeRequest(
  cookies: Record<string, string>,
  body?: unknown
): NextRequest {
  return {
    cookies: {
      get: (name: string) =>
        name in cookies ? { name, value: cookies[name] } : undefined,
    },
    json: async () => body,
  } as unknown as NextRequest;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("GET /api/session", () => {
  it("devolve o usuário montado a partir do token e da identidade", async () => {
    const response = await GET(
      makeRequest({
        [ACCESS_COOKIE]: makeToken(payload),
        [IDENTITY_COOKIE]: encodeURIComponent(
          JSON.stringify({ email: "ana.silva@igreja.com" })
        ),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: {
        id: "user-1",
        name: "ana silva",
        email: "ana.silva@igreja.com",
        roles: ["tenant_admin"],
        tenant_id: "tenant-1",
        congregation_id: "cong-1",
        support_session: false,
        support_tenant_name: null,
      },
    });
  });

  it("sem cookie nenhum devolve 401 e não manda apagar cookie", async () => {
    const response = await GET(makeRequest({}));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ user: null });
    expect(response.cookies.get(ACCESS_COOKIE)).toBeUndefined();
  });

  it("cookie pela metade (só access) devolve 401 apagando a sessão", async () => {
    const response = await GET(
      makeRequest({ [ACCESS_COOKIE]: makeToken(payload) })
    );
    expect(response.status).toBe(401);
    // `delete` sai como Set-Cookie de valor vazio.
    expect(response.cookies.get(ACCESS_COOKIE)?.value).toBe("");
    expect(response.cookies.get(REFRESH_COOKIE)?.value).toBe("");
    expect(response.cookies.get(IDENTITY_COOKIE)?.value).toBe("");
  });

  it("cookie pela metade (só identidade) também apaga a sessão", async () => {
    const response = await GET(
      makeRequest({
        [IDENTITY_COOKIE]: encodeURIComponent(
          JSON.stringify({ email: "a@b.com" })
        ),
      })
    );
    expect(response.status).toBe(401);
    expect(response.cookies.get(IDENTITY_COOKIE)?.value).toBe("");
  });

  it("access token ilegível com identidade presente cai no 401 que apaga", async () => {
    const response = await GET(
      makeRequest({
        [ACCESS_COOKIE]: "nao-e-jwt",
        [IDENTITY_COOKIE]: encodeURIComponent(
          JSON.stringify({ email: "a@b.com" })
        ),
      })
    );
    expect(response.status).toBe(401);
    expect(response.cookies.get(ACCESS_COOKIE)?.value).toBe("");
  });
});

describe("POST /api/session", () => {
  it("grava os três cookies e devolve o usuário", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: makeToken(payload),
        refresh_token: "refresh-1",
        expires_in: 900,
      }),
    });

    const response = await POST(
      makeRequest({}, { email: "ana@igreja.com", password: "x" })
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/login"),
      expect.objectContaining({ method: "POST" })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: expect.objectContaining({ email: "ana@igreja.com" }),
    });

    const access = response.cookies.get(ACCESS_COOKIE);
    expect(access?.value).toBe(makeToken(payload));
    expect(access?.maxAge).toBe(REFRESH_MAX_AGE);
    expect(access?.httpOnly).toBe(true);
    expect(response.cookies.get(REFRESH_COOKIE)?.value).toBe("refresh-1");
    expect(response.cookies.get(IDENTITY_COOKIE)?.value).toBe(
      encodeURIComponent(JSON.stringify({ email: "ana@igreja.com" }))
    );
  });

  it("repassa status e corpo do erro da API sem reescrever", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: "TENANT_NOT_FOUND" }),
    });

    const response = await POST(
      makeRequest({}, { email: "ana@igreja.com", tenant_slug: "x" })
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: "TENANT_NOT_FOUND" });
    expect(response.cookies.get(ACCESS_COOKIE)).toBeUndefined();
  });

  it("erro da API sem corpo JSON vira objeto vazio com o status intacto", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("sem corpo");
      },
    });

    const response = await POST(makeRequest({}, { email: "ana@igreja.com" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({});
  });

  it("token ilegível na resposta de login vira 502", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "nao-e-jwt", refresh_token: "r" }),
    });

    const response = await POST(makeRequest({}, { email: "ana@igreja.com" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      message: "Resposta de login inválida.",
    });
  });

  it("login sem e-mail no corpo vira 502 — não há identidade para gravar", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: makeToken(payload),
        refresh_token: "r",
      }),
    });

    const response = await POST(makeRequest({}, {}));
    expect(response.status).toBe(502);
  });
});

describe("DELETE /api/session", () => {
  it("revoga o refresh na API e apaga os cookies", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 });

    const response = await DELETE(makeRequest({ [REFRESH_COOKIE]: "r-1" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/logout"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ refresh_token: "r-1" }),
      })
    );
    expect(response.status).toBe(204);
    expect(response.cookies.get(ACCESS_COOKIE)?.value).toBe("");
    expect(response.cookies.get(REFRESH_COOKIE)?.value).toBe("");
    expect(response.cookies.get(IDENTITY_COOKIE)?.value).toBe("");
  });

  it("API fora do ar não impede apagar o cookie local", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const response = await DELETE(makeRequest({ [REFRESH_COOKIE]: "r-1" }));

    expect(response.status).toBe(204);
    expect(response.cookies.get(REFRESH_COOKIE)?.value).toBe("");
  });

  it("sem refresh token não chama a API", async () => {
    const response = await DELETE(makeRequest({}));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(204);
  });
});
