import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
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
    financialCategory: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    financialTransaction: {
      count: jest.fn(),
    },
    ...overrides,
  };
  const prisma = { client } as unknown as PrismaService;
  return { service: new CategoriesService(prisma), client };
}

describe('CategoriesService', () => {
  describe('create', () => {
    it('cria categoria sem parent_id', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.create.mockResolvedValue({ id: 'c1' });

      const result = await service.create(
        { name: 'Dízimos', type: 'income' } as never,
        user,
      );

      expect(client.financialCategory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Dízimos',
          type: 'income',
          is_system: false,
          tenant_id: 'tenant-1',
          congregation_id: 'cong-1',
        }),
      });
      expect(result).toEqual({ id: 'c1' });
    });

    it('rejeita quando a categoria pai não existe', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue(null);

      await expect(
        service.create({ name: 'X', type: 'income', parent_id: 'p1' } as never, user),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejeita quando o tipo diverge do pai', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue({ id: 'p1', type: 'expense' });

      await expect(
        service.create({ name: 'X', type: 'income', parent_id: 'p1' } as never, user),
      ).rejects.toThrow(BadRequestException);
    });

    it('cria com parent_id quando o pai existe e o tipo combina', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue({ id: 'p1', type: 'income' });
      client.financialCategory.create.mockResolvedValue({ id: 'c2' });

      const result = await service.create(
        { name: 'Filha', type: 'income', parent_id: 'p1' } as never,
        user,
      );

      expect(result).toEqual({ id: 'c2' });
    });
  });

  describe('findAll', () => {
    it('monta árvore: filhos aninhados sob o pai, órfãos e raízes na lista', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findMany.mockResolvedValue([
        { id: 'root1', parent_id: null, name: 'Receitas' },
        { id: 'child1', parent_id: 'root1', name: 'Dízimos' },
        // parent_id aponta para categoria que não está na lista → vira raiz
        { id: 'orphan', parent_id: 'inexistente', name: 'Órfã' },
      ]);

      const tree = await service.findAll(user);

      expect(tree).toHaveLength(2);
      const root1 = tree.find((c) => c.id === 'root1')!;
      expect(root1.children).toHaveLength(1);
      expect(root1.children[0]?.id).toBe('child1');
      expect(tree.find((c) => c.id === 'orphan')).toBeDefined();
    });

    it('lista vazia devolve árvore vazia', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findMany.mockResolvedValue([]);

      expect(await service.findAll(user)).toEqual([]);
    });
  });

  describe('update', () => {
    it('rejeita quando a categoria não existe', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue(null);

      await expect(service.update('c1', {} as never, user)).rejects.toThrow(NotFoundException);
    });

    it('rejeita troca de tipo quando há transação vinculada', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue({ id: 'c1', type: 'income' });
      client.financialTransaction.count.mockResolvedValue(3);

      await expect(
        service.update('c1', { type: 'expense' } as never, user),
      ).rejects.toThrow(ConflictException);
    });

    it('permite troca de tipo sem transação vinculada', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue({ id: 'c1', type: 'income' });
      client.financialTransaction.count.mockResolvedValue(0);
      client.financialCategory.update.mockResolvedValue({ id: 'c1', type: 'expense' });

      const result = await service.update('c1', { type: 'expense' } as never, user);
      expect(result).toEqual({ id: 'c1', type: 'expense' });
    });

    it('não confere transações vinculadas quando o tipo não muda', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue({ id: 'c1', type: 'income' });
      client.financialCategory.update.mockResolvedValue({ id: 'c1', name: 'Novo nome' });

      await service.update('c1', { name: 'Novo nome' } as never, user);

      expect(client.financialTransaction.count).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('rejeita quando a categoria não existe', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue(null);

      await expect(service.remove('c1', user)).rejects.toThrow(NotFoundException);
    });

    it('rejeita remover categoria do sistema', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue({ id: 'c1', is_system: true });

      await expect(service.remove('c1', user)).rejects.toThrow(ForbiddenException);
    });

    it('rejeita remover categoria com transação vinculada', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue({ id: 'c1', is_system: false });
      client.financialTransaction.count.mockResolvedValue(1);

      await expect(service.remove('c1', user)).rejects.toThrow(ConflictException);
    });

    it('remove categoria sem transação vinculada e fora do sistema', async () => {
      const { service, client } = serviceWith();
      client.financialCategory.findFirst.mockResolvedValue({ id: 'c1', is_system: false });
      client.financialTransaction.count.mockResolvedValue(0);
      client.financialCategory.delete.mockResolvedValue({ id: 'c1' });

      const result = await service.remove('c1', user);
      expect(result).toEqual({ id: 'c1' });
    });
  });
});
