import { Reflector } from '@nestjs/core';
import { BibleVerseMarksController } from './bible-verse-marks.controller';
import { BibleVerseMarksService } from './bible-verse-marks.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { BIBLE_ROLES } from './bible-roles.constant';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['member'],
  plan: 'starter',
};

function rolesFor(methodName: keyof BibleVerseMarksController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(
    ROLES_KEY,
    BibleVerseMarksController.prototype[methodName],
  );
}

describe('BibleVerseMarksController', () => {
  let service: jest.Mocked<BibleVerseMarksService>;
  let controller: BibleVerseMarksController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findFeed: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<BibleVerseMarksService>;

    controller = new BibleVerseMarksController(service);
  });

  it('as quatro rotas exigem um dos BIBLE_ROLES', () => {
    expect(rolesFor('create')).toEqual(BIBLE_ROLES);
    expect(rolesFor('findFeed')).toEqual(BIBLE_ROLES);
    expect(rolesFor('update')).toEqual(BIBLE_ROLES);
    expect(rolesFor('remove')).toEqual(BIBLE_ROLES);
  });

  it('repassa o corpo e o usuário para o service ao criar', async () => {
    const dto = { book_code: 'JHN', chapter: 3, verse_start: 16, verse_end: 18, comment: 'reflexão' };
    await controller.create(dto, USER);
    expect(service.create).toHaveBeenCalledWith(dto, USER);
  });

  it('repassa a query e o usuário ao listar o feed', async () => {
    const query = { before: undefined, after: undefined, limit: 50 };
    await controller.findFeed(query, USER);
    expect(service.findFeed).toHaveBeenCalledWith(query, USER);
  });

  it('repassa id, corpo e usuário ao editar', async () => {
    await controller.update('m1', { comment: 'texto revisado' }, USER);
    expect(service.update).toHaveBeenCalledWith('m1', { comment: 'texto revisado' }, USER);
  });

  it('repassa id e usuário ao remover — a decisão de quem pode é do service', async () => {
    await controller.remove('m1', USER);
    expect(service.remove).toHaveBeenCalledWith('m1', USER);
  });
});
