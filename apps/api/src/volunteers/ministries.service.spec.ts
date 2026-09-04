import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MinistriesService } from './ministries.service';
import { PrismaService } from '../prisma/prisma.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    ministry: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    volunteerMinistry: { findMany: jest.fn() },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  const prisma = { client } as unknown as PrismaService;
  return new MinistriesService(prisma);
}

describe('MinistriesService', () => {
  describe('create', () => {
    it('cria o ministério raiz quando não há parent_ministry_id', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue(null); // nenhum root existente
      client.ministry.create.mockResolvedValue({ id: 'm1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', { name: 'Geral' } as never);

      expect(client.ministry.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          name: 'Geral',
          description: null,
          color: null,
          parent_ministry_id: null,
        },
      });
    });

    it('rejeita criar um segundo ministério raiz', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'existing-root' });
      const service = serviceWith(client);

      await expect(service.create('t1', 'g1', { name: 'Outro' } as never)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(client.ministry.create).not.toHaveBeenCalled();
    });

    it('cria um ministério filho quando o pai existe e não gera ciclo', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'parent-1' }); // assertValidParent: parent existe
      client.ministry.create.mockResolvedValue({ id: 'child-1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', { name: 'Louvor', parent_ministry_id: 'parent-1' } as never);

      expect(client.ministry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ parent_ministry_id: 'parent-1' }) }),
      );
    });

    it('lança NotFoundException quando o parent_ministry_id informado não existe', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue(null); // parent não encontrado
      const service = serviceWith(client);

      await expect(
        service.create('t1', 'g1', { name: 'Órfão', parent_ministry_id: 'inexistente' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(client.ministry.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll — árvore de hierarquia', () => {
    it('monta a árvore com filhos aninhados sob a raiz', async () => {
      const client = clientWith();
      client.ministry.findMany.mockResolvedValue([
        { id: 'root', name: 'Geral', parent_ministry_id: null },
        { id: 'child', name: 'Louvor', parent_ministry_id: 'root' },
        { id: 'grandchild', name: 'Banda', parent_ministry_id: 'child' },
      ]);
      const service = serviceWith(client);

      const tree = await service.findAll('t1', 'g1');

      expect(tree).toHaveLength(1);
      expect(tree[0]!.id).toBe('root');
      expect(tree[0]!.children).toHaveLength(1);
      expect(tree[0]!.children[0]!.id).toBe('child');
      expect(tree[0]!.children[0]!.children[0]!.id).toBe('grandchild');
    });

    it('trata nó órfão (parent_ministry_id aponta para id inexistente) como raiz própria', async () => {
      const client = clientWith();
      client.ministry.findMany.mockResolvedValue([
        { id: 'orphan', name: 'Perdido', parent_ministry_id: 'nao-existe-mais' },
      ]);
      const service = serviceWith(client);

      const tree = await service.findAll('t1', 'g1');

      expect(tree).toHaveLength(1);
      expect(tree[0]!.id).toBe('orphan');
      expect(tree[0]!.children).toEqual([]);
    });

    it('retorna lista vazia quando não há ministérios', async () => {
      const client = clientWith();
      client.ministry.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      expect(await service.findAll('t1', 'g1')).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('retorna o ministério quando encontrado', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1', name: 'Louvor' });
      const service = serviceWith(client);

      expect(await service.findOne('t1', 'g1', 'm1')).toEqual({ id: 'm1', name: 'Louvor' });
    });

    it('lança NotFoundException quando não encontrado', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'm1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findOneWithMembers', () => {
    it('separa líderes e voluntários das memberships', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1', name: 'Louvor' });
      client.volunteerMinistry.findMany.mockResolvedValue([
        { id: 'vm1', role: 'leader', volunteerProfile: { person: { full_name: 'Ana' } } },
        { id: 'vm2', role: 'volunteer', volunteerProfile: { person: { full_name: 'Bia' } } },
      ]);
      const service = serviceWith(client);

      const result = await service.findOneWithMembers('t1', 'g1', 'm1');

      expect(result.leaders).toHaveLength(1);
      expect(result.volunteers).toHaveLength(1);
      expect(result.leaders[0]!.id).toBe('vm1');
    });
  });

  describe('update', () => {
    it('atualiza campos simples sem mexer em parent_ministry_id', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValueOnce({ id: 'm1' }); // findOne
      client.ministry.update.mockResolvedValue({ id: 'm1', name: 'Novo nome' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'm1', { name: 'Novo nome' } as never);

      expect(client.ministry.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { name: 'Novo nome' },
      });
    });

    it('atualiza description e color quando informados', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValueOnce({ id: 'm1' }); // findOne
      client.ministry.update.mockResolvedValue({ id: 'm1' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'm1', {
        description: 'Nova descrição',
        color: '#000000',
      } as never);

      expect(client.ministry.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { description: 'Nova descrição', color: '#000000' },
      });
    });

    it('promove o ministério a raiz quando parent_ministry_id é definido como null', async () => {
      const client = clientWith();
      client.ministry.findFirst
        .mockResolvedValueOnce({ id: 'm1' }) // findOne
        .mockResolvedValueOnce(null); // assertNoRootExists: nenhum outro root
      client.ministry.update.mockResolvedValue({ id: 'm1', parent_ministry_id: null });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'm1', { parent_ministry_id: null } as never);

      expect(client.ministry.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { parent_ministry_id: null },
      });
    });

    it('rejeita promover a raiz quando já existe outra raiz', async () => {
      const client = clientWith();
      client.ministry.findFirst
        .mockResolvedValueOnce({ id: 'm1' }) // findOne
        .mockResolvedValueOnce({ id: 'other-root' }); // assertNoRootExists
      const service = serviceWith(client);

      await expect(
        service.update('t1', 'g1', 'm1', { parent_ministry_id: null } as never),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(client.ministry.update).not.toHaveBeenCalled();
    });

    it('rejeita definir o próprio ministério como seu pai', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValueOnce({ id: 'm1' }); // findOne
      const service = serviceWith(client);

      await expect(
        service.update('t1', 'g1', 'm1', { parent_ministry_id: 'm1' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança NotFoundException quando o novo pai não existe', async () => {
      const client = clientWith();
      client.ministry.findFirst
        .mockResolvedValueOnce({ id: 'm1' }) // findOne
        .mockResolvedValueOnce(null); // assertValidParent: parent não encontrado
      const service = serviceWith(client);

      await expect(
        service.update('t1', 'g1', 'm1', { parent_ministry_id: 'inexistente' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('detecta ciclo: rejeita definir um descendente como pai', async () => {
      const client = clientWith();
      client.ministry.findFirst
        .mockResolvedValueOnce({ id: 'root' }) // findOne(root)
        .mockResolvedValueOnce({ id: 'grandchild' }); // assertValidParent: parent (grandchild) existe
      // Percorre a cadeia de ancestrais de 'grandchild' até achar 'root' (selfId), fechando o ciclo.
      client.ministry.findUnique
        .mockResolvedValueOnce({ id: 'grandchild', parent_ministry_id: 'child' })
        .mockResolvedValueOnce({ id: 'child', parent_ministry_id: 'root' })
        .mockResolvedValueOnce({ id: 'root', parent_ministry_id: null });
      const service = serviceWith(client);

      await expect(
        service.update('t1', 'g1', 'root', { parent_ministry_id: 'grandchild' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('permite definir como pai um ministério que não é descendente', async () => {
      const client = clientWith();
      client.ministry.findFirst
        .mockResolvedValueOnce({ id: 'leaf-1' }) // findOne
        .mockResolvedValueOnce({ id: 'leaf-2' }); // assertValidParent: parent existe
      // Cadeia de ancestrais de leaf-2 não passa por leaf-1.
      client.ministry.findUnique.mockResolvedValueOnce({ id: 'leaf-2', parent_ministry_id: null });
      client.ministry.update.mockResolvedValue({ id: 'leaf-1', parent_ministry_id: 'leaf-2' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'leaf-1', { parent_ministry_id: 'leaf-2' } as never);

      expect(client.ministry.update).toHaveBeenCalledWith({
        where: { id: 'leaf-1' },
        data: { parent_ministry_id: 'leaf-2' },
      });
    });
  });

  describe('remove', () => {
    it('remove o ministério quando encontrado', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.ministry.delete.mockResolvedValue({ id: 'm1' });
      const service = serviceWith(client);

      expect(await service.remove('t1', 'g1', 'm1')).toEqual({ id: 'm1' });
    });

    it('lança NotFoundException ao remover ministério inexistente', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.remove('t1', 'g1', 'm1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
