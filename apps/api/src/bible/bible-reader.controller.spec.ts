import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BibleReaderController } from './bible-reader.controller';
import { BibleReaderService } from './bible-reader.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { BIBLE_BOOKS } from './bible-books.constant';
import { BIBLE_ROLES } from './bible-roles.constant';

function rolesFor(methodName: keyof BibleReaderController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(
    ROLES_KEY,
    BibleReaderController.prototype[methodName],
  );
}

describe('BibleReaderController', () => {
  let service: jest.Mocked<BibleReaderService>;
  let controller: BibleReaderController;

  beforeEach(() => {
    service = { getChapter: jest.fn() } as unknown as jest.Mocked<BibleReaderService>;
    controller = new BibleReaderController(service);
  });

  it('getBooks exige um dos BIBLE_ROLES', () => {
    expect(rolesFor('getBooks')).toEqual(BIBLE_ROLES);
  });

  it('getChapter exige um dos BIBLE_ROLES', () => {
    expect(rolesFor('getChapter')).toEqual(BIBLE_ROLES);
  });

  it('BIBLE_ROLES não inclui volunteer nem treasurer — leitura é conteúdo de congregação, não de área específica', () => {
    expect(BIBLE_ROLES).not.toContain('volunteer');
    expect(BIBLE_ROLES).not.toContain('treasurer');
  });

  it('GET /bible/books devolve a lista canônica dos 66 livros, sem chamar o service', () => {
    const result = controller.getBooks();

    expect(result).toBe(BIBLE_BOOKS);
    expect(result).toHaveLength(66);
  });

  it('GET /bible/books/:bookCode/chapters/:chapter delega ao BibleReaderService', async () => {
    const chapterView = { book_code: 'JHN', chapter: 3, verses: [{ number: 16, text: 'Porque Deus amou o mundo...' }] };
    service.getChapter.mockResolvedValue(chapterView);

    const result = await controller.getChapter('JHN', 3);

    expect(service.getChapter).toHaveBeenCalledWith('JHN', 3);
    expect(result).toEqual(chapterView);
  });

  it('propaga o 400 do service para livro/capítulo inválido', async () => {
    service.getChapter.mockRejectedValue(new BadRequestException('Livro bíblico inválido'));

    await expect(controller.getChapter('XYZ', 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propaga o 502 do service quando o provider falha sem cache', async () => {
    service.getChapter.mockRejectedValue(new BadGatewayException('fora do ar'));

    await expect(controller.getChapter('JHN', 1)).rejects.toBeInstanceOf(BadGatewayException);
  });
});
