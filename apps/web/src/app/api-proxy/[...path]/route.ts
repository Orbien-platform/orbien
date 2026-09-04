/**
 * O proxy para a API — agora um Route Handler, não mais um `rewrite`.
 *
 * O rewrite do `next.config` bastava enquanto o browser carregava o
 * `Authorization` sozinho. Com a sessão em cookie `HttpOnly`, o browser não
 * tem mais o token para anexar: quem anexa é este handler, que lê o cookie do
 * lado do servidor e monta o cabeçalho. É o único ponto do web que vê o access
 * token.
 *
 * Não renova nada. Um 401 sobe intacto para o interceptor do Axios, que
 * serializa a renovação em `/api/session/refresh` — ver o comentário de
 * `rotate()` sobre por que rotação concorrente derruba a sessão.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, BACKEND_URL } from "@/lib/session";

/**
 * Cabeçalhos que não podem ser repassados: ou descrevem a conexão com o
 * browser (`host`, `connection`), ou seriam recalculados errado pelo `fetch`
 * (`content-length`), ou carregam a sessão para um lugar que não a usa
 * (`cookie` — a API autentica por `Authorization`, e mandar o cookie junto só
 * ampliaria onde a credencial aparece).
 */
const NAO_REPASSAR = new Set([
  "host",
  "connection",
  "content-length",
  "cookie",
  "authorization",
]);

async function encaminhar(request: NextRequest, path: string[]) {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;

  const headers = new Headers();
  for (const [nome, valor] of request.headers) {
    if (!NAO_REPASSAR.has(nome.toLowerCase())) headers.set(nome, valor);
  }
  if (token) headers.set("authorization", `Bearer ${token}`);

  const temCorpo = !["GET", "HEAD"].includes(request.method);

  const upstream = await fetch(
    `${BACKEND_URL}/${path.join("/")}${request.nextUrl.search}`,
    {
      method: request.method,
      headers,
      // Corpo em stream, e não `await request.text()`: o upload de mídia vai a
      // 50MB e bufferizá-lo inteiro na função seria desperdício de memória.
      // `duplex: "half"` é exigência do fetch do Node para corpo em stream, e
      // ainda não está no tipo `RequestInit` do TypeScript.
      ...(temCorpo ? { body: request.body, duplex: "half" } : {}),
      redirect: "manual",
    } as RequestInit
  );

  const resposta = new NextResponse(upstream.body, { status: upstream.status });
  for (const nome of ["content-type", "content-disposition", "cache-control"]) {
    const valor = upstream.headers.get(nome);
    if (valor) resposta.headers.set(nome, valor);
  }
  return resposta;
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  return encaminhar(request, (await ctx.params).path);
}

export async function POST(request: NextRequest, ctx: Ctx) {
  return encaminhar(request, (await ctx.params).path);
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  return encaminhar(request, (await ctx.params).path);
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  return encaminhar(request, (await ctx.params).path);
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  return encaminhar(request, (await ctx.params).path);
}
