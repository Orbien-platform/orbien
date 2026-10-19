"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SongVersion } from "@/lib/repertorio";

/** Estado do formulário de uma versão; texto puro, convertido em `versionFormToBody`. */
export interface VersionForm {
  label: string;
  key: string;
  bpm: string;
  link: string;
  youtubeLink: string;
  spotifyLink: string;
  cifraClubLink: string;
  notes: string;
}

export const DEFAULT_VERSION_LABEL = "Original";

export function emptyVersionForm(label = DEFAULT_VERSION_LABEL): VersionForm {
  return {
    label,
    key: "",
    bpm: "",
    link: "",
    youtubeLink: "",
    spotifyLink: "",
    cifraClubLink: "",
    notes: "",
  };
}

export function versionFormFrom(version: SongVersion): VersionForm {
  return {
    label: version.label,
    key: version.key ?? "",
    bpm: version.bpm != null ? String(version.bpm) : "",
    link: version.link ?? "",
    youtubeLink: version.youtube_link ?? "",
    spotifyLink: version.spotify_link ?? "",
    cifraClubLink: version.cifra_club_link ?? "",
    notes: version.notes ?? "",
  };
}

/** Campo vazio vira `undefined`: a API grava `null` e o JSON não carrega a chave. */
export function versionFormToBody(form: VersionForm) {
  return {
    label: form.label.trim(),
    key: form.key.trim() || undefined,
    bpm: form.bpm ? Number(form.bpm) : undefined,
    link: form.link.trim() || undefined,
    youtube_link: form.youtubeLink.trim() || undefined,
    spotify_link: form.spotifyLink.trim() || undefined,
    cifra_club_link: form.cifraClubLink.trim() || undefined,
    notes: form.notes.trim() || undefined,
  };
}

interface SongVersionFieldsProps {
  idPrefix: string;
  value: VersionForm;
  onChange: (next: VersionForm) => void;
  disabled?: boolean;
}

/** Campos de uma versão, compartilhados pelo cadastro do catálogo e pelo atalho do seletor. */
export function SongVersionFields({ idPrefix, value, onChange, disabled }: SongVersionFieldsProps) {
  function set<K extends keyof VersionForm>(field: K, next: VersionForm[K]) {
    onChange({ ...value, [field]: next });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-label`} className="text-xs">
          Nome da versão
        </Label>
        <Input
          id={`${idPrefix}-label`}
          value={value.label}
          onChange={(e) => set("label", e.target.value)}
          disabled={disabled}
          placeholder="Ex.: Original, Acústica, Ao vivo"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-key`} className="text-xs">
            Tom
          </Label>
          <Input
            id={`${idPrefix}-key`}
            value={value.key}
            onChange={(e) => set("key", e.target.value)}
            disabled={disabled}
            placeholder="Ex.: G"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-bpm`} className="text-xs">
            BPM
          </Label>
          <Input
            id={`${idPrefix}-bpm`}
            type="number"
            min={1}
            value={value.bpm}
            onChange={(e) => set("bpm", e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-youtube`} className="text-xs">
          Link do YouTube
        </Label>
        <Input
          id={`${idPrefix}-youtube`}
          value={value.youtubeLink}
          onChange={(e) => set("youtubeLink", e.target.value)}
          disabled={disabled}
          placeholder="https://youtube.com/watch?v=..."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-spotify`} className="text-xs">
          Link do Spotify
        </Label>
        <Input
          id={`${idPrefix}-spotify`}
          value={value.spotifyLink}
          onChange={(e) => set("spotifyLink", e.target.value)}
          disabled={disabled}
          placeholder="https://open.spotify.com/track/..."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-cifra`} className="text-xs">
          Link do Cifra Club
        </Label>
        <Input
          id={`${idPrefix}-cifra`}
          value={value.cifraClubLink}
          onChange={(e) => set("cifraClubLink", e.target.value)}
          disabled={disabled}
          placeholder="https://cifraclub.com.br/..."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-link`} className="text-xs">
          Outro link (opcional)
        </Label>
        <Input
          id={`${idPrefix}-link`}
          value={value.link}
          onChange={(e) => set("link", e.target.value)}
          disabled={disabled}
          placeholder="https://..."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-notes`} className="text-xs">
          Notas (opcional)
        </Label>
        <Input
          id={`${idPrefix}-notes`}
          value={value.notes}
          onChange={(e) => set("notes", e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
