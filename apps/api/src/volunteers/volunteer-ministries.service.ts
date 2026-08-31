import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PersonClassification, VolunteerMinistry, VolunteerMinistryRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVolunteerMinistryDto } from './dto/create-volunteer-ministry.dto';
import { UpdateVolunteerMinistryDto } from './dto/update-volunteer-ministry.dto';

@Injectable()
export class VolunteerMinistriesService {
  constructor(private readonly prisma: PrismaService) {}

  private assertClassificationAllowsRole(
    role: VolunteerMinistryRole,
    classification: PersonClassification,
  ): void {
    if (role === VolunteerMinistryRole.leader && classification !== PersonClassification.member) {
      throw new BadRequestException('Apenas membros podem ser líderes de ministério.');
    }
    if (role === VolunteerMinistryRole.volunteer && classification === PersonClassification.visitor) {
      throw new BadRequestException(
        'Visitantes não podem ser voluntários. É necessário ao menos ser frequentador.',
      );
    }
  }

  private assertPrimaryLeaderRequiresLeaderRole(
    role: VolunteerMinistryRole,
    isPrimaryLeader: boolean,
  ): void {
    if (isPrimaryLeader && role !== VolunteerMinistryRole.leader) {
      throw new BadRequestException('Apenas líderes podem ser marcados como líder principal.');
    }
  }

  async assignToMinistry(
    tenantId: string,
    congregationId: string,
    dto: CreateVolunteerMinistryDto,
  ): Promise<VolunteerMinistry> {
    const ministry = await this.prisma.client.ministry.findFirst({
      where: { id: dto.ministry_id, tenant_id: tenantId, congregation_id: congregationId },
      select: { id: true },
    });
    if (!ministry) throw new NotFoundException('Ministério não encontrado');

    const profile = await this.prisma.client.volunteerProfile.findFirst({
      where: { id: dto.volunteer_profile_id, tenant_id: tenantId, congregation_id: congregationId },
      include: { person: { select: { classification: true } } },
    });
    if (!profile) throw new NotFoundException('Perfil de voluntário não encontrado');

    const existing = await this.prisma.client.volunteerMinistry.findUnique({
      where: {
        volunteer_profile_id_ministry_id: {
          volunteer_profile_id: dto.volunteer_profile_id,
          ministry_id: dto.ministry_id,
        },
      },
    });
    if (existing) throw new ConflictException('Este voluntário já está vinculado a este ministério.');

    const role = dto.role ?? VolunteerMinistryRole.volunteer;
    const isPrimaryLeader = dto.is_primary_leader ?? false;

    this.assertClassificationAllowsRole(role, profile.person.classification);
    this.assertPrimaryLeaderRequiresLeaderRole(role, isPrimaryLeader);

    if (isPrimaryLeader) {
      return this.prisma.runInTx(async (tx) => {
        await tx.volunteerMinistry.updateMany({
          where: { ministry_id: dto.ministry_id, is_primary_leader: true },
          data: { is_primary_leader: false },
        });
        return tx.volunteerMinistry.create({
          data: {
            tenant_id: tenantId,
            congregation_id: congregationId,
            volunteer_profile_id: dto.volunteer_profile_id,
            ministry_id: dto.ministry_id,
            role,
            is_primary_leader: true,
          },
        });
      });
    }

    return this.prisma.client.volunteerMinistry.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        volunteer_profile_id: dto.volunteer_profile_id,
        ministry_id: dto.ministry_id,
        role,
        is_primary_leader: false,
      },
    });
  }

  async updateAssignment(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateVolunteerMinistryDto,
  ): Promise<VolunteerMinistry> {
    const assignment = await this.prisma.client.volunteerMinistry.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
      include: { volunteerProfile: { include: { person: { select: { classification: true } } } } },
    });
    if (!assignment) throw new NotFoundException('Atribuição não encontrada');

    const role = dto.role ?? assignment.role;
    const isPrimaryLeader = dto.is_primary_leader ?? assignment.is_primary_leader;

    this.assertClassificationAllowsRole(role, assignment.volunteerProfile.person.classification);
    this.assertPrimaryLeaderRequiresLeaderRole(role, isPrimaryLeader);

    if (isPrimaryLeader) {
      return this.prisma.runInTx(async (tx) => {
        await tx.volunteerMinistry.updateMany({
          where: { ministry_id: assignment.ministry_id, is_primary_leader: true, id: { not: id } },
          data: { is_primary_leader: false },
        });
        return tx.volunteerMinistry.update({
          where: { id },
          data: { role, is_primary_leader: true },
        });
      });
    }

    return this.prisma.client.volunteerMinistry.update({
      where: { id },
      data: { role, is_primary_leader: false },
    });
  }

  async remove(tenantId: string, congregationId: string, id: string): Promise<VolunteerMinistry> {
    const assignment = await this.prisma.client.volunteerMinistry.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!assignment) throw new NotFoundException('Atribuição não encontrada');
    return this.prisma.client.volunteerMinistry.delete({ where: { id } });
  }
}
