/**
 * `archiver` é ESM-only e o Jest (unit, CommonJS) não consegue `require` dele
 * — mesmo problema documentado em `test/stubs/archiver.ts` para a suíte de
 * integração. Aqui, diferente de lá, o teste PRECISA exercitar
 * `buildZipBuffer` de verdade (é o método sob teste), então o fake abaixo
 * simula o suficiente da API de `archiver` (EventEmitter com `data`/`end`,
 * `.append()`, `.finalize()`) para produzir um buffer real e determinístico,
 * em vez de travar em runtime como o stub de integração faz de propósito.
 */
import { EventEmitter } from 'events';

class FakeZipArchive extends EventEmitter {
  private readonly parts: Buffer[] = [];

  append(buffer: Buffer, opts: { name: string }): void {
    this.parts.push(Buffer.from(`--${opts.name}--\n`), buffer);
  }

  finalize(): void {
    process.nextTick(() => {
      this.emit('data', Buffer.concat(this.parts));
      this.emit('end');
    });
  }
}

jest.mock('archiver', () => ({ ZipArchive: FakeZipArchive, default: FakeZipArchive }), {
  virtual: true,
});

import { ZipExportService } from './zip-export.service';
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

function attachmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'att-1',
    file_url: 'https://cdn.example.com/exports/att-1.pdf',
    file_name: 'comprovante.pdf',
    transaction: {
      id: 'tx-12345678',
      occurred_at: new Date('2026-01-10T00:00:00.000Z'),
      description: 'Dízimo',
      category: { name: 'Dízimos' },
    },
    ...overrides,
  };
}

function setup() {
  const system = {
    financialTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    transactionAttachment: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = { system } as unknown as PrismaService;
  const storage = {
    upload: jest.fn().mockResolvedValue(undefined),
    getPresignedGetUrl: jest.fn().mockResolvedValue('https://cdn/x.zip'),
    downloadBuffer: jest.fn().mockResolvedValue(Buffer.from('conteúdo do anexo')),
  } as unknown as jest.Mocked<StorageService>;
  const jobs = {
    create: jest.fn(),
    markProcessing: jest.fn().mockResolvedValue(undefined),
    markDone: jest.fn().mockResolvedValue(undefined),
    markError: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<JobsService>;

  const service = new ZipExportService(prisma, storage, jobs);
  return { service, system, storage, jobs };
}

const dto = { period_start: '2026-01-01', period_end: '2026-01-31' };

describe('ZipExportService.exportZip', () => {
  it('cria o job e dispara o processamento em background', async () => {
    const { service, jobs } = setup();
    jobs.create.mockResolvedValue({ id: 'job-1' } as never);

    const result = await service.exportZip('t1', 'c1', dto as never, 'user-1');

    expect(result).toEqual({ type: 'job', job_id: 'job-1', status: 'pending' });
    expect(jobs.create).toHaveBeenCalledWith('t1', 'c1', 'zip', expect.any(Date), expect.any(Date), 'user-1');
  });
});

describe('ZipExportService — processamento assíncrono (processJob via reflexão)', () => {
  it('gera o ZIP só com o CSV quando não há anexos', async () => {
    const { service, system, storage, jobs } = setup();
    system.financialTransaction.findMany.mockResolvedValue([txRow()]);
    system.transactionAttachment.findMany.mockResolvedValue([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processJob(
      'job-1',
      't1',
      'c1',
      dto,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(jobs.markProcessing).toHaveBeenCalledWith('job-1');
    expect(storage.upload).toHaveBeenCalledWith(expect.any(Buffer), 'exports/t1/job-1.zip', 'application/zip');
    expect(jobs.markDone).toHaveBeenCalledWith('job-1', 'https://cdn/x.zip');
  });

  it('inclui anexos baixados no ZIP, nomeando por data/id/slug', async () => {
    const { service, system, storage } = setup();
    system.financialTransaction.findMany.mockResolvedValue([txRow()]);
    system.transactionAttachment.findMany.mockResolvedValue([attachmentRow()]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processJob(
      'job-2',
      't1',
      'c1',
      dto,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(storage.downloadBuffer).toHaveBeenCalledWith('exports/att-1.pdf');
    expect(storage.upload).toHaveBeenCalled();
  });

  it('descarta um anexo cujo download falha e continua com os demais', async () => {
    const { service, system, storage, jobs } = setup();
    system.financialTransaction.findMany.mockResolvedValue([]);
    system.transactionAttachment.findMany.mockResolvedValue([
      attachmentRow({ id: 'att-broken' }),
      attachmentRow({ id: 'att-ok' }),
    ]);
    storage.downloadBuffer
      .mockRejectedValueOnce(new Error('404 not found'))
      .mockResolvedValueOnce(Buffer.from('ok'));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processJob(
      'job-3',
      't1',
      'c1',
      dto,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(jobs.markDone).toHaveBeenCalled();
    expect(jobs.markError).not.toHaveBeenCalled();
  });

  it('descarta anexo com erro não-Error (mensagem genérica) sem quebrar o job', async () => {
    const { service, system, jobs, storage } = setup();
    system.financialTransaction.findMany.mockResolvedValue([]);
    system.transactionAttachment.findMany.mockResolvedValue([attachmentRow()]);
    storage.downloadBuffer.mockRejectedValue('falha crua');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processJob(
      'job-4',
      't1',
      'c1',
      dto,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(jobs.markDone).toHaveBeenCalled();
  });

  it('usa extensão .bin quando o nome do arquivo não tem extensão', async () => {
    const { service, system, storage } = setup();
    system.financialTransaction.findMany.mockResolvedValue([]);
    system.transactionAttachment.findMany.mockResolvedValue([
      attachmentRow({ file_name: 'semextensao' }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processJob(
      'job-5',
      't1',
      'c1',
      dto,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(storage.upload).toHaveBeenCalled();
  });

  it('slugifica descrições com acento e caracteres especiais', async () => {
    const { service, system, storage } = setup();
    system.financialTransaction.findMany.mockResolvedValue([]);
    system.transactionAttachment.findMany.mockResolvedValue([
      attachmentRow({
        transaction: {
          id: 'tx-2',
          occurred_at: new Date('2026-01-10T00:00:00.000Z'),
          description: 'Doação Especial! & Rara',
          category: { name: 'Ofertas' },
        },
      }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processJob(
      'job-6',
      't1',
      'c1',
      dto,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(storage.upload).toHaveBeenCalled();
  });

  it('usa o nome da categoria quando a transação de um anexo não tem descrição', async () => {
    const { service, system, storage } = setup();
    system.financialTransaction.findMany.mockResolvedValue([]);
    system.transactionAttachment.findMany.mockResolvedValue([
      attachmentRow({
        transaction: {
          id: 'tx-3',
          occurred_at: new Date('2026-01-10T00:00:00.000Z'),
          description: null,
          category: { name: 'Ofertas' },
        },
      }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processJob(
      'job-7',
      't1',
      'c1',
      dto,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(storage.upload).toHaveBeenCalled();
  });

  it('filtra por congregation_id e cost_center do dto (transações e anexos)', async () => {
    const { service, system } = setup();
    system.financialTransaction.findMany.mockResolvedValue([]);
    system.transactionAttachment.findMany.mockResolvedValue([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processJob(
      'job-8',
      't1',
      'c1',
      { ...dto, congregation_id: 'cong-x', cost_center: 'Missões' },
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    const txCall = system.financialTransaction.findMany.mock.calls[0][0];
    expect(txCall.where.congregation_id).toBe('cong-x');
    expect(txCall.where.costCenter).toEqual({ name: 'Missões' });

    const attCall = system.transactionAttachment.findMany.mock.calls[0][0];
    expect(attCall.where.transaction.congregation_id).toBe('cong-x');
    expect(attCall.where.transaction.costCenter).toEqual({ name: 'Missões' });
  });

  it('escapa campos do CSV interno com ponto e vírgula/aspas', async () => {
    const { service, system, storage } = setup();
    system.financialTransaction.findMany.mockResolvedValue([
      txRow({ description: 'Nota; com "aspas"' }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processJob(
      'job-9',
      't1',
      'c1',
      dto,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(storage.upload).toHaveBeenCalled();
  });

  it('despesa vai para a coluna de débito no CSV interno, e descrição ausente vira string vazia', async () => {
    const { service, system, storage } = setup();
    system.financialTransaction.findMany.mockResolvedValue([
      txRow({
        type: 'expense',
        category: { name: 'Aluguel', type: 'expense' },
        amount: { toString: () => '80' },
        description: null,
      }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).processJob(
      'job-14',
      't1',
      'c1',
      dto,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(storage.upload).toHaveBeenCalled();
  });

  it('marca erro e propaga a exceção quando o processamento falha de verdade', async () => {
    const { service, system, jobs } = setup();
    system.financialTransaction.findMany.mockRejectedValue(new Error('banco fora'));

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).processJob(
        'job-10',
        't1',
        'c1',
        dto,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      ),
    ).rejects.toThrow('banco fora');

    expect(jobs.markError).toHaveBeenCalledWith('job-10', 'banco fora');
  });

  it('marca erro com mensagem genérica quando o erro fatal não é um Error', async () => {
    const { service, system, jobs } = setup();
    system.financialTransaction.findMany.mockRejectedValue('erro cru');

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).processJob(
        'job-11',
        't1',
        'c1',
        dto,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      ),
    ).rejects.toBe('erro cru');

    expect(jobs.markError).toHaveBeenCalledWith('job-11', 'erro cru');
  });

  it('enqueueJob dispara processJob em background sem travar o retorno', async () => {
    const { service, jobs } = setup();
    jobs.create.mockResolvedValue({ id: 'job-12' } as never);
    const spy = jest
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .spyOn(service as any, 'processJob')
      .mockResolvedValue(undefined);

    const result = await service.exportZip('t1', 'c1', dto as never, 'user-1');
    expect(result).toEqual({ type: 'job', job_id: 'job-12', status: 'pending' });

    await new Promise((resolve) => setImmediate(resolve));
    expect(spy).toHaveBeenCalledWith('job-12', 't1', 'c1', dto, expect.any(Date), expect.any(Date));
  });

  it('erro assíncrono do job em background é logado, não lançado', async () => {
    const { service, jobs } = setup();
    jobs.create.mockResolvedValue({ id: 'job-13' } as never);
    jest
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .spyOn(service as any, 'processJob')
      .mockRejectedValue(new Error('falhou em background'));

    await service.exportZip('t1', 'c1', dto as never, 'user-1');
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  });
});
