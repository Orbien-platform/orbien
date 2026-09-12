import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CostCenter } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';

@Injectable()
export class CostCentersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCostCenterDto, user: JwtPayload): Promise<CostCenter> {
    return this.prisma.client.costCenter.create({
      data: {
        name: dto.name,
        description: dto.description,
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
      },
    });
  }

  findAll(user: JwtPayload): Promise<CostCenter[]> {
    return this.prisma.client.costCenter.findMany({
      where: { tenant_id: user.tenant_id, congregation_id: user.congregation_id },
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, dto: UpdateCostCenterDto, user: JwtPayload): Promise<CostCenter> {
    const existing = await this.prisma.client.costCenter.findFirst({
      where: { id, tenant_id: user.tenant_id, congregation_id: user.congregation_id },
    });

    if (!existing) throw new NotFoundException('Centro de custo não encontrado');

    return this.prisma.client.costCenter.update({ where: { id }, data: dto });
  }

  async remove(id: string, user: JwtPayload): Promise<CostCenter> {
    const existing = await this.prisma.client.costCenter.findFirst({
      where: { id, tenant_id: user.tenant_id, congregation_id: user.congregation_id },
    });

    if (!existing) throw new NotFoundException('Centro de custo não encontrado');

    const linked = await this.prisma.client.financialTransaction.count({
      where: { cost_center_id: id },
    });
    if (linked > 0) {
      throw new ConflictException(
        'Não é possível remover um centro de custo com transações vinculadas',
      );
    }

    return this.prisma.client.costCenter.delete({ where: { id } });
  }
}
