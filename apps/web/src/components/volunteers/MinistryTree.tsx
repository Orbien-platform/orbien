"use client";

import type { MinistryTreeNode } from "@/lib/ministryTree";

interface MinistryCounts {
  leaders: number;
  volunteers: number;
}

interface MinistryTreeProps {
  nodes: MinistryTreeNode[];
  counts: Record<string, MinistryCounts>;
  onSelect: (id: string) => void;
}

export function MinistryTree({ nodes, counts, onSelect }: MinistryTreeProps) {
  return (
    <div className="flex flex-col gap-2">
      {nodes.map((node) => (
        <MinistryTreeRow key={node.id} node={node} depth={0} counts={counts} onSelect={onSelect} />
      ))}
    </div>
  );
}

function MinistryTreeRow({
  node,
  depth,
  counts,
  onSelect,
}: {
  node: MinistryTreeNode;
  depth: number;
  counts: Record<string, MinistryCounts>;
  onSelect: (id: string) => void;
}) {
  const color = node.color ?? "#1E3A5F";
  const c = counts[node.id] ?? { leaders: 0, volunteers: 0 };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        style={{ marginLeft: depth * 24, borderLeftColor: color, borderLeftWidth: "4px" }}
        className="group flex items-center justify-between gap-4 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-3.5 text-left transition-shadow hover:shadow-md"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-ink transition-colors group-hover:text-navy dark:text-white">
              {node.name}
            </span>
            {node.description && (
              <span className="truncate text-xs text-stone">{node.description}</span>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3 text-xs text-stone">
          <span>{c.leaders} líder{c.leaders !== 1 ? "es" : ""}</span>
          <span>{c.volunteers} voluntário{c.volunteers !== 1 ? "s" : ""}</span>
        </div>
      </button>

      {node.children?.map((child) => (
        <MinistryTreeRow key={child.id} node={child} depth={depth + 1} counts={counts} onSelect={onSelect} />
      ))}
    </div>
  );
}
