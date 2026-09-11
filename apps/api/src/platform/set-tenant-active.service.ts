import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface TenantActiveState {
  tenant_id: string;
  slug: string;
  is_active: boolean;
}

/**
 * Liga/desliga `tenants.is_active`. Quem barra o acesso de fato é o
 * `JwtStrategy.validate` — em toda requisição autenticada, não só no login —
 * o mesmo desenho que já vale para `user_accounts.is_active`. Inativar aqui
 * não derruba sessões em voo: o token de quem já estava logado só para de
 * validar na próxima requisição.
 */
@Injectable()
export class SetTenantActiveService {
  constructor(private readonly prisma: PrismaService) {}

  async setActive(id: string, isActive: boolean): Promise<TenantActiveState> {
    try {
      const tenant = await this.prisma.client.tenant.update({
        where: { id },
        data: { is_active: isActive },
        select: { id: true, slug: true, is_active: true },
      });

      return { tenant_id: tenant.id, slug: tenant.slug, is_active: tenant.is_active };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException(`Tenant '${id}' não encontrado`);
      }
      throw err;
    }
  }
}
