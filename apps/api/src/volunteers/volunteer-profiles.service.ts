import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, Prisma, VolunteerMinistryRole, VolunteerProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { writeAuditLog } from '../common/audit/write-audit-log';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { VOLUNTEER_TERM_ORIGIN, VOLUNTEER_TERM_TEXT, VOLUNTEER_TERM_VERSION } from './volunteer-term';
import { UpdateMyVolunteerProfileDto } from './dto/update-my-volunteer-profile.dto';
import { CreateVolunteerProfileDto } from './dto/create-volunteer-profile.dto';
import { UpdateVolunteerProfileDto } from './dto/update-volunteer-profile.dto';

type ProfileWithMinistries = VolunteerProfile & {
  volunteerMinistries: { ministry_id: string; role: string; is_primary_leader: boolean }[];
};

const MINISTRIES_SELECT = {
  select: { ministry_id: true, role: true, is_primary_leader: true },
} as const;

/** `GET /volunteers/me/profile` — o perfil de voluntário visto pelo próprio voluntário. */
export interface MyVolunteerProfile {
  id: string;
  ministries: { id: string; name: string; role: VolunteerMinistryRole }[];
  skills: string[];
  availability: Record<string, string[]>;
  restrictions: string | null;
  volunteer_since: Date;
  /** Escalas confirmadas de cultos que já passaram. */
  served_count: number;
  /** Termo de voluntariado vigente e o aceite da pessoa (`null` = não aceitou a versão vigente). */
  term: { version: string; text: string; accepted_at: Date | null };
}

/** Remove repetição de turno por dia; a ordem do que foi enviado se mantém. */
function normalizeAvailability(input: Record<string, string[] | undefined>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [day, slots] of Object.entries(input)) {
    if (slots) out[day] = [...new Set(slots)];
  }
  return out;
}

@Injectable()
export class VolunteerProfilesService {
  private readonly logger = new Logger(VolunteerProfilesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * O perfil da pessoa da conta do token — nunca de um id vindo de fora, por
   * isso não há `:id` na rota. Leitura só: quem edita o perfil é a secretaria
   * (`WRITE_ROLES` de `volunteers/profiles`).
   */
  async findMine(userId: string, tenantId: string, congregationId: string): Promise<MyVolunteerProfile> {
    const { personId, profile } = await this.mineRow(userId, tenantId, congregationId);
    return this.toMine(personId, profile);
  }

  /** Pessoa (do banco, `user_accounts.person_id`) e perfil da conta do token. */
  private async mineRow(userId: string, tenantId: string, congregationId: string) {
    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: userId },
      select: { person_id: true },
    });
    if (!account?.person_id) throw new NotFoundException('Usuário sem vínculo de pessoa');

    const profile = await this.prisma.client.volunteerProfile.findFirst({
      where: { person_id: account.person_id, tenant_id: tenantId, congregation_id: congregationId },
      include: {
        volunteerMinistries: {
          select: { role: true, ministry: { select: { id: true, name: true } } },
          orderBy: { ministry: { name: 'asc' } },
        },
      },
    });
    if (!profile) throw new NotFoundException('Perfil de voluntário não encontrado');
    return { personId: account.person_id, profile };
  }

  private async toMine(
    personId: string,
    profile: NonNullable<Awaited<ReturnType<VolunteerProfilesService['mineRow']>>>['profile'],
  ): Promise<MyVolunteerProfile> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const served = await this.prisma.client.celebrationAssignment.count({
      where: {
        volunteer_profile_id: profile.id,
        status: AssignmentStatus.confirmed,
        celebrationMinistry: {
          schedule: { celebrationInstance: { scheduled_date: { lt: today } } },
        },
      },
    });

    const accepted = await this.prisma.client.consentRecord.findFirst({
      where: { person_id: personId, origin: VOLUNTEER_TERM_ORIGIN, version: VOLUNTEER_TERM_VERSION, revoked_at: null },
      select: { consented_at: true },
    });

    return {
      id: profile.id,
      ministries: profile.volunteerMinistries.map((vm) => ({ ...vm.ministry, role: vm.role })),
      skills: Array.isArray(profile.skills) ? (profile.skills as string[]) : [],
      availability:
        profile.availability && typeof profile.availability === 'object' && !Array.isArray(profile.availability)
          ? (profile.availability as Record<string, string[]>)
          : {},
      restrictions: profile.restrictions,
      volunteer_since: profile.created_at,
      served_count: served,
      term: { version: VOLUNTEER_TERM_VERSION, text: VOLUNTEER_TERM_TEXT, accepted_at: accepted?.consented_at ?? null },
    };
  }

  /**
   * `PATCH /volunteers/me/profile` — o voluntário edita a própria
   * disponibilidade, e só ela. A pessoa vem da conta no banco; não há `:id`.
   * Antes/depois na auditoria, como o `PATCH /me`.
   */
  async updateMine(user: JwtPayload, dto: UpdateMyVolunteerProfileDto): Promise<MyVolunteerProfile> {
    this.assertNotSupportSession(user);
    const { personId, profile } = await this.mineRow(user.sub, user.tenant_id, user.congregation_id);
    const before = profile.availability;
    const after = normalizeAvailability(dto.availability);

    const updated = await this.prisma.client.volunteerProfile.update({
      where: { id: profile.id },
      data: { availability: after as Prisma.InputJsonValue },
      include: {
        volunteerMinistries: {
          select: { role: true, ministry: { select: { id: true, name: true } } },
          orderBy: { ministry: { name: 'asc' } },
        },
      },
    });

    await writeAuditLog(
      this.prisma,
      {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        actor_user_id: user.sub,
        subject_person_id: personId,
        entity: 'volunteer_profile',
        action: 'volunteer_profile.self_updated',
        before: { availability: before },
        after: { availability: after },
      },
      this.logger,
    );
    return this.toMine(personId, updated);
  }

  /**
   * `POST /volunteers/me/term` — aceite do termo de voluntariado. Idempotente
   * por versão: reaceitar a vigente devolve o registro que já existe. Aceite
   * de versão anterior é revogado (`superseded_by_new_term`), não apagado.
   */
  async acceptTerm(
    user: JwtPayload,
    termVersion: string,
    meta: { ip?: string | null; userAgent?: string | null },
  ): Promise<MyVolunteerProfile> {
    this.assertNotSupportSession(user);
    if (termVersion !== VOLUNTEER_TERM_VERSION) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'volunteer_term_outdated',
        message: 'O termo foi atualizado; leia a versão vigente antes de aceitar',
        term_version: VOLUNTEER_TERM_VERSION,
        term_text: VOLUNTEER_TERM_TEXT,
      });
    }
    const { personId, profile } = await this.mineRow(user.sub, user.tenant_id, user.congregation_id);

    const active = await this.prisma.client.consentRecord.findFirst({
      where: { person_id: personId, origin: VOLUNTEER_TERM_ORIGIN, revoked_at: null },
      orderBy: { consented_at: 'desc' },
    });
    if (active?.version !== VOLUNTEER_TERM_VERSION) {
      if (active) {
        await this.prisma.client.consentRecord.updateMany({
          where: { person_id: personId, origin: VOLUNTEER_TERM_ORIGIN, revoked_at: null },
          data: { revoked_at: new Date(), revocation_reason: 'superseded_by_new_term' },
        });
      }
      await this.prisma.client.consentRecord.create({
        data: {
          tenant_id: user.tenant_id,
          congregation_id: user.congregation_id,
          person_id: personId,
          version: VOLUNTEER_TERM_VERSION,
          consented_at: new Date(),
          origin: VOLUNTEER_TERM_ORIGIN,
          ip: meta.ip ?? null,
          user_agent: meta.userAgent ?? null,
        },
      });
      await writeAuditLog(
        this.prisma,
        {
          tenant_id: user.tenant_id,
          congregation_id: user.congregation_id,
          actor_user_id: user.sub,
          subject_person_id: personId,
          entity: 'consent_record',
          action: 'consent.granted',
          after: { version: VOLUNTEER_TERM_VERSION, origin: VOLUNTEER_TERM_ORIGIN },
        },
        this.logger,
      );
    }
    return this.toMine(personId, profile);
  }

  /** Quem opera numa sessão de suporte não é o titular: não edita nem aceita por ele. */
  private assertNotSupportSession(user: JwtPayload): void {
    if (user.support_session) {
      throw new ForbiddenException('Sessão de suporte não edita o perfil nem aceita o termo pelo voluntário');
    }
  }

  async create(
    tenantId: string,
    congregationId: string,
    dto: CreateVolunteerProfileDto,
  ): Promise<ProfileWithMinistries> {
    const existing = await this.prisma.client.volunteerProfile.findUnique({
      where: { person_id: dto.person_id },
    });
    if (existing) throw new ConflictException('Esta pessoa já possui um perfil de voluntário');

    return this.prisma.client.volunteerProfile.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        person_id: dto.person_id,
        availability: dto.availability as Prisma.InputJsonValue,
        skills: (dto.skills ?? []) as Prisma.InputJsonValue,
        restrictions: dto.restrictions ?? null,
      },
      include: { volunteerMinistries: MINISTRIES_SELECT },
    });
  }

  async findAll(
    tenantId: string,
    congregationId: string,
  ): Promise<ProfileWithMinistries[]> {
    return this.prisma.client.volunteerProfile.findMany({
      where: { tenant_id: tenantId, congregation_id: congregationId },
      orderBy: { created_at: 'desc' },
      include: { volunteerMinistries: MINISTRIES_SELECT },
    });
  }

  async findOne(
    tenantId: string,
    congregationId: string,
    id: string,
  ): Promise<ProfileWithMinistries> {
    const profile = await this.prisma.client.volunteerProfile.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
      include: { volunteerMinistries: MINISTRIES_SELECT },
    });
    if (!profile) throw new NotFoundException('Perfil de voluntário não encontrado');
    return profile;
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateVolunteerProfileDto,
  ): Promise<ProfileWithMinistries> {
    await this.findOne(tenantId, congregationId, id);

    const data: Prisma.VolunteerProfileUpdateInput = {};
    if (dto.availability !== undefined) data.availability = dto.availability as Prisma.InputJsonValue;
    if (dto.skills !== undefined) data.skills = dto.skills as Prisma.InputJsonValue;
    if (dto.restrictions !== undefined) data.restrictions = dto.restrictions;

    return this.prisma.client.volunteerProfile.update({
      where: { id },
      data,
      include: { volunteerMinistries: MINISTRIES_SELECT },
    });
  }

  async remove(
    tenantId: string,
    congregationId: string,
    id: string,
  ): Promise<VolunteerProfile> {
    await this.findOne(tenantId, congregationId, id);
    return this.prisma.client.volunteerProfile.delete({ where: { id } });
  }
}
