import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { DELETE, GET, PATCH, POST, PUT } from "./route";
import { ACCESS_COOKIE } from "@/lib/session";

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  search?: string;
  body?: unknown;
}

function makeRequest({
  method = "GET",
  headers = {},
  cookies = {},
  search = "",
  body = null,
}: RequestOptions = {}): NextRequest {
  return {
    method,
    headers: new Headers(headers),
    cookies: {
      get: (name: string) =>
        name in cookies ? { name, value: cookies[name] } : undefined,
    },
    nextUrl: { search },
    body,
  } as unknown as NextRequest;
}

function makeCtx(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function upstreamResponse(
  overrides: {
    status?: number;
    body?: string | null;
    headers?: Record<string, string>;
  } = {}
) {
  return {
    status: overrides.status ?? 200,
    body: overrides.body ?? null,
    headers: new Headers(overrides.headers ?? {}),
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(upstreamResponse());
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("proxy /api-proxy/[...path]", () => {
  it("monta a URL com o caminho e a query, e anexa o token do cookie", async () => {
    await GET(
      makeRequest({
        cookies: { [ACCESS_COOKIE]: "at-1" },
        search: "?page=2",
      }),
      makeCtx(["persons", "abc"])
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/persons/abc?page=2");
    expect(init.method).toBe("GET");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer at-1");
    expect(init.redirect).toBe("manual");
  });

  it("sem cookie de sessão não inventa Authorization", async () => {
    await GET(makeRequest(), makeCtx(["health"]));

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get("authorization")).toBeNull();
  });

  it("não repassa os cabeçalhos de conexão nem o cookie da sessão", async () => {
    await GET(
      makeRequest({
        headers: {
          host: "app.orbien.com",
          connection: "keep-alive",
          "content-length": "12",
          cookie: "orbien_at=at-1",
          authorization: "Bearer forjado",
          "accept-language": "pt-BR",
        },
        cookies: { [ACCESS_COOKIE]: "at-1" },
      }),
      makeCtx(["persons"])
    );

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("host")).toBeNull();
    expect(headers.get("connection")).toBeNull();
    expect(headers.get("content-length")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
    // O Authorization que o cliente mandou é descartado; quem monta é o
    // handler, a partir do cookie HttpOnly.
    expect(headers.get("authorization")).toBe("Bearer at-1");
    expect(headers.get("accept-language")).toBe("pt-BR");
  });

  it("GET não manda corpo", async () => {
    await GET(makeRequest({ body: "nao-deveria-ir" }), makeCtx(["persons"]));
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it("POST repassa o corpo em stream com duplex half", async () => {
    const body = { stream: true };
    await POST(
      makeRequest({ method: "POST", body }),
      makeCtx(["persons"])
    );

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
    expect(init.duplex).toBe("half");
  });

  it("PUT, PATCH e DELETE chegam à API com o próprio método", async () => {
    await PUT(makeRequest({ method: "PUT" }), makeCtx(["persons", "1"]));
    await PATCH(makeRequest({ method: "PATCH" }), makeCtx(["persons", "1"]));
    await DELETE(makeRequest({ method: "DELETE" }), makeCtx(["persons", "1"]));

    expect(fetchMock.mock.calls.map(([, init]) => init.method)).toEqual([
      "PUT",
      "PATCH",
      "DELETE",
    ]);
  });

  it("devolve o status da API e só os três cabeçalhos da allowlist", async () => {
    fetchMock.mockResolvedValue(
      upstreamResponse({
        status: 201,
        body: '{"id":"1"}',
        headers: {
          "content-type": "application/json",
          "content-disposition": 'attachment; filename="dre.pdf"',
          "cache-control": "no-store",
          "set-cookie": "sessao=da-api",
        },
      })
    );

    const response = await GET(makeRequest(), makeCtx(["financial", "dre"]));

    expect(response.status).toBe(201);
    expect(await response.text()).toBe('{"id":"1"}');
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="dre.pdf"'
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("401 da API sobe intacto — a renovação é do interceptor, não daqui", async () => {
    fetchMock.mockResolvedValue(upstreamResponse({ status: 401 }));

    const response = await GET(
      makeRequest({ cookies: { [ACCESS_COOKIE]: "at-vencido" } }),
      makeCtx(["persons"])
    );

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).not.toContain("/auth/refresh");
  });
});
