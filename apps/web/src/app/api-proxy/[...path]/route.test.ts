import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PATCH, POST, PUT } from "./route";
import { ACCESS_COOKIE } from "@/lib/session";

function ctx(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function upstreamResponse(overrides: Partial<{
  status: number;
  body: ReadableStream | null;
  headers: Record<string, string>;
}> = {}) {
  const headerMap = new Map(Object.entries(overrides.headers ?? {}));
  return {
    status: overrides.status ?? 200,
    body: overrides.body ?? null,
    headers: { get: (name: string) => headerMap.get(name) ?? null },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api-proxy [...path]", () => {
  it("anexa Authorization a partir do cookie e não repassa cookie/host/connection/content-length", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse());
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api-proxy/persons?limit=10", {
      method: "GET",
      headers: {
        cookie: `${ACCESS_COOKIE}=tok123`,
        host: "web.orbien.app",
        connection: "keep-alive",
        "content-length": "0",
        "x-custom": "mantido",
      },
    });

    const res = await GET(request, ctx(["persons"]));

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/persons?limit=10");
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer tok123");
    expect(headers.has("cookie")).toBe(false);
    expect(headers.has("host")).toBe(false);
    expect(headers.has("connection")).toBe(false);
    expect(headers.has("content-length")).toBe(false);
    expect(headers.get("x-custom")).toBe("mantido");
    // GET não tem corpo.
    expect(init.body).toBeUndefined();
    expect(init.redirect).toBe("manual");
  });

  it("não anexa Authorization quando não há cookie de acesso", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse());
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api-proxy/persons", { method: "GET" });
    await GET(request, ctx(["persons"]));

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).has("authorization")).toBe(false);
  });

  it("repassa o corpo em stream com duplex half para métodos com corpo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse());
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api-proxy/persons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ana" }),
    });
    await POST(request, ctx(["persons"]));

    const [, init] = fetchMock.mock.calls[0];
    expect(init.duplex).toBe("half");
    expect(init.body).toBeTruthy();
  });

  it("repassa content-type, content-disposition e cache-control da resposta upstream", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      upstreamResponse({
        status: 201,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": "attachment; filename=x.pdf",
          "cache-control": "no-store",
          "x-other": "não deveria aparecer",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api-proxy/export", { method: "GET" });
    const res = await GET(request, ctx(["export"]));

    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe("attachment; filename=x.pdf");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-other")).toBeNull();
  });

  it.each([
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ] as const)("expõe o verbo %s encaminhando ao path certo", async (method, handler) => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse());
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api-proxy/persons/1", { method });
    await handler(request, ctx(["persons", "1"]));

    expect(fetchMock.mock.calls[0][0]).toContain("/persons/1");
    expect(fetchMock.mock.calls[0][1].method).toBe(method);
  });
});
