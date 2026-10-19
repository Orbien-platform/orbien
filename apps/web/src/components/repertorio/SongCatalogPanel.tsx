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
import { fmtLastPlayed, type CatalogSong, type SongVersion } from "@/lib/repertorio";
import {
  SongVersionFields,
  emptyVersionForm,
  versionFormFrom,
  versionFormToBody,
  type VersionForm,
} from "./SongVersionFields";

// Os tipos moram em `@/lib/repertorio`; reexportados aqui para os consumidores
// que já os importavam deste módulo.
export type { CatalogSong, SongVersion };

/** O que o formulário está fazendo: cadastrar música, renomeá-la ou mexer numa versão. */
type FormMode =
  | { kind: "new-song" }
  | { kind: "rename"; song: CatalogSong }
  | { kind: "new-version"; song: CatalogSong }
  | { kind: "edit-version"; song: CatalogSong; version: SongVersion };

const FORM_COPY: Record<FormMode["kind"], { title: string; description: string; submit: string }> = {
  "new-song": {
    title: "Nova música",
    description: "O título é da música. Tom, bpm e links ficam na versão — a música pode ter várias.",
    submit: "Criar",
  },
  rename: { title: "Renomear música", description: "As versões continuam como estão.", submit: "Salvar" },
  "new-version": {
    title: "Nova versão",
    description: "Cada versão tem o seu tom, bpm e links.",
    submit: "Criar versão",
  },
  "edit-version": {
    title: "Editar versão",
    description: "Setlists já montadas guardam o que foi escolhido na época.",
    submit: "Salvar",
  },
};

function VersionLinks({ version }: { version: SongVersion }) {
  const links = [
    { href: version.youtube_link, label: "YouTube" },
    { href: version.spotify_link, label: "Spotify" },
    { href: version.cifra_club_link, label: "Cifra Club" },
  ].filter((l) => l.href);
  if (links.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href as string}
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal hover:underline"
        >
          {l.label}
        </a>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SongCatalogPanel({ canEdit }: { canEdit: boolean }) {
  const [songs, setSongs] = useState<CatalogSong[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Formulário (música nova, renomear, versão nova ou editar versão)
  const [mode, setMode] = useState<FormMode | null>(null);
  const [title, setTitle] = useState("");
  const [versionForm, setVersionForm] = useState<VersionForm>(emptyVersionForm());
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

  function openForm(next: FormMode) {
    setMode(next);
    setTitle(next.kind === "rename" ? next.song.title : "");
    setVersionForm(
      next.kind === "edit-version"
        ? versionFormFrom(next.version)
        : emptyVersionForm(next.kind === "new-version" ? "" : undefined),
    );
    setFormError(null);
  }

  const showsTitle = mode?.kind === "new-song" || mode?.kind === "rename";
  const showsVersion = mode !== null && mode.kind !== "rename";

  async function submit() {
    if (!mode) return;
    if (showsTitle && !title.trim()) {
      setFormError("Dê um título à música.");
      return;
    }
    if (showsVersion && !versionForm.label.trim()) {
      setFormError("Dê um nome à versão.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const version = versionFormToBody(versionForm);
      if (mode.kind === "new-song") {
        await api.post("/songs", { title: title.trim(), version });
      } else if (mode.kind === "rename") {
        await api.patch(`/songs/${mode.song.id}`, { title: title.trim() });
      } else if (mode.kind === "new-version") {
        await api.post(`/songs/${mode.song.id}/versions`, version);
      } else {
        await api.patch(`/songs/${mode.song.id}/versions/${mode.version.id}`, version);
      }
      setMode(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(apiErrorMessage(err, "Não foi possível salvar."));
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

  async function removeVersion(song: CatalogSong, version: SongVersion) {
    setRemovingId(version.id);
    setError(null);
    try {
      await api.delete(`/songs/${song.id}/versions/${version.id}`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível excluir a versão."));
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
            onClick={() => openForm({ kind: "new-song" })}
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
            Cadastre uma música e, nela, as versões que vocês tocam, cada uma com seu tom,
            bpm e links, para escolher na setlist sem redigitar.
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
                  <p className="mt-0.5 text-xs text-stone">
                    Última vez tocada: {fmtLastPlayed(s.last_played_at)}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openForm({ kind: "new-version", song: s })}
                      aria-label={`Nova versão de ${s.title}`}
                      className="rounded-[6px] p-1.5 text-stone hover:bg-[var(--surface-subtle)]"
                    >
                      <Plus size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openForm({ kind: "rename", song: s })}
                      aria-label={`Renomear ${s.title}`}
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

              <ul className="mt-3 flex flex-col divide-y divide-[var(--border-default)] border-t border-[var(--border-default)]">
                {s.versions.map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-ink dark:text-white">{v.label}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone">
                        {v.key ? <span>Tom {v.key}</span> : null}
                        {v.bpm != null ? <span>{v.bpm} BPM</span> : null}
                        <span>Tocada em: {fmtLastPlayed(v.last_played_at)}</span>
                      </div>
                      <VersionLinks version={v} />
                    </div>
                    {canEdit ? (
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openForm({ kind: "edit-version", song: s, version: v })}
                          aria-label={`Editar versão ${v.label} de ${s.title}`}
                          className="rounded-[6px] p-1.5 text-stone hover:bg-[var(--surface-subtle)]"
                        >
                          <Pencil size={13} strokeWidth={1.5} />
                        </button>
                        {s.versions.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeVersion(s, v)}
                            disabled={removingId === v.id}
                            aria-label={`Excluir versão ${v.label} de ${s.title}`}
                            className="rounded-[6px] p-1.5 text-stone hover:bg-crimson-dim hover:text-crimson"
                          >
                            {removingId === v.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} strokeWidth={1.5} />
                            )}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* ── Formulário ── */}
      <Modal
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open) setMode(null);
        }}
        title={mode ? FORM_COPY[mode.kind].title : ""}
        description={mode ? FORM_COPY[mode.kind].description : ""}
        className="max-w-lg"
      >
        <div className="flex flex-col gap-4">
          {showsTitle ? (
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
          ) : null}

          {showsVersion ? (
            <SongVersionFields
              idPrefix="song-version"
              value={versionForm}
              onChange={setVersionForm}
              disabled={saving}
            />
          ) : null}

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
              onClick={() => setMode(null)}
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
              {mode ? FORM_COPY[mode.kind].submit : ""}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
