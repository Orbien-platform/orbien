import { NotFoundException } from '@nestjs/common';
import { SetlistsService } from './setlists.service';
import { PrismaService } from '../prisma/prisma.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    serviceOrderItem: { findFirst: jest.fn() },
    setlist: { findUnique: jest.fn(), create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  const prisma = { client } as unknown as PrismaService;
  return new SetlistsService(prisma);
}

describe('SetlistsService', () => {
  describe('create', () => {
    it('lança NotFoundException quando o item de OC não existe', async () => {
      const client = clientWith();
      client.serviceOrderItem.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.create('t1', 'g1', { service_order_item_id: 'item1' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retorna a setlist existente (idempotente) sem criar outra', async () => {
      const client = clientWith();
      client.serviceOrderItem.findFirst.mockResolvedValue({ id: 'item1' });
      client.setlist.findUnique.mockResolvedValue({ id: 'sl1' });
      const service = serviceWith(client);

      const result = await service.create('t1', 'g1', { service_order_item_id: 'item1' } as never);

      expect(result).toEqual({ id: 'sl1' });
      expect(client.setlist.create).not.toHaveBeenCalled();
    });

    it('cria a setlist quando não existe', async () => {
      const client = clientWith();
      client.serviceOrderItem.findFirst.mockResolvedValue({ id: 'item1' });
      client.setlist.findUnique.mockResolvedValue(null);
      client.setlist.create.mockResolvedValue({ id: 'sl1' });
      const service = serviceWith(client);

      const result = await service.create('t1', 'g1', { service_order_item_id: 'item1' } as never);

      expect(client.setlist.create).toHaveBeenCalledWith({
        data: { tenant_id: 't1', congregation_id: 'g1', service_order_item_id: 'item1' },
        include: { songs: { orderBy: { sequence: 'asc' } } },
      });
      expect(result).toEqual({ id: 'sl1' });
    });
  });

  describe('findOne', () => {
    it('retorna a setlist quando encontrada', async () => {
      const client = clientWith();
      client.setlist.findFirst.mockResolvedValue({ id: 'sl1' });
      const service = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'sl1')).resolves.toEqual({ id: 'sl1' });
    });

    it('lança NotFoundException quando não encontrada', async () => {
      const client = clientWith();
      client.setlist.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('remove a setlist existente', async () => {
      const client = clientWith();
      client.setlist.findFirst.mockResolvedValue({ id: 'sl1' });
      client.setlist.delete.mockResolvedValue({ id: 'sl1' });
      const service = serviceWith(client);

      await expect(service.remove('t1', 'g1', 'sl1')).resolves.toEqual({ id: 'sl1' });
    });

    it('lança NotFoundException quando não existe', async () => {
      const client = clientWith();
      client.setlist.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.remove('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
