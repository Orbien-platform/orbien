import { Injectable, Logger } from '@nestjs/common';
import { ExportJobType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { JobsService } from './jobs.service';
import { JobResult } from './export.service';
import { ExportRequestDto } from './dto/export-request.dto';

interface TxRow {
  id: string;
  amount: Decimal;
  occurred_at: Date;
  description: string | null;
  category: { name: string; type: string };
  costCenter: { name: string } | null;
  pixPayment: { asaas_payment_id: string | null } | null;
}

interface Account {
  code: string;
  name: string;
}

const CAIXA_CODE = '3.1.001';
const CAIXA_NAME = 'Caixa';

@Injectable()
export class SpedExportService {
  private readonly logger = new Logger(SpedExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
  ) {}

  async exportSped(
    tenantId: string,
    congregationId: string,
    dto: ExportRequestDto,
    createdBy: string,
  ): Promise<JobResult> {
    const { start, end } = this.parsePeriod(dto);
    const job = await this.jobs.create(
      tenantId, congregationId, ExportJobType.sped, start, end, createdBy,
    );

    setImmediate(() => {
      this.processJob(job.id, tenantId, congregationId, dto, start, end).catch((err: Error) =>
        this.logger.error(`SPED export job ${job.id} failed: ${err.message}`),
      );
    });

    return { type: 'job', job_id: job.id, status: 'pending' };
  }

  // ── Background processing ────────────────────────────────────────────────

  private async processJob(
    jobId: string,
    tenantId: string,
    congregationId: string,
    dto: ExportRequestDto,
    start: Date,
    end: Date,
  ): Promise<void> {
    await this.jobs.markProcessing(jobId);
    try {
      const [rows, tenant] = await Promise.all([
        this.fetchTransactions(tenantId, congregationId, dto, start, end),
        this.prisma.system.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      ]);

      const buffer = this.buildSpedBuffer(rows, tenant?.name ?? 'EMPRESA', start, end);

      const key = `exports/${tenantId}/${jobId}.txt`;
      await this.storage.upload(buffer, key, 'text/plain; charset=utf-8');
      const fileUrl = await this.storage.getPresignedGetUrl(key, 7 * 86_400);

      if (rows.length > 0) {
        await this.prisma.system.financialTransaction.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: { status: 'confirmed' },
        });
      }

      await this.jobs.markDone(jobId, fileUrl);
      this.logger.log(`SPED export job ${jobId} done (${buffer.length} bytes, ${rows.length} transactions)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.jobs.markError(jobId, msg);
      throw err;
    }
  }

  // ── SPED ECD builder ─────────────────────────────────────────────────────

  private buildSpedBuffer(rows: TxRow[], tenantName: string, start: Date, end: Date): Buffer {
    const dtIni = this.fmtSpedDate(start);
    const dtFin = this.fmtSpedDate(end);
    const nome = this.safe(tenantName, 100);
    const cnpj = '00000000000000';

    // ── Build account plan from transaction categories ─────────────────────
    const accounts: Account[] = [{ code: CAIXA_CODE, name: CAIXA_NAME }];
    const accountByCategory = new Map<string, string>(); // category name → code
    let incomeSeq = 0;
    let expenseSeq = 0;

    for (const tx of rows) {
      const catName = tx.category.name;
      if (accountByCategory.has(catName)) continue;
      if (tx.category.type === 'income') {
        incomeSeq++;
        const code = `1.1.${String(incomeSeq).padStart(3, '0')}`;
        accounts.push({ code, name: catName });
        accountByCategory.set(catName, code);
      } else {
        expenseSeq++;
        const code = `2.1.${String(expenseSeq).padStart(3, '0')}`;
        accounts.push({ code, name: catName });
        accountByCategory.set(catName, code);
      }
    }

    // ── Line arrays ────────────────────────────────────────────────────────
    const lines: string[] = [];

    // 0000 — Abertura
    lines.push(`|0000|9|N|${dtIni}|${dtFin}|${nome}|${cnpj}||0|||0||`);

    // Block 0
    const b0Start = lines.length;
    lines.push('|0001|1|');
    lines.push('|0007|0|0|0|105|3550308|SP|||||0,00|0,00|||');
    lines.push('|0035|||');
    const b0Count = lines.length - b0Start + 1; // +1 for 0990 itself
    lines.push(`|0990|${b0Count}|`);

    // Block I
    const bIStart = lines.length;
    lines.push('|I001|1|');
    lines.push(`|I010|ORBIEN|${dtIni}|${dtFin}|0|`);

    // I050 + I100 per account
    for (const acc of accounts) {
      lines.push(`|I050|${dtIni}|${acc.code}||1|A|${this.safe(acc.name, 60)}|ORBIEN|||`);
      lines.push(`|I100|${dtIni}|0,00|D||`);
    }

    // I150 + I155×2 per transaction
    let seqLcto = 0;
    for (const tx of rows) {
      seqLcto++;
      const isIncome = tx.category.type === 'income';
      const catCode = accountByCategory.get(tx.category.name) ?? CAIXA_CODE;
      const value = this.fmtValue(Number(tx.amount));
      const date = this.fmtSpedDate(tx.occurred_at);
      const doc = this.safe(tx.pixPayment?.asaas_payment_id ?? tx.id, 60);
      const hist = this.safe(tx.description ?? tx.category.name, 60);
      const seq = String(seqLcto).padStart(6, '0');

      lines.push(`|I150|${seq}|${date}|${value}|N||`);

      if (isIncome) {
        // D: Caixa (asset up), C: Receita (revenue up)
        lines.push(`|I155|1|${CAIXA_CODE}||${value}|D|${doc}|${hist}||`);
        lines.push(`|I155|2|${catCode}||${value}|C|${doc}|${hist}||`);
      } else {
        // D: Despesa (expense up), C: Caixa (asset down)
        lines.push(`|I155|1|${catCode}||${value}|D|${doc}|${hist}||`);
        lines.push(`|I155|2|${CAIXA_CODE}||${value}|C|${doc}|${hist}||`);
      }
    }

    const bICount = lines.length - bIStart + 1; // +1 for I990 itself
    lines.push(`|I990|${bICount}|`);

    // Block 9 — count record types from all lines so far
    const b9Start = lines.length;
    lines.push('|9001|1|');

    const recCounts = new Map<string, number>();
    for (const line of lines) {
      const reg = line.split('|')[1];
      recCounts.set(reg, (recCounts.get(reg) ?? 0) + 1);
    }
    // n9900 = existing distinct types + 3 (for 9900, 9990, 9999 not yet counted)
    const n9900 = recCounts.size + 3;
    recCounts.set('9900', n9900);
    recCounts.set('9990', 1);
    recCounts.set('9999', 1);

    for (const [reg, count] of recCounts) {
      lines.push(`|9900|${reg}|${count}|`);
    }

    const b9Count = lines.length - b9Start + 1; // +1 for 9990 itself
    lines.push(`|9990|${b9Count}|`);
    lines.push(`|9999|${lines.length + 1}|`);

    return Buffer.from(lines.join('\r\n') + '\r\n', 'utf-8');
  }

  // ── Fetchers ─────────────────────────────────────────────────────────────

  private buildWhere(
    tenantId: string,
    congregationId: string,
    dto: ExportRequestDto,
    start: Date,
    end: Date,
  ): object {
    return {
      tenant_id: tenantId,
      congregation_id: dto.congregation_id ?? congregationId,
      occurred_at: { gte: start, lte: end },
      ...(dto.cost_center ? { costCenter: { name: dto.cost_center } } : {}),
    };
  }

  private fetchTransactions(
    tenantId: string,
    congregationId: string,
    dto: ExportRequestDto,
    start: Date,
    end: Date,
  ): Promise<TxRow[]> {
    return this.prisma.system.financialTransaction.findMany({
      where: this.buildWhere(tenantId, congregationId, dto, start, end),
      include: {
        category: { select: { name: true, type: true } },
        costCenter: { select: { name: true } },
        pixPayment: { select: { asaas_payment_id: true } },
      },
      orderBy: { occurred_at: 'asc' },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private parsePeriod(dto: ExportRequestDto): { start: Date; end: Date } {
    const start = new Date(dto.period_start);
    const end = new Date(dto.period_end);
    end.setUTCHours(23, 59, 59, 999);
    return { start, end };
  }

  /** DDMMAAAA format required by SPED */
  private fmtSpedDate(d: Date): string {
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}${mm}${yyyy}`;
  }

  /** Brazilian decimal format: comma as separator, always 2 decimals */
  private fmtValue(n: number): string {
    return Math.abs(n).toFixed(2).replace('.', ',');
  }

  /** Truncate and strip pipe chars (which would break the SPED format) */
  private safe(s: string, maxLen: number): string {
    return s.replace(/\|/g, ' ').slice(0, maxLen);
  }
}
