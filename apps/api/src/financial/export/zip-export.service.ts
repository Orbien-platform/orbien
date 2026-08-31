import { Injectable, Logger } from '@nestjs/common';
import { ExportJobType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as nodePath from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { JobsService } from './jobs.service';
import { JobResult } from './export.service';
import { ExportRequestDto } from './dto/export-request.dto';

import { ZipArchive } from 'archiver';

const UTF8_BOM = '﻿';

interface TxRow {
  id: string;
  amount: Decimal;
  occurred_at: Date;
  description: string | null;
  category: { name: string; type: string };
  costCenter: { name: string } | null;
  pixPayment: { asaas_payment_id: string | null } | null;
}

interface AttachmentRow {
  id: string;
  file_url: string;
  file_name: string;
  transaction: {
    id: string;
    occurred_at: Date;
    description: string | null;
    category: { name: string };
  };
}

@Injectable()
export class ZipExportService {
  private readonly logger = new Logger(ZipExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
  ) {}

  async exportZip(
    tenantId: string,
    congregationId: string,
    dto: ExportRequestDto,
    createdBy: string,
  ): Promise<JobResult> {
    const { start, end } = this.parsePeriod(dto);
    const job = await this.jobs.create(
      tenantId, congregationId, ExportJobType.zip, start, end, createdBy,
    );

    setImmediate(() => {
      this.processJob(job.id, tenantId, congregationId, dto, start, end).catch((err: Error) =>
        this.logger.error(`ZIP export job ${job.id} failed: ${err.message}`),
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
      const [txRows, attachmentRows] = await Promise.all([
        this.fetchTransactions(tenantId, congregationId, dto, start, end),
        this.fetchAttachments(tenantId, congregationId, dto, start, end),
      ]);

      const csvBuffer = this.buildCsvBuffer(txRows);

      const attachmentEntries: { name: string; buffer: Buffer }[] = [];
      for (const att of attachmentRows) {
        try {
          const key = new URL(att.file_url).pathname.slice(1);
          const buffer = await this.storage.downloadBuffer(key);
          const ext = nodePath.extname(att.file_name) || '.bin';
          const date = att.transaction.occurred_at.toISOString().slice(0, 10);
          const slug = this.slugify(att.transaction.description ?? att.transaction.category.name);
          attachmentEntries.push({ name: `${date}_${att.transaction.id.slice(0, 8)}_${slug}${ext}`, buffer });
        } catch (err: unknown) {
          this.logger.warn(`Skipping attachment ${att.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const zipBuffer = await this.buildZipBuffer(csvBuffer, attachmentEntries);

      const key = `exports/${tenantId}/${jobId}.zip`;
      await this.storage.upload(zipBuffer, key, 'application/zip');
      const fileUrl = await this.storage.getPresignedGetUrl(key, 7 * 86_400);
      await this.jobs.markDone(jobId, fileUrl);
      this.logger.log(
        `ZIP export job ${jobId} done — ${attachmentEntries.length} attachments, ${zipBuffer.length} bytes`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.jobs.markError(jobId, msg);
      throw err;
    }
  }

  // ── Fetchers ─────────────────────────────────────────────────────────────

  private buildTxWhere(
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
      where: this.buildTxWhere(tenantId, congregationId, dto, start, end),
      include: {
        category: { select: { name: true, type: true } },
        costCenter: { select: { name: true } },
        pixPayment: { select: { asaas_payment_id: true } },
      },
      orderBy: { occurred_at: 'asc' },
    });
  }

  private fetchAttachments(
    tenantId: string,
    congregationId: string,
    dto: ExportRequestDto,
    start: Date,
    end: Date,
  ): Promise<AttachmentRow[]> {
    return this.prisma.system.transactionAttachment.findMany({
      where: {
        tenant_id: tenantId,
        transaction: {
          congregation_id: dto.congregation_id ?? congregationId,
          occurred_at: { gte: start, lte: end },
          ...(dto.cost_center ? { costCenter: { name: dto.cost_center } } : {}),
        },
      },
      select: {
        id: true,
        file_url: true,
        file_name: true,
        transaction: {
          select: {
            id: true,
            occurred_at: true,
            description: true,
            category: { select: { name: true } },
          },
        },
      },
      orderBy: { transaction: { occurred_at: 'asc' } },
    });
  }

  // ── Builders ──────────────────────────────────────────────────────────────

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
    return Buffer.from(UTF8_BOM + header + lines.join('\r\n'), 'utf-8');
  }

  private buildZipBuffer(
    csvBuffer: Buffer,
    attachments: { name: string; buffer: Buffer }[],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const arc = new ZipArchive({ zlib: { level: 6 } });
      const chunks: Buffer[] = [];

      arc.on('data', (chunk: Buffer) => chunks.push(chunk));
      arc.on('end', () => resolve(Buffer.concat(chunks)));
      arc.on('error', reject);

      arc.append(csvBuffer, { name: 'lancamentos.csv' });
      for (const att of attachments) {
        arc.append(att.buffer, { name: att.name });
      }

      arc.finalize();
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private parsePeriod(dto: ExportRequestDto): { start: Date; end: Date } {
    const start = new Date(dto.period_start);
    const end = new Date(dto.period_end);
    end.setUTCHours(23, 59, 59, 999);
    return { start, end };
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
  }

  private csvEscape(value: string): string {
    if (value.includes(';') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
