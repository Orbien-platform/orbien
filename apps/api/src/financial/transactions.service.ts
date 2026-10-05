import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FinancialTransaction, Prisma, TransactionSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { UpdateTransactionStatusDto } from './dto/update-transaction-status.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { writeAuditLog } from '../common/audit/write-audit-log';

type PaginatedTransactions = {
  data: FinancialTransaction[];
  total: number;
  page: number;
  limit: number;
};

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

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

    await this.assertDonorAndCostCenter(dto.donor_person_id, dto.cost_center_id, user);

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
        status: dto.status ?? 'pending',
        created_by_user_id: user.sub,
      },
    });

    await writeAuditLog(
      this.prisma,
      {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        actor_user_id: user.impersonated_by ?? user.sub,
        entity: 'financial_transaction',
        action: 'created',
        after: transaction,
      },
      this.logger,
    );

    return transaction;
  }

  // Doador e centro de custo vêm do corpo: sem esta checagem um id de outra
  // congregação (ou inexistente) chegava ao INSERT e virava 500 por FK, ou —
  // dentro do mesmo tenant — gravava vínculo com dado de outra congregação.
  private async assertDonorAndCostCenter(
    donorPersonId: string | null | undefined,
    costCenterId: string | null | undefined,
    user: JwtPayload,
  ): Promise<void> {
    const scope = { tenant_id: user.tenant_id, congregation_id: user.congregation_id };

    if (donorPersonId) {
      const person = await this.prisma.client.person.findFirst({
        where: { id: donorPersonId, ...scope },
        select: { id: true },
      });
      if (!person) throw new NotFoundException('Doador não encontrado');
    }

    if (costCenterId) {
      const costCenter = await this.prisma.client.costCenter.findFirst({
        where: { id: costCenterId, ...scope },
        select: { id: true },
      });
      if (!costCenter) throw new NotFoundException('Centro de custo não encontrado');
    }
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
        // `id` desempata: sem ele, lançamentos do mesmo dia (o caso comum) podem
        // repetir ou sumir entre uma página e a seguinte.
        orderBy: [{ occurred_at: 'desc' }, { id: 'asc' }],
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

    // Trocar só o `type` também pode quebrar o par tipo/categoria: entrada
    // virando saída na mesma categoria de receita deixaria o lançamento
    // contado no DRE do lado errado. Revalida quando muda a categoria OU o tipo.
    const categoryChanged = !!dto.category_id && dto.category_id !== existing.category_id;
    const typeChanged = !!dto.type && dto.type !== existing.type;
    if (categoryChanged || typeChanged) {
      const category = await this.prisma.client.financialCategory.findFirst({
        where: {
          id: dto.category_id ?? existing.category_id,
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

    await this.assertDonorAndCostCenter(dto.donor_person_id, dto.cost_center_id, user);

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

    await writeAuditLog(
      this.prisma,
      {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        actor_user_id: user.impersonated_by ?? user.sub,
        entity: 'financial_transaction',
        action: 'updated',
        before: existing,
        after: updated,
      },
      this.logger,
    );

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

    await writeAuditLog(
      this.prisma,
      {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        actor_user_id: user.impersonated_by ?? user.sub,
        entity: 'financial_transaction',
        action: 'deleted',
        before: existing,
      },
      this.logger,
    );

    return deleted;
  }

  async updateStatus(
    id: string,
    dto: UpdateTransactionStatusDto,
    user: JwtPayload,
  ): Promise<FinancialTransaction> {
    const existing = await this.prisma.client.financialTransaction.findFirst({
      where: { id, tenant_id: user.tenant_id, congregation_id: user.congregation_id },
    });

    if (!existing) throw new NotFoundException('Transação não encontrada');

    if (existing.status === 'confirmed') {
      throw new ForbiddenException('Transação já confirmada em uma exportação contábil não pode ser alterada');
    }

    const updated = await this.prisma.client.financialTransaction.update({
      where: { id },
      data: { status: dto.status },
    });

    await writeAuditLog(
      this.prisma,
      {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        actor_user_id: user.impersonated_by ?? user.sub,
        entity: 'financial_transaction',
        action: 'status_updated',
        before: existing,
        after: updated,
      },
      this.logger,
    );

    return updated;
  }
}
