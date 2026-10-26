import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { loadTestTenant, type TestTenant } from './test-tenants';

/**
 * Base dos testes de integração do módulo Kids: sobe o AppModule com o mesmo
 * pipe do `main.ts`, cria uma conta de cada tenant de teste e entrega um
 * `tokenFor(papel…)`. Roda só em `teste1-church` (Starter) e `teste2-church`
 * (Premium); quem usa limpa o que criou.
 */
export type KidsHarness = {
  app: INestApplication;
  /** Premium: onde as rotas funcionam. */
  t2: TestTenant;
  /** Starter: prova o gate de plano e serve de "outro tenant" no isolamento. */
  t1: TestTenant;
  /** Token do `teste2-church` com os papéis dados. */
  tokenFor: (...roles: string[]) => string;
  /** Token do `teste1-church` com o plano afirmado no token (isolamento por RLS). */
  tokenT1: (plan: 'starter' | 'premium', ...roles: string[]) => string;
  close: () => Promise<void>;
};

export async function bootKids(admin: PrismaClient, tag: string): Promise<KidsHarness> {
  const t1 = await loadTestTenant(admin, 'teste1-church');
  const t2 = await loadTestTenant(admin, 'teste2-church');
  const ts = Date.now();

  const mkAccount = async (t: TestTenant, slug: string) =>
    admin.userAccount.create({
      data: {
        tenant_id: t.tenantId,
        congregation_id: t.congregationId,
        email: `${tag}-${ts}@${slug}.fake`,
        password_hash: 'x',
        is_active: true,
      },
    });
  const acc1 = await mkAccount(t1, 'teste1');
  const acc2 = await mkAccount(t2, 'teste2');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.init();

  const jwt = app.get(JwtService);
  const sign = (acc: { id: string; email: string }, t: TestTenant, plan: string, roles: string[]) =>
    jwt.sign({
      sub: acc.id,
      email: acc.email,
      tenant_id: t.tenantId,
      congregation_id: t.congregationId,
      roles,
      plan,
    });

  return {
    app,
    t1,
    t2,
    tokenFor: (...roles) => sign(acc2, t2, 'premium', roles),
    tokenT1: (plan, ...roles) => sign(acc1, t1, plan, roles),
    close: async () => {
      await admin.userAccount.deleteMany({ where: { id: { in: [acc1.id, acc2.id] } } });
      await app.close();
    },
  };
}
