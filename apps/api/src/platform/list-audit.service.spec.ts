/**
 * O que importa aqui é o que a rota entrega para a tela do `apps/admin` e o
 * `where` que ela monta — a página no mesmo formato das outras duas, o tenant
 * e o e-mail achatados a partir das relações, e `before`/`after` **fora** do
 * retorno.
 *
 * O que este arquivo não prova: que a plataforma só enxerga `support_access` e
 * `platform_access`. Quem decide isso é a policy de
 * `005_rls_audit_platform.sql`, e é a suíte de integração que mede o caminho
 * HTTP inteiro. O `action IN` do serviço é conveniência de consulta, não o
 * controle — se um dia parecer que ele é o que protege, 005 não rodou.
 */

import { ListAuditService } from './list-audit.service';
import { PrismaService } from '../prisma/prisma.service';

interface FindManyArgs {
  where: Record<string, unknown>;
  skip: number;
  take: number;
  orderBy: unknown;
  select: Record<string, unknown>;
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
  return { service: new ListAuditService(prisma), captured };
}

const row = {
  id: 'log-1',
  at: new Date('2026-09-04T12:00:00Z'),
  action: 'support_access',
  entity: 'persons',
  tenant_id: 'tenant-1',
  actor_user_id: 'sup-1',
  ip: '203.0.113.7',
  tenant: { name: 'Doca Church' },
  actorUser: { email: 'suporte@orbien.test' },
};

describe('ListAuditService', () => {
  it('achata tenant e ator, e entrega a página no formato das outras rotas', async () => {
    const { service } = serviceWith([row], 42);

    const page = await service.list({ page: 2, limit: 10 });

    expect(page).toEqual({
      total: 42,
      page: 2,
      limit: 10,
      data: [
        {
          id: 'log-1',
          at: row.at,
          action: 'support_access',
          entity: 'persons',
          tenant_id: 'tenant-1',
          tenant_name: 'Doca Church',
          actor_user_id: 'sup-1',
          actor_email: 'suporte@orbien.test',
          ip: '203.0.113.7',
        },
      ],
    });
  });

  it('não devolve before/after', async () => {
    // Conteúdo da alteração é dado da igreja. Trazê-lo para uma tela de
    // plataforma abriria pela porta lateral o que 005 fecha pela da frente.
    const { service, captured } = serviceWith([row]);

    const page = await service.list({});

    expect(Object.keys(page.data[0]!)).not.toContain('before');
    expect(Object.keys(page.data[0]!)).not.toContain('after');
    expect(captured.findMany!.select).not.toHaveProperty('before');
    expect(captured.findMany!.select).not.toHaveProperty('after');
  });

  it('sem filtro de ação, pede as duas da plataforma', async () => {
    const { service, captured } = serviceWith([]);

    await service.list({});

    expect(captured.findMany!.where['action']).toEqual({
      in: ['support_access', 'platform_access'],
    });
  });

  it('com filtro de ação, pede só ela', async () => {
    const { service, captured } = serviceWith([]);

    await service.list({ action: 'platform_access' });

    expect(captured.findMany!.where['action']).toBe('platform_access');
  });

  it('o mesmo where vai para a contagem — senão o total mente sobre a página', async () => {
    const { service, captured } = serviceWith([], 3);

    await service.list({ tenant_id: 'tenant-9', action: 'support_access' });

    expect(captured.countWhere).toEqual(captured.findMany!.where);
    expect(captured.findMany!.where['tenant_id']).toBe('tenant-9');
  });

  it('traduz from/to para um único filtro de data', async () => {
    const { service, captured } = serviceWith([]);

    await service.list({ from: '2026-09-01T00:00:00Z', to: '2026-09-30T23:59:59Z' });

    expect(captured.findMany!.where['at']).toEqual({
      gte: new Date('2026-09-01T00:00:00Z'),
      lte: new Date('2026-09-30T23:59:59Z'),
    });
  });

  it('sem from nem to, não manda filtro de data nenhum', async () => {
    // `at: {}` não é inofensivo: vira um filtro vazio que o Prisma aceita e
    // que faz o `where` da contagem divergir do da listagem se um dia só um
    // dos dois for montado assim.
    const { service, captured } = serviceWith([]);

    await service.list({});

    expect(captured.findMany!.where).not.toHaveProperty('at');
  });

  it('só from: filtro aberto no fim', async () => {
    const { service, captured } = serviceWith([]);

    await service.list({ from: '2026-09-01T00:00:00Z' });

    expect(captured.findMany!.where['at']).toEqual({
      gte: new Date('2026-09-01T00:00:00Z'),
    });
  });

  it('ordena do mais recente para o mais antigo', async () => {
    const { service, captured } = serviceWith([]);

    await service.list({});

    expect(captured.findMany!.orderBy).toEqual({ at: 'desc' });
  });

  it('paginação padrão é a primeira página de 20', async () => {
    const { service, captured } = serviceWith([]);

    await service.list({});

    expect(captured.findMany!.skip).toBe(0);
    expect(captured.findMany!.take).toBe(20);
  });

  it('ator sem e-mail vira null, não quebra', async () => {
    const { service } = serviceWith([{ ...row, actorUser: null, ip: null }]);

    const page = await service.list({});

    expect(page.data[0]!.actor_email).toBeNull();
    expect(page.data[0]!.ip).toBeNull();
  });
});
