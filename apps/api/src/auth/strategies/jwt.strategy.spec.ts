import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { findSessionByUserId } from '../auth-lookup';

// PEND-04 D: a leitura da conta vai por `auth_session_lookup` (SECURITY
// DEFINER), não por `prisma.userAccount`. O SQL é coberto em
// `test/rls/auth-tables.spec.ts`.
jest.mock('../auth-lookup');

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

const prisma = {} as unknown as PrismaService;

function sessao(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'user-1',
    tenant_id: 'tenant-1',
    congregation_id: 'cong-1',
    is_active: true,
    tenant_is_active: true,
    plan: 'starter',
    roles: [],
    ...overrides,
  };
}

describe('JwtStrategy', () => {
  beforeEach(() => (findSessionByUserId as jest.Mock).mockReset());

  it('lê JWT_SECRET do ConfigService na construção', () => {
    expect(() => new JwtStrategy(configWith('segredo-de-teste'), prisma)).not.toThrow();
  });

  describe('validate', () => {
    it('devolve o payload quando o usuário e o tenant existem e estão ativos', async () => {
      (findSessionByUserId as jest.Mock).mockResolvedValue(sessao());
      const strategy = new JwtStrategy(configWith('segredo-de-teste'), prisma);

      await expect(strategy.validate(payload)).resolves.toBe(payload);
      expect(findSessionByUserId).toHaveBeenCalledWith(prisma, payload.sub);
    });

    it('rejeita quando o usuário não existe', async () => {
      (findSessionByUserId as jest.Mock).mockResolvedValue(null);
      const strategy = new JwtStrategy(configWith('segredo-de-teste'), prisma);

      await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejeita quando o usuário existe mas está inativo', async () => {
      (findSessionByUserId as jest.Mock).mockResolvedValue(sessao({ is_active: false }));
      const strategy = new JwtStrategy(configWith('segredo-de-teste'), prisma);

      await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejeita quando o usuário está ativo mas o tenant está inativo', async () => {
      (findSessionByUserId as jest.Mock).mockResolvedValue(sessao({ tenant_is_active: false }));
      const strategy = new JwtStrategy(configWith('segredo-de-teste'), prisma);

      await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
