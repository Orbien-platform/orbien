/**
 * O que este arquivo cobra são as três escolhas do serviço, não o Prisma:
 * o filtro fechado de `action` (que é o que mantém `platform_access` fora da
 * leitura da igreja), o `tenant_id` redundante no `where`, e o achatamento —
 * incluindo o fato de `route`/`method`/`status` só valerem para
 * `support_access`, porque o `after` de `tenant_transfer` guarda outra coisa.
 *
 * O isolamento em si não se testa daqui: quem decide se a linha aparece é o
 * RLS (`tenant_read` em `audit_logs`), e quem mede o caminho HTTP inteiro é a
 * suíte de integração.
 */

import { TenantAuditLogsService } from './tenant-audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

interface FindManyArgs {
  where: Prisma.AuditLogWhereInput;
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
  return { service: new TenantAuditLogsService(prisma), captured };
}

const supportRow = {
  id: 'log-1',
  at: new Date('2026-09-04T12:00:00Z'),
  action: 'support_access',
  entity: '/api/persons',
  congregation_id: 'cong-1',
  actor_user_id: 'support-user',
  actor_name_snapshot: 'Ana Suporte',
  after: { route: '/api/persons', method: 'GET', status: 200 },
};

const transferRow = {
  id: 'log-2',
  at: new Date('2026-09-05T09:00:00Z'),
  action: 'tenant_transfer',
  entity: 'user_account',
  congregation_id: null,
  actor_user_id: 'support-user',
  actor_name_snapshot: 'Ana Suporte',
  after: { tenant_id: 'tenant-destino', congregation_id: 'cong-destino' },
};

describe('TenantAuditLogsService', () => {
  it('sem filtro de ação, lê só as ações da lista do tenant — `platform_access` fica fora', async () => {
    const { service, captured } = serviceWith([]);

    await service.list('tenant-1', {});

    expect(captured.findMany!.where).toEqual({
      tenant_id: 'tenant-1',
      action: { in: ['support_access', 'tenant_transfer'] },
    });
    // O mesmo `where` do count: página e total precisam falar da mesma lista.
    expect(captured.countWhere).toEqual(captured.findMany!.where);
  });

  it('com filtro de ação, usa a ação pedida', async () => {
    const { service, captured } = serviceWith([]);

    await service.list('tenant-1', { action: 'tenant_transfer' });

    expect(captured.findMany!.where.action).toBe('tenant_transfer');
  });

  it('o tenant do token entra no where, além do RLS', async () => {
    const { service, captured } = serviceWith([]);

    await service.list('tenant-outro', {});

    expect(captured.findMany!.where.tenant_id).toBe('tenant-outro');
  });

  it('achata `support_access`: rota, método e status saem do `after`', async () => {
    const { service } = serviceWith([supportRow]);

    const { data } = await service.list('tenant-1', {});

    expect(data[0]).toEqual({
      id: 'log-1',
      at: supportRow.at,
      action: 'support_access',
      entity: '/api/persons',
      congregation_id: 'cong-1',
      actor_user_id: 'support-user',
      actor_name: 'Ana Suporte',
      route: '/api/persons',
      method: 'GET',
      status: 200,
    });
  });

  it('não devolve `ip` nem `user_agent` — são rastro do console, não da igreja', async () => {
    const { service, captured } = serviceWith([supportRow]);

    const { data } = await service.list('tenant-1', {});

    expect(data[0]).not.toHaveProperty('ip');
    expect(data[0]).not.toHaveProperty('user_agent');
    // E nem são lidos do banco: o `select` não os pede.
    expect(Object.keys((captured.findMany as unknown as { select: object }).select)).not.toContain(
      'ip',
    );
  });

  it('em `tenant_transfer` o `after` é outro — rota, método e status vêm nulos', async () => {
    const { service } = serviceWith([transferRow]);

    const { data } = await service.list('tenant-1', {});

    expect(data[0]).toMatchObject({
      action: 'tenant_transfer',
      entity: 'user_account',
      route: null,
      method: null,
      status: null,
    });
  });

  it('`after` nulo não quebra o achatamento — cai na própria `entity`', async () => {
    const { service } = serviceWith([{ ...supportRow, after: null }]);

    const { data } = await service.list('tenant-1', {});

    expect(data[0]).toMatchObject({ route: '/api/persons', method: null, status: null });
  });

  it('o nome do autor vem do snapshot, não de join — e nulo continua nulo', async () => {
    const { service, captured } = serviceWith([{ ...supportRow, actor_name_snapshot: null }]);

    const { data } = await service.list('tenant-1', {});

    expect(data[0]!.actor_name).toBeNull();
    // Sem `include`/`select` de relação: sob o RLS do tenant o join voltaria
    // vazio justamente nas linhas que importam.
    const select = (captured.findMany as unknown as { select: Record<string, unknown> }).select;
    expect(select['actorUser']).toBeUndefined();
    expect(select['tenant']).toBeUndefined();
  });

  it('pagina a partir de 1 e devolve página e limite como vieram', async () => {
    const { service, captured } = serviceWith([], 57);

    const page = await service.list('tenant-1', { page: 3, limit: 10 });

    expect(captured.findMany).toMatchObject({ skip: 20, take: 10 });
    expect(page).toMatchObject({ total: 57, page: 3, limit: 10 });
  });

  it('sem paginação explícita, default de 20 na primeira página', async () => {
    const { service, captured } = serviceWith([]);

    const page = await service.list('tenant-1', {});

    expect(captured.findMany).toMatchObject({ skip: 0, take: 20 });
    expect(page).toMatchObject({ page: 1, limit: 20 });
  });

  describe('janela de datas', () => {
    it('sem `from` nem `to`, não há filtro de `at`', async () => {
      const { service, captured } = serviceWith([]);

      await service.list('tenant-1', {});

      expect(captured.findMany!.where.at).toBeUndefined();
    });

    it('`to` em data pura fecha o dia inteiro — `< dia seguinte`, não `<= 00:00`', async () => {
      const { service, captured } = serviceWith([]);

      await service.list('tenant-1', { from: '2026-09-01', to: '2026-09-14' });

      expect(captured.findMany!.where.at).toEqual({
        gte: new Date('2026-09-01'),
        lt: new Date('2026-09-15T00:00:00.000Z'),
      });
    });

    it('`to` com hora é comparado como veio, inclusivo', async () => {
      const { service, captured } = serviceWith([]);

      await service.list('tenant-1', { to: '2026-09-14T12:30:00.000Z' });

      expect(captured.findMany!.where.at).toEqual({
        lte: new Date('2026-09-14T12:30:00.000Z'),
      });
    });

    it('só `from` também vira janela', async () => {
      const { service, captured } = serviceWith([]);

      await service.list('tenant-1', { from: '2026-09-01' });

      expect(captured.findMany!.where.at).toEqual({ gte: new Date('2026-09-01') });
    });
  });
});
