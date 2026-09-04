import { NotFoundException } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { PrismaService } from '../../prisma/prisma.service';

function serviceWith() {
  const client = { exportJob: { create: jest.fn(), findFirst: jest.fn() } };
  const system = { exportJob: { update: jest.fn() } };
  const prisma = { client, system } as unknown as PrismaService;
  return { service: new JobsService(prisma), client, system };
}

describe('JobsService', () => {
  it('create grava o job pendente com os dados recebidos', async () => {
    const { service, client } = serviceWith();
    client.exportJob.create.mockResolvedValue({ id: 'j1' });

    const start = new Date('2026-01-01');
    const end = new Date('2026-01-31');
    const result = await service.create('t1', 'c1', 'csv' as never, start, end, 'user-1');

    expect(client.exportJob.create).toHaveBeenCalledWith({
      data: {
        tenant_id: 't1',
        congregation_id: 'c1',
        type: 'csv',
        status: 'pending',
        period_start: start,
        period_end: end,
        created_by: 'user-1',
      },
    });
    expect(result).toEqual({ id: 'j1' });
  });

  describe('findOne', () => {
    it('lança NotFoundException quando não existe', async () => {
      const { service, client } = serviceWith();
      client.exportJob.findFirst.mockResolvedValue(null);

      await expect(service.findOne('t1', 'c1', 'j1')).rejects.toThrow(NotFoundException);
    });

    it('devolve o job escopado por tenant e congregação', async () => {
      const { service, client } = serviceWith();
      client.exportJob.findFirst.mockResolvedValue({ id: 'j1', status: 'done' });

      const result = await service.findOne('t1', 'c1', 'j1');

      expect(client.exportJob.findFirst).toHaveBeenCalledWith({
        where: { id: 'j1', tenant_id: 't1', congregation_id: 'c1' },
      });
      expect(result).toEqual({ id: 'j1', status: 'done' });
    });
  });

  it('markProcessing atualiza o status via cliente de sistema', async () => {
    const { service, system } = serviceWith();
    system.exportJob.update.mockResolvedValue({});

    await service.markProcessing('j1');

    expect(system.exportJob.update).toHaveBeenCalledWith({
      where: { id: 'j1' },
      data: { status: 'processing' },
    });
  });

  it('markDone grava a URL do arquivo via cliente de sistema', async () => {
    const { service, system } = serviceWith();
    system.exportJob.update.mockResolvedValue({});

    await service.markDone('j1', 'https://cdn/x.csv');

    expect(system.exportJob.update).toHaveBeenCalledWith({
      where: { id: 'j1' },
      data: { status: 'done', file_url: 'https://cdn/x.csv' },
    });
  });

  it('markError grava a mensagem de erro via cliente de sistema', async () => {
    const { service, system } = serviceWith();
    system.exportJob.update.mockResolvedValue({});

    await service.markError('j1', 'falhou');

    expect(system.exportJob.update).toHaveBeenCalledWith({
      where: { id: 'j1' },
      data: { status: 'error', error_message: 'falhou' },
    });
  });
});
