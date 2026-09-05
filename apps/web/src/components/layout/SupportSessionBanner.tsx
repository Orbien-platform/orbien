"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Faixa permanente enquanto a sessão for de suporte.
 *
 * Não é decoração. A sessão de suporte satisfaz qualquer `@Roles` no
 * `RolesGuard` e enxerga o dado da igreja como se fosse dela — e cada
 * requisição vira uma linha `support_access` em `audit_logs`. Quem está
 * operando precisa ver, sem procurar, que não está na própria conta, e ter
 * como sair sem fechar a aba.
 *
 * A marca vem do usuário da sessão, que o servidor monta a partir do
 * `support_session` dentro do JWT assinado — não de um flag em storage que
 * qualquer script poderia escrever.
 *
 * A contagem existe porque a sessão dura 5 minutos e **não se renova**
 * (`impersonate` não emite refresh token). Sem ela, o fim chega como um
 * redirecionamento para o login no meio de alguma coisa. Com ela, o operador
 * decide se reabre — o que é um clique no console, e uma linha nova em
 * `audit_logs`.
 */

function formataRestante(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SupportSessionBanner() {
  const { user, logout } = useAuth();
  const expiresAt = user?.support_session ? user.expires_at : null;
  const [restante, setRestante] = useState<number | null>(null);

  useEffect(() => {
    if (expiresAt === null) return;

    const tick = () =>
      setRestante(Math.max(0, Math.round(expiresAt - Date.now() / 1000)));

    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (!user?.support_session) return null;

  // Abaixo de um minuto a faixa muda de cor. É o momento em que "termino
  // depois" deixa de ser uma opção, e ele precisa ser visível de canto de olho.
  const acabando = restante !== null && restante <= 60;

  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-3 px-4 py-1.5 text-center text-xs font-medium text-white ${
        acabando ? "bg-red-700" : "bg-burgundy"
      }`}
    >
      <ShieldAlert size={14} strokeWidth={2} className="shrink-0" />
      <span>
        Sessão de suporte da plataforma
        {user.support_tenant_name ? ` — ${user.support_tenant_name}` : ""}. Toda
        ação fica registrada em auditoria.
      </span>
      {restante !== null && (
        <span className="shrink-0 tabular-nums">
          {restante > 0 ? `Expira em ${formataRestante(restante)}` : "Expirada"}
        </span>
      )}
      <button
        type="button"
        onClick={() => void logout()}
        className="shrink-0 rounded-[4px] border border-white/40 px-2 py-0.5 font-medium text-white transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Encerrar sessão
      </button>
    </div>
  );
}
