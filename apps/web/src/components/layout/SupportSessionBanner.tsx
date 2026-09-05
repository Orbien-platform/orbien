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
 * A contagem regressiva existe porque esta sessão **não se renova**: o token de
 * `POST /auth/impersonate` vem sem refresh token, de propósito, e vale 5
 * minutos. Sem aviso, o fim chega como um 401 no meio de uma ação — o
 * middleware barra a navegação e a pessoa volta para o login sem entender o
 * que aconteceu. O relógio não muda a regra; só para de deixá-la invisível.
 */

/** Abaixo disto a faixa muda de tom e passa a se anunciar. */
const WARNING_THRESHOLD_MS = 60_000;

/** Segundos restantes como `m:ss`, ou `0:00` depois do fim. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function SupportSessionBanner() {
  const { user, logout } = useAuth();
  const expiresAt = user?.support_expires_at ?? null;
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (expiresAt === null) return;

    // Recalcula a partir do relógio a cada tique, em vez de subtrair 1000 do
    // estado: aba em segundo plano tem `setInterval` estrangulado pelo browser,
    // e um contador que decrementa cego atrasaria em relação ao token.
    const tick = () => setRemaining(expiresAt - Date.now());

    // O primeiro tique sai por timer, e não no corpo do effect: `Date.now()`
    // durante o render é impuro, e `setState` síncrono dentro do effect dispara
    // render em cascata — as duas coisas que o lint da base barra. O custo é um
    // frame sem relógio.
    const firstTick = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(firstTick);
      clearInterval(id);
    };
  }, [expiresAt]);

  if (!user?.support_session) return null;

  const isExpired = remaining !== null && remaining <= 0;
  const isWarning = remaining !== null && remaining <= WARNING_THRESHOLD_MS;

  return (
    <div
      role="status"
      // A faixa é silenciosa enquanto sobra tempo; perto do fim ela passa a se
      // anunciar por leitor de tela, que é quando a informação é urgente.
      aria-live={isWarning ? "assertive" : "off"}
      className={`flex items-center justify-center gap-3 px-4 py-1.5 text-center text-xs font-medium text-white ${
        isWarning ? "bg-red-700" : "bg-burgundy"
      }`}
    >
      <ShieldAlert size={14} strokeWidth={2} className="shrink-0" />
      <span>
        Sessão de suporte da plataforma
        {user.support_tenant_name ? ` — ${user.support_tenant_name}` : ""}. Toda
        ação fica registrada em auditoria.
      </span>
      {remaining !== null && (
        <span className="shrink-0 tabular-nums">
          {isExpired
            ? "Sessão expirada — faça login novamente."
            : `Expira em ${formatRemaining(remaining)}${
                isWarning ? " — conclua o que estiver fazendo." : ""
              }`}
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
