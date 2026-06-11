import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VolunteerProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVolunteerProfileDto } from './dto/create-volunteer-profile.dto';
import { UpdateVolunteerProfileDto } from './dto/update-volunteer-profile.dto';

type ProfileWithMinistries = VolunteerProfile & {
  volunteerMinistries: { ministry_id: string; role_in_ministry: string | null }[];
};

@Injectable()
export class VolunteerProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    congregationId: string,
    dto: CreateVolunteerProfileDto,
  ): Promise<ProfileWithMinistries> {
    const existing = await this.prisma.client.volunteerProfile.findUnique({
      where: { person_id: dto.person_id },
    });
    if (existing) throw new ConflictException('Esta pessoa já possui um perfil de voluntário');

    return this.prisma.runInTx(async (tx) => {
      const profile = await tx.volunteerProfile.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          person_id: dto.person_id,
          availability: dto.availability as Prisma.InputJsonValue,
          skills: (dto.skills ?? []) as Prisma.InputJsonValue,
          restrictions: dto.restrictions ?? null,
        },
      });

      if (dto.ministry_ids?.length) {
        await tx.volunteerMinistry.createMany({
          data: dto.ministry_ids.map((ministryId) => ({
            tenant_id: tenantId,
            congregation_id: congregationId,
            volunteer_profile_id: profile.id,
            ministry_id: ministryId,
            role_in_ministry: dto.role_in_ministry ?? null,
          })),
          skipDuplicates: true,
        });
      }

      return tx.volunteerProfile.findUniqueOrThrow({
        where: { id: profile.id },
        include: { volunteerMinistries: { select: { ministry_id: true, role_in_ministry: true } } },
      });
    });
  }

  async findAll(
    tenantId: string,
    congregationId: string,
  ): Promise<ProfileWithMinistries[]> {
    return this.prisma.client.volunteerProfile.findMany({
      where: { tenant_id: tenantId, congregation_id: congregationId },
      orderBy: { created_at: 'desc' },
      include: { volunteerMinistries: { select: { ministry_id: true, role_in_ministry: true } } },
    });
  }

  async findOne(
    tenantId: string,
    congregationId: string,
    id: string,
  ): Promise<ProfileWithMinistries> {
    const profile = await this.prisma.client.volunteerProfile.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
      include: { volunteerMinistries: { select: { ministry_id: true, role_in_ministry: true } } },
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

    return this.prisma.runInTx(async (tx) => {
      const data: Prisma.VolunteerProfileUpdateInput = {};
      if (dto.availability !== undefined) data.availability = dto.availability as Prisma.InputJsonValue;
      if (dto.skills !== undefined) data.skills = dto.skills as Prisma.InputJsonValue;
      if (dto.restrictions !== undefined) data.restrictions = dto.restrictions;

      await tx.volunteerProfile.update({ where: { id }, data });

      if (dto.ministry_ids !== undefined) {
        await tx.volunteerMinistry.deleteMany({ where: { volunteer_profile_id: id } });
        if (dto.ministry_ids.length) {
          await tx.volunteerMinistry.createMany({
            data: dto.ministry_ids.map((ministryId) => ({
              tenant_id: tenantId,
              congregation_id: congregationId,
              volunteer_profile_id: id,
              ministry_id: ministryId,
              role_in_ministry: dto.role_in_ministry ?? null,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.volunteerProfile.findUniqueOrThrow({
        where: { id },
        include: { volunteerMinistries: { select: { ministry_id: true, role_in_ministry: true } } },
      });
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
