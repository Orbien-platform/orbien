import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ScheduleTemplate, ScheduleTemplateMinistry } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScheduleTemplateDto } from './dto/create-schedule-template.dto';
import { UpdateScheduleTemplateDto } from './dto/update-schedule-template.dto';

type TemplateMinistryRow = ScheduleTemplateMinistry & {
  ministry: { id: string; name: string };
};

type TemplateDetail = ScheduleTemplate & { ministries: TemplateMinistryRow[] };

const MINISTRY_INCLUDE = {
  ministries: {
    orderBy: { id: 'asc' },
    include: { ministry: { select: { id: true, name: true } } },
  },
} as const;

@Injectable()
export class ScheduleTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /** Garante que todos os ministérios informados pertencem ao tenant/congregação. */
  private async assertMinistries(
    tenantId: string,
    congregationId: string,
    ministryIds: string[],
  ): Promise<void> {
    if (ministryIds.length === 0) return;

    const unique = [...new Set(ministryIds)];
    if (unique.length !== ministryIds.length) {
      throw new ConflictException('Ministério repetido no template');
    }

    const found = await this.prisma.client.ministry.findMany({
      where: { id: { in: unique }, tenant_id: tenantId, congregation_id: congregationId },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new NotFoundException('Ministério não encontrado');
    }
  }

  async findAll(tenantId: string, congregationId: string): Promise<TemplateDetail[]> {
    return this.prisma.client.scheduleTemplate.findMany({
      where: { tenant_id: tenantId, congregation_id: congregationId },
      orderBy: { name: 'asc' },
      include: MINISTRY_INCLUDE,
    });
  }

  async findOne(
    tenantId: string,
    congregationId: string,
    id: string,
  ): Promise<TemplateDetail> {
    const template = await this.prisma.client.scheduleTemplate.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
      include: MINISTRY_INCLUDE,
    });
    if (!template) throw new NotFoundException('Template não encontrado');
    return template;
  }

  async create(
    tenantId: string,
    congregationId: string,
    dto: CreateScheduleTemplateDto,
  ): Promise<TemplateDetail> {
    await this.assertMinistries(
      tenantId,
      congregationId,
      dto.ministries.map((m) => m.ministry_id),
    );

    return this.prisma.client.scheduleTemplate.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        name: dto.name,
        description: dto.description,
        ministries: {
          create: dto.ministries.map((m) => ({
            tenant_id: tenantId,
            congregation_id: congregationId,
            ministry_id: m.ministry_id,
            slots: m.slots,
          })),
        },
      },
      include: MINISTRY_INCLUDE,
    });
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateScheduleTemplateDto,
  ): Promise<TemplateDetail> {
    await this.findOne(tenantId, congregationId, id);

    if (dto.ministries) {
      await this.assertMinistries(
        tenantId,
        congregationId,
        dto.ministries.map((m) => m.ministry_id),
      );
    }

    return this.prisma.runInTx(async (_tx) => {
      await this.prisma.client.scheduleTemplate.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.is_active !== undefined && { is_active: dto.is_active }),
        },
      });

      // A lista de ministérios é substituída por inteiro quando informada:
      // é o que torna o PATCH previsível para quem edita o template na tela.
      if (dto.ministries) {
        await this.prisma.client.scheduleTemplateMinistry.deleteMany({
          where: { template_id: id },
        });
        if (dto.ministries.length > 0) {
          await this.prisma.client.scheduleTemplateMinistry.createMany({
            data: dto.ministries.map((m) => ({
              tenant_id: tenantId,
              congregation_id: congregationId,
              template_id: id,
              ministry_id: m.ministry_id,
              slots: m.slots,
            })),
          });
        }
      }

      return this.findOne(tenantId, congregationId, id);
    });
  }

  /**
   * Remove o template. Os vínculos com ministérios saem por cascata; escalas
   * já criadas a partir dele não são afetadas, porque `apply-template` copia
   * os ministérios em vez de referenciar o template.
   */
  async remove(
    tenantId: string,
    congregationId: string,
    id: string,
  ): Promise<ScheduleTemplate> {
    await this.findOne(tenantId, congregationId, id);
    return this.prisma.client.scheduleTemplate.delete({ where: { id } });
  }
}
