import api from "./api";

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

  const webUrl = process.env.NEXT_PUBLIC_WEB_URL;
  if (!webUrl) {
    throw new Error(
      "NEXT_PUBLIC_WEB_URL não está definida — sem ela não há para onde abrir a sessão."
    );
  }

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
