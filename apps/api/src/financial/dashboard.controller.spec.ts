import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ForecastService } from './forecast.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
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
    dashboardService = { getWeeklyDashboard: jest.fn() } as unknown as jest.Mocked<DashboardService>;
    forecastService = { getForecast: jest.fn() } as unknown as jest.Mocked<ForecastService>;
    controller = new DashboardController(dashboardService, forecastService);
  });

  it('getWeekly delega ao DashboardService e exige papel de leitura financeira', async () => {
    dashboardService.getWeeklyDashboard.mockResolvedValue({ weekly: [] } as never);

    const result = await controller.getWeekly(user);

    expect(dashboardService.getWeeklyDashboard).toHaveBeenCalledWith(user);
    expect(result).toEqual({ weekly: [] });
    expect(rolesFor('getWeekly')).toEqual(DASHBOARD_ROLES);
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
