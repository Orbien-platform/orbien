import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Person } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KIDS_MANAGE_ROLES } from '../kids.roles';

/** Quem está agindo: o que o controller tira do JWT. */
export type KidsActor = {
  userId: string;
  tenantId: string;
  congregationId: string;
  roles: string[];
};

/**
 * Regra de acesso à ficha da criança (AD-013, spec "Quem gerencia"):
 * a gestão (`KIDS_MANAGE_ROLES`) enxerga qualquer criança da congregação; o
 * responsável só as do próprio Household — criança que não é dele devolve 404,
 * igual a inexistente, para não revelar que existe.
 */
@Injectable()
export class KidsChildAccessService {
  constructor(private readonly prisma: PrismaService) {}

  isManager(roles: string[]): boolean {
    return roles.some((r) => KIDS_MANAGE_ROLES.includes(r));
  }

  async ownPersonId(userId: string): Promise<string | null> {
    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: userId },
      select: { person_id: true },
    });
    return account?.person_id ?? null;
  }

  async requireOwnPersonId(userId: string): Promise<string> {
    const personId = await this.ownPersonId(userId);
    if (!personId) throw new ForbiddenException('Conta sem cadastro de pessoa vinculado');
    return personId;
  }

  /** A criança, se o ator pode acessá-la; 404 caso contrário. */
  async assertCanAccess(actor: KidsActor, childId: string): Promise<Person> {
    const child = await this.prisma.client.person.findFirst({
      where: {
        id: childId,
        tenant_id: actor.tenantId,
        congregation_id: actor.congregationId,
        is_child: true,
        deleted_at: null,
      },
    });
    if (!child) throw new NotFoundException('Criança não encontrada');
    if (this.isManager(actor.roles)) return child;

    const ownId = await this.requireOwnPersonId(actor.userId);
    const link = await this.prisma.client.householdMember.findFirst({
      where: {
        person_id: childId,
        role: 'child',
        household: { members: { some: { person_id: ownId, role: { not: 'child' } } } },
      },
      select: { id: true },
    });
    if (!link) throw new NotFoundException('Criança não encontrada');
    return child;
  }
}
