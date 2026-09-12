import { BadRequestException, Injectable } from '@nestjs/common';
import { PersonClassification, PlanType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// `pricing-church-platform.md`, seção "Faixas": "Starter não está disponível
// acima de 300 membros ativos. Igrejas que ultrapassam esse limite migram
// obrigatoriamente para o Premium."
export const STARTER_MEMBER_CAP = 300;

@Injectable()
export class MemberCapService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Chamado nos três lugares onde uma `Person` pode virar `member`:
   * `PersonsService.create`, `PersonsService.update` e
   * `ClassificationService.manualReclassify`. Não é chamado em toda edição —
   * só quando a classificação está **entrando** em `member`; editar outros
   * campos de quem já é membro nunca recontava nem falhava por isso.
   *
   * Consulta o plano no banco, não no token: é um limite de negócio, não de
   * sessão — uma claim `plan` desatualizada (o token vive até 15 minutos)
   * não pode nem abrir nem fechar a exceção antes da hora.
   */
  async assertCanPromoteToMember(tenantId: string): Promise<void> {
    const tenantPlan = await this.prisma.client.tenantPlan.findUnique({
      where: { tenant_id: tenantId },
      select: { plan: true },
    });

    // Tenant sem `TenantPlan` não devia existir (todo provisionamento cria
    // um), mas se acontecer o padrão seguro é tratar como Starter — o teto
    // mais restritivo, nunca o mais permissivo.
    if ((tenantPlan?.plan ?? PlanType.starter) !== PlanType.starter) return;

    const activeMembers = await this.prisma.client.person.count({
      where: {
        tenant_id: tenantId,
        classification: PersonClassification.member,
        deleted_at: null,
      },
    });

    if (activeMembers >= STARTER_MEMBER_CAP) {
      throw new BadRequestException(
        `O plano Starter não permite mais de ${STARTER_MEMBER_CAP} membros ativos. ` +
          'Migre para o Premium para continuar promovendo pessoas a membro.',
      );
    }
  }
}
