import { ConflictException, NotFoundException } from '@nestjs/common';
import { VolunteerProfilesService } from './volunteer-profiles.service';
import { PrismaService } from '../prisma/prisma.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    volunteerProfile: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  const prisma = { client } as unknown as PrismaService;
  return new VolunteerProfilesService(prisma);
}

describe('VolunteerProfilesService', () => {
  describe('create', () => {
    it('rejeita quando a pessoa já possui um perfil de voluntário', async () => {
      const client = clientWith();
      client.volunteerProfile.findUnique.mockResolvedValue({ id: 'existing' });
      const service = serviceWith(client);

      await expect(
        service.create('t1', 'g1', { person_id: 'p1', availability: {} } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('cria o perfil com skills vazio e restrictions nulo quando não informados', async () => {
      const client = clientWith();
      client.volunteerProfile.findUnique.mockResolvedValue(null);
      client.volunteerProfile.create.mockResolvedValue({ id: 'profile-1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', { person_id: 'p1', availability: { sunday: ['morning'] } } as never);

      expect(client.volunteerProfile.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          person_id: 'p1',
          availability: { sunday: ['morning'] },
          skills: [],
          restrictions: null,
        },
        include: { volunteerMinistries: { select: { ministry_id: true, role: true, is_primary_leader: true } } },
      });
    });

    it('cria o perfil com skills e restrictions informados', async () => {
      const client = clientWith();
      client.volunteerProfile.findUnique.mockResolvedValue(null);
      client.volunteerProfile.create.mockResolvedValue({ id: 'profile-1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', {
        person_id: 'p1',
        availability: {},
        skills: ['som'],
        restrictions: 'Sem domingo à noite',
      } as never);

      expect(client.volunteerProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ skills: ['som'], restrictions: 'Sem domingo à noite' }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('lista os perfis do tenant/congregação', async () => {
      const client = clientWith();
      client.volunteerProfile.findMany.mockResolvedValue([{ id: 'profile-1' }]);
      const service = serviceWith(client);

      expect(await service.findAll('t1', 'g1')).toEqual([{ id: 'profile-1' }]);
    });
  });

  describe('findOne', () => {
    it('retorna o perfil quando encontrado', async () => {
      const client = clientWith();
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'profile-1' });
      const service = serviceWith(client);

      expect(await service.findOne('t1', 'g1', 'profile-1')).toEqual({ id: 'profile-1' });
    });

    it('lança NotFoundException quando não encontrado', async () => {
      const client = clientWith();
      client.volunteerProfile.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'profile-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('atualiza apenas os campos informados', async () => {
      const client = clientWith();
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'profile-1' });
      client.volunteerProfile.update.mockResolvedValue({ id: 'profile-1' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'profile-1', { restrictions: 'Nova restrição' } as never);

      expect(client.volunteerProfile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: { restrictions: 'Nova restrição' },
        include: { volunteerMinistries: { select: { ministry_id: true, role: true, is_primary_leader: true } } },
      });
    });

    it('atualiza availability e skills quando informados', async () => {
      const client = clientWith();
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'profile-1' });
      client.volunteerProfile.update.mockResolvedValue({ id: 'profile-1' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'profile-1', {
        availability: { monday: ['evening'] },
        skills: ['som'],
      } as never);

      expect(client.volunteerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { availability: { monday: ['evening'] }, skills: ['som'] },
        }),
      );
    });

    it('lança NotFoundException quando o perfil não existe', async () => {
      const client = clientWith();
      client.volunteerProfile.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.update('t1', 'g1', 'profile-1', {} as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('remove o perfil quando encontrado', async () => {
      const client = clientWith();
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'profile-1' });
      client.volunteerProfile.delete.mockResolvedValue({ id: 'profile-1' });
      const service = serviceWith(client);

      expect(await service.remove('t1', 'g1', 'profile-1')).toEqual({ id: 'profile-1' });
    });

    it('lança NotFoundException ao remover perfil inexistente', async () => {
      const client = clientWith();
      client.volunteerProfile.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.remove('t1', 'g1', 'profile-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
