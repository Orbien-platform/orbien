import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinancialCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

type CategoryNode = FinancialCategory & { children: CategoryNode[] };

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto, user: JwtPayload): Promise<FinancialCategory> {
    if (dto.parent_id) {
      const parent = await this.prisma.client.financialCategory.findFirst({
        where: {
          id: dto.parent_id,
          tenant_id: user.tenant_id,
          congregation_id: user.congregation_id,
        },
        select: { id: true, type: true },
      });

      if (!parent) throw new NotFoundException('Categoria pai não encontrada');

      if (parent.type !== dto.type) {
        throw new BadRequestException(
          'A categoria pai deve ter o mesmo tipo (income/expense)',
        );
      }
    }

    return this.prisma.client.financialCategory.create({
      data: {
        name: dto.name,
        type: dto.type,
        parent_id: dto.parent_id,
        description: dto.description,
        is_system: false,
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
      },
    });
  }

  async findAll(user: JwtPayload): Promise<CategoryNode[]> {
    const all = await this.prisma.client.financialCategory.findMany({
      where: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    const map = new Map<string, CategoryNode>();
    for (const cat of all) {
      map.set(cat.id, { ...cat, children: [] });
    }

    const roots: CategoryNode[] = [];
    for (const cat of all) {
      const node = map.get(cat.id)!;
      if (cat.parent_id && map.has(cat.parent_id)) {
        map.get(cat.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async update(id: string, dto: UpdateCategoryDto, user: JwtPayload): Promise<FinancialCategory> {
    const existing = await this.prisma.client.financialCategory.findFirst({
      where: { id, tenant_id: user.tenant_id, congregation_id: user.congregation_id },
    });

    if (!existing) throw new NotFoundException('Categoria não encontrada');

    if (dto.type && dto.type !== existing.type) {
      const linked = await this.prisma.client.financialTransaction.count({
        where: { category_id: id },
      });
      if (linked > 0) {
        throw new ConflictException(
          'Não é possível alterar o tipo de uma categoria com transações vinculadas',
        );
      }
    }

    return this.prisma.client.financialCategory.update({ where: { id }, data: dto });
  }

  async remove(id: string, user: JwtPayload): Promise<FinancialCategory> {
    const existing = await this.prisma.client.financialCategory.findFirst({
      where: { id, tenant_id: user.tenant_id, congregation_id: user.congregation_id },
    });

    if (!existing) throw new NotFoundException('Categoria não encontrada');

    if (existing.is_system) {
      throw new ForbiddenException('Categorias do sistema não podem ser removidas');
    }

    const linked = await this.prisma.client.financialTransaction.count({
      where: { category_id: id },
    });
    if (linked > 0) {
      throw new ConflictException(
        'Não é possível remover uma categoria com transações vinculadas',
      );
    }

    return this.prisma.client.financialCategory.delete({ where: { id } });
  }
}
