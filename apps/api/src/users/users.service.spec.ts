/**
 * O que importa aqui: quem cria o login não pode se auto-promover a
 * `tenant_admin` sem já ser um, a pessoa tem que existir e não ter conta
 * ativa ainda, e o e-mail duplicado vira 409 — não 500.
 */

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateUserDto } from './dto/create-user.dto';

const actor: JwtPayload = {
  sub: 'user-ator',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['pastor'],
  plan: 'starter',
};

const dto: CreateUserDto = {
  person_id: 'person-1',
  email: 'novo@igreja.test',
  role_code: 'secretary',
};

function serviceWith(overrides: {
  person?: unknown;
  createUserAccount?: (args: { data: unknown }) => Promise<unknown>;
} = {}) {
  const person =
    'person' in overrides
      ? overrides.person
      : { id: 'person-1', congregation_id: 'cong-1', userAccounts: [] };

  const roleAssignmentCreate = jest.fn().mockResolvedValue({});
  const passwordResetTokenCreate = jest.fn().mockResolvedValue({});
  const userAccountCreate =
    overrides.createUserAccount ??
    (async ({ data }: { data: { email: string } }) => ({ id: 'user-novo', email: data.email }));

  const tx = {
    person: { findUnique: () => Promise.resolve(person) },
  };

  const sysTx = {
    userAccount: { create: userAccountCreate },
    roleAssignment: { create: roleAssignmentCreate },
    passwordResetToken: { create: passwordResetTokenCreate },
  };

  const prisma = {
    runInTx: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    system: { $transaction: (fn: (t: typeof sysTx) => Promise<unknown>) => fn(sysTx) },
  } as unknown as PrismaService;

  const mail = { sendInvite: jest.fn().mockResolvedValue(undefined) } as unknown as MailService;

  return { service: new UsersService(prisma, mail), mail, roleAssignmentCreate };
}

describe('UsersService', () => {
  it('cria a conta, o papel e o token de convite, e envia o e-mail', async () => {
    const { service, mail, roleAssignmentCreate } = serviceWith();

    const result = await service.create(dto, actor);

    expect(result).toEqual({ id: 'user-novo', email: dto.email });
    expect(roleAssignmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role_code: 'secretary',
          user_account_id: 'user-novo',
          congregation_id: 'cong-1',
        }),
      }),
    );
    expect(mail.sendInvite).toHaveBeenCalledWith(dto.email, expect.stringContaining('/redefinir-senha?token='));
  });

  it('rejeita pastor tentando conceder tenant_admin', async () => {
    const { service } = serviceWith();

    await expect(
      service.create({ ...dto, role_code: 'tenant_admin' }, actor),
    ).rejects.toThrow(ForbiddenException);
  });

  it('permite tenant_admin conceder tenant_admin', async () => {
    const { service } = serviceWith();
    const tenantAdminActor: JwtPayload = { ...actor, roles: ['tenant_admin'] };

    await expect(
      service.create({ ...dto, role_code: 'tenant_admin' }, tenantAdminActor),
    ).resolves.toEqual({ id: 'user-novo', email: dto.email });
  });

  it('404 quando a pessoa não existe (ou o RLS escondeu de outra congregação)', async () => {
    const { service } = serviceWith({ person: null });

    await expect(service.create(dto, actor)).rejects.toThrow(NotFoundException);
  });

  it('409 quando a pessoa já tem uma conta ativa', async () => {
    const { service } = serviceWith({
      person: { id: 'person-1', congregation_id: 'cong-1', userAccounts: [{ id: 'user-existente' }] },
    });

    await expect(service.create(dto, actor)).rejects.toThrow(ConflictException);
  });

  it('409 quando o e-mail já existe no tenant (P2002)', async () => {
    const { service } = serviceWith({
      createUserAccount: async () => {
        throw new Prisma.PrismaClientKnownRequestError('duplicado', {
          code: 'P2002',
          clientVersion: '6.0.0',
        });
      },
    });

    await expect(service.create(dto, actor)).rejects.toThrow(ConflictException);
  });

  it('propaga sem embrulhar um erro do banco que não é de e-mail duplicado', async () => {
    const { service } = serviceWith({
      createUserAccount: async () => {
        throw new Error('conexão perdida');
      },
    });

    await expect(service.create(dto, actor)).rejects.toThrow('conexão perdida');
  });

  it('usa FRONTEND_URL do ambiente no link do convite, em vez do default de localhost', async () => {
    const original = process.env['FRONTEND_URL'];
    process.env['FRONTEND_URL'] = 'https://app.orbien.com.br';
    try {
      const { service, mail } = serviceWith();
      await service.create(dto, actor);
      expect(mail.sendInvite).toHaveBeenCalledWith(
        dto.email,
        expect.stringMatching(/^https:\/\/app\.orbien\.com\.br\/redefinir-senha\?token=/),
      );
    } finally {
      if (original === undefined) delete process.env['FRONTEND_URL'];
      else process.env['FRONTEND_URL'] = original;
    }
  });

  it('cai no default de localhost quando FRONTEND_URL não está definida', async () => {
    const original = process.env['FRONTEND_URL'];
    delete process.env['FRONTEND_URL'];
    try {
      const { service, mail } = serviceWith();
      await service.create(dto, actor);
      expect(mail.sendInvite).toHaveBeenCalledWith(
        dto.email,
        expect.stringMatching(/^http:\/\/localhost:3001\/redefinir-senha\?token=/),
      );
    } finally {
      if (original === undefined) delete process.env['FRONTEND_URL'];
      else process.env['FRONTEND_URL'] = original;
    }
  });
});
