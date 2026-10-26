import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { KidsTemplateService } from './kids-template.service';
import { PrismaService } from '../../prisma/prisma.service';

function clientWith() {
  return {
    celebration: { findFirst: jest.fn(), update: jest.fn() },
    kidsRoom: { findMany: jest.fn() },
    celebrationInstance: { findMany: jest.fn() },
    kidsSession: { createMany: jest.fn() },
  };
}
const serviceWith = (client: ReturnType<typeof clientWith>) =>
  new KidsTemplateService({ client } as unknown as PrismaService);

const room = (id: string, extra = {}) => ({ id, is_active: true, ...extra });

describe('KidsTemplateService', () => {
  describe('get', () => {
    it('404 quando a celebração não é da congregação', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue(null);
      await expect(serviceWith(client).get('t1', 'g1', 'c1')).rejects.toBeInstanceOf(NotFoundException);
      expect(client.celebration.findFirst).toHaveBeenCalledWith({
        where: { id: 'c1', tenant_id: 't1', congregation_id: 'g1' },
        select: { id: true, kids_default_room_ids: true },
      });
    });

    it('devolve as turmas do modelo por idade; sem modelo, lista vazia', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1', kids_default_room_ids: ['r1', 'r2'] });
      client.kidsRoom.findMany.mockResolvedValue([room('r1'), room('r2', { is_active: false })]);

      const out = await serviceWith(client).get('t1', 'g1', 'c1');

      expect(client.kidsRoom.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['r1', 'r2'] }, tenant_id: 't1', congregation_id: 'g1' },
        orderBy: [{ min_age_months: 'asc' }, { name: 'asc' }],
      });
      expect(out.rooms.map((r) => r.id)).toEqual(['r1', 'r2']);

      client.celebration.findFirst.mockResolvedValue({ id: 'c1', kids_default_room_ids: [] });
      client.kidsRoom.findMany.mockClear();
      expect((await serviceWith(client).get('t1', 'g1', 'c1')).rooms).toEqual([]);
      expect(client.kidsRoom.findMany).not.toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('grava o modelo da celebração', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1' });
      client.kidsRoom.findMany.mockResolvedValue([room('r1'), room('r2')]);
      client.celebration.update.mockResolvedValue({ id: 'c1', kids_default_room_ids: ['r1', 'r2'] });

      await serviceWith(client).set('t1', 'g1', 'c1', ['r1', 'r2']);

      expect(client.celebration.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { kids_default_room_ids: ['r1', 'r2'] },
        select: { id: true, kids_default_room_ids: true },
      });
    });

    it('lista vazia limpa o modelo sem consultar turmas', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1' });
      client.celebration.update.mockResolvedValue({ id: 'c1', kids_default_room_ids: [] });

      await serviceWith(client).set('t1', 'g1', 'c1', []);

      expect(client.kidsRoom.findMany).not.toHaveBeenCalled();
      expect(client.celebration.update.mock.calls[0][0].data).toEqual({ kids_default_room_ids: [] });
    });

    it('404 quando a celebração não existe', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue(null);
      await expect(serviceWith(client).set('t1', 'g1', 'c1', ['r1'])).rejects.toBeInstanceOf(NotFoundException);
      expect(client.celebration.update).not.toHaveBeenCalled();
    });

    it('404 quando alguma turma não é da congregação', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1' });
      client.kidsRoom.findMany.mockResolvedValue([room('r1')]);
      await expect(serviceWith(client).set('t1', 'g1', 'c1', ['r1', 'r9'])).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(client.celebration.update).not.toHaveBeenCalled();
    });

    it('422 quando alguma turma está desativada', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1' });
      client.kidsRoom.findMany.mockResolvedValue([room('r1', { is_active: false })]);
      await expect(serviceWith(client).set('t1', 'g1', 'c1', ['r1'])).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(client.celebration.update).not.toHaveBeenCalled();
    });
  });

  describe('apply (AC 7)', () => {
    const today = new Date('2026-10-26T15:00:00Z');
    function ready() {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1', kids_default_room_ids: ['r1', 'r2'] });
      client.kidsRoom.findMany.mockResolvedValue([room('r1'), room('r2')]);
      client.celebrationInstance.findMany.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }]);
      client.kidsSession.createMany.mockResolvedValue({ count: 6 });
      return client;
    }

    it('abre as turmas do modelo em todas as próximas instâncias', async () => {
      const client = ready();

      const out = await serviceWith(client).apply('t1', 'g1', 'c1', {}, today);

      expect(client.celebrationInstance.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 't1',
          congregation_id: 'g1',
          celebration_id: 'c1',
          status: { notIn: ['cancelled', 'finalized'] },
          scheduled_date: { gte: new Date('2026-10-26T00:00:00Z') },
        },
        select: { id: true },
      });
      const call = client.kidsSession.createMany.mock.calls[0][0];
      expect(call.skipDuplicates).toBe(true);
      expect(call.data).toHaveLength(6);
      expect(call.data).toContainEqual({
        tenant_id: 't1',
        congregation_id: 'g1',
        celebration_instance_id: 'i3',
        room_id: 'r2',
      });
      expect(out).toEqual({ instances: 3, created: 6, already_open: 0, skipped_rooms: 0 });
    });

    it('respeita a janela date_from/date_to', async () => {
      const client = ready();
      await serviceWith(client).apply('t1', 'g1', 'c1', { date_from: '2026-11-01', date_to: '2026-11-30' }, today);
      expect(client.celebrationInstance.findMany.mock.calls[0][0].where.scheduled_date).toEqual({
        gte: new Date('2026-11-01T00:00:00Z'),
        lte: new Date('2026-11-30T00:00:00Z'),
      });
    });

    it('é idempotente: par que já existe conta como already_open, sem erro', async () => {
      const client = ready();
      client.kidsSession.createMany.mockResolvedValue({ count: 4 });
      const out = await serviceWith(client).apply('t1', 'g1', 'c1', {}, today);
      expect(out).toMatchObject({ created: 4, already_open: 2 });
    });

    it('pula turma desativada ou apagada desde que o modelo foi gravado', async () => {
      const client = ready();
      client.kidsRoom.findMany.mockResolvedValue([room('r1'), room('r2', { is_active: false })]);
      client.kidsSession.createMany.mockResolvedValue({ count: 3 });

      const out = await serviceWith(client).apply('t1', 'g1', 'c1', {}, today);

      expect(client.kidsSession.createMany.mock.calls[0][0].data.map((d: { room_id: string }) => d.room_id)).toEqual([
        'r1',
        'r1',
        'r1',
      ]);
      expect(out).toEqual({ instances: 3, created: 3, already_open: 0, skipped_rooms: 1 });
    });

    it('sem instâncias na janela, não grava nada', async () => {
      const client = ready();
      client.celebrationInstance.findMany.mockResolvedValue([]);
      const out = await serviceWith(client).apply('t1', 'g1', 'c1', {}, today);
      expect(client.kidsSession.createMany).not.toHaveBeenCalled();
      expect(out).toEqual({ instances: 0, created: 0, already_open: 0, skipped_rooms: 0 });
    });

    it('422 quando a celebração não tem modelo', async () => {
      const client = ready();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1', kids_default_room_ids: [] });
      await expect(serviceWith(client).apply('t1', 'g1', 'c1', {}, today)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(client.kidsSession.createMany).not.toHaveBeenCalled();
    });

    it('422 quando nenhuma turma do modelo está ativa', async () => {
      const client = ready();
      client.kidsRoom.findMany.mockResolvedValue([room('r1', { is_active: false })]);
      await expect(serviceWith(client).apply('t1', 'g1', 'c1', {}, today)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('404 quando a celebração não existe', async () => {
      const client = ready();
      client.celebration.findFirst.mockResolvedValue(null);
      await expect(serviceWith(client).apply('t1', 'g1', 'c1', {}, today)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
