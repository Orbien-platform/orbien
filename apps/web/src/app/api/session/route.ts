/**
 * A sessão do web: criar (POST), ler (GET) e encerrar (DELETE).
 *
 * Existe porque a resposta de `POST /auth/login` traz os tokens no corpo, e o
 * corpo chegaria ao JavaScript da página. Aqui a resposta da API morre no
 * servidor do Next: o que volta ao browser é `Set-Cookie` mais o usuário para
 * exibição. Nenhum token cruza essa fronteira.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeJwtPayload } from "@/lib/auth";
import {
  ACCESS_COOKIE,
  BACKEND_URL,
  IDENTITY_COOKIE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
  buildSessionUser,
  clearSessionCookies,
  readIdentity,
  setAccessCookie,
  setIdentityCookie,
  setRefreshCookie,
  type TokenPair,
} from "@/lib/session";

/**
 * Devolve o usuário da sessão corrente.
 *
 * Decodifica o access token mesmo vencido, e de propósito: decodificar não é
 * validar, quem valida é a API. A tela pode ser montada com o que o payload
 * diz enquanto a primeira chamada de dado toma 401 e dispara a renovação,
 * serializada, em `/api/session/refresh`.
 *
 * Rotacionar aqui seria o erro óbvio: este GET roda na montagem de cada aba,
 * então duas abas abertas juntas fariam duas rotações, e a API revoga a
 * família inteira ao ver refresh token reusado — as duas abas cairiam para o
 * login.
 */
export async function GET(request: NextRequest) {
  const identity = readIdentity(request.cookies.get(IDENTITY_COOKIE)?.value);
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const payload = access ? decodeJwtPayload(access) : null;

  if (!identity || !payload) {
    const response = NextResponse.json({ user: null }, { status: 401 });
    // Cookie pela metade é sessão que não vai a lugar nenhum: some agora, em
    // vez de deixar o middleware liberar a navegação por presença.
    if (access || identity) clearSessionCookies(response.cookies);
    return response;
  }

  return NextResponse.json({ user: buildSessionUser(payload, identity) });
}

/** Login. O corpo é repassado à API tal como veio da tela. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: string };

  const upstream = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Erro sobe com status e corpo intactos: a tela de login distingue
  // `TENANT_NOT_FOUND` de 401 de 5xx pelo que a API respondeu, e reescrever
  // isso aqui trocaria mensagens certas por uma genérica.
  if (!upstream.ok) {
    return NextResponse.json(await upstream.json().catch(() => ({})), {
      status: upstream.status,
    });
  }

  const pair = (await upstream.json()) as TokenPair;
  const payload = decodeJwtPayload(pair.access_token);
  if (!payload || !body.email) {
    return NextResponse.json({ message: "Resposta de login inválida." }, { status: 502 });
  }

  const identity = { email: body.email };
  const response = NextResponse.json({ user: buildSessionUser(payload, identity) });
  setAccessCookie(response.cookies, pair.access_token, REFRESH_MAX_AGE);
  setRefreshCookie(response.cookies, pair.refresh_token);
  setIdentityCookie(response.cookies, identity);
  return response;
}

/** Logout. Revoga o refresh token na API e apaga os cookies aqui. */
export async function DELETE(request: NextRequest) {
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  if (refresh) {
    try {
      await fetch(`${BACKEND_URL}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
    } catch {
      // A API pode estar fora; apagar o cookie local não pode depender disso.
    }
  }

  const response = new NextResponse(null, { status: 204 });
  clearSessionCookies(response.cookies);
  return response;
}
