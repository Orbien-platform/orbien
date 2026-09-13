/**
 * P2 da spec `login-email-global`: mover UserAccount + Person (mesma pessoa)
 * de um tenant para outro sem duplicar conta. O que importa provar aqui:
 * atomicidade da mudança de tenant, revogação de sessão, papéis zerados no
 * tenant de origem (exceto platform_support, global) e o registro de
 * auditoria com before/after e nome do autor congelado — sem que uma falha
 * no audit_insert desfaça a transferência já confirmada.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransferUserAccountService } from './transfer-user-account.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransferUserAccountDto } from './dto/transfer-user-account.dto';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const dto: TransferUserAccountDto = {
  destination_tenant_id: 'tenant-dest',
  destination_congregation_id: 'cong-dest',
};

const actor: JwtPayload = {
  sub: 'support-1',
  tenant_id: 'tenant-support-home',
  congregation_id: 'cong-support-home',
  roles: ['platform_support'],
  plan: 'starter',
};

function serviceWith(
  overrides: {
    account?: unknown;
    tenant?: unknown;
    congregation?: unknown;
    tx?: Record<string, unknown>;
    client?: Record<string, unknown>;
  } = {},
) {
  const calls: string[] = [];
  const captured: Record<string, unknown> = {};

  const account =
    overrides.account !== undefined
      ? overrides.account
      : {
          id: 'user-1',
          tenant_id: 'tenant-origin',
          congregation_id: 'cong-origin',
          person_id: 'person-1',
        };

  const tenant =
    overrides.tenant !== undefined ? overrides.tenant : { id: 'tenant-dest', is_active: true };

  const congregation =
    overrides.congregation !== undefined
      ? overrides.congregation
      : { id: 'cong-dest', tenant_id: 'tenant-dest' };

  const tx = {
    userAccount: {
      update: (args: { data: unknown }) => {
        calls.push('userAccount.update');
        captured['userAccountUpdate'] = args.data;
        return Promise.resolve({});
      },
    },
    person: {
      update: (args: { where: { id: string }; data: unknown }) => {
        calls.push('person.update');
        captured['personUpdateWhere'] = args.where;
        captured['personUpdateData'] = args.data;
        return Promise.resolve({});
      },
    },
    roleAssignment: {
      deleteMany: (args: { where: unknown }) => {
        calls.push('roleAssignment.deleteMany');
        captured['roleAssignmentWhere'] = args.where;
        return Promise.resolve({ count: 2 });
      },
    },
    refreshToken: {
      updateMany: (args: { where: unknown; data: { revoked_at: Date } }) => {
        calls.push('refreshToken.updateMany');
        captured['refreshTokenWhere'] = args.where;
        captured['refreshTokenData'] = args.data;
        return Promise.resolve({ count: 1 });
      },
    },
    ...overrides.tx,
  };

  const client = {
    userAccount: { findUnique: () => Promise.resolve(account) },
    tenant: { findUnique: () => Promise.resolve(tenant) },
    congregation: { findUnique: () => Promise.resolve(congregation) },
    $queryRaw: () => Promise.resolve([{ resolve_actor_name: 'Suporte Plataforma' }]),
    $executeRaw: (...args: unknown[]) => {
      calls.push('audit_insert');
      captured['auditRawArgs'] = args;
      return Promise.resolve(1);
    },
    ...overrides.client,
  };

  const prisma = {
    client,
    runInTx: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;

  return { service: new TransferUserAccountService(prisma), calls, captured };
}

describe('TransferUserAccountService', () => {
  it('AC1: move UserAccount e Person (mesmo person_id) para o tenant/congregação de destino, na mesma transação', async () => {
    const { service, calls, captured } = serviceWith();

    const result = await service.transfer('user-1', dto, actor);

    expect(calls).toEqual([
      'userAccount.update',
      'person.update',
      'roleAssignment.deleteMany',
      'refreshToken.updateMany',
      'audit_insert',
    ]);
    expect(captured['userAccountUpdate']).toEqual({
      tenant_id: 'tenant-dest',
      congregation_id: 'cong-dest',
    });
    expect(captured['personUpdateWhere']).toEqual({ id: 'person-1' });
    expect(captured['personUpdateData']).toEqual({
      tenant_id: 'tenant-dest',
      congregation_id: 'cong-dest',
    });
    expect(result).toEqual({
      user_account_id: 'user-1',
      previous_tenant_id: 'tenant-origin',
      previous_congregation_id: 'cong-origin',
      tenant_id: 'tenant-dest',
      congregation_id: 'cong-dest',
    });
  });

  it('conta sem person_id (caso raro): não chama person.update, mas transfere a conta', async () => {
    const { service, calls } = serviceWith({
      account: {
        id: 'user-1',
        tenant_id: 'tenant-origin',
        congregation_id: 'cong-origin',
        person_id: null,
      },
    });

    await service.transfer('user-1', dto, actor);

    expect(calls).not.toContain('person.update');
    expect(calls).toContain('userAccount.update');
  });

  it('AC2: revoga toda a família de refresh tokens ativos da conta', async () => {
    const { service, captured } = serviceWith();

    await service.transfer('user-1', dto, actor);

    expect(captured['refreshTokenWhere']).toEqual({
      user_account_id: 'user-1',
      revoked_at: null,
    });
    expect((captured['refreshTokenData'] as { revoked_at: Date }).revoked_at).toBeInstanceOf(Date);
  });

  it('AC3: remove role_assignments do tenant de origem, exceto platform_support', async () => {
    const { service, captured } = serviceWith();

    await service.transfer('user-1', dto, actor);

    expect(captured['roleAssignmentWhere']).toEqual({
      user_account_id: 'user-1',
      tenant_id: 'tenant-origin',
      role_code: { not: 'platform_support' },
    });
  });

  it('AC4/AC5: grava audit_logs com before/after de tenant/congregação e actor_name_snapshot resolvido', async () => {
    const { service, captured } = serviceWith();

    await service.transfer('user-1', dto, actor);

    const rawArgs = captured['auditRawArgs'] as unknown[];
    // $executeRaw`SELECT audit_insert(${p1}::text, ${p2}::text, ...)` chama a
    // função com (templateStrings, ...valores interpolados) — os valores, na
    // mesma ordem de audit_insert(): tenant, congregation, actor, subject,
    // entity, action, before, after, ip, user_agent, actor_name_snapshot.
    const values = rawArgs.slice(1);
    expect(values[0]).toBe('tenant-origin'); // p_tenant_id — no tenant de ORIGEM
    expect(values[1]).toBe('cong-origin'); // p_congregation_id
    expect(values[2]).toBe('support-1'); // p_actor_user_id
    expect(values[3]).toBeNull(); // p_subject_person_id
    expect(values[4]).toBe('user_account'); // p_entity
    expect(values[5]).toBe('tenant_transfer'); // p_action
    expect(JSON.parse(values[6] as string)).toEqual({
      tenant_id: 'tenant-origin',
      congregation_id: 'cong-origin',
    });
    expect(JSON.parse(values[7] as string)).toEqual({
      tenant_id: 'tenant-dest',
      congregation_id: 'cong-dest',
    });
    expect(values[10]).toBe('Suporte Plataforma'); // p_actor_name_snapshot
  });

  it('AC4/AC5: ator sem pessoa vinculada grava actor_name_snapshot NULL, sem quebrar o audit_insert', async () => {
    // Mesmo caso de borda de AuditInterceptor: resolve_actor_name() devolve
    // null quando o actor_user_id não tem person_id — o `?? null` cobre
    // tanto isso quanto rows vazio.
    const { service, captured } = serviceWith({
      client: { $queryRaw: () => Promise.resolve([{ resolve_actor_name: null }]) },
    });

    await service.transfer('user-1', dto, actor);

    const rawArgs = captured['auditRawArgs'] as unknown[];
    const values = rawArgs.slice(1);
    expect(values[10]).toBeNull(); // p_actor_name_snapshot
  });

  it('no-op: transferir para o mesmo tenant em que a conta já está vira 400 e não move nada', async () => {
    const { service, calls } = serviceWith({
      account: {
        id: 'user-1',
        tenant_id: 'tenant-dest',
        congregation_id: 'cong-origin',
        person_id: 'person-1',
      },
    });

    await expect(service.transfer('user-1', dto, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(calls).toEqual([]);
  });

  it('conta a transferir não encontrada vira 404 e não move nada', async () => {
    const { service, calls } = serviceWith({ account: null });

    await expect(service.transfer('user-inexistente', dto, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(calls).toEqual([]);
  });

  it('tenant de destino inexistente vira 404 e não move nada', async () => {
    const { service, calls } = serviceWith({ tenant: null });

    await expect(service.transfer('user-1', dto, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(calls).toEqual([]);
  });

  it('tenant de destino inativo vira 400 e não move nada', async () => {
    const { service, calls } = serviceWith({ tenant: { id: 'tenant-dest', is_active: false } });

    await expect(service.transfer('user-1', dto, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(calls).toEqual([]);
  });

  it('congregação de destino inexistente vira 404 e não move nada', async () => {
    const { service, calls } = serviceWith({ congregation: null });

    await expect(service.transfer('user-1', dto, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(calls).toEqual([]);
  });

  it('congregação de destino que não pertence ao tenant de destino vira 400 e não move nada', async () => {
    const { service, calls } = serviceWith({
      congregation: { id: 'cong-dest', tenant_id: 'outro-tenant' },
    });

    await expect(service.transfer('user-1', dto, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(calls).toEqual([]);
  });

  it('falha do audit_insert não desfaz a transferência (best-effort, mesmo princípio do AuditInterceptor)', async () => {
    const boom = new Error('audit_logs indisponível');
    const { service, calls, captured } = serviceWith({
      client: {
        $executeRaw: () => Promise.reject(boom),
      },
    });

    const result = await service.transfer('user-1', dto, actor);

    expect(result.tenant_id).toBe('tenant-dest');
    expect(calls).toEqual([
      'userAccount.update',
      'person.update',
      'roleAssignment.deleteMany',
      'refreshToken.updateMany',
    ]);
    expect(captured['auditRawArgs']).toBeUndefined();
  });
});
