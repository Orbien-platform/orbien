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
 *
 * Também declara para a API de quem é a requisição: como todo tráfego público
 * passa por aqui, sem isso a API veria uma origem só — a desta função — e o
 * limite por IP dela viraria uma cota global. Ver `encaminharOrigem()`.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, BACKEND_URL } from "@/lib/session";

/** Cabeçalhos do contrato com a API — ver `ProxyClientIpThrottlerGuard`. */
const CLIENT_IP_HEADER = "x-orbien-client-ip";
const PROXY_SECRET_HEADER = "x-orbien-proxy-secret";

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
  // Os dois cabeçalhos abaixo são escritos por este handler, nunca repassados:
  // eles dizem à API qual é o IP do visitante, e aceitar a versão que veio do
  // browser deixaria qualquer um escolher a própria identidade no limite de
  // taxa. Ver `encaminharOrigem()`.
  CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
]);

/**
 * Declara à API o IP do visitante, assinado pelo segredo compartilhado.
 *
 * A borda da Render sobrescreve o `X-Forwarded-For` com o IP de quem conectou
 * — que, para tudo que passa por aqui, é esta função da Vercel. O `req.ip` da
 * API fica igual para todo mundo, e o `ThrottlerGuard` deixa de isolar
 * qualquer coisa: as rotas públicas (doação, visitante por QR, waitlist,
 * "Encontre uma célula") e, pior, as de credencial (`/auth/login`,
 * `/auth/platform/login`) passam a dividir um balde só.
 *
 * O segredo é o que torna o cabeçalho confiável: a API é alcançável direto, e
 * sem ele bastaria a qualquer cliente mandar um IP inventado a cada tentativa
 * para nunca esbarrar em limite nenhum. Sem `ORBIEN_PROXY_SECRET` configurado
 * aqui, nada é anexado e a API cai no `req.ip` de sempre — a mesma cota
 * global de hoje, que é o lado seguro do erro.
 *
 * O IP vem do que a Vercel diz, nunca do que o browser manda: `x-real-ip`
 * primeiro e, na falta dele, a ÚLTIMA entrada de `x-forwarded-for` — proxies
 * acrescentam à direita, então é a entrada escrita pelo salto mais próximo, e
 * a única que um cliente não consegue empurrar para o fim da lista.
 */
function encaminharOrigem(request: NextRequest, headers: Headers): void {
  const segredo = process.env.ORBIEN_PROXY_SECRET;
  if (!segredo) return;

  const encaminhado = request.headers.get("x-forwarded-for");
  const ip =
    request.headers.get("x-real-ip")?.trim() ||
    encaminhado?.split(",").pop()?.trim();

  if (!ip) return;

  headers.set(CLIENT_IP_HEADER, ip);
  headers.set(PROXY_SECRET_HEADER, segredo);
}

async function encaminhar(request: NextRequest, path: string[]) {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;

  const headers = new Headers();
  for (const [nome, valor] of request.headers) {
    if (!NAO_REPASSAR.has(nome.toLowerCase())) headers.set(nome, valor);
  }
  if (token) headers.set("authorization", `Bearer ${token}`);
  encaminharOrigem(request, headers);

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
