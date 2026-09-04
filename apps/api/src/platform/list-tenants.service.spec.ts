/**
 * O que importa aqui é o que a rota entrega para a tela do `apps/admin`: a
 * página no mesmo formato da waitlist, o plano achatado a partir da relação
 * `tenantPlan` (que é opcional no schema) e a busca cobrindo slug e nome.
 *
 * O isolamento em si não é testável daqui — quem o decide é o RLS, e é a suíte
 * de integração que mede o caminho HTTP inteiro.
 */

import { PlanStatus, PlanType } from '@prisma/client';
import { ListTenantsService } from './list-tenants.service';
import { PrismaService } from '../prisma/prisma.service';

interface FindManyArgs {
  where: unknown;
  skip: number;
  take: number;
}

function serviceWith(rows: unknown[], total = rows.length) {
  const captured: { findMany?: FindManyArgs; countWhere?: unknown } = {};

  const client = {
    tenant: {
      findMany: (args: FindManyArgs) => {
        captured.findMany = args;
        return Promise.resolve(rows);
      },
      count: (args: { where: unknown }) => {
        captured.countWhere = args.where;
        return Promise.resolve(total);
      },
    },
  };

  const prisma = { client } as unknown as PrismaService;
  return { service: new ListTenantsService(prisma), captured };
}

const row = {
  id: 'tenant-1',
  slug: 'doca-church',
  name: 'Doca Church',
  email: 'contato@doca.test',
  created_at: new Date('2026-01-10T00:00:00Z'),
  tenantPlan: {
    plan: PlanType.premium,
    status: PlanStatus.trial,
    trial_ends_at: new Date('2026-02-09T00:00:00Z'),
  },
  _count: { congregations: 3 },
};

describe('ListTenantsService', () => {
  it('achata o plano e a contagem de congregações na linha da lista', async () => {
    const { service } = serviceWith([row]);

    const page = await service.list({});

    expect(page).toEqual({
      data: [
        {
          id: 'tenant-1',
          slug: 'doca-church',
          name: 'Doca Church',
          email: 'contato@doca.test',
          plan: PlanType.premium,
          plan_status: PlanStatus.trial,
          trial_ends_at: new Date('2026-02-09T00:00:00Z'),
          congregations_count: 3,
          created_at: new Date('2026-01-10T00:00:00Z'),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  // `tenantPlan` é `TenantPlan?` no schema, e provisionamento interrompido
  // deixa tenant sem plano. Nulo é o que a tela recebe, não um crash.
  it('devolve plano nulo quando o tenant não tem tenant_plans', async () => {
    const { service } = serviceWith([{ ...row, tenantPlan: null }]);

    const page = await service.list({});

    expect(page.data[0]).toMatchObject({
      plan: null,
      plan_status: null,
      trial_ends_at: null,
    });
  });

  it('sem busca, o where fica vazio — nenhum filtro implícito', async () => {
    const { service, captured } = serviceWith([]);

    await service.list({});

    expect(captured.findMany?.where).toEqual({});
    expect(captured.countWhere).toEqual({});
  });

  it('a busca cobre slug e nome, e o mesmo where vai para o count', async () => {
    const { service, captured } = serviceWith([]);

    await service.list({ search: '  Doca  ' });

    const where = {
      OR: [
        { slug: { contains: 'Doca', mode: 'insensitive' } },
        { name: { contains: 'Doca', mode: 'insensitive' } },
      ],
    };
    expect(captured.findMany?.where).toEqual(where);
    expect(captured.countWhere).toEqual(where);
  });

  // Busca só de espaços é o que sobra quando o usuário limpa o campo: tem que
  // virar "sem filtro", não `contains: ''`.
  it('busca em branco não vira filtro', async () => {
    const { service, captured } = serviceWith([]);

    await service.list({ search: '   ' });

    expect(captured.findMany?.where).toEqual({});
  });

  it('pagina a partir de page e limit', async () => {
    const { service, captured } = serviceWith([], 57);

    const page = await service.list({ page: 3, limit: 10 });

    expect(captured.findMany?.skip).toBe(20);
    expect(captured.findMany?.take).toBe(10);
    expect(page).toMatchObject({ total: 57, page: 3, limit: 10 });
  });
});
