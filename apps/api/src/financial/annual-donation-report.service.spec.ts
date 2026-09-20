import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AnnualDonationReportService } from './annual-donation-report.service';
// Importado só para o describe whitebox abaixo forçar o pdfmake a de fato
// invocar as duas closures que este service registra na importação
// (setLocalAccessPolicy/setUrlAccessPolicy) — mesmo padrão de
// `donation-receipts.service.spec.ts` e `dre-pdf.service.spec.ts`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmakeLib = require('pdfmake') as {
  createPdf: (def: object, opts: object) => { getBuffer: () => Promise<Buffer> };
};
import { PrismaService } from '../prisma/prisma.service';

type Opts = {
  person?: { full_name: string } | null;
  transactions?: { occurred_at: Date; amount: Prisma.Decimal }[];
  tenant?: { name: string } | null;
  groupByRows?: { donor_person_id: string | null; _sum: { amount: Prisma.Decimal | null }; _count: { _all: number } }[];
  people?: { id: string; full_name: string }[];
};

function harness(opts: Opts = {}) {
  const client = {
    person: {
      findFirst: jest.fn().mockResolvedValue(opts.person === undefined ? { full_name: 'Maria' } : opts.person),
      findMany: jest.fn().mockResolvedValue(opts.people ?? []),
    },
    financialTransaction: {
      findMany: jest.fn().mockResolvedValue(
        opts.transactions === undefined
          ? [
              { occurred_at: new Date('2026-02-10T12:00:00.000Z'), amount: new Prisma.Decimal('100.00') },
              { occurred_at: new Date('2026-05-10T12:00:00.000Z'), amount: new Prisma.Decimal('50.50') },
            ]
          : opts.transactions,
      ),
      groupBy: jest.fn().mockResolvedValue(opts.groupByRows ?? []),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue(opts.tenant === undefined ? { name: 'Igreja Central' } : opts.tenant),
    },
  };

  const prisma = { client } as unknown as PrismaService;

  return { service: new AnnualDonationReportService(prisma), client };
}

describe('AnnualDonationReportService.buildReport', () => {
  it('soma as contribuições identificadas do doador no ano', async () => {
    const { service } = harness();

    const report = await service.buildReport('t1', 'pessoa-1', 2026);

    expect(report.person_name).toBe('Maria');
    expect(report.total).toBe(150.5);
    expect(report.contributions).toEqual([
      { occurred_at: new Date('2026-02-10T12:00:00.000Z'), amount: 100 },
      { occurred_at: new Date('2026-05-10T12:00:00.000Z'), amount: 50.5 },
    ]);
  });

  it('filtra por doador, tipo receita, não anônimo e pelo ano-calendário', async () => {
    const { service, client } = harness();

    await service.buildReport('t1', 'pessoa-1', 2026);

    expect(client.financialTransaction.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: 't1',
        donor_person_id: 'pessoa-1',
        type: 'income',
        is_anonymous: false,
        occurred_at: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-12-31T23:59:59.999Z') },
      },
      orderBy: { occurred_at: 'asc' },
      select: { occurred_at: true, amount: true },
    });
  });

  it('doador inexistente (ou de outro tenant) vira 404', async () => {
    const { service } = harness({ person: null });

    await expect(service.buildReport('t1', 'nao-existe', 2026)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sem contribuições no ano, devolve total zero e lista vazia', async () => {
    const { service } = harness({ transactions: [] });

    const report = await service.buildReport('t1', 'pessoa-1', 2026);

    expect(report.total).toBe(0);
    expect(report.contributions).toEqual([]);
  });
});

describe('AnnualDonationReportService.listDonorsForYear', () => {
  it('agrupa por doador e resolve o nome de cada pessoa', async () => {
    const { service } = harness({
      groupByRows: [
        { donor_person_id: 'pessoa-1', _sum: { amount: new Prisma.Decimal('300.00') }, _count: { _all: 3 } },
        { donor_person_id: 'pessoa-2', _sum: { amount: new Prisma.Decimal('100.00') }, _count: { _all: 1 } },
      ],
      people: [
        { id: 'pessoa-1', full_name: 'Maria' },
        { id: 'pessoa-2', full_name: 'João' },
      ],
    });

    const result = await service.listDonorsForYear('t1', 2026);

    expect(result).toEqual([
      { person_id: 'pessoa-1', person_name: 'Maria', total: 300, count: 3 },
      { person_id: 'pessoa-2', person_name: 'João', total: 100, count: 1 },
    ]);
  });

  it('ordena do maior para o menor total', async () => {
    const { service } = harness({
      groupByRows: [
        { donor_person_id: 'pessoa-1', _sum: { amount: new Prisma.Decimal('50.00') }, _count: { _all: 1 } },
        { donor_person_id: 'pessoa-2', _sum: { amount: new Prisma.Decimal('500.00') }, _count: { _all: 5 } },
      ],
      people: [
        { id: 'pessoa-1', full_name: 'Maria' },
        { id: 'pessoa-2', full_name: 'João' },
      ],
    });

    const result = await service.listDonorsForYear('t1', 2026);

    expect(result.map((r) => r.person_id)).toEqual(['pessoa-2', 'pessoa-1']);
  });

  it('sem doadores no ano, não consulta pessoas e devolve lista vazia', async () => {
    const { service, client } = harness({ groupByRows: [] });

    const result = await service.listDonorsForYear('t1', 2026);

    expect(result).toEqual([]);
    expect(client.person.findMany).not.toHaveBeenCalled();
  });
});

describe('AnnualDonationReportService.generatePdf', () => {
  it('gera um PDF (buffer não vazio) a partir do relatório anual', async () => {
    const { service } = harness();

    const buffer = await service.generatePdf('t1', 'pessoa-1', 2026);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('usa "Igreja" como nome padrão quando o tenant não tem nome', async () => {
    const { service } = harness({ tenant: null });

    const buffer = await service.generatePdf('t1', 'pessoa-1', 2026);

    expect(buffer.length).toBeGreaterThan(0);
  });

  it('gera PDF mesmo sem nenhuma contribuição no ano', async () => {
    const { service } = harness({ transactions: [] });

    const buffer = await service.generatePdf('t1', 'pessoa-1', 2026);

    expect(buffer.length).toBeGreaterThan(0);
  });

  it('doador inexistente propaga o 404 em vez de gerar PDF', async () => {
    const { service } = harness({ person: null });

    await expect(service.generatePdf('t1', 'nao-existe', 2026)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('políticas de acesso do pdfmake (module init, whitebox)', () => {
  // Mesmo bloqueio deliberado de `donation-receipts.service.ts` e
  // `dre-pdf.service.ts`: acesso a arquivo local/URL externa em qualquer PDF.
  it('bloqueia imagem apontando para caminho local/não-data (setLocalAccessPolicy)', async () => {
    const doc = pdfmakeLib.createPdf({ content: [{ image: './local/nao-existe.png' }] }, {});

    await expect(doc.getBuffer()).rejects.toThrow(/Access to local file denied/);
  });

  it('bloqueia imagem apontando para URL externa (setUrlAccessPolicy)', async () => {
    const doc = pdfmakeLib.createPdf(
      { content: [{ image: 'logo' }], images: { logo: 'https://example.com/logo.png' } },
      {},
    );

    await expect(doc.getBuffer()).rejects.toThrow(/Access to URL denied/);
  });
});
