import { Injectable, NotFoundException } from '@nestjs/common';
import { Celebration, CelebrationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCelebrationDto } from './dto/create-celebration.dto';
import { UpdateCelebrationDto } from './dto/update-celebration.dto';
import { ListCelebrationsQueryDto } from './dto/list-celebrations-query.dto';

@Injectable()
export class CelebrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    congregationId: string,
    dto: CreateCelebrationDto,
  ): Promise<Celebration> {
    return this.prisma.client.celebration.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        name: dto.name,
        type: dto.type,
        day_of_week: dto.day_of_week ?? null,
        start_time: dto.start_time,
        recurrence: dto.recurrence,
      },
    });
  }

  async findAll(tenantId: string, query: ListCelebrationsQueryDto): Promise<Celebration[]> {
    // Sem `congregation_id` no `where`, de propósito: quem decide o alcance é
    // a RLS (`tenant_isolation` em `celebrations`), que já abre a congregação
    // inteira do tenant para `tenant_admin`/`denomination_admin`. Filtrar aqui
    // também travaria esses papéis na própria congregação mesmo com a policy
    // corrigida — foi exatamente o defeito que deixava `tenant_admin` sem ver
    // celebrações de outras congregações do mesmo tenant.
    return this.prisma.client.celebration.findMany({
      where: {
        tenant_id: tenantId,
        ...(query.type !== undefined && { type: query.type as CelebrationType }),
        is_active: query.is_active ?? true,
      },
      orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }],
    });
  }

  async findOne(tenantId: string, congregationId: string, id: string): Promise<Celebration> {
    const celebration = await this.prisma.client.celebration.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!celebration) throw new NotFoundException('Celebração não encontrada');
    return celebration;
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateCelebrationDto,
  ): Promise<Celebration> {
    await this.findOne(tenantId, congregationId, id);

    return this.prisma.client.celebration.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.day_of_week !== undefined && { day_of_week: dto.day_of_week }),
        ...(dto.start_time !== undefined && { start_time: dto.start_time }),
        ...(dto.recurrence !== undefined && { recurrence: dto.recurrence }),
      },
    });
  }

  /**
   * Remove a celebração, recorrente ou não. O cadastro vira inativo — o que
   * interrompe o ciclo, já que o gerador só olha celebração ativa — e as
   * instâncias que ainda não aconteceram (de hoje em diante) são apagadas,
   * com OC e escala. O que já passou fica: é o histórico da igreja.
   * Culto `finalized` também fica, mesmo com data futura: foi encerrado.
   */
  async remove(
    tenantId: string,
    congregationId: string,
    id: string,
  ): Promise<Celebration & { removed_instances: number }> {
    await this.findOne(tenantId, congregationId, id);
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Mesma transação do request: se uma das duas falhar, nenhuma vale.
    const { count } = await this.prisma.client.celebrationInstance.deleteMany({
      where: {
        celebration_id: id,
        tenant_id: tenantId,
        scheduled_date: { gte: today },
        status: { not: 'finalized' },
      },
    });
    const celebration = await this.prisma.client.celebration.update({
      where: { id },
      data: { is_active: false },
    });
    return { ...celebration, removed_instances: count };
  }
}
