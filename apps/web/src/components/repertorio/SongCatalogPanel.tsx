"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Music, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CatalogSong {
  id: string;
  title: string;
  key: string | null;
  key_alt: string | null;
  bpm: number | null;
  link: string | null;
  youtube_link: string | null;
  spotify_link: string | null;
  cifra_club_link: string | null;
  notes: string | null;
  last_played_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtLastPlayed(iso: string | null): string {
  if (!iso) return "nunca tocada";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SongCatalogPanel({ canEdit }: { canEdit: boolean }) {
  const [songs, setSongs] = useState<CatalogSong[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Formulário (criar ou editar)
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogSong | null>(null);
  const [title, setTitle] = useState("");
  const [key, setKey] = useState("");
  const [keyAlt, setKeyAlt] = useState("");
  const [bpm, setBpm] = useState("");
  const [link, setLink] = useState("");
  const [youtubeLink, setYoutubeLink] = useState("");
  const [spotifyLink, setSpotifyLink] = useState("");
  const [cifraClubLink, setCifraClubLink] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<string | null>(null);

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
        setError(apiErrorMessage(err, "Não foi possível carregar o repertório."));
      })
      .finally(() => {
        if (!signal.cancelled) setLoaded(true);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [reloadKey]);

  function openCreate() {
    setEditing(null);
    setTitle("");
    setKey("");
    setKeyAlt("");
    setBpm("");
    setLink("");
    setYoutubeLink("");
    setSpotifyLink("");
    setCifraClubLink("");
    setNotes("");
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(s: CatalogSong) {
    setEditing(s);
    setTitle(s.title);
    setKey(s.key ?? "");
    setKeyAlt(s.key_alt ?? "");
    setBpm(s.bpm != null ? String(s.bpm) : "");
    setLink(s.link ?? "");
    setYoutubeLink(s.youtube_link ?? "");
    setSpotifyLink(s.spotify_link ?? "");
    setCifraClubLink(s.cifra_club_link ?? "");
    setNotes(s.notes ?? "");
    setFormError(null);
    setFormOpen(true);
  }

  async function submit() {
    if (!title.trim()) {
      setFormError("Dê um título à música.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const body = {
        title: title.trim(),
        key: key.trim() || undefined,
        key_alt: keyAlt.trim() || undefined,
        bpm: bpm ? Number(bpm) : undefined,
        link: link.trim() || undefined,
        youtube_link: youtubeLink.trim() || undefined,
        spotify_link: spotifyLink.trim() || undefined,
        cifra_club_link: cifraClubLink.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      if (editing) {
        await api.patch(`/songs/${editing.id}`, body);
      } else {
        await api.post("/songs", body);
      }
      setFormOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(apiErrorMessage(err, "Não foi possível salvar a música."));
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: CatalogSong) {
    setRemovingId(s.id);
    setError(null);
    try {
      await api.delete(`/songs/${s.id}`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível excluir a música."));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-stone">
          {loaded
            ? `${songs.length} música${songs.length !== 1 ? "s" : ""} no repertório`
            : "Carregando…"}
        </p>
        {canEdit ? (
          <Button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90"
          >
            <Plus size={14} strokeWidth={1.5} />
            Nova música
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-[8px] bg-crimson-dim p-3">
          <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-crimson" />
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            <p className="text-sm text-crimson">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setLoaded(false);
                setReloadKey((k) => k + 1);
              }}
              className="flex items-center gap-1.5 text-xs text-crimson underline hover:no-underline"
            >
              <RotateCcw size={12} strokeWidth={1.5} />
              Tentar novamente
            </button>
          </div>
        </div>
      ) : null}

      {!loaded ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-[12px]" />
          ))}
        </div>
      ) : songs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Music size={32} strokeWidth={1} className="text-stone" />
          <p className="text-sm text-stone">Nenhuma música cadastrada.</p>
          <p className="max-w-sm text-xs text-stone">
            Cadastre uma música com tom, bpm e link padrão para reaproveitar em qualquer
            setlist futura, sem redigitar.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {songs.map((s) => (
            <div
              key={s.id}
              className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink dark:text-white">
                    {s.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone">
                    {s.key ? <span>Tom {s.key}</span> : null}
                    {s.key_alt ? <span>Tom alt. {s.key_alt}</span> : null}
                    {s.bpm != null ? <span>{s.bpm} BPM</span> : null}
                    <span>Última vez tocada: {fmtLastPlayed(s.last_played_at)}</span>
                  </div>
                  {s.youtube_link || s.spotify_link || s.cifra_club_link ? (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                      {s.youtube_link ? (
                        <a
                          href={s.youtube_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-teal hover:underline"
                        >
                          YouTube
                        </a>
                      ) : null}
                      {s.spotify_link ? (
                        <a
                          href={s.spotify_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-teal hover:underline"
                        >
                          Spotify
                        </a>
                      ) : null}
                      {s.cifra_club_link ? (
                        <a
                          href={s.cifra_club_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-teal hover:underline"
                        >
                          Cifra Club
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      aria-label={`Editar ${s.title}`}
                      className="rounded-[6px] p-1.5 text-stone hover:bg-[var(--surface-subtle)]"
                    >
                      <Pencil size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s)}
                      disabled={removingId === s.id}
                      aria-label={`Excluir ${s.title}`}
                      className="rounded-[6px] p-1.5 text-stone hover:bg-crimson-dim hover:text-crimson"
                    >
                      {removingId === s.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} strokeWidth={1.5} />
                      )}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Formulário ── */}
      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? "Editar música" : "Nova música"}
        description="Tom, bpm e link padrão ficam salvos para reaproveitar em qualquer setlist."
        className="max-w-lg"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="song-title" className="text-xs">
              Título
            </Label>
            <Input
              id="song-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
              placeholder="Ex.: Grande é o Senhor"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="song-key" className="text-xs">
                Tom
              </Label>
              <Input
                id="song-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={saving}
                placeholder="Ex.: G"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="song-key-alt" className="text-xs">
                Tom alternativo
              </Label>
              <Input
                id="song-key-alt"
                value={keyAlt}
                onChange={(e) => setKeyAlt(e.target.value)}
                disabled={saving}
                placeholder="Ex.: A"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="song-bpm" className="text-xs">
                BPM
              </Label>
              <Input
                id="song-bpm"
                type="number"
                min={1}
                value={bpm}
                onChange={(e) => setBpm(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
          <p className="text-xs text-stone">
            Dois tons cadastrados dão para escolher, ao montar a escala, qual versão fica
            confirmada para aquele culto.
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="song-youtube-link" className="text-xs">
              Link do YouTube
            </Label>
            <Input
              id="song-youtube-link"
              value={youtubeLink}
              onChange={(e) => setYoutubeLink(e.target.value)}
              disabled={saving}
              placeholder="https://youtube.com/watch?v=..."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="song-spotify-link" className="text-xs">
              Link do Spotify
            </Label>
            <Input
              id="song-spotify-link"
              value={spotifyLink}
              onChange={(e) => setSpotifyLink(e.target.value)}
              disabled={saving}
              placeholder="https://open.spotify.com/track/..."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="song-cifra-club-link" className="text-xs">
              Link do Cifra Club
            </Label>
            <Input
              id="song-cifra-club-link"
              value={cifraClubLink}
              onChange={(e) => setCifraClubLink(e.target.value)}
              disabled={saving}
              placeholder="https://cifraclub.com.br/..."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="song-link" className="text-xs">
              Outro link (opcional)
            </Label>
            <Input
              id="song-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              disabled={saving}
              placeholder="https://..."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="song-notes" className="text-xs">
              Notas (opcional)
            </Label>
            <Input
              id="song-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
            />
          </div>

          {formError ? (
            <div className="flex items-start gap-2 rounded-[8px] bg-crimson-dim p-3">
              <AlertTriangle
                size={15}
                strokeWidth={1.5}
                className="mt-0.5 flex-shrink-0 text-crimson"
              />
              <p className="text-sm text-crimson">{formError}</p>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              disabled={saving}
              className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
            >
              Cancelar
            </button>
            <Button
              type="button"
              onClick={submit}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {editing ? "Salvar" : "Criar"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
