import { CelebrationSchedulerService } from './celebration-scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';

function systemWith(overrides: Record<string, unknown> = {}) {
  return {
    celebration: { findMany: jest.fn() },
    celebrationInstance: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    ...overrides,
  };
}

function serviceWith(system: ReturnType<typeof systemWith>, notifications?: Partial<NotificationsService>) {
  const prisma = { system } as unknown as PrismaService;
  const notificationsService = {
    sendPush: jest.fn().mockResolvedValue(undefined),
    ...notifications,
  } as unknown as NotificationsService;
  return { service: new CelebrationSchedulerService(prisma, notificationsService), notificationsService };
}

describe('CelebrationSchedulerService', () => {
  // Fixamos "hoje" para uma terça-feira conhecida (2026-09-01) via fake timers,
  // para que os testes de recorrência sejam determinísticos.
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-01T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('cronGenerateInstances', () => {
    it('roda generateInstances e loga o resultado', async () => {
      const system = systemWith();
      system.celebration.findMany.mockResolvedValue([]);
      const { service } = serviceWith(system);
      const logSpy = jest.spyOn((service as unknown as { logger: { log: (m: string) => void } }).logger, 'log');

      await service.cronGenerateInstances();

      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('cronSendHostReminders', () => {
    it('roda sendHostReminders e loga o resultado', async () => {
      const system = systemWith();
      system.celebrationInstance.findMany.mockResolvedValue([]);
      const { service } = serviceWith(system);
      const logSpy = jest.spyOn((service as unknown as { logger: { log: (m: string) => void } }).logger, 'log');

      await service.cronSendHostReminders();

      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('generateInstances', () => {
    it('pula celebrações sem day_of_week', async () => {
      const system = systemWith();
      system.celebration.findMany.mockResolvedValue([
        {
          id: 'c1',
          tenant_id: 't1',
          congregation_id: 'g1',
          day_of_week: null,
          recurrence: 'weekly',
          created_at: new Date('2026-01-01'),
          instances: [],
        },
      ]);
      const { service } = serviceWith(system);

      const result = await service.generateInstances();

      expect(result.tenants['t1']).toEqual({ created: 0, skipped: 1, errors: 0 });
      expect(system.celebrationInstance.create).not.toHaveBeenCalled();
    });

    it('cria instâncias novas e pula as já existentes (weekly)', async () => {
      const system = systemWith();
      system.celebration.findMany.mockResolvedValue([
        {
          id: 'c1',
          tenant_id: 't1',
          congregation_id: 'g1',
          day_of_week: 0, // domingo
          recurrence: 'weekly',
          created_at: new Date('2026-01-01'),
          instances: [],
        },
      ]);
      // today=2026-09-01 (terça), janela +14 dias => até 2026-09-15.
      // Domingos no intervalo: 06 e 13.
      system.celebrationInstance.findFirst
        .mockResolvedValueOnce({ id: 'existing' }) // 06 já existe
        .mockResolvedValueOnce(null); // 13 não existe
      system.celebrationInstance.create.mockResolvedValue({ id: 'new1' });
      const { service } = serviceWith(system);

      const result = await service.generateInstances();

      expect(result.celebrations_processed).toBe(1);
      expect(result.tenants['t1']).toEqual({ created: 1, skipped: 1, errors: 0 });
      expect(system.celebrationInstance.create).toHaveBeenCalledTimes(1);
      expect(system.celebrationInstance.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          celebration_id: 'c1',
          scheduled_date: new Date('2026-09-13T00:00:00.000Z'),
          status: 'draft',
        },
      });
    });

    it('usa a última instância como âncora do ciclo biweekly', async () => {
      const system = systemWith();
      system.celebration.findMany.mockResolvedValue([
        {
          id: 'c1',
          tenant_id: 't1',
          congregation_id: 'g1',
          day_of_week: 0,
          recurrence: 'biweekly',
          created_at: new Date('2026-01-01'),
          instances: [{ scheduled_date: new Date('2026-08-30T00:00:00Z') }],
        },
      ]);
      system.celebrationInstance.findFirst.mockResolvedValue(null);
      system.celebrationInstance.create.mockResolvedValue({ id: 'new1' });
      const { service } = serviceWith(system);

      await service.generateInstances();

      // anchor 2026-08-30, +14 = 2026-09-13 (dentro da janela [09-01, 09-15])
      expect(system.celebrationInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ scheduled_date: new Date('2026-09-13T00:00:00.000Z') }),
        }),
      );
    });

    it('usa a primeira ocorrência a partir da criação como âncora biweekly quando não há instância', async () => {
      const system = systemWith();
      system.celebration.findMany.mockResolvedValue([
        {
          id: 'c1',
          tenant_id: 't1',
          congregation_id: 'g1',
          day_of_week: 0,
          recurrence: 'biweekly',
          created_at: new Date('2026-08-02T00:00:00Z'), // domingo
          instances: [],
        },
      ]);
      system.celebrationInstance.findFirst.mockResolvedValue(null);
      system.celebrationInstance.create.mockResolvedValue({ id: 'new1' });
      const { service } = serviceWith(system);

      await service.generateInstances();

      // anchor = 2026-08-02, ciclos de 14 dias: 16, 30, 13/set...
      expect(system.celebrationInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ scheduled_date: new Date('2026-09-13T00:00:00.000Z') }),
        }),
      );
    });

    it('gera a primeira ocorrência do dia da semana no mês atual e no seguinte (monthly)', async () => {
      const system = systemWith();
      system.celebration.findMany.mockResolvedValue([
        {
          id: 'c1',
          tenant_id: 't1',
          congregation_id: 'g1',
          day_of_week: 0,
          recurrence: 'monthly',
          created_at: new Date('2026-01-01'),
          instances: [],
        },
      ]);
      system.celebrationInstance.findFirst.mockResolvedValue(null);
      system.celebrationInstance.create.mockResolvedValue({ id: 'new1' });
      const { service } = serviceWith(system);

      const result = await service.generateInstances();

      // 1º domingo de set/2026 = 06 (fora da janela pois today=01, dentro),
      // 1º domingo de out/2026 = 04 (fora da janela +14 dias = até 15/09) então só setembro entra
      expect(result.tenants['t1'].created).toBe(1);
      expect(system.celebrationInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ scheduled_date: new Date('2026-09-06T00:00:00.000Z') }),
        }),
      );
    });

    it('conta erro e continua processando quando uma celebração falha', async () => {
      const system = systemWith();
      system.celebration.findMany.mockResolvedValue([
        {
          id: 'c1',
          tenant_id: 't1',
          congregation_id: 'g1',
          day_of_week: 0,
          recurrence: 'weekly',
          created_at: new Date('2026-01-01'),
          instances: [],
        },
        {
          id: 'c2',
          tenant_id: 't1',
          congregation_id: 'g1',
          day_of_week: 0,
          recurrence: 'weekly',
          created_at: new Date('2026-01-01'),
          instances: [],
        },
      ]);
      system.celebrationInstance.findFirst
        .mockRejectedValueOnce(new Error('db indisponível'))
        .mockResolvedValue(null);
      system.celebrationInstance.create.mockResolvedValue({ id: 'new1' });
      const { service } = serviceWith(system);

      const result = await service.generateInstances();

      expect(result.tenants['t1'].errors).toBe(1);
      expect(result.tenants['t1'].created).toBeGreaterThanOrEqual(1);
    });
  });

  describe('computeTargetDates', () => {
    it('retorna vazio para recurrence "none" (guarda de exaustividade — filtrado antes na query real)', () => {
      const system = systemWith();
      const { service } = serviceWith(system);

      const dates = (
        service as unknown as {
          computeTargetDates: (
            recurrence: string,
            dayOfWeek: number,
            lastInstanceDate: Date | null,
            createdAt: Date,
            today: Date,
            windowEnd: Date,
          ) => Date[];
        }
      ).computeTargetDates('none', 0, null, new Date('2026-01-01'), new Date('2026-09-01'), new Date('2026-09-15'));

      expect(dates).toEqual([]);
    });
  });

  describe('sendHostReminders', () => {
    it('envia lembrete, marca host_reminder_sent_at e conta sucesso', async () => {
      const system = systemWith();
      system.celebrationInstance.findMany.mockResolvedValue([
        {
          id: 'i1',
          tenant_id: 't1',
          congregation_id: 'g1',
          celebration: { name: 'Culto de Domingo', start_time: '19:00' },
        },
      ]);
      const { service, notificationsService } = serviceWith(system);

      const result = await service.sendHostReminders();

      expect(notificationsService.sendPush).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 't1',
          congregationId: 'g1',
          title: 'Lembrete: Culto Hoje',
          filters: [
            { field: 'tag', key: 'congregation_id', relation: '=', value: 'g1' },
            { field: 'tag', key: 'role', relation: '=', value: 'admin_congregation' },
            { operator: 'OR' },
            { field: 'tag', key: 'congregation_id', relation: '=', value: 'g1' },
            { field: 'tag', key: 'role', relation: '=', value: 'pastor' },
            { operator: 'OR' },
            { field: 'tag', key: 'congregation_id', relation: '=', value: 'g1' },
            { field: 'tag', key: 'role', relation: '=', value: 'secretary' },
          ],
        }),
      );
      expect(system.celebrationInstance.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { host_reminder_sent_at: expect.any(Date) },
      });
      expect(result).toEqual({ instances_checked: 1, sent: 1, errors: 0 });
    });

    it('conta erro e não marca host_reminder_sent_at quando o envio falha', async () => {
      const system = systemWith();
      system.celebrationInstance.findMany.mockResolvedValue([
        {
          id: 'i1',
          tenant_id: 't1',
          congregation_id: 'g1',
          celebration: { name: 'Culto', start_time: '19:00' },
        },
      ]);
      const { service } = serviceWith(system, {
        sendPush: jest.fn().mockRejectedValue(new Error('falha OneSignal')),
      });

      const result = await service.sendHostReminders();

      expect(result).toEqual({ instances_checked: 1, sent: 0, errors: 1 });
      expect(system.celebrationInstance.update).not.toHaveBeenCalled();
    });

    it('retorna zerado quando não há instâncias hoje', async () => {
      const system = systemWith();
      system.celebrationInstance.findMany.mockResolvedValue([]);
      const { service } = serviceWith(system);

      const result = await service.sendHostReminders();

      expect(result).toEqual({ instances_checked: 0, sent: 0, errors: 0 });
    });
  });
});
