import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { JobStatus, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import * as ofx from 'node-ofx-parser';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { writeAuditLog } from '../../common/audit/write-audit-log';
import { ListUnmatchedQueryDto } from './dto/list-unmatched-query.dto';

const ALLOWED_EXTENSIONS = new Set(['.ofx', '.qfx']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_TRANSACTIONS = 5000;
// Bancos postam o débito/crédito uns dias depois do que o OFX exporta como
// `occurred_at` (compensação). 3 dias cobre o caso comum sem abrir demais o
// risco de casar a transação errada quando há duas de valor igual no mês.
const MATCH_TOLERANCE_DAYS = 3;

export interface OfxImportReport {
  job_id: string;
  total: number;
  matched: number;
  unmatched: number;
  duplicates: number;
  errors: { row: number; reason: string }[];
}

interface ParsedOfxTransaction {
  row: number;
  fitid: string;
  posted_at: Date;
  amount: Prisma.Decimal;
  is_credit: boolean;
  description: string | null;
}

@Injectable()
export class OfxImportService {
  private readonly logger = new Logger(OfxImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Import ────────────────────────────────────────────────────────────────

  async importOfx(file: Express.Multer.File, user: JwtPayload): Promise<OfxImportReport> {
    const name = file.originalname.toLowerCase();
    if (!Array.from(ALLOWED_EXTENSIONS).some((ext) => name.endsWith(ext))) {
      throw new BadRequestException('Formato inválido. Envie um arquivo .ofx ou .qfx');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Arquivo muito grande. Limite: 10 MB');
    }

    const { transactions, errors } = this.parseFile(file.buffer);
    if (transactions.length === 0 && errors.length === 0) {
      throw new BadRequestException('Nenhuma transação encontrada no arquivo OFX');
    }
    if (transactions.length > MAX_TRANSACTIONS) {
      throw new BadRequestException(`Limite de ${MAX_TRANSACTIONS} transações por importação excedido`);
    }

    const tenantId = user.tenant_id;
    const congregationId = user.congregation_id;

    // Já casadas em importações anteriores — não podem casar de novo aqui.
    // (financial_transaction_id é @unique em bank_statement_transactions: uma
    // FinancialTransaction casa com no máximo uma linha de extrato.)
    const alreadyMatched = await this.prisma.client.bankStatementTransaction.findMany({
      where: { tenant_id: tenantId, congregation_id: congregationId, financial_transaction_id: { not: null } },
      select: { financial_transaction_id: true },
    });
    const usedTransactionIds = new Set(
      alreadyMatched.map((m) => m.financial_transaction_id).filter((id): id is string => id !== null),
    );

    // Reimport do mesmo extrato não duplica: FITID já visto para este
    // tenant+congregação é pulado antes de tentar casar de novo.
    const existingFitids = await this.prisma.client.bankStatementTransaction.findMany({
      where: { tenant_id: tenantId, congregation_id: congregationId },
      select: { fitid: true },
    });
    const seenFitids = new Set(existingFitids.map((r) => r.fitid));

    const job = await this.prisma.client.importJob.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        type: 'financial_ofx',
        status: JobStatus.processing,
        total_rows: transactions.length,
        created_by: user.sub,
      },
    });

    let matched = 0;
    let duplicates = 0;

    for (const tx of transactions) {
      if (seenFitids.has(tx.fitid)) {
        duplicates++;
        continue;
      }
      seenFitids.add(tx.fitid);

      const matchedTransactionId = await this.findMatch(tenantId, congregationId, tx, usedTransactionIds);
      if (matchedTransactionId) usedTransactionIds.add(matchedTransactionId);

      await this.prisma.client.bankStatementTransaction.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          import_job_id: job.id,
          fitid: tx.fitid,
          posted_at: tx.posted_at,
          amount: tx.amount,
          is_credit: tx.is_credit,
          description: tx.description,
          financial_transaction_id: matchedTransactionId,
        },
      });

      if (matchedTransactionId) matched++;
    }

    const unmatched = transactions.length - duplicates - matched;

    await this.prisma.client.importJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.done,
        imported: matched,
        skipped: duplicates,
        errors: errors as unknown as Prisma.InputJsonValue,
      },
    });

    await writeAuditLog(
      this.prisma,
      {
        tenant_id: tenantId,
        congregation_id: congregationId,
        actor_user_id: user.impersonated_by ?? user.sub,
        entity: 'bank_statement_transaction',
        action: 'financial.ofx_import',
        after: { job_id: job.id, total: transactions.length, matched, unmatched, duplicates },
      },
      this.logger,
    );

    return { job_id: job.id, total: transactions.length, matched, unmatched, duplicates, errors };
  }

  // ── Listagem de não-casados ─────────────────────────────────────────────

  async findUnmatched(query: ListUnmatchedQueryDto, user: JwtPayload) {
    const where: Prisma.BankStatementTransactionWhereInput = {
      tenant_id: user.tenant_id,
      congregation_id: user.congregation_id,
      financial_transaction_id: null,
      ...(query.import_job_id ? { import_job_id: query.import_job_id } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.client.bankStatementTransaction.findMany({
        where,
        orderBy: { posted_at: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.client.bankStatementTransaction.count({ where }),
    ]);

    return { data, total, page: query.page, limit: query.limit };
  }

  // ── Matching ──────────────────────────────────────────────────────────────

  private async findMatch(
    tenantId: string,
    congregationId: string,
    tx: ParsedOfxTransaction,
    usedTransactionIds: Set<string>,
  ): Promise<string | null> {
    const rangeStart = new Date(tx.posted_at);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - MATCH_TOLERANCE_DAYS);
    const rangeEnd = new Date(tx.posted_at);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + MATCH_TOLERANCE_DAYS);

    const candidates = await this.prisma.client.financialTransaction.findMany({
      where: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        status: { in: [TransactionStatus.paid, TransactionStatus.confirmed] },
        amount: tx.amount,
        category: { type: tx.is_credit ? TransactionType.income : TransactionType.expense },
        occurred_at: { gte: rangeStart, lte: rangeEnd },
        ...(usedTransactionIds.size > 0 ? { id: { notIn: Array.from(usedTransactionIds) } } : {}),
      },
      select: { id: true, occurred_at: true },
    });

    if (candidates.length === 0) return null;

    let best = candidates[0]!;
    let bestDiff = Math.abs(best.occurred_at.getTime() - tx.posted_at.getTime());
    for (const candidate of candidates.slice(1)) {
      const diff = Math.abs(candidate.occurred_at.getTime() - tx.posted_at.getTime());
      if (diff < bestDiff) {
        best = candidate;
        bestDiff = diff;
      }
    }
    return best.id;
  }

  // ── Parsing ───────────────────────────────────────────────────────────────

  private parseFile(buffer: Buffer): {
    transactions: ParsedOfxTransaction[];
    errors: { row: number; reason: string }[];
  } {
    let parsed: Record<string, unknown>;
    try {
      parsed = ofx.parse(buffer.toString('latin1'));
    } catch {
      throw new BadRequestException('Arquivo OFX inválido ou corrompido');
    }

    const rawTrns = this.extractStmtTrns(parsed);
    const transactions: ParsedOfxTransaction[] = [];
    const errors: { row: number; reason: string }[] = [];

    rawTrns.forEach((raw, index) => {
      const row = index + 1;
      const fitid = this.stringField(raw, 'FITID');
      const dtposted = this.stringField(raw, 'DTPOSTED');
      const trnamt = this.stringField(raw, 'TRNAMT');

      if (!fitid) {
        errors.push({ row, reason: 'missing_fitid' });
        return;
      }
      if (!dtposted) {
        errors.push({ row, reason: 'missing_dtposted' });
        return;
      }

      const amount = trnamt ? Number(trnamt) : NaN;
      if (!trnamt || Number.isNaN(amount)) {
        errors.push({ row, reason: 'invalid_trnamt' });
        return;
      }

      const posted_at = this.parseOfxDate(dtposted);
      if (!posted_at) {
        errors.push({ row, reason: 'invalid_dtposted' });
        return;
      }

      const description =
        this.stringField(raw, 'NAME') ?? this.stringField(raw, 'MEMO') ?? null;

      transactions.push({
        row,
        fitid,
        posted_at,
        amount: new Prisma.Decimal(Math.abs(amount).toFixed(2)),
        is_credit: amount > 0,
        description,
      });
    });

    return { transactions, errors };
  }

  /** Acha todos os nós `STMTTRN` na árvore do OFX, em qualquer profundidade — a posição exata varia por banco (conta corrente, cartão, etc). */
  private extractStmtTrns(node: unknown, acc: unknown[] = []): unknown[] {
    if (node === null || typeof node !== 'object') return acc;

    if (Array.isArray(node)) {
      for (const item of node) this.extractStmtTrns(item, acc);
      return acc;
    }

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'STMTTRN') {
        if (Array.isArray(value)) acc.push(...value);
        else acc.push(value);
      } else {
        this.extractStmtTrns(value, acc);
      }
    }
    return acc;
  }

  private stringField(node: unknown, key: string): string | null {
    if (node === null || typeof node !== 'object') return null;
    const value = (node as Record<string, unknown>)[key];
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  /** OFX usa `YYYYMMDD[HHMMSS][.xxx][gmt offset]` — só a data importa para o casamento. */
  private parseOfxDate(raw: string): Date | null {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 8) return null;
    const year = digits.slice(0, 4);
    const month = digits.slice(4, 6);
    const day = digits.slice(6, 8);
    const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
