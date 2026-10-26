import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsActor, KidsChildAccessService } from '../children/kids-child-access.service';
import { KidsChildrenService } from '../children/kids-children.service';
import { KidsSessionAccessService } from './kids-session-access.service';

export type KidsLabels = {
  checkin_id: string;
  /** Etiqueta que fica na criança: nome, turma, alergia em destaque e o código. */
  child_label: { child_name: string; room_name: string; has_allergy: boolean; allergy: string | null; code: string };
  /** Etiqueta do responsável: o mesmo código e o nome da criança. Nunca saúde. */
  guardian_label: { child_name: string; room_name: string; code: string };
};

/**
 * Dados das duas etiquetas (AC 5) como JSON pronto para o front imprimir
 * (HTML/CSS `@page` no web). Sem QR: o check-in é só por código no MVP. O PDF
 * fica para depois — o `pdf-export.service` é de relatórios de celebração e
 * não serve de molde barato para uma etiqueta 62×29 mm.
 */
@Injectable()
export class KidsLabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KidsChildAccessService,
    private readonly sessionAccess: KidsSessionAccessService,
    private readonly children: KidsChildrenService,
  ) {}

  async forCheckin(actor: KidsActor, checkinId: string): Promise<KidsLabels> {
    const checkin = await this.prisma.client.kidsCheckin.findFirst({
      where: { id: checkinId, tenant_id: actor.tenantId, congregation_id: actor.congregationId },
      include: {
        child: { select: { id: true, full_name: true } },
        session: { select: { room: { select: { name: true } } } },
      },
    });
    if (!checkin) throw new NotFoundException('Check-in não encontrado');

    // Equipe vê a etiqueta de qualquer criança da sessão e a leitura de saúde
    // é auditada; o responsável, só a do próprio filho.
    const staff = await this.sessionAccess.canOperate(actor, checkin.session_id);
    if (!staff) {
      if (!actor.roles.includes('member')) throw new ForbiddenException('Sem permissão para esta etiqueta');
      await this.access.assertCanAccess(actor, checkin.child.id);
    }
    if (checkin.checked_out_at) throw new ConflictException('Este check-in já foi encerrado');

    const health = await this.prisma.client.kidsChildHealth.findUnique({
      where: { person_id: checkin.child.id },
      select: { allergies: true },
    });
    if (staff) await this.children.auditHealthRead(actor, checkin.child.id);

    const allergy = health?.allergies?.trim() || null;
    const roomName = checkin.session.room.name;
    return {
      checkin_id: checkin.id,
      child_label: {
        child_name: checkin.child.full_name,
        room_name: roomName,
        has_allergy: allergy !== null,
        allergy,
        code: checkin.code,
      },
      guardian_label: { child_name: checkin.child.full_name, room_name: roomName, code: checkin.code },
    };
  }
}
