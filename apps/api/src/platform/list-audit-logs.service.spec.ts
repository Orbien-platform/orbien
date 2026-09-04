/**
 * O que importa aqui é o achatamento: `entity` vira `route`, `after` é o JSON
 * que `AuditInterceptor` grava — `{ route, method, status }` — de onde saem
 * `method` e `status`, e as duas relações (`tenant`, `actorUser`) viram os
 * campos planos que a tela usa. O filtro por `action: 'support_access'` é
 * fixo, não vem da query — por isso não há teste de "sem filtro".
 *
 * O isolamento em si não é testável daqui — quem decide se a linha aparece é
 * o RLS (005), e quem mede o caminho HTTP inteiro é a suíte de integração.
 */

import { ListAuditLogsService } from './list-audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';

interface FindManyArgs {
  where: unknown;
  skip: number;
  take: number;
}

function serviceWith(rows: unknown[], total = rows.length) {
  const captured: { findMany?: FindManyArgs; countWhere?: unknown } = {};

  const client = {
    auditLog: {
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
  return { service: new ListAuditLogsService(prisma), captured };
}

const row = {
  id: 'log-1',
  at: new Date('2026-09-04T12:00:00Z'),
  tenant_id: 'tenant-alvo',
  congregation_id: 'cong-alvo',
  actor_user_id: 'support-user',
  entity: '/api/persons',
  after: { route: '/api/persons', method: 'GET', status: 200 },
  ip: '203.0.113.9',
  user_agent: 'jest',
  tenant: { slug: 'igreja-alvo', name: 'Igreja Alvo' },
  actorUser: { email: 'suporte@orbien.test' },
};

describe('ListAuditLogsService', () => {
  it('filtra sempre por action support_access, e o mesmo where vai para o count', async () => {
    const { service, captured } = serviceWith([]);

    await service.list({});

    expect(captured.findMany?.where).toEqual({ action: 'support_access' });
    expect(captured.countWhere).toEqual({ action: 'support_access' });
  });

  it('achata tenant, ator e o after em campos planos', async () => {
    const { service } = serviceWith([row]);

    const page = await service.list({});

    expect(page).toEqual({
      data: [
        {
          id: 'log-1',
          at: new Date('2026-09-04T12:00:00Z'),
          tenant_id: 'tenant-alvo',
          tenant_slug: 'igreja-alvo',
          tenant_name: 'Igreja Alvo',
          congregation_id: 'cong-alvo',
          actor_user_id: 'support-user',
          actor_email: 'suporte@orbien.test',
          route: '/api/persons',
          method: 'GET',
          status: 200,
          ip: '203.0.113.9',
          user_agent: 'jest',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  // O tenant pode já ter sido excluído (a FK é RESTRICT em audit_logs, mas o
  // relacionamento é opcional no `select`), e o `after` pode não existir em
  // linhas antigas. Nulo é o que a tela recebe, não um crash.
  it('devolve nulos quando tenant, ator ou after estão ausentes', async () => {
    const { service } = serviceWith([
      { ...row, tenant: null, actorUser: null, after: null },
    ]);

    const page = await service.list({});

    expect(page.data[0]).toMatchObject({
      tenant_slug: null,
      tenant_name: null,
      actor_email: null,
      method: null,
      status: null,
    });
  });

  it('pagina a partir de page e limit', async () => {
    const { service, captured } = serviceWith([], 57);

    const page = await service.list({ page: 3, limit: 10 });

    expect(captured.findMany?.skip).toBe(20);
    expect(captured.findMany?.take).toBe(10);
    expect(page).toMatchObject({ total: 57, page: 3, limit: 10 });
  });
});
