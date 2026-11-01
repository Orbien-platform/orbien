import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KidsRoomsService } from './kids-rooms.service';
import { PrismaService } from '../../prisma/prisma.service';

function clientWith() {
  return {
    kidsRoom: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  return new KidsRoomsService({ client } as unknown as PrismaService);
}

const dto = { name: 'Maternal', min_age_months: 24, max_age_months: 47 };

describe('KidsRoomsService', () => {
  describe('create', () => {
    it('grava a turma na congregação do usuário, com padrões', async () => {
      const client = clientWith();
      client.kidsRoom.create.mockResolvedValue({ id: 'r1' });

      await serviceWith(client).create('t1', 'g1', dto);

      expect(client.kidsRoom.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          name: 'Maternal',
          min_age_months: 24,
          max_age_months: 47,
          allows_out_of_range: false,
          capacity: null,
          min_volunteers: 0,
        },
      });
    });

    it('respeita allows_out_of_range, capacity e min_volunteers informados', async () => {
      const client = clientWith();
      client.kidsRoom.create.mockResolvedValue({ id: 'r1' });

      await serviceWith(client).create('t1', 'g1', {
        ...dto,
        allows_out_of_range: true,
        capacity: 12,
        min_volunteers: 2,
      });

      expect(client.kidsRoom.create.mock.calls[0][0].data).toMatchObject({
        allows_out_of_range: true,
        capacity: 12,
        min_volunteers: 2,
      });
    });

    it('aceita min = max', async () => {
      const client = clientWith();
      client.kidsRoom.create.mockResolvedValue({ id: 'r1' });
      await serviceWith(client).create('t1', 'g1', { ...dto, min_age_months: 36, max_age_months: 36 });
      expect(client.kidsRoom.create).toHaveBeenCalledTimes(1);
    });

    it('responde 400 e não grava quando min > max', async () => {
      const client = clientWith();
      await expect(
        serviceWith(client).create('t1', 'g1', { ...dto, min_age_months: 48, max_age_months: 24 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.kidsRoom.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('lista só as ativas da congregação, por idade mínima', async () => {
      const client = clientWith();
      client.kidsRoom.findMany.mockResolvedValue([]);

      await serviceWith(client).findAll('t1', 'g1', {});

      expect(client.kidsRoom.findMany).toHaveBeenCalledWith({
        where: { tenant_id: 't1', congregation_id: 'g1', is_active: true },
        orderBy: [{ min_age_months: 'asc' }, { max_age_months: 'asc' }, { name: 'asc' }],
      });
    });

    it('inclui as desativadas quando pedido', async () => {
      const client = clientWith();
      client.kidsRoom.findMany.mockResolvedValue([]);

      await serviceWith(client).findAll('t1', 'g1', { include_inactive: true });

      expect(client.kidsRoom.findMany.mock.calls[0][0].where).toEqual({
        tenant_id: 't1',
        congregation_id: 'g1',
      });
    });
  });

  describe('update', () => {
    const existing = { id: 'r1', min_age_months: 24, max_age_months: 47 };

    it('404 quando a turma não é da congregação', async () => {
      const client = clientWith();
      client.kidsRoom.findFirst.mockResolvedValue(null);
      await expect(serviceWith(client).update('t1', 'g1', 'r1', { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(client.kidsRoom.findFirst).toHaveBeenCalledWith({
        where: { id: 'r1', tenant_id: 't1', congregation_id: 'g1' },
      });
      expect(client.kidsRoom.update).not.toHaveBeenCalled();
    });

    it('altera só o que veio', async () => {
      const client = clientWith();
      client.kidsRoom.findFirst.mockResolvedValue(existing);
      client.kidsRoom.update.mockResolvedValue({ id: 'r1' });

      await serviceWith(client).update('t1', 'g1', 'r1', { name: 'Berçário', allows_out_of_range: true });

      expect(client.kidsRoom.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { name: 'Berçário', allows_out_of_range: true },
      });
    });

    it('400 quando o novo min passa do max gravado', async () => {
      const client = clientWith();
      client.kidsRoom.findFirst.mockResolvedValue(existing);
      await expect(
        serviceWith(client).update('t1', 'g1', 'r1', { min_age_months: 60 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.kidsRoom.update).not.toHaveBeenCalled();
    });

    it('400 quando o novo max fica abaixo do min gravado', async () => {
      const client = clientWith();
      client.kidsRoom.findFirst.mockResolvedValue(existing);
      await expect(
        serviceWith(client).update('t1', 'g1', 'r1', { max_age_months: 12 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('aceita mover a faixa inteira', async () => {
      const client = clientWith();
      client.kidsRoom.findFirst.mockResolvedValue(existing);
      client.kidsRoom.update.mockResolvedValue({ id: 'r1' });
      await serviceWith(client).update('t1', 'g1', 'r1', { min_age_months: 60, max_age_months: 83 });
      expect(client.kidsRoom.update.mock.calls[0][0].data).toEqual({
        min_age_months: 60,
        max_age_months: 83,
      });
    });

    it('min_volunteers: grava o mínimo informado e 0 também vale (sem voluntários exigidos)', async () => {
      const client = clientWith();
      client.kidsRoom.findFirst.mockResolvedValue(existing);
      client.kidsRoom.update.mockResolvedValue({ id: 'r1' });
      await serviceWith(client).update('t1', 'g1', 'r1', { min_volunteers: 3 });
      expect(client.kidsRoom.update.mock.calls[0][0].data).toEqual({ min_volunteers: 3 });
      await serviceWith(client).update('t1', 'g1', 'r1', { min_volunteers: 0 });
      expect(client.kidsRoom.update.mock.calls[1][0].data).toEqual({ min_volunteers: 0 });
    });

    it('capacity null remove o limite; is_active reativa', async () => {
      const client = clientWith();
      client.kidsRoom.findFirst.mockResolvedValue(existing);
      client.kidsRoom.update.mockResolvedValue({ id: 'r1' });
      await serviceWith(client).update('t1', 'g1', 'r1', { capacity: null, is_active: true });
      expect(client.kidsRoom.update.mock.calls[0][0].data).toEqual({ capacity: null, is_active: true });
    });
  });

  describe('deactivate', () => {
    it('marca is_active=false em vez de apagar', async () => {
      const client = clientWith();
      client.kidsRoom.findFirst.mockResolvedValue({ id: 'r1' });
      client.kidsRoom.update.mockResolvedValue({ id: 'r1', is_active: false });

      const out = await serviceWith(client).deactivate('t1', 'g1', 'r1');

      expect(client.kidsRoom.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { is_active: false } });
      expect(out.is_active).toBe(false);
    });

    it('404 quando a turma não é da congregação', async () => {
      const client = clientWith();
      client.kidsRoom.findFirst.mockResolvedValue(null);
      await expect(serviceWith(client).deactivate('t1', 'g1', 'r1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
