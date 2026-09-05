import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "./route";
import { ACCESS_COOKIE, IDENTITY_COOKIE, REFRESH_COOKIE } from "@/lib/session";
import type { JwtPayload } from "@/lib/auth";

function makeToken(payload: Partial<JwtPayload & { support_session?: boolean }>): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

function req(body: unknown, cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/session/suporte", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/session/suporte", () => {
  it("responde 400 quando falta access_token ou ele é ilegível", async () => {
    const res1 = await POST(req({}));
    expect(res1.status).toBe(400);
    expect((await res1.json()).message).toBe("token_ilegivel");

    const res2 = await POST(req({ access_token: "garbage" }));
    expect(res2.status).toBe(400);
  });

  it("responde 400 quando o token já expirou", async () => {
    const token = makeToken({
      support_session: true,
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const res = await POST(req({ access_token: token }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("token_expirado");
  });

  it("responde 400 quando o token não é de sessão de suporte", async () => {
    const token = makeToken({
      support_session: false,
      exp: Math.floor(Date.now() / 1000) + 900,
    });
    const res = await POST(req({ access_token: token }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("token_nao_e_de_suporte");
  });

  it("grava o cookie de acesso e a identidade de suporte, apagando sessão anterior", async () => {
    const token = makeToken({
      support_session: true,
      exp: Math.floor(Date.now() / 1000) + 900,
    });
    const res = await POST(
      req(
        { access_token: token, tenant_name: "Doca Church" },
        `${ACCESS_COOKIE}=old-at; ${REFRESH_COOKIE}=old-rt`
      )
    );
    expect(res.status).toBe(204);
    expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe(token);
    // A sessão de suporte não emite refresh — o cookie anterior é apagado.
    expect(res.cookies.get(REFRESH_COOKIE)?.value).toBe("");
    const identity = JSON.parse(
      decodeURIComponent(res.cookies.get(IDENTITY_COOKIE)!.value)
    );
    expect(identity).toEqual({ email: "suporte@orbien", tenantName: "Doca Church" });
  });

  it("grava identidade sem tenantName quando tenant_name não veio", async () => {
    const token = makeToken({
      support_session: true,
      exp: Math.floor(Date.now() / 1000) + 900,
    });
    const res = await POST(req({ access_token: token }));
    expect(res.status).toBe(204);
    const identity = JSON.parse(
      decodeURIComponent(res.cookies.get(IDENTITY_COOKIE)!.value)
    );
    expect(identity).toEqual({ email: "suporte@orbien" });
  });
});
