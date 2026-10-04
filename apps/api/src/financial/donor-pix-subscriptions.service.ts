import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PixStatus, PixSubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PixService } from './pix.service';
import { assertAsaasPaymentsEnabled } from './asaas-payments.flag';
import { CreateMyPixSubscriptionDto } from './dto/create-my-pix-subscription.dto';

/**
 * Dízimo automático contratado pelo próprio doador (PROD-28), atrás da trava
 * `ASAAS_PAYMENTS_ENABLED`.
 *
 * As rotas do tesoureiro (`/financial/pix/subscriptions`) recebem o doador no
 * corpo; estas nunca. Três coisas vêm do banco, nunca do token nem do corpo:
 *
 *   - **quem é o doador**: `user_accounts.person_id` da conta do token. O JWT
 *     não carrega pessoa, e a conta pode não ter uma (importação antiga);
 *   - **o plano**: `tenant_plans.plan`. A claim `plan` vive até 15 minutos
 *     depois de um rebaixamento — para dinheiro, essa janela não vale;
 *   - **de quem é a assinatura**: toda consulta filtra `donor_person_id`. O
 *     RLS de `pix_subscriptions` (023) isola tenant e congregação, não pessoa
 *     — sem este filtro, um membro veria a assinatura do vizinho de banco.
 *
 * Linha de outra pessoa responde 404, não 403: não confirma que existe.
 */
@Injectable()
export class DonorPixSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pixService: PixService,
  ) {}

  async create(dto: CreateMyPixSubscriptionDto, user: JwtPayload) {
    assertAsaasPaymentsEnabled();
    this.assertNotSupportSession(user);

    const donorPersonId = await this.findDonorPersonId(user);
    if (!donorPersonId) {
      throw new ConflictException(
        'Sua conta ainda não está ligada a um cadastro de pessoa. Fale com a secretaria da igreja.',
      );
    }

    await this.assertPremiumFromDb(user.tenant_id);

    // Atalho barato para o caso comum (toque duplo, tela desatualizada): não
    // chega a abrir assinatura na Asaas. Considera também a que o tesoureiro
    // criou para a pessoa — a tela mostra uma ativa por vez. A garantia contra
    // corrida é a unique parcial do banco (só as do doador) —
    // `PixService.createSubscriptionFor` a traduz em 409 e desfaz a
    // assinatura que já tinha aberto lá.
    const active = await this.prisma.client.pixSubscription.findFirst({
      where: {
        tenant_id: user.tenant_id,
        donor_person_id: donorPersonId,
        status: PixSubscriptionStatus.active,
      },
      select: { id: true },
    });
    if (active) {
      throw new ConflictException('Você já tem um dízimo automático ativo');
    }

    return this.pixService.createSubscriptionFor(
      { donorPersonId, amount: dto.amount, consentVersion: dto.consent_version },
      user,
    );
  }

  /**
   * As assinaturas da própria pessoa, com as cobranças já confirmadas de
   * cada uma (o "o que já dizimei"). Sem pessoa ligada à conta, lista vazia —
   * leitura não falha. Não passa pela trava nem pelo plano: quem tem
   * assinatura precisa poder vê-la para cancelar.
   */
  async list(user: JwtPayload) {
    const donorPersonId = await this.findDonorPersonId(user);
    if (!donorPersonId) return [];

    return this.prisma.client.pixSubscription.findMany({
      where: { tenant_id: user.tenant_id, donor_person_id: donorPersonId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        amount: true,
        status: true,
        created_at: true,
        cancelled_at: true,
        payments: {
          where: { status: PixStatus.confirmed },
          orderBy: { paid_at: 'desc' },
          take: 12,
          select: { id: true, amount: true, paid_at: true },
        },
      },
    });
  }

  /** Cancelar nunca é barrado por trava nem por plano — só por dono. */
  async cancel(id: string, user: JwtPayload) {
    this.assertNotSupportSession(user);

    const donorPersonId = await this.findDonorPersonId(user);
    if (!donorPersonId) throw new NotFoundException('Assinatura não encontrada');

    const subscription = await this.prisma.client.pixSubscription.findFirst({
      where: { id, tenant_id: user.tenant_id, donor_person_id: donorPersonId },
      select: { id: true, status: true, asaas_subscription_id: true },
    });
    if (!subscription) throw new NotFoundException('Assinatura não encontrada');

    const result = await this.pixService.cancelSubscriptionRow(subscription);
    return { id: result.id, status: result.status };
  }

  private async findDonorPersonId(user: JwtPayload): Promise<string | null> {
    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: user.sub },
      select: { person_id: true },
    });
    return account?.person_id ?? null;
  }

  private async assertPremiumFromDb(tenantId: string): Promise<void> {
    const tenantPlan = await this.prisma.client.tenantPlan.findUnique({
      where: { tenant_id: tenantId },
      select: { plan: true },
    });
    if (tenantPlan?.plan !== 'premium') {
      throw new ForbiddenException('Recurso disponível apenas no plano Premium');
    }
  }

  /**
   * Sessão de suporte (`POST /auth/impersonate`) existe para ver o que o
   * tenant vê, não para mover dinheiro em nome de um membro.
   */
  private assertNotSupportSession(user: JwtPayload): void {
    if (user.support_session) {
      throw new ForbiddenException('Sessão de suporte não altera o dízimo de um membro');
    }
  }
}
