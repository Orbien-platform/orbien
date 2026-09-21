/**
 * `BibleVerseMarksService` é o núco de BIB-04 a BIB-10: criar marcação,
 * paginar o feed, editar/apagar a própria, e moderar a de outra pessoa.
 *
 * O intervalo de versículos é validado contra o CAPÍTULO RESOLVIDO
 * (`BibleReaderService.getChapter`, mockado aqui), não contra um número
 * mágico — é o que prova que "fora do total de versículos" reage ao
 * capítulo pedido, não a uma constante hardcoded.
 */
import { BadGatewayException, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BibleVerseMarksService } from './bible-verse-marks.service';
import { PrismaService } from '../prisma/prisma.service';
import { BibleReaderService } from './bible-reader.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['member'],
  plan: 'starter',
};

const CHAPTER_VIEW = {
  book_code: 'JHN',
  chapter: 3,
  verses: Array.from({ length: 36 }, (_, i) => ({ number: i + 1, text: `versículo ${i + 1}` })),
};

const CREATE_DTO = {
  book_code: 'jhn',
  chapter: 3,
  verse_start: 16,
  verse_end: 18,
  comment: 'Deus amou o mundo de tal maneira...',
};

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    userAccount: { findUnique: jest.fn().mockResolvedValue({ person_id: 'p1' }) },
    bibleVerseMark: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    ...overrides,
  };
}

function readerMock(): jest.Mocked<BibleReaderService> {
  return { getChapter: jest.fn().mockResolvedValue(CHAPTER_VIEW) } as unknown as jest.Mocked<BibleReaderService>;
}

function serviceWith(
  client: ReturnType<typeof clientWith>,
  reader: jest.Mocked<BibleReaderService>,
) {
  return new BibleVerseMarksService({ client } as unknown as PrismaService, reader);
}

describe('BibleVerseMarksService', () => {
  describe('requirePerson — sem congregação, sem acesso', () => {
    it.each([
      ['create', (s: BibleVerseMarksService) => s.create(CREATE_DTO, { ...USER, congregation_id: '' })],
      ['findFeed', (s: BibleVerseMarksService) => s.findFeed({ limit: 50 }, { ...USER, congregation_id: '' })],
    ])('%s nega com 403 quando o usuário não tem congregation_id resolvido', async (_name, call) => {
      const client = clientWith();
      const reader = readerMock();
      const service = serviceWith(client, reader);

      await expect(call(service)).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.bibleVerseMark.create).not.toHaveBeenCalled();
    });

    it('lança NotFoundException quando a conta não tem pessoa vinculada', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: null });
      const reader = readerMock();
      const service = serviceWith(client, reader);

      await expect(service.create(CREATE_DTO, USER)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('grava tenant_id/congregation_id/person_id do JWT, e o book_code/chapter normalizados pelo BibleReaderService', async () => {
      const client = clientWith();
      client.bibleVerseMark.create.mockResolvedValue({ id: 'm1' });
      const reader = readerMock();
      const service = serviceWith(client, reader);

      await service.create(CREATE_DTO, USER);

      expect(reader.getChapter).toHaveBeenCalledWith('jhn', 3);
      expect(client.bibleVerseMark.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          person_id: 'p1',
          book_code: 'JHN', // normalizado por BibleReaderService, não o 'jhn' cru do payload
          chapter: 3,
          verse_start: 16,
          verse_end: 18,
          comment: CREATE_DTO.comment,
        },
        include: { person: { select: { id: true, full_name: true } } },
      });
    });

    it('rejeita verse_end < verse_start antes de consultar o capítulo', async () => {
      const client = clientWith();
      const reader = readerMock();
      const service = serviceWith(client, reader);

      await expect(
        service.create({ ...CREATE_DTO, verse_start: 20, verse_end: 18 }, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(reader.getChapter).not.toHaveBeenCalled();
      expect(client.bibleVerseMark.create).not.toHaveBeenCalled();
    });

    it('rejeita verse_end além do total de versículos do capítulo resolvido, sem gravar', async () => {
      const client = clientWith();
      const reader = readerMock(); // CHAPTER_VIEW tem 36 versículos
      const service = serviceWith(client, reader);

      await expect(
        service.create({ ...CREATE_DTO, verse_start: 35, verse_end: 40 }, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.bibleVerseMark.create).not.toHaveBeenCalled();
    });

    it('aceita verse_end igual ao total de versículos do capítulo — limite inclusivo', async () => {
      const client = clientWith();
      client.bibleVerseMark.create.mockResolvedValue({ id: 'm1' });
      const reader = readerMock();
      const service = serviceWith(client, reader);

      await expect(
        service.create({ ...CREATE_DTO, verse_start: 35, verse_end: 36 }, USER),
      ).resolves.toBeDefined();
    });

    it('aceita marcação de um único versículo (verse_start === verse_end) — spec.md permite "um só, ou vários consecutivos"', async () => {
      const client = clientWith();
      client.bibleVerseMark.create.mockResolvedValue({ id: 'm1' });
      const reader = readerMock();
      const service = serviceWith(client, reader);

      await service.create({ ...CREATE_DTO, verse_start: 16, verse_end: 16 }, USER);

      expect(client.bibleVerseMark.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ verse_start: 16, verse_end: 16 }) }),
      );
    });

    it('propaga o 400/502 que o BibleReaderService lançar (livro/capítulo inválido ou provedor fora do ar)', async () => {
      const client = clientWith();
      const reader = readerMock();
      reader.getChapter.mockRejectedValue(new BadGatewayException('fora do ar'));
      const service = serviceWith(client, reader);

      await expect(service.create(CREATE_DTO, USER)).rejects.toBeInstanceOf(BadGatewayException);
      expect(client.bibleVerseMark.create).not.toHaveBeenCalled();
    });
  });

  describe('findFeed', () => {
    const rows = [
      {
        id: 'm1',
        person_id: 'p1',
        book_code: 'JHN',
        chapter: 3,
        verse_start: 16,
        verse_end: 18,
        comment: 'meu comentário',
        created_at: new Date('2026-09-12'),
        updated_at: new Date('2026-09-12'),
        person: { id: 'p1', full_name: 'Ana' },
      },
      {
        id: 'm2',
        person_id: 'p2',
        book_code: 'GEN',
        chapter: 1,
        verse_start: 1,
        verse_end: 1,
        comment: 'comentário de outro',
        created_at: new Date('2026-09-11'),
        updated_at: new Date('2026-09-11'),
        person: { id: 'p2', full_name: 'Bruno' },
      },
    ];

    it('exclui marcações apagadas (deleted_at IS NOT NULL) da query', async () => {
      const client = clientWith();
      client.bibleVerseMark.findMany.mockResolvedValue([]);
      const reader = readerMock();
      const service = serviceWith(client, reader);

      await service.findFeed({ limit: 50 }, USER);

      expect(client.bibleVerseMark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deleted_at: null } }),
      );
    });

    it('ordena do mais recente para o mais antigo e marca is_mine/can_delete', async () => {
      const client = clientWith();
      client.bibleVerseMark.findMany.mockResolvedValue(rows);
      const reader = readerMock();
      const service = serviceWith(client, reader);

      const result = await service.findFeed({ limit: 50 }, USER);

      expect(result.items.map((i) => i.id)).toEqual(['m1', 'm2']);
      expect(result.items[0]).toEqual(expect.objectContaining({ is_mine: true, can_delete: true }));
      expect(result.items[1]).toEqual(expect.objectContaining({ is_mine: false, can_delete: false }));
      expect(result.nextCursor).toBeNull();
    });

    it('moderador (pastor) pode apagar item alheio — can_delete true mesmo sem ser autor', async () => {
      const client = clientWith();
      client.bibleVerseMark.findMany.mockResolvedValue(rows);
      const reader = readerMock();
      const service = serviceWith(client, reader);

      const result = await service.findFeed({ limit: 50 }, { ...USER, roles: ['pastor'] });

      expect(result.items.every((i) => i.can_delete)).toBe(true);
    });

    it('pagina por cursor (before): busca limit+1, corta em limit e expõe nextCursor', async () => {
      const client = clientWith();
      client.bibleVerseMark.findMany.mockResolvedValue([...rows, { ...rows[1], id: 'm3' }]);
      const reader = readerMock();
      const service = serviceWith(client, reader);

      const result = await service.findFeed({ limit: 2 }, USER);

      expect(client.bibleVerseMark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 }),
      );
      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('m2');
    });

    it('resolve o cursor `before` antes de listar, e rejeita cursor inexistente com 404', async () => {
      const client = clientWith();
      client.bibleVerseMark.findFirst.mockResolvedValue(null);
      const reader = readerMock();
      const service = serviceWith(client, reader);

      await expect(service.findFeed({ before: 'nope', limit: 50 }, USER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(client.bibleVerseMark.findMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('autor edita o próprio comentário — muda comment (e updated_at via Prisma), created_at intocado', async () => {
      const client = clientWith();
      client.bibleVerseMark.findFirst.mockResolvedValue({ id: 'm1', person_id: 'p1' });
      client.bibleVerseMark.update.mockResolvedValue({
        id: 'm1',
        person_id: 'p1',
        book_code: 'JHN',
        chapter: 3,
        verse_start: 16,
        verse_end: 18,
        comment: 'texto revisado',
        created_at: new Date('2026-09-01'),
        updated_at: new Date('2026-09-12'),
        person: { id: 'p1', full_name: 'Ana' },
      });
      const reader = readerMock();
      const service = serviceWith(client, reader);

      const result = await service.update('m1', { comment: 'texto revisado' }, USER);

      expect(client.bibleVerseMark.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { comment: 'texto revisado' }, // sem created_at nem chapter/verses — imutáveis
        include: { person: { select: { id: true, full_name: true } } },
      });
      expect(result.comment).toBe('texto revisado');
      expect(result.created_at).toEqual(new Date('2026-09-01'));
    });

    it('nega 403 quando quem edita não é o autor — mesmo sendo pastor', async () => {
      const client = clientWith();
      client.bibleVerseMark.findFirst.mockResolvedValue({ id: 'm1', person_id: 'p2' });
      const reader = readerMock();
      const service = serviceWith(client, reader);

      await expect(
        service.update('m1', { comment: 'não devia poder' }, { ...USER, roles: ['pastor'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.bibleVerseMark.update).not.toHaveBeenCalled();
    });

    it('404 ao editar marcação inexistente ou já apagada', async () => {
      const client = clientWith();
      client.bibleVerseMark.findFirst.mockResolvedValue(null);
      const reader = readerMock();
      const service = serviceWith(client, reader);

      await expect(service.update('m9', { comment: 'x'.repeat(5) }, USER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('autor apaga a própria marcação: soft delete com deleted_by_person_id nulo', async () => {
      const client = clientWith();
      client.bibleVerseMark.findFirst.mockResolvedValue({ id: 'm1', person_id: 'p1' });
      const reader = readerMock();
      const service = serviceWith(client, reader);

      const result = await service.remove('m1', USER);

      expect(client.bibleVerseMark.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { deleted_at: expect.any(Date), deleted_by_person_id: null },
      });
      expect(result).toEqual({ id: 'm1' });
    });

    it('moderador (admin_congregation) apaga marcação alheia: soft delete com deleted_by_person_id preenchido', async () => {
      const client = clientWith();
      client.bibleVerseMark.findFirst.mockResolvedValue({ id: 'm1', person_id: 'p2' });
      const reader = readerMock();
      const service = serviceWith(client, reader);

      await service.remove('m1', { ...USER, roles: ['admin_congregation'] });

      expect(client.bibleVerseMark.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { deleted_at: expect.any(Date), deleted_by_person_id: 'p1' },
      });
    });

    it('nega 403 quando quem apaga não é autor nem moderador', async () => {
      const client = clientWith();
      client.bibleVerseMark.findFirst.mockResolvedValue({ id: 'm1', person_id: 'p2' });
      const reader = readerMock();
      const service = serviceWith(client, reader);

      await expect(service.remove('m1', USER)).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.bibleVerseMark.update).not.toHaveBeenCalled();
    });

    it('404 ao apagar marcação inexistente ou já apagada', async () => {
      const client = clientWith();
      client.bibleVerseMark.findFirst.mockResolvedValue(null);
      const reader = readerMock();
      const service = serviceWith(client, reader);

      await expect(service.remove('m9', USER)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
