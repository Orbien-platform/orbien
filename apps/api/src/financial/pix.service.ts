import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PixScenario, PixStatus, TransactionSource, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePixDto } from './dto/create-pix.dto';

type TenantContext = {
  tenantId: string;
  congregationId: string;
  pixKey: string;
  churchName: string;
};

@Injectable()
export class PixService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async resolveTenant(slug: string): Promise<TenantContext> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    const [branding, congregation] = await Promise.all([
      this.prisma.brandingConfig.findUnique({
        where: { tenant_id: tenant.id },
        select: { pix_key: true, app_name: true },
      }),
      this.prisma.congregation.findFirst({
        where: { tenant_id: tenant.id },
        orderBy: { created_at: 'asc' },
        select: { id: true },
      }),
    ]);

    if (!branding?.pix_key) {
      throw new BadRequestException('Igreja não configurou chave PIX');
    }
    if (!congregation) throw new NotFoundException('Tenant não encontrado');

    return {
      tenantId: tenant.id,
      congregationId: congregation.id,
      pixKey: branding.pix_key,
      churchName: branding.app_name ?? tenant.name,
    };
  }

  private async resolveCategory(tenantId: string, congregationId: string, slug?: string) {
    const keyword = slug ?? 'oferta';

    const category =
      (await this.prisma.financialCategory.findFirst({
        where: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          name: { contains: keyword, mode: 'insensitive' },
          type: TransactionType.income,
        },
        select: { id: true },
      })) ??
      (await this.prisma.financialCategory.findFirst({
        where: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          name: { contains: 'Oferta', mode: 'insensitive' },
          type: TransactionType.income,
        },
        select: { id: true },
      }));

    if (!category) throw new BadRequestException('Categoria de receita não encontrada');
    return category;
  }

  private async resolveTenantAdmin(tenantId: string): Promise<string> {
    const assignment = await this.prisma.roleAssignment.findFirst({
      where: { tenant_id: tenantId, role_code: 'tenant_admin' },
      select: { user_account_id: true },
    });
    if (!assignment) throw new NotFoundException('Tenant não encontrado');
    return assignment.user_account_id;
  }

  private shortRef(): string {
    return Date.now().toString(36).slice(-6).toUpperCase();
  }

  // ── Cenário 1: PIX manual (exibe chave para cópia) ───────────────────────

  async createManual(dto: CreatePixDto) {
    if (dto.website) {
      // Honeypot triggered — rejeitar silenciosamente
      return { pix_key: '', amount: dto.amount, church_name: '' };
    }

    const ctx = await this.resolveTenant(dto.tenant_slug);
    const category = await this.resolveCategory(ctx.tenantId, ctx.congregationId, dto.category_slug);

    await this.prisma.pixPayment.create({
      data: {
        tenant_id: ctx.tenantId,
        congregation_id: ctx.congregationId,
        scenario: PixScenario.manual,
        status: PixStatus.pending,
        amount: new Prisma.Decimal(dto.amount),
        pix_key: ctx.pixKey,
        category_id: category.id,
      },
    });

    return {
      pix_key: ctx.pixKey,
      amount: dto.amount,
      church_name: ctx.churchName,
    };
  }

  // ── Cenário 3: Doação pública (cria transação financeira) ─────────────────

  async createPublicDonation(dto: CreatePixDto) {
    if (dto.website) {
      return { pix_key: '', amount: dto.amount, church_name: '', transaction_ref: '' };
    }

    const ctx = await this.resolveTenant(dto.tenant_slug);
    const category = await this.resolveCategory(ctx.tenantId, ctx.congregationId, dto.category_slug);
    const createdByUserId = await this.resolveTenantAdmin(ctx.tenantId);
    const ref = this.shortRef();

    const [, pixPayment] = await this.prisma.$transaction([
      this.prisma.financialTransaction.create({
        data: {
          tenant_id: ctx.tenantId,
          congregation_id: ctx.congregationId,
          type: TransactionType.income,
          amount: new Prisma.Decimal(dto.amount),
          occurred_at: new Date(),
          description: dto.donor_name ? `Doação pública — ${dto.donor_name}` : 'Doação pública',
          category_id: category.id,
          source: TransactionSource.manual,
          created_by_user_id: createdByUserId,
          notes: ref,
        },
      }),
      this.prisma.pixPayment.create({
        data: {
          tenant_id: ctx.tenantId,
          congregation_id: ctx.congregationId,
          scenario: PixScenario.public,
          status: PixStatus.pending,
          amount: new Prisma.Decimal(dto.amount),
          pix_key: ctx.pixKey,
          category_id: category.id,
        },
      }),
    ]);

    return {
      pix_key: ctx.pixKey,
      amount: dto.amount,
      church_name: ctx.churchName,
      transaction_ref: `PIX-${ref}`,
    };
  }
}
