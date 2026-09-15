"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { NoAccessState } from "@/components/ui/NoAccessState";
import { HEALTH_DOT_COLOR, type HealthStatus } from "@/lib/health";
import api, { isForbidden } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GenealogyNode {
  id: string;
  name: string;
  leader_person_name: string | null;
  generation: number;
  health_status: HealthStatus;
}

interface GenealogyTreeNode extends GenealogyNode {
  children: GenealogyTreeNode[];
}

interface GenealogyResponse {
  ancestors: GenealogyNode[];
  tree: GenealogyTreeNode | null;
}

interface GroupGenealogyTreeProps {
  groupId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function HealthDot({ status }: { status: HealthStatus }) {
  return (
    <span
      role="status"
      aria-label={`Saúde: ${status}`}
      className={`h-2 w-2 flex-shrink-0 rounded-full ${HEALTH_DOT_COLOR[status]}`}
    />
  );
}

function NodeRow({ node, indent = 0 }: { node: GenealogyTreeNode; indent?: number }) {
  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 text-sm text-ink dark:text-white"
        style={{ paddingLeft: `${indent * 16}px` }}
      >
        <HealthDot status={node.health_status} />
        <span className="font-medium">{node.name}</span>
        {node.leader_person_name && (
          <span className="text-xs text-stone">— {node.leader_person_name}</span>
        )}
      </div>
      {node.children.map((child) => (
        <NodeRow key={child.id} node={child} indent={indent + 1} />
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

// Árvore genealógica (PROD-20, CEL20-06): consome o novo shape de
// GET /small-groups/:id/hierarchy ({ ancestors, tree }), Premium — 403 vira
// NoAccessState de tela cheia (diferente do indicador secundário de
// GroupHealthBadge, que oculta silenciosamente).
export function GroupGenealogyTree({ groupId }: GroupGenealogyTreeProps) {
  const [data, setData] = useState<GenealogyResponse | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const signal = { cancelled: false };
    setIsLoading(true);
    setData(null);
    setAccessDenied(false);
    api
      .get<GenealogyResponse>(`/small-groups/${groupId}/hierarchy`)
      .then(({ data }) => {
        if (signal.cancelled) return;
        setData(data);
      })
      .catch((error) => {
        if (signal.cancelled) return;
        setAccessDenied(isForbidden(error));
      })
      .finally(() => {
        if (!signal.cancelled) setIsLoading(false);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [groupId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-stone" />
      </div>
    );
  }

  if (accessDenied) {
    return <NoAccessState resource="Árvore genealógica" />;
  }

  if (!data) {
    return (
      <p className="px-4 py-6 text-sm text-stone text-center">
        Não foi possível carregar a árvore genealógica.
      </p>
    );
  }

  const { ancestors, tree } = data;

  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      {ancestors.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-stone">Ancestrais</p>
          <div className="flex flex-col">
            {[...ancestors].reverse().map((node, index) => (
              <div
                key={node.id}
                className="flex items-center gap-2 py-1.5 text-sm text-ink dark:text-white"
                style={{ paddingLeft: `${index * 16}px` }}
              >
                <HealthDot status={node.health_status} />
                <span className="font-medium">{node.name}</span>
                {node.leader_person_name && (
                  <span className="text-xs text-stone">— {node.leader_person_name}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs text-stone">
          {ancestors.length > 0 ? "Esta célula e descendentes" : "Descendentes"}
        </p>
        {tree ? (
          <NodeRow node={tree} indent={ancestors.length} />
        ) : (
          <p className="text-sm text-stone">Célula raiz, sem descendentes.</p>
        )}
      </div>
    </div>
  );
}
