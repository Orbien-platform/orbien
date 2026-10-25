import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ServiceOrderTemplatesService } from './service-order-templates.service';
import { PrismaService } from '../prisma/prisma.service';

function clientWith() {
  return {
    serviceOrderTemplate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    serviceOrder: { findFirst: jest.fn() },
  };
}

function txWith() {
  return {
    serviceOrderItem: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      aggregate: jest.fn().mockResolvedValue({ _max: { sequence: null } }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function serviceWith(client: ReturnType<typeof clientWith>, tx = txWith()) {
  const runInTx = jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx));
  const prisma = { client, runInTx } as unknown as PrismaService;
  return { service: new ServiceOrderTemplatesService(prisma), tx, runInTx };
}

const templateItem = (over: Record<string, unknown> = {}) => ({
  sequence: 1,
  name: 'Abertura',
  type: 'other',
  start_offset_minutes: 0,
  duration_minutes: 5,
  phase: 'during',
  entry_kind: 'program',
  responsible_type: 'free_text',
  person_id: null,
  ministry_id: null,
  responsible_label: 'Dirigente',
  notes: null,
  ...over,
});

describe('ServiceOrderTemplatesService', () => {
  describe('findAll / findOne', () => {
    it('lista os moldes da congregação por nome', async () => {
      const client = clientWith();
      client.serviceOrderTemplate.findMany.mockResolvedValue([{ id: 'tpl1' }]);
      const { service } = serviceWith(client);

      expect(await service.findAll('t1', 'g1')).toEqual([{ id: 'tpl1' }]);
      expect(client.serviceOrderTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: 't1', congregation_id: 'g1' },
          orderBy: { name: 'asc' },
        }),
      );
    });

    it('lança NotFoundException quando o molde não existe', async () => {
      const client = clientWith();
      client.serviceOrderTemplate.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createFromOrder', () => {
    const dto = { name: 'Domingo', service_order_id: 'so1' };

    it('lança NotFoundException quando a OC não existe', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.createFromOrder('t1', 'g1', dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('recusa salvar molde de OC sem etapas', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1', items: [] });
      const { service } = serviceWith(client);

      await expect(service.createFromOrder('t1', 'g1', dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(client.serviceOrderTemplate.create).not.toHaveBeenCalled();
    });

    it('copia as etapas e guarda o nome de quem era o responsável', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({
        id: 'so1',
        items: [
          { ...templateItem({ sequence: 1, responsible_type: 'person', person_id: 'p1', responsible_label: null }), person: { full_name: 'Ana' }, ministry: null },
          { ...templateItem({ sequence: 2, responsible_type: 'ministry', ministry_id: 'm1', responsible_label: null }), person: null, ministry: { name: 'Louvor' } },
          { ...templateItem({ sequence: 3 }), person: null, ministry: null },
        ],
      });
      client.serviceOrderTemplate.create.mockResolvedValue({ id: 'tpl1' });
      const { service } = serviceWith(client);

      await service.createFromOrder('t1', 'g1', { ...dto, description: 'd' });

      const data = client.serviceOrderTemplate.create.mock.calls[0][0].data;
      expect(data).toEqual(
        expect.objectContaining({ tenant_id: 't1', congregation_id: 'g1', name: 'Domingo', description: 'd' }),
      );
      expect(data.items.create.map((i: { responsible_label: string }) => i.responsible_label)).toEqual([
        'Ana',
        'Louvor',
        'Dirigente',
      ]);
      expect(data.items.create[0]).toEqual(
        expect.objectContaining({ tenant_id: 't1', congregation_id: 'g1', person_id: 'p1', sequence: 1 }),
      );
    });
  });

  describe('update / remove', () => {
    it('renomeia o molde', async () => {
      const client = clientWith();
      client.serviceOrderTemplate.findFirst.mockResolvedValue({ id: 'tpl1' });
      client.serviceOrderTemplate.update.mockResolvedValue({ id: 'tpl1', name: 'Novo' });
      const { service } = serviceWith(client);

      await service.update('t1', 'g1', 'tpl1', { name: 'Novo', description: 'x' });

      expect(client.serviceOrderTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tpl1' }, data: { name: 'Novo', description: 'x' } }),
      );
    });

    it('não altera campos que não vieram', async () => {
      const client = clientWith();
      client.serviceOrderTemplate.findFirst.mockResolvedValue({ id: 'tpl1' });
      const { service } = serviceWith(client);

      await service.update('t1', 'g1', 'tpl1', {});

      expect(client.serviceOrderTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: {} }),
      );
    });

    it('update e remove lançam NotFoundException para molde inexistente', async () => {
      const client = clientWith();
      client.serviceOrderTemplate.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.update('t1', 'g1', 'x', { name: 'a' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove('t1', 'g1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('remove o molde', async () => {
      const client = clientWith();
      client.serviceOrderTemplate.findFirst.mockResolvedValue({ id: 'tpl1' });
      client.serviceOrderTemplate.delete.mockResolvedValue({ id: 'tpl1' });
      const { service } = serviceWith(client);

      expect(await service.remove('t1', 'g1', 'tpl1')).toEqual({ id: 'tpl1' });
      expect(client.serviceOrderTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tpl1' } });
    });
  });

  describe('apply', () => {
    const dto = { service_order_id: 'so1' };

    it('lança NotFoundException quando o molde ou a OC não existem', async () => {
      const client = clientWith();
      client.serviceOrderTemplate.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);
      await expect(service.apply('t1', 'g1', 'tpl1', dto)).rejects.toBeInstanceOf(NotFoundException);

      client.serviceOrderTemplate.findFirst.mockResolvedValue({ id: 'tpl1', items: [] });
      client.serviceOrder.findFirst.mockResolvedValue(null);
      await expect(service.apply('t1', 'g1', 'tpl1', dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('acrescenta as etapas depois das que já existem', async () => {
      const client = clientWith();
      client.serviceOrderTemplate.findFirst.mockResolvedValue({
        id: 'tpl1',
        items: [templateItem({ sequence: 1 }), templateItem({ sequence: 2, name: 'Palavra' })],
      });
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1' });
      const tx = txWith();
      tx.serviceOrderItem.aggregate.mockResolvedValue({ _max: { sequence: 4 } });
      const { service } = serviceWith(client, tx);

      const result = await service.apply('t1', 'g1', 'tpl1', dto);

      expect(result).toEqual({ created: 2, replaced: 0 });
      expect(tx.serviceOrderItem.deleteMany).not.toHaveBeenCalled();
      const rows = tx.serviceOrderItem.createMany.mock.calls[0][0].data;
      expect(rows.map((r: { sequence: number }) => r.sequence)).toEqual([5, 6]);
      expect(rows[0]).toEqual(
        expect.objectContaining({ tenant_id: 't1', congregation_id: 'g1', service_order_id: 'so1' }),
      );
    });

    it('começa do 1 quando a OC está vazia', async () => {
      const client = clientWith();
      client.serviceOrderTemplate.findFirst.mockResolvedValue({ id: 'tpl1', items: [templateItem()] });
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1' });
      const tx = txWith();
      const { service } = serviceWith(client, tx);

      await service.apply('t1', 'g1', 'tpl1', dto);

      expect(tx.serviceOrderItem.createMany.mock.calls[0][0].data[0].sequence).toBe(1);
    });

    it('com replace apaga as etapas atuais antes de aplicar', async () => {
      const client = clientWith();
      client.serviceOrderTemplate.findFirst.mockResolvedValue({ id: 'tpl1', items: [templateItem()] });
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1' });
      const tx = txWith();
      tx.serviceOrderItem.deleteMany.mockResolvedValue({ count: 3 });
      const { service } = serviceWith(client, tx);

      const result = await service.apply('t1', 'g1', 'tpl1', { ...dto, replace: true });

      expect(result).toEqual({ created: 1, replaced: 3 });
      expect(tx.serviceOrderItem.deleteMany).toHaveBeenCalledWith({ where: { service_order_id: 'so1' } });
      expect(tx.serviceOrderItem.aggregate).not.toHaveBeenCalled();
      expect(tx.serviceOrderItem.createMany.mock.calls[0][0].data[0].sequence).toBe(1);
    });

    it('mantém pessoa e ministério vivos e descarta o nome guardado', async () => {
      const client = clientWith();
      client.serviceOrderTemplate.findFirst.mockResolvedValue({
        id: 'tpl1',
        items: [
          templateItem({ responsible_type: 'person', person_id: 'p1', responsible_label: 'Ana' }),
          templateItem({ responsible_type: 'ministry', ministry_id: 'm1', responsible_label: 'Louvor' }),
          templateItem({ responsible_type: 'free_text', responsible_label: 'Dirigente' }),
        ],
      });
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1' });
      const tx = txWith();
      const { service } = serviceWith(client, tx);

      await service.apply('t1', 'g1', 'tpl1', dto);

      const rows = tx.serviceOrderItem.createMany.mock.calls[0][0].data;
      expect(rows[0]).toEqual(expect.objectContaining({ responsible_type: 'person', person_id: 'p1', responsible_label: null }));
      expect(rows[1]).toEqual(expect.objectContaining({ responsible_type: 'ministry', ministry_id: 'm1', responsible_label: null }));
      expect(rows[2]).toEqual(expect.objectContaining({ responsible_type: 'free_text', responsible_label: 'Dirigente' }));
    });

    it('vira texto livre quando a pessoa ou o ministério foi removido', async () => {
      const client = clientWith();
      client.serviceOrderTemplate.findFirst.mockResolvedValue({
        id: 'tpl1',
        items: [
          templateItem({ responsible_type: 'person', person_id: null, responsible_label: 'Ana' }),
          templateItem({ responsible_type: 'ministry', ministry_id: null, responsible_label: null }),
        ],
      });
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1' });
      const tx = txWith();
      const { service } = serviceWith(client, tx);

      await service.apply('t1', 'g1', 'tpl1', dto);

      const rows = tx.serviceOrderItem.createMany.mock.calls[0][0].data;
      expect(rows[0]).toEqual(expect.objectContaining({ responsible_type: 'free_text', person_id: null, responsible_label: 'Ana' }));
      expect(rows[1]).toEqual(expect.objectContaining({ responsible_type: 'free_text', ministry_id: null, responsible_label: 'Responsável removido' }));
    });
  });
});
