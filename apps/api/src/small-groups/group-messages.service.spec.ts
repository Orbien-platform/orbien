import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GroupMessagesService } from './group-messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['member'],
  plan: 'starter',
};

const P1 = { id: 'p1', full_name: 'Ana' };
const P2 = { id: 'p2', full_name: 'Bruno' };

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    content: 'bom dia',
    deleted_at: null,
    created_at: new Date('2026-09-14T10:00:00Z'),
    person_id: 'p1',
    person: P1,
    ...over,
  };
}

// O usuário do token é a pessoa `p1`, membro do grupo `sg1`. Cada teste que
// quer o contrário sobrescreve um dos dois mocks — é a fronteira que o
// service defende, então ela é explícita em vez de default silencioso.
function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    userAccount: { findUnique: jest.fn().mockResolvedValue({ person_id: 'p1' }) },
    groupMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'member' }) },
    groupMessage: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  return new GroupMessagesService({ client } as unknown as PrismaService);
}

describe('GroupMessagesService', () => {
  describe('participação é a autoridade', () => {
    it.each([
      ['create', (s: GroupMessagesService) => s.create('sg1', { content: 'oi' }, USER)],
      ['findByGroup', (s: GroupMessagesService) => s.findByGroup('sg1', { limit: 50 }, USER)],
      ['remove', (s: GroupMessagesService) => s.remove('sg1', 'm1', USER)],
    ])('%s nega quem não tem GroupMembership no grupo', async (_name, call) => {
      const client = clientWith();
      client.groupMembership.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(call(service)).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.groupMessage.create).not.toHaveBeenCalled();
      expect(client.groupMessage.findMany).not.toHaveBeenCalled();
      expect(client.groupMessage.update).not.toHaveBeenCalled();
    });

    it('nega quando o papel do JWT é alto mas não há participação — pastor não lê chat alheio', async () => {
      const client = clientWith();
      client.groupMembership.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.findByGroup('sg1', { limit: 50 }, { ...USER, roles: ['pastor', 'tenant_admin'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lança NotFoundException quando a conta não tem pessoa vinculada', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: null });
      const service = serviceWith(client);

      await expect(service.findByGroup('sg1', { limit: 50 }, USER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('grava a mensagem com tenant, congregação, grupo e a pessoa do token', async () => {
      const client = clientWith();
      client.groupMessage.create.mockResolvedValue(row());
      const service = serviceWith(client);

      const result = await service.create('sg1', { content: 'bom dia' }, USER);

      expect(client.groupMessage.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          small_group_id: 'sg1',
          person_id: 'p1',
          content: 'bom dia',
        },
        include: { person: { select: { id: true, full_name: true } } },
      });
      expect(result).toEqual({
        id: 'm1',
        content: 'bom dia',
        created_at: new Date('2026-09-14T10:00:00Z'),
        person: P1,
        is_mine: true,
        is_deleted: false,
        can_delete: true,
      });
    });

    it('apara o conteúdo antes de gravar', async () => {
      const client = clientWith();
      client.groupMessage.create.mockResolvedValue(row());
      const service = serviceWith(client);

      await service.create('sg1', { content: '  bom dia \n' }, USER);

      expect(client.groupMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ content: 'bom dia' }) }),
      );
    });
  });

  describe('findByGroup', () => {
    it('devolve a última página em ordem de leitura, da mais antiga para a mais nova', async () => {
      const client = clientWith();
      // O banco devolve desc; o service inverte.
      client.groupMessage.findMany.mockResolvedValue([
        row({ id: 'm2', content: 'segunda', created_at: new Date('2026-09-14T11:00:00Z') }),
        row({ id: 'm1', content: 'primeira' }),
      ]);
      const service = serviceWith(client);

      const page = await service.findByGroup('sg1', { limit: 50 }, USER);

      expect(page.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
      expect(page.has_more).toBe(false);
    });

    it('pede limit + 1 e usa a sobra para responder has_more, sem count à parte', async () => {
      const client = clientWith();
      client.groupMessage.findMany.mockResolvedValue([row({ id: 'm3' }), row({ id: 'm2' }), row({ id: 'm1' })]);
      const service = serviceWith(client);

      const page = await service.findByGroup('sg1', { limit: 2 }, USER);

      expect(client.groupMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 }),
      );
      expect(page.messages).toHaveLength(2);
      expect(page.has_more).toBe(true);
    });

    it('com `before`, busca o cursor no grupo e filtra o que é mais antigo que ele', async () => {
      const client = clientWith();
      const cursorDate = new Date('2026-09-14T09:00:00Z');
      client.groupMessage.findFirst.mockResolvedValue({ id: 'm5', created_at: cursorDate });
      const service = serviceWith(client);

      await service.findByGroup('sg1', { before: 'm5', limit: 50 }, USER);

      expect(client.groupMessage.findFirst).toHaveBeenCalledWith({
        where: { id: 'm5', small_group_id: 'sg1' },
        select: { id: true, created_at: true },
      });
      expect(client.groupMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            small_group_id: 'sg1',
            OR: [
              { created_at: { lt: cursorDate } },
              { created_at: cursorDate, id: { lt: 'm5' } },
            ],
          },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        }),
      );
    });

    it('com `after`, devolve só o que chegou depois, em ordem crescente e sem has_more', async () => {
      const client = clientWith();
      const cursorDate = new Date('2026-09-14T09:00:00Z');
      client.groupMessage.findFirst.mockResolvedValue({ id: 'm5', created_at: cursorDate });
      client.groupMessage.findMany.mockResolvedValue([row({ id: 'm6' })]);
      const service = serviceWith(client);

      const page = await service.findByGroup('sg1', { after: 'm5', limit: 50 }, USER);

      expect(client.groupMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            small_group_id: 'sg1',
            OR: [
              { created_at: { gt: cursorDate } },
              { created_at: cursorDate, id: { gt: 'm5' } },
            ],
          },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          take: 50,
        }),
      );
      expect(page.messages.map((m) => m.id)).toEqual(['m6']);
      expect(page.has_more).toBe(false);
    });

    it('rejeita before e after juntos', async () => {
      const service = serviceWith(clientWith());
      await expect(
        service.findByGroup('sg1', { before: 'm1', after: 'm2', limit: 50 }, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cursor de outro grupo não abre janela de leitura — 404', async () => {
      const client = clientWith();
      client.groupMessage.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.findByGroup('sg1', { before: 'm-de-outro-grupo', limit: 50 }, USER),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(client.groupMessage.findMany).not.toHaveBeenCalled();
    });

    it('mensagem apagada vira lápide: sem conteúdo, sem lixeira, mas continua na conversa', async () => {
      const client = clientWith();
      client.groupMessage.findMany.mockResolvedValue([
        row({ id: 'm1', content: 'era isto aqui', deleted_at: new Date('2026-09-14T12:00:00Z') }),
      ]);
      const service = serviceWith(client);

      const page = await service.findByGroup('sg1', { limit: 50 }, USER);

      expect(page.messages[0]).toMatchObject({
        id: 'm1',
        content: '',
        is_deleted: true,
        can_delete: false,
      });
    });

    it('membro comum não recebe can_delete em mensagem alheia; líder recebe', async () => {
      const client = clientWith();
      client.groupMessage.findMany.mockResolvedValue([
        row({ id: 'm1', person_id: 'p2', person: P2 }),
      ]);
      const service = serviceWith(client);

      const asMember = await service.findByGroup('sg1', { limit: 50 }, USER);
      expect(asMember.messages[0]).toMatchObject({ is_mine: false, can_delete: false });

      client.groupMembership.findUnique.mockResolvedValue({ role: 'leader' });
      const asLeader = await service.findByGroup('sg1', { limit: 50 }, USER);
      expect(asLeader.messages[0]).toMatchObject({ is_mine: false, can_delete: true });
    });
  });

  describe('remove', () => {
    it('o autor apaga a própria mensagem — soft delete, não delete', async () => {
      const client = clientWith();
      client.groupMessage.findFirst.mockResolvedValue({
        id: 'm1',
        person_id: 'p1',
        deleted_at: null,
      });
      const service = serviceWith(client);

      const result = await service.remove('sg1', 'm1', USER);

      expect(client.groupMessage.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { deleted_at: expect.any(Date) },
      });
      expect(result).toEqual({ id: 'm1' });
    });

    it('membro comum não apaga mensagem alheia', async () => {
      const client = clientWith();
      client.groupMessage.findFirst.mockResolvedValue({
        id: 'm1',
        person_id: 'p2',
        deleted_at: null,
      });
      const service = serviceWith(client);

      await expect(service.remove('sg1', 'm1', USER)).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.groupMessage.update).not.toHaveBeenCalled();
    });

    it('líder da célula modera mensagem alheia — o papel vem da GroupMembership, não do JWT', async () => {
      const client = clientWith();
      client.groupMembership.findUnique.mockResolvedValue({ role: 'leader' });
      client.groupMessage.findFirst.mockResolvedValue({
        id: 'm1',
        person_id: 'p2',
        deleted_at: null,
      });
      const service = serviceWith(client);

      await expect(service.remove('sg1', 'm1', USER)).resolves.toEqual({ id: 'm1' });
      expect(client.groupMessage.update).toHaveBeenCalled();
    });

    it('mensagem de outro grupo é 404, não 403', async () => {
      const client = clientWith();
      client.groupMessage.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.remove('sg1', 'm1', USER)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('apagar duas vezes é no-op: não mexe na data do primeiro apagamento', async () => {
      const client = clientWith();
      client.groupMessage.findFirst.mockResolvedValue({
        id: 'm1',
        person_id: 'p1',
        deleted_at: new Date('2026-09-14T12:00:00Z'),
      });
      const service = serviceWith(client);

      await expect(service.remove('sg1', 'm1', USER)).resolves.toEqual({ id: 'm1' });
      expect(client.groupMessage.update).not.toHaveBeenCalled();
    });
  });
});
