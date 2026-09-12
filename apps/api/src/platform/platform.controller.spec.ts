import { PlatformController } from './platform.controller';
import { ProvisionTenantService } from './provision-tenant.service';
import { ListTenantsService } from './list-tenants.service';
import { ListAuditLogsService } from './list-audit-logs.service';
import { UpdateTenantService } from './update-tenant.service';
import { SetTenantActiveService } from './set-tenant-active.service';
import { CancelTenantPlanService } from './cancel-tenant-plan.service';

function servicesMock() {
  const provisionTenant = {
    provision: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
  } as unknown as ProvisionTenantService;
  const listTenants = {
    list: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
  } as unknown as ListTenantsService;
  const listAuditLogs = {
    list: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
  } as unknown as ListAuditLogsService;
  const updateTenant = {
    update: jest.fn().mockResolvedValue({ tenant_id: 'tenant-1' }),
  } as unknown as UpdateTenantService;
  const setTenantActive = {
    setActive: jest.fn().mockResolvedValue({ tenant_id: 'tenant-1', is_active: false }),
  } as unknown as SetTenantActiveService;
  const cancelTenantPlan = {
    cancel: jest.fn().mockResolvedValue({ tenant_id: 'tenant-1', status: 'cancelled' }),
    reactivate: jest.fn().mockResolvedValue({ tenant_id: 'tenant-1', status: 'active' }),
  } as unknown as CancelTenantPlanService;

  return {
    provisionTenant,
    listTenants,
    listAuditLogs,
    updateTenant,
    setTenantActive,
    cancelTenantPlan,
  };
}

function controllerWith(services: ReturnType<typeof servicesMock>) {
  return new PlatformController(
    services.provisionTenant,
    services.listTenants,
    services.listAuditLogs,
    services.updateTenant,
    services.setTenantActive,
    services.cancelTenantPlan,
  );
}

describe('PlatformController', () => {
  it('list delega ao ListTenantsService com a query', async () => {
    const services = servicesMock();
    const controller = controllerWith(services);
    const query = { page: 1, limit: 20 };

    await expect(controller.list(query)).resolves.toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    expect(services.listTenants.list).toHaveBeenCalledWith(query);
  });

  it('provision delega ao ProvisionTenantService com o DTO', async () => {
    const services = servicesMock();
    const controller = controllerWith(services);
    const dto = { tenant_name: 'Igreja X', slug: 'igreja-x' } as never;

    await expect(controller.provision(dto)).resolves.toEqual({ id: 'tenant-1' });
    expect(services.provisionTenant.provision).toHaveBeenCalledWith(dto);
  });

  it('listSupportAccess delega ao ListAuditLogsService com a query', async () => {
    const services = servicesMock();
    const controller = controllerWith(services);
    const query = { page: 1, limit: 20 } as never;

    await expect(controller.listSupportAccess(query)).resolves.toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    expect(services.listAuditLogs.list).toHaveBeenCalledWith(query);
  });

  it('update delega ao UpdateTenantService com o id e o DTO', async () => {
    const services = servicesMock();
    const controller = controllerWith(services);
    const dto = { name: 'Novo Nome' };

    await expect(controller.update('tenant-1', dto)).resolves.toEqual({ tenant_id: 'tenant-1' });
    expect(services.updateTenant.update).toHaveBeenCalledWith('tenant-1', dto);
  });

  it('deactivate delega ao SetTenantActiveService com is_active=false', async () => {
    const services = servicesMock();
    const controller = controllerWith(services);

    await expect(controller.deactivate('tenant-1')).resolves.toEqual({
      tenant_id: 'tenant-1',
      is_active: false,
    });
    expect(services.setTenantActive.setActive).toHaveBeenCalledWith('tenant-1', false);
  });

  it('activate delega ao SetTenantActiveService com is_active=true', async () => {
    const services = servicesMock();
    const controller = controllerWith(services);

    await controller.activate('tenant-1');
    expect(services.setTenantActive.setActive).toHaveBeenCalledWith('tenant-1', true);
  });

  it('cancel delega ao CancelTenantPlanService com o id', async () => {
    const services = servicesMock();
    const controller = controllerWith(services);

    await expect(controller.cancel('tenant-1')).resolves.toEqual({
      tenant_id: 'tenant-1',
      status: 'cancelled',
    });
    expect(services.cancelTenantPlan.cancel).toHaveBeenCalledWith('tenant-1');
  });

  it('reactivate delega ao CancelTenantPlanService com o id', async () => {
    const services = servicesMock();
    const controller = controllerWith(services);

    await expect(controller.reactivate('tenant-1')).resolves.toEqual({
      tenant_id: 'tenant-1',
      status: 'active',
    });
    expect(services.cancelTenantPlan.reactivate).toHaveBeenCalledWith('tenant-1');
  });
});
