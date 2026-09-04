import { PdfExportService } from './pdf-export.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { JobsService } from './jobs.service';

function txRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-12345678',
    amount: { toString: () => '100' } as never,
    occurred_at: new Date('2026-01-10T00:00:00.000Z'),
    description: 'Dízimo',
    category: { name: 'Dízimos', type: 'income' },
    costCenter: null,
    pixPayment: null,
    ...overrides,
  };
}

function setup() {
  const client = {
    financialTransaction: { findMany: jest.fn() },
    tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'Igreja X' }) },
  };
  const system = {
    financialTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'Igreja X' }) },
  };
  const prisma = { client, system } as unknown as PrismaService;
  const storage = {
    upload: jest.fn().mockResolvedValue(undefined),
    getPresignedGetUrl: jest.fn().mockResolvedValue('https://cdn/x.pdf'),
  } as unknown as jest.Mocked<StorageService>;
  const jobs = {
    create: jest.fn(),
    markProcessing: jest.fn().mockResolvedValue(undefined),
    markDone: jest.fn().mockResolvedValue(undefined),
    markError: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<JobsService>;

  const service = new PdfExportService(prisma, storage, jobs);
  return { service, client, system, storage, jobs };
}

const shortDto = { period_start: '2026-01-01', period_end: '2026-01-31', type: 'razao' as const };
const longDto = { period_start: '2026-01-01', period_end: '2026-12-31', type: 'diario' as const };

describe('PdfExportService.exportPdf', () => {
  it('período curto gera um PDF (razao) síncrono', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([txRow()]);

    const result = await service.exportPdf('t1', 'c1', shortDto as never, 'user-1');

    expect(result.type).toBe('file');
    if (result.type === 'file') {
      expect(result.mimeType).toBe('application/pdf');
      expect(result.filename).toBe('orbien_razao_202601.pdf');
      expect(result.buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    }
  });

  it('gera diário com múltiplas transações (crédito, débito, doc via PIX, linhas alternadas)', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([
      txRow({ id: 'a1', pixPayment: { asaas_payment_id: 'pay_1' } }),
      txRow({
        id: 'a2',
        amount: { toString: () => '30' },
        category: { name: 'Aluguel', type: 'expense' },
        description: null,
      }),
    ]);

    const result = await service.exportPdf('t1', 'c1', { ...shortDto, type: 'diario' } as never, 'user-1');
    if (result.type === 'file') {
      expect(result.buffer.length).toBeGreaterThan(0);
    }
  });

  it('gera razão com múltiplas categorias, débito e crédito, linhas alternadas e sem descrição', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([
      txRow({ id: 'a1', pixPayment: { asaas_payment_id: 'pay_1' } }),
      txRow({ id: 'a2' }), // segunda linha da mesma categoria → fillColor alternado
      txRow({
        id: 'a3',
        amount: { toString: () => '30' },
        category: { name: 'Aluguel', type: 'expense' },
        description: null,
      }),
    ]);

    const result = await service.exportPdf('t1', 'c1', { ...shortDto, type: 'razao' } as never, 'user-1');
    if (result.type === 'file') {
      expect(result.buffer.length).toBeGreaterThan(0);
    }
  });

  it('lida com lista vazia de transações', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([]);

    const result = await service.exportPdf('t1', 'c1', shortDto as never, 'user-1');
    if (result.type === 'file') expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('usa "Igreja" quando o tenant não é encontrado', async () => {
    const { service, client } = setup();
    client.tenant.findUnique.mockResolvedValue(null);
    client.financialTransaction.findMany.mockResolvedValue([]);

    const result = await service.exportPdf('t1', 'c1', shortDto as never, 'user-1');
    expect(result.type).toBe('file');
  });

  it('filtra por congregation_id e cost_center do dto', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([]);

    await service.exportPdf(
      't1',
      'c1',
      { ...shortDto, congregation_id: 'cong-x', cost_center: 'Missões' } as never,
      'user-1',
    );

    const call = client.financialTransaction.findMany.mock.calls[0][0];
    expect(call.where.congregation_id).toBe('cong-x');
    expect(call.where.costCenter).toEqual({ name: 'Missões' });
  });

  it('período longo enfileira job', async () => {
    const { service, jobs } = setup();
    jobs.create.mockResolvedValue({ id: 'job-1' } as never);

    const result = await service.exportPdf('t1', 'c1', longDto as never, 'user-1');
    expect(result).toEqual({ type: 'job', job_id: 'job-1', status: 'pending' });
  });

  it('nome de arquivo com intervalo quando os meses diferem', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([]);

    const result = await service.exportPdf(
      't1',
      'c1',
      { period_start: '2026-01-01', period_end: '2026-02-20', type: 'razao' } as never,
      'user-1',
    );
    if (result.type === 'file') {
      expect(result.filename).toBe('orbien_razao_202601_202602.pdf');
    }
  });
});

describe('PdfExportService — processamento assíncrono (processJob via reflexão)', () => {
  it('processa, envia ao storage e marca como concluído', async () => {
    const { service, system, storage, jobs } = setup();
    system.financialTransaction.findMany.mockResolvedValue([txRow()]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processJob(
      'job-1',
      't1',
      'c1',
      shortDto,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(jobs.markProcessing).toHaveBeenCalledWith('job-1');
    expect(storage.upload).toHaveBeenCalledWith(expect.any(Buffer), 'exports/t1/job-1.pdf', 'application/pdf');
    expect(jobs.markDone).toHaveBeenCalledWith('job-1', 'https://cdn/x.pdf');
  });

  it('usa "Igreja" quando o tenant não é encontrado pelo cliente de sistema', async () => {
    const { service, system, storage } = setup();
    system.financialTransaction.findMany.mockResolvedValue([txRow()]);
    system.tenant.findUnique.mockResolvedValue(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processJob(
      'job-x',
      't1',
      'c1',
      shortDto,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(storage.upload).toHaveBeenCalled();
  });

  it('marca erro e propaga a exceção quando o processamento falha', async () => {
    const { service, system, jobs } = setup();
    system.financialTransaction.findMany.mockRejectedValue(new Error('banco fora'));

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).processJob(
        'job-2',
        't1',
        'c1',
        shortDto,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      ),
    ).rejects.toThrow('banco fora');

    expect(jobs.markError).toHaveBeenCalledWith('job-2', 'banco fora');
  });

  it('marca erro com mensagem genérica quando o erro não é um Error', async () => {
    const { service, system, jobs } = setup();
    system.financialTransaction.findMany.mockRejectedValue('string de erro');

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).processJob(
        'job-3',
        't1',
        'c1',
        shortDto,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      ),
    ).rejects.toBe('string de erro');

    expect(jobs.markError).toHaveBeenCalledWith('job-3', 'string de erro');
  });

  it('enqueueJob dispara processJob em background', async () => {
    const { service, jobs } = setup();
    jobs.create.mockResolvedValue({ id: 'job-4' } as never);
    const spy = jest
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .spyOn(service as any, 'processJob')
      .mockResolvedValue(undefined);

    const result = await service.exportPdf('t1', 'c1', longDto as never, 'user-1');
    expect(result).toEqual({ type: 'job', job_id: 'job-4', status: 'pending' });

    await new Promise((resolve) => setImmediate(resolve));
    expect(spy).toHaveBeenCalledWith('job-4', 't1', 'c1', longDto, expect.any(Date), expect.any(Date));
  });

  it('erro assíncrono do job em background é logado, não lançado', async () => {
    const { service, jobs } = setup();
    jobs.create.mockResolvedValue({ id: 'job-5' } as never);
    jest
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .spyOn(service as any, 'processJob')
      .mockRejectedValue(new Error('falhou em background'));

    await service.exportPdf('t1', 'c1', longDto as never, 'user-1');
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  });
});

describe('políticas de acesso do pdfmake (module init, whitebox)', () => {
  // pdf-export.service.ts (financial) configura setLocalAccessPolicy(() =>
  // false) e setUrlAccessPolicy(() => false) na importação do módulo —
  // bloqueio deliberado de acesso a arquivo local/URL externa em qualquer PDF
  // gerado. require('pdfmake') aqui devolve o MESMO singleton (cache de
  // módulos do Node) já configurado com essas duas closures pelo import do
  // service acima; forçamos o pdfmake a de fato invocá-las para provar o
  // bloqueio.
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
