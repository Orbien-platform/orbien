"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import axios from "axios";
import { decodeJwtPayload } from "@/lib/auth";
import { useHydrated } from "@/hooks/useHydrated";

/**
 * Ponto de entrada da sessão de suporte, aberto pelo `apps/admin`.
 *
 * O console e este app vivem em subdomínios diferentes, e cookie de um não é
 * cookie do outro. Não existe caminho por baixo: o token vem no fragmento da
 * URL.
 *
 * Fragmento, e não query string, porque fragmento não é enviado ao servidor:
 * fica fora do log de acesso da Vercel, do `Referer` e de qualquer proxy no
 * caminho. Depois de lido ele é apagado da barra de endereço com
 * `replaceState`, para não sobrar num screenshot nem no histórico.
 *
 * O token só passa por esta página: daqui vai para `POST /api/session/suporte`,
 * que o guarda em cookie `HttpOnly` e o tira do alcance do JavaScript. A
 * janela em que ele é legível por script é o intervalo entre ler o
 * `location.hash` e essa chamada voltar.
 *
 * Não há refresh token (`POST /auth/impersonate` não emite): a sessão vale os
 * 15 minutos do access token e não se renova. Quando expira, `/api/session`
 * responde 401, o middleware manda para `/login`, e é o comportamento certo —
 * renovar sozinha uma sessão que enxerga dado de igreja alheia é exatamente o
 * que não se quer.
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
  const [erroDeTroca, setErroDeTroca] = useState<string | null>(null);

  const result = useMemo(
    () => (isHydrated ? readHandoff() : null),
    [isHydrated]
  );

  useEffect(() => {
    if (!result) return;

    // Limpa o fragmento ANTES de decidir o que fazer com ele. Antes isto
    // rodava só no caminho de sucesso, e nos três ramos de erro o
    // `#access_token=…` ficava na barra de endereço e na entrada de histórico
    // da aba — o token desses ramos é ausente, ilegível ou expirado, mas o
    // cuidado é o mesmo que justifica usar fragmento em vez de query.
    window.history.replaceState(null, "", window.location.pathname);

    if ("error" in result) return;
    const { token, tenantName } = result.handoff;

    axios
      .post("/api/session/suporte", {
        access_token: token,
        ...(tenantName ? { tenant_name: tenantName } : {}),
      })
      .then(() => {
        window.location.replace("/dashboard");
      })
      .catch(() => {
        setErroDeTroca("Não foi possível abrir a sessão de suporte. Tente pelo console.");
      });
  }, [result]);

  const erro = erroDeTroca ?? (result && "error" in result ? result.error : null);

  if (erro) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-parchment)] px-4">
        <div className="w-full max-w-[420px] rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-8 text-center shadow-[var(--shadow-md)]">
          <h1 className="text-base font-medium text-ink dark:text-white">
            Sessão de suporte não iniciada
          </h1>
          <p className="mt-2 text-sm text-stone" role="alert">
            {erro}
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
