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

/**
 * Cadastro de música do repertório sem sair da tela. Interno ao seletor: o
 * CRUD do catálogo (editar, remover) continua só em `/repertorio`.
 */
function SongQuickCreate({
  onCreated,
  onCancel,
}: {
  onCreated: (song: CatalogSong) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [key, setKey] = useState("");
  const [keyAlt, setKeyAlt] = useState("");
  const [bpm, setBpm] = useState("");
  const [link, setLink] = useState("");
  const [youtubeLink, setYoutubeLink] = useState("");
  const [spotifyLink, setSpotifyLink] = useState("");
  const [cifraClubLink, setCifraClubLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) {
      setError("Dê um título à música.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post<CatalogSong>("/songs", {
        title: title.trim(),
        key: key.trim() || undefined,
        key_alt: keyAlt.trim() || undefined,
        bpm: bpm ? Number(bpm) : undefined,
        link: link.trim() || undefined,
        youtube_link: youtubeLink.trim() || undefined,
        spotify_link: spotifyLink.trim() || undefined,
        cifra_club_link: cifraClubLink.trim() || undefined,
      });
      // `POST /songs` não devolve `last_played_at` — música recém-criada nunca
      // foi tocada, então o valor correto é null, não `undefined` vazando.
      onCreated({ ...data, last_played_at: null });
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

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="picker-song-key" className="text-xs">Tom</Label>
          <Input id="picker-song-key" value={key} onChange={(e) => setKey(e.target.value)} disabled={saving} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="picker-song-key-alt" className="text-xs">Tom alternativo</Label>
          <Input id="picker-song-key-alt" value={keyAlt} onChange={(e) => setKeyAlt(e.target.value)} disabled={saving} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="picker-song-bpm" className="text-xs">BPM</Label>
          <Input
            id="picker-song-bpm"
            type="number"
            min={1}
            value={bpm}
            onChange={(e) => setBpm(e.target.value)}
            disabled={saving}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="picker-song-link" className="text-xs">Link</Label>
          <Input id="picker-song-link" value={link} onChange={(e) => setLink(e.target.value)} disabled={saving} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="picker-song-youtube" className="text-xs">YouTube</Label>
          <Input
            id="picker-song-youtube"
            value={youtubeLink}
            onChange={(e) => setYoutubeLink(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="picker-song-spotify" className="text-xs">Spotify</Label>
          <Input
            id="picker-song-spotify"
            value={spotifyLink}
            onChange={(e) => setSpotifyLink(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="picker-song-cifra" className="text-xs">Cifra Club</Label>
          <Input
            id="picker-song-cifra"
            value={cifraClubLink}
            onChange={(e) => setCifraClubLink(e.target.value)}
            disabled={saving}
          />
        </div>
      </div>

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
