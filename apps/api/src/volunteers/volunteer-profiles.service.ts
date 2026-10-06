import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, Prisma, VolunteerMinistryRole, VolunteerProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
}

@Injectable()
export class VolunteerProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * O perfil da pessoa da conta do token — nunca de um id vindo de fora, por
   * isso não há `:id` na rota. Leitura só: quem edita o perfil é a secretaria
   * (`WRITE_ROLES` de `volunteers/profiles`).
   */
  async findMine(userId: string, tenantId: string, congregationId: string): Promise<MyVolunteerProfile> {
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
    };
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
