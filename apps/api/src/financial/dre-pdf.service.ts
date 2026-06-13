import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DreResult, DreService, DreQuery } from './dre.service';

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
const INCOME_COLOR = '#E8F5E9';
const EXPENSE_COLOR = '#FFEBEE';

@Injectable()
export class DrePdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dreService: DreService,
  ) {}

  async generatePdf(
    tenantId: string,
    congregationId: string,
    query: DreQuery,
  ): Promise<Buffer> {
    const [dre, tenant] = await Promise.all([
      this.dreService.buildDre(tenantId, congregationId, query, false),
      this.prisma.client.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    ]);
    return pdfmakeLib.createPdf(this.buildDocDef(dre, tenant?.name ?? 'Igreja'), {}).getBuffer();
  }

  private buildDocDef(dre: DreResult, tenantName: string): object {
    const periodLabel = `${this.fmtDate(dre.period.start)} a ${this.fmtDate(dre.period.end)}`;

    const content: object[] = [
      // ── Page header ─────────────────────────────────────────────────────
      {
        margin: [0, 0, 0, 12] as [number, number, number, number],
        stack: [
          { text: tenantName, style: 'tenantName' },
          { text: 'Demonstrativo de Resultados (DRE)', style: 'reportTitle' },
          {
            columns: [
              { text: `Período: ${periodLabel}`, style: 'meta' },
              { text: `Emissão: ${this.fmtDate(new Date().toISOString().slice(0, 10))}`, style: 'meta', alignment: 'right' },
            ],
          },
          {
            canvas: [{ type: 'line', x1: 0, y1: 2, x2: 515, y2: 2, lineWidth: 1, lineColor: HEADER_COLOR }],
            margin: [0, 4, 0, 0] as [number, number, number, number],
          },
        ],
      },

      // ── Receitas ─────────────────────────────────────────────────────────
      { text: 'Receitas', style: 'sectionHeader', margin: [0, 8, 0, 4] as [number, number, number, number] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 100],
          body: [
            [{ text: 'Categoria', style: 'th' }, { text: 'Total (R$)', style: 'th', alignment: 'right' }],
            ...dre.revenue.categories.map((c, i) => [
              { text: c.category_name, fillColor: i % 2 === 1 ? '#F8F9FA' : null },
              { text: this.fmtMoney(c.total), alignment: 'right', fillColor: i % 2 === 1 ? '#F8F9FA' : null },
            ]),
            [
              { text: 'Total Receitas', bold: true, fillColor: INCOME_COLOR },
              { text: this.fmtMoney(dre.revenue.total), bold: true, alignment: 'right', fillColor: INCOME_COLOR },
            ],
          ],
        },
        layout: 'lightHorizontalLines',
      },

      // ── Despesas ──────────────────────────────────────────────────────────
      { text: 'Despesas', style: 'sectionHeader', margin: [0, 16, 0, 4] as [number, number, number, number] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 100],
          body: [
            [{ text: 'Categoria', style: 'th' }, { text: 'Total (R$)', style: 'th', alignment: 'right' }],
            ...dre.expenses.categories.map((c, i) => [
              { text: c.category_name, fillColor: i % 2 === 1 ? '#F8F9FA' : null },
              { text: this.fmtMoney(c.total), alignment: 'right', fillColor: i % 2 === 1 ? '#F8F9FA' : null },
            ]),
            [
              { text: 'Total Despesas', bold: true, fillColor: EXPENSE_COLOR },
              { text: this.fmtMoney(dre.expenses.total), bold: true, alignment: 'right', fillColor: EXPENSE_COLOR },
            ],
          ],
        },
        layout: 'lightHorizontalLines',
      },

      // ── Resultado líquido ─────────────────────────────────────────────────
      {
        margin: [0, 16, 0, 0] as [number, number, number, number],
        table: {
          widths: ['*', 100],
          body: [[
            { text: 'Resultado Líquido', bold: true, fontSize: 12, fillColor: HEADER_COLOR, color: 'white' },
            { text: this.fmtMoney(dre.net_result), bold: true, fontSize: 12, alignment: 'right', fillColor: HEADER_COLOR, color: 'white' },
          ]],
        },
        layout: 'noBorders',
      },

      // ── Período anterior ──────────────────────────────────────────────────
      { text: 'Período Anterior', style: 'sectionHeader', margin: [0, 20, 0, 4] as [number, number, number, number] },
      {
        table: {
          widths: ['*', 100],
          body: [
            [{ text: 'Período', style: 'th' }, { text: 'Resultado Líquido (R$)', style: 'th', alignment: 'right' }],
            [
              { text: `${this.fmtDate(dre.previous_period.period.start)} a ${this.fmtDate(dre.previous_period.period.end)}` },
              { text: this.fmtMoney(dre.previous_period.net_result), alignment: 'right' },
            ],
          ],
        },
        layout: 'lightHorizontalLines',
      },
    ];

    return {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60] as [number, number, number, number],
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
        sectionHeader: { fontSize: 12, bold: true, color: HEADER_COLOR },
        th: { bold: true, fillColor: HEADER_COLOR, color: 'white', fontSize: 9 },
        footer: { fontSize: 8, color: '#999999' },
      },
      defaultStyle: { font: 'Roboto', fontSize: 10 },
    };
  }

  private fmtDate(s: string): string {
    return new Date(s).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }

  private fmtMoney(n: number): string {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
