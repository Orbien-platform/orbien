import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Só evita a piscada de tela protegida antes do redirect do cliente. Não é
 * controle de acesso: o cookie é um marcador (`auth_session=1`), não o token,
 * e quem barra de verdade é o `JwtAuthGuard` + `RolesGuard` na API e o
 * `app_platform_access()` no banco.
 */
export function proxy(request: NextRequest) {
  const session = request.cookies.get("auth_session")?.value;
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/tenants/:path*", "/waitlist/:path*"],
};
