import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { randomUUID, timingSafeEqual } from 'crypto';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  PlanStatus,
  PlanType,
  Prisma,
  PixScenario,
  PixStatus,
  PixSubscriptionStatus,
  TransactionSource,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreatePixDto, CreateDynamicPixDto } from './dto/create-pix.dto';
import { CreatePublicDonationDto } from './dto/create-public-donation.dto';
import { CreatePixSubscriptionDto } from './dto/create-pix-subscription.dto';
import { DonationReceiptService } from './donation-receipts.service';
import { writeAuditLog } from '../common/audit/write-audit-log';

type TenantContext = {
  tenantId: string;
  congregationId: string;
  pixKey: string;
  churchName: string;
};

type PublicDonationTenant = TenantContext & {
  /** Plano Premium em vigor, lido do banco do tenant do slug (nunca do cliente). */
  dynamicEnabled: boolean;
};

/**
 * Resposta de `POST /financial/pix/public-donation`. `mode` diz o que o doador
 * recebeu: a chave para copiar (`static`, todo Starter) ou um QR que a igreja
 * reconhece sozinha (`dynamic`, Premium). Os quatro primeiros campos são o
 * contrato anterior, e o mobile abre esta mesma página — nenhum deles muda.
 */
export type PublicDonationResponse = {
  mode: 'static' | 'dynamic';
  pix_key: string;
  amount: number;
  church_name: string;
  transaction_ref: string;
  /** Premium que caiu para a chave estática, e por quê. */
  fallback_reason?: PublicDonationFallback;
  /** Só em `dynamic`. UUID v4: é o que autoriza consultar o status. */
  payment_id?: string;
  qr_code?: string;
  qr_code_image?: string;
  expires_at?: string;
};

export type PublicDonationFallback = 'provider_unavailable' | 'cap_reached';

/** Validade que a página mostra ao doador. A Asaas aceita o QR por mais tempo. */
export const PUBLIC_DONATION_VALIDITY_MS = 24 * 60 * 60 * 1000;

/**
 * Teto de cobranças dinâmicas públicas ainda pendentes, criadas na última
 * hora, por igreja. Cada tentativa gasta 2–3 chamadas à Asaas e a rota não
 * exige login: sem teto, um script esgota a cota da conta. Vive no banco, não
 * em memória — sobrevive a deploy e vale para todas as instâncias. Acima dele
 * o doador recebe a chave estática, e a doação não se perde.
 */
export const PUBLIC_DYNAMIC_PENDING_CAP_PER_HOUR = 60;

/**
 * Depois deste prazo a cobrança abandonada é cancelada na Asaas. Maior que as
 * 24h que a página promete: entre as duas o QR ainda paga e o webhook confirma
 * normalmente. A Asaas aceita o QR por muito mais tempo que isso (até 12 meses
 * após o vencimento, segundo a documentação) — sem o cancelamento, um QR velho
 * continuaria pagável e a linha, `pending` para sempre.
 */
export const PUBLIC_DONATION_CANCEL_AFTER_MS = 48 * 60 * 60 * 1000;

/** Quantas cobranças abandonadas o job cancela por execução. */
export const PUBLIC_DONATION_CLEANUP_BATCH = 100;

type AsaasCustomer = { id: string };
type AsaasPayment = { id: string; invoiceUrl: string };
type AsaasQrCode = { encodedImage: string; payload: string; expirationDate: string };
type AsaasSubscription = { id: string };

@Injectable()
export class PixService {
  private readonly logger = new Logger(PixService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly donationReceiptService: DonationReceiptService,
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

  private async asaasDelete(path: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.asaasUrl}${path}`, {
        headers: this.asaasHeaders(),
        timeout: 10_000,
      }),
    );
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

  /**
   * Tenant da doação pública. Slug inexistente, igreja sem chave PIX e tenant
   * sem congregação respondem o MESMO 404: o 400 "não configurou chave PIX" de
   * `resolveTenant` confirmava que o slug existe e em que estado está a
   * configuração da igreja.
   *
   * O plano é lido aqui, no banco — `tenant_plans` é legível sem contexto
   * (`orbien_app_auth`, 017) e a rota não tem JWT, então não existe claim. Só
   * `premium` em `active`/`trial` abre cobrança: um tenant suspenso ou
   * cancelado não deve gerar cobrança nova na Asaas. Starter e plano ausente
   * seguem na chave estática.
   */
  private async resolvePublicDonationTenant(slug: string): Promise<PublicDonationTenant> {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });
    if (!tenant) throw new NotFoundException('Igreja não encontrada');

    const [branding, congregation, tenantPlan] = await Promise.all([
      this.prisma.client.brandingConfig.findUnique({
        where: { tenant_id: tenant.id },
        select: { pix_key: true, app_name: true },
      }),
      this.prisma.client.congregation.findFirst({
        where: { tenant_id: tenant.id },
        orderBy: { created_at: 'asc' },
        select: { id: true },
      }),
      this.prisma.client.tenantPlan.findUnique({
        where: { tenant_id: tenant.id },
        select: { plan: true, status: true },
      }),
    ]);

    if (!branding?.pix_key || !congregation) throw new NotFoundException('Igreja não encontrada');

    return {
      tenantId: tenant.id,
      congregationId: congregation.id,
      pixKey: branding.pix_key,
      churchName: branding.app_name ?? tenant.name,
      dynamicEnabled:
        tenantPlan?.plan === PlanType.premium &&
        (tenantPlan.status === PlanStatus.active || tenantPlan.status === PlanStatus.trial),
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

  /**
   * Rota pública (sem JWT) não passa pelo `TenantContextInterceptor`: roda
   * como `orbien_app`, sem `app.tenant_id`, e `financial_categories`/
   * `pix_payments` não aparecem para ela — `resolveCategory` respondia
   * "Categoria de receita não encontrada" para toda igreja. O contexto vem
   * daqui, do tenant que `resolveTenant` achou pelo slug no servidor, nunca de
   * um id mandado pelo formulário: o RLS continua sendo a fronteira entre
   * igrejas. Mesmo padrão de `public-small-groups.service.ts`.
   */
  private runInPublicContext<T>(ctx: TenantContext, fn: () => Promise<T>): Promise<T> {
    return this.prisma.runInTx(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true), set_config('app.congregation_id', ${ctx.congregationId}, true)`;
      return fn();
    });
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

  /**
   * Igual a `resolveTenantFromUser`, mas para quando quem paga não é staff
   * (inscrição de evento, PROD-24: o inscrito não tem `admin_congregation`/
   * `treasurer`) e a congregação já é conhecida — não precisa "a primeira do
   * tenant".
   */
  private async resolvePixConfig(
    tenantId: string,
  ): Promise<Pick<TenantContext, 'pixKey' | 'churchName'>> {
    const [branding, tenant] = await Promise.all([
      this.prisma.client.brandingConfig.findUnique({
        where: { tenant_id: tenantId },
        select: { pix_key: true, app_name: true },
      }),
      this.prisma.client.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    ]);

    if (!branding?.pix_key) {
      throw new BadRequestException('Igreja não configurou chave PIX');
    }

    return { pixKey: branding.pix_key, churchName: branding.app_name ?? (tenant?.name ?? '') };
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

  /**
   * Um customer por igreja (`externalReference = tenantId`). O id não muda, e a
   * doação pública (sem login) chama isto a cada tentativa: lembrar evita um
   * `GET /customers` por doação numa rota que qualquer visitante dispara —
   * cada chamada à Asaas custa cota. Cache por processo; um deploy o esvazia.
   */
  private readonly asaasCustomers = new Map<string, string>();

  private async resolveAsaasCustomer(tenantId: string, churchName: string): Promise<string> {
    const known = this.asaasCustomers.get(tenantId);
    if (known) return known;

    type ListResult = { data: AsaasCustomer[] };
    const result = await this.asaasGet<ListResult>(
      `/customers?externalReference=${tenantId}&limit=1`,
    );

    let customerId: string;
    if (result.data.length > 0) {
      customerId = result.data[0].id;
    } else {
      const customer = await this.asaasPost<AsaasCustomer>('/customers', {
        name: churchName,
        externalReference: tenantId,
        // cpfCnpj omitido no sandbox — preencher com dados reais em produção
      });
      customerId = customer.id;
    }

    this.asaasCustomers.set(tenantId, customerId);
    return customerId;
  }

  /**
   * Cobrança PIX dinâmica na Asaas: customer da igreja → `POST /payments` →
   * `GET /payments/:id/pixQrCode`. Era o mesmo bloco, copiado, em
   * `createDynamic` e `createForEventRegistration`; a doação pública seria a
   * terceira cópia. Não captura erro: cada chamador decide o que responder (e,
   * na doação pública, se a cobrança já criada precisa ser cancelada) — por
   * isso devolve o id da cobrança também quando o QR falha, via `onCharged`.
   */
  private async createAsaasPixCharge(
    params: {
      tenantId: string;
      churchName: string;
      amount: number;
      description: string;
      externalReference: string;
    },
    onCharged?: (asaasPaymentId: string) => void,
  ): Promise<{ asaasPaymentId: string; qrCode: AsaasQrCode }> {
    const customerId = await this.resolveAsaasCustomer(params.tenantId, params.churchName);

    const payment = await this.asaasPost<AsaasPayment>('/payments', {
      customer: customerId,
      billingType: 'PIX',
      value: params.amount,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      description: params.description,
      externalReference: params.externalReference,
    });
    onCharged?.(payment.id);

    const qrCode = await this.asaasGet<AsaasQrCode>(`/payments/${payment.id}/pixQrCode`);
    return { asaasPaymentId: payment.id, qrCode };
  }

  // ── Cenário 1: PIX manual ─────────────────────────────────────────────────

  async createManual(dto: CreatePixDto) {
    if (dto.website) {
      return { pix_key: '', amount: dto.amount, church_name: '' };
    }

    const ctx = await this.resolveTenant(dto.tenant_slug);

    await this.runInPublicContext(ctx, async () => {
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
      ({ asaasPaymentId, qrCode } = await this.createAsaasPixCharge({
        tenantId: ctx.tenantId,
        churchName: ctx.churchName,
        amount: dto.amount,
        description: dto.description ?? 'Doação via Orbien',
        externalReference: externalRef,
      }));
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

  // ── PIX recorrente — dízimo automático via Asaas (PROD-27, Premium) ──────
  //
  // Assinatura na Asaas (`/subscriptions`, `cycle: MONTHLY`): a cada ciclo ela
  // gera um `payment` novo por conta própria e dispara o mesmo webhook do
  // cenário 2 — sem chamada nossa a cada mês. Por isso não existe `PixPayment`
  // pré-criado aqui como no cenário 2 (não sabemos o `asaas_payment_id` de
  // cobranças futuras): cada `PixPayment` de `scenario: recurring` só nasce
  // quando `handleWebhook` recebe a confirmação, ligado de volta a esta linha
  // por `pix_subscription_id`. Escopo é o da sessão (`user.tenant_id` +
  // `user.congregation_id`) — diferente de `createDynamic`, que usa a
  // primeira congregação do tenant; aqui a assinatura pertence à congregação
  // de quem a cria, e listar/cancelar depois tem que achar a mesma linha.

  async createSubscription(dto: CreatePixSubscriptionDto, user: JwtPayload) {
    if (!this.asaasKey) {
      throw new ServiceUnavailableException('Serviço PIX indisponível');
    }

    const branding = await this.prisma.client.brandingConfig.findUnique({
      where: { tenant_id: user.tenant_id },
      select: { pix_key: true, app_name: true },
    });
    if (!branding?.pix_key) {
      throw new BadRequestException('Igreja não configurou chave PIX');
    }

    const donor = await this.prisma.client.person.findFirst({
      where: { id: dto.donor_person_id, tenant_id: user.tenant_id },
      select: { id: true },
    });
    if (!donor) throw new NotFoundException('Pessoa não encontrada');

    const category = await this.resolveCategory(user.tenant_id, user.congregation_id);

    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: user.tenant_id },
      select: { name: true },
    });
    const churchName = branding.app_name ?? (tenant?.name ?? '');
    const externalRef = `ORB-SUB-${this.shortRef()}`;

    let asaasSubscriptionId: string;
    try {
      const customerId = await this.resolveAsaasCustomer(user.tenant_id, churchName);

      const subscription = await this.asaasPost<AsaasSubscription>('/subscriptions', {
        customer: customerId,
        billingType: 'PIX',
        value: dto.amount,
        nextDueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        cycle: 'MONTHLY',
        description: dto.description ?? 'Dízimo automático via Orbien',
        externalReference: externalRef,
      });

      asaasSubscriptionId = subscription.id;
    } catch (err) {
      this.logger.error('Asaas API error (subscription)', err);
      throw new ServiceUnavailableException('Serviço PIX indisponível');
    }

    return this.prisma.client.pixSubscription.create({
      data: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        donor_person_id: dto.donor_person_id,
        category_id: category.id,
        amount: new Prisma.Decimal(dto.amount),
        description: dto.description,
        asaas_subscription_id: asaasSubscriptionId,
        status: PixSubscriptionStatus.active,
        created_by_user_id: user.sub,
      },
    });
  }

  async listSubscriptions(user: JwtPayload) {
    return this.prisma.client.pixSubscription.findMany({
      where: { tenant_id: user.tenant_id, congregation_id: user.congregation_id },
      orderBy: { created_at: 'desc' },
      // O painel do web mostra quem doa; sem o nome a lista teria só UUIDs.
      include: { donorPerson: { select: { full_name: true } } },
    });
  }

  async cancelSubscription(id: string, user: JwtPayload) {
    const subscription = await this.prisma.client.pixSubscription.findFirst({
      where: { id, tenant_id: user.tenant_id, congregation_id: user.congregation_id },
    });
    if (!subscription) throw new NotFoundException('Assinatura não encontrada');

    if (subscription.status === PixSubscriptionStatus.cancelled) {
      return subscription;
    }

    try {
      await this.asaasDelete(`/subscriptions/${subscription.asaas_subscription_id}`);
    } catch (err) {
      this.logger.error('Asaas API error (cancel subscription)', err);
      throw new ServiceUnavailableException('Serviço PIX indisponível');
    }

    return this.prisma.client.pixSubscription.update({
      where: { id },
      data: { status: PixSubscriptionStatus.cancelled, cancelled_at: new Date() },
    });
  }

  // ── Inscrição de evento paga (PROD-24, Premium) ──────────────────────────
  //
  // Mesmo mecanismo do cenário 2 (QR dinâmico via Asaas), chamado pelo
  // `ContentModule` em nome de quem está se inscrevendo — não de staff, por
  // isso não recebe `JwtPayload` nem exige papel financeiro. Quem decide se
  // a vaga existe e reserva o lugar é o `EventRegistrationsService`; esta
  // função só cobra e devolve o QR.

  async createForEventRegistration(
    tenantId: string,
    congregationId: string,
    amount: number,
    description: string,
  ): Promise<{
    payment_id: string;
    qr_code: string;
    qr_code_image: string;
    amount: number;
    expires_at: string;
  }> {
    if (!this.asaasKey) {
      throw new ServiceUnavailableException('Serviço PIX indisponível');
    }

    const ctx = await this.resolvePixConfig(tenantId);
    const category = await this.resolveCategory(tenantId, congregationId, 'inscri');
    const externalRef = `ORB-${this.shortRef()}`;

    let asaasPaymentId: string;
    let qrCode: AsaasQrCode;

    try {
      ({ asaasPaymentId, qrCode } = await this.createAsaasPixCharge({
        tenantId,
        churchName: ctx.churchName,
        amount,
        description,
        externalReference: externalRef,
      }));
    } catch (err) {
      this.logger.error('Asaas API error', err);
      throw new ServiceUnavailableException('Serviço PIX indisponível');
    }

    const pixPayment = await this.prisma.client.pixPayment.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        scenario: PixScenario.event_registration,
        status: PixStatus.pending,
        amount: new Prisma.Decimal(amount),
        pix_key: ctx.pixKey,
        asaas_payment_id: asaasPaymentId,
        qr_code: qrCode.payload,
        category_id: category.id,
      },
    });

    return {
      payment_id: pixPayment.id,
      qr_code: qrCode.payload,
      qr_code_image: qrCode.encodedImage,
      amount,
      expires_at: qrCode.expirationDate,
    };
  }

  // ── Cenário 3: Doação pública ─────────────────────────────────────────────

  async createPublicDonation(
    dto: CreatePublicDonationDto,
  ): Promise<PublicDonationResponse | Omit<PublicDonationResponse, 'mode'>> {
    if (dto.website) {
      return { pix_key: '', amount: dto.amount, church_name: '', transaction_ref: '' };
    }

    const ctx = await this.resolvePublicDonationTenant(dto.tenant_slug);

    // Só a intenção, em `pix_payments` — nada em `financial_transactions`. A
    // chave é copiada e paga fora daqui, sem confirmação nenhuma para a API, e
    // DRE e dashboard somam lançamentos sem olhar `status`: gravar receita
    // nesta rota deixaria qualquer visitante inflar o caixa da igreja sem
    // pagar. O lançamento nasce no webhook da Asaas (QR dinâmico, Premium) ou
    // quando o tesoureiro dá baixa (chave estática, Starter).
    //
    // O id sai daqui (e não do `@default(uuid())`) porque é a referência que o
    // doador vê (`PIX-` + os 8 primeiros dígitos) e o `externalReference` da
    // cobrança. A linha é gravada ANTES de falar com a Asaas: se o processo
    // cair depois de a cobrança existir, o webhook ainda acha a linha.
    const paymentId = randomUUID();
    let fallback: PublicDonationFallback | undefined;
    let wantsCharge = ctx.dynamicEnabled;

    if (wantsCharge && !this.asaasKey) {
      this.logger.warn('Doação pública Premium sem ASAAS_API_KEY — caiu para a chave estática');
      wantsCharge = false;
      fallback = 'provider_unavailable';
    }

    await this.runInPublicContext(ctx, async () => {
      const category = await this.resolveCategory(ctx.tenantId, ctx.congregationId, dto.category_slug);

      if (wantsCharge && (await this.countRecentPublicDynamic(ctx)) >= PUBLIC_DYNAMIC_PENDING_CAP_PER_HOUR) {
        this.logger.warn(`Teto de cobranças públicas pendentes atingido (tenant=${ctx.tenantId})`);
        wantsCharge = false;
        fallback = 'cap_reached';
      }

      await this.prisma.client.pixPayment.create({
        data: {
          id: paymentId,
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

    const base = {
      pix_key: ctx.pixKey,
      amount: dto.amount,
      church_name: ctx.churchName,
      transaction_ref: `PIX-${paymentId.slice(0, 8).toUpperCase()}`,
    };

    const charge = wantsCharge ? await this.chargePublicDonation(ctx, paymentId, dto.amount) : null;

    if (!charge) {
      // Quis cobrar e não conseguiu: a Asaas falhou. Se nem tentou, `fallback`
      // já diz por quê (sem chave, ou teto da hora); Starter não tem motivo.
      const reason = wantsCharge ? 'provider_unavailable' : fallback;
      return { mode: 'static', ...base, ...(reason ? { fallback_reason: reason } : {}) };
    }

    return {
      mode: 'dynamic',
      ...base,
      payment_id: paymentId,
      qr_code: charge.qrCode.payload,
      qr_code_image: charge.qrCode.encodedImage,
      expires_at: new Date(Date.now() + PUBLIC_DONATION_VALIDITY_MS).toISOString(),
    };
  }

  /**
   * Estado da doação para o polling da página pública (sem login).
   *
   * A "chave" de leitura é o `payment_id` — UUID v4, 122 bits, devolvido só a
   * quem criou a cobrança — junto com o slug; o `transaction_ref` curto
   * (`PIX-` + 8 hex) nunca é aceito aqui. Slug desconhecido, id desconhecido e
   * id de OUTRA igreja respondem o mesmo 404: a RLS faz o terceiro caso
   * devolver zero linhas. A resposta é só `status` + `expires_at` — nada de
   * valor, nome, e-mail, chave ou id de tenant.
   *
   * `expired` é lido, não gravado: `pending` com mais de 24h (ou `failed`, que
   * a limpeza marcou). Assim a página para de esperar mesmo com o job parado.
   */
  async getPublicDonationStatus(
    slug: string,
    paymentId: string,
  ): Promise<{ status: 'pending' | 'confirmed' | 'expired'; expires_at: string }> {
    const notFound = () => new NotFoundException('Doação não encontrada');

    const ctx = await this.resolvePublicDonationTenant(slug).catch((err: unknown) => {
      if (err instanceof NotFoundException) throw notFound();
      throw err;
    });

    const row = await this.runInPublicContext(ctx, () =>
      this.prisma.client.pixPayment.findFirst({
        where: { id: paymentId, tenant_id: ctx.tenantId, scenario: PixScenario.public },
        select: { status: true, created_at: true },
      }),
    );
    if (!row) throw notFound();

    const expiresAt = new Date(row.created_at.getTime() + PUBLIC_DONATION_VALIDITY_MS);

    let status: 'pending' | 'confirmed' | 'expired';
    if (row.status === PixStatus.confirmed) status = 'confirmed';
    else if (row.status === PixStatus.failed || expiresAt.getTime() <= Date.now()) status = 'expired';
    else status = 'pending';

    return { status, expires_at: expiresAt.toISOString() };
  }

  /**
   * Limpeza das cobranças públicas abandonadas (aba fechada, dois QRs, desistência).
   *
   * A ORDEM é a regra: primeiro cancela na Asaas, e só depois marca `failed`. O
   * inverso perderia dinheiro — um QR ainda pagável cuja linha já está `failed`.
   * Mesmo assim, se alguém pagar entre o cancelamento e a marcação, o webhook
   * confirma a linha `failed` (ver `handleWebhook`).
   *
   * - Cancelamento recusado pela Asaas (por exemplo, a cobrança já foi paga e o
   *   webhook se perdeu): a linha FICA `pending` e o caso vai para o log — é
   *   dinheiro possivelmente não lançado, e não deve sumir da fila.
   * - 404 (a cobrança já não existe na Asaas): nada a cancelar, marca `failed`.
   * - Intenção estática (sem `asaas_payment_id`) não é tocada: quem decide é o
   *   tesoureiro.
   *
   * Roda no scheduler, cross-tenant — `prisma.system`, como `RecurringRuleScheduler`.
   */
  async expireAbandonedPublicDonations(): Promise<{ cancelled: number; kept: number }> {
    if (!this.asaasKey) {
      this.logger.warn('ASAAS_API_KEY ausente — limpeza de cobranças públicas abandonadas pulada');
      return { cancelled: 0, kept: 0 };
    }

    const abandoned = await this.prisma.system.pixPayment.findMany({
      where: {
        scenario: PixScenario.public,
        status: PixStatus.pending,
        asaas_payment_id: { not: null },
        created_at: { lt: new Date(Date.now() - PUBLIC_DONATION_CANCEL_AFTER_MS) },
      },
      select: { id: true, asaas_payment_id: true },
      orderBy: { created_at: 'asc' },
      take: PUBLIC_DONATION_CLEANUP_BATCH,
    });

    let cancelled = 0;
    let kept = 0;

    for (const row of abandoned) {
      try {
        await this.asaasDelete(`/payments/${row.asaas_payment_id}`);
      } catch (err) {
        const alreadyGone = isAxiosError(err) && err.response?.status === 404;
        if (!alreadyGone) {
          kept++;
          this.logger.warn(
            `Cobrança ${row.asaas_payment_id} (pix_payment=${row.id}) não cancelada na Asaas — fica pending: ${String(err)}`,
          );
          continue;
        }
      }

      await this.prisma.system.pixPayment.updateMany({
        where: { id: row.id, status: PixStatus.pending },
        data: { status: PixStatus.failed },
      });
      cancelled++;
    }

    return { cancelled, kept };
  }

  /** Cobranças dinâmicas públicas ainda pendentes criadas na última hora. Roda sob o contexto da igreja. */
  private countRecentPublicDynamic(ctx: TenantContext): Promise<number> {
    return this.prisma.client.pixPayment.count({
      where: {
        tenant_id: ctx.tenantId,
        scenario: PixScenario.public,
        status: PixStatus.pending,
        asaas_payment_id: { not: null },
        created_at: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
  }

  /**
   * Cria a cobrança e amarra o id da Asaas e o QR à linha já gravada. Qualquer
   * falha devolve `null` — o chamador cai para a chave estática. Cobrança que a
   * Asaas chegou a criar mas que não pôde ser amarrada à linha (QR indisponível,
   * banco falhou) é cancelada na hora: cobrança órfã continua pagável na Asaas
   * muito depois do vencimento.
   */
  private async chargePublicDonation(
    ctx: TenantContext,
    paymentId: string,
    amount: number,
  ): Promise<{ asaasPaymentId: string; qrCode: AsaasQrCode } | null> {
    let created: string | undefined;

    try {
      const charge = await this.createAsaasPixCharge(
        {
          tenantId: ctx.tenantId,
          churchName: ctx.churchName,
          amount,
          description: 'Doação via Orbien',
          externalReference: paymentId,
        },
        (id) => {
          created = id;
        },
      );

      await this.runInPublicContext(ctx, () =>
        this.prisma.client.pixPayment.updateMany({
          where: { id: paymentId },
          data: { asaas_payment_id: charge.asaasPaymentId, qr_code: charge.qrCode.payload },
        }),
      );

      return charge;
    } catch (err) {
      this.logger.error('Asaas API error (doação pública)', err);
      if (created) {
        await this.asaasDelete(`/payments/${created}`).catch((deleteErr) =>
          this.logger.warn(`Cobrança órfã ${created} não cancelada na Asaas: ${String(deleteErr)}`),
        );
      }
      return null;
    }
  }

  /**
   * PIX recorrente (PROD-27): materializa o `PixPayment` da cobrança gerada
   * pela assinatura Asaas, na primeira vez que o webhook fala dela.
   * Assinatura cancelada não gera lançamento — a Asaas para de cobrar quando
   * `cancelSubscription` chama `DELETE /subscriptions/:id`, mas um evento em
   * trânsito na hora do cancelamento ainda pode chegar depois.
   *
   * Roda DENTRO da transação do webhook (contexto de tenant já fixado), por
   * isso a corrida entre duas entregas não pode ser um `create` que falha com
   * P2002: no Postgres um erro dentro da transação a aborta, e a recarga
   * seguinte também falharia. `createMany ... skipDuplicates` vira `ON
   * CONFLICT DO NOTHING` — quem perde a corrida só não insere, e a leitura
   * logo depois acha a linha da outra entrega.
   */
  private async createPixPaymentFromSubscriptionWebhook(
    asaasSubscriptionId: string | undefined,
    asaasPaymentId: string,
    select: Prisma.PixPaymentSelect,
  ) {
    if (!asaasSubscriptionId) return null;

    const subscription = await this.prisma.client.pixSubscription.findUnique({
      where: { asaas_subscription_id: asaasSubscriptionId },
    });
    if (!subscription || subscription.status !== PixSubscriptionStatus.active) return null;

    await this.prisma.client.pixPayment.createMany({
      data: [
        {
          tenant_id: subscription.tenant_id,
          congregation_id: subscription.congregation_id,
          scenario: PixScenario.recurring,
          status: PixStatus.pending,
          amount: subscription.amount,
          category_id: subscription.category_id,
          donor_person_id: subscription.donor_person_id,
          asaas_payment_id: asaasPaymentId,
          pix_subscription_id: subscription.id,
        },
      ],
      skipDuplicates: true,
    });

    return this.prisma.client.pixPayment.findFirst({
      where: { asaas_payment_id: asaasPaymentId },
      select,
    });
  }

  // ── Webhook Asaas ─────────────────────────────────────────────────────────

  /**
   * Comparação em tempo constante: o token é o único segredo que separa a
   * internet de "criar receita no financeiro de qualquer igreja".
   */
  private isValidWebhookToken(token: string | undefined): boolean {
    const expected = process.env['ASAAS_WEBHOOK_TOKEN'];
    if (!expected || token === undefined) return false;

    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * O webhook roda como `orbien_app` sem `app.tenant_id` — `pix_payments`,
   * `pix_subscriptions` e `financial_transactions` não aparecem para ele, e a
   * confirmação era perdida em silêncio (200, nenhum lançamento). A única
   * coisa que ele conhece é o id da Asaas, e `pix_webhook_scope()`
   * (024_rls_pix_webhook_scope.sql, SECURITY DEFINER) é o caminho
   * "id da Asaas → tenant + congregação". Com o escopo em mãos, o resto roda
   * sob a RLS normal.
   */
  private async resolveWebhookScope(
    asaasPaymentId: string,
    asaasSubscriptionId: string | undefined,
  ): Promise<{ tenantId: string; congregationId: string } | null> {
    const rows = await this.prisma.$queryRaw<
      { scope_tenant_id: string; scope_congregation_id: string }[]
    >`SELECT scope_tenant_id, scope_congregation_id FROM pix_webhook_scope(${asaasPaymentId}, ${asaasSubscriptionId ?? null})`;

    if (rows.length === 0) return null;
    return { tenantId: rows[0].scope_tenant_id, congregationId: rows[0].scope_congregation_id };
  }

  async handleWebhook(payload: Record<string, unknown>, token: string | undefined) {
    if (!this.isValidWebhookToken(token)) {
      throw new UnauthorizedException('Token inválido');
    }

    const event = payload['event'] as string | undefined;
    if (event !== 'PAYMENT_CONFIRMED' && event !== 'PAYMENT_RECEIVED') {
      return { received: true };
    }

    const payment = payload['payment'] as Record<string, unknown> | undefined;
    const asaasPaymentId = payment?.['id'] as string | undefined;

    if (!asaasPaymentId) {
      // Só o evento: o payload da Asaas traz dados do pagador e não vai para log.
      this.logger.warn(`Webhook sem payment.id (event=${event})`);
      return { received: true };
    }

    const asaasSubscriptionId = payment?.['subscription'] as string | undefined;
    const scope = await this.resolveWebhookScope(asaasPaymentId, asaasSubscriptionId);

    if (!scope) {
      this.logger.warn(`PixPayment não encontrado para asaas_id=${asaasPaymentId}`);
      return { received: true };
    }

    const pixPaymentSelect = {
      id: true,
      tenant_id: true,
      congregation_id: true,
      amount: true,
      category_id: true,
      status: true,
      donor_person_id: true,
      scenario: true,
    } as const;

    // Tudo — achar a linha, materializar a cobrança recorrente, confirmar e
    // lançar — roda numa só transação com o contexto do tenant da LINHA
    // (devolvido por `pix_webhook_scope`, nunca do payload). Uma falha em
    // qualquer passo desfaz o conjunto e a Asaas reenvia o evento.
    const outcome = await this.prisma.runInTx(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${scope.tenantId}, true), set_config('app.congregation_id', ${scope.congregationId}, true)`;

      let pixPayment = await this.prisma.client.pixPayment.findFirst({
        where: { asaas_payment_id: asaasPaymentId },
        select: pixPaymentSelect,
      });

      // PIX recorrente (PROD-27): diferente dos cenários 2/3, a cobrança de
      // cada ciclo da assinatura Asaas nunca passa por um `create*` nosso — ela
      // nasce na própria Asaas, e a primeira notícia que temos é este webhook.
      // Sem `PixPayment` pré-existente para achar por `asaas_payment_id`, o que
      // liga a cobrança à igreja certa é `payload.payment.subscription`.
      if (!pixPayment) {
        pixPayment = await this.createPixPaymentFromSubscriptionWebhook(
          asaasSubscriptionId,
          asaasPaymentId,
          pixPaymentSelect,
        );
      }

      if (!pixPayment) return { kind: 'not_found' } as const;

      // Idempotência. A Asaas reenvia o webhook quando não recebe 200 a tempo, e
      // manda `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` para o mesmo pagamento —
      // os dois caem aqui. Sem esta guarda, cada reenvio criava OUTRO
      // lançamento de receita, e o dinheiro aparecia dobrado no DRE sem nenhum
      // erro à vista.
      //
      // O estado é a própria linha do pagamento: `confirmed` só é gravado no
      // mesmo `runInTx` que cria o lançamento, então "já está confirmado"
      // equivale a "o lançamento já existe".
      if (pixPayment.status === PixStatus.confirmed) return { kind: 'already_confirmed' } as const;

      const adminUserId = await this.resolveTenantAdmin(pixPayment.tenant_id);
      const amount = payment?.['value']
        ? new Prisma.Decimal(String(payment['value']))
        : pixPayment.amount;

      // A guarda que realmente fecha a porta é ESTE `updateMany` condicional, e
      // não o `if` acima: `pending → confirmed` só acontece para quem chega
      // primeiro, e o banco resolve o empate. O `if` anterior é atalho — evita
      // trabalho e deixa a linha de log —, mas entre ele e este ponto há
      // `await`, e duas entregas simultâneas (a Asaas manda `PAYMENT_CONFIRMED`
      // e `PAYMENT_RECEIVED` para o mesmo pagamento) passariam as duas.
      //
      // `count === 0` significa que outra entrega ganhou a corrida e já criou o
      // lançamento. Nada a fazer, e a resposta continua 200.
      //
      // `failed` também confirma: a limpeza das cobranças abandonadas
      // (`PublicDonationExpiryScheduler`) marca `failed` depois de cancelar na
      // Asaas, mas o pagamento real prevalece — cobrança paga que chegou tarde
      // é dinheiro na conta e tem que virar lançamento.
      const { count } = await tx.pixPayment.updateMany({
        where: { id: pixPayment.id, status: { in: [PixStatus.pending, PixStatus.failed] } },
        data: { status: PixStatus.confirmed, paid_at: new Date() },
      });

      if (count === 0) return { kind: 'lost_race' } as const;

      const transaction = await tx.financialTransaction.create({
        data: {
          tenant_id: pixPayment.tenant_id,
          congregation_id: pixPayment.congregation_id,
          type: TransactionType.income,
          amount,
          occurred_at: new Date(),
          description:
            pixPayment.scenario === PixScenario.event_registration
              ? 'Inscrição de evento paga via Asaas'
              : pixPayment.scenario === PixScenario.recurring
                ? 'PIX recorrente confirmado via Asaas'
                : pixPayment.scenario === PixScenario.public
                  ? 'Doação pública via PIX'
                  : 'PIX confirmado via Asaas',
          category_id: pixPayment.category_id,
          source: TransactionSource.pix_webhook,
          created_by_user_id: adminUserId,
          donor_person_id: pixPayment.donor_person_id,
        },
        select: { id: true },
      });

      // Inscrição de evento (PROD-24): a vaga já foi reservada no pedido
      // (`EventRegistrationsService`, status `pending_payment`, fora da
      // contagem de `confirmed`/`waitlisted`) — aqui só confirma. Sem
      // recontagem de vaga: a reserva já aconteceu, e recontar abriria a
      // mesma corrida que o pedido evitou.
      if (pixPayment.scenario === PixScenario.event_registration) {
        const { count: registrations } = await tx.eventRegistration.updateMany({
          where: { pix_payment_id: pixPayment.id, status: 'pending_payment' },
          data: { status: 'confirmed', payment_status: 'paid' },
        });
        if (registrations === 0) {
          this.logger.warn(
            `Webhook de inscrição paga sem registro pendente para pix_payment=${pixPayment.id}`,
          );
        }
      }

      return {
        kind: 'confirmed',
        transactionId: transaction.id,
        pixPayment,
        adminUserId,
      } as const;
    });

    if (outcome.kind === 'not_found') {
      this.logger.warn(`PixPayment não encontrado para asaas_id=${asaasPaymentId}`);
      return { received: true };
    }

    if (outcome.kind === 'already_confirmed') {
      this.logger.log(
        `Webhook repetido para asaas_id=${asaasPaymentId} (${event}); pagamento já confirmado`,
      );
      return { received: true };
    }

    if (outcome.kind === 'lost_race') {
      this.logger.log(
        `Entrega simultânea para asaas_id=${asaasPaymentId} (${event}); outra já confirmou`,
      );
      return { received: true };
    }

    const { transactionId, pixPayment, adminUserId } = outcome;

    // Best-effort por necessidade, não por conveniência: devolver erro à
    // Asaas faz ela reenviar o evento, e o reenvio de um evento já tratado é
    // o que a idempotência acima existe para conter.
    await writeAuditLog(
      this.prisma,
      {
        tenant_id: pixPayment.tenant_id,
        congregation_id: pixPayment.congregation_id,
        actor_user_id: adminUserId,
        entity: 'pix_payment',
        action: 'pix.confirmed',
        after: { asaas_payment_id: asaasPaymentId, event },
      },
      this.logger,
    );

    // Recibo automático (Premium, PROD-03) — só para doação; inscrição de
    // evento (PROD-24) não é doação e não emite recibo. Não pode desfazer um
    // pagamento já confirmado pela Asaas nem fazer o webhook responder com
    // erro (isso faria ela reenviar um evento já tratado). Ver
    // DonationReceiptService.
    if (pixPayment.scenario !== PixScenario.event_registration) {
      this.donationReceiptService.generateForTransaction(transactionId, scope).catch((err) => {
        this.logger.warn(`Falha ao gerar recibo de doação (transaction=${transactionId}): ${String(err)}`);
      });
    }

    return { received: true };
  }
}
