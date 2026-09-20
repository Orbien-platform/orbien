import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AudienceSegment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';
import { SegmentCriteriaDto, hasBehaviorCriteria } from './dto/segment-criteria.dto';

/**
 * Critérios de comportamento/engajamento/inatividade (`PROD-17`) exigem
 * Premium; os básicos (papel, congregação, célula, faixa etária) continuam
 * nos dois planos. Mesmo princípio de `assertRegistrationPricePlan` em
 * `posts.service.ts` (`PROD-24`): quem cobra é o service, não o banco, porque
 * o gate é por campo dentro do mesmo DTO/rota, não pela rota inteira — um
 * `@RequiresPlan('premium')` no controller bloquearia também os critérios
 * básicos.
 */
function assertBehaviorCriteriaPlan(criteria: SegmentCriteriaDto, plan: JwtPayload['plan']): void {
  if (!hasBehaviorCriteria(criteria) || plan === 'premium') return;
  throw new ForbiddenException(
    'Segmentação por comportamento/engajamento/inatividade exige o plano Premium',
  );
}

@Injectable()
export class SegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSegmentDto, user: JwtPayload): Promise<AudienceSegment> {
    assertBehaviorCriteriaPlan(dto.criteria, user.plan);
    return this.prisma.client.audienceSegment.create({
      data: {
        name: dto.name,
        criteria: dto.criteria as object,
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
      },
    });
  }

  async findAll(user: JwtPayload): Promise<AudienceSegment[]> {
    return this.prisma.client.audienceSegment.findMany({
      where: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        content_post_id: { equals: null }, // standalone segments only
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async findOne(id: string, user: JwtPayload): Promise<AudienceSegment> {
    const segment = await this.prisma.client.audienceSegment.findFirst({
      where: { id, tenant_id: user.tenant_id, congregation_id: user.congregation_id },
    });
    if (!segment) throw new NotFoundException('Segmento não encontrado');
    return segment;
  }

  async update(id: string, dto: UpdateSegmentDto, user: JwtPayload): Promise<AudienceSegment> {
    await this.findOne(id, user);
    if (dto.criteria !== undefined) assertBehaviorCriteriaPlan(dto.criteria, user.plan);
    const data: { name?: string; criteria?: object } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.criteria !== undefined) data.criteria = dto.criteria as object;
    return this.prisma.client.audienceSegment.update({ where: { id }, data });
  }

  async remove(id: string, user: JwtPayload): Promise<AudienceSegment> {
    await this.findOne(id, user);
    return this.prisma.client.audienceSegment.delete({ where: { id } });
  }
}
