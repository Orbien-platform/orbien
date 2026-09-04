import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Barra as telas privadas antes de renderizar.
 *
 * Lê os cookies da sessão direto — o middleware roda no servidor e enxerga
 * `HttpOnly`. Antes existia um cookie `auth_session=1` só para isto, porque a
 * credencial estava em `localStorage`, invisível daqui; com a sessão em
 * cookie, o flag paralelo sumiu junto com o risco de ele discordar da verdade.
 *
 * Os dois cookies contam, e por motivos diferentes: sessão normal costuma
 * chegar aqui com o access token vencido (15 minutos) e o refresh vivo (7
 * dias) — barrar por causa disso expulsaria quem está logado. Sessão de
 * suporte não tem refresh nenhum, e vale enquanto o access valer.
 *
 * Isto é portão de navegação, não de autorização: quem autoriza é a API, que
 * valida a assinatura. Aqui só se olha presença.
 */
export function proxy(request: NextRequest) {
  const temSessao =
    request.cookies.has("orbien_at") || request.cookies.has("orbien_rt");

  if (!temSessao) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/pessoas/:path*",
    "/grupos/:path*",
    "/financeiro/:path*",
    "/conteudo/:path*",
    "/voluntarios/:path*",
    "/celebracoes/:path*",
    "/configuracoes/:path*",
  ],
};
