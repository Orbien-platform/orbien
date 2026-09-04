import { Reflector } from '@nestjs/core';
import { SegmentsController } from './segments.controller';
import { SegmentsService } from './segments.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['admin_congregation'],
  plan: 'premium',
};

const READ_ROLES = ['admin_congregation', 'pastor', 'secretary', 'tenant_admin'];
const WRITE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'];

function rolesFor(methodName: keyof SegmentsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, SegmentsController.prototype[methodName]);
}

describe('SegmentsController', () => {
  let service: jest.Mocked<SegmentsService>;
  let controller: SegmentsController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<SegmentsService>;

    controller = new SegmentsController(service);
  });

  it('create exige papel de escrita', () => {
    expect(rolesFor('create')).toEqual(WRITE_ROLES);
  });

  it('findAll e findOne aceitam papéis de leitura', () => {
    expect(rolesFor('findAll')).toEqual(READ_ROLES);
    expect(rolesFor('findOne')).toEqual(READ_ROLES);
  });

  it('update exige papel de escrita', () => {
    expect(rolesFor('update')).toEqual(WRITE_ROLES);
  });

  it('remove restringe a admin_congregation/tenant_admin', () => {
    expect(rolesFor('remove')).toEqual(['admin_congregation', 'tenant_admin']);
  });

  it('create delega ao service', async () => {
    service.create.mockResolvedValue({ id: 'seg1' } as never);

    const result = await controller.create({ name: 'Jovens' } as never, USER);

    expect(service.create).toHaveBeenCalledWith({ name: 'Jovens' }, USER);
    expect(result).toEqual({ id: 'seg1' });
  });

  it('findAll delega ao service', async () => {
    service.findAll.mockResolvedValue([]);

    const result = await controller.findAll(USER);

    expect(service.findAll).toHaveBeenCalledWith(USER);
    expect(result).toEqual([]);
  });

  it('findOne delega ao service', async () => {
    service.findOne.mockResolvedValue({ id: 'seg1' } as never);

    const result = await controller.findOne('seg1', USER);

    expect(service.findOne).toHaveBeenCalledWith('seg1', USER);
    expect(result).toEqual({ id: 'seg1' });
  });

  it('update delega ao service', async () => {
    service.update.mockResolvedValue({ id: 'seg1' } as never);

    const result = await controller.update('seg1', { name: 'Novo' } as never, USER);

    expect(service.update).toHaveBeenCalledWith('seg1', { name: 'Novo' }, USER);
    expect(result).toEqual({ id: 'seg1' });
  });

  it('remove delega ao service', async () => {
    service.remove.mockResolvedValue({ id: 'seg1' } as never);

    const result = await controller.remove('seg1', USER);

    expect(service.remove).toHaveBeenCalledWith('seg1', USER);
    expect(result).toEqual({ id: 'seg1' });
  });
});
