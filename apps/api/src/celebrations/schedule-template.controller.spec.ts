import { Reflector } from '@nestjs/core';
import { ScheduleTemplateController } from './schedule-template.controller';
import { ScheduleTemplateService } from './schedule-template.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const MANAGE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'ministry_leader'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['ministry_leader'],
  plan: 'starter',
};

function rolesFor(methodName: keyof ScheduleTemplateController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(
    ROLES_KEY,
    ScheduleTemplateController.prototype[methodName],
  );
}

describe('ScheduleTemplateController', () => {
  let templateService: jest.Mocked<ScheduleTemplateService>;
  let controller: ScheduleTemplateController;

  beforeEach(() => {
    templateService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<ScheduleTemplateService>;

    controller = new ScheduleTemplateController(templateService);
  });

  it('findAll delega ao service e exige papel de gestão', async () => {
    templateService.findAll.mockResolvedValue([{ id: 'tpl1' }] as never);

    const result = await controller.findAll(user);

    expect(templateService.findAll).toHaveBeenCalledWith('tenant-1', 'cong-1');
    expect(result).toEqual([{ id: 'tpl1' }]);
    expect(rolesFor('findAll')).toEqual(MANAGE_ROLES);
  });

  it('findOne delega ao service e exige papel de gestão', async () => {
    templateService.findOne.mockResolvedValue({ id: 'tpl1' } as never);

    const result = await controller.findOne('tpl1', user);

    expect(templateService.findOne).toHaveBeenCalledWith('tenant-1', 'cong-1', 'tpl1');
    expect(result).toEqual({ id: 'tpl1' });
    expect(rolesFor('findOne')).toEqual(MANAGE_ROLES);
  });

  it('create delega ao service e exige papel de gestão', async () => {
    templateService.create.mockResolvedValue({ id: 'tpl1' } as never);

    const result = await controller.create({ name: 'Padrão' } as never, user);

    expect(templateService.create).toHaveBeenCalledWith('tenant-1', 'cong-1', { name: 'Padrão' });
    expect(result).toEqual({ id: 'tpl1' });
    expect(rolesFor('create')).toEqual(MANAGE_ROLES);
  });

  it('update delega ao service e exige papel de gestão', async () => {
    templateService.update.mockResolvedValue({ id: 'tpl1' } as never);

    const result = await controller.update('tpl1', { name: 'Novo' } as never, user);

    expect(templateService.update).toHaveBeenCalledWith('tenant-1', 'cong-1', 'tpl1', {
      name: 'Novo',
    });
    expect(result).toEqual({ id: 'tpl1' });
    expect(rolesFor('update')).toEqual(MANAGE_ROLES);
  });

  it('remove delega ao service e exige papel de gestão', async () => {
    templateService.remove.mockResolvedValue({ id: 'tpl1' } as never);

    const result = await controller.remove('tpl1', user);

    expect(templateService.remove).toHaveBeenCalledWith('tenant-1', 'cong-1', 'tpl1');
    expect(result).toEqual({ id: 'tpl1' });
    expect(rolesFor('remove')).toEqual(MANAGE_ROLES);
  });
});
