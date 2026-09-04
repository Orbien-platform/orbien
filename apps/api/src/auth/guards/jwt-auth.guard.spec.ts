import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * O que importa testar aqui é a contenção do ticket de upload.
 *
 * O ticket é entregue ao JavaScript da página — é o preço de o arquivo ir
 * direto para a API, fora do proxy do Next. Fica legível, então precisa não
 * servir para mais nada: qualquer rota que não seja a de upload tem que
 * recusá-lo, inclusive as que não têm `@Roles` e por isso passam batido pelo
 * `RolesGuard`.
 */

const base: JwtPayload = {
  sub: 'user-1',
  tenant_id: 't-1',
  congregation_id: 'c-1',
  roles: ['tenant_admin'],
  plan: 'starter',
};

function contexto(user: JwtPayload): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => 'handler',
    getClass: () => 'class',
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  // `super.canActivate` chama o passport de verdade; aqui só interessa o que
  // o guard faz DEPOIS de autenticar, então o pai é substituído.
  const pai = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
    canActivate: unknown;
  };
  const original = pai.canActivate;

  beforeEach(() => {
    pai.canActivate = jest.fn().mockResolvedValue(true);
  });

  afterAll(() => {
    pai.canActivate = original;
  });

  function guard(rotaDeUpload: boolean | undefined): JwtAuthGuard {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(rotaDeUpload),
    } as unknown as Reflector;
    return new JwtAuthGuard(reflector);
  }

  it('deixa passar token normal em rota comum', async () => {
    await expect(guard(undefined).canActivate(contexto(base))).resolves.toBe(true);
  });

  it('recusa ticket de upload em rota que não é a de upload', async () => {
    const ticket: JwtPayload = { ...base, roles: [], scope: 'upload', upload_target: 'p-1' };
    await expect(guard(undefined).canActivate(contexto(ticket))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('deixa o ticket passar na rota marcada com @UploadTicketRoute', async () => {
    const ticket: JwtPayload = { ...base, roles: [], scope: 'upload', upload_target: 'p-1' };
    await expect(guard(true).canActivate(contexto(ticket))).resolves.toBe(true);
  });

  it('não deixa passar quando o passport já recusou', async () => {
    pai.canActivate = jest.fn().mockResolvedValue(false);
    await expect(guard(true).canActivate(contexto(base))).resolves.toBe(false);
  });
});
