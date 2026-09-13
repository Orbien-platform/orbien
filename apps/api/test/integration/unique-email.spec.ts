/**
 * `user_accounts.email` é único em todo o banco desde a migration
 * `20260913123836_unique_email_global` (login-email-global, T4) — antes disso
 * a unique era só por `(tenant_id, email)`, e o mesmo e-mail podia existir em
 * tenants diferentes. Este teste prova a garantia contra o Postgres real,
 * fabricando exatamente a duplicata que a constraint deve rejeitar — é o
 * "Independent Test" que a spec da feature descreve e que nenhum outro teste
 * exercitava (achado do Verifier).
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */

import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { prismaAdmin } from '../helpers/rls';

const ts = Date.now();
let tenantAId: string;
let tenantBId: string;

async function criarTenant(slug: string, nome: string) {
  const tenant = await prismaAdmin.tenant.create({ data: { slug, name: nome } });
  const cong = await prismaAdmin.congregation.create({
    data: { tenant_id: tenant.id, name: `${nome} — Sede` },
  });
  return { tenantId: tenant.id, congregationId: cong.id };
}

beforeAll(async () => {
  const a = await criarTenant(`unique-email-a-${ts}`, 'Tenant A');
  const b = await criarTenant(`unique-email-b-${ts}`, 'Tenant B');
  tenantAId = a.tenantId;
  tenantBId = b.tenantId;
});

afterAll(async () => {
  const ids = [tenantAId, tenantBId];
  await prismaAdmin.userAccount.deleteMany({ where: { tenant_id: { in: ids } } });
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: ids } } });
  await prismaAdmin.$disconnect();
});

describe('user_accounts.email — unicidade global', () => {
  it('rejeita o mesmo e-mail em tenants diferentes (P2002)', async () => {
    const email = `duplicado-${ts}@orbien.test`;
    const hash = await argon2.hash('senha-de-teste');

    const congA = (await prismaAdmin.tenant.findUniqueOrThrow({ where: { id: tenantAId } }))
      .id;
    const congB = tenantBId;
    const congregationA = (
      await prismaAdmin.congregation.findFirstOrThrow({ where: { tenant_id: congA } })
    ).id;
    const congregationB = (
      await prismaAdmin.congregation.findFirstOrThrow({ where: { tenant_id: congB } })
    ).id;

    await prismaAdmin.userAccount.create({
      data: {
        tenant_id: tenantAId,
        congregation_id: congregationA,
        email,
        password_hash: hash,
      },
    });

    await expect(
      prismaAdmin.userAccount.create({
        data: {
          tenant_id: tenantBId,
          congregation_id: congregationB,
          email,
          password_hash: hash,
        },
      }),
    ).rejects.toMatchObject({
      code: 'P2002',
      meta: expect.objectContaining({ target: expect.arrayContaining(['email']) }),
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });
});
