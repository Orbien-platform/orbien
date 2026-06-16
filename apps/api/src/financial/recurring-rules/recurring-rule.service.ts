import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RecurringFrequency, RecurringRule, TransactionSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CreateRecurringRuleDto } from './dto/create-recurring-rule.dto';

function nextOccurrence(from: Date, frequency: RecurringFrequency, interval: number): Date {
  const next = new Date(from);
  switch (frequency) {
    case RecurringFrequency.weekly:
      next.setDate(next.getDate() + 7 * interval);
      break;
    case RecurringFrequency.monthly:
      next.setMonth(next.getMonth() + interval);
      break;
    case RecurringFrequency.yearly:
      next.setFullYear(next.getFullYear() + interval);
      break;
  }
  return next;
}

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

    const interval = dto.interval ?? 1;
    const now = new Date();
    const ends_at = dto.ends_at ? new Date(dto.ends_at) : undefined;

    if (ends_at && ends_at <= now) {
      throw new BadRequestException('Data de término deve ser futura');
    }

    return this.prisma.runInTx(async (tx) => {
      const rule = await tx.recurringRule.create({
        data: {
          tenant_id: user.tenant_id,
          congregation_id: user.congregation_id,
          frequency: dto.frequency,
          interval,
          next_occurrence_at: nextOccurrence(now, dto.frequency, interval),
          ends_at,
        },
      });

      await tx.financialTransaction.create({
        data: {
          tenant_id: user.tenant_id,
          congregation_id: user.congregation_id,
          type: dto.type,
          amount: new Prisma.Decimal(dto.amount),
          occurred_at: now,
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

  async findAll(user: JwtPayload): Promise<RecurringRule[]> {
    return this.prisma.client.recurringRule.findMany({
      where: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        is_active: true,
      },
      orderBy: { next_occurrence_at: 'asc' },
    });
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

  async generateNext(ruleId: string): Promise<RecurringRule | null> {
    const rule = await this.prisma.system.recurringRule.findUnique({
      where: { id: ruleId },
    });

    if (!rule || !rule.is_active) return null;

    const lastTransaction = await this.prisma.system.financialTransaction.findFirst({
      where: { recurring_rule_id: rule.id },
      orderBy: { occurred_at: 'desc' },
    });

    if (!lastTransaction) return null;

    const upcoming = nextOccurrence(rule.next_occurrence_at, rule.frequency, rule.interval);
    const isExpired = rule.ends_at !== null && rule.next_occurrence_at > rule.ends_at;

    return this.prisma.system.$transaction(async (tx) => {
      if (!isExpired) {
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
      }

      return tx.recurringRule.update({
        where: { id: rule.id },
        data: {
          next_occurrence_at: upcoming,
          is_active: isExpired ? false : true,
        },
      });
    });
  }
}
