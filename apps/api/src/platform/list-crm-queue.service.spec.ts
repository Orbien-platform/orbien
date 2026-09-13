/**
 * PROD-06 — a fila junta dois cortes independentes da mesma tabela
 * `tenant`: trial vencido sem conversão (`status = trial` + `trial_ends_at`
 * no passado) e inadimplência (`status = suspended`). O que importa testar
 * aqui é que cada linha vai para a lista certa e que o `where` de cada
 * consulta usa o filtro certo — o isolamento em si é RLS, testado na suíte
 * de integração, como o resto deste módulo.
 */

import { PlanStatus, PlanType } from '@prisma/client';
import { ListCrmQueueService } from './list-crm-queue.service';
import { PrismaService } from '../prisma/prisma.service';

interface FindManyArgs {
  where: { tenantPlan?: { status?: PlanStatus; trial_ends_at?: { lt: Date } } };
}

function tenantRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'tenant-1',
    slug: 'doca-church',
    name: 'Doca Church',
    email: 'contato@doca.test',
    created_at: new Date('2026-01-10T00:00:00Z'),
    tenantPlan: {
      plan: PlanType.starter,
      status: PlanStatus.trial,
      trial_ends_at: new Date('2026-02-01T00:00:00Z'),
    },
    ...overrides,
  };
}

function serviceWith(trialRows: unknown[], suspendedRows: unknown[]) {
  const calls: FindManyArgs[] = [];

  const client = {
    tenant: {
      findMany: (args: FindManyArgs) => {
        calls.push(args);
        // A primeira chamada do `Promise.all` é a de trial, a segunda a de
        // suspended — a ordem é a do código-fonte do service.
        return Promise.resolve(calls.length === 1 ? trialRows : suspendedRows);
      },
    },
  };

  const prisma = { client } as unknown as PrismaService;
  return { service: new ListCrmQueueService(prisma), calls };
}

describe('ListCrmQueueService', () => {
  it('separa trial expirado e inadimplente em listas distintas', async () => {
    const { service } = serviceWith(
      [tenantRow({ id: 'trial-1' })],
      [tenantRow({ id: 'suspenso-1', tenantPlan: { plan: PlanType.premium, status: PlanStatus.suspended, trial_ends_at: null } })],
    );

    const queue = await service.list();

    expect(queue.trials_expirados).toHaveLength(1);
    expect(queue.trials_expirados[0].id).toBe('trial-1');
    expect(queue.inadimplentes).toHaveLength(1);
    expect(queue.inadimplentes[0].id).toBe('suspenso-1');
    expect(queue.inadimplentes[0].plan_status).toBe(PlanStatus.suspended);
  });

  it('filtra trial só por status trial + trial_ends_at no passado, e tenant ativo', async () => {
    const { service, calls } = serviceWith([], []);

    await service.list();

    expect(calls[0].where).toMatchObject({
      is_active: true,
      tenantPlan: { status: PlanStatus.trial, trial_ends_at: { lt: expect.any(Date) } },
    });
    expect(calls[1].where).toMatchObject({
      is_active: true,
      tenantPlan: { status: PlanStatus.suspended },
    });
  });

  it('devolve plano nulo quando o tenant não tem tenant_plans', async () => {
    const { service } = serviceWith([tenantRow({ tenantPlan: null })], []);

    const queue = await service.list();

    expect(queue.trials_expirados[0]).toMatchObject({
      plan: null,
      plan_status: null,
      trial_ends_at: null,
    });
  });
});
