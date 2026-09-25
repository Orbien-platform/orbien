// Nome do livro a partir do código (`JHN` → "João"). A API guarda e devolve
// só o código (`book_code`), e ele não diz nada a quem lê em português: a
// referência de uma marcação precisa ser "João 3:16", não "JHN 3:16".
//
// Uma busca por sessão do app: a lista canônica (`GET /bible/books`) não
// muda, então a promise fica em memória. Falhou, a cache é descartada e a
// próxima tela tenta de novo; enquanto isso, quem pediu o nome recebe o
// próprio código — a referência continua correta, só menos legível.
import { useEffect, useState } from "react";

import { getBooks } from "./bible-client";

let namesPromise: Promise<Map<string, string>> | null = null;

function loadBookNames(): Promise<Map<string, string>> {
  if (!namesPromise) {
    namesPromise = Promise.resolve()
      .then(() => getBooks())
      .then((books) => new Map(books.map((b) => [b.code, b.name])))
      .catch((err: unknown) => {
        namesPromise = null;
        throw err;
      });
  }
  return namesPromise;
}

/** Mapa `code → name`, ou `null` enquanto carrega (ou se falhou). */
export function useBookNames(): Map<string, string> | null {
  const [names, setNames] = useState<Map<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBookNames()
      .then((result) => {
        if (!cancelled) setNames(result);
      })
      .catch(() => {
        // Sem nome, a tela mostra o código — ver o cabeçalho.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return names;
}

/** "João 3:16" / "João 3:16-18" — mesmo formato no capítulo e no feed. */
export function formatVerseReference(
  names: Map<string, string> | null,
  bookCode: string,
  chapter: number,
  verseStart?: number,
  verseEnd?: number,
): string {
  const book = names?.get(bookCode) ?? bookCode;
  if (verseStart === undefined) return `${book} ${chapter}`;
  const range =
    verseEnd === undefined || verseEnd === verseStart ? `${verseStart}` : `${verseStart}-${verseEnd}`;
  return `${book} ${chapter}:${range}`;
}

/** Só para testes: zera a cache entre casos. */
export function resetBookNamesCache(): void {
  namesPromise = null;
}
