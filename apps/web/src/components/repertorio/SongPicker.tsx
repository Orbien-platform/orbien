"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Music, Plus } from "lucide-react";
import { SearchInput } from "@/components/ui/SearchInput";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { fmtLastPlayed, matchesSong, songKey, type CatalogSong } from "@/lib/repertorio";

interface SongPickerProps {
  /** Papel autorizado a escrever no catálogo — esconde o atalho de cadastro quando falso. */
  canCreate: boolean;
  onSelect: (song: CatalogSong) => void;
  onCancel?: () => void;
  /** Repassado ao SearchInput; os testes usam 0 para não depender do timer real. */
  debounce?: number;
}

export function SongPicker({ canCreate, onSelect, onCancel, debounce }: SongPickerProps) {
  const [songs, setSongs] = useState<CatalogSong[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const signal = { cancelled: false };
    api
      .get<CatalogSong[]>("/songs")
      .then(({ data }) => {
        if (signal.cancelled) return;
        setSongs(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        setError(apiErrorMessage(err, "Não foi possível carregar o catálogo."));
      })
      .finally(() => {
        if (!signal.cancelled) setLoaded(true);
      });
    return () => {
      signal.cancelled = true;
    };
  }, []);

  const visible = songs.filter((s) => matchesSong(s, term));

  if (creating) {
    return (
      <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--border-default)] p-3">
        <p className="text-sm font-medium text-ink dark:text-white">Nova música no repertório</p>
        <button
          type="button"
          onClick={() => setCreating(false)}
          className="self-start text-xs text-navy underline hover:no-underline dark:text-white"
        >
          Voltar para a busca
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--border-default)] p-3">
      <SearchInput
        placeholder="Buscar no repertório…"
        onSearch={setTerm}
        debounce={debounce}
      />

      {error ? (
        <div className="flex items-start gap-2 rounded-[8px] bg-crimson-dim p-2">
          <AlertTriangle size={14} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-crimson" />
          <p className="text-xs text-crimson">{error}</p>
        </div>
      ) : null}

      {!loaded && !error ? <Skeleton className="h-16 w-full rounded-[8px]" /> : null}

      {loaded && !error && songs.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <Music size={24} strokeWidth={1} className="text-stone" />
          <p className="text-xs text-stone">Nenhuma música no repertório desta congregação.</p>
        </div>
      ) : null}

      {loaded && !error && songs.length > 0 && visible.length === 0 ? (
        <p className="py-3 text-center text-xs text-stone">
          Nenhuma música encontrada para essa busca.
        </p>
      ) : null}

      {visible.length > 0 ? (
        <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
          {visible.map((s) => {
            const tom = songKey(s);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect(s)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-[8px] px-2 py-1.5 text-left hover:bg-[var(--surface-muted)]"
                >
                  <span className="w-full truncate text-sm text-ink dark:text-white">{s.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-stone">
                    {tom ? <span>Tom {tom}</span> : null}
                    {s.bpm != null ? <span>{s.bpm} BPM</span> : null}
                    <span>Última vez tocada: {fmtLastPlayed(s.last_played_at)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        {canCreate ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 text-xs text-navy hover:underline dark:text-white"
          >
            <Plus size={13} strokeWidth={1.5} />
            Cadastrar música no repertório
          </button>
        ) : null}
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto text-xs text-stone hover:underline"
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </div>
  );
}
