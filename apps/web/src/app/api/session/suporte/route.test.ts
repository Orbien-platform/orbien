import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "./route";
import { ACCESS_COOKIE, IDENTITY_COOKIE, REFRESH_COOKIE } from "@/lib/session";

function makeToken(payload: Record<string, unknown>): string {
  return `h.${btoa(JSON.stringify(payload))}.s`;
}

function supportPayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: "user-1",
    tenant_id: "tenant-1",
    congregation_id: "cong-1",
    roles: ["platform_support"],
    plan: "pro",
    iat: 0,
    exp: Math.floor(Date.now() / 1000) + 900,
    support_session: true,
    ...overrides,
  };
}

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/session/suporte", () => {
  it("grava o access token com o prazo do próprio token e a identidade do suporte", async () => {
    const response = await POST(
      makeRequest({
        access_token: makeToken(supportPayload()),
        tenant_name: "Igreja Central",
      })
    );

    expect(response.status).toBe(204);
    const access = response.cookies.get(ACCESS_COOKIE);
    expect(access?.httpOnly).toBe(true);
    // 15 minutos, arredondado para baixo — não os 7 dias do refresh.
    expect(access?.maxAge).toBeGreaterThan(0);
    expect(access?.maxAge).toBeLessThanOrEqual(900);
    expect(response.cookies.get(IDENTITY_COOKIE)?.value).toBe(
      encodeURIComponent(
        JSON.stringify({
          email: "suporte@orbien",
          tenantName: "Igreja Central",
        })
      )
    );
  });

  it("sem tenant_name a identidade fica só com o e-mail do operador", async () => {
    const response = await POST(
      makeRequest({ access_token: makeToken(supportPayload()) })
    );

    expect(response.status).toBe(204);
    expect(response.cookies.get(IDENTITY_COOKIE)?.value).toBe(
      encodeURIComponent(JSON.stringify({ email: "suporte@orbien" }))
    );
  });

  it("apaga o refresh token de um login anterior na mesma origem", async () => {
    const response = await POST(
      makeRequest({ access_token: makeToken(supportPayload()) })
    );

    // `clearSessionCookies` roda antes de gravar: o refresh sai com valor
    // vazio, senão renovaria a sessão de suporte como o usuário anterior.
    expect(response.cookies.get(REFRESH_COOKIE)?.value).toBe("");
  });

  it("corpo sem token vira 400", async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "token_ilegivel" });
  });

  it("token ilegível vira 400", async () => {
    const response = await POST(makeRequest({ access_token: "nao-e-jwt" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "token_ilegivel" });
  });

  it("token vencido vira 400", async () => {
    const response = await POST(
      makeRequest({
        access_token: makeToken(
          supportPayload({ exp: Math.floor(Date.now() / 1000) - 1 })
        ),
      })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "token_expirado" });
  });

  it("token de sessão normal é recusado — só entra token de impersonação", async () => {
    const response = await POST(
      makeRequest({
        access_token: makeToken(supportPayload({ support_session: undefined })),
      })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "token_nao_e_de_suporte",
    });
    expect(response.cookies.get(ACCESS_COOKIE)).toBeUndefined();
  });
});
