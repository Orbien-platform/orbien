import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { NotificationsService } from '../content/notifications.service';
import { BibleVerseMarksService } from './bible-verse-marks.service';
import { BIBLE_BOOKS } from './bible-books.constant';
import { CreateBibleVerseMarkReplyDto } from './dto/create-bible-verse-mark-reply.dto';

/**
 * Curtidas e respostas das marcações do feed da Bíblia.
 *
 * As mesmas duas regras de `BibleVerseMarksService` valem aqui: quem isola
 * congregação é a RLS (`022_rls_bible_verse_mark_interactions.sql`), não a
 * query; e `can_delete` sai da view. A linha nova copia `tenant_id` e
 * `congregation_id` da MARCAÇÃO, não do token — a marcação já passou pela
 * RLS ao ser lida, então é a congregação dela que vale, e o `WITH CHECK`
 * confirma.
 *
 * Respostas são lista simples: sem resposta de resposta e sem edição. O autor
 * apaga a própria; a moderação (`MODERATOR_ROLES`) apaga qualquer uma da
 * congregação, com `deleted_by_person_id` preenchido só nesse caso.
 *
 * Responder avisa o autor da marcação por push — uma resposta é alguém
 * falando com ele. Curtida não avisa: seria ruído.
 */

const REPLIES_LIMIT = 200;
const PUSH_BODY_MAX = 120;

export type BibleMarkLikeState = { liked: boolean; like_count: number };

export type BibleMarkReplyView = {
  id: string;
  mark_id: string;
  comment: string;
  created_at: Date;
  person: { id: string; full_name: string };
  is_mine: boolean;
  can_delete: boolean;
};

type ReplyRow = {
  id: string;
  mark_id: string;
  person_id: string;
  comment: string;
  created_at: Date;
  person: { id: string; full_name: string };
};

const BOOK_NAMES = new Map(BIBLE_BOOKS.map((b) => [b.code, b.name]));

@Injectable()
export class BibleMarkInteractionsService {
  private readonly logger = new Logger(BibleMarkInteractionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly marks: BibleVerseMarksService,
    private readonly notifications: NotificationsService,
  ) {}

  async like(markId: string, user: JwtPayload): Promise<BibleMarkLikeState> {
    const personId = await this.marks.requirePerson(user);
    const mark = await this.requireMark(markId);

    // `skipDuplicates` torna curtir de novo um no-op, sem corrida entre dois
    // toques: quem garante "uma por pessoa" é o `@@unique`, não um SELECT antes.
    await this.prisma.client.bibleVerseMarkLike.createMany({
      data: [
        {
          tenant_id: mark.tenant_id,
          congregation_id: mark.congregation_id,
          mark_id: markId,
          person_id: personId,
        },
      ],
      skipDuplicates: true,
    });

    return { liked: true, like_count: await this.countLikes(markId) };
  }

  async unlike(markId: string, user: JwtPayload): Promise<BibleMarkLikeState> {
    const personId = await this.marks.requirePerson(user);
    await this.requireMark(markId);

    await this.prisma.client.bibleVerseMarkLike.deleteMany({
      where: { mark_id: markId, person_id: personId },
    });

    return { liked: false, like_count: await this.countLikes(markId) };
  }

  async listReplies(markId: string, user: JwtPayload): Promise<BibleMarkReplyView[]> {
    const personId = await this.marks.requirePerson(user);
    await this.requireMark(markId);
    const isModerator = this.marks.isModerator(user);

    const rows = await this.prisma.client.bibleVerseMarkReply.findMany({
      where: { mark_id: markId, deleted_at: null },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: REPLIES_LIMIT,
      include: { person: { select: { id: true, full_name: true } } },
    });

    return rows.map((r) => this.toView(r, personId, isModerator));
  }

  async createReply(
    markId: string,
    dto: CreateBibleVerseMarkReplyDto,
    user: JwtPayload,
  ): Promise<BibleMarkReplyView> {
    const personId = await this.marks.requirePerson(user);
    const mark = await this.requireMark(markId);

    const reply = await this.prisma.client.bibleVerseMarkReply.create({
      data: {
        tenant_id: mark.tenant_id,
        congregation_id: mark.congregation_id,
        mark_id: markId,
        person_id: personId,
        comment: dto.comment,
      },
      include: { person: { select: { id: true, full_name: true } } },
    });

    if (mark.person_id !== personId) {
      // Fora do caminho da resposta: push falhando não pode desfazer nem
      // atrasar o que a pessoa escreveu. Mesmo padrão do aviso de escala.
      this.notifyAuthor(mark, reply.person.full_name, dto.comment).catch((err: unknown) => {
        this.logger.error(`Falha ao avisar resposta na marcação ${markId}: ${String(err)}`);
      });
    }

    return this.toView(reply, personId, this.marks.isModerator(user));
  }

  async removeReply(markId: string, replyId: string, user: JwtPayload): Promise<{ id: string }> {
    const personId = await this.marks.requirePerson(user);
    const isModerator = this.marks.isModerator(user);

    const reply = await this.prisma.client.bibleVerseMarkReply.findFirst({
      where: { id: replyId, mark_id: markId, deleted_at: null },
      select: { id: true, person_id: true },
    });
    if (!reply) throw new NotFoundException('Resposta não encontrada');

    const isAuthor = reply.person_id === personId;
    if (!isAuthor && !isModerator) {
      throw new ForbiddenException('Só o autor ou um moderador pode remover a resposta');
    }

    await this.prisma.client.bibleVerseMarkReply.update({
      where: { id: replyId },
      data: {
        deleted_at: new Date(),
        deleted_by_person_id: isAuthor ? null : personId,
      },
    });

    return { id: replyId };
  }

  private async requireMark(markId: string) {
    const mark = await this.prisma.client.bibleVerseMark.findFirst({
      where: { id: markId, deleted_at: null },
      select: {
        id: true,
        tenant_id: true,
        congregation_id: true,
        person_id: true,
        book_code: true,
        chapter: true,
        verse_start: true,
        verse_end: true,
      },
    });
    if (!mark) throw new NotFoundException('Marcação não encontrada');
    return mark;
  }

  private countLikes(markId: string): Promise<number> {
    return this.prisma.client.bibleVerseMarkLike.count({ where: { mark_id: markId } });
  }

  private async notifyAuthor(
    mark: Awaited<ReturnType<BibleMarkInteractionsService['requireMark']>>,
    replierName: string,
    comment: string,
  ): Promise<void> {
    const book = BOOK_NAMES.get(mark.book_code) ?? mark.book_code;
    const range =
      mark.verse_start === mark.verse_end
        ? `${mark.verse_start}`
        : `${mark.verse_start}-${mark.verse_end}`;
    const excerpt =
      comment.length > PUSH_BODY_MAX ? `${comment.slice(0, PUSH_BODY_MAX - 1)}…` : comment;

    await this.notifications.sendPush({
      tenantId: mark.tenant_id,
      congregationId: mark.congregation_id,
      contentPostId: null,
      title: `${replierName} respondeu seu comentário em ${book} ${mark.chapter}:${range}`,
      body: excerpt,
      // Endereçado ao autor, pela tag `person_id` — mesmo filtro do aviso de
      // escala (`CelebrationAssignmentService`).
      filters: [{ field: 'tag', key: 'person_id', relation: '=', value: mark.person_id }],
      data: { type: 'bible_mark_reply', bible_mark_id: mark.id },
    });
  }

  private toView(row: ReplyRow, personId: string, isModerator: boolean): BibleMarkReplyView {
    const is_mine = row.person_id === personId;
    return {
      id: row.id,
      mark_id: row.mark_id,
      comment: row.comment,
      created_at: row.created_at,
      person: row.person,
      is_mine,
      can_delete: is_mine || isModerator,
    };
  }
}
