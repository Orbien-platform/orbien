import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { VolunteerMinistryRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnavailabilityDto } from './dto/create-unavailability.dto';

@Injectable()
export class UnavailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveProfile(userId: string, tenantId: string, congregationId: string) {
    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: userId },
      select: { person_id: true },
    });
    if (!account?.person_id) throw new NotFoundException('Usuário sem vínculo de pessoa');

    const profile = await this.prisma.client.volunteerProfile.findFirst({
      where: { person_id: account.person_id, tenant_id: tenantId, congregation_id: congregationId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Perfil de voluntário não encontrado');
    return profile;
  }

  async upsert(userId: string, tenantId: string, congregationId: string, dto: CreateUnavailabilityDto) {
    const seen = new Set<string>();
    for (const dateStr of dto.dates) {
      if (seen.has(dateStr)) {
        throw new BadRequestException(`Data duplicada: ${dateStr}`);
      }
      seen.add(dateStr);

      const [yearStr, monthStr] = dateStr.split('-');
      const year = parseInt(yearStr!, 10);
      const month = parseInt(monthStr!, 10);
      if (month !== dto.referenceMonth || year !== dto.referenceYear) {
        throw new BadRequestException(
          `Data ${dateStr} não pertence ao mês ${dto.referenceMonth}/${dto.referenceYear}`,
        );
      }
    }

    const profile = await this.resolveProfile(userId, tenantId, congregationId);

    return this.prisma.runInTx(async (tx) => {
      const unavailability = await tx.volunteerUnavailability.upsert({
        where: {
          volunteer_profile_id_reference_month_reference_year: {
            volunteer_profile_id: profile.id,
            reference_month: dto.referenceMonth,
            reference_year: dto.referenceYear,
          },
        },
        create: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          volunteer_profile_id: profile.id,
          reference_month: dto.referenceMonth,
          reference_year: dto.referenceYear,
          notes: dto.notes ?? null,
        },
        update: {
          notes: dto.notes ?? null,
        },
      });

      await tx.volunteerUnavailabilityDate.deleteMany({
        where: { unavailability_id: unavailability.id },
      });

      if (dto.dates.length > 0) {
        await tx.volunteerUnavailabilityDate.createMany({
          data: dto.dates.map((d) => ({
            tenant_id: tenantId,
            congregation_id: congregationId,
            unavailability_id: unavailability.id,
            date: new Date(d + 'T00:00:00.000Z'),
          })),
        });
      }

      return tx.volunteerUnavailability.findUnique({
        where: { id: unavailability.id },
        include: { dates: { select: { date: true }, orderBy: { date: 'asc' } } },
      });
    });
  }

  async getMyUnavailability(
    userId: string,
    tenantId: string,
    congregationId: string,
    month: number,
    year: number,
  ) {
    const profile = await this.resolveProfile(userId, tenantId, congregationId);

    return this.prisma.client.volunteerUnavailability.findUnique({
      where: {
        volunteer_profile_id_reference_month_reference_year: {
          volunteer_profile_id: profile.id,
          reference_month: month,
          reference_year: year,
        },
      },
      include: { dates: { select: { date: true }, orderBy: { date: 'asc' } } },
    });
  }

  async getMinistryAvailability(
    userId: string,
    userRoles: string[],
    tenantId: string,
    congregationId: string,
    ministryId: string,
    date: string,
  ) {
    const ministry = await this.prisma.client.ministry.findFirst({
      where: { id: ministryId, tenant_id: tenantId, congregation_id: congregationId },
      select: { id: true },
    });
    if (!ministry) throw new NotFoundException('Ministério não encontrado');

    const isAdmin =
      userRoles.includes('admin_congregation') || userRoles.includes('tenant_admin');

    if (!isAdmin) {
      const account = await this.prisma.client.userAccount.findUnique({
        where: { id: userId },
        select: { person_id: true },
      });
      const profile = account?.person_id
        ? await this.prisma.client.volunteerProfile.findFirst({
            where: {
              person_id: account.person_id,
              tenant_id: tenantId,
              congregation_id: congregationId,
            },
            select: { id: true },
          })
        : null;

      if (!profile) throw new ForbiddenException('Acesso negado');

      const membership = await this.prisma.client.volunteerMinistry.findUnique({
        where: {
          volunteer_profile_id_ministry_id: {
            volunteer_profile_id: profile.id,
            ministry_id: ministryId,
          },
        },
        select: { role: true },
      });

      if (!membership || membership.role !== VolunteerMinistryRole.leader) {
        throw new ForbiddenException('Você não é líder deste ministério');
      }
    }

    const memberships = await this.prisma.client.volunteerMinistry.findMany({
      where: { ministry_id: ministryId, tenant_id: tenantId, congregation_id: congregationId },
      select: {
        id: true,
        role: true,
        volunteerProfile: {
          select: {
            id: true,
            person: { select: { id: true, full_name: true } },
          },
        },
      },
    });

    if (memberships.length === 0) return [];

    const targetDate = new Date(date + 'T00:00:00.000Z');
    const profileIds = memberships.map((m) => m.volunteerProfile.id);

    const unavailableDates = await this.prisma.client.volunteerUnavailabilityDate.findMany({
      where: {
        congregation_id: congregationId,
        date: targetDate,
        unavailability: {
          volunteer_profile_id: { in: profileIds },
        },
      },
      select: { unavailability: { select: { volunteer_profile_id: true } } },
    });

    const unavailableProfileIds = new Set(
      unavailableDates.map((d) => d.unavailability.volunteer_profile_id),
    );

    return memberships.map((m) => ({
      volunteer_ministry_id: m.id,
      role: m.role,
      volunteer_profile_id: m.volunteerProfile.id,
      person: m.volunteerProfile.person,
      unavailable: unavailableProfileIds.has(m.volunteerProfile.id),
    }));
  }
}
