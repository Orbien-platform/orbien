import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const ALLOWED_LOGO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

export interface ResolvedSettings {
  tenant: { name: string; email: string | null; phone: string | null };
  branding: {
    app_name: string | null;
    primary_color: string | null;
    /**
     * Cor de destaque (accent) — o par de `primary_color`, com a mesma
     * regra de override: congregação primeiro, tenant depois.
     *
     * O nome do campo é `accent_color` porque é assim que o design system
     * chama este papel (§6 de `apps/mobile/STYLE-GUIDE.md`) e é o que o
     * front consome. No banco, a coluna do tenant ainda se chama
     * `secondary_color`, de antes do design system; a da congregação já
     * nasceu `accent_color`. Renomear a do tenant é migration própria.
     */
    accent_color: string | null;
    logo_url: string | null;
    splash_url: string | null;
    /** PROD-19 (Premium) — nulo em Starter e quando não configurado. */
    custom_domain: string | null;
    terms_url: string | null;
  };
  congregation: {
    name: string;
    address: string | null;
    timezone: string;
    email: string | null;
    phone: string | null;
  };
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async getSettings(tenantId: string, congregationId: string): Promise<ResolvedSettings> {
    const [tenant, congregation, branding] = await Promise.all([
      this.prisma.client.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.client.congregation.findUnique({ where: { id: congregationId } }),
      this.prisma.client.brandingConfig.findUnique({ where: { tenant_id: tenantId } }),
    ]);

    if (!tenant) throw new NotFoundException('Tenant não encontrado');
    if (!congregation) throw new NotFoundException('Congregação não encontrada');

    return {
      tenant: { name: tenant.name, email: tenant.email, phone: tenant.phone },
      branding: {
        app_name: congregation.app_name ?? branding?.app_name ?? null,
        primary_color: congregation.primary_color ?? branding?.primary_color ?? null,
        accent_color: congregation.accent_color ?? branding?.secondary_color ?? null,
        logo_url: congregation.logo_url ?? branding?.logo_url ?? null,
        splash_url: branding?.splash_url ?? null,
        custom_domain: branding?.custom_domain ?? null,
        terms_url: branding?.terms_url ?? null,
      },
      congregation: {
        name: congregation.name,
        address: congregation.address,
        timezone: congregation.timezone,
        email: congregation.email,
        phone: congregation.phone,
      },
    };
  }

  async updateSettings(
    tenantId: string,
    congregationId: string,
    roles: string[],
    dto: UpdateSettingsDto,
    plan: 'starter' | 'premium',
  ): Promise<ResolvedSettings> {
    if (dto.tenant && !roles.includes('tenant_admin')) {
      throw new ForbiddenException('Apenas tenant_admin pode alterar os dados do tenant.');
    }

    // PROD-19 — domínio próprio e termos de uso: mesma exigência de papel de
    // `dto.tenant` (é dado do tenant, não da congregação) mais o gate de
    // plano. Igual ao resto do gating desta base (DEC-01 em docs/PLANO.md):
    // lê `plan` do token, porque é feature gate, não limite de negócio.
    if (dto.branding) {
      if (!roles.includes('tenant_admin')) {
        throw new ForbiddenException(
          'Apenas tenant_admin pode alterar domínio próprio e termos de uso.',
        );
      }
      if (plan !== 'premium') {
        throw new ForbiddenException('Domínio próprio e termos de uso são recursos Premium.');
      }
    }

    try {
      await this.prisma.runInTx(async (tx) => {
        if (dto.tenant) {
          await tx.tenant.update({ where: { id: tenantId }, data: dto.tenant });
        }

        if (dto.congregation) {
          await tx.congregation.update({ where: { id: congregationId }, data: dto.congregation });
        }

        if (dto.branding) {
          await tx.brandingConfig.upsert({
            where: { tenant_id: tenantId },
            create: { tenant_id: tenantId, ...dto.branding },
            update: { ...dto.branding },
          });
        }
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        (err.meta?.target as string[] | undefined)?.includes('custom_domain')
      ) {
        throw new BadRequestException('Este domínio já está em uso por outro tenant.');
      }
      throw err;
    }

    return this.getSettings(tenantId, congregationId);
  }

  async uploadLogo(
    tenantId: string,
    congregationId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ logo_url: string }> {
    if (!file) throw new BadRequestException('Arquivo obrigatório.');
    if (!ALLOWED_LOGO_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Tipo de arquivo não suportado.');
    }

    const congregation = await this.prisma.client.congregation.findUnique({
      where: { id: congregationId },
      select: { logo_url: true },
    });
    if (!congregation) throw new NotFoundException('Congregação não encontrada');

    await this.storageService.deleteByUrl(congregation.logo_url);

    const key = `branding/${tenantId}/${congregationId}/logo-${Date.now()}`;
    const logo_url = await this.storageService.upload(file.buffer, key, file.mimetype);

    await this.prisma.client.congregation.update({
      where: { id: congregationId },
      data: { logo_url },
    });

    return { logo_url };
  }
}
