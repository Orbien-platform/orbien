import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['cell_leader'],
  plan: 'premium',
};

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    smallGroup: { findUnique: jest.fn() },
    groupMeeting: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    attendanceRecord: { createMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    studyMaterial: { findUnique: jest.fn() },
    groupMeetingMaterial: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    userAccount: { findUnique: jest.fn() },
    groupMembership: { findUnique: jest.fn() },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>, runInTx?: jest.Mock) {
  const prisma = {
    client,
    runInTx: runInTx ?? jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  } as unknown as PrismaService;
  return new MeetingsService(prisma);
}

describe('MeetingsService', () => {
  describe('create', () => {
    it('lança NotFoundException quando o grupo não existe', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.create({ small_group_id: 'sg1', occurred_at: '2026-09-06' } as never, USER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cria a reunião sem lista de presença quando attendee_ids não é informado', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({ id: 'sg1' });
      client.groupMeeting.create.mockResolvedValue({ id: 'meet1' });
      const service = serviceWith(client);

      const result = await service.create(
        { small_group_id: 'sg1', occurred_at: '2026-09-06' } as never,
        USER,
      );

      expect(client.attendanceRecord.createMany).not.toHaveBeenCalled();
      expect(result).toEqual({ meeting: { id: 'meet1' }, attendance_count: 0 });
    });

    it('cria a reunião e registra a lista de presença informada', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({ id: 'sg1' });
      client.groupMeeting.create.mockResolvedValue({ id: 'meet1' });
      client.attendanceRecord.createMany.mockResolvedValue({ count: 2 });
      const service = serviceWith(client);

      const result = await service.create(
        {
          small_group_id: 'sg1',
          occurred_at: '2026-09-06',
          attendee_ids: ['p1', 'p2'],
        } as never,
        USER,
      );

      expect(client.attendanceRecord.createMany).toHaveBeenCalledWith({
        data: [
          { tenant_id: 't1', congregation_id: 'g1', group_meeting_id: 'meet1', person_id: 'p1' },
          { tenant_id: 't1', congregation_id: 'g1', group_meeting_id: 'meet1', person_id: 'p2' },
        ],
        skipDuplicates: true,
      });
      expect(result.attendance_count).toBe(2);
    });

    it('trata attendee_ids como lista vazia sem chamar createMany', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({ id: 'sg1' });
      client.groupMeeting.create.mockResolvedValue({ id: 'meet1' });
      const service = serviceWith(client);

      const result = await service.create(
        { small_group_id: 'sg1', occurred_at: '2026-09-06', attendee_ids: [] } as never,
        USER,
      );

      expect(client.attendanceRecord.createMany).not.toHaveBeenCalled();
      expect(result.attendance_count).toBe(0);
    });
  });

  describe('findByGroup', () => {
    it('papel de liderança lista sem checar participação', async () => {
      const client = clientWith();
      client.groupMeeting.findMany.mockResolvedValue([{ id: 'meet1' }]);
      const service = serviceWith(client);

      expect(await service.findByGroup('sg1', USER)).toEqual([{ id: 'meet1' }]);
      expect(client.userAccount.findUnique).not.toHaveBeenCalled();
    });

    it('member participante do grupo lista normalmente', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.groupMembership.findUnique.mockResolvedValue({ id: 'mem1' });
      client.groupMeeting.findMany.mockResolvedValue([{ id: 'meet1' }]);
      const service = serviceWith(client);

      const result = await service.findByGroup('sg1', { ...USER, roles: ['member'] });

      expect(result).toEqual([{ id: 'meet1' }]);
      expect(client.groupMembership.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { small_group_id_person_id: { small_group_id: 'sg1', person_id: 'p1' } },
        }),
      );
    });

    it('member sem GroupMembership no grupo leva ForbiddenException', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.groupMembership.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.findByGroup('sg-de-outro-grupo', { ...USER, roles: ['member'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.groupMeeting.findMany).not.toHaveBeenCalled();
    });

    it('member sem pessoa vinculada à conta leva ForbiddenException sem consultar GroupMembership', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: null });
      const service = serviceWith(client);

      await expect(
        service.findByGroup('sg1', { ...USER, roles: ['member'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.groupMembership.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('retorna a reunião quando encontrada', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue({ id: 'meet1' });
      const service = serviceWith(client);

      expect(await service.findOne('meet1')).toEqual({ id: 'meet1' });
    });

    it('lança NotFoundException quando não encontrada', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.findOne('meet1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('lança NotFoundException quando a reunião não existe', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.update('meet1', {} as never)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('converte occurred_at para Date quando informado', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue({ id: 'meet1' });
      client.groupMeeting.update.mockResolvedValue({ id: 'meet1' });
      const service = serviceWith(client);

      await service.update('meet1', { occurred_at: '2026-09-13', topic: 'Novo tema' } as never);

      expect(client.groupMeeting.update).toHaveBeenCalledWith({
        where: { id: 'meet1' },
        data: { occurred_at: new Date('2026-09-13'), topic: 'Novo tema' },
      });
    });

    it('mantém occurred_at indefinido quando não informado', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue({ id: 'meet1' });
      client.groupMeeting.update.mockResolvedValue({ id: 'meet1' });
      const service = serviceWith(client);

      await service.update('meet1', { topic: 'Novo tema' } as never);

      expect(client.groupMeeting.update).toHaveBeenCalledWith({
        where: { id: 'meet1' },
        data: { topic: 'Novo tema', occurred_at: undefined },
      });
    });
  });

  describe('recordAttendance', () => {
    it('lança NotFoundException quando a reunião não existe', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.recordAttendance('meet1', { person_ids: ['p1'] } as never, USER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('registra presenças e retorna a contagem adicionada', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue({ id: 'meet1' });
      client.attendanceRecord.createMany.mockResolvedValue({ count: 2 });
      const service = serviceWith(client);

      const result = await service.recordAttendance(
        'meet1',
        { person_ids: ['p1', 'p2'] } as never,
        USER,
      );

      expect(client.attendanceRecord.createMany).toHaveBeenCalledWith({
        data: [
          { tenant_id: 't1', congregation_id: 'g1', group_meeting_id: 'meet1', person_id: 'p1' },
          { tenant_id: 't1', congregation_id: 'g1', group_meeting_id: 'meet1', person_id: 'p2' },
        ],
        skipDuplicates: true,
      });
      expect(result).toEqual({ added: 2 });
    });
  });

  describe('removeAttendance', () => {
    it('lança NotFoundException quando o registro não existe', async () => {
      const client = clientWith();
      client.attendanceRecord.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.removeAttendance('meet1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('remove o registro quando encontrado', async () => {
      const client = clientWith();
      client.attendanceRecord.findUnique.mockResolvedValue({ id: 'rec1' });
      client.attendanceRecord.delete.mockResolvedValue({ id: 'rec1' });
      const service = serviceWith(client);

      expect(await service.removeAttendance('meet1', 'p1')).toEqual({ id: 'rec1' });
    });
  });

  describe('addMaterial', () => {
    it('lança NotFoundException quando a reunião não existe', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.addMaterial('meet1', { material_id: 'mat1' } as never, USER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança NotFoundException quando o material não existe', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue({ id: 'meet1' });
      client.studyMaterial.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.addMaterial('meet1', { material_id: 'mat1' } as never, USER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita vínculo duplicado', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue({ id: 'meet1' });
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'mat1' });
      client.groupMeetingMaterial.findUnique.mockResolvedValue({ id: 'link1' });
      const service = serviceWith(client);

      await expect(
        service.addMaterial('meet1', { material_id: 'mat1' } as never, USER),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('vincula o material com visibility default (all)', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue({ id: 'meet1' });
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'mat1' });
      client.groupMeetingMaterial.findUnique.mockResolvedValue(null);
      client.groupMeetingMaterial.create.mockResolvedValue({ id: 'link1' });
      const service = serviceWith(client);

      await service.addMaterial('meet1', { material_id: 'mat1' } as never, USER);

      expect(client.groupMeetingMaterial.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          meeting_id: 'meet1',
          material_id: 'mat1',
          visibility: 'all',
        },
      });
    });

    it('vincula o material com visibility informada', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue({ id: 'meet1' });
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'mat1' });
      client.groupMeetingMaterial.findUnique.mockResolvedValue(null);
      client.groupMeetingMaterial.create.mockResolvedValue({ id: 'link1' });
      const service = serviceWith(client);

      await service.addMaterial(
        'meet1',
        { material_id: 'mat1', visibility: 'leaders_only' } as never,
        USER,
      );

      expect(client.groupMeetingMaterial.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ visibility: 'leaders_only' }) }),
      );
    });
  });

  describe('listMaterials', () => {
    it('lança NotFoundException quando a reunião não existe', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.listMaterials('meet1', USER)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('líder vê todos os materiais, sem filtro de visibilidade nem checagem de participação', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue({ id: 'meet1', small_group_id: 'sg1' });
      client.groupMeetingMaterial.findMany.mockResolvedValue([{ id: 'link1' }]);
      const service = serviceWith(client);

      await service.listMaterials('meet1', { ...USER, roles: ['cell_leader'] });

      expect(client.groupMeetingMaterial.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { meeting_id: 'meet1' } }),
      );
      expect(client.userAccount.findUnique).not.toHaveBeenCalled();
    });

    it('member participante do grupo vê apenas materiais com visibility "all"', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue({ id: 'meet1', small_group_id: 'sg1' });
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.groupMembership.findUnique.mockResolvedValue({ id: 'mem1' });
      client.groupMeetingMaterial.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      await service.listMaterials('meet1', { ...USER, roles: ['member'] });

      expect(client.groupMembership.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { small_group_id_person_id: { small_group_id: 'sg1', person_id: 'p1' } },
        }),
      );
      expect(client.groupMeetingMaterial.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { meeting_id: 'meet1', visibility: 'all' } }),
      );
    });

    it('member de outro grupo leva ForbiddenException, sem vazar a lista de materiais', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue({ id: 'meet1', small_group_id: 'sg1' });
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.groupMembership.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.listMaterials('meet1', { ...USER, roles: ['member'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.groupMeetingMaterial.findMany).not.toHaveBeenCalled();
    });
  });

  describe('removeMaterial', () => {
    it('lança NotFoundException quando a reunião não existe', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.removeMaterial('meet1', 'mat1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança NotFoundException quando o vínculo não existe', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue({ id: 'meet1' });
      client.groupMeetingMaterial.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.removeMaterial('meet1', 'mat1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('remove o vínculo quando encontrado', async () => {
      const client = clientWith();
      client.groupMeeting.findUnique.mockResolvedValue({ id: 'meet1' });
      client.groupMeetingMaterial.findUnique.mockResolvedValue({ id: 'link1' });
      client.groupMeetingMaterial.delete.mockResolvedValue({ id: 'link1' });
      const service = serviceWith(client);

      expect(await service.removeMaterial('meet1', 'mat1')).toEqual({ id: 'link1' });
    });
  });
});
