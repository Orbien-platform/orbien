/**
 * Interface genérica do provedor de texto bíblico (biblia-nvi-marcacoes-mobile,
 * BIB-01).
 *
 * `BibleReaderService` (T9) só conhece esta interface — nunca o provedor
 * concreto (`ApiBibleTextProvider`, T8). É o que permite trocar de provedor
 * (API.Bible ou qualquer outro) sem tocar no service nem no controller, e o
 * que permite o teste de integração (T14) sobrescrever o provider por um
 * fake determinístico via `overrideProvider`, sem chave real.
 */

export type VerseText = {
  number: number;
  text: string;
};

export interface BibleTextProvider {
  getChapter(bookCode: string, chapter: number): Promise<VerseText[]>;
}

/** Token de injeção — a interface não existe em runtime, o Nest precisa de algo para casar o provider concreto. */
export const BIBLE_TEXT_PROVIDER = Symbol('BIBLE_TEXT_PROVIDER');
