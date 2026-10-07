import { DrePdfService } from './dre-pdf.service';
import { DreService, DreResult } from './dre.service';
import { PrismaService } from '../prisma/prisma.service';

function buildDre(overrides: Partial<DreResult> = {}): DreResult {
  return {
    period: { start: '2026-01-01', end: '2026-01-31' },
    revenue: { categories: [{ category_name: 'Dízimos', total: 100, count: 2 }], total: 100 },
    expenses: { categories: [{ category_name: 'Aluguel', total: 40, count: 1 }], total: 40 },
    net_result: 60,
    pending: { revenue_total: 0, expenses_total: 0 },
    previous_period: {
      period: { start: '2025-12-01', end: '2025-12-31' },
      revenue_total: 90,
      expenses_total: 30,
      net_result: 60,
    },
    ...overrides,
  };
}

function serviceWith(
  dre: DreResult,
  tenantName: string | null = 'Igreja X',
  costCenter: { name: string } | null = null,
) {
  // Qualquer acesso a `financialTransaction` (leitura ou escrita) é registrado:
  // o PDF recebe o DRE já pronto do DreService e NÃO pode tocar lançamento.
  const ftAccess: string[] = [];
  const client = {
    tenant: { findUnique: jest.fn().mockResolvedValue(tenantName ? { name: tenantName } : null) },
    costCenter: { findFirst: jest.fn().mockResolvedValue(costCenter) },
    financialTransaction: new Proxy(
      {},
      {
        get: (_t, prop) => {
          ftAccess.push(String(prop));
          return jest.fn().mockResolvedValue({ count: 0 });
        },
      },
    ),
  };
  const prisma = { client } as unknown as PrismaService;
  const dreService = { buildDre: jest.fn().mockResolvedValue(dre) } as unknown as DreService;
  return { service: new DrePdfService(prisma, dreService), client, dreService, ftAccess };
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

/** Captura o docDef que o serviço entrega ao pdfmake e devolve todo o texto dele. */
async function renderedText(
  run: () => Promise<Buffer>,
): Promise<{ text: string; buffer: Buffer }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lib = require('pdfmake') as { createPdf: (def: object, opts: object) => unknown };
  const spy = jest.spyOn(lib, 'createPdf');
  try {
    const buffer = await run();
    const def = spy.mock.calls[0]?.[0];
    return { text: JSON.stringify(def), buffer };
  } finally {
    spy.mockRestore();
  }
}

describe('DrePdfService — somente leitura (DRE-05)', () => {
  it('não toca em nenhum lançamento: nem leitura nem escrita (update/updateMany/...)', async () => {
    const { service, ftAccess } = serviceWith(buildDre());

    await service.generatePdf('t1', 'c1', query);

    expect(ftAccess).toEqual([]);
  });

  it('gerar duas vezes seguidas continua sem tocar em lançamento e devolve PDF nas duas', async () => {
    const { service, ftAccess } = serviceWith(buildDre());

    const first = await service.generatePdf('t1', 'c1', query);
    const second = await service.generatePdf('t1', 'c1', query);

    expect(ftAccess).toEqual([]);
    expect(first.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(second.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });
});

describe('DrePdfService — Lucro/Prejuízo (DRE-06)', () => {
  it('net > 0 → "Lucro do período" com o valor', async () => {
    const { service } = serviceWith(buildDre({ net_result: 1234.5 }));

    const { text } = await renderedText(() => service.generatePdf('t1', 'c1', query));

    expect(text).toContain('Lucro do período');
    expect(text).toContain('1.234,50');
    expect(text).not.toContain('Prejuízo do período');
    expect(text).not.toContain('Resultado zerado');
  });

  it('net < 0 → "Prejuízo do período"', async () => {
    const { service } = serviceWith(buildDre({ net_result: -20 }));

    const { text } = await renderedText(() => service.generatePdf('t1', 'c1', query));

    expect(text).toContain('Prejuízo do período');
    expect(text).not.toContain('Lucro do período');
    expect(text).not.toContain('Resultado zerado');
  });

  it('net = 0 → "Resultado zerado"', async () => {
    const { service } = serviceWith(buildDre({ net_result: 0 }));

    const { text } = await renderedText(() => service.generatePdf('t1', 'c1', query));

    expect(text).toContain('Resultado zerado');
    expect(text).not.toContain('Lucro do período');
    expect(text).not.toContain('Prejuízo do período');
  });

  it('traz a linha "A realizar" com receitas e despesas pendentes', async () => {
    const { service } = serviceWith(
      buildDre({ pending: { revenue_total: 230.5, expenses_total: 80.25 } }),
    );

    const { text } = await renderedText(() => service.generatePdf('t1', 'c1', query));

    expect(text).toContain('A realizar');
    expect(text).toContain('230,50');
    expect(text).toContain('80,25');
  });
});

describe('DrePdfService — recorte de centro de custo no cabeçalho (DRE-06)', () => {
  const UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

  it('sem filtro de centro, o cabeçalho não declara recorte', async () => {
    const { service } = serviceWith(buildDre());

    const { text } = await renderedText(() => service.generatePdf('t1', 'c1', query));

    expect(text).not.toContain('Centro de custo:');
  });

  it('cost_center_id UUID → nome do centro', async () => {
    const { service, client } = serviceWith(buildDre(), 'Igreja X', { name: 'Missões' });

    const { text } = await renderedText(() =>
      service.generatePdf('t1', 'c1', { ...query, cost_center_id: UUID }),
    );

    expect(client.costCenter.findFirst).toHaveBeenCalledWith({
      where: { id: UUID, tenant_id: 't1' },
      select: { name: true },
    });
    expect(text).toContain('Centro de custo: Missões');
  });

  it('cost_center_id "none" → "Sem centro de custo", sem consultar o banco', async () => {
    const { service, client } = serviceWith(buildDre());

    const { text } = await renderedText(() =>
      service.generatePdf('t1', 'c1', { ...query, cost_center_id: 'none' }),
    );

    expect(text).toContain('Centro de custo: Sem centro de custo');
    expect(client.costCenter.findFirst).not.toHaveBeenCalled();
  });

  it('filtro só por nome (compatibilidade) → o próprio nome', async () => {
    const { service } = serviceWith(buildDre());

    const { text } = await renderedText(() =>
      service.generatePdf('t1', 'c1', { ...query, cost_center: 'Templo' }),
    );

    expect(text).toContain('Centro de custo: Templo');
  });

  it('cost_center_id vence o nome também no cabeçalho', async () => {
    const { service } = serviceWith(buildDre(), 'Igreja X', { name: 'Missões' });

    const { text } = await renderedText(() =>
      service.generatePdf('t1', 'c1', { ...query, cost_center_id: UUID, cost_center: 'Templo' }),
    );

    expect(text).toContain('Centro de custo: Missões');
    expect(text).not.toContain('Templo');
  });

  it('UUID que não existe no tenant (RLS) não vaza nome nem quebra o PDF', async () => {
    const { service } = serviceWith(buildDre(), 'Igreja X', null);

    const { text, buffer } = await renderedText(() =>
      service.generatePdf('t1', 'c1', { ...query, cost_center_id: UUID }),
    );

    expect(text).toContain('Centro de custo: não encontrado');
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
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
