import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { KidsSessionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsActor, KidsChildAccessService } from '../children/kids-child-access.service';
import { KidsConsentService } from '../consent/kids-consent.service';
import { KIDS_TERM_TEXT, KIDS_TERM_VERSION } from '../consent/kids-consent.terms';
import { CreateKidsCheckinDto } from './dto/create-kids-checkin.dto';
import { KIDS_CODE_MAX_ATTEMPTS, generateUniqueCode } from './kids-checkin-code';
import { KidsSessionAccessService } from './kids-session-access.service';

export type KidsCapacityWarning = { capacity: number; present: number };

export type KidsCheckinResult = {
  id: string;
  session_id: string;
  child_id: string;
  guardian_person_id: string;
  code: string;
  checked_in_at: Date;
  checked_in_by: string;
  age_override: boolean;
  capacity_warning: KidsCapacityWarning | null;
};

/** Meses completos entre o nascimento e `now` (UTC). */
export function ageInMonths(birth: Date, now: Date = new Date()): number {
  let months = (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + (now.getUTCMonth() - birth.getUTCMonth());
  if (now.getUTCDate() < birth.getUTCDate()) months -= 1;
  return Math.max(months, 0);
}

function unprocessable(code: string, message: string, extra: Record<string, unknown> = {}) {
  return new UnprocessableEntityException({
    statusCode: 422,
    error: 'Unprocessable Entity',
    code,
    message,
    ...extra,
  });
}

const ALREADY_PRESENT = 'Esta criança já está presente';

/**
 * Check-in e check-out seguros (KIDS-08/09). Check-in só por código — o QR é
 * futuro e entra sem mudar o modelo. Toda gravação tem quem entrega
 * (`guardian_person_id`, um KidsGuardian) e quem recebe (`checked_in_by`, o
 * usuário autenticado).
 */
@Injectable()
export class KidsCheckinService {
  private readonly logger = new Logger(KidsCheckinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KidsChildAccessService,
    private readonly consent: KidsConsentService,
    private readonly sessionAccess: KidsSessionAccessService,
  ) {}

  async checkIn(actor: KidsActor, sessionId: string, dto: CreateKidsCheckinDto): Promise<KidsCheckinResult> {
    if (!dto.guardian_person_id) throw new BadRequestException('Informe quem está entregando a criança');
    if (!actor.userId) throw new BadRequestException('Informe quem está recebendo a criança');

    const session = await this.prisma.client.kidsSession.findFirst({
      where: { id: sessionId, tenant_id: actor.tenantId, congregation_id: actor.congregationId },
      include: { room: true, celebrationInstance: { select: { status: true } } },
    });
    if (!session) throw new NotFoundException('Sessão kids não encontrada');

    const child = await this.resolveChild(actor, sessionId, dto);

    if (session.status === KidsSessionStatus.cancelled || session.celebrationInstance.status === 'cancelled') {
      throw unprocessable('kids_session_cancelled', 'Sessão cancelada não aceita check-in');
    }
    if (!child.birth_date) {
      throw unprocessable('kids_birth_date_required', 'Informe a data de nascimento da criança antes do check-in');
    }

    const guardians = await this.prisma.client.kidsGuardian.findMany({
      where: { child_id: child.id },
      select: { guardian_person_id: true, is_primary: true },
    });
    if (!guardians.some((g) => g.guardian_person_id === dto.guardian_person_id)) {
      throw unprocessable('kids_guardian_not_authorized', 'Esta pessoa não é responsável nem autorizada desta criança');
    }
    await this.assertConsent(guardians.filter((g) => g.is_primary).map((g) => g.guardian_person_id));

    const instanceId = session.celebration_instance_id;
    if (await this.hasOpenCheckin(child.id, instanceId)) throw new ConflictException(ALREADY_PRESENT);

    const ageOverride = this.checkAgeRange(session.room, ageInMonths(child.birth_date), dto.confirm_out_of_range === true);

    const created = await this.insert(actor, session, child.id, dto.guardian_person_id, ageOverride);

    // Capacidade só avisa (AC 4): conta já com a criança recém-chegada.
    const present = await this.prisma.client.kidsCheckin.count({ where: { session_id: sessionId, checked_out_at: null } });
    const capacity = session.room.capacity;
    return {
      id: created.id,
      session_id: created.session_id,
      child_id: created.child_id,
      guardian_person_id: created.guardian_person_id,
      code: created.code,
      checked_in_at: created.checked_in_at,
      checked_in_by: created.checked_in_by,
      age_override: created.age_override,
      capacity_warning: capacity !== null && present >= capacity ? { capacity, present } : null,
    };
  }

  // Equipe (gestão ou voluntário escalado) vê qualquer criança da congregação;
  // o responsável só as do próprio Household e só entregando como ele mesmo.
  private async resolveChild(actor: KidsActor, sessionId: string, dto: CreateKidsCheckinDto) {
    if (await this.sessionAccess.canOperate(actor, sessionId)) {
      const child = await this.prisma.client.person.findFirst({
        where: {
          id: dto.child_id,
          tenant_id: actor.tenantId,
          congregation_id: actor.congregationId,
          is_child: true,
          deleted_at: null,
        },
        select: { id: true, full_name: true, birth_date: true },
      });
      if (!child) throw new NotFoundException('Criança não encontrada');
      return child;
    }
    if (!actor.roles.includes('member')) {
      throw new ForbiddenException('Sem permissão para operar esta sessão');
    }
    const child = await this.access.assertCanAccess(actor, dto.child_id);
    const ownId = await this.access.requireOwnPersonId(actor.userId);
    if (dto.guardian_person_id !== ownId) {
      throw new ForbiddenException('Pelo app, só o próprio responsável faz o check-in do filho');
    }
    return child;
  }

  // O consentimento é do responsável que cadastrou a criança (primário). O
  // terceiro autorizado não tem termo — vale o do primário (AC 6 do cadastro:
  // revogado, nenhum primário vigente, sem novos check-ins).
  private async assertConsent(primaryIds: string[]): Promise<void> {
    for (const id of primaryIds) {
      if (await this.consent.hasValidConsent(id)) return;
    }
    throw unprocessable('kids_consent_required', 'É preciso o consentimento vigente do responsável para o check-in', {
      term_version: KIDS_TERM_VERSION,
      term_text: KIDS_TERM_TEXT,
    });
  }

  private async hasOpenCheckin(childId: string, instanceId: string): Promise<boolean> {
    const open = await this.prisma.client.kidsCheckin.findFirst({
      where: { child_id: childId, celebration_instance_id: instanceId, checked_out_at: null },
      select: { id: true },
    });
    return open !== null;
  }

  private checkAgeRange(
    room: { name: string; min_age_months: number; max_age_months: number; allows_out_of_range: boolean },
    months: number,
    confirmed: boolean,
  ): boolean {
    if (months >= room.min_age_months && months <= room.max_age_months) return false;
    const range = { age_months: months, min_age_months: room.min_age_months, max_age_months: room.max_age_months };
    if (!room.allows_out_of_range) {
      throw unprocessable('kids_out_of_range', 'Criança fora da faixa etária da turma', { ...range, room_name: room.name });
    }
    if (!confirmed) {
      throw unprocessable('OUT_OF_RANGE_CONFIRM', 'Criança fora da faixa etária da turma. Confirme para seguir', {
        ...range,
        room_name: room.name,
        requires_confirmation: true,
      });
    }
    return true;
  }

  // A requisição inteira roda numa transação; um INSERT que viola unicidade a
  // aborta e não dá para tentar de novo dentro dela. Por isso `skipDuplicates`
  // (ON CONFLICT DO NOTHING): quem perde a corrida volta sem linha, sem
  // exceção, e só então descobrimos se foi a criança (409) ou o código (sorteia
  // outro).
  private async insert(
    actor: KidsActor,
    session: { id: string; celebration_instance_id: string },
    childId: string,
    guardianPersonId: string,
    ageOverride: boolean,
  ) {
    for (let attempt = 0; attempt < KIDS_CODE_MAX_ATTEMPTS; attempt++) {
      const code = await generateUniqueCode(async (candidate) => {
        const taken = await this.prisma.client.kidsCheckin.findFirst({
          where: { session_id: session.id, code: candidate },
          select: { id: true },
        });
        return taken !== null;
      });
      try {
        const [row] = await this.prisma.client.kidsCheckin.createManyAndReturn({
          data: [
            {
              tenant_id: actor.tenantId,
              congregation_id: actor.congregationId,
              session_id: session.id,
              celebration_instance_id: session.celebration_instance_id,
              child_id: childId,
              guardian_person_id: guardianPersonId,
              code,
              age_override: ageOverride,
              checked_in_by: actor.userId,
            },
          ],
          skipDuplicates: true,
        });
        if (row) return row;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(ALREADY_PRESENT);
        }
        throw e;
      }
      if (await this.hasOpenCheckin(childId, session.celebration_instance_id)) {
        throw new ConflictException(ALREADY_PRESENT);
      }
    }
    this.logger.error(`sem código livre na sessão ${session.id} após ${KIDS_CODE_MAX_ATTEMPTS} corridas`);
    throw new InternalServerErrorException('Não foi possível gerar o código de retirada');
  }
}
