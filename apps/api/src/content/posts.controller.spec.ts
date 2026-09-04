import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['admin_congregation'],
  plan: 'premium',
};

const ALL_ROLES = ['admin_congregation', 'pastor', 'secretary', 'tenant_admin', 'member'];
const WRITE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'];

function rolesFor(methodName: keyof PostsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, PostsController.prototype[methodName]);
}

describe('PostsController', () => {
  let service: jest.Mocked<PostsService>;
  let jwtService: jest.Mocked<JwtService>;
  let controller: PostsController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      publish: jest.fn(),
      uploadMedia: jest.fn(),
    } as unknown as jest.Mocked<PostsService>;

    jwtService = { sign: jest.fn().mockReturnValue('token') } as unknown as jest.Mocked<JwtService>;

    controller = new PostsController(service, jwtService);
  });

  it('create exige papel de escrita', () => {
    expect(rolesFor('create')).toEqual(WRITE_ROLES);
  });

  it('findAll e findOne aceitam todos os papéis, incluindo member', () => {
    expect(rolesFor('findAll')).toEqual(ALL_ROLES);
    expect(rolesFor('findOne')).toEqual(ALL_ROLES);
  });

  it('update e publish exigem papel de escrita', () => {
    expect(rolesFor('update')).toEqual(WRITE_ROLES);
    expect(rolesFor('publish')).toEqual(WRITE_ROLES);
  });

  it('remove restringe a admin_congregation/tenant_admin', () => {
    expect(rolesFor('remove')).toEqual(['admin_congregation', 'tenant_admin']);
  });

  it('uploadMedia exige papel de escrita', () => {
    expect(rolesFor('uploadMedia')).toEqual(WRITE_ROLES);
  });

  it('uploadTicket exige papel de escrita', () => {
    expect(rolesFor('uploadTicket')).toEqual(WRITE_ROLES);
  });

  it('create delega ao service com tenant/congregação/usuário', async () => {
    service.create.mockResolvedValue({ id: 'p1' } as never);

    const result = await controller.create({ title: 'Olá' } as never, USER);

    expect(service.create).toHaveBeenCalledWith('t1', 'g1', 'u1', { title: 'Olá' });
    expect(result).toEqual({ id: 'p1' });
  });

  it('findAll delega ao service', async () => {
    service.findAll.mockResolvedValue({ data: [], total: 0 });

    const result = await controller.findAll({ page: 1, limit: 20 } as never, USER);

    expect(service.findAll).toHaveBeenCalledWith('t1', 'g1', ['admin_congregation'], {
      page: 1,
      limit: 20,
    });
    expect(result).toEqual({ data: [], total: 0 });
  });

  it('findOne delega ao service', async () => {
    service.findOne.mockResolvedValue({ id: 'p1' } as never);

    const result = await controller.findOne('p1', USER);

    expect(service.findOne).toHaveBeenCalledWith('t1', 'g1', 'p1');
    expect(result).toEqual({ id: 'p1' });
  });

  it('update delega ao service', async () => {
    service.update.mockResolvedValue({ id: 'p1' } as never);

    const result = await controller.update('p1', { title: 'Novo' } as never, USER);

    expect(service.update).toHaveBeenCalledWith('t1', 'g1', 'p1', { title: 'Novo' });
    expect(result).toEqual({ id: 'p1' });
  });

  it('remove delega ao service', async () => {
    service.remove.mockResolvedValue({ id: 'p1' } as never);

    const result = await controller.remove('p1', USER);

    expect(service.remove).toHaveBeenCalledWith('t1', 'g1', 'p1');
    expect(result).toEqual({ id: 'p1' });
  });

  it('publish delega ao service', async () => {
    service.publish.mockResolvedValue({ id: 'p1' } as never);

    const result = await controller.publish('p1', USER);

    expect(service.publish).toHaveBeenCalledWith('t1', 'g1', 'p1');
    expect(result).toEqual({ id: 'p1' });
  });

  it('uploadMedia delega ao service', async () => {
    service.uploadMedia.mockResolvedValue({ media_url: 'https://cdn/a.png' });
    const file = { mimetype: 'image/png' } as Express.Multer.File;

    const result = await controller.uploadMedia('p1', file, USER);

    expect(service.uploadMedia).toHaveBeenCalledWith('t1', 'g1', 'p1', file);
    expect(result).toEqual({ media_url: 'https://cdn/a.png' });
  });

  it('uploadTicket confere o post antes de assinar e devolve o ticket', async () => {
    service.findOne.mockResolvedValue({ id: 'p1' } as never);

    const result = await controller.uploadTicket('p1', USER);

    expect(service.findOne).toHaveBeenCalledWith('t1', 'g1', 'p1');
    expect(jwtService.sign).toHaveBeenCalledWith(
      {
        sub: 'u1',
        tenant_id: 't1',
        congregation_id: 'g1',
        roles: [],
        plan: 'premium',
        scope: 'upload',
        upload_target: 'p1',
      },
      { expiresIn: 300 }
    );
    expect(result).toEqual({ upload_token: 'token', expires_in: 300 });
  });

  it('uploadTicket propaga impersonated_by e support_session pro ticket, quando presentes', async () => {
    service.findOne.mockResolvedValue({ id: 'p1' } as never);
    const supportUser: JwtPayload = {
      ...USER,
      impersonated_by: 'support1',
      support_session: true,
    };

    await controller.uploadTicket('p1', supportUser);

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({ impersonated_by: 'support1', support_session: true }),
      { expiresIn: 300 }
    );
  });

  it('uploadTicket propaga o 404 do service sem chegar a assinar', async () => {
    service.findOne.mockRejectedValue(new Error('não encontrado'));

    await expect(controller.uploadTicket('p1', USER)).rejects.toThrow('não encontrado');
    expect(jwtService.sign).not.toHaveBeenCalled();
  });
});
