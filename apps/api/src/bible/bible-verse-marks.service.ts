import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BibleVerseMark } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { BibleReaderService } from './bible-reader.service';
import { CreateBibleVerseMarkDto } from './dto/create-bible-verse-mark.dto';
import { UpdateBibleVerseMarkDto } from './dto/update-bible-verse-mark.dto';
import { ListBibleFeedQueryDto } from './dto/list-bible-feed-query.dto';

/**
 * Marcação de versículo + comentário, e o feed da congregação
 * (biblia-nvi-marcacoes-mobile, BIB-04 a BIB-10).
 *
 * Duas regras que valem para as quatro operações:
 *
 * 1. **A isolação por congregação é da RLS, não da query.** `findFeed` não
 *    filtra `congregation_id` manualmente — a policy de `020_rls_bible_verse_marks.sql`
 *    (AD-001) já garante que a conexão só enxerga a linha do próprio tenant
 *    e congregação, mesmo padrão de `PrayerRequestsService.findByGroup`
 *    (que confia na participação de grupo, não refiltra).
 * 2. **`can_delete` sai da view, não da adivinhação do front.** É `is_mine`
 *    OU um papel de moderação — o mesmo contrato de `PrayerRequestView`/
 *    `GroupMessageView.can_delete`.
 *
 * Moderação: `admin_congregation`, `pastor` e `tenant_admin` podem apagar o
 * comentário de qualquer pessoa da própria congregação (RLS ainda limita a
 * "da própria congregação" — moderador de uma não alcança a outra).
 * `deleted_by_person_id` fica preenchido só nesse caso — é o que distingue
 * "o autor tirou o próprio post" de "a liderança removeu".
 */

export const MODERATOR_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'];

export type BibleVerseMarkView = {
  id: string;
  book_code: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  comment: string;
  created_at: Date;
  updated_at: Date;
  person: { id: string; full_name: string };
  is_mine: boolean;
  can_delete: boolean;
  like_count: number;
  liked_by_me: boolean;
  reply_count: number;
};

export type BibleFeedPage = {
  items: BibleVerseMarkView[];
  nextCursor: string | null;
};

type MarkRow = BibleVerseMark & {
  person: { id: string; full_name: string };
  likes?: { id: string }[];
  _count?: { likes: number; replies: number };
};

/**
 * O que toda leitura de marcação traz junto: autor, contagem de curtidas e de
 * respostas vivas, e se quem pede já curtiu (`likes` filtrado pela própria
 * pessoa — no máximo uma linha, pelo `@@unique([mark_id, person_id])`).
 */
function markInclude(personId: string) {
  return {
    person: { select: { id: true, full_name: true } },
    likes: { where: { person_id: personId }, select: { id: true } },
    _count: { select: { likes: true, replies: { where: { deleted_at: null } } } },
  } as const;
}

@Injectable()
export class BibleVerseMarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bibleReader: BibleReaderService,
  ) {}

  async create(dto: CreateBibleVerseMarkDto, user: JwtPayload): Promise<BibleVerseMarkView> {
    const personId = await this.requirePerson(user);

    if (dto.verse_end < dto.verse_start) {
      throw new BadRequestException(
        'Intervalo inválido: verse_end não pode ser menor que verse_start',
      );
    }

    // Valida o capítulo (livro/capítulo existem) e o intervalo contra o
    // total de versículos — reaproveita `BibleReaderService` em vez de
    // duplicar a checagem: se o capítulo não existir ou não tiver
    // versículo suficiente, ele já lança 400/502 antes de qualquer gravação.
    const chapterView = await this.bibleReader.getChapter(dto.book_code, dto.chapter);
    if (dto.verse_end > chapterView.verses.length) {
      throw new BadRequestException(
        `Intervalo fora do capítulo: ${chapterView.book_code} ${chapterView.chapter} tem ${chapterView.verses.length} versículo(s)`,
      );
    }

    const mark = await this.prisma.client.bibleVerseMark.create({
      data: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        person_id: personId,
        book_code: chapterView.book_code,
        chapter: chapterView.chapter,
        verse_start: dto.verse_start,
        verse_end: dto.verse_end,
        comment: dto.comment,
      },
      include: markInclude(personId),
    });

    return this.toView(mark as MarkRow, personId, this.isModerator(user));
  }

  async findFeed(query: ListBibleFeedQueryDto, user: JwtPayload): Promise<BibleFeedPage> {
    const personId = await this.requirePerson(user);
    const isModerator = this.isModerator(user);

    const limit = query.limit;
    const cursor = query.before ? await this.requireCursor(query.before) : null;

    const rows = await this.prisma.client.bibleVerseMark.findMany({
      where: {
        deleted_at: null,
        ...(cursor ? this.olderThan(cursor) : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: markInclude(personId),
    });

    const has_more = rows.length > limit;
    const page = has_more ? rows.slice(0, limit) : rows;

    return {
      items: page.map((r) => this.toView(r as MarkRow, personId, isModerator)),
      nextCursor: has_more ? page[page.length - 1]!.id : null,
    };
  }

  /** Uma marcação só — é o que a tela de respostas e o push de resposta abrem. */
  async findOne(id: string, user: JwtPayload): Promise<BibleVerseMarkView> {
    const personId = await this.requirePerson(user);

    const mark = await this.prisma.client.bibleVerseMark.findFirst({
      where: { id, deleted_at: null },
      include: markInclude(personId),
    });
    if (!mark) throw new NotFoundException('Marcação não encontrada');

    return this.toView(mark as MarkRow, personId, this.isModerator(user));
  }

  async update(
    id: string,
    dto: UpdateBibleVerseMarkDto,
    user: JwtPayload,
  ): Promise<BibleVerseMarkView> {
    const personId = await this.requirePerson(user);

    const mark = await this.prisma.client.bibleVerseMark.findFirst({
      where: { id, deleted_at: null },
      select: { id: true, person_id: true },
    });
    if (!mark) throw new NotFoundException('Marcação não encontrada');

    if (mark.person_id !== personId) {
      throw new ForbiddenException('Só o autor pode editar o próprio comentário');
    }

    const updated = await this.prisma.client.bibleVerseMark.update({
      where: { id },
      data: { comment: dto.comment },
      include: markInclude(personId),
    });

    return this.toView(updated as MarkRow, personId, this.isModerator(user));
  }

  async remove(id: string, user: JwtPayload): Promise<{ id: string }> {
    const personId = await this.requirePerson(user);
    const isModerator = this.isModerator(user);

    const mark = await this.prisma.client.bibleVerseMark.findFirst({
      where: { id, deleted_at: null },
      select: { id: true, person_id: true },
    });
    if (!mark) throw new NotFoundException('Marcação não encontrada');

    const isAuthor = mark.person_id === personId;
    if (!isAuthor && !isModerator) {
      throw new ForbiddenException('Só o autor ou um moderador pode remover a marcação');
    }

    await this.prisma.client.bibleVerseMark.update({
      where: { id },
      data: {
        deleted_at: new Date(),
        // `null` quando o próprio autor apaga — só fica preenchido quando é
        // moderação de terceiro, e é essa distinção que separa "removi o meu"
        // de "a liderança removeu" (BIB-10).
        deleted_by_person_id: isAuthor ? null : personId,
      },
    });

    return { id };
  }

  /**
   * Resolve a pessoa do token. Diferente de `PrayerRequestsService`, não há
   * `GroupMembership` a checar — Bíblia é conteúdo de congregação inteira,
   * não de célula. A única porta é ter `congregation_id` resolvido no JWT: é
   * o que falta numa conta `platform_support` pura (spec.md, edge case).
   */
  async requirePerson(user: JwtPayload): Promise<string> {
    if (!user.congregation_id) {
      throw new ForbiddenException('Usuário sem congregação — recurso exclusivo de conta de igreja');
    }

    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: user.sub },
      select: { person_id: true },
    });
    if (!account?.person_id) throw new NotFoundException('Usuário sem vínculo de pessoa');

    return account.person_id;
  }

  isModerator(user: JwtPayload): boolean {
    return user.roles.some((role) => MODERATOR_ROLES.includes(role));
  }

  private async requireCursor(markId: string): Promise<{ id: string; created_at: Date }> {
    const cursor = await this.prisma.client.bibleVerseMark.findFirst({
      where: { id: markId },
      select: { id: true, created_at: true },
    });
    if (!cursor) throw new NotFoundException('Marcação do cursor não encontrada');
    return cursor;
  }

  private olderThan(cursor: { id: string; created_at: Date }) {
    return {
      OR: [
        { created_at: { lt: cursor.created_at } },
        { created_at: cursor.created_at, id: { lt: cursor.id } },
      ],
    };
  }

  private toView(row: MarkRow, personId: string, isModerator: boolean): BibleVerseMarkView {
    const is_mine = row.person_id === personId;
    return {
      id: row.id,
      book_code: row.book_code,
      chapter: row.chapter,
      verse_start: row.verse_start,
      verse_end: row.verse_end,
      comment: row.comment,
      created_at: row.created_at,
      updated_at: row.updated_at,
      person: row.person,
      is_mine,
      can_delete: is_mine || isModerator,
      like_count: row._count?.likes ?? 0,
      liked_by_me: (row.likes?.length ?? 0) > 0,
      reply_count: row._count?.replies ?? 0,
    };
  }
}
