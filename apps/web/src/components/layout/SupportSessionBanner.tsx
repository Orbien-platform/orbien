"use client";

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
 */
export function SupportSessionBanner() {
  const { user, logout } = useAuth();

  if (!user?.support_session) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 bg-burgundy px-4 py-1.5 text-center text-xs font-medium text-white"
    >
      <ShieldAlert size={14} strokeWidth={2} className="shrink-0" />
      <span>
        Sessão de suporte da plataforma
        {user.support_tenant_name ? ` — ${user.support_tenant_name}` : ""}. Toda
        ação fica registrada em auditoria.
      </span>
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
