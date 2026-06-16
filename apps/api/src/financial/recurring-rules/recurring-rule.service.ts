import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RecurringRule, RecurringRuleMode, TransactionSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CreateRecurringRuleDto } from './dto/create-recurring-rule.dto';

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

type RecurringRuleWithCount = RecurringRule & { transactions_count: number };

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
}
