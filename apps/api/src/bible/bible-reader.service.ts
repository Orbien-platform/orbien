import { BadGatewayException, BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BIBLE_BOOKS, BibleBook } from './bible-books.constant';
import { BIBLE_TEXT_PROVIDER, BibleTextProvider, VerseText } from './bible-text-provider.interface';
import { BibleProviderError } from './api-bible-text.provider';

/** Única versão servida nesta feature (spec.md, Out of Scope). */
export const NVI_VERSION = 'NVI';

export type ChapterView = {
  book_code: string;
  chapter: number;
  verses: VerseText[];
};

/**
 * Leitor de capítulo da NVI, cache-first (biblia-nvi-marcacoes-mobile,
 * BIB-01/BIB-02/BIB-03; design.md, Approach A).
 *
 * A ordem importa: livro/capítulo são validados contra a lista canônica
 * (`bible-books.constant.ts`) ANTES de qualquer leitura — um capítulo fora
 * do total do livro nunca chega a consultar cache nem provedor. Só depois
 * disso o cache é lido; cache-miss é o único caminho que fala com
 * `BibleTextProvider` (T7/T8).
 *
 * O upsert do cache-miss é `INSERT ... ON CONFLICT DO NOTHING` (não
 * `Prisma.upsert`, que faria um `UPDATE` real na corrida): duas requisições
 * concorrentes pelo mesmo capítulo inédito não devem colidir em erro de
 * unique constraint nem reescrever a linha da outra — a leitura pós-upsert é
 * o que garante que as duas devolvem o mesmo texto persistido.
 */
@Injectable()
export class BibleReaderService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BIBLE_TEXT_PROVIDER) private readonly provider: BibleTextProvider,
  ) {}

  async getChapter(bookCode: string, chapter: number): Promise<ChapterView> {
    const book = this.requireValidBookChapter(bookCode, chapter);

    const cached = await this.prisma.client.bibleChapterCache.findUnique({
      where: {
        version_book_code_chapter: { version: NVI_VERSION, book_code: book.code, chapter },
      },
    });
    if (cached) {
      return { book_code: book.code, chapter, verses: cached.verses as unknown as VerseText[] };
    }

    let verses: VerseText[];
    try {
      verses = await this.provider.getChapter(book.code, chapter);
    } catch (err) {
      if (err instanceof BibleProviderError) {
        throw new BadGatewayException(
          'Não foi possível buscar o capítulo na API bíblica externa, e não há cache para servir',
        );
      }
      throw err;
    }

    await this.prisma.client.$executeRaw`
      INSERT INTO bible_chapter_cache (id, version, book_code, chapter, verses, fetched_at)
      VALUES (gen_random_uuid(), ${NVI_VERSION}, ${book.code}, ${chapter}, ${JSON.stringify(verses)}::jsonb, now())
      ON CONFLICT (version, book_code, chapter) DO NOTHING
    `;

    // Lê de volta em vez de confiar em `verses`: numa corrida, quem perdeu o
    // `INSERT` (o `DO NOTHING` pegou) precisa devolver o que a outra
    // requisição gravou, não a resposta (potencialmente distinta) que o
    // próprio provider lhe deu.
    const persisted = await this.prisma.client.bibleChapterCache.findUnique({
      where: {
        version_book_code_chapter: { version: NVI_VERSION, book_code: book.code, chapter },
      },
    });

    return {
      book_code: book.code,
      chapter,
      verses: (persisted?.verses as unknown as VerseText[]) ?? verses,
    };
  }

  private requireValidBookChapter(bookCode: string, chapter: number): BibleBook {
    const book = BIBLE_BOOKS.find((b) => b.code === bookCode.toUpperCase());
    if (!book) throw new BadRequestException('Livro bíblico inválido');

    if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) {
      throw new BadRequestException(
        `Capítulo inválido para ${book.name} (1 a ${book.chapters})`,
      );
    }

    return book;
  }
}
