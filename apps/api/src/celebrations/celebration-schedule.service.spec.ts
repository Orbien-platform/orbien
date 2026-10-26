import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CelebrationScheduleService } from './celebration-schedule.service';
import { PrismaService } from '../prisma/prisma.service';
import { CelebrationInstancesService } from './celebration-instances.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    celebrationInstance: { findFirst: jest.fn() },
    celebrationSchedule: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
    ministry: { findFirst: jest.fn() },
    kidsSession: { findFirst: jest.fn() },
    celebrationMinistry: { findFirst: jest.fn(), create: jest.fn(), createMany: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
    scheduleTemplate: { findFirst: jest.fn() },
    ...overrides,
  };
}

function serviceWith(
  client: ReturnType<typeof clientWith>,
  instancesService?: Partial<CelebrationInstancesService>,
) {
  const runInTx = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client));
  const prisma = { client, runInTx } as unknown as PrismaService;
  const instances = {
    materializeInstancesForPeriod: jest.fn(),
    ...instancesService,
  } as unknown as CelebrationInstancesService;
  return { service: new CelebrationScheduleService(prisma, instances), instances, runInTx };
}

describe('CelebrationScheduleService', () => {
  describe('createOrGet', () => {
    it('lança NotFoundException quando a instância não existe', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.createOrGet('t1', 'g1', 'i1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retorna a escala existente sem criar outra', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationSchedule.findUnique.mockResolvedValue({ id: 's1' });
      const { service } = serviceWith(client);

      const result = await service.createOrGet('t1', 'g1', 'i1');

      expect(result).toEqual({ id: 's1' });
      expect(client.celebrationSchedule.create).not.toHaveBeenCalled();
    });

    it('cria a escala quando não existe', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationSchedule.findUnique.mockResolvedValue(null);
      client.celebrationSchedule.create.mockResolvedValue({ id: 's1' });
      const { service } = serviceWith(client);

      const result = await service.createOrGet('t1', 'g1', 'i1');

      expect(client.celebrationSchedule.create).toHaveBeenCalledWith({
        data: { tenant_id: 't1', congregation_id: 'g1', celebration_instance_id: 'i1' },
      });
      expect(result).toEqual({ id: 's1' });
    });
  });

  describe('getSchedule', () => {
    it('lança NotFoundException quando a instância não existe', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.getSchedule('t1', 'g1', 'i1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança NotFoundException quando a escala não existe para a instância', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationSchedule.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.getSchedule('t1', 'g1', 'i1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retorna a escala com assigned_count calculado por ministério', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationSchedule.findUnique.mockResolvedValue({
        id: 's1',
        ministries: [
          {
            id: 'cm1',
            ministry: { id: 'm1', name: 'Louvor' },
            // `swapped` continua na lista, mas não ocupa a vaga
            assignments: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3', status: 'swapped' }],
          },
          { id: 'cm2', ministry: { id: 'm2', name: 'Som' }, assignments: [] },
        ],
      });
      const { service } = serviceWith(client);

      const result = await service.getSchedule('t1', 'g1', 'i1');

      expect(result.ministries[0]?.assigned_count).toBe(2);
      expect(result.ministries[1]?.assigned_count).toBe(0);
    });

    describe('sinalização de falta (spec P2 Escala, AC 2)', () => {
      const asg = (id: string, vol: string, status: string) => ({ id, status, volunteer_profile_id: vol });
      const kidsCm = (id: string, assignments: unknown[], min: number, sessionId = 'ks1') => ({
        id,
        kids_session_id: sessionId,
        ministry: { id: 'm1', name: 'Kids' },
        kidsSession: { id: sessionId, status: 'open', room: { id: 'r1', name: 'Maternal', min_volunteers: min } },
        assignments,
      });

      async function scheduleWith(ministries: unknown[]) {
        const client = clientWith();
        client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
        client.celebrationSchedule.findUnique.mockResolvedValue({ id: 's1', ministries });
        const { service } = serviceWith(client);
        return service.getSchedule('t1', 'g1', 'i1');
      }

      it('expõe kids_session e volunteers_missing = mínimo - escalados', async () => {
        const result = await scheduleWith([kidsCm('cm1', [asg('a1', 'v1', 'pending')], 3)]);

        expect(result.ministries[0]).toEqual(
          expect.objectContaining({
            kids_session: { id: 'ks1', room_id: 'r1', room_name: 'Maternal', status: 'open', min_volunteers: 3 },
            volunteers_missing: 2,
          }),
        );
      });

      it('soma os escalados de todos os vínculos da sessão (voluntário distinto, sem recusado/trocado)', async () => {
        const result = await scheduleWith([
          kidsCm('cm1', [asg('a1', 'v1', 'confirmed'), asg('a2', 'v2', 'declined')], 2),
          kidsCm('cm2', [asg('a3', 'v1', 'pending'), asg('a4', 'v3', 'swapped')], 2),
        ]);

        // v1 (nos dois vínculos) conta uma vez; declined e swapped não contam.
        expect(result.ministries.map((m) => m.volunteers_missing)).toEqual([1, 1]);
      });

      it('mínimo atingido: volunteers_missing = 0 (nunca negativo)', async () => {
        const result = await scheduleWith([
          kidsCm('cm1', [asg('a1', 'v1', 'confirmed'), asg('a2', 'v2', 'pending')], 1),
        ]);
        expect(result.ministries[0]?.volunteers_missing).toBe(0);
      });

      it('ministério sem sessão kids: kids_session e volunteers_missing nulos', async () => {
        const result = await scheduleWith([
          { id: 'cm9', kids_session_id: null, kidsSession: null, ministry: { id: 'm2', name: 'Som' }, assignments: [] },
        ]);
        expect(result.ministries[0]).toEqual(
          expect.objectContaining({ kids_session: null, volunteers_missing: null }),
        );
      });
    });
  });

  describe('addMinistry', () => {
    it('roda dentro de runInTx e reaproveita a escala existente', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationSchedule.findUnique.mockResolvedValue({ id: 's1' });
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.celebrationMinistry.findFirst.mockResolvedValue(null);
      client.celebrationMinistry.create.mockResolvedValue({ id: 'cm1', ministry: { id: 'm1', name: 'Louvor' } });
      const { service, runInTx } = serviceWith(client);

      const result = await service.addMinistry('t1', 'g1', 'i1', { ministry_id: 'm1', slots: 2 } as never);

      expect(runInTx).toHaveBeenCalledTimes(1);
      expect(client.celebrationSchedule.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'cm1', ministry: { id: 'm1', name: 'Louvor' } });
    });

    it('cria a escala sob demanda quando não existe', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationSchedule.findUnique.mockResolvedValue(null);
      client.celebrationSchedule.create.mockResolvedValue({ id: 's1' });
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.celebrationMinistry.findFirst.mockResolvedValue(null);
      client.celebrationMinistry.create.mockResolvedValue({ id: 'cm1' });
      const { service } = serviceWith(client);

      await service.addMinistry('t1', 'g1', 'i1', { ministry_id: 'm1', slots: 2 } as never);

      expect(client.celebrationSchedule.create).toHaveBeenCalled();
    });

    it('lança NotFoundException quando o ministério não existe', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationSchedule.findUnique.mockResolvedValue({ id: 's1' });
      client.ministry.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(
        service.addMinistry('t1', 'g1', 'i1', { ministry_id: 'nope', slots: 1 } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança ConflictException quando o ministério já está vinculado', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationSchedule.findUnique.mockResolvedValue({ id: 's1' });
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.celebrationMinistry.findFirst.mockResolvedValue({ id: 'cm-existing' });
      const { service } = serviceWith(client);

      await expect(
        service.addMinistry('t1', 'g1', 'i1', { ministry_id: 'm1', slots: 1 } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });
    describe('sessão kids (spec P2 Escala, AC 1)', () => {
      const dto = { ministry_id: 'm1', slots: 2, kids_session_id: 'ks1' } as never;

      function ready() {
        const client = clientWith();
        client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
        client.celebrationSchedule.findUnique.mockResolvedValue({ id: 's1' });
        client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
        client.kidsSession.findFirst.mockResolvedValue({ id: 'ks1', status: 'open' });
        client.celebrationMinistry.findFirst.mockResolvedValue(null);
        client.celebrationMinistry.create.mockResolvedValue({ id: 'cm1' });
        return client;
      }

      it('grava kids_session_id quando a sessão é da MESMA instância, tenant e congregação', async () => {
        const client = ready();
        const { service } = serviceWith(client);

        await service.addMinistry('t1', 'g1', 'i1', dto);

        expect(client.kidsSession.findFirst).toHaveBeenCalledWith({
          where: { id: 'ks1', tenant_id: 't1', congregation_id: 'g1', celebration_instance_id: 'i1' },
          select: { id: true, status: true },
        });
        expect(client.celebrationMinistry.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ kids_session_id: 'ks1', ministry_id: 'm1' }) }),
        );
      });

      it('404 quando a sessão não é da instância/tenant/congregação, sem criar nada', async () => {
        const client = ready();
        client.kidsSession.findFirst.mockResolvedValue(null);
        const { service } = serviceWith(client);

        await expect(service.addMinistry('t1', 'g1', 'i1', dto)).rejects.toBeInstanceOf(NotFoundException);
        expect(client.celebrationMinistry.create).not.toHaveBeenCalled();
      });

      it('422 quando a sessão está cancelada', async () => {
        const client = ready();
        client.kidsSession.findFirst.mockResolvedValue({ id: 'ks1', status: 'cancelled' });
        const { service } = serviceWith(client);

        await expect(service.addMinistry('t1', 'g1', 'i1', dto)).rejects.toBeInstanceOf(
          UnprocessableEntityException,
        );
        expect(client.celebrationMinistry.create).not.toHaveBeenCalled();
      });

      it('sem kids_session_id não consulta sessão e grava null', async () => {
        const client = ready();
        const { service } = serviceWith(client);

        await service.addMinistry('t1', 'g1', 'i1', { ministry_id: 'm1', slots: 1 } as never);

        expect(client.kidsSession.findFirst).not.toHaveBeenCalled();
        expect(client.celebrationMinistry.findFirst).toHaveBeenCalledWith({
          where: { schedule_id: 's1', ministry_id: 'm1', kids_session_id: null },
        });
        expect(client.celebrationMinistry.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ kids_session_id: null }) }),
        );
      });

      it('o mesmo ministério pode escalar outra sessão; a mesma sessão duas vezes é 409', async () => {
        const client = ready();
        const { service } = serviceWith(client);
        await service.addMinistry('t1', 'g1', 'i1', dto);
        expect(client.celebrationMinistry.findFirst).toHaveBeenCalledWith({
          where: { schedule_id: 's1', ministry_id: 'm1', kids_session_id: 'ks1' },
        });

        client.celebrationMinistry.findFirst.mockResolvedValue({ id: 'cm-existing' });
        await expect(service.addMinistry('t1', 'g1', 'i1', dto)).rejects.toBeInstanceOf(ConflictException);
      });

      it('corrida na unicidade (P2002) vira 409', async () => {
        const client = ready();
        client.celebrationMinistry.create.mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
        );
        const { service } = serviceWith(client);

        await expect(service.addMinistry('t1', 'g1', 'i1', dto)).rejects.toBeInstanceOf(ConflictException);
      });
    });
  });

  describe('remove', () => {
    it('lança NotFoundException quando a instância não existe', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.remove('t1', 'g1', 'i1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança NotFoundException quando a escala não existe', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationSchedule.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.remove('t1', 'g1', 'i1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('remove a escala publicada sem bloquear', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationSchedule.findUnique.mockResolvedValue({ id: 's1', status: 'published' });
      client.celebrationSchedule.delete.mockResolvedValue({ id: 's1' });
      const { service } = serviceWith(client);

      const result = await service.remove('t1', 'g1', 'i1');

      expect(client.celebrationSchedule.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
      expect(result).toEqual({ id: 's1' });
    });
  });

  describe('removeMinistry', () => {
    it('lança NotFoundException quando a instância não existe', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.removeMinistry('t1', 'g1', 'i1', 'm1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lança NotFoundException quando a escala não existe', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationSchedule.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.removeMinistry('t1', 'g1', 'i1', 'm1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lança NotFoundException quando o ministério não está na escala', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationSchedule.findUnique.mockResolvedValue({ id: 's1' });
      client.celebrationMinistry.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.removeMinistry('t1', 'g1', 'i1', 'm1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('remove o ministério da escala', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationSchedule.findUnique.mockResolvedValue({ id: 's1' });
      client.celebrationMinistry.findFirst.mockResolvedValue({ id: 'cm1' });
      client.celebrationMinistry.delete.mockResolvedValue({ id: 'cm1' });
      const { service } = serviceWith(client);

      const result = await service.removeMinistry('t1', 'g1', 'i1', 'm1');

      expect(client.celebrationMinistry.delete).toHaveBeenCalledWith({ where: { id: 'cm1' } });
      expect(client.celebrationMinistry.findFirst).toHaveBeenCalledWith({
        where: { schedule_id: 's1', ministry_id: 'm1', kids_session_id: null },
      });
      expect(result).toEqual({ id: 'cm1' });
    });

    it('com kids_session_id remove só o vínculo daquela sessão', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.celebrationSchedule.findUnique.mockResolvedValue({ id: 's1' });
      client.celebrationMinistry.findFirst.mockResolvedValue({ id: 'cm2' });
      client.celebrationMinistry.delete.mockResolvedValue({ id: 'cm2' });
      const { service } = serviceWith(client);

      await service.removeMinistry('t1', 'g1', 'i1', 'm1', 'ks1');

      expect(client.celebrationMinistry.findFirst).toHaveBeenCalledWith({
        where: { schedule_id: 's1', ministry_id: 'm1', kids_session_id: 'ks1' },
      });
      expect(client.celebrationMinistry.delete).toHaveBeenCalledWith({ where: { id: 'cm2' } });
    });
  });

  describe('applyTemplate', () => {
    it('lança NotFoundException quando o template não existe', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.scheduleTemplate.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(
        service.applyTemplate('t1', 'g1', 'i1', { template_id: 'tpl1' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cria a escala sob demanda, copia só os ministérios ainda não vinculados', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.scheduleTemplate.findFirst.mockResolvedValue({
        id: 'tpl1',
        ministries: [
          { ministry_id: 'm1', slots: 2 },
          { ministry_id: 'm2', slots: 1 },
        ],
      });
      client.celebrationSchedule.findUnique
        .mockResolvedValueOnce(null) // busca inicial: não existe
        .mockResolvedValueOnce({ id: 's1', ministries: [] }); // busca final (updated)
      client.celebrationSchedule.create.mockResolvedValue({ id: 's1' });
      client.celebrationMinistry.findMany.mockResolvedValue([{ ministry_id: 'm1' }]);
      const { service } = serviceWith(client);

      await service.applyTemplate('t1', 'g1', 'i1', { template_id: 'tpl1' } as never);

      expect(client.celebrationSchedule.create).toHaveBeenCalled();
      expect(client.celebrationMinistry.createMany).toHaveBeenCalledWith({
        data: [
          {
            tenant_id: 't1',
            congregation_id: 'g1',
            schedule_id: 's1',
            ministry_id: 'm2',
            slots: 1,
          },
        ],
      });
    });

    it('reaproveita a escala existente e não chama createMany quando todos os ministérios já estão vinculados', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.scheduleTemplate.findFirst.mockResolvedValue({
        id: 'tpl1',
        ministries: [{ ministry_id: 'm1', slots: 2 }],
      });
      client.celebrationSchedule.findUnique
        .mockResolvedValueOnce({ id: 's1' })
        .mockResolvedValueOnce({ id: 's1', ministries: [] });
      client.celebrationMinistry.findMany.mockResolvedValue([{ ministry_id: 'm1' }]);
      const { service } = serviceWith(client);

      const result = await service.applyTemplate('t1', 'g1', 'i1', { template_id: 'tpl1' } as never);

      expect(client.celebrationSchedule.create).not.toHaveBeenCalled();
      expect(client.celebrationMinistry.createMany).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 's1', ministries: [] });
    });
  });

  describe('materializePeriodWithStatus', () => {
    it('retorna vazio quando materializeInstancesForPeriod não gera nenhuma instância', async () => {
      const client = clientWith();
      const { service, instances } = serviceWith(client, {
        materializeInstancesForPeriod: jest.fn().mockResolvedValue([]),
      });

      const result = await service.materializePeriodWithStatus(
        't1',
        'g1',
        'c1',
        new Date('2026-09-01'),
        new Date('2026-09-30'),
      );

      expect(result).toEqual([]);
      expect(instances.materializeInstancesForPeriod).toHaveBeenCalledWith(
        't1',
        'g1',
        'c1',
        new Date('2026-09-01'),
        new Date('2026-09-30'),
      );
    });

    it('anexa schedule_status de cada instância (ou null quando não há escala)', async () => {
      const client = clientWith();
      client.celebrationSchedule.findMany.mockResolvedValue([
        { celebration_instance_id: 'i1', status: 'published' },
      ]);
      const { service } = serviceWith(client, {
        materializeInstancesForPeriod: jest
          .fn()
          .mockResolvedValue([{ id: 'i1' }, { id: 'i2' }] as never),
      });

      const result = await service.materializePeriodWithStatus(
        't1',
        'g1',
        'c1',
        new Date('2026-09-01'),
        new Date('2026-09-30'),
      );

      expect(result).toEqual([
        { id: 'i1', schedule_status: 'published' },
        { id: 'i2', schedule_status: null },
      ]);
    });
  });
});
