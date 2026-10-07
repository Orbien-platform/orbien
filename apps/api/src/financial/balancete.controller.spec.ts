import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BalanceteController } from './balancete.controller';
import { BalanceteService } from './balancete.service';
import { BalanceteMonthlyService } from './balancete-monthly.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { REQUIRES_PLAN_KEY } from '../auth/decorators/requires-plan.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

const BALANCETE_ROLES = ['treasurer', 'admin_congregation', 'pastor', 'tenant_admin'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['treasurer'],
  plan: 'premium',
};

function rolesFor(methodName: keyof BalanceteController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, BalanceteController.prototype[methodName]);
}

describe('BalanceteController', () => {
  let balanceteService: jest.Mocked<BalanceteService>;
  let balanceteMonthlyService: jest.Mocked<BalanceteMonthlyService>;
  let controller: BalanceteController;

  beforeEach(() => {
    balanceteService = { build: jest.fn() } as unknown as jest.Mocked<BalanceteService>;
    balanceteMonthlyService = { build: jest.fn() } as unknown as jest.Mocked<BalanceteMonthlyService>;
    controller = new BalanceteController(balanceteService, balanceteMonthlyService);
  });

  it('exige JwtAuthGuard, RolesGuard e PlanGuard, nessa ordem, e roda sob o TenantContextInterceptor', () => {
    // O banco real devolve 401 sem token, mas só este teste vê o decorator sumir:
    // sem JwtAuthGuard/RolesGuard/PlanGuard/interceptor a rota abre (ou perde o contexto de tenant).
    expect(Reflect.getMetadata('__guards__', BalanceteController)).toEqual([JwtAuthGuard, RolesGuard, PlanGuard]);
    expect(Reflect.getMetadata('__interceptors__', BalanceteController)).toEqual([TenantContextInterceptor]);
  });

  it('é Premium — @RequiresPlan no controller inteiro', () => {
    const reflector = new Reflector();
    expect(reflector.get(REQUIRES_PLAN_KEY, BalanceteController)).toBe('premium');
  });

  it('get delega ao service e exige papel de leitura financeira', async () => {
    balanceteService.build.mockResolvedValue({} as never);
    const query = { period_start: '2026-01-01', period_end: '2026-01-31' };

    await controller.get(query as never, user);

    expect(balanceteService.build).toHaveBeenCalledWith('tenant-1', query);
    expect(rolesFor('get')).toEqual(BALANCETE_ROLES);
  });

  describe('getMonthly', () => {
    it('exige os mesmos papéis do Balancete', () => {
      expect(rolesFor('getMonthly')).toEqual(BALANCETE_ROLES);
    });

    it('delega ao serviço com o tenant do token e devolve a série', async () => {
      const series = { months: [], series: [] } as never;
      balanceteMonthlyService.build.mockResolvedValue(series);
      const query = { period_start: '2026-01-01', period_end: '2026-03-31' };

      const result = await controller.getMonthly(query as never, user);

      expect(balanceteMonthlyService.build).toHaveBeenCalledWith('tenant-1', query);
      expect(result).toBe(series);
    });

    it('propaga o 400 do serviço (período acima de 36 meses)', async () => {
      balanceteMonthlyService.build.mockRejectedValue(new BadRequestException('36 meses'));

      await expect(
        controller.getMonthly({ period_start: '2020-01-01', period_end: '2026-01-31' } as never, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
