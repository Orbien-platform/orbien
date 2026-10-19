"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Music, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/SearchInput";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import {
  fmtLastPlayed,
  matchesSong,
  versionSummary,
  type CatalogSong,
  type SongVersion,
} from "@/lib/repertorio";
import {
  SongVersionFields,
  emptyVersionForm,
  versionFormToBody,
  type VersionForm,
} from "./SongVersionFields";

interface SongPickerProps {
  /** Papel autorizado a escrever no catálogo — esconde o atalho de cadastro quando falso. */
  canCreate: boolean;
  /** Escolher é escolher uma versão: a setlist grava qual delas vai tocar. */
  onSelect: (song: CatalogSong, version: SongVersion) => void;
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
    return <SongQuickCreate onCreated={onSelect} onCancel={() => setCreating(false)} />;
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
          {visible.map((s) => (
            <li key={s.id}>
              {s.versions.length === 1 ? (
                <VersionButton song={s} version={s.versions[0]} onSelect={onSelect} showTitle />
              ) : (
                <div className="flex flex-col">
                  <span className="truncate px-2 pt-1.5 text-sm text-ink dark:text-white">
                    {s.title}
                  </span>
                  <ul className="flex flex-col gap-0.5 pl-3">
                    {s.versions.map((v) => (
                      <li key={v.id}>
                        <VersionButton song={s} version={v} onSelect={onSelect} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
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

function VersionButton({
  song,
  version,
  onSelect,
  showTitle = false,
}: {
  song: CatalogSong;
  version: SongVersion;
  onSelect: (song: CatalogSong, version: SongVersion) => void;
  showTitle?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(song, version)}
      aria-label={`${song.title} — ${version.label}`}
      className="flex w-full flex-col items-start gap-0.5 rounded-[8px] px-2 py-1.5 text-left hover:bg-[var(--surface-muted)]"
    >
      {showTitle ? (
        <span className="w-full truncate text-sm text-ink dark:text-white">{song.title}</span>
      ) : null}
      <span className="flex flex-wrap items-center gap-x-2 text-xs text-stone">
        <span className={showTitle ? undefined : "text-sm text-ink dark:text-white"}>
          {showTitle ? versionSummary(version) : version.label}
        </span>
        {!showTitle && version.key ? <span>Tom {version.key}</span> : null}
        {!showTitle && version.bpm != null ? <span>{version.bpm} BPM</span> : null}
        <span>Tocada em: {fmtLastPlayed(version.last_played_at)}</span>
      </span>
    </button>
  );
}

/**
 * Cadastro de música do repertório sem sair da tela. Interno ao seletor: o
 * CRUD do catálogo (editar, remover) continua só em `/repertorio`.
 */
function SongQuickCreate({
  onCreated,
  onCancel,
}: {
  onCreated: (song: CatalogSong, version: SongVersion) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [versionForm, setVersionForm] = useState<VersionForm>(emptyVersionForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) {
      setError("Dê um título à música.");
      return;
    }
    if (!versionForm.label.trim()) {
      setError("Dê um nome à versão.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post<Omit<CatalogSong, "last_played_at">>("/songs", {
        title: title.trim(),
        version: versionFormToBody(versionForm),
      });
      // `POST /songs` não devolve `last_played_at` — música recém-criada nunca
      // foi tocada, então o valor correto é null, não `undefined` vazando.
      const versions = data.versions.map((v) => ({ ...v, last_played_at: null }));
      onCreated({ ...data, last_played_at: null, versions }, versions[0]);
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível salvar a música."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--border-default)] p-3">
      <p className="text-sm font-medium text-ink dark:text-white">Nova música no repertório</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="picker-song-title" className="text-xs">Título</Label>
        <Input
          id="picker-song-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
          placeholder="Ex.: Grande é o Senhor"
        />
      </div>

      <SongVersionFields
        idPrefix="picker-song"
        value={versionForm}
        onChange={setVersionForm}
        disabled={saving}
      />

      {error ? <p className="text-xs text-crimson">{error}</p> : null}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={saving}
          className="rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90"
        >
          {saving ? "Salvando…" : "Criar e usar"}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-xs text-stone hover:underline"
        >
          Voltar para a busca
        </button>
      </div>
    </div>
  );
}
