import { DrePdfService } from './dre-pdf.service';
import { DreService, DreResult } from './dre.service';
import { PrismaService } from '../prisma/prisma.service';

function buildDre(overrides: Partial<DreResult> = {}): DreResult {
  return {
    period: { start: '2026-01-01', end: '2026-01-31' },
    revenue: { categories: [{ category_name: 'Dízimos', total: 100, count: 2 }], total: 100 },
    expenses: { categories: [{ category_name: 'Aluguel', total: 40, count: 1 }], total: 40 },
    net_result: 60,
    previous_period: {
      period: { start: '2025-12-01', end: '2025-12-31' },
      revenue_total: 90,
      expenses_total: 30,
      net_result: 60,
    },
    ...overrides,
  };
}

function serviceWith(dre: DreResult, tenantName: string | null = 'Igreja X') {
  const client = {
    tenant: { findUnique: jest.fn().mockResolvedValue(tenantName ? { name: tenantName } : null) },
    financialTransaction: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = { client } as unknown as PrismaService;
  const dreService = { buildDre: jest.fn().mockResolvedValue(dre) } as unknown as DreService;
  return { service: new DrePdfService(prisma, dreService), client, dreService };
}

const query = { period_start: '2026-01-01', period_end: '2026-01-31' };

describe('DrePdfService.generatePdf', () => {
  it('gera um PDF (buffer não vazio) a partir do DRE', async () => {
    const { service } = serviceWith(buildDre());

    const buffer = await service.generatePdf('t1', 'c1', query);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // %PDF é a assinatura padrão de todo arquivo PDF válido.
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('usa "Igreja" como nome padrão quando o tenant não tem nome', async () => {
    const { service, dreService } = serviceWith(buildDre(), null);

    await service.generatePdf('t1', 'c1', query);

    expect(dreService.buildDre).toHaveBeenCalledWith('t1', 'c1', query, false);
  });

  it('gera PDF mesmo sem transações em receita e despesa', async () => {
    const empty = buildDre({
      revenue: { categories: [], total: 0 },
      expenses: { categories: [], total: 0 },
    });
    const { service } = serviceWith(empty);

    const buffer = await service.generatePdf('t1', 'c1', query);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('confirma as transações pagas do período — accounting export fecha o período', async () => {
    const { service, client } = serviceWith(buildDre());

    await service.generatePdf('t1', 'c1', query);

    expect(client.financialTransaction.updateMany).toHaveBeenCalledWith({
      where: {
        tenant_id: 't1',
        occurred_at: { gte: new Date('2026-01-01'), lte: expect.any(Date) },
        status: 'paid',
      },
      data: { status: 'confirmed' },
    });
    const call = client.financialTransaction.updateMany.mock.calls[0][0];
    expect(call.where.occurred_at.lte.toISOString()).toBe('2026-01-31T23:59:59.999Z');
  });

  it('inclui congregation_id no filtro de confirmação quando a query pede', async () => {
    const { service, client } = serviceWith(buildDre());

    await service.generatePdf('t1', 'c1', { ...query, congregation_id: 'cong-x' });

    const call = client.financialTransaction.updateMany.mock.calls[0][0];
    expect(call.where.congregation_id).toBe('cong-x');
  });

  it('inclui filtro por cost_center quando a query pede', async () => {
    const { service, client } = serviceWith(buildDre());

    await service.generatePdf('t1', 'c1', { ...query, cost_center: 'Missões' });

    const call = client.financialTransaction.updateMany.mock.calls[0][0];
    expect(call.where.costCenter).toEqual({ name: 'Missões' });
  });

  it('gera PDF com múltiplas categorias de receita e despesa (linhas alternadas)', async () => {
    const many = buildDre({
      revenue: {
        categories: [
          { category_name: 'Dízimos', total: 100, count: 2 },
          { category_name: 'Ofertas', total: 50, count: 1 },
        ],
        total: 150,
      },
      expenses: {
        categories: [
          { category_name: 'Aluguel', total: 40, count: 1 },
          { category_name: 'Água', total: 10, count: 1 },
        ],
        total: 50,
      },
    });
    const { service } = serviceWith(many);

    const buffer = await service.generatePdf('t1', 'c1', query);
    expect(buffer.length).toBeGreaterThan(0);
  });
});

describe('políticas de acesso do pdfmake (module init, whitebox)', () => {
  // dre-pdf.service.ts configura setLocalAccessPolicy(() => false) e
  // setUrlAccessPolicy(() => false) na importação do módulo — bloqueio
  // deliberado de acesso a arquivo local/URL externa em qualquer PDF gerado.
  // require('pdfmake') aqui devolve o MESMO singleton (cache de módulos do
  // Node) já configurado com essas duas closures pelo import do service
  // acima; forçamos o pdfmake a de fato invocá-las para provar o bloqueio.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfmakeLib = require('pdfmake') as {
    createPdf: (def: object, opts: object) => { getBuffer: () => Promise<Buffer> };
  };

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
