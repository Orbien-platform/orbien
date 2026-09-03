"use client";

import { useMemo } from "react";
import { ShieldAlert } from "lucide-react";
import { isSupportSession, getSupportTenantName } from "@/lib/auth";
import { useHydrated } from "@/hooks/useHydrated";

/**
 * Faixa permanente enquanto a sessão for de suporte.
 *
 * Não é decoração. A sessão de suporte satisfaz qualquer `@Roles` no
 * `RolesGuard` e enxerga o dado da igreja como se fosse dela — e cada
 * requisição vira uma linha `support_access` em `audit_logs`. Quem está
 * operando precisa ver, sem procurar, que não está na própria conta.
 *
 * A sessão de suporte só entra por carga de página inteira (o `/suporte/sessao`
 * termina em `location.replace`), então basta ler o storage depois da
 * hidratação — não há transição de cliente que a ligue ou desligue no meio.
 */
export function SupportSessionBanner() {
  const isHydrated = useHydrated();

  const session = useMemo(() => {
    if (!isHydrated || !isSupportSession()) return null;
    return { tenantName: getSupportTenantName() };
  }, [isHydrated]);

  if (!session) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-burgundy px-4 py-1.5 text-center text-xs font-medium text-white"
    >
      <ShieldAlert size={14} strokeWidth={2} className="shrink-0" />
      <span>
        Sessão de suporte da plataforma
        {session.tenantName ? ` — ${session.tenantName}` : ""}. Toda ação fica
        registrada em auditoria.
      </span>
    </div>
  );
}
