/**
 * Rotação do access token, pedida pelo interceptor do Axios ao ver um 401.
 *
 * O cliente não manda nem recebe token: manda um POST vazio e recebe 204 com
 * `Set-Cookie`. Ele sabe *quando* renovar — é quem vê o 401 — sem nunca ter a
 * credencial na mão.
 *
 * Uma rotação por vez. A API revoga a família inteira ao ver refresh token
 * reusado, então duas chamadas concorrentes derrubariam a sessão; a fila de
 * `src/lib/api.ts` é o que garante a serialização, e é por isso que esta rota
 * é separada do proxy.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
  clearSessionCookies,
  rotate,
  setAccessCookie,
  setRefreshCookie,
} from "@/lib/session";

export async function POST(request: NextRequest) {
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  const pair = refresh ? await rotate(refresh) : null;
  if (!pair) {
    const response = new NextResponse(null, { status: 401 });
    clearSessionCookies(response.cookies);
    return response;
  }

  const response = new NextResponse(null, { status: 204 });
  setAccessCookie(response.cookies, pair.access_token, REFRESH_MAX_AGE);
  setRefreshCookie(response.cookies, pair.refresh_token);
  return response;
}
