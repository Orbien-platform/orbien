import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "./route";
import {
  ACCESS_COOKIE,
  IDENTITY_COOKIE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
} from "@/lib/session";

function makeRequest(cookies: Record<string, string>): NextRequest {
  return {
    cookies: {
      get: (name: string) =>
        name in cookies ? { name, value: cookies[name] } : undefined,
    },
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

describe("POST /api/session/refresh", () => {
  it("rotaciona e devolve 204 com os cookies novos, sem token no corpo", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "at-2",
        refresh_token: "rt-2",
        expires_in: 900,
      }),
    });

    const response = await POST(makeRequest({ [REFRESH_COOKIE]: "rt-1" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ refresh_token: "rt-1" }),
      })
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    const access = response.cookies.get(ACCESS_COOKIE);
    expect(access?.value).toBe("at-2");
    // O cookie sobrevive ao vencimento do token de propósito — ver `rotate()`.
    expect(access?.maxAge).toBe(REFRESH_MAX_AGE);
    expect(response.cookies.get(REFRESH_COOKIE)?.value).toBe("rt-2");
  });

  it("sem refresh token não chama a API e devolve 401 apagando a sessão", async () => {
    const response = await POST(makeRequest({}));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
    expect(response.cookies.get(ACCESS_COOKIE)?.value).toBe("");
    expect(response.cookies.get(REFRESH_COOKIE)?.value).toBe("");
    expect(response.cookies.get(IDENTITY_COOKIE)?.value).toBe("");
  });

  it("refresh recusado pela API devolve 401 apagando a sessão", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });

    const response = await POST(makeRequest({ [REFRESH_COOKIE]: "rt-usado" }));

    expect(response.status).toBe(401);
    expect(response.cookies.get(REFRESH_COOKIE)?.value).toBe("");
  });
});
