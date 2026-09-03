import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

function configWith(secret: string | undefined): ConfigService {
  return {
    getOrThrow: (key: string) => {
      if (key === 'JWT_SECRET') {
        if (!secret) throw new Error('JWT_SECRET não definido');
        return secret;
      }
      throw new Error(`chave inesperada: ${key}`);
    },
  } as unknown as ConfigService;
}

const payload: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['tenant_admin'],
  plan: 'starter',
};

describe('JwtStrategy', () => {
  it('lê JWT_SECRET do ConfigService na construção', () => {
    const prisma = { userAccount: { findUnique: jest.fn() } } as unknown as PrismaService;
    expect(() => new JwtStrategy(configWith('segredo-de-teste'), prisma)).not.toThrow();
  });

  describe('validate', () => {
    it('devolve o payload quando o usuário existe e está ativo', async () => {
      const findUnique = jest.fn().mockResolvedValue({ is_active: true });
      const prisma = { userAccount: { findUnique } } as unknown as PrismaService;
      const strategy = new JwtStrategy(configWith('segredo-de-teste'), prisma);

      await expect(strategy.validate(payload)).resolves.toBe(payload);
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: payload.sub },
        select: { is_active: true },
      });
    });

    it('rejeita quando o usuário não existe', async () => {
      const prisma = {
        userAccount: { findUnique: jest.fn().mockResolvedValue(null) },
      } as unknown as PrismaService;
      const strategy = new JwtStrategy(configWith('segredo-de-teste'), prisma);

      await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejeita quando o usuário existe mas está inativo', async () => {
      const prisma = {
        userAccount: { findUnique: jest.fn().mockResolvedValue({ is_active: false }) },
      } as unknown as PrismaService;
      const strategy = new JwtStrategy(configWith('segredo-de-teste'), prisma);

      await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
