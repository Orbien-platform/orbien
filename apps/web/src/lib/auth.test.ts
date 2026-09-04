import { describe, expect, it } from "vitest";
import { decodeJwtPayload, isTokenExpired, type JwtPayload } from "./auth";

function makeToken(payload: Partial<JwtPayload>): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

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
