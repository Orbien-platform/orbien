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

  /** Dentre `sessionIds`, as em que o usuário está escalado (mesma regra de `isScheduled`, em lote). */
  async scheduledAmong(userId: string, sessionIds: string[]): Promise<Set<string>> {
    const personId = await this.access.ownPersonId(userId);
    if (!personId || sessionIds.length === 0) return new Set();
    const rows = await this.prisma.client.celebrationAssignment.findMany({
      where: {
        status: { in: ['pending', 'confirmed'] },
        volunteerProfile: { person_id: personId },
        celebrationMinistry: { kids_session_id: { in: sessionIds } },
      },
      select: { celebrationMinistry: { select: { kids_session_id: true } } },
    });
    return new Set(rows.map((r) => r.celebrationMinistry.kids_session_id).filter((x): x is string => !!x));
  }

  async canOperate(actor: KidsActor, sessionId: string): Promise<boolean> {
    if (this.access.isManager(actor.roles)) return true;
    if (!actor.roles.includes('volunteer')) return false;
    return this.isScheduled(actor.userId, sessionId);
  }
}
