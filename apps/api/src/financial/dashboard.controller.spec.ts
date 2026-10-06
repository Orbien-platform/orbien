import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ForecastService } from './forecast.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { REQUIRES_PLAN_KEY } from '../auth/decorators/requires-plan.decorator';
import { CashBalanceQueryDto } from './dto/cash-balance-query.dto';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const DASHBOARD_ROLES = ['admin_congregation', 'pastor', 'treasurer', 'tenant_admin'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['treasurer'],
  plan: 'starter',
};

function rolesFor(methodName: keyof DashboardController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, DashboardController.prototype[methodName]);
}

describe('DashboardController', () => {
  let dashboardService: jest.Mocked<DashboardService>;
  let forecastService: jest.Mocked<ForecastService>;
  let controller: DashboardController;

  beforeEach(() => {
    dashboardService = { getWeeklyDashboard: jest.fn(), getCashBalance: jest.fn() } as unknown as jest.Mocked<DashboardService>;
    forecastService = { getForecast: jest.fn() } as unknown as jest.Mocked<ForecastService>;
    controller = new DashboardController(dashboardService, forecastService);
  });

  it('getWeekly delega ao DashboardService e exige papel de leitura financeira', async () => {
    dashboardService.getWeeklyDashboard.mockResolvedValue({ series: [] } as never);

    const result = await controller.getWeekly(
      { period_start: '2026-10-01', period_end: '2026-10-31' },
      user,
    );

    expect(dashboardService.getWeeklyDashboard).toHaveBeenCalledWith(user, '2026-10-01', '2026-10-31');
    expect(result).toEqual({ series: [] });
    expect(rolesFor('getWeekly')).toEqual(DASHBOARD_ROLES);
  });

  it('getCashBalance delega a data de corte, vale sem plano e exige papel de leitura financeira', async () => {
    dashboardService.getCashBalance.mockResolvedValue({ as_of: '2026-10-31', balance: 10 } as never);

    const result = await controller.getCashBalance({ as_of: '2026-10-31' }, user);

    expect(dashboardService.getCashBalance).toHaveBeenCalledWith(user, '2026-10-31');
    expect(result).toEqual({ as_of: '2026-10-31', balance: 10 });
    expect(rolesFor('getCashBalance')).toEqual(DASHBOARD_ROLES);
    expect(Reflect.getMetadata(REQUIRES_PLAN_KEY, DashboardController.prototype.getCashBalance)).toBeUndefined();
  });

  it('getCashBalance sem as_of repassa undefined (hoje)', async () => {
    await controller.getCashBalance({}, user);
    expect(dashboardService.getCashBalance).toHaveBeenCalledWith(user, undefined);
  });

  it('as_of impossível é rejeitado pela validação do DTO', async () => {
    const dto = plainToInstance(CashBalanceQueryDto, { as_of: 'ontem' });
    const errors = await validate(dto);
    expect(errors[0].constraints?.isDateString).toBe('as_of deve ser uma data válida');
  });

  describe('getForecast', () => {
    it('exige papel de leitura financeira', () => {
      expect(rolesFor('getForecast')).toEqual(DASHBOARD_ROLES);
    });

    it.each([3, 6, 12])('aceita %i meses e delega ao ForecastService', async (months) => {
      forecastService.getForecast.mockResolvedValue({ historical: [] } as never);

      const result = await controller.getForecast(months, user);

      expect(forecastService.getForecast).toHaveBeenCalledWith(months, user);
      expect(result).toEqual({ historical: [] });
    });

    it('rejeita quantidade de meses fora de {3,6,12}', () => {
      expect(() => controller.getForecast(4, user)).toThrow(BadRequestException);
      expect(forecastService.getForecast).not.toHaveBeenCalled();
    });
  });
});
