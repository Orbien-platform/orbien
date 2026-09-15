import { NotFoundException } from '@nestjs/common';
import { NetworksService } from './networks.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['pastor'],
  plan: 'premium',
};

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    network: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  const prisma = { client } as unknown as PrismaService;
  return new NetworksService(prisma);
}

describe('NetworksService', () => {
  describe('create', () => {
    it('cria a rede com tenant_id/congregation_id do usuário', async () => {
      const client = clientWith();
      client.network.create.mockResolvedValue({ id: 'n1', name: 'Rede Central' });
      const service = serviceWith(client);

      const result = await service.create({ name: 'Rede Central' }, USER);

      expect(client.network.create).toHaveBeenCalledWith({
        data: { name: 'Rede Central', tenant_id: 't1', congregation_id: 'g1' },
      });
      expect(result).toEqual({ id: 'n1', name: 'Rede Central' });
    });
  });

  describe('findAll', () => {
    it('lista as redes ordenadas por nome', async () => {
      const client = clientWith();
      client.network.findMany.mockResolvedValue([{ id: 'n1' }]);
      const service = serviceWith(client);

      const result = await service.findAll();

      expect(client.network.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
      expect(result).toEqual([{ id: 'n1' }]);
    });
  });

  describe('findOne', () => {
    it('lança NotFoundException quando a rede não existe', async () => {
      const client = clientWith();
      client.network.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retorna a rede quando existe', async () => {
      const client = clientWith();
      client.network.findUnique.mockResolvedValue({ id: 'n1', name: 'Rede Central' });
      const service = serviceWith(client);

      const result = await service.findOne('n1');

      expect(result).toEqual({ id: 'n1', name: 'Rede Central' });
    });
  });

  describe('update', () => {
    it('lança NotFoundException quando a rede não existe', async () => {
      const client = clientWith();
      client.network.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.update('nope', { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('atualiza a rede quando existe', async () => {
      const client = clientWith();
      client.network.findUnique.mockResolvedValue({ id: 'n1' });
      client.network.update.mockResolvedValue({ id: 'n1', name: 'Rede Renomeada' });
      const service = serviceWith(client);

      const result = await service.update('n1', { name: 'Rede Renomeada' });

      expect(client.network.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { name: 'Rede Renomeada' },
      });
      expect(result).toEqual({ id: 'n1', name: 'Rede Renomeada' });
    });
  });

  describe('remove', () => {
    it('lança NotFoundException quando a rede não existe', async () => {
      const client = clientWith();
      client.network.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('remove a rede quando existe', async () => {
      const client = clientWith();
      client.network.findUnique.mockResolvedValue({ id: 'n1' });
      client.network.delete.mockResolvedValue({ id: 'n1' });
      const service = serviceWith(client);

      const result = await service.remove('n1');

      expect(client.network.delete).toHaveBeenCalledWith({ where: { id: 'n1' } });
      expect(result).toEqual({ id: 'n1' });
    });
  });
});
