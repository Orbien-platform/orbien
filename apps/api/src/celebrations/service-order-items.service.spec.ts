import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ServiceOrderItemsService } from './service-order-items.service';
import { PrismaService } from '../prisma/prisma.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    serviceOrder: { findFirst: jest.fn() },
    person: { findFirst: jest.fn() },
    ministry: { findFirst: jest.fn() },
    serviceOrderItem: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    celebrationAssignment: { findMany: jest.fn() },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>, runInTx?: jest.Mock) {
  const prisma = {
    client,
    runInTx: runInTx ?? jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  } as unknown as PrismaService;
  return new ServiceOrderItemsService(prisma);
}

describe('ServiceOrderItemsService', () => {
  describe('create', () => {
    it('lança NotFoundException quando a OC não existe', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.create('t1', 'g1', { service_order_id: 'so1', responsible_type: 'free_text' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança BadRequestException quando responsible_type=person sem person_id', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1', celebrationInstance: { id: 'i1' } });
      const service = serviceWith(client);

      await expect(
        service.create('t1', 'g1', { service_order_id: 'so1', responsible_type: 'person' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança BadRequestException quando responsible_type=ministry sem ministry_id', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1', celebrationInstance: { id: 'i1' } });
      const service = serviceWith(client);

      await expect(
        service.create('t1', 'g1', { service_order_id: 'so1', responsible_type: 'ministry' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança BadRequestException quando responsible_type=free_text sem responsible_label', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1', celebrationInstance: { id: 'i1' } });
      const service = serviceWith(client);

      await expect(
        service.create('t1', 'g1', { service_order_id: 'so1', responsible_type: 'free_text' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança NotFoundException quando person_id informado não existe', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1', celebrationInstance: { id: 'i1' } });
      client.person.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.create('t1', 'g1', {
          service_order_id: 'so1',
          responsible_type: 'person',
          person_id: 'p1',
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança NotFoundException quando ministry_id informado não existe', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1', celebrationInstance: { id: 'i1' } });
      client.ministry.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.create('t1', 'g1', {
          service_order_id: 'so1',
          responsible_type: 'ministry',
          ministry_id: 'm1',
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cria o item com responsible_type=free_text', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1', celebrationInstance: { id: 'i1' } });
      client.serviceOrderItem.create.mockResolvedValue({ id: 'item1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', {
        service_order_id: 'so1',
        sequence: 1,
        name: 'Oração',
        start_offset_minutes: 0,
        duration_minutes: 5,
        responsible_type: 'free_text',
        responsible_label: 'Diácono',
      } as never);

      expect(client.serviceOrderItem.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          service_order_id: 'so1',
          sequence: 1,
          name: 'Oração',
          start_offset_minutes: 0,
          duration_minutes: 5,
          responsible_type: 'free_text',
          person_id: null,
          ministry_id: null,
          responsible_label: 'Diácono',
          notes: null,
        },
      });
    });

    it('cria o item com responsible_type=person válido', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1', celebrationInstance: { id: 'i1' } });
      client.person.findFirst.mockResolvedValue({ id: 'p1' });
      client.serviceOrderItem.create.mockResolvedValue({ id: 'item1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', {
        service_order_id: 'so1',
        sequence: 1,
        name: 'Pregação',
        start_offset_minutes: 30,
        duration_minutes: 30,
        responsible_type: 'person',
        person_id: 'p1',
        notes: 'obs',
      } as never);

      expect(client.serviceOrderItem.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ person_id: 'p1', notes: 'obs' }) }),
      );
    });

    it('cria o item com responsible_type=ministry válido', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1', celebrationInstance: { id: 'i1' } });
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.serviceOrderItem.create.mockResolvedValue({ id: 'item1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', {
        service_order_id: 'so1',
        sequence: 2,
        name: 'Louvor',
        start_offset_minutes: 10,
        duration_minutes: 20,
        responsible_type: 'ministry',
        ministry_id: 'm1',
      } as never);

      expect(client.serviceOrderItem.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ministry_id: 'm1' }) }),
      );
    });
  });

  describe('findAll', () => {
    it('anexa scheduled_volunteers só nos itens de ministério', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1', celebrationInstance: { id: 'i1' } });
      client.serviceOrderItem.findMany.mockResolvedValue([
        { id: 'item1', responsible_type: 'ministry', ministry_id: 'm1' },
        { id: 'item2', responsible_type: 'free_text', ministry_id: null },
      ]);
      client.celebrationAssignment.findMany.mockResolvedValue([
        {
          volunteerProfile: { person: { id: 'p1', full_name: 'Ana' } },
          celebrationMinistry: { ministry_id: 'm1' },
        },
        // Segundo voluntário confirmado no MESMO ministério: exercita o ramo
        // em que volunteersByMinistry[minId] já existe (não recria o array).
        {
          volunteerProfile: { person: { id: 'p2', full_name: 'Beto' } },
          celebrationMinistry: { ministry_id: 'm1' },
        },
      ]);
      const service = serviceWith(client);

      const result = await service.findAll('t1', 'g1', 'so1');

      expect(result[0]).toEqual(
        expect.objectContaining({
          scheduled_volunteers: [
            { id: 'p1', full_name: 'Ana' },
            { id: 'p2', full_name: 'Beto' },
          ],
        }),
      );
      expect(result[1]).toEqual(expect.objectContaining({ scheduled_volunteers: undefined }));
    });

    it('não chama celebrationAssignment.findMany quando não há itens de ministério', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1', celebrationInstance: { id: 'i1' } });
      client.serviceOrderItem.findMany.mockResolvedValue([
        { id: 'item1', responsible_type: 'free_text', ministry_id: null },
      ]);
      const service = serviceWith(client);

      await service.findAll('t1', 'g1', 'so1');

      expect(client.celebrationAssignment.findMany).not.toHaveBeenCalled();
    });

    it('lida com item de ministério cujo ministério ainda não tem voluntários confirmados', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1', celebrationInstance: { id: 'i1' } });
      client.serviceOrderItem.findMany.mockResolvedValue([
        { id: 'item1', responsible_type: 'ministry', ministry_id: 'm1' },
      ]);
      client.celebrationAssignment.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      const result = await service.findAll('t1', 'g1', 'so1');

      expect(result[0]).toEqual(expect.objectContaining({ scheduled_volunteers: [] }));
    });
  });

  describe('findOne', () => {
    it('retorna o item quando encontrado', async () => {
      const client = clientWith();
      client.serviceOrderItem.findFirst.mockResolvedValue({ id: 'item1' });
      const service = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'item1')).resolves.toEqual({ id: 'item1' });
    });

    it('lança NotFoundException quando não encontrado', async () => {
      const client = clientWith();
      client.serviceOrderItem.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('atualiza todos os campos informados', async () => {
      const client = clientWith();
      client.serviceOrderItem.findFirst.mockResolvedValue({ id: 'item1', person_id: null, ministry_id: null });
      client.person.findFirst.mockResolvedValue({ id: 'p2' });
      client.ministry.findFirst.mockResolvedValue({ id: 'm2' });
      client.serviceOrderItem.update.mockResolvedValue({ id: 'item1' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'item1', {
        sequence: 2,
        name: 'Novo nome',
        start_offset_minutes: 5,
        duration_minutes: 10,
        responsible_type: 'person',
        person_id: 'p2',
        ministry_id: 'm2',
        responsible_label: 'Label',
        notes: 'obs',
      } as never);

      expect(client.serviceOrderItem.update).toHaveBeenCalledWith({
        where: { id: 'item1' },
        data: {
          sequence: 2,
          name: 'Novo nome',
          start_offset_minutes: 5,
          duration_minutes: 10,
          responsible_type: 'person',
          person_id: 'p2',
          ministry_id: 'm2',
          responsible_label: 'Label',
          notes: 'obs',
        },
      });
    });

    it('não valida person_id quando é o mesmo já atribuído', async () => {
      const client = clientWith();
      client.serviceOrderItem.findFirst.mockResolvedValue({ id: 'item1', person_id: 'p1', ministry_id: null });
      client.serviceOrderItem.update.mockResolvedValue({ id: 'item1' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'item1', { person_id: 'p1' } as never);

      expect(client.person.findFirst).not.toHaveBeenCalled();
    });

    it('não valida ministry_id quando é o mesmo já atribuído', async () => {
      const client = clientWith();
      client.serviceOrderItem.findFirst.mockResolvedValue({ id: 'item1', person_id: null, ministry_id: 'm1' });
      client.serviceOrderItem.update.mockResolvedValue({ id: 'item1' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'item1', { ministry_id: 'm1' } as never);

      expect(client.ministry.findFirst).not.toHaveBeenCalled();
    });

    it('lança NotFoundException quando o novo person_id não existe', async () => {
      const client = clientWith();
      client.serviceOrderItem.findFirst.mockResolvedValue({ id: 'item1', person_id: 'p1', ministry_id: null });
      client.person.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.update('t1', 'g1', 'item1', { person_id: 'p2' } as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lança NotFoundException quando o novo ministry_id não existe', async () => {
      const client = clientWith();
      client.serviceOrderItem.findFirst.mockResolvedValue({ id: 'item1', person_id: null, ministry_id: 'm1' });
      client.ministry.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.update('t1', 'g1', 'item1', { ministry_id: 'm2' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('não altera nada quando dto vazio', async () => {
      const client = clientWith();
      client.serviceOrderItem.findFirst.mockResolvedValue({ id: 'item1', person_id: null, ministry_id: null });
      client.serviceOrderItem.update.mockResolvedValue({ id: 'item1' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'item1', {} as never);

      expect(client.serviceOrderItem.update).toHaveBeenCalledWith({ where: { id: 'item1' }, data: {} });
    });
  });

  describe('remove', () => {
    it('remove o item existente', async () => {
      const client = clientWith();
      client.serviceOrderItem.findFirst.mockResolvedValue({ id: 'item1' });
      client.serviceOrderItem.delete.mockResolvedValue({ id: 'item1' });
      const service = serviceWith(client);

      await expect(service.remove('t1', 'g1', 'item1')).resolves.toEqual({ id: 'item1' });
    });
  });

  describe('reorder', () => {
    it('atualiza a sequence de cada item dentro da transação', async () => {
      const client = clientWith();
      const tx = {
        serviceOrderItem: {
          findFirst: jest.fn().mockResolvedValue({ id: 'item1' }),
          update: jest.fn(),
        },
      };
      const runInTx = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx));
      const service = serviceWith(client, runInTx);

      await service.reorder('t1', 'g1', {
        items: [
          { id: 'item1', sequence: 1 },
          { id: 'item2', sequence: 2 },
        ],
      } as never);

      expect(tx.serviceOrderItem.update).toHaveBeenCalledTimes(2);
    });

    it('lança NotFoundException quando algum item não é encontrado dentro da tx', async () => {
      const client = clientWith();
      const tx = {
        serviceOrderItem: {
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
        },
      };
      const runInTx = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx));
      const service = serviceWith(client, runInTx);

      await expect(
        service.reorder('t1', 'g1', { items: [{ id: 'nope', sequence: 1 }] } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
