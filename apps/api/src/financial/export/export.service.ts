import { Injectable, Logger } from '@nestjs/common';
import { ExportJobType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { JobsService } from './jobs.service';
import { ExportRequestDto } from './dto/export-request.dto';

const SYNC_MAX_DAYS = 92;
const UTF8_BOM = '﻿';

// ── Result types ────────────────────────────────────────────────────────────

export interface FileResult {
  type: 'file';
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface JobResult {
  type: 'job';
  job_id: string;
  status: 'pending';
}

// ── Transaction row (joined) ────────────────────────────────────────────────

interface TxRow {
  id: string;
  type: string;
  amount: Decimal;
  occurred_at: Date;
  description: string | null;
  category: { name: string; type: string };
  costCenter: { name: string } | null;
  pixPayment: { asaas_payment_id: string | null } | null;
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  async exportCsv(
    tenantId: string,
    congregationId: string,
    dto: ExportRequestDto,
    createdBy: string,
  ): Promise<FileResult | JobResult> {
    const { start, end, days } = this.parsePeriod(dto);

    if (days <= SYNC_MAX_DAYS) {
      const rows = await this.fetchTransactions(tenantId, congregationId, dto, start, end);
      const buffer = this.buildCsvBuffer(rows);
      await this.markConfirmed(rows.map((r) => r.id), false);
      return {
        type: 'file',
        buffer,
        filename: this.csvFilename(start, end),
        mimeType: 'text/csv; charset=utf-8',
      };
    }

    return this.enqueueJob(tenantId, congregationId, dto, start, end, createdBy, ExportJobType.csv);
  }

  async exportOfx(
    tenantId: string,
    congregationId: string,
    dto: ExportRequestDto,
    createdBy: string,
  ): Promise<FileResult | JobResult> {
    const { start, end, days } = this.parsePeriod(dto);

    if (days <= SYNC_MAX_DAYS) {
      const [rows, tenant] = await Promise.all([
        this.fetchTransactions(tenantId, congregationId, dto, start, end),
        this.prisma.client.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
      ]);
      const buffer = this.buildOfxBuffer(rows, tenant?.slug ?? 'orbien', start, end);
      await this.markConfirmed(rows.map((r) => r.id), false);
      return {
        type: 'file',
        buffer,
        filename: this.ofxFilename(start, end),
        mimeType: 'application/x-ofx',
      };
    }

    return this.enqueueJob(tenantId, congregationId, dto, start, end, createdBy, ExportJobType.ofx);
  }

  // ── Async job processing ───────────────────────────────────────────────────

  private async enqueueJob(
    tenantId: string,
    congregationId: string,
    dto: ExportRequestDto,
    start: Date,
    end: Date,
    createdBy: string,
    jobType: ExportJobType,
  ): Promise<JobResult> {
    const job = await this.jobs.create(tenantId, congregationId, jobType, start, end, createdBy);

    setImmediate(() => {
      this.processJob(job.id, tenantId, congregationId, dto, start, end, jobType).catch((err: Error) =>
        this.logger.error(`Export job ${job.id} failed: ${err.message}`),
      );
    });

    return { type: 'job', job_id: job.id, status: 'pending' };
  }

  private async processJob(
    jobId: string,
    tenantId: string,
    congregationId: string,
    dto: ExportRequestDto,
    start: Date,
    end: Date,
    jobType: ExportJobType,
  ): Promise<void> {
    await this.jobs.markProcessing(jobId);
    try {
      // Use prisma.system — running outside request context (no AsyncLocalStorage)
      const rows = await this.fetchTransactionsSystem(tenantId, congregationId, dto, start, end);

      let buffer: Buffer;
      let mimeType: string;
      let ext: string;

      if (jobType === ExportJobType.ofx) {
        const tenant = await this.prisma.system.tenant.findUnique({
          where: { id: tenantId },
          select: { slug: true },
        });
        buffer = this.buildOfxBuffer(rows, tenant?.slug ?? 'orbien', start, end);
        mimeType = 'application/x-ofx';
        ext = 'ofx';
      } else {
        buffer = this.buildCsvBuffer(rows);
        mimeType = 'text/csv; charset=utf-8';
        ext = 'csv';
      }

      const key = `exports/${tenantId}/${jobId}.${ext}`;
      await this.storage.upload(buffer, key, mimeType);
      const fileUrl = await this.storage.getPresignedGetUrl(key, 7 * 86_400); // 7 days

      await this.markConfirmed(rows.map((r) => r.id), true);
      await this.jobs.markDone(jobId, fileUrl);
      this.logger.log(`Export job ${jobId} done (${buffer.length} bytes)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.jobs.markError(jobId, msg);
      throw err;
    }
  }

  /** Marks exported transactions as 'confirmed' — accounting export is what closes the books on them. */
  private async markConfirmed(ids: string[], useSystemClient: boolean): Promise<void> {
    if (ids.length === 0) return;
    const client = useSystemClient ? this.prisma.system : this.prisma.client;
    await client.financialTransaction.updateMany({
      where: { id: { in: ids } },
      data: { status: 'confirmed' },
    });
  }

  // ── Transaction fetchers ──────────────────────────────────────────────────

  private async fetchTransactions(
    tenantId: string,
    congregationId: string,
    dto: ExportRequestDto,
    start: Date,
    end: Date,
  ): Promise<TxRow[]> {
    return this.prisma.client.financialTransaction.findMany({
      where: this.buildWhere(tenantId, congregationId, dto, start, end),
      include: {
        category: { select: { name: true, type: true } },
        costCenter: { select: { name: true } },
        pixPayment: { select: { asaas_payment_id: true } },
      },
      orderBy: { occurred_at: 'asc' },
    });
  }

  private async fetchTransactionsSystem(
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

  // ── CSV builder ───────────────────────────────────────────────────────────

  private buildCsvBuffer(rows: TxRow[]): Buffer {
    const header = 'data;histórico;conta_contábil;débito;crédito;centro_de_custo;documento\r\n';
    const lines = rows.map((tx) => {
      const isIncome = tx.category.type === 'income';
      const amount = Number(tx.amount).toFixed(2).replace('.', ',');
      return [
        tx.occurred_at.toISOString().slice(0, 10),
        this.csvEscape(tx.description ?? ''),
        this.csvEscape(tx.category.name),
        isIncome ? '' : amount,
        isIncome ? amount : '',
        this.csvEscape(tx.costCenter?.name ?? ''),
        this.csvEscape(tx.pixPayment?.asaas_payment_id ?? tx.id),
      ].join(';');
    });
    const content = UTF8_BOM + header + lines.join('\r\n');
    return Buffer.from(content, 'utf-8');
  }

  private csvEscape(value: string): string {
    if (value.includes(';') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  // ── OFX builder ───────────────────────────────────────────────────────────

  private buildOfxBuffer(rows: TxRow[], tenantSlug: string, start: Date, end: Date): Buffer {
    const dtStart = this.toOfxDate(start);
    const dtEnd = this.toOfxDate(end);

    const stmtTrns = rows.map((tx) => {
      const isCredit = tx.category.type === 'income';
      const amount = Number(tx.amount).toFixed(2);
      const name = (tx.description ?? tx.category.name).slice(0, 32);
      return [
        '<STMTTRN>',
        `<TRNTYPE>${isCredit ? 'CREDIT' : 'DEBIT'}</TRNTYPE>`,
        `<DTPOSTED>${this.toOfxDate(tx.occurred_at)}</DTPOSTED>`,
        `<TRNAMT>${isCredit ? amount : '-' + amount}</TRNAMT>`,
        `<FITID>${tx.id}</FITID>`,
        `<NAME>${this.ofxEscape(name)}</NAME>`,
        '</STMTTRN>',
      ].join('\r\n');
    });

    const ofx = [
      'OFXHEADER:100',
      'DATA:OFXSGML',
      'VERSION:102',
      'SECURITY:NONE',
      'ENCODING:USASCII',
      'CHARSET:1252',
      'COMPRESSION:NONE',
      'OLDFILEUID:NONE',
      'NEWFILEUID:NONE',
      '',
      '<OFX>',
      '<BANKMSGSRSV1>',
      '<STMTTRNRS>',
      '<TRNUID>1</TRNUID>',
      '<STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>',
      '<STMTRS>',
      '<CURDEF>BRL</CURDEF>',
      '<BANKACCTFROM>',
      `<ACCTID>${tenantSlug}</ACCTID>`,
      '<ACCTTYPE>CHECKING</ACCTTYPE>',
      '</BANKACCTFROM>',
      '<BANKTRANLIST>',
      `<DTSTART>${dtStart}</DTSTART>`,
      `<DTEND>${dtEnd}</DTEND>`,
      ...stmtTrns,
      '</BANKTRANLIST>',
      '</STMTRS>',
      '</STMTTRNRS>',
      '</BANKMSGSRSV1>',
      '</OFX>',
    ].join('\r\n');

    return Buffer.from(ofx, 'latin1');
  }

  private toOfxDate(d: Date): string {
    return d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  }

  private ofxEscape(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private parsePeriod(dto: ExportRequestDto): { start: Date; end: Date; days: number } {
    const start = new Date(dto.period_start);
    const end = new Date(dto.period_end);
    end.setUTCHours(23, 59, 59, 999);
    const days = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
    return { start, end, days };
  }

  private csvFilename(start: Date, end: Date): string {
    const s = start.toISOString().slice(0, 7).replace('-', '');
    const e = end.toISOString().slice(0, 7).replace('-', '');
    return s === e
      ? `orbien_contabil_${s}.csv`
      : `orbien_contabil_${s}_${e}.csv`;
  }

  private ofxFilename(start: Date, end: Date): string {
    return this.csvFilename(start, end).replace('.csv', '.ofx');
  }
}
