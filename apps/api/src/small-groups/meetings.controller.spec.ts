import { Reflector } from '@nestjs/core';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['cell_leader'],
  plan: 'premium',
};

const MEETING_WRITE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'cell_leader'];
const MEETING_READ_ROLES = [...MEETING_WRITE_ROLES, 'treasurer'];
const MEETING_ADMIN_ROLES = ['tenant_admin', 'admin_congregation', 'pastor'];
const MATERIAL_WRITE_ROLES = ['cell_leader', 'admin_congregation', 'tenant_admin'];
const MATERIAL_READ_ROLES = ['member', ...MATERIAL_WRITE_ROLES];

function rolesFor(methodName: keyof MeetingsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, MeetingsController.prototype[methodName]);
}

describe('MeetingsController', () => {
  let service: jest.Mocked<MeetingsService>;
  let controller: MeetingsController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      findByGroup: jest.fn(),
      recordAttendance: jest.fn(),
      removeAttendance: jest.fn(),
      addMaterial: jest.fn(),
      listMaterials: jest.fn(),
      removeMaterial: jest.fn(),
    } as unknown as jest.Mocked<MeetingsService>;

    controller = new MeetingsController(service);
  });

  it('create, update, findByGroup e recordAttendance exigem papel de escrita de reunião', () => {
    expect(rolesFor('create')).toEqual(MEETING_WRITE_ROLES);
    expect(rolesFor('update')).toEqual(MEETING_WRITE_ROLES);
    expect(rolesFor('recordAttendance')).toEqual(MEETING_WRITE_ROLES);
  });

  it('findOne e findByGroup aceitam treasurer além dos papéis de escrita', () => {
    expect(rolesFor('findOne')).toEqual(MEETING_READ_ROLES);
    expect(rolesFor('findByGroup')).toEqual(MEETING_READ_ROLES);
  });

  it('removeAttendance restringe a papéis administrativos', () => {
    expect(rolesFor('removeAttendance')).toEqual(MEETING_ADMIN_ROLES);
  });

  it('addMaterial e removeMaterial exigem papel de escrita de material', () => {
    expect(rolesFor('addMaterial')).toEqual(MATERIAL_WRITE_ROLES);
    expect(rolesFor('removeMaterial')).toEqual(MATERIAL_WRITE_ROLES);
  });

  it('listMaterials aceita member além dos papéis de escrita de material', () => {
    expect(rolesFor('listMaterials')).toEqual(MATERIAL_READ_ROLES);
  });

  it('create delega ao service', async () => {
    service.create.mockResolvedValue({ meeting: { id: 'meet1' }, attendance_count: 0 } as never);

    const result = await controller.create({ small_group_id: 'sg1' } as never, USER);

    expect(service.create).toHaveBeenCalledWith({ small_group_id: 'sg1' }, USER);
    expect(result).toEqual({ meeting: { id: 'meet1' }, attendance_count: 0 });
  });

  it('findOne delega ao service', async () => {
    service.findOne.mockResolvedValue({ id: 'meet1' } as never);

    const result = await controller.findOne('meet1');

    expect(service.findOne).toHaveBeenCalledWith('meet1');
    expect(result).toEqual({ id: 'meet1' });
  });

  it('update delega ao service', async () => {
    service.update.mockResolvedValue({ id: 'meet1' } as never);

    const result = await controller.update('meet1', { topic: 'Novo' } as never);

    expect(service.update).toHaveBeenCalledWith('meet1', { topic: 'Novo' });
    expect(result).toEqual({ id: 'meet1' });
  });

  it('findByGroup delega ao service', async () => {
    service.findByGroup.mockResolvedValue([]);

    const result = await controller.findByGroup('sg1');

    expect(service.findByGroup).toHaveBeenCalledWith('sg1');
    expect(result).toEqual([]);
  });

  it('recordAttendance delega ao service', async () => {
    service.recordAttendance.mockResolvedValue({ added: 1 });

    const result = await controller.recordAttendance('meet1', { person_ids: ['p1'] } as never, USER);

    expect(service.recordAttendance).toHaveBeenCalledWith('meet1', { person_ids: ['p1'] }, USER);
    expect(result).toEqual({ added: 1 });
  });

  it('removeAttendance delega ao service', async () => {
    service.removeAttendance.mockResolvedValue({ id: 'rec1' } as never);

    const result = await controller.removeAttendance('meet1', 'p1');

    expect(service.removeAttendance).toHaveBeenCalledWith('meet1', 'p1');
    expect(result).toEqual({ id: 'rec1' });
  });

  it('addMaterial delega ao service', async () => {
    service.addMaterial.mockResolvedValue({ id: 'link1' } as never);

    const result = await controller.addMaterial('meet1', { material_id: 'mat1' } as never, USER);

    expect(service.addMaterial).toHaveBeenCalledWith('meet1', { material_id: 'mat1' }, USER);
    expect(result).toEqual({ id: 'link1' });
  });

  it('listMaterials delega ao service', async () => {
    service.listMaterials.mockResolvedValue([]);

    const result = await controller.listMaterials('meet1', USER);

    expect(service.listMaterials).toHaveBeenCalledWith('meet1', USER);
    expect(result).toEqual([]);
  });

  it('removeMaterial delega ao service', async () => {
    service.removeMaterial.mockResolvedValue({ id: 'link1' } as never);

    const result = await controller.removeMaterial('meet1', 'mat1');

    expect(service.removeMaterial).toHaveBeenCalledWith('meet1', 'mat1');
    expect(result).toEqual({ id: 'link1' });
  });
});
