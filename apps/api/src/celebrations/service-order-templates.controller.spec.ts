import { Reflector } from '@nestjs/core';
import { ServiceOrderTemplatesController } from './service-order-templates.controller';
import { ServiceOrderTemplatesService } from './service-order-templates.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const MANAGER_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['pastor'],
  plan: 'premium',
};

function rolesFor(methodName: keyof ServiceOrderTemplatesController): string[] | undefined {
  return new Reflector().get<string[] | undefined>(
    ROLES_KEY,
    ServiceOrderTemplatesController.prototype[methodName],
  );
}

describe('ServiceOrderTemplatesController', () => {
  let service: jest.Mocked<ServiceOrderTemplatesService>;
  let controller: ServiceOrderTemplatesController;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      createFromOrder: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      apply: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderTemplatesService>;
    controller = new ServiceOrderTemplatesController(service);
  });

  it('findAll delega ao service e exige papel de gestão', async () => {
    service.findAll.mockResolvedValue([{ id: 'tpl1' }] as never);
    expect(await controller.findAll(user)).toEqual([{ id: 'tpl1' }]);
    expect(service.findAll).toHaveBeenCalledWith('tenant-1', 'cong-1');
    expect(rolesFor('findAll')).toEqual(MANAGER_ROLES);
  });

  it('create salva o molde a partir da OC e exige papel de gestão', async () => {
    service.createFromOrder.mockResolvedValue({ id: 'tpl1' } as never);
    const dto = { name: 'Domingo', service_order_id: 'so1' };
    expect(await controller.create(dto, user)).toEqual({ id: 'tpl1' });
    expect(service.createFromOrder).toHaveBeenCalledWith('tenant-1', 'cong-1', dto);
    expect(rolesFor('create')).toEqual(MANAGER_ROLES);
  });

  it('update delega ao service e exige papel de gestão', async () => {
    service.update.mockResolvedValue({ id: 'tpl1' } as never);
    expect(await controller.update('tpl1', { name: 'Novo' }, user)).toEqual({ id: 'tpl1' });
    expect(service.update).toHaveBeenCalledWith('tenant-1', 'cong-1', 'tpl1', { name: 'Novo' });
    expect(rolesFor('update')).toEqual(MANAGER_ROLES);
  });

  it('remove delega ao service e exige papel de gestão', async () => {
    service.remove.mockResolvedValue({ id: 'tpl1' } as never);
    expect(await controller.remove('tpl1', user)).toEqual({ id: 'tpl1' });
    expect(service.remove).toHaveBeenCalledWith('tenant-1', 'cong-1', 'tpl1');
    expect(rolesFor('remove')).toEqual(MANAGER_ROLES);
  });

  it('apply delega ao service e exige papel de gestão', async () => {
    service.apply.mockResolvedValue({ created: 3, replaced: 0 });
    const dto = { service_order_id: 'so1', replace: true };
    expect(await controller.apply('tpl1', dto, user)).toEqual({ created: 3, replaced: 0 });
    expect(service.apply).toHaveBeenCalledWith('tenant-1', 'cong-1', 'tpl1', dto);
    expect(rolesFor('apply')).toEqual(MANAGER_ROLES);
  });
});
