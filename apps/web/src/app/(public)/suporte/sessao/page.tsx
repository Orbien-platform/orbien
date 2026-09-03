"use client";

import { useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { saveTokens, decodeJwtPayload } from "@/lib/auth";
import { useHydrated } from "@/hooks/useHydrated";

/**
 * Ponto de entrada da sessão de suporte, aberto pelo `apps/admin`.
 *
 * O console e este app vivem em subdomínios diferentes — `admin.` e o do
 * tenant — e `localStorage` é por origem. Não existe caminho por baixo: o
 * token vem no fragmento da URL.
 *
 * Fragmento, e não query string, porque fragmento não é enviado ao servidor:
 * fica fora do log de acesso da Vercel, do `Referer` e de qualquer proxy no
 * caminho. Depois de lido ele é apagado da barra de endereço com
 * `replaceState`, para não sobrar num screenshot nem no histórico.
 *
 * O token não traz refresh token (`POST /auth/impersonate` não emite um): a
 * sessão vale os 15 minutos do access token e não se renova. Quando expira, o
 * interceptor do Axios não acha refresh e manda para `/login` — que é o
 * comportamento certo, porque renovar sozinha uma sessão que enxerga dado de
 * igreja alheia é exatamente o que não se quer.
 */

interface Handoff {
  token: string;
  tenantName: string | null;
}

function readHandoff(): { handoff: Handoff } | { error: string } {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("access_token");

  if (!token) return { error: "Link de sessão de suporte inválido ou incompleto." };

  const payload = decodeJwtPayload(token);
  if (!payload) return { error: "Token de sessão de suporte ilegível." };
  if (payload.exp * 1000 < Date.now()) {
    return { error: "Esta sessão de suporte já expirou. Abra outra pelo console." };
  }

  return { handoff: { token, tenantName: params.get("tenant_name") } };
}

export default function SessaoSuportePage() {
  const isHydrated = useHydrated();

  const result = useMemo(
    () => (isHydrated ? readHandoff() : null),
    [isHydrated]
  );

  useEffect(() => {
    if (!result || "error" in result) return;
    const { token, tenantName } = result.handoff;

    // O e-mail exibido é o do operador de suporte, não o de quem ele está
    // atendendo — quem está usando o app precisa saber quem está logado.
    saveTokens(token, "", "suporte@orbien");
    if (tenantName) {
      localStorage.setItem("support_session_tenant", tenantName);
    }
    localStorage.setItem("support_session", "1");

    window.history.replaceState(null, "", window.location.pathname);
    window.location.replace("/dashboard");
  }, [result]);

  if (result && "error" in result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-parchment)] px-4">
        <div className="w-full max-w-[420px] rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-8 text-center shadow-[var(--shadow-md)]">
          <h1 className="text-base font-medium text-ink dark:text-white">
            Sessão de suporte não iniciada
          </h1>
          <p className="mt-2 text-sm text-stone" role="alert">
            {result.error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-parchment)]">
      <div className="flex items-center gap-3 text-sm text-stone">
        <Loader2 size={18} className="animate-spin" />
        Iniciando sessão de suporte…
      </div>
    </div>
  );
}
