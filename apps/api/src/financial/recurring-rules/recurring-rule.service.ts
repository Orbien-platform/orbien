import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FinancialTransaction,
  Prisma,
  RecurringRule,
  RecurringRuleMode,
  TransactionSource,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CreateRecurringRuleDto } from './dto/create-recurring-rule.dto';
import { UpdateTransactionDto } from '../dto/update-transaction.dto';

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

type RecurringRuleWithCount = RecurringRule & { transactions_count: number };

export type RecurringScope = 'this' | 'this_and_future';

@Injectable()
export class RecurringRuleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRecurringRuleDto, user: JwtPayload): Promise<RecurringRule> {
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
        `Tipo do lançamento (${dto.type}) não corresponde ao tipo da categoria (${category.type})`,
      );
    }

    if (dto.mode === RecurringRuleMode.installment && !dto.installments) {
      throw new BadRequestException('Número de parcelas é obrigatório para o modo installment');
    }

    const startedAt = dto.started_at ? new Date(dto.started_at) : new Date();

    return this.prisma.runInTx(async (tx) => {
      if (dto.mode === RecurringRuleMode.installment) {
        const installments = dto.installments!;
        const lastOccurrence = addMonths(startedAt, installments - 1);

        const rule = await tx.recurringRule.create({
          data: {
            tenant_id: user.tenant_id,
            congregation_id: user.congregation_id,
            mode: dto.mode,
            frequency: dto.frequency,
            installments,
            next_occurrence_at: lastOccurrence,
            ends_at: lastOccurrence,
            is_active: true,
          },
        });

        for (let i = 1; i <= installments; i++) {
          await tx.financialTransaction.create({
            data: {
              tenant_id: user.tenant_id,
              congregation_id: user.congregation_id,
              type: dto.type,
              amount: new Prisma.Decimal(dto.amount),
              occurred_at: addMonths(startedAt, i - 1),
              description: `${dto.description} (${i}/${installments})`,
              category_id: dto.category_id,
              source: TransactionSource.recurring,
              notes: dto.notes,
              recurring_rule_id: rule.id,
              created_by_user_id: user.sub,
            },
          });
        }

        return rule;
      }

      // mode === fixed
      const rule = await tx.recurringRule.create({
        data: {
          tenant_id: user.tenant_id,
          congregation_id: user.congregation_id,
          mode: dto.mode,
          frequency: dto.frequency,
          installments: null,
          next_occurrence_at: addMonths(startedAt, 1),
          ends_at: null,
          is_active: true,
        },
      });

      await tx.financialTransaction.create({
        data: {
          tenant_id: user.tenant_id,
          congregation_id: user.congregation_id,
          type: dto.type,
          amount: new Prisma.Decimal(dto.amount),
          occurred_at: startedAt,
          description: dto.description,
          category_id: dto.category_id,
          source: TransactionSource.recurring,
          notes: dto.notes,
          recurring_rule_id: rule.id,
          created_by_user_id: user.sub,
        },
      });

      return rule;
    });
  }

  async findAll(user: JwtPayload): Promise<RecurringRuleWithCount[]> {
    const rules = await this.prisma.client.recurringRule.findMany({
      where: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        is_active: true,
      },
      include: { _count: { select: { transactions: true } } },
      orderBy: { created_at: 'desc' },
    });

    return rules.map(({ _count, ...rule }) => ({
      ...rule,
      transactions_count: _count.transactions,
    }));
  }

  async deactivate(id: string, user: JwtPayload): Promise<RecurringRule> {
    const existing = await this.prisma.client.recurringRule.findFirst({
      where: { id, tenant_id: user.tenant_id, congregation_id: user.congregation_id },
    });

    if (!existing) throw new NotFoundException('Regra recorrente não encontrada');

    return this.prisma.client.recurringRule.update({
      where: { id },
      data: { is_active: false },
    });
  }

  /** Generates the next transaction for a `fixed` mode rule. No-op for `installment` rules. */
  async generateNext(ruleId: string): Promise<RecurringRule | null> {
    const rule = await this.prisma.system.recurringRule.findUnique({
      where: { id: ruleId },
    });

    if (!rule || !rule.is_active || rule.mode !== RecurringRuleMode.fixed) return null;

    const lastTransaction = await this.prisma.system.financialTransaction.findFirst({
      where: { recurring_rule_id: rule.id },
      orderBy: { occurred_at: 'desc' },
    });

    if (!lastTransaction) return null;

    return this.prisma.system.$transaction(async (tx) => {
      await tx.financialTransaction.create({
        data: {
          tenant_id: rule.tenant_id,
          congregation_id: rule.congregation_id,
          type: lastTransaction.type,
          amount: lastTransaction.amount,
          occurred_at: rule.next_occurrence_at,
          description: lastTransaction.description,
          category_id: lastTransaction.category_id,
          source: TransactionSource.recurring,
          notes: lastTransaction.notes,
          recurring_rule_id: rule.id,
          created_by_user_id: lastTransaction.created_by_user_id,
        },
      });

      return tx.recurringRule.update({
        where: { id: rule.id },
        data: { next_occurrence_at: addMonths(rule.next_occurrence_at, 1) },
      });
    });
  }

  private assertValidScope(scope: RecurringScope): void {
    if (scope !== 'this' && scope !== 'this_and_future') {
      throw new BadRequestException('scope deve ser "this" ou "this_and_future"');
    }
  }

  private async loadEditableTransaction(
    transactionId: string,
    user: JwtPayload,
  ): Promise<FinancialTransaction> {
    const transaction = await this.prisma.client.financialTransaction.findFirst({
      where: { id: transactionId, tenant_id: user.tenant_id, congregation_id: user.congregation_id },
    });

    if (!transaction) throw new NotFoundException('Transação não encontrada');

    if (transaction.status === 'confirmed') {
      throw new ForbiddenException('Transação já confirmada em uma exportação contábil não pode ser editada');
    }

    return transaction;
  }

  async updateTransaction(
    transactionId: string,
    dto: UpdateTransactionDto,
    scope: RecurringScope,
    user: JwtPayload,
  ): Promise<FinancialTransaction | { updated_count: number }> {
    this.assertValidScope(scope);
    const transaction = await this.loadEditableTransaction(transactionId, user);

    if (dto.category_id && dto.category_id !== transaction.category_id) {
      const category = await this.prisma.client.financialCategory.findFirst({
        where: { id: dto.category_id, tenant_id: user.tenant_id, congregation_id: user.congregation_id },
        select: { type: true },
      });
      if (!category) throw new NotFoundException('Categoria não encontrada');

      const effectiveType = dto.type ?? transaction.type;
      if (category.type !== effectiveType) {
        throw new BadRequestException(
          `Tipo da transação (${effectiveType}) não corresponde ao tipo da categoria (${category.type})`,
        );
      }
    }

    const fields = {
      ...(dto.type && { type: dto.type }),
      ...(dto.amount !== undefined && { amount: new Prisma.Decimal(dto.amount) }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.category_id && { category_id: dto.category_id }),
      ...(dto.cost_center_id !== undefined && { cost_center_id: dto.cost_center_id }),
      ...(dto.donor_person_id !== undefined && { donor_person_id: dto.donor_person_id }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
    };

    return this.prisma.runInTx(async (tx) => {
      if (scope === 'this') {
        const updated = await tx.financialTransaction.update({
          where: { id: transaction.id },
          data: { ...fields, ...(dto.occurred_at && { occurred_at: dto.occurred_at }), recurring_rule_id: null },
        });

        await tx.auditLog
          .create({
            data: {
              tenant_id: user.tenant_id,
              congregation_id: user.congregation_id,
              actor_user_id: user.impersonated_by ?? user.sub,
              entity: 'financial_transaction',
              action: 'updated',
              before: transaction as unknown as Prisma.InputJsonValue,
              after: updated as unknown as Prisma.InputJsonValue,
            },
          })
          .catch(() => void 0);

        return updated;
      }

      // scope === 'this_and_future'
      if (!transaction.recurring_rule_id) {
        throw new BadRequestException('Transação não pertence a uma regra recorrente');
      }

      const { count } = await tx.financialTransaction.updateMany({
        where: {
          recurring_rule_id: transaction.recurring_rule_id,
          status: 'pending',
          occurred_at: { gte: transaction.occurred_at },
        },
        data: fields,
      });

      await tx.auditLog
        .create({
          data: {
            tenant_id: user.tenant_id,
            congregation_id: user.congregation_id,
            actor_user_id: user.impersonated_by ?? user.sub,
            entity: 'financial_transaction',
            action: 'updated_this_and_future',
            before: transaction as unknown as Prisma.InputJsonValue,
            after: fields as unknown as Prisma.InputJsonValue,
          },
        })
        .catch(() => void 0);

      return { updated_count: count };
    });
  }

  async deleteTransaction(
    transactionId: string,
    scope: RecurringScope,
    user: JwtPayload,
  ): Promise<FinancialTransaction | { deleted_count: number }> {
    this.assertValidScope(scope);
    const transaction = await this.loadEditableTransaction(transactionId, user);

    return this.prisma.runInTx(async (tx) => {
      if (scope === 'this') {
        const deleted = await tx.financialTransaction.delete({ where: { id: transaction.id } });

        await tx.auditLog
          .create({
            data: {
              tenant_id: user.tenant_id,
              congregation_id: user.congregation_id,
              actor_user_id: user.impersonated_by ?? user.sub,
              entity: 'financial_transaction',
              action: 'deleted',
              before: transaction as unknown as Prisma.InputJsonValue,
            },
          })
          .catch(() => void 0);

        return deleted;
      }

      // scope === 'this_and_future'
      if (!transaction.recurring_rule_id) {
        throw new BadRequestException('Transação não pertence a uma regra recorrente');
      }

      const { count } = await tx.financialTransaction.deleteMany({
        where: {
          recurring_rule_id: transaction.recurring_rule_id,
          status: 'pending',
          occurred_at: { gte: transaction.occurred_at },
        },
      });

      await tx.recurringRule.update({
        where: { id: transaction.recurring_rule_id },
        data: { is_active: false },
      });

      await tx.auditLog
        .create({
          data: {
            tenant_id: user.tenant_id,
            congregation_id: user.congregation_id,
            actor_user_id: user.impersonated_by ?? user.sub,
            entity: 'financial_transaction',
            action: 'deleted_this_and_future',
            before: transaction as unknown as Prisma.InputJsonValue,
          },
        })
        .catch(() => void 0);

      return { deleted_count: count };
    });
  }
}
