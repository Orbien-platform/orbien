import { Injectable, Logger } from '@nestjs/common';
import { ExportJobType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { JobsService } from './jobs.service';
import { FileResult, JobResult } from './export.service';
import { PdfExportRequestDto } from './dto/pdf-export-request.dto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmakeLib = require('pdfmake') as {
  virtualfs: { writeFileSync: (name: string, content: Buffer) => void };
  fonts: Record<string, unknown>;
  setLocalAccessPolicy: (cb: () => boolean) => void;
  setUrlAccessPolicy: (cb: () => boolean) => void;
  createPdf: (def: object, opts: object) => { getBuffer: () => Promise<Buffer> };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsFonts = require('pdfmake/build/vfs_fonts') as Record<string, string>;
Object.entries(vfsFonts).forEach(([name, b64]) =>
  pdfmakeLib.virtualfs.writeFileSync(name, Buffer.from(b64, 'base64')),
);
pdfmakeLib.fonts = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
};
pdfmakeLib.setLocalAccessPolicy(() => false);
pdfmakeLib.setUrlAccessPolicy(() => false);

const HEADER_COLOR = '#1E3A7B';
const ALT_ROW_COLOR = '#F8F9FA';
const SUBTOTAL_COLOR = '#E8EDF8';
const SYNC_MAX_DAYS = 92;

interface TxRow {
  id: string;
  amount: Decimal;
  occurred_at: Date;
  description: string | null;
  category: { name: string; type: string };
  costCenter: { name: string } | null;
  pixPayment: { asaas_payment_id: string | null } | null;
}

@Injectable()
export class PdfExportService {
  private readonly logger = new Logger(PdfExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
  ) {}

  async exportPdf(
    tenantId: string,
    congregationId: string,
    dto: PdfExportRequestDto,
    createdBy: string,
  ): Promise<FileResult | JobResult> {
    const { start, end, days } = this.parsePeriod(dto);

    if (days <= SYNC_MAX_DAYS) {
      const [rows, tenant] = await Promise.all([
        this.fetchTransactions(tenantId, congregationId, dto, start, end),
        this.prisma.client.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      ]);
      const buffer = await this.buildPdfBuffer(rows, tenant?.name ?? 'Igreja', dto.type, start, end);
      return {
        type: 'file',
        buffer,
        filename: this.pdfFilename(dto.type, start, end),
        mimeType: 'application/pdf',
      };
    }

    return this.enqueueJob(tenantId, congregationId, dto, start, end, createdBy);
  }

  // ── Async job ─────────────────────────────────────────────────────────────

  private async enqueueJob(
    tenantId: string,
    congregationId: string,
    dto: PdfExportRequestDto,
    start: Date,
    end: Date,
    createdBy: string,
  ): Promise<JobResult> {
    const job = await this.jobs.create(tenantId, congregationId, ExportJobType.pdf, start, end, createdBy);

    setImmediate(() => {
      this.processJob(job.id, tenantId, congregationId, dto, start, end).catch((err: Error) =>
        this.logger.error(`PDF export job ${job.id} failed: ${err.message}`),
      );
    });

    return { type: 'job', job_id: job.id, status: 'pending' };
  }

  private async processJob(
    jobId: string,
    tenantId: string,
    congregationId: string,
    dto: PdfExportRequestDto,
    start: Date,
    end: Date,
  ): Promise<void> {
    await this.jobs.markProcessing(jobId);
    try {
      const [rows, tenant] = await Promise.all([
        this.fetchTransactionsSystem(tenantId, congregationId, dto, start, end),
        this.prisma.system.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      ]);
      const buffer = await this.buildPdfBuffer(rows, tenant?.name ?? 'Igreja', dto.type, start, end);

      const key = `exports/${tenantId}/${jobId}.pdf`;
      await this.storage.upload(buffer, key, 'application/pdf');
      const fileUrl = await this.storage.getPresignedGetUrl(key, 7 * 86_400);
      await this.jobs.markDone(jobId, fileUrl);
      this.logger.log(`PDF export job ${jobId} done (${buffer.length} bytes)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.jobs.markError(jobId, msg);
      throw err;
    }
  }

  // ── Transaction fetchers ──────────────────────────────────────────────────

  private buildWhere(
    tenantId: string,
    congregationId: string,
    dto: PdfExportRequestDto,
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
    dto: PdfExportRequestDto,
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

  private fetchTransactionsSystem(
    tenantId: string,
    congregationId: string,
    dto: PdfExportRequestDto,
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

  // ── PDF builders ──────────────────────────────────────────────────────────

  private async buildPdfBuffer(
    rows: TxRow[],
    tenantName: string,
    type: 'razao' | 'diario',
    start: Date,
    end: Date,
  ): Promise<Buffer> {
    const docDef =
      type === 'razao'
        ? this.buildRazaoDocDef(rows, tenantName, start, end)
        : this.buildDiarioDocDef(rows, tenantName, start, end);

    return pdfmakeLib.createPdf(docDef, {}).getBuffer();
  }

  private buildRazaoDocDef(rows: TxRow[], tenantName: string, start: Date, end: Date): object {
    const content: object[] = [
      this.pageHeader(tenantName, 'Razão Contábil', start, end),
    ];

    const byCategory = new Map<string, TxRow[]>();
    for (const tx of rows) {
      const key = tx.category.name;
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(tx);
    }

    let grandDebits = 0;
    let grandCredits = 0;

    for (const [catName, txs] of byCategory) {
      let runningBalance = 0;
      let catDebits = 0;
      let catCredits = 0;

      const tableBody: object[][] = [
        [
          { text: 'Data', style: 'th' },
          { text: 'Documento', style: 'th' },
          { text: 'Histórico', style: 'th' },
          { text: 'Débito', style: 'th', alignment: 'right' },
          { text: 'Crédito', style: 'th', alignment: 'right' },
          { text: 'Saldo', style: 'th', alignment: 'right' },
        ],
      ];

      txs.forEach((tx, i) => {
        const isIncome = tx.category.type === 'income';
        const amount = Number(tx.amount);
        const debit = isIncome ? 0 : amount;
        const credit = isIncome ? amount : 0;
        catDebits += debit;
        catCredits += credit;
        runningBalance += credit - debit;

        const doc = tx.pixPayment?.asaas_payment_id ?? tx.id.slice(0, 8).toUpperCase();
        const fill = i % 2 === 1 ? ALT_ROW_COLOR : null;

        tableBody.push([
          { text: this.fmtDate(tx.occurred_at), fillColor: fill },
          { text: doc, fillColor: fill, fontSize: 8 },
          { text: tx.description ?? tx.category.name, fillColor: fill },
          { text: debit > 0 ? this.fmtMoney(debit) : '', alignment: 'right', fillColor: fill },
          { text: credit > 0 ? this.fmtMoney(credit) : '', alignment: 'right', fillColor: fill },
          { text: this.fmtMoney(runningBalance), alignment: 'right', fillColor: fill },
        ]);
      });

      tableBody.push([
        { text: 'Totais', colSpan: 2, bold: true, fillColor: SUBTOTAL_COLOR },
        {},
        { text: '', fillColor: SUBTOTAL_COLOR },
        { text: this.fmtMoney(catDebits), alignment: 'right', bold: true, fillColor: SUBTOTAL_COLOR },
        { text: this.fmtMoney(catCredits), alignment: 'right', bold: true, fillColor: SUBTOTAL_COLOR },
        { text: this.fmtMoney(runningBalance), alignment: 'right', bold: true, fillColor: SUBTOTAL_COLOR },
      ]);

      grandDebits += catDebits;
      grandCredits += catCredits;

      content.push(
        { text: catName, style: 'catHeader', margin: [0, 14, 0, 2] },
        {
          table: {
            headerRows: 1,
            widths: [55, 90, '*', 70, 70, 70],
            body: tableBody,
          },
          layout: 'lightHorizontalLines',
        },
      );
    }

    content.push({
      margin: [0, 18, 0, 0] as [number, number, number, number],
      table: {
        widths: ['*', 70, 70, 70],
        body: [
          [
            { text: 'Total Geral', bold: true, fillColor: HEADER_COLOR, color: 'white', fontSize: 10 },
            { text: this.fmtMoney(grandDebits), alignment: 'right', bold: true, fillColor: HEADER_COLOR, color: 'white', fontSize: 10 },
            { text: this.fmtMoney(grandCredits), alignment: 'right', bold: true, fillColor: HEADER_COLOR, color: 'white', fontSize: 10 },
            { text: this.fmtMoney(grandCredits - grandDebits), alignment: 'right', bold: true, fillColor: HEADER_COLOR, color: 'white', fontSize: 10 },
          ],
        ],
      },
      layout: 'noBorders',
    });

    return this.docDef(content);
  }

  private buildDiarioDocDef(rows: TxRow[], tenantName: string, start: Date, end: Date): object {
    const tableBody: object[][] = [
      [
        { text: 'Data', style: 'th' },
        { text: 'Conta Contábil', style: 'th' },
        { text: 'Histórico', style: 'th' },
        { text: 'Débito', style: 'th', alignment: 'right' },
        { text: 'Crédito', style: 'th', alignment: 'right' },
        { text: 'Documento', style: 'th' },
      ],
    ];

    let totalDebits = 0;
    let totalCredits = 0;

    rows.forEach((tx, i) => {
      const isIncome = tx.category.type === 'income';
      const amount = Number(tx.amount);
      const debit = isIncome ? 0 : amount;
      const credit = isIncome ? amount : 0;
      totalDebits += debit;
      totalCredits += credit;

      const doc = tx.pixPayment?.asaas_payment_id ?? tx.id.slice(0, 8).toUpperCase();
      const fill = i % 2 === 1 ? ALT_ROW_COLOR : null;

      tableBody.push([
        { text: this.fmtDate(tx.occurred_at), fillColor: fill },
        { text: tx.category.name, fillColor: fill },
        { text: tx.description ?? '', fillColor: fill },
        { text: debit > 0 ? this.fmtMoney(debit) : '', alignment: 'right', fillColor: fill },
        { text: credit > 0 ? this.fmtMoney(credit) : '', alignment: 'right', fillColor: fill },
        { text: doc, fillColor: fill, fontSize: 8 },
      ]);
    });

    tableBody.push([
      { text: 'Total', colSpan: 3, bold: true, fillColor: HEADER_COLOR, color: 'white', fontSize: 10 },
      {},
      {},
      { text: this.fmtMoney(totalDebits), alignment: 'right', bold: true, fillColor: HEADER_COLOR, color: 'white', fontSize: 10 },
      { text: this.fmtMoney(totalCredits), alignment: 'right', bold: true, fillColor: HEADER_COLOR, color: 'white', fontSize: 10 },
      { text: '', fillColor: HEADER_COLOR },
    ]);

    const content: object[] = [
      this.pageHeader(tenantName, 'Diário Contábil', start, end),
      {
        margin: [0, 8, 0, 0] as [number, number, number, number],
        table: {
          headerRows: 1,
          widths: [55, 120, '*', 70, 70, 90],
          body: tableBody,
        },
        layout: 'lightHorizontalLines',
      },
    ];

    return this.docDef(content);
  }

  private pageHeader(tenantName: string, title: string, start: Date, end: Date): object {
    return {
      margin: [0, 0, 0, 8] as [number, number, number, number],
      stack: [
        { text: tenantName, style: 'tenantName' },
        { text: title, style: 'reportTitle' },
        {
          columns: [
            { text: `Período: ${this.fmtDate(start)} a ${this.fmtDate(end)}`, style: 'meta' },
            { text: `Emissão: ${this.fmtDate(new Date())}`, style: 'meta', alignment: 'right' },
          ],
        },
        {
          canvas: [{ type: 'line', x1: 0, y1: 2, x2: 761, y2: 2, lineWidth: 1, lineColor: HEADER_COLOR }],
          margin: [0, 4, 0, 0] as [number, number, number, number],
        },
      ],
    };
  }

  private docDef(content: object[]): object {
    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [40, 50, 40, 50] as [number, number, number, number],
      footer: (currentPage: number, pageCount: number) => ({
        margin: [40, 0, 40, 16],
        columns: [
          { text: `Gerado por Orbien · ${new Date().toLocaleString('pt-BR')}`, style: 'footer' },
          { text: `${currentPage}/${pageCount}`, style: 'footer', alignment: 'right' },
        ],
      }),
      content,
      styles: {
        tenantName: { fontSize: 10, color: '#666666' },
        reportTitle: { fontSize: 18, bold: true, color: HEADER_COLOR, margin: [0, 2, 0, 4] },
        meta: { fontSize: 9, color: '#555555' },
        catHeader: { fontSize: 11, bold: true, color: HEADER_COLOR },
        th: { bold: true, fillColor: HEADER_COLOR, color: 'white', fontSize: 9 },
        footer: { fontSize: 8, color: '#999999' },
      },
      defaultStyle: { font: 'Roboto', fontSize: 9 },
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private parsePeriod(dto: PdfExportRequestDto): { start: Date; end: Date; days: number } {
    const start = new Date(dto.period_start);
    const end = new Date(dto.period_end);
    end.setUTCHours(23, 59, 59, 999);
    const days = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
    return { start, end, days };
  }

  private fmtDate(d: Date): string {
    return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }

  private fmtMoney(n: number): string {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private pdfFilename(type: 'razao' | 'diario', start: Date, end: Date): string {
    const s = start.toISOString().slice(0, 7).replace('-', '');
    const e = end.toISOString().slice(0, 7).replace('-', '');
    const period = s === e ? s : `${s}_${e}`;
    return `orbien_${type}_${period}.pdf`;
  }
}
