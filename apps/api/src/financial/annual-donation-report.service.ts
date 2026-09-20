import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

export type AnnualContribution = {
  occurred_at: Date;
  amount: number;
};

export type AnnualDonationReport = {
  person_id: string;
  person_name: string;
  year: number;
  total: number;
  contributions: AnnualContribution[];
};

export type AnnualDonorSummary = {
  person_id: string;
  person_name: string;
  total: number;
  count: number;
};

function yearRange(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

@Injectable()
export class AnnualDonationReportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mesmo critério de "identificado" que `DonationReceiptService` usa:
   * receita, doador não anônimo e com `donor_person_id`. Sem filtro de
   * `status` — mesmo precedente do `DreService`, que também soma o tenant
   * inteiro sem olhar `status`.
   */
  async buildReport(tenantId: string, personId: string, year: number): Promise<AnnualDonationReport> {
    const person = await this.prisma.client.person.findFirst({
      where: { id: personId, tenant_id: tenantId },
      select: { full_name: true },
    });
    if (!person) throw new NotFoundException('Doador não encontrado');

    const { start, end } = yearRange(year);
    const transactions = await this.prisma.client.financialTransaction.findMany({
      where: {
        tenant_id: tenantId,
        donor_person_id: personId,
        type: TransactionType.income,
        is_anonymous: false,
        occurred_at: { gte: start, lte: end },
      },
      orderBy: { occurred_at: 'asc' },
      select: { occurred_at: true, amount: true },
    });

    const contributions = transactions.map((t) => ({ occurred_at: t.occurred_at, amount: Number(t.amount) }));
    const total = contributions.reduce((sum, c) => sum + c.amount, 0);

    return { person_id: personId, person_name: person.full_name, year, total, contributions };
  }

  async listDonorsForYear(tenantId: string, year: number): Promise<AnnualDonorSummary[]> {
    const { start, end } = yearRange(year);
    const rows = await this.prisma.client.financialTransaction.groupBy({
      by: ['donor_person_id'],
      where: {
        tenant_id: tenantId,
        type: TransactionType.income,
        is_anonymous: false,
        donor_person_id: { not: null },
        occurred_at: { gte: start, lte: end },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const personIds = rows.map((r) => r.donor_person_id as string);
    const people = personIds.length
      ? await this.prisma.client.person.findMany({
          where: { id: { in: personIds } },
          select: { id: true, full_name: true },
        })
      : [];
    const nameMap = new Map(people.map((p) => [p.id, p.full_name]));

    return rows
      .map((r) => ({
        person_id: r.donor_person_id as string,
        person_name: nameMap.get(r.donor_person_id as string) ?? r.donor_person_id!,
        total: Number(r._sum.amount ?? 0),
        count: r._count._all,
      }))
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Gerado sob demanda, como `DrePdfService.generatePdf` — sem persistir em
   * R2 nem gravar registro no banco. Diferente do recibo por doação (que
   * nasce de um pagamento já confirmado e imutável), o carnê anual é uma
   * soma recalculável a qualquer momento a partir de `FinancialTransaction`;
   * gerar sob demanda evita migration + script de RLS novos (ver `CLAUDE.md`
   * sobre a ordem em `bootstrap-db.sh`) só para guardar um PDF que o
   * tesoureiro pode reemitir a qualquer hora com o mesmo resultado.
   */
  async generatePdf(tenantId: string, personId: string, year: number): Promise<Buffer> {
    const [report, tenant] = await Promise.all([
      this.buildReport(tenantId, personId, year),
      this.prisma.client.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    ]);

    return pdfmakeLib.createPdf(this.buildDocDef(report, tenant?.name ?? 'Igreja'), {}).getBuffer();
  }

  private buildDocDef(report: AnnualDonationReport, churchName: string): object {
    return {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60] as [number, number, number, number],
      content: [
        {
          margin: [0, 0, 0, 20] as [number, number, number, number],
          stack: [
            { text: churchName, style: 'churchName' },
            { text: 'Carnê do Dizimista', style: 'title' },
            { text: `Relatório Anual de Contribuições — ${report.year}`, style: 'subtitle' },
          ],
        },
        {
          margin: [0, 0, 0, 16] as [number, number, number, number],
          text: `Doador: ${report.person_name}`,
          style: 'body',
        },
        {
          table: {
            headerRows: 1,
            widths: ['*', 100],
            body: [
              [
                { text: 'Data', style: 'th' },
                { text: 'Valor (R$)', style: 'th', alignment: 'right' },
              ],
              ...report.contributions.map((c, i) => [
                { text: this.fmtDate(c.occurred_at), fillColor: i % 2 === 1 ? '#F8F9FA' : null },
                { text: this.fmtMoney(c.amount), alignment: 'right', fillColor: i % 2 === 1 ? '#F8F9FA' : null },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
        {
          margin: [0, 16, 0, 0] as [number, number, number, number],
          table: {
            widths: ['*', 100],
            body: [
              [
                { text: `Total em ${report.year}`, bold: true, fontSize: 12, fillColor: HEADER_COLOR, color: 'white' },
                {
                  text: this.fmtMoney(report.total),
                  bold: true,
                  fontSize: 12,
                  alignment: 'right',
                  fillColor: HEADER_COLOR,
                  color: 'white',
                },
              ],
            ],
          },
          layout: 'noBorders',
        },
        {
          margin: [0, 24, 0, 0] as [number, number, number, number],
          text: `Emitido em ${this.fmtDate(new Date())} por Orbien. Este documento não é nota fiscal — resume as contribuições identificadas recebidas por ${churchName} no ano-calendário para uso na declaração de Imposto de Renda do doador.`,
          style: 'meta',
        },
      ],
      styles: {
        churchName: { fontSize: 10, color: '#666666' },
        title: { fontSize: 18, bold: true, color: HEADER_COLOR, margin: [0, 2, 0, 2] },
        subtitle: { fontSize: 11, color: '#555555' },
        body: { fontSize: 11, bold: true },
        th: { bold: true, fillColor: HEADER_COLOR, color: 'white', fontSize: 9 },
        meta: { fontSize: 9, color: '#999999' },
      },
      defaultStyle: { font: 'Roboto', fontSize: 10 },
    };
  }

  private fmtDate(d: Date): string {
    return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }

  private fmtMoney(n: number): string {
    return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
