/**
 * `DashboardService.getWeeklyDashboard` faz quatro consultas com `$queryRaw`
 * — SQL não se testa com mock (ver docs/TESTES.md, Fase 1). Este arquivo
 * prova que o SQL em si soma e agrupa certo contra o Postgres de verdade;
 * `src/financial/dashboard.service.spec.ts` cobre a aritmética em cima do
 * retorno (mockando `$queryRaw`).
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */

import { PlanStatus, PlanType, TransactionSource, TransactionType } from '@prisma/client';
import { DashboardService } from '../../src/financial/dashboard.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';
import { prismaAdmin, runAsTenant } from '../helpers/rls';

const ts = Date.now();
const slug = `dash-int-${ts}`;

let tenantId: string;
let congregationId: string;
let userId: string;
let incomeCategoryId: string;
let dizimoCategoryId: string;

function user(): JwtPayload {
  return {
    sub: userId,
    tenant_id: tenantId,
    congregation_id: congregationId,
    roles: ['treasurer'],
    plan: 'starter',
  };
}

async function tx(overrides: {
  type: TransactionType;
  amount: string;
  occurred_at: Date;
  category_id: string;
  donor_person_id?: string;
}) {
  return prismaAdmin.financialTransaction.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      type: overrides.type,
      amount: overrides.amount,
      occurred_at: overrides.occurred_at,
      category_id: overrides.category_id,
      source: TransactionSource.manual,
      created_by_user_id: userId,
      donor_person_id: overrides.donor_person_id,
    },
  });
}

beforeAll(async () => {
  const tenant = await prismaAdmin.tenant.create({ data: { slug, name: 'Integração Dashboard' } });
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

  const income = await prismaAdmin.financialCategory.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, name: 'Ofertas', type: 'income' },
  });
  incomeCategoryId = income.id;

  const dizimo = await prismaAdmin.financialCategory.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, name: 'Dízimo', type: 'income' },
  });
  dizimoCategoryId = dizimo.id;
}, 30000);

afterAll(async () => {
  await prismaAdmin.tenant.delete({ where: { id: tenantId } });
  await prismaAdmin.$disconnect();
});

describe('DashboardService.getWeeklyDashboard — SQL real (integração)', () => {
  it('soma receita e despesa por semana, calcula top categorias e média por contribuinte', async () => {
    const now = new Date();

    await tx({ type: TransactionType.income, amount: '150.00', occurred_at: now, category_id: incomeCategoryId, donor_person_id: undefined });
    await tx({ type: TransactionType.income, amount: '50.00', occurred_at: now, category_id: incomeCategoryId, donor_person_id: undefined });
    await tx({ type: TransactionType.expense, amount: '30.00', occurred_at: now, category_id: incomeCategoryId, donor_person_id: undefined });
    await tx({ type: TransactionType.income, amount: '100.00', occurred_at: now, category_id: dizimoCategoryId, donor_person_id: undefined });

    await runAsTenant(tenantId, congregationId, async (dbTx) => {
      const prisma = { client: dbTx } as unknown as PrismaService;
      const service = new DashboardService(prisma);

      const result = await service.getWeeklyDashboard(user());

      // As 4 transações caem no mês corrente — a soma da série bate com os totais.
      const sum = (k: 'income' | 'expense' | 'net') => result.series.reduce((s, w) => s + w[k], 0);
      expect(sum('income')).toBe(300);
      expect(sum('expense')).toBe(30);
      expect(sum('net')).toBe(270);

      expect(result.totals.income).toBe(300);
      expect(result.totals.expense).toBe(30);

      // Duas categorias com receita no mês: Ofertas (200) > Dízimo (100).
      expect(result.top_income_categories[0]).toEqual({ category_name: 'Ofertas', total: 200 });
      expect(result.top_income_categories[1]).toEqual({ category_name: 'Dízimo', total: 100 });

      // Nenhum doador nomeado — average_per_contributor fica zero.
      expect(result.average_per_contributor).toBe(0);
      expect(result.tithe_active_count).toBe(0);
    });
  }, 30000);

  it('preenche os baldes sem transação com zero', async () => {
    const empty = await prismaAdmin.congregation.create({
      data: { tenant_id: tenantId, name: 'Congregação vazia' },
    });

    await runAsTenant(tenantId, empty.id, async (dbTx) => {
      const prisma = { client: dbTx } as unknown as PrismaService;
      const service = new DashboardService(prisma);

      const result = await service.getWeeklyDashboard({
        sub: userId,
        tenant_id: tenantId,
        congregation_id: empty.id,
        roles: ['treasurer'],
        plan: 'starter',
      });

      expect(result.series.length).toBeGreaterThanOrEqual(4);
      expect(result.series.every((w) => w.income === 0 && w.expense === 0)).toBe(true);
      expect(result.top_income_categories).toEqual([]);
    });
  }, 30000);

  it('conta lançamento de hoje depois do horário atual e com data futura no mês (regressão da Visão Geral)', async () => {
    const empty = await prismaAdmin.congregation.create({
      data: { tenant_id: tenantId, name: 'Congregação de fronteira' },
    });
    const cat = await prismaAdmin.financialCategory.create({
      data: { tenant_id: tenantId, congregation_id: empty.id, name: 'Ofertas fronteira', type: 'income' },
    });
    const create = (amount: string, occurred_at: Date) =>
      prismaAdmin.financialTransaction.create({
        data: {
          tenant_id: tenantId,
          congregation_id: empty.id,
          type: TransactionType.income,
          amount,
          occurred_at,
          category_id: cat.id,
          source: TransactionSource.manual,
          created_by_user_id: userId,
        },
      });

    // Mesmo mês de qualquer dia de execução: dia 15 às 15:00Z (meio-dia em
    // Brasília, como o web grava) e o último dia do mês às 00:00Z.
    const today = new Date();
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth();
    await create('10.00', new Date(Date.UTC(y, m, 1, 15)));
    await create('20.00', new Date(Date.UTC(y, m + 1, 0, 15)));
    await create('40.00', new Date(Date.UTC(y, m + 1, 0, 0)));
    // Fora do mês: não entra.
    await create('999.00', new Date(Date.UTC(y, m + 1, 1, 15)));

    const first = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);

    await runAsTenant(tenantId, empty.id, async (dbTx) => {
      const service = new DashboardService({ client: dbTx } as unknown as PrismaService);
      const result = await service.getWeeklyDashboard(
        { sub: userId, tenant_id: tenantId, congregation_id: empty.id, roles: ['treasurer'], plan: 'starter' },
        first,
        last,
      );

      expect(result.totals.income).toBe(70);
      expect(result.series.reduce((s, w) => s + w.income, 0)).toBe(70);
      expect(result.top_income_categories).toEqual([{ category_name: 'Ofertas fronteira', total: 70 }]);
    });
  }, 30000);

  it('RLS isola: um segundo tenant não muda o dashboard do tenant principal nem é visível nele', async () => {
    const otherTs = Date.now();
    const otherTenant = await prismaAdmin.tenant.create({
      data: { slug: `dash-int-other-${otherTs}`, name: 'Integração Dashboard — Outro Tenant' },
    });
    const otherCongregation = await prismaAdmin.congregation.create({
      data: { tenant_id: otherTenant.id, name: 'Sede — Outro Tenant' },
    });
    await prismaAdmin.tenantPlan.create({
      data: { tenant_id: otherTenant.id, plan: PlanType.starter, status: PlanStatus.trial },
    });
    const otherAccount = await prismaAdmin.userAccount.create({
      data: {
        tenant_id: otherTenant.id,
        congregation_id: otherCongregation.id,
        email: `tesoureiro-outro-${otherTs}@orbien.test`,
        password_hash: 'x',
      },
    });
    const otherCategory = await prismaAdmin.financialCategory.create({
      data: {
        tenant_id: otherTenant.id,
        congregation_id: otherCongregation.id,
        name: 'Ofertas — Outro Tenant',
        type: 'income',
      },
    });

    try {
      const now = new Date();

      // Valores bem distintos (múltiplos de 1000) para nunca colidir por acaso
      // com o que o tenant principal já tem.
      await prismaAdmin.financialTransaction.create({
        data: {
          tenant_id: otherTenant.id,
          congregation_id: otherCongregation.id,
          type: TransactionType.income,
          amount: '9000.00',
          occurred_at: now,
          category_id: otherCategory.id,
          source: TransactionSource.manual,
          created_by_user_id: otherAccount.id,
        },
      });
      await prismaAdmin.financialTransaction.create({
        data: {
          tenant_id: otherTenant.id,
          congregation_id: otherCongregation.id,
          type: TransactionType.expense,
          amount: '3000.00',
          occurred_at: now,
          category_id: otherCategory.id,
          source: TransactionSource.manual,
          created_by_user_id: otherAccount.id,
        },
      });

      // Sob o tenant principal: o resultado não muda com o segundo tenant no ar —
      // continua batendo com o que já era esperado antes dele existir.
      await runAsTenant(tenantId, congregationId, async (dbTx) => {
        const prisma = { client: dbTx } as unknown as PrismaService;
        const service = new DashboardService(prisma);

        const result = await service.getWeeklyDashboard(user());

        expect(result.totals.income).toBe(300);
        expect(result.totals.expense).toBe(30);
        expect(result.totals.net).toBe(270);

        expect(result.top_income_categories).toEqual([
          { category_name: 'Ofertas', total: 200 },
          { category_name: 'Dízimo', total: 100 },
        ]);
      });

      // Sob o segundo tenant: só os próprios valores (múltiplos de 1000) aparecem.
      await runAsTenant(otherTenant.id, otherCongregation.id, async (dbTx) => {
        const prisma = { client: dbTx } as unknown as PrismaService;
        const service = new DashboardService(prisma);

        const result = await service.getWeeklyDashboard({
          sub: otherAccount.id,
          tenant_id: otherTenant.id,
          congregation_id: otherCongregation.id,
          roles: ['treasurer'],
          plan: 'starter',
        });

        expect(result.totals.income).toBe(9000);
        expect(result.totals.expense).toBe(3000);
        expect(result.totals.net).toBe(6000);

        expect(result.top_income_categories).toEqual([
          { category_name: 'Ofertas — Outro Tenant', total: 9000 },
        ]);
      });
    } finally {
      await prismaAdmin.tenant.delete({ where: { id: otherTenant.id } });
    }
  }, 30000);
});
