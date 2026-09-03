import { ConflictException, NotFoundException } from '@nestjs/common';
import { ScheduleTemplateService } from './schedule-template.service';
import { PrismaService } from '../prisma/prisma.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    ministry: { findMany: jest.fn() },
    scheduleTemplate: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    scheduleTemplateMinistry: { deleteMany: jest.fn(), createMany: jest.fn() },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  const runInTx = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client));
  const prisma = { client, runInTx } as unknown as PrismaService;
  return { service: new ScheduleTemplateService(prisma), runInTx };
}

describe('ScheduleTemplateService', () => {
  describe('findAll', () => {
    it('lista os templates do tenant/congregação', async () => {
      const client = clientWith();
      client.scheduleTemplate.findMany.mockResolvedValue([{ id: 'tpl1' }]);
      const { service } = serviceWith(client);

      const result = await service.findAll('t1', 'g1');

      expect(client.scheduleTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenant_id: 't1', congregation_id: 'g1' } }),
      );
      expect(result).toEqual([{ id: 'tpl1' }]);
    });
  });

  describe('findOne', () => {
    it('retorna o template quando encontrado', async () => {
      const client = clientWith();
      client.scheduleTemplate.findFirst.mockResolvedValue({ id: 'tpl1' });
      const { service } = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'tpl1')).resolves.toEqual({ id: 'tpl1' });
    });

    it('lança NotFoundException quando não encontrado', async () => {
      const client = clientWith();
      client.scheduleTemplate.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('cria o template quando não há ministérios (assertMinistries curto-circuita)', async () => {
      const client = clientWith();
      client.scheduleTemplate.create.mockResolvedValue({ id: 'tpl1' });
      const { service } = serviceWith(client);

      await service.create('t1', 'g1', { name: 'Padrão', ministries: [] } as never);

      expect(client.ministry.findMany).not.toHaveBeenCalled();
      expect(client.scheduleTemplate.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          name: 'Padrão',
          description: undefined,
          ministries: { create: [] },
        },
        include: expect.anything(),
      });
    });

    it('lança ConflictException quando há ministério repetido', async () => {
      const client = clientWith();
      const { service } = serviceWith(client);

      await expect(
        service.create('t1', 'g1', {
          name: 'Padrão',
          ministries: [
            { ministry_id: 'm1', slots: 1 },
            { ministry_id: 'm1', slots: 2 },
          ],
        } as never),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(client.ministry.findMany).not.toHaveBeenCalled();
    });

    it('lança NotFoundException quando algum ministério não existe no tenant', async () => {
      const client = clientWith();
      client.ministry.findMany.mockResolvedValue([{ id: 'm1' }]);
      const { service } = serviceWith(client);

      await expect(
        service.create('t1', 'g1', {
          name: 'Padrão',
          ministries: [
            { ministry_id: 'm1', slots: 1 },
            { ministry_id: 'm2', slots: 1 },
          ],
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cria o template com os ministérios válidos', async () => {
      const client = clientWith();
      client.ministry.findMany.mockResolvedValue([{ id: 'm1' }]);
      client.scheduleTemplate.create.mockResolvedValue({ id: 'tpl1' });
      const { service } = serviceWith(client);

      await service.create('t1', 'g1', {
        name: 'Padrão',
        description: 'desc',
        ministries: [{ ministry_id: 'm1', slots: 2 }],
      } as never);

      expect(client.scheduleTemplate.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          name: 'Padrão',
          description: 'desc',
          ministries: {
            create: [{ tenant_id: 't1', congregation_id: 'g1', ministry_id: 'm1', slots: 2 }],
          },
        },
        include: expect.anything(),
      });
    });
  });

  describe('update', () => {
    it('atualiza campos e substitui a lista de ministérios quando informada', async () => {
      const client = clientWith();
      client.scheduleTemplate.findFirst.mockResolvedValue({ id: 'tpl1' });
      client.ministry.findMany.mockResolvedValue([{ id: 'm2' }]);
      client.scheduleTemplate.update.mockResolvedValue({ id: 'tpl1' });
      const { service } = serviceWith(client);

      await service.update('t1', 'g1', 'tpl1', {
        name: 'Novo nome',
        description: 'nova desc',
        is_active: false,
        ministries: [{ ministry_id: 'm2', slots: 3 }],
      } as never);

      expect(client.scheduleTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl1' },
        data: { name: 'Novo nome', description: 'nova desc', is_active: false },
      });
      expect(client.scheduleTemplateMinistry.deleteMany).toHaveBeenCalledWith({
        where: { template_id: 'tpl1' },
      });
      expect(client.scheduleTemplateMinistry.createMany).toHaveBeenCalledWith({
        data: [{ tenant_id: 't1', congregation_id: 'g1', template_id: 'tpl1', ministry_id: 'm2', slots: 3 }],
      });
    });

    it('zera os vínculos sem chamar createMany quando ministries é lista vazia', async () => {
      const client = clientWith();
      client.scheduleTemplate.findFirst.mockResolvedValue({ id: 'tpl1' });
      client.scheduleTemplate.update.mockResolvedValue({ id: 'tpl1' });
      const { service } = serviceWith(client);

      await service.update('t1', 'g1', 'tpl1', { ministries: [] } as never);

      expect(client.scheduleTemplateMinistry.deleteMany).toHaveBeenCalled();
      expect(client.scheduleTemplateMinistry.createMany).not.toHaveBeenCalled();
    });

    it('não mexe nos ministérios nem valida quando ministries ausente', async () => {
      const client = clientWith();
      client.scheduleTemplate.findFirst.mockResolvedValue({ id: 'tpl1' });
      client.scheduleTemplate.update.mockResolvedValue({ id: 'tpl1' });
      const { service } = serviceWith(client);

      await service.update('t1', 'g1', 'tpl1', {} as never);

      expect(client.ministry.findMany).not.toHaveBeenCalled();
      expect(client.scheduleTemplateMinistry.deleteMany).not.toHaveBeenCalled();
      expect(client.scheduleTemplate.update).toHaveBeenCalledWith({ where: { id: 'tpl1' }, data: {} });
    });

    it('lança NotFoundException quando o template não existe', async () => {
      const client = clientWith();
      client.scheduleTemplate.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.update('t1', 'g1', 'nope', {} as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('valida os ministérios antes de abrir a transação (falha sem chamar runInTx)', async () => {
      const client = clientWith();
      client.scheduleTemplate.findFirst.mockResolvedValue({ id: 'tpl1' });
      client.ministry.findMany.mockResolvedValue([]);
      const { service, runInTx } = serviceWith(client);

      await expect(
        service.update('t1', 'g1', 'tpl1', { ministries: [{ ministry_id: 'nope', slots: 1 }] } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(runInTx).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('remove o template existente', async () => {
      const client = clientWith();
      client.scheduleTemplate.findFirst.mockResolvedValue({ id: 'tpl1' });
      client.scheduleTemplate.delete.mockResolvedValue({ id: 'tpl1' });
      const { service } = serviceWith(client);

      await expect(service.remove('t1', 'g1', 'tpl1')).resolves.toEqual({ id: 'tpl1' });
    });

    it('lança NotFoundException quando o template não existe', async () => {
      const client = clientWith();
      client.scheduleTemplate.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.remove('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
