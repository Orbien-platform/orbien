import { afterEach, describe, expect, it } from "vitest";
import { CLIENT_IP_HEADER, PROXY_AUTH_HEADER, clientIpHeaders } from "./client-ip";

const req = (headers: Record<string, string>) =>
  new Request("https://web.test/x", { headers });

describe("clientIpHeaders", () => {
  const original = process.env.ORBIEN_PROXY_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.ORBIEN_PROXY_SECRET;
    else process.env.ORBIEN_PROXY_SECRET = original;
  });

  it("sem ORBIEN_PROXY_SECRET não envia nada (comportamento de antes)", () => {
    delete process.env.ORBIEN_PROXY_SECRET;
    expect(clientIpHeaders(req({ "x-real-ip": "203.0.113.9" }))).toEqual({});
  });

  it("com segredo: manda o IP e o segredo, preferindo x-real-ip", () => {
    process.env.ORBIEN_PROXY_SECRET = "s3cret";
    expect(
      clientIpHeaders(req({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" }))
    ).toEqual({ [PROXY_AUTH_HEADER]: "s3cret", [CLIENT_IP_HEADER]: "203.0.113.9" });
  });

  it("sem x-real-ip usa o primeiro item de x-forwarded-for", () => {
    process.env.ORBIEN_PROXY_SECRET = "s3cret";
    expect(clientIpHeaders(req({ "x-forwarded-for": "198.51.100.1, 10.0.0.2" }))).toEqual({
      [PROXY_AUTH_HEADER]: "s3cret",
      [CLIENT_IP_HEADER]: "198.51.100.1",
    });
  });

  it("sem IP na requisição não envia nada", () => {
    process.env.ORBIEN_PROXY_SECRET = "s3cret";
    expect(clientIpHeaders(req({}))).toEqual({});
  });
});
