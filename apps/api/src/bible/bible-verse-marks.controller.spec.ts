import { Reflector } from '@nestjs/core';
import { BibleVerseMarksController } from './bible-verse-marks.controller';
import { BibleVerseMarksService } from './bible-verse-marks.service';
import { BibleMarkInteractionsService } from './bible-mark-interactions.service';
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
  let interactions: jest.Mocked<BibleMarkInteractionsService>;
  let controller: BibleVerseMarksController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findFeed: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<BibleVerseMarksService>;
    interactions = {
      like: jest.fn(),
      unlike: jest.fn(),
      listReplies: jest.fn(),
      createReply: jest.fn(),
      removeReply: jest.fn(),
    } as unknown as jest.Mocked<BibleMarkInteractionsService>;

    controller = new BibleVerseMarksController(service, interactions);
  });

  it.each([
    'create',
    'findFeed',
    'findOne',
    'update',
    'remove',
    'like',
    'unlike',
    'listReplies',
    'createReply',
    'removeReply',
  ] as const)('%s exige um dos BIBLE_ROLES', (method) => {
    expect(rolesFor(method)).toEqual(BIBLE_ROLES);
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

  it('a marcação vai para o service de marcações; curtir e responder, para o de interações', async () => {
    await controller.findOne('m1', USER);
    await controller.listReplies('m1', USER);
    await controller.like('m1', USER);
    await controller.unlike('m1', USER);
    await controller.createReply('m1', { comment: 'Amém!' }, USER);
    await controller.removeReply('m1', 'r1', USER);
    expect(service.findOne).toHaveBeenCalledWith('m1', USER);
    expect(interactions.listReplies).toHaveBeenCalledWith('m1', USER);
    expect(interactions.like).toHaveBeenCalledWith('m1', USER);
    expect(interactions.unlike).toHaveBeenCalledWith('m1', USER);
    expect(interactions.createReply).toHaveBeenCalledWith('m1', { comment: 'Amém!' }, USER);
    expect(interactions.removeReply).toHaveBeenCalledWith('m1', 'r1', USER);
  });
});
