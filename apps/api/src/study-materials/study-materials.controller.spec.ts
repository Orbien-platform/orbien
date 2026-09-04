import { Reflector } from '@nestjs/core';
import { StudyMaterialsController } from './study-materials.controller';
import { StudyMaterialsService } from './study-materials.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['secretary'],
  plan: 'premium',
};

const WRITE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary'];
const READ_ROLES = [...WRITE_ROLES, 'cell_leader'];
const STATS_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'cell_leader'];
const ALL_ROLES = [...READ_ROLES, 'member', 'treasurer'];

function rolesFor(methodName: keyof StudyMaterialsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, StudyMaterialsController.prototype[methodName]);
}

describe('StudyMaterialsController', () => {
  let service: jest.Mocked<StudyMaterialsService>;
  let controller: StudyMaterialsController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      getOpenStats: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      recordOpen: jest.fn(),
    } as unknown as jest.Mocked<StudyMaterialsService>;

    controller = new StudyMaterialsController(service);
  });

  it('create e update exigem papel de escrita', () => {
    expect(rolesFor('create')).toEqual(WRITE_ROLES);
    expect(rolesFor('update')).toEqual(WRITE_ROLES);
  });

  it('findAll e findOne aceitam papéis de leitura, incluindo cell_leader', () => {
    expect(rolesFor('findAll')).toEqual(READ_ROLES);
    expect(rolesFor('findOne')).toEqual(READ_ROLES);
  });

  it('getOpenStats aceita os papéis de estatísticas', () => {
    expect(rolesFor('getOpenStats')).toEqual(STATS_ROLES);
  });

  it('remove restringe a tenant_admin/admin_congregation', () => {
    expect(rolesFor('remove')).toEqual(['tenant_admin', 'admin_congregation']);
  });

  it('recordOpen aceita todos os papéis, incluindo member e treasurer', () => {
    expect(rolesFor('recordOpen')).toEqual(ALL_ROLES);
  });

  it('create delega ao service', async () => {
    service.create.mockResolvedValue({ id: 'm1' } as never);
    const file = { mimetype: 'application/pdf' } as Express.Multer.File;

    const result = await controller.create({ title: 'Estudo' } as never, file, USER);

    expect(service.create).toHaveBeenCalledWith({ title: 'Estudo' }, file, USER);
    expect(result).toEqual({ id: 'm1' });
  });

  it('findAll delega ao service', async () => {
    service.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

    const result = await controller.findAll({ page: 1, limit: 20 } as never);

    expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });

  it('getOpenStats delega ao service', async () => {
    service.getOpenStats.mockResolvedValue({ total_targets: 1, opened: 1, percentage: 100 });

    const result = await controller.getOpenStats('m1');

    expect(service.getOpenStats).toHaveBeenCalledWith('m1');
    expect(result).toEqual({ total_targets: 1, opened: 1, percentage: 100 });
  });

  it('findOne delega ao service', async () => {
    service.findOne.mockResolvedValue({ id: 'm1' } as never);

    const result = await controller.findOne('m1');

    expect(service.findOne).toHaveBeenCalledWith('m1');
    expect(result).toEqual({ id: 'm1' });
  });

  it('update delega ao service', async () => {
    service.update.mockResolvedValue({ id: 'm1' } as never);
    const file = { mimetype: 'application/pdf' } as Express.Multer.File;

    const result = await controller.update('m1', { title: 'Novo' } as never, file, USER);

    expect(service.update).toHaveBeenCalledWith('m1', { title: 'Novo' }, file, USER);
    expect(result).toEqual({ id: 'm1' });
  });

  it('remove delega ao service', async () => {
    service.remove.mockResolvedValue({ id: 'm1' } as never);

    const result = await controller.remove('m1');

    expect(service.remove).toHaveBeenCalledWith('m1');
    expect(result).toEqual({ id: 'm1' });
  });

  it('recordOpen delega ao service', async () => {
    service.recordOpen.mockResolvedValue({ recorded: false, already_opened: true });

    const result = await controller.recordOpen('m1', USER);

    expect(service.recordOpen).toHaveBeenCalledWith('m1', USER);
    expect(result).toEqual({ recorded: false, already_opened: true });
  });
});
