// Testes de decodeJwtPayload (MOB-07, T2 do tasks.md).
import { decodeJwtPayload } from "./jwt";

function makeToken(payload: object): string {
  const base64url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${base64url({ alg: "HS256" })}.${base64url(payload)}.signature`;
}

describe("decodeJwtPayload", () => {
  it("decodifica um token válido e devolve os claims", () => {
    const payload = {
      sub: "user-1",
      tenant_id: "tenant-1",
      congregation_id: "cong-1",
      roles: ["member"],
      exp: 1893456000,
    };

    expect(decodeJwtPayload(makeToken(payload))).toEqual(payload);
  });

  it("devolve null para token com menos de 3 partes", () => {
    expect(decodeJwtPayload("apenas-uma-parte")).toBeNull();
  });

  it("devolve null para payload que não é JSON válido", () => {
    const malformed = `header.${btoa("não-é-json")}.signature`;
    expect(decodeJwtPayload(malformed)).toBeNull();
  });
});
