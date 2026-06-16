import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinancialTransaction, Prisma, TransactionSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';

type PaginatedTransactions = {
  data: FinancialTransaction[];
  total: number;
  page: number;
  limit: number;
};

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTransactionDto, user: JwtPayload): Promise<FinancialTransaction> {
    const category = await this.prisma.client.financialCategory.findFirst({
      where: {
        id: dto.category_id,
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
      },
      select: { id: true, type: true },
    });

    if (!category) throw new NotFoundException('Categoria não encontrada');

    if (category.type !== dto.type) {
      throw new BadRequestException(
        `Tipo da transação (${dto.type}) não corresponde ao tipo da categoria (${category.type})`,
      );
    }

    if (dto.donor_person_id) {
      const person = await this.prisma.client.person.findFirst({
        where: {
          id: dto.donor_person_id,
          tenant_id: user.tenant_id,
          congregation_id: user.congregation_id,
        },
        select: { id: true },
      });
      if (!person) throw new NotFoundException('Doador não encontrado');
    }

    const transaction = await this.prisma.client.financialTransaction.create({
      data: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        occurred_at: dto.occurred_at,
        description: dto.description,
        category_id: dto.category_id,
        cost_center_id: dto.cost_center_id,
        donor_person_id: dto.donor_person_id,
        source: dto.source ?? TransactionSource.manual,
        notes: dto.notes,
        created_by_user_id: user.sub,
      },
    });

    this.prisma.client.auditLog
      .create({
        data: {
          tenant_id: user.tenant_id,
          congregation_id: user.congregation_id,
          actor_user_id: user.impersonated_by ?? user.sub,
          entity: 'financial_transaction',
          action: 'created',
          after: transaction as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => void 0);

    return transaction;
  }

  async findAll(query: ListTransactionsQueryDto, user: JwtPayload): Promise<PaginatedTransactions> {
    const { type, category_id, donor_person_id, since, until, page, limit } = query;

    const where: Prisma.FinancialTransactionWhereInput = {
      tenant_id: user.tenant_id,
      congregation_id: user.congregation_id,
    };

    if (type) where.type = type;
    if (category_id) where.category_id = category_id;
    if (donor_person_id) where.donor_person_id = donor_person_id;
    if (since || until) {
      where.occurred_at = {};
      if (since) where.occurred_at.gte = since;
      if (until) where.occurred_at.lte = until;
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.client.financialTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { occurred_at: 'desc' },
        include: {
          category: { select: { id: true, name: true, type: true } },
          donorPerson: { select: { id: true, full_name: true } },
        },
      }),
      this.prisma.client.financialTransaction.count({ where }),
    ]);

    return { data: data as FinancialTransaction[], total, page, limit };
  }

  async findOne(id: string, user: JwtPayload): Promise<FinancialTransaction> {
    const transaction = await this.prisma.client.financialTransaction.findFirst({
      where: { id, tenant_id: user.tenant_id, congregation_id: user.congregation_id },
      include: {
        category: true,
        costCenter: true,
        donorPerson: true,
        attachments: true,
      },
    });

    if (!transaction) throw new NotFoundException('Transação não encontrada');
    return transaction as FinancialTransaction;
  }

  async update(
    id: string,
    dto: UpdateTransactionDto,
    user: JwtPayload,
  ): Promise<FinancialTransaction> {
    const existing = await this.prisma.client.financialTransaction.findFirst({
      where: { id, tenant_id: user.tenant_id, congregation_id: user.congregation_id },
    });

    if (!existing) throw new NotFoundException('Transação não encontrada');

    if (existing.status === 'confirmed') {
      throw new ForbiddenException('Transação já confirmada em uma exportação contábil não pode ser editada');
    }

    if (dto.category_id && dto.category_id !== existing.category_id) {
      const category = await this.prisma.client.financialCategory.findFirst({
        where: {
          id: dto.category_id,
          tenant_id: user.tenant_id,
          congregation_id: user.congregation_id,
        },
        select: { type: true },
      });

      if (!category) throw new NotFoundException('Categoria não encontrada');

      const effectiveType = dto.type ?? existing.type;
      if (category.type !== effectiveType) {
        throw new BadRequestException(
          `Tipo da transação (${effectiveType}) não corresponde ao tipo da categoria (${category.type})`,
        );
      }
    }

    const updated = await this.prisma.client.financialTransaction.update({
      where: { id },
      data: {
        ...(dto.type && { type: dto.type }),
        ...(dto.amount !== undefined && { amount: new Prisma.Decimal(dto.amount) }),
        ...(dto.occurred_at && { occurred_at: dto.occurred_at }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category_id && { category_id: dto.category_id }),
        ...(dto.cost_center_id !== undefined && { cost_center_id: dto.cost_center_id }),
        ...(dto.donor_person_id !== undefined && { donor_person_id: dto.donor_person_id }),
        ...(dto.source && { source: dto.source }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });

    this.prisma.client.auditLog
      .create({
        data: {
          tenant_id: user.tenant_id,
          congregation_id: user.congregation_id,
          actor_user_id: user.impersonated_by ?? user.sub,
          entity: 'financial_transaction',
          action: 'updated',
          before: existing as unknown as Prisma.InputJsonValue,
          after: updated as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => void 0);

    return updated;
  }

  async remove(id: string, user: JwtPayload): Promise<FinancialTransaction> {
    const existing = await this.prisma.client.financialTransaction.findFirst({
      where: { id, tenant_id: user.tenant_id, congregation_id: user.congregation_id },
    });

    if (!existing) throw new NotFoundException('Transação não encontrada');

    if (existing.status === 'confirmed') {
      throw new ForbiddenException('Transação já confirmada em uma exportação contábil não pode ser excluída');
    }

    const deleted = await this.prisma.client.financialTransaction.delete({ where: { id } });

    this.prisma.client.auditLog
      .create({
        data: {
          tenant_id: user.tenant_id,
          congregation_id: user.congregation_id,
          actor_user_id: user.impersonated_by ?? user.sub,
          entity: 'financial_transaction',
          action: 'deleted',
          before: existing as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => void 0);

    return deleted;
  }
}
