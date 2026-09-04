import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CelebrationAssignmentService } from './celebration-assignment.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    userAccount: { findUnique: jest.fn() },
    volunteerProfile: { findFirst: jest.fn() },
    volunteerMinistry: { findUnique: jest.fn() },
    volunteerUnavailabilityDate: { findFirst: jest.fn() },
    celebrationMinistry: { findFirst: jest.fn() },
    celebrationAssignment: {
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    celebrationSchedule: { findUnique: jest.fn(), update: jest.fn() },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>, notifications?: Partial<NotificationsService>) {
  const runInTx = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client));
  const prisma = { client, runInTx } as unknown as PrismaService;
  const notificationsService = {
    sendPush: jest.fn().mockResolvedValue(undefined),
    ...notifications,
  } as unknown as NotificationsService;
  return {
    service: new CelebrationAssignmentService(prisma, notificationsService),
    notificationsService,
    runInTx,
  };
}

describe('CelebrationAssignmentService', () => {
  describe('createAssignment', () => {
    const dto = { volunteer_profile_id: 'vp1' } as never;

    it('lança NotFoundException quando o ministério da escala não existe', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(
        service.createAssignment('t1', 'g1', 'i1', 'cm1', 'u1', ['secretary'], dto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('permite admin_congregation sem checar liderança do ministério', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue({
        id: 'cm1',
        ministry_id: 'm1',
        slots: 2,
        schedule: { celebrationInstance: { scheduled_date: new Date('2026-09-06') } },
      });
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'vp1' });
      client.volunteerMinistry.findUnique.mockResolvedValue({ id: 'vm1' });
      client.celebrationAssignment.findUnique.mockResolvedValue(null);
      client.celebrationAssignment.create.mockResolvedValue({ id: 'a1' });
      client.celebrationAssignment.count.mockResolvedValue(1);
      client.volunteerUnavailabilityDate.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      const result = await service.createAssignment(
        't1',
        'g1',
        'i1',
        'cm1',
        'admin-user',
        ['admin_congregation'],
        dto,
      );

      expect(client.volunteerMinistry.findUnique).toHaveBeenCalledTimes(1); // só a checagem de vínculo, não de liderança
      expect(result).toEqual(
        expect.objectContaining({ id: 'a1', overbooked: false, unavailable_on_date: false }),
      );
    });

    it('permite tenant_admin sem checar liderança do ministério', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue({
        id: 'cm1',
        ministry_id: 'm1',
        slots: 1,
        schedule: { celebrationInstance: { scheduled_date: new Date('2026-09-06') } },
      });
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'vp1' });
      client.volunteerMinistry.findUnique.mockResolvedValue({ id: 'vm1' });
      client.celebrationAssignment.findUnique.mockResolvedValue(null);
      client.celebrationAssignment.create.mockResolvedValue({ id: 'a1' });
      client.celebrationAssignment.count.mockResolvedValue(1);
      client.volunteerUnavailabilityDate.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await service.createAssignment('t1', 'g1', 'i1', 'cm1', 'admin-user', ['tenant_admin'], dto);

      expect(client.userAccount.findUnique).not.toHaveBeenCalled();
    });

    it('ministry_leader sem vínculo de pessoa lança NotFoundException', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue({
        id: 'cm1',
        ministry_id: 'm1',
        slots: 1,
        schedule: { celebrationInstance: { scheduled_date: new Date('2026-09-06') } },
      });
      client.userAccount.findUnique.mockResolvedValue({ person_id: null });
      const { service } = serviceWith(client);

      await expect(
        service.createAssignment('t1', 'g1', 'i1', 'cm1', 'leader-user', ['ministry_leader'], dto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ministry_leader sem perfil de voluntário lança NotFoundException', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue({
        id: 'cm1',
        ministry_id: 'm1',
        slots: 1,
        schedule: { celebrationInstance: { scheduled_date: new Date('2026-09-06') } },
      });
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.volunteerProfile.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(
        service.createAssignment('t1', 'g1', 'i1', 'cm1', 'leader-user', ['ministry_leader'], dto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ministry_leader que não é líder do ministério lança ForbiddenException', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue({
        id: 'cm1',
        ministry_id: 'm1',
        slots: 1,
        schedule: { celebrationInstance: { scheduled_date: new Date('2026-09-06') } },
      });
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.volunteerProfile.findFirst.mockResolvedValueOnce({ id: 'leader-vp' });
      client.volunteerMinistry.findUnique.mockResolvedValue({ role: 'member' });
      const { service } = serviceWith(client);

      await expect(
        service.createAssignment('t1', 'g1', 'i1', 'cm1', 'leader-user', ['ministry_leader'], dto),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ministry_leader sem NENHUM vínculo com o ministério (membership null) lança ForbiddenException', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue({
        id: 'cm1',
        ministry_id: 'm1',
        slots: 1,
        schedule: { celebrationInstance: { scheduled_date: new Date('2026-09-06') } },
      });
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.volunteerProfile.findFirst.mockResolvedValueOnce({ id: 'leader-vp' });
      client.volunteerMinistry.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(
        service.createAssignment('t1', 'g1', 'i1', 'cm1', 'leader-user', ['ministry_leader'], dto),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('líder legítimo do ministério consegue atribuir voluntário', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue({
        id: 'cm1',
        ministry_id: 'm1',
        slots: 2,
        schedule: { celebrationInstance: { scheduled_date: new Date('2026-09-06') } },
      });
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.volunteerProfile.findFirst
        .mockResolvedValueOnce({ id: 'leader-vp' }) // resolveProfile do líder
        .mockResolvedValueOnce({ id: 'vp1' }); // perfil do voluntário a atribuir
      client.volunteerMinistry.findUnique
        .mockResolvedValueOnce({ role: 'leader' }) // assertLeaderOrAdmin
        .mockResolvedValueOnce({ id: 'vm1' }); // vínculo do voluntário
      client.celebrationAssignment.findUnique.mockResolvedValue(null);
      client.celebrationAssignment.create.mockResolvedValue({ id: 'a1' });
      client.celebrationAssignment.count.mockResolvedValue(1);
      client.volunteerUnavailabilityDate.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      const result = await service.createAssignment(
        't1',
        'g1',
        'i1',
        'cm1',
        'leader-user',
        ['ministry_leader'],
        dto,
      );

      expect(result).toEqual(
        expect.objectContaining({ id: 'a1', overbooked: false, unavailable_on_date: false }),
      );
    });

    it('lança NotFoundException quando o perfil de voluntário a atribuir não existe', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue({
        id: 'cm1',
        ministry_id: 'm1',
        slots: 1,
        schedule: { celebrationInstance: { scheduled_date: new Date('2026-09-06') } },
      });
      client.volunteerProfile.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(
        service.createAssignment('t1', 'g1', 'i1', 'cm1', 'u1', ['admin_congregation'], dto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança UnprocessableEntityException quando o voluntário não pertence ao ministério', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue({
        id: 'cm1',
        ministry_id: 'm1',
        slots: 1,
        schedule: { celebrationInstance: { scheduled_date: new Date('2026-09-06') } },
      });
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'vp1' });
      client.volunteerMinistry.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(
        service.createAssignment('t1', 'g1', 'i1', 'cm1', 'u1', ['admin_congregation'], dto),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('lança ConflictException quando o voluntário já está atribuído ao slot', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue({
        id: 'cm1',
        ministry_id: 'm1',
        slots: 1,
        schedule: { celebrationInstance: { scheduled_date: new Date('2026-09-06') } },
      });
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'vp1' });
      client.volunteerMinistry.findUnique.mockResolvedValue({ id: 'vm1' });
      client.celebrationAssignment.findUnique.mockResolvedValue({ id: 'existing' });
      const { service } = serviceWith(client);

      await expect(
        service.createAssignment('t1', 'g1', 'i1', 'cm1', 'u1', ['admin_congregation'], dto),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('marca overbooked=true quando assignedCount excede os slots', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue({
        id: 'cm1',
        ministry_id: 'm1',
        slots: 1,
        schedule: { celebrationInstance: { scheduled_date: new Date('2026-09-06') } },
      });
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'vp1' });
      client.volunteerMinistry.findUnique.mockResolvedValue({ id: 'vm1' });
      client.celebrationAssignment.findUnique.mockResolvedValue(null);
      client.celebrationAssignment.create.mockResolvedValue({ id: 'a1' });
      client.celebrationAssignment.count.mockResolvedValue(2);
      client.volunteerUnavailabilityDate.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      const result = await service.createAssignment(
        't1',
        'g1',
        'i1',
        'cm1',
        'u1',
        ['admin_congregation'],
        dto,
      );

      expect(result.overbooked).toBe(true);
    });

    it('marca unavailable_on_date=true quando o voluntário está indisponível na data', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue({
        id: 'cm1',
        ministry_id: 'm1',
        slots: 2,
        schedule: { celebrationInstance: { scheduled_date: new Date('2026-09-06T15:00:00Z') } },
      });
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'vp1' });
      client.volunteerMinistry.findUnique.mockResolvedValue({ id: 'vm1' });
      client.celebrationAssignment.findUnique.mockResolvedValue(null);
      client.celebrationAssignment.create.mockResolvedValue({ id: 'a1' });
      client.celebrationAssignment.count.mockResolvedValue(1);
      client.volunteerUnavailabilityDate.findFirst.mockResolvedValue({ id: 'unavail1' });
      const { service } = serviceWith(client);

      const result = await service.createAssignment(
        't1',
        'g1',
        'i1',
        'cm1',
        'u1',
        ['admin_congregation'],
        dto,
      );

      expect(result.unavailable_on_date).toBe(true);
      expect(client.volunteerUnavailabilityDate.findFirst).toHaveBeenCalledWith({
        where: {
          date: new Date('2026-09-06T00:00:00.000Z'),
          tenant_id: 't1',
          unavailability: { volunteer_profile_id: 'vp1' },
        },
      });
    });
  });

  describe('removeAssignment', () => {
    it('lança NotFoundException quando o ministério da escala não existe', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(
        service.removeAssignment('t1', 'g1', 'i1', 'cm1', 'a1', 'u1', ['admin_congregation']),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança NotFoundException quando a atribuição não existe', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue({ id: 'cm1', ministry_id: 'm1' });
      client.celebrationAssignment.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(
        service.removeAssignment('t1', 'g1', 'i1', 'cm1', 'a1', 'u1', ['admin_congregation']),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('remove a atribuição quando admin', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue({ id: 'cm1', ministry_id: 'm1' });
      client.celebrationAssignment.findFirst.mockResolvedValue({ id: 'a1' });
      client.celebrationAssignment.delete.mockResolvedValue({ id: 'a1' });
      const { service } = serviceWith(client);

      const result = await service.removeAssignment(
        't1',
        'g1',
        'i1',
        'cm1',
        'a1',
        'u1',
        ['admin_congregation'],
      );

      expect(result).toEqual({ id: 'a1' });
    });

    it('bloqueia ministry_leader que não é líder do ministério', async () => {
      const client = clientWith();
      client.celebrationMinistry.findFirst.mockResolvedValue({ id: 'cm1', ministry_id: 'm1' });
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'vp1' });
      client.volunteerMinistry.findUnique.mockResolvedValue({ role: 'member' });
      const { service } = serviceWith(client);

      await expect(
        service.removeAssignment('t1', 'g1', 'i1', 'cm1', 'a1', 'leader-user', ['ministry_leader']),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('publish', () => {
    it('lança NotFoundException quando a escala não existe', async () => {
      const client = clientWith();
      client.celebrationSchedule.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.publish('t1', 'g1', 'i1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança UnprocessableEntityException quando a escala está arquivada', async () => {
      const client = clientWith();
      client.celebrationSchedule.findUnique.mockResolvedValue({
        id: 's1',
        status: 'archived',
        celebrationInstance: { celebration: { name: 'Culto' } },
      });
      const { service } = serviceWith(client);

      await expect(service.publish('t1', 'g1', 'i1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('publica a escala, notifica pendentes e marca notified_at', async () => {
      const client = clientWith();
      client.celebrationSchedule.findUnique
        .mockResolvedValueOnce({
          id: 's1',
          status: 'draft',
          celebrationInstance: { celebration: { name: 'Culto de Domingo' } },
        })
        .mockResolvedValueOnce({ id: 's1', status: 'published' });
      client.celebrationAssignment.findMany.mockResolvedValue([
        { id: 'a1', volunteerProfile: { person_id: 'p1' } },
        { id: 'a2', volunteerProfile: { person_id: 'p2' } },
      ]);
      const { service, notificationsService } = serviceWith(client);

      const result = await service.publish('t1', 'g1', 'i1');

      expect(client.celebrationSchedule.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'published' },
      });
      expect(client.celebrationAssignment.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a1', 'a2'] } },
        data: { notified_at: expect.any(Date) },
      });
      expect(notificationsService.sendPush).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ id: 's1', status: 'published' });
    });

    it('não chama updateMany nem sendPush quando não há pendentes', async () => {
      const client = clientWith();
      client.celebrationSchedule.findUnique
        .mockResolvedValueOnce({
          id: 's1',
          status: 'draft',
          celebrationInstance: { celebration: { name: 'Culto' } },
        })
        .mockResolvedValueOnce({ id: 's1', status: 'published' });
      client.celebrationAssignment.findMany.mockResolvedValue([]);
      const { service, notificationsService } = serviceWith(client);

      await service.publish('t1', 'g1', 'i1');

      expect(client.celebrationAssignment.updateMany).not.toHaveBeenCalled();
      expect(notificationsService.sendPush).not.toHaveBeenCalled();
    });

    it('loga o erro sem propagar quando o envio de push falha', async () => {
      const client = clientWith();
      client.celebrationSchedule.findUnique
        .mockResolvedValueOnce({
          id: 's1',
          status: 'draft',
          celebrationInstance: { celebration: { name: 'Culto' } },
        })
        .mockResolvedValueOnce({ id: 's1', status: 'published' });
      client.celebrationAssignment.findMany.mockResolvedValue([
        { id: 'a1', volunteerProfile: { person_id: 'p1' } },
      ]);
      const { service, notificationsService } = serviceWith(client, {
        sendPush: jest.fn().mockRejectedValue(new Error('falha de rede')),
      });

      await service.publish('t1', 'g1', 'i1');
      // Dá um tick para o .catch() fire-and-forget rodar
      await new Promise((resolve) => setImmediate(resolve));

      expect(notificationsService.sendPush).toHaveBeenCalledTimes(1);
    });
  });

  describe('respondToAssignment', () => {
    const dto = { status: 'confirmed' } as never;

    it('lança NotFoundException quando o usuário não tem vínculo de pessoa', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: null });
      const { service } = serviceWith(client);

      await expect(service.respondToAssignment('a1', 'u1', 't1', dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lança NotFoundException quando a atribuição não existe', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.celebrationAssignment.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.respondToAssignment('a1', 'u1', 't1', dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lança ForbiddenException quando a atribuição não é da pessoa do usuário', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.celebrationAssignment.findFirst.mockResolvedValue({
        id: 'a1',
        status: 'pending',
        volunteerProfile: { person_id: 'outra-pessoa' },
        celebrationMinistry: { schedule: { status: 'published' } },
      });
      const { service } = serviceWith(client);

      await expect(service.respondToAssignment('a1', 'u1', 't1', dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lança UnprocessableEntityException quando a escala ainda está em rascunho', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.celebrationAssignment.findFirst.mockResolvedValue({
        id: 'a1',
        status: 'pending',
        volunteerProfile: { person_id: 'p1' },
        celebrationMinistry: { schedule: { status: 'draft' } },
      });
      const { service } = serviceWith(client);

      await expect(service.respondToAssignment('a1', 'u1', 't1', dto)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('lança ConflictException quando a atribuição já foi respondida', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.celebrationAssignment.findFirst.mockResolvedValue({
        id: 'a1',
        status: 'confirmed',
        volunteerProfile: { person_id: 'p1' },
        celebrationMinistry: { schedule: { status: 'published' } },
      });
      const { service } = serviceWith(client);

      await expect(service.respondToAssignment('a1', 'u1', 't1', dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('atualiza status e responded_at quando tudo é válido', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.celebrationAssignment.findFirst.mockResolvedValue({
        id: 'a1',
        status: 'pending',
        volunteerProfile: { person_id: 'p1' },
        celebrationMinistry: { schedule: { status: 'published' } },
      });
      client.celebrationAssignment.update.mockResolvedValue({ id: 'a1', status: 'confirmed' });
      const { service } = serviceWith(client);

      const result = await service.respondToAssignment('a1', 'u1', 't1', dto);

      expect(client.celebrationAssignment.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { status: 'confirmed', responded_at: expect.any(Date) },
      });
      expect(result).toEqual({ id: 'a1', status: 'confirmed' });
    });
  });

  describe('getMyAssignments', () => {
    it('lança NotFoundException quando o usuário não tem vínculo de pessoa', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: null });
      const { service } = serviceWith(client);

      await expect(service.getMyAssignments('u1', 't1', 'g1', false)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lança NotFoundException quando o perfil de voluntário não existe', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.volunteerProfile.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.getMyAssignments('u1', 't1', 'g1', false)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('filtra por data futura quando includePast=false, mapeia e ordena por scheduled_date', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'vp1' });
      client.celebrationAssignment.findMany.mockResolvedValue([
        {
          id: 'a2',
          status: 'confirmed',
          notified_at: null,
          responded_at: null,
          celebrationMinistry: {
            ministry: { id: 'm1', name: 'Louvor' },
            schedule: {
              celebrationInstance: {
                scheduled_date: new Date('2026-09-20'),
                celebration: { id: 'c1', name: 'Culto Noite' },
              },
            },
          },
        },
        {
          id: 'a1',
          status: 'pending',
          notified_at: null,
          responded_at: null,
          celebrationMinistry: {
            ministry: { id: 'm2', name: 'Recepção' },
            schedule: {
              celebrationInstance: {
                scheduled_date: new Date('2026-09-06'),
                celebration: { id: 'c1', name: 'Culto Manhã' },
              },
            },
          },
        },
      ]);
      const { service } = serviceWith(client);

      const result = await service.getMyAssignments('u1', 't1', 'g1', false);

      expect(client.celebrationAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            celebrationMinistry: expect.objectContaining({
              schedule: expect.objectContaining({
                status: 'published',
                celebrationInstance: { scheduled_date: { gte: expect.any(Date) } },
              }),
            }),
          }),
        }),
      );
      expect(result.map((r) => r.id)).toEqual(['a1', 'a2']); // ordenado asc por scheduled_date
    });

    it('não filtra por data quando includePast=true', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'vp1' });
      client.celebrationAssignment.findMany.mockResolvedValue([]);
      const { service } = serviceWith(client);

      await service.getMyAssignments('u1', 't1', 'g1', true);

      expect(client.celebrationAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            celebrationMinistry: expect.objectContaining({
              schedule: { status: 'published' },
            }),
          }),
        }),
      );
    });
  });
});
