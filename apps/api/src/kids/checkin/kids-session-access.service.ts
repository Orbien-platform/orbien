import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsActor, KidsChildAccessService } from '../children/kids-child-access.service';

/**
 * Quem opera uma sessão kids (spec "Quem gerencia"): a gestão, ou o voluntário
 * ESCALADO naquela sessão — assignment cujo `CelebrationMinistry.kids_session_id`
 * é a sessão (a F5 liga a escala à sessão; até lá só dado montado passa).
 * Escala recusada (`declined`) ou trocada (`swapped`) não conta.
 */
@Injectable()
export class KidsSessionAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KidsChildAccessService,
  ) {}

  async isScheduled(userId: string, sessionId: string): Promise<boolean> {
    const personId = await this.access.ownPersonId(userId);
    if (!personId) return false;
    const found = await this.prisma.client.celebrationAssignment.findFirst({
      where: {
        status: { in: ['pending', 'confirmed'] },
        volunteerProfile: { person_id: personId },
        celebrationMinistry: { kids_session_id: sessionId },
      },
      select: { id: true },
    });
    return found !== null;
  }

  async canOperate(actor: KidsActor, sessionId: string): Promise<boolean> {
    if (this.access.isManager(actor.roles)) return true;
    if (!actor.roles.includes('volunteer')) return false;
    return this.isScheduled(actor.userId, sessionId);
  }
}
