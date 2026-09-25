/**
 * Curtidas e respostas das marcações do feed da Bíblia. O que estes testes
 * seguram: a linha nova herda tenant/congregação da MARCAÇÃO (não do token),
 * curtir é idempotente, só o autor ou a moderação apaga resposta, e responder
 * avisa o autor da marcação — nunca quem respondeu a si mesmo.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BibleMarkInteractionsService } from './bible-mark-interactions.service';
import { BibleVerseMarksService } from './bible-verse-marks.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['member'],
  plan: 'starter',
};

const MARK = {
  id: 'm1',
  tenant_id: 't1',
  congregation_id: 'g1',
  person_id: 'author',
  book_code: 'JHN',
  chapter: 3,
  verse_start: 16,
  verse_end: 18,
};

function setup(opts: { personId?: string; moderator?: boolean } = {}) {
  const client = {
    bibleVerseMark: { findFirst: jest.fn().mockResolvedValue(MARK) },
    bibleVerseMarkLike: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(3),
    },
    bibleVerseMarkReply: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const marks = {
    requirePerson: jest.fn().mockResolvedValue(opts.personId ?? 'p1'),
    isModerator: jest.fn().mockReturnValue(opts.moderator ?? false),
  } as unknown as BibleVerseMarksService;
  const notifications = {
    sendPush: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<NotificationsService>;
  const service = new BibleMarkInteractionsService(
    { client } as unknown as PrismaService,
    marks,
    notifications,
  );
  return { client, notifications, service };
}

describe('BibleMarkInteractionsService', () => {
  describe('curtidas', () => {
    it('curtir grava com tenant/congregação da marcação, ignora duplicata e devolve a contagem', async () => {
      const { client, service } = setup();

      await expect(service.like('m1', USER)).resolves.toEqual({ liked: true, like_count: 3 });
      expect(client.bibleVerseMarkLike.createMany).toHaveBeenCalledWith({
        data: [{ tenant_id: 't1', congregation_id: 'g1', mark_id: 'm1', person_id: 'p1' }],
        skipDuplicates: true,
      });
    });

    it('descurtir apaga só a curtida da própria pessoa', async () => {
      const { client, service } = setup();

      await expect(service.unlike('m1', USER)).resolves.toEqual({ liked: false, like_count: 3 });
      expect(client.bibleVerseMarkLike.deleteMany).toHaveBeenCalledWith({
        where: { mark_id: 'm1', person_id: 'p1' },
      });
    });

    it('marcação apagada ou de outra congregação (a RLS esconde) dá 404', async () => {
      const { client, service } = setup();
      client.bibleVerseMark.findFirst.mockResolvedValue(null);

      await expect(service.like('m1', USER)).rejects.toBeInstanceOf(NotFoundException);
      expect(client.bibleVerseMarkLike.createMany).not.toHaveBeenCalled();
    });
  });

  describe('respostas', () => {
    const REPLY_ROW = {
      id: 'r1',
      mark_id: 'm1',
      person_id: 'p1',
      comment: 'Amém, isso me tocou também.',
      created_at: new Date('2026-09-25T10:00:00Z'),
      person: { id: 'p1', full_name: 'Ana' },
    };

    it('responder grava na congregação da marcação e avisa o autor por push', async () => {
      const { client, notifications, service } = setup();
      client.bibleVerseMarkReply.create.mockResolvedValue(REPLY_ROW);

      const view = await service.createReply('m1', { comment: REPLY_ROW.comment }, USER);

      expect(client.bibleVerseMarkReply.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            tenant_id: 't1',
            congregation_id: 'g1',
            mark_id: 'm1',
            person_id: 'p1',
            comment: REPLY_ROW.comment,
          },
        }),
      );
      expect(view).toMatchObject({ id: 'r1', is_mine: true, can_delete: true });
      expect(notifications.sendPush).toHaveBeenCalledWith({
        tenantId: 't1',
        congregationId: 'g1',
        contentPostId: null,
        title: 'Ana respondeu seu comentário em João 3:16-18',
        body: REPLY_ROW.comment,
        filters: [{ field: 'tag', key: 'person_id', relation: '=', value: 'author' }],
        data: { type: 'bible_mark_reply', bible_mark_id: 'm1' },
      });
    });

    it('o autor respondendo à própria marcação não recebe push', async () => {
      const { client, notifications, service } = setup({ personId: 'author' });
      client.bibleVerseMarkReply.create.mockResolvedValue({ ...REPLY_ROW, person_id: 'author' });

      await service.createReply('m1', { comment: 'Complementando.' }, USER);

      expect(notifications.sendPush).not.toHaveBeenCalled();
    });

    it('push falhando não derruba a resposta', async () => {
      const { client, notifications, service } = setup();
      client.bibleVerseMarkReply.create.mockResolvedValue(REPLY_ROW);
      notifications.sendPush.mockRejectedValue(new Error('OneSignal fora'));

      await expect(
        service.createReply('m1', { comment: REPLY_ROW.comment }, USER),
      ).resolves.toMatchObject({ id: 'r1' });
    });

    it('lista em ordem de chegada, só as vivas, com can_delete resolvido', async () => {
      const { client, service } = setup({ moderator: true });
      client.bibleVerseMarkReply.findMany.mockResolvedValue([
        { ...REPLY_ROW, person_id: 'outra', person: { id: 'outra', full_name: 'Bia' } },
      ]);

      const list = await service.listReplies('m1', USER);

      expect(client.bibleVerseMarkReply.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { mark_id: 'm1', deleted_at: null },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        }),
      );
      expect(list[0]).toMatchObject({ is_mine: false, can_delete: true });
    });

    it('o autor apaga a própria resposta sem marcar moderação', async () => {
      const { client, service } = setup();
      client.bibleVerseMarkReply.findFirst.mockResolvedValue({ id: 'r1', person_id: 'p1' });

      await service.removeReply('m1', 'r1', USER);

      expect(client.bibleVerseMarkReply.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { deleted_at: expect.any(Date), deleted_by_person_id: null },
      });
    });

    it('moderador apaga a de outra pessoa, e fica registrado quem apagou', async () => {
      const { client, service } = setup({ moderator: true });
      client.bibleVerseMarkReply.findFirst.mockResolvedValue({ id: 'r1', person_id: 'outra' });

      await service.removeReply('m1', 'r1', USER);

      expect(client.bibleVerseMarkReply.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { deleted_at: expect.any(Date), deleted_by_person_id: 'p1' },
      });
    });

    it('quem não é autor nem moderador não apaga', async () => {
      const { client, service } = setup();
      client.bibleVerseMarkReply.findFirst.mockResolvedValue({ id: 'r1', person_id: 'outra' });

      await expect(service.removeReply('m1', 'r1', USER)).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.bibleVerseMarkReply.update).not.toHaveBeenCalled();
    });
  });
});
