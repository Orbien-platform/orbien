import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACCESS_COOKIE,
  buildSessionUser,
  clearSessionCookies,
  IDENTITY_COOKIE,
  readIdentity,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
  rotate,
  setAccessCookie,
  setIdentityCookie,
  setRefreshCookie,
  type Identity,
} from "./session";
import type { JwtPayload } from "./auth";

function makeJar() {
  return { set: vi.fn(), delete: vi.fn() };
}

describe("cookies de sessão", () => {
  it("setAccessCookie grava com o maxAge do chamador", () => {
    const jar = makeJar();
    setAccessCookie(jar, "token", 123);
    expect(jar.set).toHaveBeenCalledWith(
      ACCESS_COOKIE,
      "token",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 123 })
    );
  });

  it("setRefreshCookie grava com o prazo de 7 dias", () => {
    const jar = makeJar();
    setRefreshCookie(jar, "refresh");
    expect(jar.set).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      "refresh",
      expect.objectContaining({ maxAge: REFRESH_MAX_AGE })
    );
  });

  it("setIdentityCookie grava a identidade serializada", () => {
    const jar = makeJar();
    const identity: Identity = { email: "a@b.com", tenantName: "Igreja X" };
    setIdentityCookie(jar, identity);
    expect(jar.set).toHaveBeenCalledWith(
      IDENTITY_COOKIE,
      encodeURIComponent(JSON.stringify(identity)),
      expect.objectContaining({ maxAge: REFRESH_MAX_AGE })
    );
  });

  it("clearSessionCookies apaga os três cookies", () => {
    const jar = makeJar();
    clearSessionCookies(jar);
    expect(jar.delete).toHaveBeenCalledWith(ACCESS_COOKIE);
    expect(jar.delete).toHaveBeenCalledWith(REFRESH_COOKIE);
    expect(jar.delete).toHaveBeenCalledWith(IDENTITY_COOKIE);
  });
});

describe("readIdentity", () => {
  it("decodifica um cookie válido", () => {
    const raw = encodeURIComponent(JSON.stringify({ email: "a@b.com" }));
    expect(readIdentity(raw)).toEqual({ email: "a@b.com" });
  });

  it("retorna null quando não há cookie", () => {
    expect(readIdentity(undefined)).toBeNull();
  });

  it("retorna null para conteúdo malformado", () => {
    expect(readIdentity("%")).toBeNull();
  });
});

describe("buildSessionUser", () => {
  const payload: JwtPayload = {
    sub: "u1",
    tenant_id: "t1",
    congregation_id: "c1",
    roles: ["tenant_admin"],
    plan: "pro",
    iat: 0,
    exp: 9999999999,
  };

  it("monta o nome a partir do prefixo do e-mail e marca support_session true", () => {
    const user = buildSessionUser(
      { ...payload, support_session: true },
      { email: "joao.silva@example.com", tenantName: "Igreja X" }
    );
    expect(user).toEqual({
      id: "u1",
      name: "joao silva",
      email: "joao.silva@example.com",
      roles: ["tenant_admin"],
      tenant_id: "t1",
      congregation_id: "c1",
      support_session: true,
      support_tenant_name: "Igreja X",
    });
  });

  it("support_session fica false sem o marcador no payload, e support_tenant_name null sem tenantName", () => {
    const user = buildSessionUser(payload, { email: "ana@example.com" });
    expect(user.support_session).toBe(false);
    expect(user.support_tenant_name).toBeNull();
  });
});

describe("rotate", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("devolve o par de tokens quando a API responde ok", async () => {
    const tokens = { access_token: "a", refresh_token: "r", expires_in: 900 };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(tokens),
    }) as unknown as typeof fetch;

    await expect(rotate("refresh-token")).resolves.toEqual(tokens);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ refresh_token: "refresh-token" }),
      })
    );
  });

  it("devolve null quando a API recusa", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    await expect(rotate("refresh-token")).resolves.toBeNull();
  });
});
