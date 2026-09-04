import { ConflictException, NotFoundException } from '@nestjs/common';
import { GroupTypesService } from './group-types.service';
import { PrismaService } from '../../prisma/prisma.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    groupType: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    smallGroup: { count: jest.fn() },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  const prisma = { client } as unknown as PrismaService;
  return new GroupTypesService(prisma);
}

describe('GroupTypesService', () => {
  describe('findAll', () => {
    it('filtra apenas ativos por padrão', async () => {
      const client = clientWith();
      client.groupType.findMany.mockResolvedValue([{ id: 'gt1' }]);
      const service = serviceWith(client);

      await service.findAll('t1', 'g1');

      expect(client.groupType.findMany).toHaveBeenCalledWith({
        where: { tenant_id: 't1', congregation_id: 'g1', is_active: true },
        orderBy: { name: 'asc' },
      });
    });

    it('inclui inativos quando includeInactive é true', async () => {
      const client = clientWith();
      client.groupType.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      await service.findAll('t1', 'g1', true);

      expect(client.groupType.findMany).toHaveBeenCalledWith({
        where: { tenant_id: 't1', congregation_id: 'g1' },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findOne', () => {
    it('retorna o tipo quando encontrado', async () => {
      const client = clientWith();
      client.groupType.findFirst.mockResolvedValue({ id: 'gt1' });
      const service = serviceWith(client);

      expect(await service.findOne('t1', 'g1', 'gt1')).toEqual({ id: 'gt1' });
    });

    it('lança NotFoundException quando não encontrado', async () => {
      const client = clientWith();
      client.groupType.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'gt1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('cria com color nulo quando não informada', async () => {
      const client = clientWith();
      client.groupType.create.mockResolvedValue({ id: 'gt1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', { name: 'Célula' } as never);

      expect(client.groupType.create).toHaveBeenCalledWith({
        data: { tenant_id: 't1', congregation_id: 'g1', name: 'Célula', color: null },
      });
    });

    it('cria com color informada', async () => {
      const client = clientWith();
      client.groupType.create.mockResolvedValue({ id: 'gt1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', { name: 'Célula', color: '#FFFFFF' } as never);

      expect(client.groupType.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ color: '#FFFFFF' }) }),
      );
    });
  });

  describe('update', () => {
    it('atualiza apenas os campos informados', async () => {
      const client = clientWith();
      client.groupType.findFirst.mockResolvedValue({ id: 'gt1' });
      client.groupType.update.mockResolvedValue({ id: 'gt1', name: 'Novo nome' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'gt1', { name: 'Novo nome' } as never);

      expect(client.groupType.update).toHaveBeenCalledWith({ where: { id: 'gt1' }, data: { name: 'Novo nome' } });
    });

    it('atualiza color quando informada', async () => {
      const client = clientWith();
      client.groupType.findFirst.mockResolvedValue({ id: 'gt1' });
      client.groupType.update.mockResolvedValue({ id: 'gt1', color: '#000000' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'gt1', { color: '#000000' } as never);

      expect(client.groupType.update).toHaveBeenCalledWith({
        where: { id: 'gt1' },
        data: { color: '#000000' },
      });
    });

    it('lança NotFoundException quando o tipo não existe', async () => {
      const client = clientWith();
      client.groupType.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.update('t1', 'g1', 'gt1', {} as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('deactivate', () => {
    it('desativa quando não há grupos vinculados', async () => {
      const client = clientWith();
      client.groupType.findFirst.mockResolvedValue({ id: 'gt1' });
      client.smallGroup.count.mockResolvedValue(0);
      client.groupType.update.mockResolvedValue({ id: 'gt1', is_active: false });
      const service = serviceWith(client);

      const result = await service.deactivate('t1', 'g1', 'gt1');

      expect(client.groupType.update).toHaveBeenCalledWith({
        where: { id: 'gt1' },
        data: { is_active: false },
      });
      expect(result).toEqual({ id: 'gt1', is_active: false });
    });

    it('rejeita desativar quando há grupos vinculados', async () => {
      const client = clientWith();
      client.groupType.findFirst.mockResolvedValue({ id: 'gt1' });
      client.smallGroup.count.mockResolvedValue(3);
      const service = serviceWith(client);

      await expect(service.deactivate('t1', 'g1', 'gt1')).rejects.toBeInstanceOf(ConflictException);
      expect(client.groupType.update).not.toHaveBeenCalled();
    });

    it('lança NotFoundException quando o tipo não existe', async () => {
      const client = clientWith();
      client.groupType.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.deactivate('t1', 'g1', 'gt1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
