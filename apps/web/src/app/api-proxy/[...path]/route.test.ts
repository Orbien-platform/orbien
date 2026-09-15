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

describe("origem do visitante", () => {
  const ambiente = process.env.ORBIEN_PROXY_SECRET;

  afterEach(() => {
    if (ambiente === undefined) delete process.env.ORBIEN_PROXY_SECRET;
    else process.env.ORBIEN_PROXY_SECRET = ambiente;
  });

  async function encaminhar(headers: Record<string, string>) {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse());
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api-proxy/public/small-groups", {
      method: "GET",
      headers,
    });
    await GET(request, ctx(["public", "small-groups"]));

    const [, init] = fetchMock.mock.calls[0];
    return init.headers as Headers;
  }

  it("declara à API o IP do visitante, assinado pelo segredo", async () => {
    process.env.ORBIEN_PROXY_SECRET = "segredo-do-proxy";

    const headers = await encaminhar({ "x-real-ip": "9.9.9.9" });

    expect(headers.get("x-orbien-client-ip")).toBe("9.9.9.9");
    expect(headers.get("x-orbien-proxy-secret")).toBe("segredo-do-proxy");
  });

  it("usa a última entrada do x-forwarded-for quando não há x-real-ip", async () => {
    process.env.ORBIEN_PROXY_SECRET = "segredo-do-proxy";

    // Proxies acrescentam à direita: a última entrada é a escrita pelo salto
    // mais próximo, e a única que um cliente não empurra para o fim da lista.
    const headers = await encaminhar({ "x-forwarded-for": "1.1.1.1, 9.9.9.9" });

    expect(headers.get("x-orbien-client-ip")).toBe("9.9.9.9");
  });

  it("não anexa nada quando o segredo não está configurado — a API cai no req.ip", async () => {
    delete process.env.ORBIEN_PROXY_SECRET;

    const headers = await encaminhar({ "x-real-ip": "9.9.9.9" });

    expect(headers.has("x-orbien-client-ip")).toBe(false);
    expect(headers.has("x-orbien-proxy-secret")).toBe(false);
  });

  it("não anexa nada quando a plataforma não informa origem alguma", async () => {
    process.env.ORBIEN_PROXY_SECRET = "segredo-do-proxy";

    const headers = await encaminhar({});

    expect(headers.has("x-orbien-client-ip")).toBe(false);
    expect(headers.has("x-orbien-proxy-secret")).toBe(false);
  });

  it("ignora x-forwarded-for vazio", async () => {
    process.env.ORBIEN_PROXY_SECRET = "segredo-do-proxy";

    const headers = await encaminhar({ "x-forwarded-for": "  " });

    expect(headers.has("x-orbien-client-ip")).toBe(false);
  });

  // A asserção que sustenta o desenho: sem isto, qualquer visitante escolheria
  // o próprio balde no limite de taxa da API mandando o cabeçalho na mão.
  it("nunca repassa os cabeçalhos de origem vindos do browser", async () => {
    process.env.ORBIEN_PROXY_SECRET = "segredo-do-proxy";

    const headers = await encaminhar({
      "x-real-ip": "9.9.9.9",
      "x-orbien-client-ip": "1.2.3.4",
      "x-orbien-proxy-secret": "chute",
    });

    expect(headers.get("x-orbien-client-ip")).toBe("9.9.9.9");
    expect(headers.get("x-orbien-proxy-secret")).toBe("segredo-do-proxy");
  });

  it("descarta os cabeçalhos forjados mesmo sem segredo configurado", async () => {
    delete process.env.ORBIEN_PROXY_SECRET;

    const headers = await encaminhar({
      "x-orbien-client-ip": "1.2.3.4",
      "x-orbien-proxy-secret": "chute",
    });

    expect(headers.has("x-orbien-client-ip")).toBe(false);
    expect(headers.has("x-orbien-proxy-secret")).toBe(false);
  });
});
