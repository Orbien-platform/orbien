/**
 * Entrada da sessão de suporte: o token vindo do console vira cookie.
 *
 * O `apps/admin` vive em outra origem e entrega o token no fragmento da URL
 * (ver `apps/admin/src/lib/support-session.ts`). A página `/suporte/sessao` lê
 * o fragmento e posta aqui; a partir deste ponto o token está em cookie
 * `HttpOnly` e sai do alcance do JavaScript — a janela em que ele fica
 * legível é o intervalo entre o `location.hash` e este POST.
 *
 * Não grava refresh token porque não existe: `POST /auth/impersonate` não
 * emite. A sessão vale os 15 minutos do access token e não se renova.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeJwtPayload } from "@/lib/auth";
import {
  clearSessionCookies,
  setAccessCookie,
  setIdentityCookie,
} from "@/lib/session";

export async function POST(request: NextRequest) {
  const { access_token, tenant_name } = (await request.json()) as {
    access_token?: string;
    tenant_name?: string;
  };

  const payload = access_token ? decodeJwtPayload(access_token) : null;
  if (!access_token || !payload) {
    return NextResponse.json({ message: "token_ilegivel" }, { status: 400 });
  }

  const expiresIn = Math.floor(payload.exp - Date.now() / 1000);
  if (expiresIn <= 0) {
    return NextResponse.json({ message: "token_expirado" }, { status: 400 });
  }

  if (payload.support_session !== true) {
    return NextResponse.json({ message: "token_nao_e_de_suporte" }, { status: 400 });
  }

  const response = new NextResponse(null, { status: 204 });
  // Apaga primeiro: sem isso, o refresh token de um login anterior nesta mesma
  // origem sobreviveria à sessão de suporte e a renovaria como aquele usuário.
  clearSessionCookies(response.cookies);
  setAccessCookie(response.cookies, access_token, expiresIn);
  // O e-mail exibido é o do operador de suporte, não o de quem ele atende.
  setIdentityCookie(response.cookies, {
    email: "suporte@orbien",
    ...(tenant_name ? { tenantName: tenant_name } : {}),
  });
  return response;
}
