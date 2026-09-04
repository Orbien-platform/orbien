import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { VolunteerMinistriesService } from './volunteer-ministries.service';
import { PrismaService } from '../prisma/prisma.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    ministry: { findFirst: jest.fn() },
    volunteerProfile: { findFirst: jest.fn() },
    volunteerMinistry: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>, runInTx?: jest.Mock) {
  const prisma = {
    client,
    runInTx: runInTx ?? jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  } as unknown as PrismaService;
  return new VolunteerMinistriesService(prisma);
}

describe('VolunteerMinistriesService', () => {
  describe('assignToMinistry', () => {
    it('lança NotFoundException quando o ministério não existe', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.assignToMinistry('t1', 'g1', { ministry_id: 'm1', volunteer_profile_id: 'p1' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança NotFoundException quando o perfil de voluntário não existe', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.volunteerProfile.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.assignToMinistry('t1', 'g1', { ministry_id: 'm1', volunteer_profile_id: 'p1' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita vínculo duplicado', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.volunteerProfile.findFirst.mockResolvedValue({
        id: 'p1',
        person: { classification: 'member' },
      });
      client.volunteerMinistry.findUnique.mockResolvedValue({ id: 'existing' });
      const service = serviceWith(client);

      await expect(
        service.assignToMinistry('t1', 'g1', { ministry_id: 'm1', volunteer_profile_id: 'p1' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejeita visitante como voluntário', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.volunteerProfile.findFirst.mockResolvedValue({
        id: 'p1',
        person: { classification: 'visitor' },
      });
      client.volunteerMinistry.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.assignToMinistry('t1', 'g1', {
          ministry_id: 'm1',
          volunteer_profile_id: 'p1',
          role: 'volunteer',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita não membro como líder', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.volunteerProfile.findFirst.mockResolvedValue({
        id: 'p1',
        person: { classification: 'attendee' },
      });
      client.volunteerMinistry.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.assignToMinistry('t1', 'g1', {
          ministry_id: 'm1',
          volunteer_profile_id: 'p1',
          role: 'leader',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita is_primary_leader quando role não é leader', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.volunteerProfile.findFirst.mockResolvedValue({
        id: 'p1',
        person: { classification: 'member' },
      });
      client.volunteerMinistry.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.assignToMinistry('t1', 'g1', {
          ministry_id: 'm1',
          volunteer_profile_id: 'p1',
          role: 'volunteer',
          is_primary_leader: true,
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('atribui como volunteer comum sem entrar em transação', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.volunteerProfile.findFirst.mockResolvedValue({
        id: 'p1',
        person: { classification: 'member' },
      });
      client.volunteerMinistry.findUnique.mockResolvedValue(null);
      client.volunteerMinistry.create.mockResolvedValue({ id: 'vm1', role: 'volunteer' });
      const runInTx = jest.fn();
      const service = serviceWith(client, runInTx);

      await service.assignToMinistry('t1', 'g1', {
        ministry_id: 'm1',
        volunteer_profile_id: 'p1',
      } as never);

      expect(runInTx).not.toHaveBeenCalled();
      expect(client.volunteerMinistry.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          volunteer_profile_id: 'p1',
          ministry_id: 'm1',
          role: 'volunteer',
          is_primary_leader: false,
        },
      });
    });

    it('ao marcar líder principal, rebaixa o líder principal anterior dentro da mesma transação', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.volunteerProfile.findFirst.mockResolvedValue({
        id: 'p1',
        person: { classification: 'member' },
      });
      client.volunteerMinistry.findUnique.mockResolvedValue(null);
      client.volunteerMinistry.create.mockResolvedValue({ id: 'vm1', is_primary_leader: true });
      const service = serviceWith(client);

      await service.assignToMinistry('t1', 'g1', {
        ministry_id: 'm1',
        volunteer_profile_id: 'p1',
        role: 'leader',
        is_primary_leader: true,
      } as never);

      expect(client.volunteerMinistry.updateMany).toHaveBeenCalledWith({
        where: { ministry_id: 'm1', is_primary_leader: true },
        data: { is_primary_leader: false },
      });
      expect(client.volunteerMinistry.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          volunteer_profile_id: 'p1',
          ministry_id: 'm1',
          role: 'leader',
          is_primary_leader: true,
        },
      });
    });
  });

  describe('updateAssignment', () => {
    it('lança NotFoundException quando a atribuição não existe', async () => {
      const client = clientWith();
      client.volunteerMinistry.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.updateAssignment('t1', 'g1', 'vm1', {} as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('mantém role e is_primary_leader atuais quando o DTO não os informa', async () => {
      const client = clientWith();
      client.volunteerMinistry.findFirst.mockResolvedValue({
        id: 'vm1',
        ministry_id: 'm1',
        role: 'volunteer',
        is_primary_leader: false,
        volunteerProfile: { person: { classification: 'member' } },
      });
      client.volunteerMinistry.update.mockResolvedValue({ id: 'vm1' });
      const service = serviceWith(client);

      await service.updateAssignment('t1', 'g1', 'vm1', {} as never);

      expect(client.volunteerMinistry.update).toHaveBeenCalledWith({
        where: { id: 'vm1' },
        data: { role: 'volunteer', is_primary_leader: false },
      });
    });

    it('rejeita promover para leader um perfil cuja pessoa não é membro', async () => {
      const client = clientWith();
      client.volunteerMinistry.findFirst.mockResolvedValue({
        id: 'vm1',
        ministry_id: 'm1',
        role: 'volunteer',
        is_primary_leader: false,
        volunteerProfile: { person: { classification: 'attendee' } },
      });
      const service = serviceWith(client);

      await expect(
        service.updateAssignment('t1', 'g1', 'vm1', { role: 'leader' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('promove a líder principal e rebaixa os demais na mesma transação, exceto o próprio registro', async () => {
      const client = clientWith();
      client.volunteerMinistry.findFirst.mockResolvedValue({
        id: 'vm1',
        ministry_id: 'm1',
        role: 'leader',
        is_primary_leader: false,
        volunteerProfile: { person: { classification: 'member' } },
      });
      client.volunteerMinistry.update.mockResolvedValue({ id: 'vm1', is_primary_leader: true });
      const service = serviceWith(client);

      await service.updateAssignment('t1', 'g1', 'vm1', { is_primary_leader: true } as never);

      expect(client.volunteerMinistry.updateMany).toHaveBeenCalledWith({
        where: { ministry_id: 'm1', is_primary_leader: true, id: { not: 'vm1' } },
        data: { is_primary_leader: false },
      });
      expect(client.volunteerMinistry.update).toHaveBeenCalledWith({
        where: { id: 'vm1' },
        data: { role: 'leader', is_primary_leader: true },
      });
    });

    it('rejeita is_primary_leader quando o role resultante não é leader', async () => {
      const client = clientWith();
      client.volunteerMinistry.findFirst.mockResolvedValue({
        id: 'vm1',
        ministry_id: 'm1',
        role: 'volunteer',
        is_primary_leader: false,
        volunteerProfile: { person: { classification: 'member' } },
      });
      const service = serviceWith(client);

      await expect(
        service.updateAssignment('t1', 'g1', 'vm1', { is_primary_leader: true } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('remove a atribuição quando encontrada', async () => {
      const client = clientWith();
      client.volunteerMinistry.findFirst.mockResolvedValue({ id: 'vm1' });
      client.volunteerMinistry.delete.mockResolvedValue({ id: 'vm1' });
      const service = serviceWith(client);

      expect(await service.remove('t1', 'g1', 'vm1')).toEqual({ id: 'vm1' });
    });

    it('lança NotFoundException ao remover atribuição inexistente', async () => {
      const client = clientWith();
      client.volunteerMinistry.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.remove('t1', 'g1', 'vm1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
