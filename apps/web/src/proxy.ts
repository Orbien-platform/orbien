import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BACKEND_URL } from "@/lib/session";

// ── Domínio próprio (Premium, ver docs/PLANO.md) ────────────────────────────
//
// Hoje o único jeito de chegar numa tela de tenant é `/doar/[tenant_slug]` ou
// `/celulas/[tenant_slug]` — path, nunca host. Fora dos hosts conhecidos do
// próprio `apps/web`, reescreve para a rota `[tenant_slug]` equivalente —
// sem redirect visível, o navegador continua achando que está em
// `igreja.com.br`. Mapeamento deliberadamente pequeno — só as duas páginas
// públicas que existem hoje; qualquer outro caminho segue para o
// roteamento normal e cai no 404 padrão, decisão de escopo, não lacuna.
const CUSTOM_DOMAIN_PATH_MAP: Record<string, string> = {
  "/": "/doar",
  "/celulas": "/celulas",
};

function isKnownWebHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (hostname.endsWith(".vercel.app")) return true;
  const ownHost = process.env["NEXT_PUBLIC_WEB_HOST"];
  return ownHost ? hostname === ownHost : false;
}

async function resolveCustomDomainRewrite(request: NextRequest): Promise<NextResponse | null> {
  const target = CUSTOM_DOMAIN_PATH_MAP[request.nextUrl.pathname];
  if (!target) return null;

  const hostname = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (!hostname || isKnownWebHost(hostname)) return null;

  try {
    const res = await fetch(
      `${BACKEND_URL}/public/domains/resolve?host=${encodeURIComponent(hostname)}`,
    );
    if (!res.ok) return null;

    const { tenant_slug } = (await res.json()) as { tenant_slug: string };
    const url = request.nextUrl.clone();
    url.pathname = `${target}/${tenant_slug}`;
    return NextResponse.rewrite(url);
  } catch {
    // Backend fora do ar não pode virar 500 pro visitante de um domínio
    // próprio — cai no 404 normal do Next, mesmo efeito de domínio não
    // reconhecido.
    return null;
  }
}

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
 *
 * Roda DEPOIS do rewrite de domínio próprio, e só se aplica às telas
 * privadas de verdade (`PRIVATE_PREFIXES`) — o matcher abaixo também inclui
 * `/` e `/celulas` (para o rewrite de host alcançá-los), e as duas são
 * públicas: aplicar o gate de sessão a elas trocaria bug de host por bug de
 * autenticação, forçando login em página que nunca pediu uma.
 */
const PRIVATE_PREFIXES = [
  "/dashboard",
  "/pessoas",
  "/grupos",
  "/financeiro",
  "/conteudo",
  "/voluntarios",
  "/celebracoes",
  "/auditoria",
  "/configuracoes",
  "/perfil",
];

export async function proxy(request: NextRequest) {
  const domainRewrite = await resolveCustomDomainRewrite(request);
  if (domainRewrite) return domainRewrite;

  const { pathname } = request.nextUrl;
  if (!PRIVATE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

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
    "/",
    "/celulas",
    "/dashboard/:path*",
    "/pessoas/:path*",
    "/grupos/:path*",
    "/financeiro/:path*",
    "/conteudo/:path*",
    "/voluntarios/:path*",
    "/celebracoes/:path*",
    "/auditoria/:path*",
    "/configuracoes/:path*",
    "/perfil/:path*",
  ],
};
