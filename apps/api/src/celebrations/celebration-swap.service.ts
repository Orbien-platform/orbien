import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AssignmentStatus, CelebrationInstanceStatus, Prisma, ScheduleStatus, SwapRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, orGroup, type OneSignalFilter } from '../content/notifications.service';
import { CreateSwapRequestDto } from './dto/create-swap-request.dto';

/**
 * Troca de escala entre voluntários (v2, "Minhas escalas" → Trocas).
 *
 * Quem está escalado pede a um colega do mesmo ministério, ou a qualquer um
 * dele. Aceitar é atômico: a atribuição original vira `swapped` e quem aceitou
 * ganha a própria, já `confirmed` — aceitar é o "sim" dele, não há segundo
 * passo. O líder vê o resultado na escala como sempre viu.
 *
 * O RLS (`025_rls_assignment_swap_requests.sql`) recorta por congregação; quem
 * recorta por pessoa é este service, como em `CelebrationAssignmentService`.
 */

const SWAPPABLE: AssignmentStatus[] = [AssignmentStatus.pending, AssignmentStatus.confirmed];
const OUTGOING_WINDOW_DAYS = 30;

export type CandidateAvailability = 'free' | 'unavailable';

export interface SwapCandidate {
  volunteer_profile_id: string;
  full_name: string;
  /**
   * `unavailable` junta, de propósito, "já escalado em outro ministério no
   * mesmo culto" e "marcou indisponibilidade na data": o voluntário vê que o
   * colega não está livre, não o motivo. Quem vê a indisponibilidade de cada
   * um é a liderança (`GET volunteers/ministries/:id/availability`).
   */
  availability: CandidateAvailability;
}

interface PersonRef {
  volunteer_profile_id: string;
  full_name: string;
}

export interface SwapRequestView {
  id: string;
  status: SwapRequestStatus;
  message: string | null;
  created_at: Date;
  responded_at: Date | null;
  assignment: {
    id: string;
    scheduled_date: Date;
    celebration: { name: string; start_time: string };
    ministry: { id: string; name: string };
  };
  requester: PersonRef;
  target: PersonRef | null;
  accepted_by: PersonRef | null;
}

const PROFILE_PERSON = {
  select: { id: true, person: { select: { id: true, full_name: true } } },
} as const;

const ASSIGNMENT_CONTEXT = {
  include: {
    celebrationMinistry: {
      include: {
        ministry: { select: { id: true, name: true } },
        schedule: {
          select: {
            id: true,
            status: true,
            celebrationInstance: {
              select: {
                scheduled_date: true,
                celebration: { select: { name: true, start_time: true } },
              },
            },
          },
        },
      },
    },
  },
} as const;

const REQUEST_INCLUDE = {
  assignment: ASSIGNMENT_CONTEXT,
  requester: PROFILE_PERSON,
  target: PROFILE_PERSON,
  acceptedBy: PROFILE_PERSON,
} as const;

type AssignmentWithContext = Prisma.CelebrationAssignmentGetPayload<typeof ASSIGNMENT_CONTEXT>;
type RequestWithContext = Prisma.AssignmentSwapRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;
type ProfileWithPerson = Prisma.VolunteerProfileGetPayload<typeof PROFILE_PERSON>;

function startOfTodayUtc(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

function personRef(profile: ProfileWithPerson | null): PersonRef | null {
  if (!profile) return null;
  return { volunteer_profile_id: profile.id, full_name: profile.person.full_name };
}

function toView(req: RequestWithContext): SwapRequestView {
  const { celebrationMinistry } = req.assignment;
  const instance = celebrationMinistry.schedule.celebrationInstance;
  return {
    id: req.id,
    status: req.status,
    message: req.message,
    created_at: req.created_at,
    responded_at: req.responded_at,
    assignment: {
      id: req.assignment.id,
      scheduled_date: instance.scheduled_date,
      celebration: { name: instance.celebration.name, start_time: instance.celebration.start_time },
      ministry: celebrationMinistry.ministry,
    },
    requester: personRef(req.requester)!,
    target: personRef(req.target),
    accepted_by: personRef(req.acceptedBy),
  };
}

/** Qualquer uma das pessoas: um filtro de tag por pessoa, intercalados por `OR`. */
function anyPerson(personIds: string[]): OneSignalFilter[] {
  return orGroup(
    personIds.map((id): OneSignalFilter => ({ field: 'tag', key: 'person_id', relation: '=', value: id })),
  );
}

@Injectable()
export class CelebrationSwapService {
  private readonly logger = new Logger(CelebrationSwapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async myProfile(
    userId: string,
    tenantId: string,
    congregationId: string,
  ): Promise<ProfileWithPerson> {
    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: userId },
      select: { person_id: true },
    });
    if (!account?.person_id) throw new NotFoundException('Usuário sem vínculo de pessoa');
    const profile = await this.prisma.client.volunteerProfile.findFirst({
      where: { person_id: account.person_id, tenant_id: tenantId, congregation_id: congregationId },
      ...PROFILE_PERSON,
    });
    if (!profile) throw new NotFoundException('Perfil de voluntário não encontrado');
    return profile;
  }

  /** A escala ainda pode trocar de mão: publicada, em aberto, sem check-in, por vir. */
  private assertSwappable(assignment: AssignmentWithContext): void {
    const { schedule } = assignment.celebrationMinistry;
    if (schedule.status !== ScheduleStatus.published) {
      throw new UnprocessableEntityException('A escala ainda está em rascunho');
    }
    if (!SWAPPABLE.includes(assignment.status) || assignment.checked_in_at) {
      throw new ConflictException('Esta escala não pode mais ser trocada');
    }
    if (schedule.celebrationInstance.scheduled_date < startOfTodayUtc()) {
      throw new UnprocessableEntityException('Esta escala já passou');
    }
  }

  private async loadOwnAssignment(
    assignmentId: string,
    profileId: string,
    tenantId: string,
  ): Promise<AssignmentWithContext> {
    const assignment = await this.prisma.client.celebrationAssignment.findFirst({
      where: { id: assignmentId, tenant_id: tenantId },
      ...ASSIGNMENT_CONTEXT,
    });
    if (!assignment) throw new NotFoundException('Atribuição não encontrada');
    if (assignment.volunteer_profile_id !== profileId) {
      throw new ForbiddenException('Você só pode pedir troca da sua própria escala');
    }
    this.assertSwappable(assignment);
    return assignment;
  }

  /**
   * Pode assumir a vaga: serve no ministério e ainda não está nela (em
   * qualquer status — o unique de `celebration_assignments` não deixaria).
   */
  private async canTakeOver(profileId: string, assignment: AssignmentWithContext): Promise<boolean> {
    const [membership, inSlot] = await Promise.all([
      this.prisma.client.volunteerMinistry.findUnique({
        where: {
          volunteer_profile_id_ministry_id: {
            volunteer_profile_id: profileId,
            ministry_id: assignment.celebrationMinistry.ministry_id,
          },
        },
        select: { id: true },
      }),
      this.prisma.client.celebrationAssignment.findUnique({
        where: {
          celebration_ministry_id_volunteer_profile_id: {
            celebration_ministry_id: assignment.celebration_ministry_id,
            volunteer_profile_id: profileId,
          },
        },
        select: { id: true },
      }),
    ]);
    return !!membership && !inSlot;
  }

  private notify(personIds: string[], tenantId: string, congregationId: string, title: string, body: string, requestId: string): void {
    if (personIds.length === 0) return;
    this.notifications
      .sendPush({
        tenantId,
        congregationId,
        contentPostId: null,
        title,
        body,
        filters: anyPerson(personIds),
        data: { type: 'assignment_swap_request', swap_request_id: requestId },
      })
      .catch((err: unknown) => {
        this.logger.error(`Falha ao notificar pedido de troca ${requestId}: ${String(err)}`);
      });
  }

  private async loadRequest(requestId: string, tenantId: string): Promise<RequestWithContext> {
    const req = await this.prisma.client.assignmentSwapRequest.findFirst({
      where: { id: requestId, tenant_id: tenantId },
      include: REQUEST_INCLUDE,
    });
    if (!req) throw new NotFoundException('Pedido de troca não encontrado');
    return req;
  }

  // ── Candidatos ─────────────────────────────────────────────────────────────

  async getCandidates(
    assignmentId: string,
    userId: string,
    tenantId: string,
    congregationId: string,
  ): Promise<SwapCandidate[]> {
    const me = await this.myProfile(userId, tenantId, congregationId);
    const assignment = await this.loadOwnAssignment(assignmentId, me.id, tenantId);
    const { celebrationMinistry } = assignment;

    const members = await this.prisma.client.volunteerMinistry.findMany({
      where: {
        tenant_id: tenantId,
        ministry_id: celebrationMinistry.ministry_id,
        volunteer_profile_id: { not: me.id },
        volunteerProfile: { person: { deleted_at: null } },
      },
      select: { volunteerProfile: PROFILE_PERSON },
    });
    const ids = members.map((m) => m.volunteerProfile.id);
    if (ids.length === 0) return [];

    const [sameService, unavailable] = await Promise.all([
      this.prisma.client.celebrationAssignment.findMany({
        where: {
          tenant_id: tenantId,
          volunteer_profile_id: { in: ids },
          celebrationMinistry: { schedule_id: celebrationMinistry.schedule.id },
        },
        select: { volunteer_profile_id: true, celebration_ministry_id: true, status: true },
      }),
      this.prisma.client.volunteerUnavailabilityDate.findMany({
        where: {
          tenant_id: tenantId,
          date: celebrationMinistry.schedule.celebrationInstance.scheduled_date,
          unavailability: { volunteer_profile_id: { in: ids } },
        },
        select: { unavailability: { select: { volunteer_profile_id: true } } },
      }),
    ]);

    const inSlot = new Set(
      sameService
        .filter((a) => a.celebration_ministry_id === assignment.celebration_ministry_id)
        .map((a) => a.volunteer_profile_id),
    );
    const busy = new Set(
      sameService.filter((a) => SWAPPABLE.includes(a.status)).map((a) => a.volunteer_profile_id),
    );
    const off = new Set(unavailable.map((u) => u.unavailability.volunteer_profile_id));

    return members
      .filter((m) => !inSlot.has(m.volunteerProfile.id))
      .map((m): SwapCandidate => {
        const id = m.volunteerProfile.id;
        return {
          volunteer_profile_id: id,
          full_name: m.volunteerProfile.person.full_name,
          availability: off.has(id) || busy.has(id) ? 'unavailable' : 'free',
        };
      })
      .sort(
        (a, b) =>
          Number(a.availability === 'unavailable') - Number(b.availability === 'unavailable') ||
          a.full_name.localeCompare(b.full_name, 'pt-BR'),
      );
  }

  // ── Pedir ──────────────────────────────────────────────────────────────────

  async createRequest(
    assignmentId: string,
    dto: CreateSwapRequestDto,
    userId: string,
    tenantId: string,
    congregationId: string,
  ): Promise<SwapRequestView> {
    const me = await this.myProfile(userId, tenantId, congregationId);
    const assignment = await this.loadOwnAssignment(assignmentId, me.id, tenantId);

    const target = dto.target_profile_id ?? null;
    if (target !== null && (target === me.id || !(await this.canTakeOver(target, assignment)))) {
      throw new UnprocessableEntityException(
        'Essa pessoa não pode assumir esta escala: não serve no ministério ou já está nela',
      );
    }

    const open = await this.prisma.client.assignmentSwapRequest.findFirst({
      where: { assignment_id: assignment.id, status: SwapRequestStatus.pending },
      select: { id: true },
    });
    if (open) throw new ConflictException('Já existe um pedido de troca em aberto para esta escala');

    let created: RequestWithContext;
    try {
      created = await this.prisma.client.assignmentSwapRequest.create({
        data: {
          tenant_id: assignment.tenant_id,
          congregation_id: assignment.congregation_id,
          assignment_id: assignment.id,
          requester_profile_id: me.id,
          target_profile_id: target,
          message: dto.message?.trim() || null,
        },
        include: REQUEST_INCLUDE,
      });
    } catch (err) {
      // O índice parcial (um `pending` por atribuição) pega a corrida que o
      // `findFirst` acima não vê.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Já existe um pedido de troca em aberto para esta escala');
      }
      throw err;
    }

    const recipients = target
      ? [created.target!.person.id]
      : (
          await this.prisma.client.volunteerMinistry.findMany({
            // Os mesmos que veem o pedido em "Recebidos": pessoa não apagada
            // e ainda fora da vaga.
            where: {
              tenant_id: tenantId,
              ministry_id: assignment.celebrationMinistry.ministry_id,
              volunteer_profile_id: { not: me.id },
              volunteerProfile: {
                person: { deleted_at: null },
                celebrationAssignments: {
                  none: { celebration_ministry_id: assignment.celebration_ministry_id },
                },
              },
            },
            select: { volunteerProfile: { select: { person_id: true } } },
          })
        ).map((m) => m.volunteerProfile.person_id);
    const firstName = me.person.full_name.split(' ')[0];
    this.notify(
      recipients,
      tenantId,
      congregationId,
      `${firstName} pediu troca de escala`,
      `${assignment.celebrationMinistry.ministry.name} · ${assignment.celebrationMinistry.schedule.celebrationInstance.celebration.name}`,
      created.id,
    );

    return toView(created);
  }

  // ── Listar ─────────────────────────────────────────────────────────────────

  /**
   * `incoming`: pedidos em aberto que eu posso aceitar — os dirigidos a mim e
   * os abertos ao ministério em que sirvo, de escalas por vir.
   * `outgoing`: os meus, em aberto ou resolvidos nos últimos 30 dias.
   */
  async listMine(
    userId: string,
    tenantId: string,
    congregationId: string,
  ): Promise<{ incoming: SwapRequestView[]; outgoing: SwapRequestView[] }> {
    const me = await this.myProfile(userId, tenantId, congregationId);
    const ministries = await this.prisma.client.volunteerMinistry.findMany({
      where: { volunteer_profile_id: me.id },
      select: { ministry_id: true },
    });
    const since = new Date(Date.now() - OUTGOING_WINDOW_DAYS * 86_400_000);

    const [incomingRaw, outgoing] = await Promise.all([
      this.prisma.client.assignmentSwapRequest.findMany({
        where: {
          tenant_id: tenantId,
          status: SwapRequestStatus.pending,
          requester_profile_id: { not: me.id },
          OR: [
            { target_profile_id: me.id },
            {
              target_profile_id: null,
              assignment: {
                celebrationMinistry: { ministry_id: { in: ministries.map((m) => m.ministry_id) } },
              },
            },
          ],
          // O mesmo que `assertSwappable` exige: o que aparece aqui, o
          // aceite não recusa por estado da escala.
          assignment: {
            status: { in: SWAPPABLE },
            checked_in_at: null,
            celebrationMinistry: {
              schedule: {
                status: ScheduleStatus.published,
                celebrationInstance: {
                  scheduled_date: { gte: startOfTodayUtc() },
                  status: { not: CelebrationInstanceStatus.cancelled },
                },
              },
            },
          },
        },
        include: REQUEST_INCLUDE,
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.client.assignmentSwapRequest.findMany({
        where: {
          tenant_id: tenantId,
          requester_profile_id: me.id,
          OR: [{ status: SwapRequestStatus.pending }, { updated_at: { gte: since } }],
        },
        include: REQUEST_INCLUDE,
        orderBy: { created_at: 'desc' },
        take: 20,
      }),
    ]);

    // Pedido aberto ao ministério para um culto em que eu já estou na vaga:
    // aceitar falharia, então nem aparece.
    const mySlots = await this.prisma.client.celebrationAssignment.findMany({
      where: {
        volunteer_profile_id: me.id,
        celebration_ministry_id: {
          in: incomingRaw.map((r) => r.assignment.celebration_ministry_id),
        },
      },
      select: { celebration_ministry_id: true },
    });
    const taken = new Set(mySlots.map((s) => s.celebration_ministry_id));
    const incoming = incomingRaw.filter((r) => !taken.has(r.assignment.celebration_ministry_id));

    return { incoming: incoming.map(toView), outgoing: outgoing.map(toView) };
  }

  // ── Responder ──────────────────────────────────────────────────────────────

  async accept(
    requestId: string,
    userId: string,
    tenantId: string,
    congregationId: string,
  ): Promise<SwapRequestView> {
    const me = await this.myProfile(userId, tenantId, congregationId);
    const req = await this.loadRequest(requestId, tenantId);

    if (req.requester_profile_id === me.id) {
      throw new ForbiddenException('Você não pode aceitar o próprio pedido de troca');
    }
    if (req.target_profile_id !== null && req.target_profile_id !== me.id) {
      throw new ForbiddenException('Este pedido de troca é para outra pessoa');
    }
    if (req.status !== SwapRequestStatus.pending) {
      throw new ConflictException('Este pedido de troca não está mais em aberto');
    }
    this.assertSwappable(req.assignment);
    if (!(await this.canTakeOver(me.id, req.assignment))) {
      throw new ForbiddenException('Você não serve neste ministério ou já está nesta escala');
    }

    const now = new Date();
    await this.prisma.runInTx(async (_tx) => {
      // Condicionais: dois colegas aceitando o mesmo pedido aberto, ou o
      // titular respondendo a escala no meio, fazem um dos lados não achar
      // a linha — e a transação inteira volta.
      const claimed = await this.prisma.client.assignmentSwapRequest.updateMany({
        where: { id: req.id, status: SwapRequestStatus.pending },
        data: { status: SwapRequestStatus.accepted, accepted_by_profile_id: me.id, responded_at: now },
      });
      const handedOver = await this.prisma.client.celebrationAssignment.updateMany({
        where: { id: req.assignment_id, status: { in: SWAPPABLE }, checked_in_at: null },
        data: { status: AssignmentStatus.swapped, responded_at: now },
      });
      if (claimed.count !== 1 || handedOver.count !== 1) {
        throw new ConflictException('Este pedido de troca não está mais em aberto');
      }
      try {
        await this.prisma.client.celebrationAssignment.create({
          data: {
            tenant_id: req.assignment.tenant_id,
            congregation_id: req.assignment.congregation_id,
            celebration_ministry_id: req.assignment.celebration_ministry_id,
            volunteer_profile_id: me.id,
            status: AssignmentStatus.confirmed,
            notified_at: now,
            responded_at: now,
          },
        });
      } catch (err) {
        // A liderança me escalou na mesma vaga entre o `canTakeOver` e aqui:
        // o unique de `celebration_assignments` barra, e a transação volta.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException('Você já está nesta escala');
        }
        throw err;
      }
    });

    this.notify(
      [req.requester.person.id],
      tenantId,
      congregationId,
      'Troca aceita',
      `${me.person.full_name.split(' ')[0]} assumiu sua escala de ${req.assignment.celebrationMinistry.ministry.name}`,
      req.id,
    );

    return toView(await this.loadRequest(req.id, tenantId));
  }

  /** Só o destinatário recusa; pedido aberto ao ministério não se recusa — basta não aceitar. */
  async decline(
    requestId: string,
    userId: string,
    tenantId: string,
    congregationId: string,
  ): Promise<SwapRequestView> {
    const me = await this.myProfile(userId, tenantId, congregationId);
    const req = await this.loadRequest(requestId, tenantId);

    if (req.target_profile_id !== me.id) {
      throw new ForbiddenException('Só quem recebeu o pedido pode recusá-lo');
    }
    return this.close(req, SwapRequestStatus.declined, tenantId, () =>
      this.notify(
        [req.requester.person.id],
        tenantId,
        congregationId,
        'Troca recusada',
        `${me.person.full_name.split(' ')[0]} não pode assumir sua escala de ${req.assignment.celebrationMinistry.ministry.name}`,
        req.id,
      ),
    );
  }

  async cancel(
    requestId: string,
    userId: string,
    tenantId: string,
    congregationId: string,
  ): Promise<SwapRequestView> {
    const me = await this.myProfile(userId, tenantId, congregationId);
    const req = await this.loadRequest(requestId, tenantId);

    if (req.requester_profile_id !== me.id) {
      throw new ForbiddenException('Só quem pediu a troca pode cancelá-la');
    }
    return this.close(req, SwapRequestStatus.cancelled, tenantId);
  }

  private async close(
    req: RequestWithContext,
    status: SwapRequestStatus,
    tenantId: string,
    after?: () => void,
  ): Promise<SwapRequestView> {
    const { count } = await this.prisma.client.assignmentSwapRequest.updateMany({
      where: { id: req.id, status: SwapRequestStatus.pending },
      data: { status, responded_at: new Date() },
    });
    if (count !== 1) throw new ConflictException('Este pedido de troca não está mais em aberto');
    after?.();
    return toView(await this.loadRequest(req.id, tenantId));
  }
}
