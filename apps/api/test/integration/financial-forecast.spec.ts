/**
 * `ForecastService.getForecast` faz uma consulta `$queryRaw` para o
 * histórico de receita — SQL não se testa com mock (ver docs/TESTES.md, Fase
 * 1). Este arquivo prova que o agrupamento por mês soma certo contra o
 * Postgres de verdade; `src/financial/forecast.service.spec.ts` cobre a
 * aritmética de projeção em cima do retorno (mockando `$queryRaw`).
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */

import { PlanStatus, PlanType, TransactionSource, TransactionType } from '@prisma/client';
import { ForecastService } from '../../src/financial/forecast.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { prismaAdmin, runAsTenant } from '../helpers/rls';

const ts = Date.now();
const slug = `fcst-int-${ts}`;

let tenantId: string;
let congregationId: string;
let userId: string;
let categoryId: string;

function monthsAgo(n: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 15));
}

beforeAll(async () => {
  const tenant = await prismaAdmin.tenant.create({ data: { slug, name: 'Integração Forecast' } });
  tenantId = tenant.id;

  const congregation = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantId, name: 'Sede' },
  });
  congregationId = congregation.id;

  await prismaAdmin.tenantPlan.create({
    data: { tenant_id: tenantId, plan: PlanType.starter, status: PlanStatus.trial },
  });

  const account = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      email: `tesoureiro-${ts}@orbien.test`,
      password_hash: 'x',
    },
  });
  userId = account.id;

  const category = await prismaAdmin.financialCategory.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, name: 'Dízimos', type: 'income' },
  });
  categoryId = category.id;

  // Histórico: mês passado (2 lançamentos) e retrasado (1 lançamento).
  // O mês corrente é excluído pelo próprio SQL (`occurred_at < curMonthStart`).
  await prismaAdmin.financialTransaction.createMany({
    data: [
      {
        tenant_id: tenantId,
        congregation_id: congregationId,
        type: TransactionType.income,
        amount: '100.00',
        occurred_at: monthsAgo(1),
        category_id: categoryId,
        source: TransactionSource.manual,
        created_by_user_id: userId,
      },
      {
        tenant_id: tenantId,
        congregation_id: congregationId,
        type: TransactionType.income,
        amount: '50.00',
        occurred_at: monthsAgo(1),
        category_id: categoryId,
        source: TransactionSource.manual,
        created_by_user_id: userId,
      },
      {
        tenant_id: tenantId,
        congregation_id: congregationId,
        type: TransactionType.income,
        amount: '200.00',
        occurred_at: monthsAgo(2),
        category_id: categoryId,
        source: TransactionSource.manual,
        created_by_user_id: userId,
      },
      // Despesa não deve entrar no histórico de receita.
      {
        tenant_id: tenantId,
        congregation_id: congregationId,
        type: TransactionType.expense,
        amount: '999.00',
        occurred_at: monthsAgo(1),
        category_id: categoryId,
        source: TransactionSource.manual,
        created_by_user_id: userId,
      },
      // Recorrente dos últimos 30 dias.
      {
        tenant_id: tenantId,
        congregation_id: congregationId,
        type: TransactionType.income,
        amount: '40.00',
        occurred_at: new Date(),
        category_id: categoryId,
        source: TransactionSource.recurring,
        created_by_user_id: userId,
      },
    ],
  });
}, 30000);

afterAll(async () => {
  await prismaAdmin.tenant.delete({ where: { id: tenantId } });
  await prismaAdmin.$disconnect();
});

describe('ForecastService.getForecast — SQL real (integração)', () => {
  it('agrupa a receita histórica por mês, ignora despesa, e soma o recorrente dos últimos 30 dias', async () => {
    await runAsTenant(tenantId, congregationId, async (dbTx) => {
      const prisma = { client: dbTx } as unknown as PrismaService;
      const service = new ForecastService(prisma);

      const result = await service.getForecast(3, {
        sub: userId,
        tenant_id: tenantId,
        congregation_id: congregationId,
        roles: ['treasurer'],
        plan: 'starter',
      });

      expect(result.months_of_history).toBe(2);
      // 150 (mês passado) + 200 (retrasado) = 350; média = 175.
      const totals = result.historical.map((h) => h.total).sort((a, b) => a - b);
      expect(totals).toEqual([150, 200]);
      expect(result.monthly_average).toBe(175);
      expect(result.recurring_monthly).toBe(40);
      expect(result.projected).toHaveLength(3);
      expect(result.projected.every((p) => p.projected === 215)).toBe(true);
    });
  }, 30000);

  it('sem histórico algum, months_of_history e monthly_average ficam em zero', async () => {
    const emptyCong = await prismaAdmin.congregation.create({
      data: { tenant_id: tenantId, name: 'Sem histórico' },
    });

    await runAsTenant(tenantId, emptyCong.id, async (dbTx) => {
      const prisma = { client: dbTx } as unknown as PrismaService;
      const service = new ForecastService(prisma);

      const result = await service.getForecast(3, {
        sub: userId,
        tenant_id: tenantId,
        congregation_id: emptyCong.id,
        roles: ['treasurer'],
        plan: 'starter',
      });

      expect(result.months_of_history).toBe(0);
      expect(result.monthly_average).toBe(0);
      expect(result.recurring_monthly).toBe(0);
    });
  }, 30000);
});
