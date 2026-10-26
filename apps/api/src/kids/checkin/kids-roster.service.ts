import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsActor } from '../children/kids-child-access.service';
import { KidsChildrenService } from '../children/kids-children.service';
import { KidsSessionAccessService } from './kids-session-access.service';

export type KidsRosterItem = {
  checkin_id: string;
  checked_in_at: Date;
  age_override: boolean;
  child: { id: string; full_name: string; birth_date: Date | null };
  guardian: { person_id: string; full_name: string };
  has_allergy: boolean;
  allergies: string | null;
};

/**
 * Quem está presente na sessão (design: balcão). Alergia vem em destaque; a
 * observação médica fica na ficha. O código de retirada NÃO sai aqui: a equipe
 * o vê no check-in e o responsável o relê por `GET /kids/children/:id/checkin`;
 * esquecido, o caminho é o override do líder. Ler saúde pela equipe é auditado como em
 * `KidsChildrenService.getFicha` — o conteúdo nunca vai para o log.
 */
@Injectable()
export class KidsRosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionAccess: KidsSessionAccessService,
    private readonly children: KidsChildrenService,
  ) {}

  async roster(actor: KidsActor, sessionId: string) {
    const session = await this.prisma.client.kidsSession.findFirst({
      where: { id: sessionId, tenant_id: actor.tenantId, congregation_id: actor.congregationId },
      include: { room: { select: { id: true, name: true, capacity: true } } },
    });
    if (!session) throw new NotFoundException('Sessão kids não encontrada');
    if (!(await this.sessionAccess.canOperate(actor, sessionId))) {
      throw new ForbiddenException('Sem permissão para ver esta sessão');
    }

    const present = await this.prisma.client.kidsCheckin.findMany({
      where: {
        session_id: sessionId,
        tenant_id: actor.tenantId,
        congregation_id: actor.congregationId,
        checked_out_at: null,
      },
      include: {
        child: { select: { id: true, full_name: true, birth_date: true } },
        guardian: { select: { id: true, full_name: true } },
      },
      orderBy: { checked_in_at: 'asc' },
    });

    const childIds = present.map((c) => c.child.id);
    const health = childIds.length
      ? await this.prisma.client.kidsChildHealth.findMany({
          where: { person_id: { in: childIds } },
          select: { person_id: true, allergies: true },
        })
      : [];
    const allergiesOf = new Map(health.map((h) => [h.person_id, h.allergies?.trim() || null]));
    await Promise.all(health.map((h) => this.children.auditHealthRead(actor, h.person_id)));

    const items: KidsRosterItem[] = present.map((c) => {
      const allergies = allergiesOf.get(c.child.id) ?? null;
      return {
        checkin_id: c.id,
        checked_in_at: c.checked_in_at,
        age_override: c.age_override,
        child: c.child,
        guardian: { person_id: c.guardian.id, full_name: c.guardian.full_name },
        has_allergy: allergies !== null,
        allergies,
      };
    });

    return {
      session: {
        id: session.id,
        status: session.status,
        celebration_instance_id: session.celebration_instance_id,
        room: session.room,
      },
      present_count: items.length,
      items,
    };
  }
}
