import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { writeAuditLog } from '../common/audit/write-audit-log';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const ALLOWED_LOGO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

export interface ResolvedSettings {
  tenant: { name: string; email: string | null; phone: string | null; slug: string };
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
    /** Variante para modo escuro — nulo quando o tenant/congregação só
     * cadastrou o logo claro; quem consome cai em `logo_url` nesse caso. */
    logo_url_dark: string | null;
    splash_url: string | null;
    /** PROD-19 (Premium) — nulo em Starter e quando não configurado. */
    custom_domain: string | null;
    terms_url: string | null;
    /** Chave PIX manual mostrada em `/doar/[tenant_slug]`. Por tenant, não
     * por congregação — `branding_configs` não tem par de congregação para
     * este campo, ao contrário de `app_name`/`primary_color`/etc. */
    pix_key: string | null;
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
  private readonly logger = new Logger(SettingsService.name);

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
      tenant: { name: tenant.name, email: tenant.email, phone: tenant.phone, slug: tenant.slug },
      branding: {
        app_name: congregation.app_name ?? branding?.app_name ?? null,
        primary_color: congregation.primary_color ?? branding?.primary_color ?? null,
        accent_color: congregation.accent_color ?? branding?.secondary_color ?? null,
        logo_url: congregation.logo_url ?? branding?.logo_url ?? null,
        logo_url_dark:
          congregation.logo_url_dark ?? branding?.logo_url_dark ?? null,
        splash_url: branding?.splash_url ?? null,
        custom_domain: branding?.custom_domain ?? null,
        terms_url: branding?.terms_url ?? null,
        pix_key: branding?.pix_key ?? null,
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
    actorUserId: string,
  ): Promise<ResolvedSettings> {
    if (dto.tenant && !roles.includes('tenant_admin')) {
      throw new ForbiddenException('Apenas tenant_admin pode alterar os dados do tenant.');
    }

    if (dto.branding) {
      // Todo campo de `branding` é dado do tenant (não da congregação) e
      // exige tenant_admin — igual a `dto.tenant`. `pix_key` fica de fora
      // do gate de Premium abaixo: PIX manual é recurso Starter (Cenário 1
      // do financeiro), ao contrário de domínio próprio/termos de uso.
      if (!roles.includes('tenant_admin')) {
        throw new ForbiddenException('Apenas tenant_admin pode alterar os dados de marca.');
      }

      // PROD-19 — domínio próprio e termos de uso. Igual ao resto do
      // gating desta base (DEC-01 em docs/PLANO.md): lê `plan` do token,
      // porque é feature gate, não limite de negócio.
      if ((dto.branding.custom_domain !== undefined || dto.branding.terms_url !== undefined) &&
        plan !== 'premium') {
        throw new ForbiddenException('Domínio próprio e termos de uso são recursos Premium.');
      }
    }

    // Capturado antes do upsert só para o `before` da auditoria abaixo —
    // não altera o que é gravado.
    const previousPixKey = dto.branding?.pix_key !== undefined
      ? (await this.prisma.client.brandingConfig.findUnique({
          where: { tenant_id: tenantId },
          select: { pix_key: true },
        }))?.pix_key ?? null
      : null;

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

    // Fora da transação da requisição e com `await` — mesmo raciocínio de
    // `writeAuditLog` (ver o helper): trocar a chave PIX muda para onde vai
    // o dinheiro das doações, e é a única gravação de `branding` que leva
    // rastro próprio.
    if (dto.branding?.pix_key !== undefined) {
      await writeAuditLog(
        this.prisma,
        {
          tenant_id: tenantId,
          congregation_id: congregationId,
          actor_user_id: actorUserId,
          entity: 'branding_config',
          action: 'pix_key_updated',
          before: { pix_key: previousPixKey },
          after: { pix_key: dto.branding.pix_key },
        },
        this.logger,
      );
    }

    return this.getSettings(tenantId, congregationId);
  }

  async uploadLogo(
    tenantId: string,
    congregationId: string,
    file: Express.Multer.File | undefined,
    variant: 'light' | 'dark',
  ): Promise<{ logo_url: string | null; logo_url_dark: string | null }> {
    if (!file) throw new BadRequestException('Arquivo obrigatório.');
    if (!ALLOWED_LOGO_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Tipo de arquivo não suportado.');
    }

    const field = variant === 'dark' ? 'logo_url_dark' : 'logo_url';

    const congregation = await this.prisma.client.congregation.findUnique({
      where: { id: congregationId },
      select: { logo_url: true, logo_url_dark: true },
    });
    if (!congregation) throw new NotFoundException('Congregação não encontrada');

    await this.storageService.deleteByUrl(congregation[field]);

    const key = `branding/${tenantId}/${congregationId}/logo-${variant}-${Date.now()}`;
    const uploadedUrl = await this.storageService.upload(file.buffer, key, file.mimetype);

    await this.prisma.client.congregation.update({
      where: { id: congregationId },
      data: { [field]: uploadedUrl },
    });

    return variant === 'dark'
      ? { logo_url: congregation.logo_url, logo_url_dark: uploadedUrl }
      : { logo_url: uploadedUrl, logo_url_dark: congregation.logo_url_dark };
  }
}
