/**
 * Casa única do tipo do catálogo de repertório e dos helpers de exibição e
 * busca — consumida pelo painel de `/repertorio` e pelo seletor da ordem de
 * culto, para os dois não divergirem.
 */

import { formatInstant } from "@/lib/datetime";

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

/** Tom a exibir: o tom da música, ou o alternativo quando o principal é nulo. */
export function songKey(song: CatalogSong): string | null {
  return song.key ?? song.key_alt ?? null;
}
