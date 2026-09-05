import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTokens,
  decodeJwtPayload,
  getAccessToken,
  getRefreshToken,
  getUserEmail,
  hasPlatformRole,
  isTokenExpired,
  PLATFORM_ROLE,
  saveTokens,
} from "./auth";

function makeToken(payload: Record<string, unknown>): string {
  return `h.${btoa(JSON.stringify(payload))}.s`;
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    sub: "u-1",
    tenant_id: "t-1",
    congregation_id: "c-1",
    roles: [PLATFORM_ROLE],
    plan: "pro",
    iat: 0,
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  // jsdom mantém os cookies entre testes.
  document.cookie = "auth_session=; path=/; max-age=0";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("saveTokens", () => {
  it("guarda os dois tokens e marca a sessão no cookie do proxy", () => {
    saveTokens("at-1", "rt-1", "suporte@orbien.app");

    expect(getAccessToken()).toBe("at-1");
    expect(getRefreshToken()).toBe("rt-1");
    expect(getUserEmail()).toBe("suporte@orbien.app");
    // O cookie é marcador, não credencial — ver `src/proxy.ts`.
    expect(document.cookie).toContain("auth_session=1");
  });

  it("sem e-mail não grava a chave de e-mail", () => {
    saveTokens("at-1", "rt-1");

    expect(getAccessToken()).toBe("at-1");
    expect(getUserEmail()).toBeNull();
  });
});

describe("clearTokens", () => {
  it("apaga os três valores e o cookie", () => {
    saveTokens("at-1", "rt-1", "suporte@orbien.app");

    clearTokens();

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(getUserEmail()).toBeNull();
    expect(document.cookie).not.toContain("auth_session=1");
  });
});

describe("sem window (SSR)", () => {
  // As cinco funções guardam `typeof window === "undefined"` porque o módulo
  // é importado por componentes que também renderizam no servidor.
  it("as leituras devolvem null e as escritas não fazem nada", () => {
    const janela = globalThis.window;
    // @ts-expect-error simula ambiente sem window
    delete globalThis.window;

    try {
      expect(getAccessToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
      expect(getUserEmail()).toBeNull();
      expect(() => saveTokens("at", "rt", "e@x")).not.toThrow();
      expect(() => clearTokens()).not.toThrow();
    } finally {
      globalThis.window = janela;
    }

    // Nada foi gravado enquanto `window` não existia.
    expect(localStorage.getItem("access_token")).toBeNull();
  });
});

describe("decodeJwtPayload", () => {
  it("lê o payload de um token bem formado", () => {
    expect(decodeJwtPayload(makeToken(payload()))).toMatchObject({
      sub: "u-1",
      roles: [PLATFORM_ROLE],
    });
  });

  it("devolve null para token ilegível", () => {
    expect(decodeJwtPayload("nao-e-jwt")).toBeNull();
    expect(decodeJwtPayload("")).toBeNull();
    expect(decodeJwtPayload("a.nao-e-base64-valido!.c")).toBeNull();
  });
});

describe("isTokenExpired", () => {
  it("compara o `exp` com o relógio", () => {
    expect(isTokenExpired(makeToken(payload()))).toBe(false);
    expect(
      isTokenExpired(makeToken(payload({ exp: Math.floor(Date.now() / 1000) - 1 })))
    ).toBe(true);
  });

  it("token ilegível conta como expirado", () => {
    expect(isTokenExpired("nao-e-jwt")).toBe(true);
  });
});

describe("hasPlatformRole", () => {
  it("só reconhece quem tem platform_support no token", () => {
    expect(hasPlatformRole(makeToken(payload()))).toBe(true);
    expect(
      hasPlatformRole(makeToken(payload({ roles: ["tenant_admin"] })))
    ).toBe(false);
  });

  it("token ilegível não passa", () => {
    expect(hasPlatformRole("nao-e-jwt")).toBe(false);
  });
});
