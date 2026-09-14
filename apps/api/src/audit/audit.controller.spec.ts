import { Reflector } from '@nestjs/core';
import { AuditController } from './audit.controller';
import { TenantAuditLogsService } from './tenant-audit-logs.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { REQUIRES_PLAN_KEY } from '../auth/decorators/requires-plan.decorator';
import { PLATFORM_ROUTE_KEY } from '../common/decorators/platform-route.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

function baseUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-1',
    tenant_id: 'tenant-1',
    congregation_id: 'cong-1',
    roles: ['tenant_admin'],
    plan: 'premium',
    ...overrides,
  };
}

describe('AuditController', () => {
  let service: jest.Mocked<TenantAuditLogsService>;
  let controller: AuditController;

  beforeEach(() => {
    service = { list: jest.fn() } as unknown as jest.Mocked<TenantAuditLogsService>;
    controller = new AuditController(service);
  });

  it('só `tenant_admin` lê', () => {
    const roles = new Reflector().get<string[] | undefined>(
      ROLES_KEY,
      AuditController.prototype.list,
    );

    expect(roles).toEqual(['tenant_admin']);
  });

  it('é rota Premium', () => {
    expect(new Reflector().get(REQUIRES_PLAN_KEY, AuditController)).toBe('premium');
  });

  // O contrário de `apps/admin`: aqui o tenant do contexto é o que recorta as
  // linhas. Marcar como rota de plataforma tiraria o tenant do contexto e o
  // ramo `app_platform_access()` abriria os N tenants — o oposto do PROD-21.
  it('NÃO é rota de plataforma', () => {
    expect(new Reflector().get(PLATFORM_ROUTE_KEY, AuditController)).toBeUndefined();
    expect(new Reflector().get(PLATFORM_ROUTE_KEY, AuditController.prototype.list)).toBeUndefined();
  });

  it('passa o tenant do token, não um vindo da query', () => {
    const query = { page: 2, action: 'support_access' as const };

    controller.list(query, baseUser({ tenant_id: 'tenant-do-token' }));

    expect(service.list).toHaveBeenCalledWith('tenant-do-token', query);
  });
});
