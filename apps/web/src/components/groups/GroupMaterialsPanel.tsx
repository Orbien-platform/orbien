"use client";

import { useEffect, useState } from "react";
import { BookOpen, ExternalLink, FileText, Loader2, Lock } from "lucide-react";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";
import { formatInstant } from "@/lib/datetime";

export interface GroupMaterial {
  id: string;
  title: string;
  source_type: "pdf" | "doc" | "rich_text";
  file_url: string | null;
  rich_content: string | null;
  visibility: "all" | "leaders_only";
  publish_at: string;
}

function isUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Materiais que alcançam o PG (`GET /small-groups/:id/materials`) — o que veio
 * da rede, de todas as redes ou direto para ele, independente de encontro. Os
 * materiais ligados a um encontro continuam na aba Reuniões.
 *
 * A API já aplica a regra de quem vê o quê: líder enxerga tudo, inclusive o
 * agendado e o "só líderes"; participante só o liberado. Por isso aqui não há
 * filtro, só rótulo — o líder precisa saber o que o participante ainda não vê.
 * O 403 é de quem abre a gaveta sem participar do grupo.
 */
export function GroupMaterialsPanel({ groupId }: { groupId: string }) {
  const [materials, setMaterials] = useState<GroupMaterial[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  // Instante em que a gaveta abriu: decide "libera em" x "liberado em".
  const [now] = useState(() => Date.now());
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== groupId;

  useEffect(() => {
    const signal = { cancelled: false };
    api
      .get<GroupMaterial[]>(`/small-groups/${groupId}/materials`)
      .then(({ data }) => {
        if (signal.cancelled) return;
        setMaterials(data);
        setForbidden(false);
        setError("");
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        setMaterials([]);
        if (isForbidden(err)) {
          setForbidden(true);
          setError("");
        } else {
          setForbidden(false);
          setError("Não foi possível carregar os materiais.");
        }
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(groupId);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [groupId]);

  if (loading) {
    return (
      <div className="flex justify-center py-10" data-testid="group-materials-loading">
        <Loader2 size={20} className="animate-spin text-stone" />
      </div>
    );
  }

  if (forbidden) return <NoAccessState resource="os materiais deste grupo" />;

  if (error) {
    return (
      <p role="alert" className="px-4 py-3 text-sm text-crimson">
        {error}
      </p>
    );
  }

  if (materials.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <BookOpen size={24} strokeWidth={1.5} className="text-stone" />
        <p className="text-sm text-stone">Nenhum material para este grupo.</p>
        <p className="max-w-sm text-xs text-stone">
          Os materiais enviados para a rede, para todas as redes ou para este PG aparecem aqui.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border-default)]">
      {materials.map((m) => {
        const scheduled = new Date(m.publish_at).getTime() > now;
        const href = m.file_url ?? (isUrl(m.rich_content) ? m.rich_content : null);
        return (
          <li key={m.id} className="flex flex-col gap-1.5 px-4 py-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-stone">
                {m.source_type === "rich_text" ? (
                  <BookOpen size={14} strokeWidth={1.5} />
                ) : (
                  <FileText size={14} strokeWidth={1.5} />
                )}
              </span>
              <span className="flex-1 text-sm font-medium text-ink dark:text-white">{m.title}</span>
              {href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Abrir ${m.title}`}
                  className="flex shrink-0 items-center gap-1 text-xs text-navy hover:underline dark:text-white"
                >
                  Abrir
                  <ExternalLink size={12} strokeWidth={1.5} />
                </a>
              )}
            </div>

            {!href && m.rich_content && (
              <p className="whitespace-pre-wrap text-sm text-stone">{m.rich_content}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone">
              <span>
                {scheduled ? "Libera em " : "Liberado em "}
                {formatInstant(m.publish_at, {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {m.visibility === "leaders_only" && (
                <span className="flex items-center gap-1">
                  <Lock size={11} strokeWidth={1.5} />
                  Somente líderes
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
