import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['treasurer'],
  plan: 'starter',
};

function serviceWith(overrides: Record<string, unknown> = {}) {
  const client = {
    financialCategory: { findFirst: jest.fn() },
    person: { findFirst: jest.fn() },
    financialTransaction: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    ...overrides,
  };
  const prisma = { client } as unknown as PrismaService;
  return { service: new TransactionsService(prisma), client };
}

const validDto = {
  type: 'income',
  amount: 100,
  occurred_at: new Date('2026-01-01'),
  category_id: 'cat-1',
};

describe('TransactionsService', () => {
  describe('create', () => {
    it('rejeita quando a categoria não existe', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue(null);

      await expect(service.create(validDto as never, user)).rejects.toThrow(NotFoundException);
    });

    it('rejeita quando o tipo diverge da categoria', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue({ id: 'cat-1', type: 'expense' });

      await expect(service.create(validDto as never, user)).rejects.toThrow(BadRequestException);
    });

    it('rejeita quando donor_person_id não é encontrado', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue({ id: 'cat-1', type: 'income' });
      client.person.findFirst.mockResolvedValue(null);

      await expect(
        service.create({ ...validDto, donor_person_id: 'p1' } as never, user),
      ).rejects.toThrow(NotFoundException);
    });

    it('cria a transação, grava auditoria e não propaga falha de auditoria', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue({ id: 'cat-1', type: 'income' });
      client.financialTransaction.create.mockResolvedValue({ id: 't1' });
      client.auditLog.create.mockRejectedValue(new Error('falha de auditoria'));

      const result = await service.create(validDto as never, user);

      expect(result).toEqual({ id: 't1' });
      expect(client.financialTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: 'tenant-1',
          congregation_id: 'cong-1',
          created_by_user_id: 'user-1',
          source: 'manual',
        }),
      });
    });

    it('usa donor_person_id encontrado e a fonte informada no dto', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue({ id: 'cat-1', type: 'income' });
      client.person.findFirst.mockResolvedValue({ id: 'p1' });
      client.financialTransaction.create.mockResolvedValue({ id: 't1' });

      await service.create(
        { ...validDto, donor_person_id: 'p1', source: 'recurring' } as never,
        user,
      );

      expect(client.financialTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ donor_person_id: 'p1', source: 'recurring' }),
      });
    });
  });

  describe('findAll', () => {
    it('filtra só por tenant/congregação quando não há outros filtros', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findMany.mockResolvedValue([]);
      client.financialTransaction.count.mockResolvedValue(0);

      const result = await service.findAll(
        { page: 1, limit: 20 } as never,
        user,
      );

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
      const call = client.financialTransaction.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ tenant_id: 'tenant-1', congregation_id: 'cong-1' });
    });

    it('aplica todos os filtros opcionais e pagina', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findMany.mockResolvedValue([{ id: 't1' }]);
      client.financialTransaction.count.mockResolvedValue(1);

      const query = {
        type: 'income',
        category_id: 'cat-1',
        donor_person_id: 'p1',
        since: new Date('2026-01-01'),
        until: new Date('2026-01-31'),
        page: 2,
        limit: 10,
      };

      const result = await service.findAll(query as never, user);

      const call = client.financialTransaction.findMany.mock.calls[0][0];
      expect(call.where).toEqual({
        tenant_id: 'tenant-1',
        congregation_id: 'cong-1',
        type: 'income',
        category_id: 'cat-1',
        donor_person_id: 'p1',
        occurred_at: { gte: query.since, lte: query.until },
      });
      expect(call.skip).toBe(10);
      expect(call.take).toBe(10);
      expect(result).toEqual({ data: [{ id: 't1' }], total: 1, page: 2, limit: 10 });
    });

    it('filtra só por since quando until não é informado', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findMany.mockResolvedValue([]);
      client.financialTransaction.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, since: new Date('2026-01-01') } as never, user);

      const call = client.financialTransaction.findMany.mock.calls[0][0];
      expect(call.where.occurred_at).toEqual({ gte: new Date('2026-01-01') });
    });

    it('filtra só por until quando since não é informado', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findMany.mockResolvedValue([]);
      client.financialTransaction.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, until: new Date('2026-01-31') } as never, user);

      const call = client.financialTransaction.findMany.mock.calls[0][0];
      expect(call.where.occurred_at).toEqual({ lte: new Date('2026-01-31') });
    });
  });

  describe('findOne', () => {
    it('lança NotFoundException quando não encontra', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue(null);

      await expect(service.findOne('t1', user)).rejects.toThrow(NotFoundException);
    });

    it('devolve a transação encontrada', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue({ id: 't1' });

      expect(await service.findOne('t1', user)).toEqual({ id: 't1' });
    });
  });

  describe('update', () => {
    it('lança NotFoundException quando não existe', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue(null);

      await expect(service.update('t1', {} as never, user)).rejects.toThrow(NotFoundException);
    });

    it('rejeita editar transação confirmada', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue({ id: 't1', status: 'confirmed' });

      await expect(service.update('t1', {} as never, user)).rejects.toThrow(ForbiddenException);
    });

    it('rejeita quando a nova categoria não existe', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue({
        id: 't1',
        status: 'pending',
        category_id: 'cat-old',
        type: 'income',
      });
      client.financialCategory.findFirst.mockResolvedValue(null);

      await expect(
        service.update('t1', { category_id: 'cat-new' } as never, user),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejeita quando o tipo efetivo diverge do tipo da nova categoria', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue({
        id: 't1',
        status: 'pending',
        category_id: 'cat-old',
        type: 'income',
      });
      client.financialCategory.findFirst.mockResolvedValue({ type: 'expense' });

      await expect(
        service.update('t1', { category_id: 'cat-new' } as never, user),
      ).rejects.toThrow(BadRequestException);
    });

    it('permite trocar de categoria quando o novo type explícito combina', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue({
        id: 't1',
        status: 'pending',
        category_id: 'cat-old',
        type: 'income',
      });
      client.financialCategory.findFirst.mockResolvedValue({ type: 'expense' });
      client.financialTransaction.update.mockResolvedValue({ id: 't1', type: 'expense' });

      const result = await service.update(
        't1',
        { category_id: 'cat-new', type: 'expense' } as never,
        user,
      );

      expect(result).toEqual({ id: 't1', type: 'expense' });
    });

    it('atualiza sem trocar categoria — não valida categoria nova', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue({
        id: 't1',
        status: 'pending',
        category_id: 'cat-old',
        type: 'income',
      });
      client.financialTransaction.update.mockResolvedValue({ id: 't1', amount: '200' });

      await service.update('t1', { amount: 200 } as never, user);

      expect(client.financialCategory.findFirst).not.toHaveBeenCalled();
      const data = client.financialTransaction.update.mock.calls[0][0].data;
      expect(data.amount.toString()).toBe('200');
    });

    it('falha ao gravar a auditoria não impede a atualização — best-effort', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue({
        id: 't1',
        status: 'pending',
        category_id: 'cat-old',
        type: 'income',
      });
      client.financialTransaction.update.mockResolvedValue({ id: 't1', amount: '200' });
      client.auditLog.create.mockRejectedValue(new Error('falha de auditoria'));

      await expect(service.update('t1', { amount: 200 } as never, user)).resolves.toEqual({
        id: 't1',
        amount: '200',
      });
    });

    it('aplica todos os campos opcionais quando presentes no dto', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue({
        id: 't1',
        status: 'pending',
        category_id: 'cat-1',
        type: 'income',
      });
      client.financialTransaction.update.mockResolvedValue({ id: 't1' });

      await service.update(
        't1',
        {
          type: 'income',
          amount: 300,
          occurred_at: new Date('2026-02-01'),
          description: 'Nova descrição',
          category_id: 'cat-1',
          cost_center_id: 'cc-1',
          donor_person_id: 'p1',
          source: 'recurring',
          notes: 'nota',
        } as never,
        user,
      );

      const data = client.financialTransaction.update.mock.calls[0][0].data;
      expect(data).toMatchObject({
        type: 'income',
        description: 'Nova descrição',
        category_id: 'cat-1',
        cost_center_id: 'cc-1',
        donor_person_id: 'p1',
        source: 'recurring',
        notes: 'nota',
      });
      expect(data.occurred_at).toEqual(new Date('2026-02-01'));
    });

    it('mantém category_id igual ao existente sem revalidar', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue({
        id: 't1',
        status: 'pending',
        category_id: 'cat-1',
        type: 'income',
      });
      client.financialTransaction.update.mockResolvedValue({ id: 't1' });

      await service.update('t1', { category_id: 'cat-1' } as never, user);

      expect(client.financialCategory.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('lança NotFoundException quando não existe', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue(null);

      await expect(service.remove('t1', user)).rejects.toThrow(NotFoundException);
    });

    it('rejeita remover transação confirmada', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue({ id: 't1', status: 'confirmed' });

      await expect(service.remove('t1', user)).rejects.toThrow(ForbiddenException);
    });

    it('remove transação não confirmada', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue({ id: 't1', status: 'pending' });
      client.financialTransaction.delete.mockResolvedValue({ id: 't1' });

      expect(await service.remove('t1', user)).toEqual({ id: 't1' });
    });

    it('falha ao gravar a auditoria não impede a remoção — best-effort', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue({ id: 't1', status: 'pending' });
      client.financialTransaction.delete.mockResolvedValue({ id: 't1' });
      client.auditLog.create.mockRejectedValue(new Error('falha de auditoria'));

      await expect(service.remove('t1', user)).resolves.toEqual({ id: 't1' });
    });
  });

  describe('updateStatus', () => {
    it('lança NotFoundException quando não existe', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus('t1', { status: 'paid' } as never, user),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejeita alterar status de transação confirmada', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue({ id: 't1', status: 'confirmed' });

      await expect(
        service.updateStatus('t1', { status: 'paid' } as never, user),
      ).rejects.toThrow(ForbiddenException);
    });

    it('atualiza o status', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue({ id: 't1', status: 'pending' });
      client.financialTransaction.update.mockResolvedValue({ id: 't1', status: 'paid' });

      const result = await service.updateStatus('t1', { status: 'paid' } as never, user);
      expect(result).toEqual({ id: 't1', status: 'paid' });
    });

    it('falha ao gravar a auditoria não impede a troca de status — best-effort', async () => {
      const { service, client } = serviceWith();
      client.financialTransaction.findFirst.mockResolvedValue({ id: 't1', status: 'pending' });
      client.financialTransaction.update.mockResolvedValue({ id: 't1', status: 'paid' });
      client.auditLog.create.mockRejectedValue(new Error('falha de auditoria'));

      await expect(
        service.updateStatus('t1', { status: 'paid' } as never, user),
      ).resolves.toEqual({ id: 't1', status: 'paid' });
    });
  });

  describe('impersonated_by na auditoria', () => {
    it('usa impersonated_by como actor quando presente', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue({ id: 'cat-1', type: 'income' });
      client.financialTransaction.create.mockResolvedValue({ id: 't1' });

      const support = { ...user, impersonated_by: 'support-1' };
      await service.create(validDto as never, support as never);

      expect(client.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ actor_user_id: 'support-1' }),
      });
    });
  });
});
