import api from "./api";

/** Domínio público do web em produção. */
export const PRODUCTION_WEB_URL = "https://web.useorbien.com";

/**
 * Para onde a sessão de suporte é aberta, sem barra no fim.
 *
 * Em produção só vale host em `useorbien.com`: o token viaja nessa URL, e um
 * `NEXT_PUBLIC_WEB_URL` apontando para `*.vercel.app` (ou ausente) levaria o
 * suporte a outro domínio. Nesse caso cai para `PRODUCTION_WEB_URL`. Fora de
 * produção, a variável é obrigatória e usada como veio.
 */
export function resolveWebUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_WEB_URL ?? "").trim().replace(/\/+$/, "");

  if (process.env.NODE_ENV !== "production") {
    if (!raw) {
      throw new Error(
        "NEXT_PUBLIC_WEB_URL não está definida — sem ela não há para onde abrir a sessão."
      );
    }
    return raw;
  }

  try {
    const { hostname } = new URL(raw);
    if (hostname === "useorbien.com" || hostname.endsWith(".useorbien.com")) {
      return raw;
    }
  } catch {
    // valor vazio ou inválido: cai no domínio de produção
  }
  return PRODUCTION_WEB_URL;
}

/**
 * Abre uma sessão de suporte dentro de um tenant, no `apps/web`.
 *
 * `POST /auth/impersonate` devolve um access token que fixa `tenant_id` no
 * tenant escolhido e carrega `support_session: true` — a marca que satisfaz
 * qualquer `@Roles` no `RolesGuard`. O contrapeso é o `AuditInterceptor`
 * global, que grava `support_access` em `audit_logs` a cada requisição feita
 * com esse token. Quem mexer num dos dois mexeu no acordo inteiro.
 *
 * A resposta **não** traz refresh token, e isso é de propósito: a sessão vale
 * os 15 minutos do access token e não se renova sozinha. Terminado o prazo, o
 * web devolve o suporte para a tela de login.
 *
 * O token vai no fragmento (`#`), não na query. Fragmento não é enviado ao
 * servidor: não entra em log de acesso da Vercel, nem em `Referer`, nem no
 * histórico compartilhado de um proxy. Query string entraria em todos os três.
 */
export async function openSupportSession(
  tenantId: string,
  tenantName: string
): Promise<void> {
  const { data } = await api.post<{ access_token: string; expires_in: number }>(
    "/auth/impersonate",
    { target_tenant_id: tenantId }
  );

  const webUrl = resolveWebUrl();

  const fragment = new URLSearchParams({
    access_token: data.access_token,
    tenant_name: tenantName,
  });

  // `noopener` corta o acesso do web ao `window.opener` deste console —
  // origens diferentes já limitariam muito, mas a sessão de suporte é
  // justamente onde não vale economizar.
  window.open(
    `${webUrl}/suporte/sessao#${fragment}`,
    "_blank",
    "noopener,noreferrer"
  );
}
