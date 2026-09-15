"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type HealthStatus = "green" | "yellow" | "red";

interface HealthResponse {
  status: HealthStatus;
  last_meeting_at: string | null;
  days_since_last_meeting: number | null;
}

interface GroupHealthBadgeProps {
  groupId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOT_COLOR: Record<HealthStatus, string> = {
  green: "bg-teal",
  yellow: "bg-amber-500",
  red: "bg-crimson",
};

function tooltipFor(health: HealthResponse): string {
  if (health.days_since_last_meeting === null) {
    return "Nunca se reuniu";
  }
  const days = health.days_since_last_meeting;
  return `Última reunião há ${days} dia${days !== 1 ? "s" : ""}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

// Semáforo de saúde da célula (PROD-20, CEL20-04): indicador secundário
// dentro de uma tela que o usuário já acessa — em 403 (sem Premium), oculta
// silenciosamente em vez de mostrar `NoAccessState` (esse padrão é reservado
// para telas cheias, como a árvore genealógica).
export function GroupHealthBadge({ groupId }: GroupHealthBadgeProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // Sem estado de "oculto" separado: em 403 (sem Premium) ou qualquer outra
  // falha, `health` fica null e o componente não renderiza nada — mesmo
  // resultado de "ocultar silenciosamente", sem distinguir a causa.
  useEffect(() => {
    const signal = { cancelled: false };
    setHealth(null);
    api
      .get<HealthResponse>(`/small-groups/${groupId}/health`)
      .then(({ data }) => {
        if (signal.cancelled) return;
        setHealth(data);
      })
      .catch(() => {
        // silencioso de propósito — ver comentário acima do componente.
      });
    return () => {
      signal.cancelled = true;
    };
  }, [groupId]);

  if (!health) return null;

  return (
    <span
      role="status"
      title={tooltipFor(health)}
      aria-label={tooltipFor(health)}
      className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${DOT_COLOR[health.status]}`}
    />
  );
}
