// Tipos puros da Bíblia NVI (biblia-nvi-marcacoes-mobile, T15) — espelham
// exatamente o design.md ("Novos tipos no mobile") e o shape real dos
// endpoints (`apps/api/src/bible/bible-reader.controller.ts`,
// `apps/api/src/bible/bible-verse-marks.controller.ts`), sem importar
// código do Nest. Mesmo princípio de reuso mínimo de `content/types.ts`.

export type BibleTestament = "AT" | "NT";

export interface BibleBook {
  code: string;
  name: string;
  testament: BibleTestament;
  chapters: number;
}

export interface BibleVerse {
  number: number;
  text: string;
}

export interface BibleChapter {
  book_code: string;
  chapter: number;
  verses: BibleVerse[];
}

export interface BibleVerseMark {
  id: string;
  book_code: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  comment: string;
  created_at: string;
  updated_at: string;
  person: { id: string; full_name: string } | null;
  is_mine: boolean;
  can_delete: boolean;
}

export interface BibleFeedPage {
  items: BibleVerseMark[];
  nextCursor: string | null;
}

/** Corpo de `POST /bible/marks` — espelha `CreateBibleVerseMarkDto`. */
export interface CreateMarkInput {
  book_code: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  comment: string;
}
