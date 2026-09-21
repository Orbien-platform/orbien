import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "./route";
import { ACCESS_COOKIE, IDENTITY_COOKIE, REFRESH_COOKIE } from "@/lib/session";
import type { JwtPayload } from "@/lib/auth";

function makeToken(payload: Partial<JwtPayload>): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

function req(opts: {
  method?: string;
  cookie?: string;
  body?: unknown;
}): NextRequest {
  return new NextRequest("http://localhost/api/session", {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.body ? { "content-type": "application/json" } : {}),
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/session", () => {
  it("responde 401 com user null quando não há cookie nenhum", async () => {
    const res = await GET(req({}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ user: null });
    // Sem cookie para limpar, o Set-Cookie não deve aparecer.
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("responde 401 e limpa cookies quando o access token é ilegível", async () => {
    const res = await GET(req({ cookie: `${ACCESS_COOKIE}=garbage` }));
    expect(res.status).toBe(401);
    expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe("");
  });

  it("responde 401 e limpa cookies quando só a identidade existe (sem access)", async () => {
    const identity = encodeURIComponent(JSON.stringify({ email: "a@b.com" }));
    const res = await GET(req({ cookie: `${IDENTITY_COOKIE}=${identity}` }));
    expect(res.status).toBe(401);
    expect(res.cookies.get(IDENTITY_COOKIE)?.value).toBe("");
  });

  it("devolve o usuário da sessão, com as áreas que a API respondeu", async () => {
    const token = makeToken({
      sub: "u1",
      tenant_id: "t1",
      congregation_id: "c1",
      roles: ["tenant_admin"],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ areas: ["persons", "financial"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const identity = encodeURIComponent(JSON.stringify({ email: "ana@igreja.com" }));
    const res = await GET(
      req({ cookie: `${ACCESS_COOKIE}=${token}; ${IDENTITY_COOKIE}=${identity}` })
    );

    expect(res.status).toBe(200);
    const { user } = await res.json();
    expect(user).toMatchObject({
      id: "u1",
      email: "ana@igreja.com",
      roles: ["tenant_admin"],
      areas: ["persons", "financial"],
    });
    // O token vai no Authorization, e não sai daqui: quem chama é o servidor.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/me/permissions"),
      expect.objectContaining({ headers: { Authorization: `Bearer ${token}` } })
    );
  });

  it("a sessão sobe mesmo se a API não responder as áreas", async () => {
    // `areas: null` é "não sei", e a barra lateral desenha tudo. Derrubar a
    // montagem da sessão porque a API está fora seria pior: o token ainda é
    // legível e quem nega acesso de verdade é a própria API.
    const token = makeToken({
      sub: "u1",
      tenant_id: "t1",
      congregation_id: "c1",
      roles: ["tenant_admin"],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const identity = encodeURIComponent(JSON.stringify({ email: "ana@igreja.com" }));
    const res = await GET(
      req({ cookie: `${ACCESS_COOKIE}=${token}; ${IDENTITY_COOKIE}=${identity}` })
    );

    expect(res.status).toBe(200);
    const { user } = await res.json();
    expect(user.areas).toBeNull();
  });
});

describe("POST /api/session (login)", () => {
  it("repassa status e corpo quando a API rejeita o login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: "TENANT_NOT_FOUND" }),
      })
    );
    const res = await POST(req({ method: "POST", body: { email: "a@b.com" } }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "TENANT_NOT_FOUND" });
  });

  it("repassa o status com corpo vazio quando o erro da API não vem em JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("not json");
        },
      })
    );
    const res = await POST(req({ method: "POST", body: { email: "a@b.com" } }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({});
  });

  it("responde 502 quando a resposta de login não decodifica", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "garbage", refresh_token: "r" }),
      })
    );
    const res = await POST(req({ method: "POST", body: { email: "a@b.com" } }));
    expect(res.status).toBe(502);
  });

  it("responde 502 quando o corpo não trouxe email", async () => {
    const token = makeToken({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: token, refresh_token: "r" }),
      })
    );
    const res = await POST(req({ method: "POST", body: {} }));
    expect(res.status).toBe(502);
  });

  it("responde 502 quando o token decodifica mas roles não é um array (payload malformado)", async () => {
    // Guarda a mesma checagem contra um payload cujo `roles` sumiu ou veio
    // num formato inesperado — sem isso, `payload.roles.some(...)` no
    // bloqueio de WEB_ACCESS_DENIED lançaria TypeError (500 não tratado)
    // em vez do 502 limpo que este arquivo já dá para resposta inválida.
    const token = makeToken({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: token, refresh_token: "r" }),
      })
    );
    const res = await POST(req({ method: "POST", body: { email: "a@b.com" } }));
    expect(res.status).toBe(502);
  });

  it("grava os três cookies de sessão em um login bem-sucedido", async () => {
    const token = makeToken({
      sub: "u1",
      tenant_id: "t1",
      congregation_id: "c1",
      roles: ["tenant_admin"],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: token, refresh_token: "r1" }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ areas: ["content"] }) })
    );
    const res = await POST(
      req({ method: "POST", body: { email: "ana@igreja.com", password: "x", tenant_slug: "doca" } })
    );
    expect(res.status).toBe(200);
    expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe(token);
    expect(res.cookies.get(REFRESH_COOKIE)?.value).toBe("r1");
    expect(res.cookies.get(IDENTITY_COOKIE)).toBeDefined();
    const { user } = await res.json();
    expect(user.email).toBe("ana@igreja.com");
    // O login já traz as áreas: a barra lateral não precisa de uma segunda
    // volta ao servidor para saber o que desenhar.
    expect(user.areas).toEqual(["content"]);
  });

  it("recusa login de conta cujo único papel é member, sem gravar cookie", async () => {
    const token = makeToken({
      sub: "u1",
      roles: ["member"],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: token, refresh_token: "r1" }),
      })
      .mockResolvedValueOnce({ ok: true }); // POST /auth/logout (revogação)
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(req({ method: "POST", body: { email: "visitante@igreja.com" } }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      code: "WEB_ACCESS_DENIED",
      message: "Este acesso é apenas pelo aplicativo Orbien.",
    });
    expect(res.cookies.get(ACCESS_COOKIE)).toBeUndefined();
    expect(res.cookies.get(REFRESH_COOKIE)).toBeUndefined();
    expect(res.cookies.get(IDENTITY_COOKIE)).toBeUndefined();
    // Revoga o refresh token recém-emitido — não deixa um token vivo sem
    // cookie nenhum apontando pra ele.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/logout"),
      expect.objectContaining({ body: JSON.stringify({ refresh_token: "r1" }) })
    );
  });

  it("recusa login quando a conta não tem papel nenhum (lista vazia)", async () => {
    const token = makeToken({ sub: "u1", roles: [], exp: Math.floor(Date.now() / 1000) + 3600 });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: token, refresh_token: "r1" }),
        })
        .mockResolvedValueOnce({ ok: true })
    );

    const res = await POST(req({ method: "POST", body: { email: "sem-papel@igreja.com" } }));

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("WEB_ACCESS_DENIED");
  });

  it("libera login de conta com member e outro papel", async () => {
    const token = makeToken({
      sub: "u1",
      roles: ["member", "volunteer"],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: token, refresh_token: "r1" }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ areas: ["volunteers"] }) })
    );

    const res = await POST(req({ method: "POST", body: { email: "voluntario@igreja.com" } }));

    expect(res.status).toBe(200);
    expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe(token);
  });

  it("sessão de suporte nunca teria só member: rolesForToken sempre inclui platform_support, então o bloqueio não dispara", async () => {
    // Documenta o raciocínio do design.md (Risks & Concerns): uma sessão de
    // suporte nasce só em POST /auth/impersonate, que nunca passa por este
    // handler (ele só chama /auth/login) — e mesmo que passasse, o token de
    // impersonate sempre carrega platform_support junto (rolesForToken()),
    // nunca `member` sozinho. Este teste fixa esse invariante: um token com
    // support_session:true e papéis além de member sempre libera o login.
    const token = makeToken({
      sub: "u1",
      roles: ["member", "platform_support"],
      support_session: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: token, refresh_token: "r1" }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ areas: [] }) })
    );

    const res = await POST(req({ method: "POST", body: { email: "suporte@orbien.com" } }));

    expect(res.status).toBe(200);
    expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe(token);
  });

  it("responde o bloqueio mesmo quando a revogação do refresh token falha", async () => {
    const token = makeToken({
      sub: "u1",
      roles: ["member"],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: token, refresh_token: "r1" }),
        })
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
    );

    const res = await POST(req({ method: "POST", body: { email: "visitante@igreja.com" } }));

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("WEB_ACCESS_DENIED");
  });
});

describe("DELETE /api/session (logout)", () => {
  it("limpa os cookies mesmo sem refresh token, sem chamar a API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await DELETE(req({ method: "DELETE" }));
    expect(res.status).toBe(204);
    expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revoga o refresh token na API e limpa os cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const res = await DELETE(req({ method: "DELETE", cookie: `${REFRESH_COOKIE}=r1` }));
    expect(res.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/logout"),
      expect.objectContaining({ method: "POST" })
    );
    expect(res.cookies.get(REFRESH_COOKIE)?.value).toBe("");
  });

  it("limpa os cookies mesmo quando a chamada de logout falha", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const res = await DELETE(req({ method: "DELETE", cookie: `${REFRESH_COOKIE}=r1` }));
    expect(res.status).toBe(204);
    expect(res.cookies.get(REFRESH_COOKIE)?.value).toBe("");
  });
});
