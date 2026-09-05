import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/session";

function req(cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/session/refresh", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/session/refresh", () => {
  it("responde 401 e limpa cookies quando não há refresh token", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe("");
    expect(res.cookies.get(REFRESH_COOKIE)?.value).toBe("");
  });

  it("responde 401 e limpa cookies quando a API rejeita a rotação", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const res = await POST(req(`${REFRESH_COOKIE}=old-token`));
    expect(res.status).toBe(401);
    expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe("");
  });

  it("responde 204 e regrava os dois cookies quando a rotação funciona", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "new-at", refresh_token: "new-rt" }),
      })
    );
    const res = await POST(req(`${REFRESH_COOKIE}=old-token`));
    expect(res.status).toBe(204);
    expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe("new-at");
    expect(res.cookies.get(REFRESH_COOKIE)?.value).toBe("new-rt");
  });
});
