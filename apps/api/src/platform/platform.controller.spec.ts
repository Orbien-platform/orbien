import { PlatformController } from './platform.controller';
import { ProvisionTenantService } from './provision-tenant.service';
import { ListTenantsService } from './list-tenants.service';
import { ListAuditLogsService } from './list-audit-logs.service';

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

  return { provisionTenant, listTenants, listAuditLogs };
}

describe('PlatformController', () => {
  it('list delega ao ListTenantsService com a query', async () => {
    const { provisionTenant, listTenants, listAuditLogs } = servicesMock();
    const controller = new PlatformController(provisionTenant, listTenants, listAuditLogs);
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
    const { provisionTenant, listTenants, listAuditLogs } = servicesMock();
    const controller = new PlatformController(provisionTenant, listTenants, listAuditLogs);
    const dto = { tenant_name: 'Igreja X', slug: 'igreja-x' } as never;

    await expect(controller.provision(dto)).resolves.toEqual({ id: 'tenant-1' });
    expect(provisionTenant.provision).toHaveBeenCalledWith(dto);
  });

  it('listSupportAccess delega ao ListAuditLogsService com a query', async () => {
    const { provisionTenant, listTenants, listAuditLogs } = servicesMock();
    const controller = new PlatformController(provisionTenant, listTenants, listAuditLogs);
    const query = { page: 1, limit: 20 } as never;

    await expect(controller.listSupportAccess(query)).resolves.toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    expect(listAuditLogs.list).toHaveBeenCalledWith(query);
  });
});
