/**
 * O que importa aqui é a atomicidade e a ordem: tenant, plano, branding,
 * congregação, conta admin e papel, tudo numa transação só. Um tenant meio
 * criado é pior que nenhum — fica invisível para quem provisionou e quebra o
 * login de quem recebeu o convite.
 */

import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProvisionTenantService } from './provision-tenant.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';

const dto: ProvisionTenantDto = {
  slug: 'igreja-nova',
  name: 'Igreja Nova',
  congregation_name: 'Igreja Nova — Sede',
  admin_name: 'Pastor Novo',
  admin_email: 'pastor@igreja-nova.test',
  admin_password: 'senha-forte-123',
};

function serviceWith(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const captured: Record<string, unknown> = {};
  const categories: unknown[] = [];

  const tx = {
    role: { findUnique: () => Promise.resolve({ code: 'tenant_admin', name: 'Admin' }) },
    tenant: {
      create: (args: { data: unknown }) => {
        calls.push('tenant');
        captured['tenant'] = args.data;
        return Promise.resolve({ id: 'tenant-novo', slug: dto.slug });
      },
    },
    tenantPlan: {
      create: (args: { data: unknown }) => {
        calls.push('tenantPlan');
        captured['plan'] = args.data;
        return Promise.resolve({});
      },
    },
    brandingConfig: {
      create: () => {
        calls.push('brandingConfig');
        return Promise.resolve({});
      },
    },
    congregation: {
      create: (args: { data: unknown }) => {
        calls.push('congregation');
        captured['congregation'] = args.data;
        return Promise.resolve({ id: 'cong-nova' });
      },
    },
    person: {
      create: (args: { data: unknown }) => {
        calls.push('person');
        captured['person'] = args.data;
        return Promise.resolve({ id: 'person-novo' });
      },
    },
    userAccount: {
      create: (args: { data: { password_hash: string } }) => {
        calls.push('userAccount');
        captured['user'] = args.data;
        return Promise.resolve({ id: 'user-novo' });
      },
    },
    roleAssignment: {
      create: (args: { data: unknown }) => {
        calls.push('roleAssignment');
        captured['assignment'] = args.data;
        return Promise.resolve({});
      },
    },
    financialCategory: {
      create: (args: { data: unknown }) => {
        calls.push('financialCategory');
        categories.push(args.data);
        return Promise.resolve({});
      },
    },
    waitlistSubscriber: {
      findUnique: () => {
        throw new Error('waitlistSubscriber.findUnique não mockado neste teste');
      },
      update: (args: { data: unknown }) => {
        calls.push('waitlistSubscriber');
        captured['waitlistUpdate'] = args.data;
        return Promise.resolve({});
      },
    },
    ...overrides,
  };

  const prisma = {
    runInTx: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;

  return { service: new ProvisionTenantService(prisma), calls, captured, categories };
}

describe('ProvisionTenantService', () => {
  it('cria as peças numa transação só, nessa ordem', async () => {
    const { service, calls } = serviceWith();

    const result = await service.provision(dto);

    expect(calls).toEqual([
      'tenant',
      'tenantPlan',
      'brandingConfig',
      'congregation',
      'person',
      'userAccount',
      'roleAssignment',
      ...Array(12).fill('financialCategory'),
    ]);
    expect(result).toEqual({
      tenant_id: 'tenant-novo',
      slug: 'igreja-nova',
      congregation_id: 'cong-nova',
      admin_user_id: 'user-novo',
    });
  });

  it('DT-04: cria a Person do admin e vincula person_id no UserAccount', async () => {
    const { service, captured } = serviceWith();
    await service.provision(dto);

    expect(captured['person']).toEqual({
      tenant_id: 'tenant-novo',
      congregation_id: 'cong-nova',
      full_name: 'Pastor Novo',
      email: 'pastor@igreja-nova.test',
    });
    expect((captured['user'] as { person_id: string }).person_id).toBe('person-novo');
  });

  it('DT-04: semeia as 12 categorias financeiras padrão na congregação', async () => {
    const { service, categories } = serviceWith();
    await service.provision(dto);

    expect(categories).toHaveLength(12);
    expect(categories.every((c) => (c as { tenant_id: string }).tenant_id === 'tenant-novo')).toBe(
      true,
    );
    expect(categories.every((c) => (c as { congregation_id: string }).congregation_id === 'cong-nova')).toBe(
      true,
    );
    expect(categories.filter((c) => (c as { type: string }).type === 'income')).toHaveLength(6);
    expect(categories.filter((c) => (c as { type: string }).type === 'expense')).toHaveLength(6);
  });

  it('nunca grava a senha em claro', async () => {
    const { service, captured } = serviceWith();
    await service.provision(dto);

    const user = captured['user'] as { password_hash: string };
    expect(user.password_hash).not.toContain(dto.admin_password);
    expect(user.password_hash.startsWith('$argon2')).toBe(true);
  });

  it('a conta inicial recebe tenant_admin no tenant e na congregação criados', async () => {
    const { service, captured } = serviceWith();
    await service.provision(dto);

    expect(captured['assignment']).toEqual({
      tenant_id: 'tenant-novo',
      congregation_id: 'cong-nova',
      user_account_id: 'user-novo',
      role_code: 'tenant_admin',
    });
  });

  it('plano padrão é starter em trial', async () => {
    const { service, captured } = serviceWith();
    await service.provision(dto);

    const plan = captured['plan'] as { plan: string; status: string; trial_ends_at: Date };
    expect(plan.plan).toBe('starter');
    expect(plan.status).toBe('trial');
    expect(plan.trial_ends_at.getTime()).toBeGreaterThan(Date.now());
  });

  it('respeita o plano pedido', async () => {
    const { service, captured } = serviceWith();
    await service.provision({ ...dto, plan: 'premium' as ProvisionTenantDto['plan'] });

    expect((captured['plan'] as { plan: string }).plan).toBe('premium');
  });

  it('slug repetido vira 409, não 500', async () => {
    const { service } = serviceWith({
      tenant: {
        create: () =>
          Promise.reject(
            new Prisma.PrismaClientKnownRequestError('unique', {
              code: 'P2002',
              clientVersion: '6.0.0',
            }),
          ),
      },
    });

    await expect(service.provision(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('banco sem os papéis de referência falha antes de criar qualquer coisa', async () => {
    const { service, calls } = serviceWith({
      role: { findUnique: () => Promise.resolve(null) },
    });

    await expect(service.provision(dto)).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(calls).toEqual([]);
  });

  it('erro que não é P2002 sobe como veio', async () => {
    const boom = new Error('conexão caiu');
    const { service } = serviceWith({ tenant: { create: () => Promise.reject(boom) } });

    await expect(service.provision(dto)).rejects.toBe(boom);
  });

  it('com waitlist_lead_id, ativa o lead na mesma transação', async () => {
    const { service, calls, captured } = serviceWith({
      waitlistSubscriber: {
        findUnique: () => Promise.resolve({ id: 'lead-1', tenant_id: null }),
        update: (args: { data: unknown }) => {
          calls.push('waitlistSubscriber');
          captured['waitlistUpdate'] = args.data;
          return Promise.resolve({});
        },
      },
    });

    await service.provision({ ...dto, waitlist_lead_id: 'lead-1' });

    expect(calls).toEqual([
      'tenant',
      'tenantPlan',
      'brandingConfig',
      'congregation',
      'person',
      'userAccount',
      'roleAssignment',
      ...Array(12).fill('financialCategory'),
      'waitlistSubscriber',
    ]);
    expect(captured['waitlistUpdate']).toEqual({
      status: 'activated',
      activated_at: expect.any(Date),
      tenant_id: 'tenant-novo',
    });
  });

  it('lead inexistente vira 404 e não cria nada', async () => {
    const { service, calls } = serviceWith({
      waitlistSubscriber: {
        findUnique: () => Promise.resolve(null),
        update: () => {
          throw new Error('não devia chamar update');
        },
      },
    });

    await expect(
      service.provision({ ...dto, waitlist_lead_id: 'lead-inexistente' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(calls).toEqual([]);
  });

  it('lead já vinculado a outro tenant vira 409 e não cria nada', async () => {
    const { service, calls } = serviceWith({
      waitlistSubscriber: {
        findUnique: () => Promise.resolve({ id: 'lead-1', tenant_id: 'outro-tenant' }),
        update: () => {
          throw new Error('não devia chamar update');
        },
      },
    });

    await expect(
      service.provision({ ...dto, waitlist_lead_id: 'lead-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(calls).toEqual([]);
  });
});
