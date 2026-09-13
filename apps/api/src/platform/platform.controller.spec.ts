import { Reflector } from '@nestjs/core';
import { PlatformController } from './platform.controller';
import { ProvisionTenantService } from './provision-tenant.service';
import { ListTenantsService } from './list-tenants.service';
import { ListCrmQueueService } from './list-crm-queue.service';
import { ListAuditLogsService } from './list-audit-logs.service';
import { UpdateTenantService } from './update-tenant.service';
import { SetTenantActiveService } from './set-tenant-active.service';
import { CancelTenantPlanService } from './cancel-tenant-plan.service';
import { TransferUserAccountService } from './transfer-user-account.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { PLATFORM_ROUTE_KEY } from '../common/decorators/platform-route.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

function servicesMock() {
  const provisionTenant = {
    provision: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
  } as unknown as ProvisionTenantService;
  const listTenants = {
    list: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
  } as unknown as ListTenantsService;
  const listCrmQueue = {
    list: jest.fn().mockResolvedValue({ trials_expirados: [], inadimplentes: [] }),
  } as unknown as ListCrmQueueService;
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
  const transferUserAccount = {
    transfer: jest.fn().mockResolvedValue({
      user_account_id: 'user-1',
      previous_tenant_id: 'tenant-origin',
      previous_congregation_id: 'cong-origin',
      tenant_id: 'tenant-dest',
      congregation_id: 'cong-dest',
    }),
  } as unknown as TransferUserAccountService;

  return {
    provisionTenant,
    listTenants,
    listCrmQueue,
    listAuditLogs,
    updateTenant,
    setTenantActive,
    cancelTenantPlan,
    transferUserAccount,
  };
}

function controllerWith(services: ReturnType<typeof servicesMock>) {
  return new PlatformController(
    services.provisionTenant,
    services.listTenants,
    services.listCrmQueue,
    services.listAuditLogs,
    services.updateTenant,
    services.setTenantActive,
    services.cancelTenantPlan,
    services.transferUserAccount,
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

  it('crmQueue delega ao ListCrmQueueService', async () => {
    const services = servicesMock();
    const controller = controllerWith(services);

    await expect(controller.crmQueue()).resolves.toEqual({
      trials_expirados: [],
      inadimplentes: [],
    });
    expect(services.listCrmQueue.list).toHaveBeenCalledWith();
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

  it('transfer delega ao TransferUserAccountService com id, DTO e o usuário atual', async () => {
    const services = servicesMock();
    const controller = controllerWith(services);
    const dto = { destination_tenant_id: 'tenant-dest', destination_congregation_id: 'cong-dest' };
    const actor: JwtPayload = {
      sub: 'support-1',
      tenant_id: 'tenant-support-home',
      congregation_id: 'cong-support-home',
      roles: ['platform_support'],
      plan: 'starter',
    };

    await expect(controller.transfer('user-1', dto, actor)).resolves.toEqual({
      user_account_id: 'user-1',
      previous_tenant_id: 'tenant-origin',
      previous_congregation_id: 'cong-origin',
      tenant_id: 'tenant-dest',
      congregation_id: 'cong-dest',
    });
    expect(services.transferUserAccount.transfer).toHaveBeenCalledWith('user-1', dto, actor);
  });

  it('transfer não redeclara @Roles/@PlatformRoute — herda as marcas do controller', () => {
    const reflector = new Reflector();

    expect(reflector.get(ROLES_KEY, PlatformController.prototype.transfer)).toBeUndefined();
    expect(
      reflector.get(PLATFORM_ROUTE_KEY, PlatformController.prototype.transfer),
    ).toBeUndefined();
    // As marcas vivem na classe, não no método — é o que faz o RolesGuard e o
    // TenantContextInterceptor valerem para toda rota do controller sem
    // redeclaração por rota.
    expect(reflector.get(ROLES_KEY, PlatformController)).toEqual(['platform_support']);
    expect(reflector.get(PLATFORM_ROUTE_KEY, PlatformController)).toBe(true);
  });
});
