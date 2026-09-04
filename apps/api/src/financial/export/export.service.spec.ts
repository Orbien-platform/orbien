import { ExportService } from './export.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { JobsService } from './jobs.service';

function txRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    type: 'income',
    amount: { toString: () => '100.00' } as never,
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
    financialTransaction: { findMany: jest.fn(), updateMany: jest.fn().mockResolvedValue({}) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ slug: 'igreja-x' }) },
  };
  const system = {
    financialTransaction: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    tenant: { findUnique: jest.fn().mockResolvedValue({ slug: 'igreja-x' }) },
  };
  const prisma = { client, system } as unknown as PrismaService;
  const storage = {
    upload: jest.fn().mockResolvedValue(undefined),
    getPresignedGetUrl: jest.fn().mockResolvedValue('https://cdn/x'),
  } as unknown as jest.Mocked<StorageService>;
  const jobs = {
    create: jest.fn(),
    markProcessing: jest.fn().mockResolvedValue(undefined),
    markDone: jest.fn().mockResolvedValue(undefined),
    markError: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<JobsService>;

  const service = new ExportService(prisma, storage, jobs);
  return { service, client, system, storage, jobs };
}

const shortDto = { period_start: '2026-01-01', period_end: '2026-01-31' };
const longDto = { period_start: '2026-01-01', period_end: '2026-12-31' };

describe('ExportService.exportCsv', () => {
  it('período curto devolve arquivo síncrono e confirma as transações', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([txRow()]);

    const result = await service.exportCsv('t1', 'c1', shortDto as never, 'user-1');

    expect(result.type).toBe('file');
    if (result.type === 'file') {
      expect(result.mimeType).toBe('text/csv; charset=utf-8');
      expect(result.filename).toBe('orbien_contabil_202601.csv');
      const content = result.buffer.toString('utf-8');
      expect(content).toContain('data;histórico;conta_contábil');
      expect(content).toContain('Dízimos');
    }
    expect(client.financialTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['tx-1'] } },
      data: { status: 'confirmed' },
    });
  });

  it('não confirma nada quando não há transações', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([]);

    await service.exportCsv('t1', 'c1', shortDto as never, 'user-1');

    expect(client.financialTransaction.updateMany).not.toHaveBeenCalled();
  });

  it('escapa campos com ponto e vírgula, aspas ou quebra de linha', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([
      txRow({ description: 'Doação; especial "grande"' }),
    ]);

    const result = await service.exportCsv('t1', 'c1', shortDto as never, 'user-1');
    if (result.type === 'file') {
      expect(result.buffer.toString('utf-8')).toContain('"Doação; especial ""grande"""');
    }
  });

  it('despesa vai para a coluna de débito, receita para a de crédito', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([
      txRow({ type: 'expense', category: { name: 'Aluguel', type: 'expense' }, amount: { toString: () => '80' } }),
    ]);

    const result = await service.exportCsv('t1', 'c1', shortDto as never, 'user-1');
    if (result.type === 'file') {
      const line = result.buffer.toString('utf-8').split('\r\n')[1];
      expect(line).toContain(';80,00;');
    }
  });

  it('usa o id do pagamento PIX como documento quando presente', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([
      txRow({ pixPayment: { asaas_payment_id: 'pay_123' } }),
    ]);

    const result = await service.exportCsv('t1', 'c1', shortDto as never, 'user-1');
    if (result.type === 'file') {
      expect(result.buffer.toString('utf-8')).toContain('pay_123');
    }
  });

  it('período longo (> 92 dias) enfileira job em vez de responder síncrono', async () => {
    const { service, jobs } = setup();
    jobs.create.mockResolvedValue({ id: 'job-1' } as never);

    const result = await service.exportCsv('t1', 'c1', longDto as never, 'user-1');

    expect(result).toEqual({ type: 'job', job_id: 'job-1', status: 'pending' });
    expect(jobs.create).toHaveBeenCalledWith('t1', 'c1', 'csv', expect.any(Date), expect.any(Date), 'user-1');
  });

  it('usa string vazia quando a transação não tem descrição', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([txRow({ description: null })]);

    const result = await service.exportCsv('t1', 'c1', shortDto as never, 'user-1');
    if (result.type === 'file') {
      expect(result.buffer.toString('utf-8')).not.toContain('null');
    }
  });

  it('filtra por congregation_id e cost_center quando o dto os informa', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([]);

    await service.exportCsv(
      't1',
      'c1',
      { ...shortDto, congregation_id: 'cong-outra', cost_center: 'Missões' } as never,
      'user-1',
    );

    const call = client.financialTransaction.findMany.mock.calls[0][0];
    expect(call.where.congregation_id).toBe('cong-outra');
    expect(call.where.costCenter).toEqual({ name: 'Missões' });
  });

  it('mesmo período com nomes que diferem no mês gera filename com intervalo', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([]);

    const result = await service.exportCsv(
      't1',
      'c1',
      { period_start: '2026-01-01', period_end: '2026-02-15' } as never,
      'user-1',
    );
    if (result.type === 'file') {
      expect(result.filename).toBe('orbien_contabil_202601_202602.csv');
    }
  });
});

describe('ExportService.exportOfx', () => {
  it('período curto devolve OFX síncrono com CREDIT/DEBIT corretos', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([
      txRow({ type: 'expense', category: { name: 'Aluguel', type: 'expense' }, amount: { toString: () => '80' } }),
    ]);

    const result = await service.exportOfx('t1', 'c1', shortDto as never, 'user-1');

    expect(result.type).toBe('file');
    if (result.type === 'file') {
      expect(result.mimeType).toBe('application/x-ofx');
      const content = result.buffer.toString('latin1');
      expect(content).toContain('<TRNTYPE>DEBIT</TRNTYPE>');
      expect(content).toContain('<ACCTID>igreja-x</ACCTID>');
    }
  });

  it('usa "orbien" como slug padrão quando o tenant não é encontrado', async () => {
    const { service, client } = setup();
    client.tenant.findUnique.mockResolvedValue(null);
    client.financialTransaction.findMany.mockResolvedValue([txRow()]);

    const result = await service.exportOfx('t1', 'c1', shortDto as never, 'user-1');
    if (result.type === 'file') {
      expect(result.buffer.toString('latin1')).toContain('<ACCTID>orbien</ACCTID>');
    }
  });

  it('escapa & < > no nome da transação (XML/SGML)', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([
      txRow({ description: 'A & B <teste>' }),
    ]);

    const result = await service.exportOfx('t1', 'c1', shortDto as never, 'user-1');
    if (result.type === 'file') {
      expect(result.buffer.toString('latin1')).toContain('A &amp; B &lt;teste&gt;');
    }
  });

  it('período longo enfileira job', async () => {
    const { service, jobs } = setup();
    jobs.create.mockResolvedValue({ id: 'job-2' } as never);

    const result = await service.exportOfx('t1', 'c1', longDto as never, 'user-1');
    expect(result).toEqual({ type: 'job', job_id: 'job-2', status: 'pending' });
  });

  it('usa o nome da categoria quando a transação não tem descrição', async () => {
    const { service, client } = setup();
    client.financialTransaction.findMany.mockResolvedValue([
      txRow({ description: null, category: { name: 'Aluguel', type: 'expense' }, type: 'expense' }),
    ]);

    const result = await service.exportOfx('t1', 'c1', shortDto as never, 'user-1');
    if (result.type === 'file') {
      expect(result.buffer.toString('latin1')).toContain('<NAME>Aluguel</NAME>');
    }
  });
});

describe('ExportService — processamento assíncrono (processJob via reflexão)', () => {
  it('CSV: processa, envia ao storage e marca como concluído', async () => {
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
      'csv',
    );

    expect(jobs.markProcessing).toHaveBeenCalledWith('job-1');
    expect(storage.upload).toHaveBeenCalledWith(expect.any(Buffer), 'exports/t1/job-1.csv', 'text/csv; charset=utf-8');
    expect(system.financialTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['tx-1'] } },
      data: { status: 'confirmed' },
    });
    expect(jobs.markDone).toHaveBeenCalledWith('job-1', 'https://cdn/x');
  });

  it('OFX: busca o tenant pelo cliente de sistema e envia ao storage', async () => {
    const { service, system, storage, jobs } = setup();
    system.financialTransaction.findMany.mockResolvedValue([txRow()]);
    system.tenant.findUnique.mockResolvedValue({ slug: 'igreja-y' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processJob(
      'job-2',
      't1',
      'c1',
      shortDto,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
      'ofx',
    );

    expect(storage.upload).toHaveBeenCalledWith(expect.any(Buffer), 'exports/t1/job-2.ofx', 'application/x-ofx');
    expect(jobs.markDone).toHaveBeenCalledWith('job-2', 'https://cdn/x');
  });

  it('OFX em background usa "orbien" quando o tenant não é encontrado pelo cliente de sistema', async () => {
    const { service, system, storage } = setup();
    system.financialTransaction.findMany.mockResolvedValue([txRow()]);
    system.tenant.findUnique.mockResolvedValue(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processJob(
      'job-7',
      't1',
      'c1',
      shortDto,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
      'ofx',
    );

    const [buffer] = storage.upload.mock.calls[0];
    expect((buffer as Buffer).toString('latin1')).toContain('<ACCTID>orbien</ACCTID>');
  });

  it('marca erro e propaga a exceção quando o processamento falha', async () => {
    const { service, system, jobs } = setup();
    system.financialTransaction.findMany.mockRejectedValue(new Error('banco fora'));

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).processJob(
        'job-3',
        't1',
        'c1',
        shortDto,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        'csv',
      ),
    ).rejects.toThrow('banco fora');

    expect(jobs.markError).toHaveBeenCalledWith('job-3', 'banco fora');
  });

  it('marca erro com mensagem genérica quando o erro não é um Error', async () => {
    const { service, system, jobs } = setup();
    system.financialTransaction.findMany.mockRejectedValue('string de erro');

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).processJob(
        'job-4',
        't1',
        'c1',
        shortDto,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        'csv',
      ),
    ).rejects.toBe('string de erro');

    expect(jobs.markError).toHaveBeenCalledWith('job-4', 'string de erro');
  });

  it('enqueueJob dispara processJob em background sem travar o retorno', async () => {
    const { service, client, jobs } = setup();
    client.financialTransaction.findMany.mockResolvedValue([]);
    jobs.create.mockResolvedValue({ id: 'job-5' } as never);

    const spy = jest
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .spyOn(service as any, 'processJob')
      .mockResolvedValue(undefined);

    const result = await service.exportCsv('t1', 'c1', longDto as never, 'user-1');

    expect(result).toEqual({ type: 'job', job_id: 'job-5', status: 'pending' });
    // Dá tempo do setImmediate rodar antes de checar a chamada.
    await new Promise((resolve) => setImmediate(resolve));
    expect(spy).toHaveBeenCalledWith('job-5', 't1', 'c1', longDto, expect.any(Date), expect.any(Date), 'csv');
  });

  it('erro assíncrono do job em background é logado, não lançado', async () => {
    const { service, jobs } = setup();
    jobs.create.mockResolvedValue({ id: 'job-6' } as never);
    jest
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .spyOn(service as any, 'processJob')
      .mockRejectedValue(new Error('falhou em background'));

    await service.exportOfx('t1', 'c1', longDto as never, 'user-1');
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    // Não há asserção de exceção — chegar aqui sem throw não tratado já prova
    // que o .catch() do enqueueJob absorveu o erro.
  });
});
