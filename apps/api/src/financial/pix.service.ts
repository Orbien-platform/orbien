import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Prisma, PixScenario, PixStatus, TransactionSource, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreatePixDto, CreateDynamicPixDto } from './dto/create-pix.dto';

type TenantContext = {
  tenantId: string;
  congregationId: string;
  pixKey: string;
  churchName: string;
};

type AsaasCustomer = { id: string };
type AsaasPayment = { id: string; invoiceUrl: string };
type AsaasQrCode = { encodedImage: string; payload: string; expirationDate: string };

@Injectable()
export class PixService {
  private readonly logger = new Logger(PixService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
  ) {}

  // ── Internal helpers ──────────────────────────────────────────────────────

  private get asaasUrl(): string {
    return process.env['ASAAS_API_URL'] ?? 'https://sandbox.asaas.com/api/v3';
  }

  private get asaasKey(): string | undefined {
    return process.env['ASAAS_API_KEY'];
  }

  private asaasHeaders() {
    return { access_token: this.asaasKey!, 'Content-Type': 'application/json' };
  }

  private async asaasGet<T>(path: string): Promise<T> {
    const { data } = await firstValueFrom(
      this.http.get<T>(`${this.asaasUrl}${path}`, {
        headers: this.asaasHeaders(),
        timeout: 10_000,
      }),
    );
    return data;
  }

  private async asaasPost<T>(path: string, body: unknown): Promise<T> {
    const { data } = await firstValueFrom(
      this.http.post<T>(`${this.asaasUrl}${path}`, body, {
        headers: this.asaasHeaders(),
        timeout: 10_000,
      }),
    );
    return data;
  }

  private async resolveTenant(slug: string): Promise<TenantContext> {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    const [branding, congregation] = await Promise.all([
      this.prisma.client.brandingConfig.findUnique({
        where: { tenant_id: tenant.id },
        select: { pix_key: true, app_name: true },
      }),
      this.prisma.client.congregation.findFirst({
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

  private async resolveTenantFromUser(user: JwtPayload): Promise<TenantContext> {
    const [branding, congregation] = await Promise.all([
      this.prisma.client.brandingConfig.findUnique({
        where: { tenant_id: user.tenant_id },
        select: { pix_key: true, app_name: true },
      }),
      this.prisma.client.congregation.findFirst({
        where: { tenant_id: user.tenant_id },
        orderBy: { created_at: 'asc' },
        select: { id: true },
      }),
    ]);

    if (!branding?.pix_key) {
      throw new BadRequestException('Igreja não configurou chave PIX');
    }
    if (!congregation) throw new NotFoundException('Tenant não encontrado');

    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: user.tenant_id },
      select: { name: true },
    });

    return {
      tenantId: user.tenant_id,
      congregationId: congregation.id,
      pixKey: branding.pix_key,
      churchName: branding.app_name ?? (tenant?.name ?? ''),
    };
  }

  private async resolveCategory(tenantId: string, congregationId: string, slug?: string) {
    const keyword = slug ?? 'oferta';

    const category =
      (await this.prisma.client.financialCategory.findFirst({
        where: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          name: { contains: keyword, mode: 'insensitive' },
          type: TransactionType.income,
        },
        select: { id: true },
      })) ??
      (await this.prisma.client.financialCategory.findFirst({
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
    const assignment = await this.prisma.client.roleAssignment.findFirst({
      where: { tenant_id: tenantId, role_code: 'tenant_admin' },
      select: { user_account_id: true },
    });
    if (!assignment) throw new NotFoundException('Tenant não encontrado');
    return assignment.user_account_id;
  }

  private shortRef(): string {
    return Date.now().toString(36).slice(-6).toUpperCase();
  }

  // ── Asaas: buscar ou criar customer ──────────────────────────────────────

  private async resolveAsaasCustomer(tenantId: string, churchName: string): Promise<string> {
    type ListResult = { data: AsaasCustomer[] };
    const result = await this.asaasGet<ListResult>(
      `/customers?externalReference=${tenantId}&limit=1`,
    );

    if (result.data.length > 0) return result.data[0].id;

    const customer = await this.asaasPost<AsaasCustomer>('/customers', {
      name: churchName,
      externalReference: tenantId,
      // cpfCnpj omitido no sandbox — preencher com dados reais em produção
    });
    return customer.id;
  }

  // ── Cenário 1: PIX manual ─────────────────────────────────────────────────

  async createManual(dto: CreatePixDto) {
    if (dto.website) {
      return { pix_key: '', amount: dto.amount, church_name: '' };
    }

    const ctx = await this.resolveTenant(dto.tenant_slug);
    const category = await this.resolveCategory(ctx.tenantId, ctx.congregationId, dto.category_slug);

    await this.prisma.client.pixPayment.create({
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

    return { pix_key: ctx.pixKey, amount: dto.amount, church_name: ctx.churchName };
  }

  // ── Cenário 2: PIX dinâmico com QR Asaas ─────────────────────────────────

  async createDynamic(dto: CreateDynamicPixDto, user: JwtPayload) {
    if (!this.asaasKey) {
      throw new ServiceUnavailableException('Serviço PIX indisponível');
    }

    const ctx = await this.resolveTenantFromUser(user);
    const category = await this.resolveCategory(ctx.tenantId, ctx.congregationId);
    const externalRef = `ORB-${this.shortRef()}`;

    let asaasPaymentId: string;
    let qrCode: AsaasQrCode;

    try {
      const customerId = await this.resolveAsaasCustomer(ctx.tenantId, ctx.churchName);

      const payment = await this.asaasPost<AsaasPayment>('/payments', {
        customer: customerId,
        billingType: 'PIX',
        value: dto.amount,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        description: dto.description ?? 'Doação via Orbien',
        externalReference: externalRef,
      });

      asaasPaymentId = payment.id;
      qrCode = await this.asaasGet<AsaasQrCode>(`/payments/${asaasPaymentId}/pixQrCode`);
    } catch (err) {
      this.logger.error('Asaas API error', err);
      throw new ServiceUnavailableException('Serviço PIX indisponível');
    }

    const pixPayment = await this.prisma.client.pixPayment.create({
      data: {
        tenant_id: ctx.tenantId,
        congregation_id: ctx.congregationId,
        scenario: PixScenario.dynamic,
        status: PixStatus.pending,
        amount: new Prisma.Decimal(dto.amount),
        pix_key: ctx.pixKey,
        asaas_payment_id: asaasPaymentId,
        qr_code: qrCode.payload,
        category_id: category.id,
        donor_person_id: dto.donor_person_id,
      },
    });

    return {
      payment_id: pixPayment.id,
      qr_code: qrCode.payload,
      qr_code_image: qrCode.encodedImage,
      amount: dto.amount,
      expires_at: qrCode.expirationDate,
    };
  }

  // ── Cenário 3: Doação pública ─────────────────────────────────────────────

  async createPublicDonation(dto: CreatePixDto) {
    if (dto.website) {
      return { pix_key: '', amount: dto.amount, church_name: '', transaction_ref: '' };
    }

    const ctx = await this.resolveTenant(dto.tenant_slug);
    const category = await this.resolveCategory(ctx.tenantId, ctx.congregationId, dto.category_slug);
    const createdByUserId = await this.resolveTenantAdmin(ctx.tenantId);
    const ref = this.shortRef();

    await this.prisma.runInTx(async (tx) => {
      await tx.financialTransaction.create({
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
      });
      await tx.pixPayment.create({
        data: {
          tenant_id: ctx.tenantId,
          congregation_id: ctx.congregationId,
          scenario: PixScenario.public,
          status: PixStatus.pending,
          amount: new Prisma.Decimal(dto.amount),
          pix_key: ctx.pixKey,
          category_id: category.id,
        },
      });
    });

    return {
      pix_key: ctx.pixKey,
      amount: dto.amount,
      church_name: ctx.churchName,
      transaction_ref: `PIX-${ref}`,
    };
  }

  // ── Webhook Asaas ─────────────────────────────────────────────────────────

  async handleWebhook(payload: Record<string, unknown>, token: string | undefined) {
    const expected = process.env['ASAAS_WEBHOOK_TOKEN'];
    if (!expected || token !== expected) {
      throw new UnauthorizedException('Token inválido');
    }

    const event = payload['event'] as string | undefined;
    if (event !== 'PAYMENT_CONFIRMED' && event !== 'PAYMENT_RECEIVED') {
      return { received: true };
    }

    const asaasPaymentId = (payload['payment'] as Record<string, unknown>)?.['id'] as
      | string
      | undefined;

    if (!asaasPaymentId) {
      this.logger.warn('Webhook sem payment.id', payload);
      return { received: true };
    }

    const pixPayment = await this.prisma.client.pixPayment.findFirst({
      where: { asaas_payment_id: asaasPaymentId },
      select: { id: true, tenant_id: true, congregation_id: true, amount: true, category_id: true },
    });

    if (!pixPayment) {
      this.logger.warn(`PixPayment não encontrado para asaas_id=${asaasPaymentId}`);
      return { received: true };
    }

    const adminUserId = await this.resolveTenantAdmin(pixPayment.tenant_id);
    const amount = (payload['payment'] as Record<string, unknown>)?.['value']
      ? new Prisma.Decimal(
          String((payload['payment'] as Record<string, unknown>)['value']),
        )
      : pixPayment.amount;

    await this.prisma.runInTx(async (tx) => {
      await tx.pixPayment.update({
        where: { id: pixPayment.id },
        data: { status: PixStatus.confirmed, paid_at: new Date() },
      });
      await tx.financialTransaction.create({
        data: {
          tenant_id: pixPayment.tenant_id,
          congregation_id: pixPayment.congregation_id,
          type: TransactionType.income,
          amount,
          occurred_at: new Date(),
          description: 'PIX confirmado via Asaas',
          category_id: pixPayment.category_id,
          source: TransactionSource.pix_webhook,
          created_by_user_id: adminUserId,
        },
      });
    });

    this.prisma.client.auditLog
      .create({
        data: {
          tenant_id: pixPayment.tenant_id,
          congregation_id: pixPayment.congregation_id,
          actor_user_id: adminUserId,
          entity: 'pix_payment',
          action: 'pix.confirmed',
          after: { asaas_payment_id: asaasPaymentId, event } as Prisma.InputJsonValue,
        },
      })
      .catch(() => void 0);

    return { received: true };
  }
}
