import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { TransferUserAccountDto } from './dto/transfer-user-account.dto';

/**
 * `role_assignments.role_code` de `platform_support` nunca é removido pela
 * transferência — o papel é global (AUTH-10/spec P2 AC3), não amarrado ao
 * tenant onde foi atribuído.
 */
const PLATFORM_ROLE = 'platform_support';

export interface TransferredAccount {
  user_account_id: string;
  previous_tenant_id: string;
  previous_congregation_id: string;
  tenant_id: string;
  congregation_id: string;
}

/**
 * Move `UserAccount` + `Person` (mesma pessoa, mesmo `person_id`) de um
 * tenant para outro — a operação que sustenta o e-mail único global: sem
 * ela, alguém que muda de igreja-cliente fica sem caminho (não pode
 * recriar a conta com o mesmo e-mail no tenant novo, nem seguir presa ao
 * antigo).
 *
 * Roda numa única transação Prisma: conta, pessoa, papéis e sessão caem
 * juntos ou nenhum cai. O `audit_insert()` fica FORA da transação de
 * negócio de propósito — mesmo princípio best-effort do `AuditInterceptor`
 * (ver AD-004): uma falha ao gravar o rastro não desfaz a transferência já
 * confirmada, só fica logada.
 */
@Injectable()
export class TransferUserAccountService {
  private readonly logger = new Logger(TransferUserAccountService.name);

  constructor(private readonly prisma: PrismaService) {}

  async transfer(
    userAccountId: string,
    dto: TransferUserAccountDto,
    actor: JwtPayload,
  ): Promise<TransferredAccount> {
    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: userAccountId },
      select: { id: true, tenant_id: true, congregation_id: true, person_id: true },
    });
    if (!account) {
      throw new NotFoundException(`Conta '${userAccountId}' não encontrada`);
    }

    if (account.tenant_id === dto.destination_tenant_id) {
      throw new BadRequestException(
        'A conta já está no tenant de destino — transferência é um no-op inválido.',
      );
    }

    const destinationTenant = await this.prisma.client.tenant.findUnique({
      where: { id: dto.destination_tenant_id },
      select: { id: true, is_active: true },
    });
    if (!destinationTenant) {
      throw new NotFoundException(`Tenant de destino '${dto.destination_tenant_id}' não encontrado`);
    }
    if (!destinationTenant.is_active) {
      throw new BadRequestException(
        `Tenant de destino '${dto.destination_tenant_id}' está inativo`,
      );
    }

    const destinationCongregation = await this.prisma.client.congregation.findUnique({
      where: { id: dto.destination_congregation_id },
      select: { id: true, tenant_id: true },
    });
    if (!destinationCongregation) {
      throw new NotFoundException(
        `Congregação de destino '${dto.destination_congregation_id}' não encontrada`,
      );
    }
    if (destinationCongregation.tenant_id !== dto.destination_tenant_id) {
      throw new BadRequestException(
        `Congregação de destino '${dto.destination_congregation_id}' não pertence ao tenant de destino`,
      );
    }

    const previousTenantId = account.tenant_id;
    const previousCongregationId = account.congregation_id;

    // runInTx reaproveita a transação que o TenantContextInterceptor já abriu
    // para esta requisição de plataforma — mesmo padrão de ProvisionTenantService.
    // Conta, pessoa, papéis do tenant de origem e sessão caem juntos ou nenhum.
    await this.prisma.runInTx(async (tx) => {
      await tx.userAccount.update({
        where: { id: userAccountId },
        data: {
          tenant_id: dto.destination_tenant_id,
          congregation_id: dto.destination_congregation_id,
        },
      });

      if (account.person_id) {
        await tx.person.update({
          where: { id: account.person_id },
          data: {
            tenant_id: dto.destination_tenant_id,
            congregation_id: dto.destination_congregation_id,
          },
        });
      }

      // Papéis são de tenant/congregação; herdar do tenant antigo sem
      // avaliação de quem administra o novo seria conceder acesso não
      // avaliado (AUTH-10). platform_support é a única exceção — é global.
      await tx.roleAssignment.deleteMany({
        where: {
          user_account_id: userAccountId,
          tenant_id: previousTenantId,
          role_code: { not: PLATFORM_ROLE },
        },
      });

      // Mesmo padrão de AuthService.refresh: reuso de token detectado revoga
      // a família inteira. Aqui a família cai por definição — a pessoa
      // precisa logar de novo depois da transferência.
      await tx.refreshToken.updateMany({
        where: { user_account_id: userAccountId, revoked_at: null },
        data: { revoked_at: new Date() },
      });
    });

    await this.recordTransferAudit(
      actor,
      userAccountId,
      previousTenantId,
      previousCongregationId,
      dto,
    );

    return {
      user_account_id: userAccountId,
      previous_tenant_id: previousTenantId,
      previous_congregation_id: previousCongregationId,
      tenant_id: dto.destination_tenant_id,
      congregation_id: dto.destination_congregation_id,
    };
  }

  /**
   * Grava `audit_logs` no tenant de ORIGEM (spec P2 AC4) — é ali que alguém
   * vai procurar "o que aconteceu com essa conta". Best-effort, como todo
   * chamador de `audit_insert()`: uma falha aqui não desfaz a transferência,
   * que já está confirmada no banco.
   */
  private async recordTransferAudit(
    actor: JwtPayload,
    userAccountId: string,
    previousTenantId: string,
    previousCongregationId: string,
    dto: TransferUserAccountDto,
  ): Promise<void> {
    const before = JSON.stringify({
      tenant_id: previousTenantId,
      congregation_id: previousCongregationId,
    });
    const after = JSON.stringify({
      tenant_id: dto.destination_tenant_id,
      congregation_id: dto.destination_congregation_id,
    });

    try {
      const rows = await this.prisma.client.$queryRaw<
        { resolve_actor_name: string | null }[]
      >`SELECT resolve_actor_name(${actor.sub}::text)`;
      const actorNameSnapshot = rows[0]?.resolve_actor_name ?? null;

      await this.prisma.client.$executeRaw`
        SELECT audit_insert(
          ${previousTenantId}::text,
          ${previousCongregationId}::text,
          ${actor.sub}::text,
          ${null}::text,
          ${'user_account'}::text,
          ${'tenant_transfer'}::text,
          ${before}::jsonb,
          ${after}::jsonb,
          ${null}::text,
          ${null}::text,
          ${actorNameSnapshot}::text
        )
      `;
    } catch (err: unknown) {
      this.logger.error(
        `falha ao registrar tenant_transfer da conta ${userAccountId}: ${String(err)}`,
      );
    }
  }
}
