import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';

export interface UpdatedTenant {
  tenant_id: string;
  slug: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
}

/**
 * Edita os dados de contato de um tenant já provisionado — não mexe em slug,
 * plano nem congregações. Roda pelo mesmo ramo `app_platform_access()` de
 * `ListTenantsService`, então precisa de `@PlatformRoute()` no controller.
 */
@Injectable()
export class UpdateTenantService {
  constructor(private readonly prisma: PrismaService) {}

  async update(id: string, dto: UpdateTenantDto): Promise<UpdatedTenant> {
    try {
      const tenant = await this.prisma.client.tenant.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        },
      });

      return {
        tenant_id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone,
        is_active: tenant.is_active,
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException(`Tenant '${id}' não encontrado`);
      }
      throw err;
    }
  }
}
