import { PlatformController } from './platform.controller';
import { ProvisionTenantService } from './provision-tenant.service';
import { ListTenantsService } from './list-tenants.service';
import { ListAuditLogsService } from './list-audit-logs.service';
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
  const cancelTenantPlan = {
    cancel: jest.fn().mockResolvedValue({ tenant_id: 'tenant-1', status: 'cancelled' }),
    reactivate: jest.fn().mockResolvedValue({ tenant_id: 'tenant-1', status: 'active' }),
  } as unknown as CancelTenantPlanService;

  return { provisionTenant, listTenants, listAuditLogs, cancelTenantPlan };
}

describe('PlatformController', () => {
  it('list delega ao ListTenantsService com a query', async () => {
    const { provisionTenant, listTenants, listAuditLogs, cancelTenantPlan } = servicesMock();
    const controller = new PlatformController(provisionTenant, listTenants, listAuditLogs, cancelTenantPlan);
    const query = { page: 1, limit: 20 };

    await expect(controller.list(query)).resolves.toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    expect(listTenants.list).toHaveBeenCalledWith(query);
  });

  it('provision delega ao ProvisionTenantService com o DTO', async () => {
    const { provisionTenant, listTenants, listAuditLogs, cancelTenantPlan } = servicesMock();
    const controller = new PlatformController(provisionTenant, listTenants, listAuditLogs, cancelTenantPlan);
    const dto = { tenant_name: 'Igreja X', slug: 'igreja-x' } as never;

    await expect(controller.provision(dto)).resolves.toEqual({ id: 'tenant-1' });
    expect(provisionTenant.provision).toHaveBeenCalledWith(dto);
  });

  it('listSupportAccess delega ao ListAuditLogsService com a query', async () => {
    const { provisionTenant, listTenants, listAuditLogs, cancelTenantPlan } = servicesMock();
    const controller = new PlatformController(provisionTenant, listTenants, listAuditLogs, cancelTenantPlan);
    const query = { page: 1, limit: 20 } as never;

    await expect(controller.listSupportAccess(query)).resolves.toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    expect(listAuditLogs.list).toHaveBeenCalledWith(query);
  });

  it('cancel delega ao CancelTenantPlanService com o id', async () => {
    const { provisionTenant, listTenants, listAuditLogs, cancelTenantPlan } = servicesMock();
    const controller = new PlatformController(provisionTenant, listTenants, listAuditLogs, cancelTenantPlan);

    await expect(controller.cancel('tenant-1')).resolves.toEqual({
      tenant_id: 'tenant-1',
      status: 'cancelled',
    });
    expect(cancelTenantPlan.cancel).toHaveBeenCalledWith('tenant-1');
  });

  it('reactivate delega ao CancelTenantPlanService com o id', async () => {
    const { provisionTenant, listTenants, listAuditLogs, cancelTenantPlan } = servicesMock();
    const controller = new PlatformController(provisionTenant, listTenants, listAuditLogs, cancelTenantPlan);

    await expect(controller.reactivate('tenant-1')).resolves.toEqual({
      tenant_id: 'tenant-1',
      status: 'active',
    });
    expect(cancelTenantPlan.reactivate).toHaveBeenCalledWith('tenant-1');
  });
});
