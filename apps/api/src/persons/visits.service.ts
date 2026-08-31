import { BadRequestException, Injectable } from '@nestjs/common';
import { VisitOrigin, VisitRecord } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ClassificationService } from './classification.service';
import { CreateVisitDto } from './dto/create-visit.dto';

type CreateVisitResult = { visit: VisitRecord; reclassified: boolean };

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classificationService: ClassificationService,
  ) {}

  async create(dto: CreateVisitDto, user: JwtPayload): Promise<CreateVisitResult> {
    if (dto.origin === VisitOrigin.small_group && !dto.small_group_id) {
      throw new BadRequestException('small_group_id é obrigatório quando origin = small_group');
    }

    let reclassified = false;

    const visit = await this.prisma.runInTx(
      async (tx) => {
        const created = await tx.visitRecord.create({
          data: {
            tenant_id: user.tenant_id,
            congregation_id: user.congregation_id,
            person_id: dto.person_id,
            origin: dto.origin,
            small_group_id: dto.small_group_id ?? null,
            visited_at: dto.visited_at ?? new Date(),
          },
        });

        reclassified = await this.classificationService.checkAutoReclassification(
          dto.person_id,
          user.sub,
          tx,
        );

        return created;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    return { visit, reclassified };
  }

  async findByPerson(personId: string): Promise<VisitRecord[]> {
    return this.prisma.client.visitRecord.findMany({
      where: { person_id: personId },
      orderBy: { visited_at: 'desc' },
    });
  }
}
