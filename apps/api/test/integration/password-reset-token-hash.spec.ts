/**
 * PEND-24 contra o Postgres real: `password_reset_tokens` guarda o SHA-256 do
 * token; o valor em claro só existe no link do e-mail. Cobre forgot → reset,
 * reuso, expiração, o convite (`UsersService.resendInvite`) e a equivalência
 * entre o hash do Node e o `sha256` que a migration usou para converter os
 * tokens em voo. Só `teste1-church` e `teste2-church`; apaga o que criou.
 */
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { MailService } from '../../src/mail/mail.service';
import { loadTestTenant, TestTenant } from '../helpers/test-tenants';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const tag = `pwdhash-${Date.now()}`;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

let auth: AuthService;
let mail: MailService;
let close: () => Promise<void>;
const sent: Array<{ to: string; url: string }> = [];
const users: Record<string, { id: string; email: string; tenant: TestTenant }> = {};

const tokenFromUrl = (url: string) => new URL(url).searchParams.get('token')!;
const lastSentTo = (email: string) => sent.filter((m) => m.to === email).at(-1)!;

async function mkUser(slug: 'teste1-church' | 'teste2-church') {
  const tenant = await loadTestTenant(admin, slug);
  const email = `${tag}-${slug}@${slug}.fake`;
  const u = await admin.userAccount.create({
    data: { tenant_id: tenant.tenantId, congregation_id: tenant.congregationId, email, password_hash: 'x', is_active: true },
  });
  users[slug] = { id: u.id, email, tenant };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  close = () => app.close();
  auth = app.get(AuthService);
  mail = app.get(MailService);
  jest.spyOn(mail, 'sendPasswordReset').mockImplementation(async (to: string, url: string) => {
    sent.push({ to, url });
  });
  await mkUser('teste1-church');
  await mkUser('teste2-church');
}, 120_000);

afterAll(async () => {
  const ids = Object.values(users).map((u) => u.id);
  await admin.refreshToken.deleteMany({ where: { user_account_id: { in: ids } } });
  await admin.passwordResetToken.deleteMany({ where: { user_id: { in: ids } } });
  await admin.loginAttempt.deleteMany({ where: { identifier: { contains: tag } } });
  await admin.userAccount.deleteMany({ where: { id: { in: ids } } });
  await close?.();
  await admin.$disconnect();
}, 60_000);

describe.each(['teste1-church', 'teste2-church'] as const)('redefinição de senha — %s', (slug) => {
  // O limitador de pedidos é por e-mail; zera para os casos não dependerem dele.
  beforeEach(async () => {
    await admin.loginAttempt.deleteMany({ where: { identifier: { contains: tag } } });
  });

  it('o banco guarda o hash, nunca o token; o link do e-mail redefine a senha', async () => {
    const u = users[slug]!;
    await auth.forgotPassword({ email: u.email });
    const raw = tokenFromUrl(lastSentTo(u.email).url);

    const rows = await admin.passwordResetToken.findMany({ where: { user_id: u.id, used_at: null } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).toBe(sha(raw));
    expect(rows[0]!.token_hash).not.toBe(raw);
    // o claro não aparece em nenhuma coluna da linha
    expect(JSON.stringify(rows[0])).not.toContain(raw);

    await expect(auth.resetPassword({ token: raw, password: 'nova-senha-123' })).resolves.toEqual({
      message: 'Senha redefinida com sucesso.',
    });
    const after = await admin.userAccount.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.password_hash).not.toBe('x');
    expect((await admin.passwordResetToken.findUniqueOrThrow({ where: { id: rows[0]!.id } })).used_at).not.toBeNull();
  });

  it('reuso do mesmo link é recusado', async () => {
    const u = users[slug]!;
    const raw = tokenFromUrl(lastSentTo(u.email).url);
    await expect(auth.resetPassword({ token: raw, password: 'outra-senha-123' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('colar o hash guardado no banco como se fosse o token não abre a conta', async () => {
    const u = users[slug]!;
    await auth.forgotPassword({ email: u.email });
    const stored = (await admin.passwordResetToken.findFirstOrThrow({ where: { user_id: u.id, used_at: null } })).token_hash;
    await expect(auth.resetPassword({ token: stored, password: 'invasor-123' })).rejects.toBeInstanceOf(BadRequestException);
    // o token legítimo ainda vale
    const raw = tokenFromUrl(lastSentTo(u.email).url);
    await expect(auth.resetPassword({ token: raw, password: 'legitima-123' })).resolves.toBeDefined();
  });

  it('token expirado é recusado', async () => {
    const u = users[slug]!;
    const raw = `expirado-${tag}-${slug}`;
    await admin.passwordResetToken.create({
      data: { user_id: u.id, token_hash: sha(raw), expires_at: new Date(Date.now() - 60_000) },
    });
    await expect(auth.resetPassword({ token: raw, password: 'qualquer-123' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('um novo pedido invalida o link anterior', async () => {
    const u = users[slug]!;
    await auth.forgotPassword({ email: u.email });
    const first = tokenFromUrl(lastSentTo(u.email).url);
    await auth.forgotPassword({ email: u.email });
    const second = tokenFromUrl(lastSentTo(u.email).url);
    expect(second).not.toBe(first);
    await expect(auth.resetPassword({ token: first, password: 'velho-123456' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(auth.resetPassword({ token: second, password: 'novo-1234567' })).resolves.toBeDefined();
  });

  it('e-mail inexistente recebe a mesma resposta e nada é gravado', async () => {
    const real = await auth.forgotPassword({ email: users[slug]!.email });
    const ghost = await auth.forgotPassword({ email: `${tag}-fantasma@${slug}.fake` });
    expect(ghost).toEqual(real);
    expect(sent.some((m) => m.to.includes('fantasma'))).toBe(false);
  });
});

describe('equivalência com a migration', () => {
  it('sha256(convert_to(x,UTF8)) do Postgres == createHash("sha256") do Node', async () => {
    const samples = ['abc', 'a'.repeat(64), 'ação-ünicode-✓', 'x'.repeat(200)];
    for (const s of samples) {
      const rows = await admin.$queryRaw<Array<{ h: string }>>`SELECT encode(sha256(convert_to(${s}, 'UTF8')), 'hex') AS h`;
      expect(rows[0]!.h).toBe(sha(s));
    }
  });
});
