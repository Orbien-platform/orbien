/**
 * Casa única do tipo do catálogo de repertório e dos helpers de exibição e
 * busca — consumida pelo painel de `/repertorio` e pelo seletor da ordem de
 * culto, para os dois não divergirem.
 */

import { formatInstant } from "@/lib/datetime";

/** Uma versão da música: tudo que, na música, não é o título. */
export interface SongVersion {
  id: string;
  label: string;
  key: string | null;
  bpm: number | null;
  link: string | null;
  youtube_link: string | null;
  spotify_link: string | null;
  cifra_club_link: string | null;
  notes: string | null;
  last_played_at: string | null;
}

export interface CatalogSong {
  id: string;
  title: string;
  last_played_at: string | null;
  versions: SongVersion[];
}

export function fmtLastPlayed(iso: string | null): string {
  if (!iso) return "nunca tocada";
  return formatInstant(iso, {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

/** Minúsculas e sem diacríticos, para "Orações" e "oracoes" colidirem na busca. */
export function normalizeForSearch(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Termo vazio ou só com espaço casa com tudo — a lista volta ao estado não filtrado. */
export function matchesSong(song: CatalogSong, term: string): boolean {
  const needle = normalizeForSearch(term).trim();
  if (!needle) return true;
  return normalizeForSearch(song.title).includes(needle);
}

/** "Acústica · Tom G · 76 BPM" — o que identifica a versão numa lista. */
export function versionSummary(version: SongVersion): string {
  return [
    version.label,
    version.key ? `Tom ${version.key}` : null,
    version.bpm != null ? `${version.bpm} BPM` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
