import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CelebrationInstancesService } from './celebration-instances.service';
import { PrismaService } from '../prisma/prisma.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    celebration: { findFirst: jest.fn() },
    celebrationInstance: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>, runInTx?: jest.Mock) {
  const prisma = {
    client,
    runInTx: runInTx ?? jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  } as unknown as PrismaService;
  return new CelebrationInstancesService(prisma);
}

describe('CelebrationInstancesService', () => {
  describe('create', () => {
    it('lança NotFoundException quando a celebração não existe', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.create('t1', 'g1', { celebration_id: 'c1', scheduled_date: '2026-09-06' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cria a instância com notes nulo quando não informado', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1' });
      client.celebrationInstance.create.mockResolvedValue({ id: 'i1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', { celebration_id: 'c1', scheduled_date: '2026-09-06' } as never);

      expect(client.celebrationInstance.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          celebration_id: 'c1',
          scheduled_date: new Date('2026-09-06'),
          notes: null,
        },
      });
    });

    it('cria a instância com notes informado', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1' });
      client.celebrationInstance.create.mockResolvedValue({ id: 'i1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', {
        celebration_id: 'c1',
        scheduled_date: '2026-09-06',
        notes: 'obs',
      } as never);

      expect(client.celebrationInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ notes: 'obs' }) }),
      );
    });
  });

  describe('findAll', () => {
    it('aplica todos os filtros quando informados', async () => {
      const client = clientWith();
      client.celebrationInstance.findMany.mockResolvedValue([{ id: 'i1' }]);
      const service = serviceWith(client);

      await service.findAll('t1', 'g1', {
        celebration_id: 'c1',
        status: 'draft',
        date_from: '2026-09-01',
        date_to: '2026-09-30',
      } as never);

      expect(client.celebrationInstance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenant_id: 't1',
            congregation_id: 'g1',
            celebration_id: 'c1',
            status: 'draft',
            scheduled_date: { gte: new Date('2026-09-01'), lte: new Date('2026-09-30') },
          },
        }),
      );
    });

    it('não aplica filtros de data/status/celebração quando ausentes', async () => {
      const client = clientWith();
      client.celebrationInstance.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      await service.findAll('t1', 'g1', {} as never);

      expect(client.celebrationInstance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenant_id: 't1', congregation_id: 'g1' } }),
      );
    });

    it('aplica somente date_from quando date_to ausente', async () => {
      const client = clientWith();
      client.celebrationInstance.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      await service.findAll('t1', 'g1', { date_from: '2026-09-01' } as never);

      expect(client.celebrationInstance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ scheduled_date: { gte: new Date('2026-09-01') } }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('retorna a instância quando encontrada', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      const service = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'i1')).resolves.toEqual({ id: 'i1' });
    });

    it('lança NotFoundException quando não encontrada', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('atualiza notes e status quando informados', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationInstance.update.mockResolvedValue({ id: 'i1' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'i1', { notes: 'x', status: 'published' } as never);

      expect(client.celebrationInstance.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { notes: 'x', status: 'published' },
      });
    });

    it('não altera nada quando dto vazio', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationInstance.update.mockResolvedValue({ id: 'i1' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'i1', {} as never);

      expect(client.celebrationInstance.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: {} });
    });
  });

  describe('remove', () => {
    it('remove a instância existente', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationInstance.delete.mockResolvedValue({ id: 'i1' });
      const service = serviceWith(client);

      await expect(service.remove('t1', 'g1', 'i1')).resolves.toEqual({ id: 'i1' });
    });

    it('lança NotFoundException quando não encontrada', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.remove('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('materializeInstancesForPeriod', () => {
    it('lança NotFoundException quando a celebração não existe', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.materializeInstancesForPeriod(
          't1',
          'g1',
          'c1',
          new Date('2026-09-01'),
          new Date('2026-09-30'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança BadRequestException quando "from" é depois de "to"', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1', recurrence: 'weekly' });
      const service = serviceWith(client);

      await expect(
        service.materializeInstancesForPeriod(
          't1',
          'g1',
          'c1',
          new Date('2026-09-30'),
          new Date('2026-09-01'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    describe('recurrence "none"', () => {
      it('retorna a instância existente sem criar outra', async () => {
        const client = clientWith();
        client.celebration.findFirst.mockResolvedValue({ id: 'c1', recurrence: 'none' });
        client.celebrationInstance.findFirst.mockResolvedValue({ id: 'existing' });
        const service = serviceWith(client);

        const result = await service.materializeInstancesForPeriod(
          't1',
          'g1',
          'c1',
          new Date('2026-09-01'),
          new Date('2026-09-30'),
        );

        expect(result).toEqual([{ id: 'existing' }]);
        expect(client.celebrationInstance.create).not.toHaveBeenCalled();
      });

      it('cria uma única instância na data "from" quando não existe nenhuma', async () => {
        const client = clientWith();
        client.celebration.findFirst.mockResolvedValue({ id: 'c1', recurrence: 'none' });
        client.celebrationInstance.findFirst.mockResolvedValue(null);
        client.celebrationInstance.create.mockResolvedValue({ id: 'new1' });
        const service = serviceWith(client);

        const result = await service.materializeInstancesForPeriod(
          't1',
          'g1',
          'c1',
          new Date('2026-09-06T15:00:00Z'),
          new Date('2026-09-30'),
        );

        expect(client.celebrationInstance.create).toHaveBeenCalledWith({
          data: {
            tenant_id: 't1',
            congregation_id: 'g1',
            celebration_id: 'c1',
            scheduled_date: new Date('2026-09-06T00:00:00.000Z'),
          },
        });
        expect(result).toEqual([{ id: 'new1' }]);
      });
    });

    describe('recurrence "weekly" — usa anchor_date/instância existente/from como fallback', () => {
      it('lança BadRequestException quando day_of_week é nulo', async () => {
        const client = clientWith();
        client.celebration.findFirst.mockResolvedValue({
          id: 'c1',
          recurrence: 'weekly',
          day_of_week: null,
          anchor_date: null,
        });
        const service = serviceWith(client);

        await expect(
          service.materializeInstancesForPeriod(
            't1',
            'g1',
            'c1',
            new Date('2026-09-01'),
            new Date('2026-09-30'),
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('gera todas as ocorrências do dia da semana em [from, to], get-or-create idempotente', async () => {
        const client = clientWith();
        // Sunday = 0. from = 2026-09-01 (terça), to = 2026-09-30.
        client.celebration.findFirst.mockResolvedValue({
          id: 'c1',
          recurrence: 'weekly',
          day_of_week: 0,
          anchor_date: null,
        });
        // First lookup (existing found) -> no create. Second lookup (none) -> create.
        client.celebrationInstance.findFirst
          .mockResolvedValueOnce({ id: 'existing-09-06', scheduled_date: new Date('2026-09-06T00:00:00.000Z') })
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null);
        client.celebrationInstance.create.mockImplementation(({ data }: { data: { scheduled_date: Date } }) =>
          Promise.resolve({ id: `new-${data.scheduled_date.toISOString()}`, scheduled_date: data.scheduled_date }),
        );
        const service = serviceWith(client);

        const result = await service.materializeInstancesForPeriod(
          't1',
          'g1',
          'c1',
          new Date('2026-09-01'),
          new Date('2026-09-30'),
        );

        // Sundays in Sept 2026 within [01, 30]: 06, 13, 20, 27
        expect(result).toHaveLength(4);
        expect(result[0]).toEqual({
          id: 'existing-09-06',
          scheduled_date: new Date('2026-09-06T00:00:00.000Z'),
        });
        expect(client.celebrationInstance.create).toHaveBeenCalledTimes(3);
      });
    });

    describe('recurrence "biweekly" — aritmética de virada de mês/ano', () => {
      it('usa Celebration.anchor_date quando presente, mesmo através de virada de ano', async () => {
        const client = clientWith();
        client.celebration.findFirst.mockResolvedValue({
          id: 'c1',
          recurrence: 'biweekly',
          day_of_week: 0,
          anchor_date: new Date('2025-12-21T00:00:00Z'),
        });
        client.celebrationInstance.findFirst.mockResolvedValue(null);
        client.celebrationInstance.create.mockImplementation(({ data }: { data: { scheduled_date: Date } }) =>
          Promise.resolve({ id: 'x', scheduled_date: data.scheduled_date }),
        );
        const service = serviceWith(client);

        const result = await service.materializeInstancesForPeriod(
          't1',
          'g1',
          'c1',
          new Date('2026-01-01'),
          new Date('2026-01-31'),
        );

        // anchor 2025-12-21, +14 = 2026-01-04, +14 = 2026-01-18
        const dates = result.map((r) => (r as { scheduled_date: Date }).scheduled_date.toISOString());
        expect(dates).toEqual(['2026-01-04T00:00:00.000Z', '2026-01-18T00:00:00.000Z']);
      });

      it('usa a data da instância existente mais antiga como âncora quando não há anchor_date', async () => {
        const client = clientWith();
        client.celebration.findFirst.mockResolvedValue({
          id: 'c1',
          recurrence: 'biweekly',
          day_of_week: 0,
          anchor_date: null,
        });
        client.celebrationInstance.findFirst
          // resolveAnchorDate's own lookup for firstInstance
          .mockResolvedValueOnce({ scheduled_date: new Date('2026-01-04T00:00:00Z') })
          .mockResolvedValue(null);
        client.celebrationInstance.create.mockImplementation(({ data }: { data: { scheduled_date: Date } }) =>
          Promise.resolve({ id: 'x', scheduled_date: data.scheduled_date }),
        );
        const service = serviceWith(client);

        const result = await service.materializeInstancesForPeriod(
          't1',
          'g1',
          'c1',
          new Date('2026-01-04'),
          new Date('2026-01-20'),
        );

        const dates = result.map((r) => (r as { scheduled_date: Date }).scheduled_date.toISOString());
        expect(dates).toEqual(['2026-01-04T00:00:00.000Z', '2026-01-18T00:00:00.000Z']);
      });

      it('usa "from" como âncora de fallback e loga aviso quando não há anchor_date nem instância', async () => {
        const client = clientWith();
        client.celebration.findFirst.mockResolvedValue({
          id: 'c1',
          recurrence: 'biweekly',
          day_of_week: 0,
          anchor_date: null,
        });
        client.celebrationInstance.findFirst.mockResolvedValue(null);
        client.celebrationInstance.create.mockImplementation(({ data }: { data: { scheduled_date: Date } }) =>
          Promise.resolve({ id: 'x', scheduled_date: data.scheduled_date }),
        );
        const service = serviceWith(client);

        const result = await service.materializeInstancesForPeriod(
          't1',
          'g1',
          'c1',
          new Date('2026-02-01'),
          new Date('2026-02-01'),
        );

        expect(result).toHaveLength(1);
        expect((result[0] as { scheduled_date: Date }).scheduled_date.toISOString()).toBe(
          '2026-02-01T00:00:00.000Z',
        );
      });

      it('datesForBiweekly avança o cursor um ciclo extra quando o arredondamento do dia deixa o cursor antes de "start" (componente de hora)', () => {
        // Whitebox: chama o método privado diretamente com um `start` que
        // carrega hora (nunca acontece via API pública, que sempre normaliza
        // para 00:00 UTC) para exercitar o passo de correção do while.
        const client = clientWith();
        const service = serviceWith(client);
        const anchor = new Date('2026-01-01T00:00:00.000Z');
        const start = new Date('2026-01-15T12:00:00.000Z'); // 14 dias + 12h após o anchor
        const end = new Date('2026-02-01T00:00:00.000Z');

        const dates = (
          service as unknown as {
            datesForBiweekly: (a: Date, s: Date, e: Date) => Date[];
          }
        ).datesForBiweekly(anchor, start, end);

        // Sem a correção o cursor cairia em 2026-01-15T00:00 (< start); com
        // ela, avança para o próximo ciclo de 14 dias: 2026-01-29.
        expect(dates.map((d) => d.toISOString())).toEqual(['2026-01-29T00:00:00.000Z']);
      });

      it('retorna vazio quando o anchor é depois de "to"', async () => {
        const client = clientWith();
        client.celebration.findFirst.mockResolvedValue({
          id: 'c1',
          recurrence: 'biweekly',
          day_of_week: 0,
          anchor_date: new Date('2026-06-01T00:00:00Z'),
        });
        const service = serviceWith(client);

        const result = await service.materializeInstancesForPeriod(
          't1',
          'g1',
          'c1',
          new Date('2026-01-01'),
          new Date('2026-01-31'),
        );

        expect(result).toEqual([]);
        expect(client.celebrationInstance.create).not.toHaveBeenCalled();
      });
    });

    describe('recurrence "monthly" — posição do dia-da-semana, incluindo "última ocorrência"', () => {
      it('replica a N-ésima ocorrência (não-última) do dia da semana em cada mês do período', async () => {
        const client = clientWith();
        // anchor 2026-01-04 (domingo) é a 1ª ocorrência de domingo em janeiro/2026
        client.celebration.findFirst.mockResolvedValue({
          id: 'c1',
          recurrence: 'monthly',
          day_of_week: 0,
          anchor_date: new Date('2026-01-04T00:00:00Z'),
        });
        client.celebrationInstance.findFirst.mockResolvedValue(null);
        client.celebrationInstance.create.mockImplementation(({ data }: { data: { scheduled_date: Date } }) =>
          Promise.resolve({ id: 'x', scheduled_date: data.scheduled_date }),
        );
        const service = serviceWith(client);

        const result = await service.materializeInstancesForPeriod(
          't1',
          'g1',
          'c1',
          new Date('2026-01-01'),
          new Date('2026-03-31'),
        );

        // 1º domingo de jan/2026 = 04, fev/2026 = 01, mar/2026 = 01
        const dates = result.map((r) => (r as { scheduled_date: Date }).scheduled_date.toISOString());
        expect(dates).toEqual([
          '2026-01-04T00:00:00.000Z',
          '2026-02-01T00:00:00.000Z',
          '2026-03-01T00:00:00.000Z',
        ]);
      });

      it('replica a ÚLTIMA ocorrência do dia da semana quando o anchor é a última do seu mês (dia 31 em mês curto)', async () => {
        const client = clientWith();
        // 2026-01-25 (domingo) é a ÚLTIMA ocorrência de domingo em janeiro/2026 (dias 4,11,18,25)
        client.celebration.findFirst.mockResolvedValue({
          id: 'c1',
          recurrence: 'monthly',
          day_of_week: 0,
          anchor_date: new Date('2026-01-25T00:00:00Z'),
        });
        client.celebrationInstance.findFirst.mockResolvedValue(null);
        client.celebrationInstance.create.mockImplementation(({ data }: { data: { scheduled_date: Date } }) =>
          Promise.resolve({ id: 'x', scheduled_date: data.scheduled_date }),
        );
        const service = serviceWith(client);

        // Fevereiro/2026 é curto (28 dias, não bissexto) — último domingo é dia 22.
        const result = await service.materializeInstancesForPeriod(
          't1',
          'g1',
          'c1',
          new Date('2026-02-01'),
          new Date('2026-02-28'),
        );

        const dates = result.map((r) => (r as { scheduled_date: Date }).scheduled_date.toISOString());
        expect(dates).toEqual(['2026-02-22T00:00:00.000Z']);
      });

      it('não inclui a ocorrência do mês quando ela cai fora de [start, end]', async () => {
        const client = clientWith();
        client.celebration.findFirst.mockResolvedValue({
          id: 'c1',
          recurrence: 'monthly',
          day_of_week: 0,
          anchor_date: new Date('2026-01-04T00:00:00Z'),
        });
        const service = serviceWith(client);

        // janeiro inteiro no range, mas com end antes do 1º domingo (04) — deve ficar vazio
        const result = await service.materializeInstancesForPeriod(
          't1',
          'g1',
          'c1',
          new Date('2026-01-01'),
          new Date('2026-01-03'),
        );

        expect(result).toEqual([]);
      });
    });

    it('roda dentro da runInTx do próprio prisma (não da do chamador)', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({
        id: 'c1',
        recurrence: 'weekly',
        day_of_week: 0,
        anchor_date: null,
      });
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'existing' });
      const runInTx = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client));
      const service = serviceWith(client, runInTx);

      await service.materializeInstancesForPeriod(
        't1',
        'g1',
        'c1',
        new Date('2026-09-06'),
        new Date('2026-09-06'),
      );

      expect(runInTx).toHaveBeenCalledTimes(1);
    });
  });
});
