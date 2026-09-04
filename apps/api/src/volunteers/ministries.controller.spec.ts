import { Reflector } from '@nestjs/core';
import { MinistriesController } from './ministries.controller';
import { MinistriesService } from './ministries.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['admin_congregation'],
  plan: 'premium',
};

function rolesFor(methodName: keyof MinistriesController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, MinistriesController.prototype[methodName]);
}

describe('MinistriesController', () => {
  let ministriesService: jest.Mocked<MinistriesService>;
  let controller: MinistriesController;

  beforeEach(() => {
    ministriesService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOneWithMembers: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<MinistriesService>;

    controller = new MinistriesController(ministriesService);
  });

  it('create exige papel de escrita (admin_congregation/tenant_admin)', () => {
    expect(rolesFor('create')).toEqual(['admin_congregation', 'tenant_admin']);
  });

  it('findAll aceita papéis de leitura', () => {
    expect(rolesFor('findAll')).toEqual([
      'admin_congregation',
      'pastor',
      'tenant_admin',
      'secretary',
      'ministry_leader',
    ]);
  });

  it('remove exige papel de escrita', () => {
    expect(rolesFor('remove')).toEqual(['admin_congregation', 'tenant_admin']);
  });

  it('create delega ao service com tenant/congregação do usuário', async () => {
    ministriesService.create.mockResolvedValue({ id: 'm1' } as never);

    const result = await controller.create({ name: 'Louvor' } as never, USER);

    expect(ministriesService.create).toHaveBeenCalledWith('t1', 'g1', { name: 'Louvor' });
    expect(result).toEqual({ id: 'm1' });
  });

  it('findAll delega ao service', async () => {
    ministriesService.findAll.mockResolvedValue([]);

    const result = await controller.findAll(USER);

    expect(ministriesService.findAll).toHaveBeenCalledWith('t1', 'g1');
    expect(result).toEqual([]);
  });

  it('findOne delega para findOneWithMembers', async () => {
    ministriesService.findOneWithMembers.mockResolvedValue({ id: 'm1' } as never);

    const result = await controller.findOne('m1', USER);

    expect(ministriesService.findOneWithMembers).toHaveBeenCalledWith('t1', 'g1', 'm1');
    expect(result).toEqual({ id: 'm1' });
  });

  it('update delega ao service', async () => {
    ministriesService.update.mockResolvedValue({ id: 'm1' } as never);

    const result = await controller.update('m1', { name: 'Novo' } as never, USER);

    expect(ministriesService.update).toHaveBeenCalledWith('t1', 'g1', 'm1', { name: 'Novo' });
    expect(result).toEqual({ id: 'm1' });
  });

  it('remove delega ao service', async () => {
    ministriesService.remove.mockResolvedValue({ id: 'm1' } as never);

    const result = await controller.remove('m1', USER);

    expect(ministriesService.remove).toHaveBeenCalledWith('t1', 'g1', 'm1');
    expect(result).toEqual({ id: 'm1' });
  });
});
