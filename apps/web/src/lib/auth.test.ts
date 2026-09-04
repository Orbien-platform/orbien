import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTokens,
  decodeJwtPayload,
  getAccessToken,
  getRefreshToken,
  getSupportTenantName,
  getUserEmail,
  isSupportSession,
  isTokenExpired,
  saveTokens,
  type JwtPayload,
} from "./auth";

function makeToken(payload: Partial<JwtPayload>): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe("saveTokens / getters / clearTokens", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = "auth_session=; path=/; max-age=0";
  });

  it("grava tokens e o cookie de sessão para o proxy", () => {
    saveTokens("access", "refresh", "user@example.com");

    expect(getAccessToken()).toBe("access");
    expect(getRefreshToken()).toBe("refresh");
    expect(getUserEmail()).toBe("user@example.com");
    expect(document.cookie).toContain("auth_session=1");
  });

  it("não grava o email quando ele não é informado", () => {
    saveTokens("access", "refresh");

    expect(getUserEmail()).toBeNull();
  });

  it("limpa tokens, marcadores de suporte e o cookie", () => {
    saveTokens("access", "refresh", "user@example.com");
    localStorage.setItem("support_session", "1");
    localStorage.setItem("support_session_tenant", "Igreja X");

    clearTokens();

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(getUserEmail()).toBeNull();
    expect(localStorage.getItem("support_session")).toBeNull();
    expect(localStorage.getItem("support_session_tenant")).toBeNull();
    expect(document.cookie).not.toContain("auth_session=1");
  });

  it("getAccessToken/getRefreshToken/getUserEmail retornam null quando nada foi salvo", () => {
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(getUserEmail()).toBeNull();
  });
});

describe("decodeJwtPayload", () => {
  it("decodifica um payload válido", () => {
    const token = makeToken({ sub: "u1", roles: ["tenant_admin"] } as JwtPayload);
    expect(decodeJwtPayload(token)?.sub).toBe("u1");
  });

  it("retorna null para token malformado", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("")).toBeNull();
  });
});

describe("isTokenExpired", () => {
  it("é true quando o payload não decodifica", () => {
    expect(isTokenExpired("garbage")).toBe(true);
  });

  it("é true para exp no passado e false para exp no futuro", () => {
    const past = makeToken({ exp: Math.floor(Date.now() / 1000) - 60 } as JwtPayload);
    const future = makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 } as JwtPayload);

    expect(isTokenExpired(past)).toBe(true);
    expect(isTokenExpired(future)).toBe(false);
  });
});

describe("isSupportSession / getSupportTenantName", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("é false sem o marcador em localStorage", () => {
    expect(isSupportSession()).toBe(false);
  });

  it("é false quando o marcador existe mas o token não confirma", () => {
    localStorage.setItem("support_session", "1");
    saveTokens(makeToken({ support_session: false } as JwtPayload), "refresh");

    expect(isSupportSession()).toBe(false);
  });

  it("é false quando o marcador existe mas não há token", () => {
    localStorage.setItem("support_session", "1");

    expect(isSupportSession()).toBe(false);
  });

  it("é true quando o marcador e o token concordam", () => {
    localStorage.setItem("support_session", "1");
    saveTokens(makeToken({ support_session: true } as JwtPayload), "refresh");

    expect(isSupportSession()).toBe(true);
  });

  it("expõe o nome do tenant de suporte salvo", () => {
    expect(getSupportTenantName()).toBeNull();
    localStorage.setItem("support_session_tenant", "Igreja X");
    expect(getSupportTenantName()).toBe("Igreja X");
  });
});

describe("no servidor (sem window)", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.window = originalWindow;
  });

  it("todas as funções guardadas por window são no-op/null", () => {
    // @ts-expect-error simula ambiente de servidor
    delete globalThis.window;

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(getUserEmail()).toBeNull();
    expect(getSupportTenantName()).toBeNull();
    expect(isSupportSession()).toBe(false);
    expect(() => saveTokens("a", "b")).not.toThrow();
    expect(() => clearTokens()).not.toThrow();
  });
});
