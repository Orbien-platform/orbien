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
    smallGroup: { findMany: jest.fn() },
    groupMeeting: { groupBy: jest.fn() },
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

  describe('getGoalStatus', () => {
    const recent = new Date(); // < 14 dias → green

    it('lança NotFoundException quando a rede não existe', async () => {
      const client = clientWith();
      client.network.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.getGoalStatus('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('AC3: rede com meta atingida — 4 verdes e 1 vermelha de 5 células, meta 80% → current_pct 80, met true', async () => {
      const client = clientWith();
      client.network.findUnique.mockResolvedValue({ health_goal_pct: 80 });
      client.smallGroup.findMany.mockResolvedValue([
        { id: 'g1' }, { id: 'g2' }, { id: 'g3' }, { id: 'g4' }, { id: 'g5' },
      ]);
      client.groupMeeting.groupBy.mockResolvedValue([
        { small_group_id: 'g1', _max: { occurred_at: recent } },
        { small_group_id: 'g2', _max: { occurred_at: recent } },
        { small_group_id: 'g3', _max: { occurred_at: recent } },
        { small_group_id: 'g4', _max: { occurred_at: recent } },
      ]);
      const service = serviceWith(client);

      const result = await service.getGoalStatus('n1');

      expect(result).toEqual({
        goal_pct: 80,
        current_pct: 80,
        met: true,
        green: 4,
        yellow: 0,
        red: 1,
        total: 5,
      });
    });

    it('AC3: rede com meta não atingida — mais uma célula vermelha (6 total) → current_pct 66.67, met false', async () => {
      const client = clientWith();
      client.network.findUnique.mockResolvedValue({ health_goal_pct: 80 });
      client.smallGroup.findMany.mockResolvedValue([
        { id: 'g1' }, { id: 'g2' }, { id: 'g3' }, { id: 'g4' }, { id: 'g5' }, { id: 'g6' },
      ]);
      client.groupMeeting.groupBy.mockResolvedValue([
        { small_group_id: 'g1', _max: { occurred_at: recent } },
        { small_group_id: 'g2', _max: { occurred_at: recent } },
        { small_group_id: 'g3', _max: { occurred_at: recent } },
        { small_group_id: 'g4', _max: { occurred_at: recent } },
      ]);
      const service = serviceWith(client);

      const result = await service.getGoalStatus('n1');

      expect(result.current_pct).toBe(66.67);
      expect(result.met).toBe(false);
      expect(result.green).toBe(4);
      expect(result.red).toBe(2);
      expect(result.total).toBe(6);
    });

    it('AC4: rede sem meta definida — goal_pct e met são null, contagens continuam úteis', async () => {
      const client = clientWith();
      client.network.findUnique.mockResolvedValue({ health_goal_pct: null });
      client.smallGroup.findMany.mockResolvedValue([{ id: 'g1' }]);
      client.groupMeeting.groupBy.mockResolvedValue([
        { small_group_id: 'g1', _max: { occurred_at: recent } },
      ]);
      const service = serviceWith(client);

      const result = await service.getGoalStatus('n1');

      expect(result).toEqual({
        goal_pct: null,
        current_pct: 100,
        met: null,
        green: 1,
        yellow: 0,
        red: 0,
        total: 1,
      });
    });

    it('AC5: rede sem nenhuma célula vinculada — total 0, current_pct null, sem dividir por zero', async () => {
      const client = clientWith();
      client.network.findUnique.mockResolvedValue({ health_goal_pct: 80 });
      client.smallGroup.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      const result = await service.getGoalStatus('n1');

      expect(result).toEqual({
        goal_pct: 80,
        current_pct: null,
        met: null,
        green: 0,
        yellow: 0,
        red: 0,
        total: 0,
      });
      expect(client.groupMeeting.groupBy).not.toHaveBeenCalled();
    });

    it('célula sem GroupMeeting registrado conta como vermelha', async () => {
      const client = clientWith();
      client.network.findUnique.mockResolvedValue({ health_goal_pct: 50 });
      client.smallGroup.findMany.mockResolvedValue([{ id: 'g1' }]);
      client.groupMeeting.groupBy.mockResolvedValue([]);
      const service = serviceWith(client);

      const result = await service.getGoalStatus('n1');

      expect(result.red).toBe(1);
      expect(result.green).toBe(0);
    });
  });
});
