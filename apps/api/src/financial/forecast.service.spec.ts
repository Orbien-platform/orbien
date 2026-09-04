/**
 * O histórico vem de `$queryRaw`, e `$queryRaw` não se testa com mock (ver
 * docs/TESTES.md) — a correção do SQL é responsabilidade de
 * `test/integration/forecast.integration.spec.ts`. Esta suíte mocka
 * `$queryRaw` só para exercitar a aritmética: a guarda de divisão por zero
 * (`months_of_history === 0`) e `toYYYYMM` na virada de ano.
 */

import { ForecastService } from './forecast.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['treasurer'],
  plan: 'starter',
};

function serviceWith(histRows: { month: string; total: unknown }[], recurringSum: unknown = null) {
  const client = {
    $queryRaw: jest.fn().mockResolvedValue(histRows),
    financialTransaction: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: recurringSum } }),
    },
  };
  const prisma = { client } as unknown as PrismaService;
  return { service: new ForecastService(prisma), client };
}

describe('ForecastService.getForecast', () => {
  it('months_of_history zero → monthly_average zero (guarda de divisão por zero)', async () => {
    const { service } = serviceWith([]);

    const result = await service.getForecast(3, user);

    expect(result.months_of_history).toBe(0);
    expect(result.monthly_average).toBe(0);
  });

  it('calcula a média mensal a partir do histórico', async () => {
    const { service } = serviceWith([
      { month: '2025-11', total: '100' },
      { month: '2025-12', total: '200' },
    ]);

    const result = await service.getForecast(3, user);

    expect(result.months_of_history).toBe(2);
    expect(result.monthly_average).toBe(150);
    expect(result.historical).toEqual([
      { month: '2025-11', total: 100 },
      { month: '2025-12', total: 200 },
    ]);
  });

  it('recurring_monthly é zero quando não há transação recorrente nos últimos 30 dias', async () => {
    const { service } = serviceWith([], null);

    const result = await service.getForecast(3, user);
    expect(result.recurring_monthly).toBe(0);
  });

  it('projeta média + recorrente para cada mês pedido', async () => {
    const { service } = serviceWith([{ month: '2025-12', total: '300' }], '50');

    const result = await service.getForecast(3, user);

    expect(result.monthly_average).toBe(300);
    expect(result.recurring_monthly).toBe(50);
    expect(result.projected).toHaveLength(3);
    expect(result.projected.every((p) => p.projected === 350)).toBe(true);
  });

  it('projeta a quantidade de meses pedida (6 e 12)', async () => {
    const { service: s6 } = serviceWith([]);
    const r6 = await s6.getForecast(6, user);
    expect(r6.projected).toHaveLength(6);

    const { service: s12 } = serviceWith([]);
    const r12 = await s12.getForecast(12, user);
    expect(r12.projected).toHaveLength(12);
  });

  it('toYYYYMM atravessa a virada de ano corretamente', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-12-15T00:00:00.000Z'));
    try {
      const { service } = serviceWith([]);
      const result = await service.getForecast(3, user);

      // Projeta a partir do mês seguinte ao atual (dezembro/2026): jan, fev, mar/2027.
      expect(result.projected.map((p) => p.month)).toEqual(['2027-01', '2027-02', '2027-03']);
    } finally {
      jest.useRealTimers();
    }
  });
});
