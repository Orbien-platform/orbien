import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { VolunteerProfilesService } from './volunteer-profiles.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

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

describe('VolunteerProfilesService.findMine', () => {
  function mineClient() {
    return {
      userAccount: { findUnique: jest.fn().mockResolvedValue({ person_id: 'p1' }) },
      volunteerProfile: { findFirst: jest.fn() },
      celebrationAssignment: { count: jest.fn().mockResolvedValue(12) },
      consentRecord: { findFirst: jest.fn().mockResolvedValue(null) },
    };
  }
  const mineService = (client: ReturnType<typeof mineClient>) =>
    new VolunteerProfilesService({ client } as unknown as PrismaService);

  it('devolve ministérios, habilidades, disponibilidade e as escalas já servidas', async () => {
    const client = mineClient();
    const since = new Date('2024-03-02T00:00:00Z');
    client.volunteerProfile.findFirst.mockResolvedValue({
      id: 'vp1',
      skills: ['ProPresenter', 'OBS'],
      availability: { sunday: ['morning', 'evening'] },
      restrictions: null,
      created_at: since,
      volunteerMinistries: [{ role: 'volunteer', ministry: { id: 'm1', name: 'Mídia' } }],
    });

    await expect(mineService(client).findMine('u1', 't1', 'g1')).resolves.toEqual({
      id: 'vp1',
      ministries: [{ id: 'm1', name: 'Mídia', role: 'volunteer' }],
      skills: ['ProPresenter', 'OBS'],
      availability: { sunday: ['morning', 'evening'] },
      restrictions: null,
      volunteer_since: since,
      served_count: 12,
      term: { version: 'volunteer_term_v1', text: expect.any(String), accepted_at: null },
    });
    expect(client.volunteerProfile.findFirst.mock.calls[0][0].where).toEqual({
      person_id: 'p1',
      tenant_id: 't1',
      congregation_id: 'g1',
    });
    expect(client.celebrationAssignment.count.mock.calls[0][0].where).toMatchObject({
      volunteer_profile_id: 'vp1',
      status: 'confirmed',
    });
  });

  it.each([
    ['nulos', null, null],
    ['em formato inesperado', 'ProPresenter', ['sunday']],
  ])('JSON %s viram lista e objeto vazios', async (_label, skills, availability) => {
    const client = mineClient();
    client.volunteerProfile.findFirst.mockResolvedValue({
      id: 'vp1',
      skills,
      availability,
      restrictions: 'Só domingos',
      created_at: new Date(),
      volunteerMinistries: [],
    });

    const mine = await mineService(client).findMine('u1', 't1', 'g1');
    expect(mine.skills).toEqual([]);
    expect(mine.availability).toEqual({});
  });

  it('conta sem pessoa vinculada: 404', async () => {
    const client = mineClient();
    client.userAccount.findUnique.mockResolvedValue({ person_id: null });
    await expect(mineService(client).findMine('u1', 't1', 'g1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('conta inexistente: 404', async () => {
    const client = mineClient();
    client.userAccount.findUnique.mockResolvedValue(null);
    await expect(mineService(client).findMine('u1', 't1', 'g1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('pessoa sem perfil de voluntário: 404', async () => {
    const client = mineClient();
    client.volunteerProfile.findFirst.mockResolvedValue(null);
    await expect(mineService(client).findMine('u1', 't1', 'g1')).rejects.toThrow(
      'Perfil de voluntário não encontrado',
    );
  });
});

describe('VolunteerProfilesService — edição do próprio perfil e termo', () => {
  const user: JwtPayload = { sub: 'u1', tenant_id: 't1', congregation_id: 'g1', roles: ['volunteer'], plan: 'starter' };
  const row = {
    id: 'vp1',
    skills: ['OBS'],
    availability: { sunday: ['morning'] },
    restrictions: null,
    created_at: new Date('2024-03-02T00:00:00Z'),
    volunteerMinistries: [],
  };

  function setup() {
    const client = {
      userAccount: { findUnique: jest.fn().mockResolvedValue({ person_id: 'p1' }) },
      volunteerProfile: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue({ ...row, availability: { monday: ['evening'] } }),
      },
      celebrationAssignment: { count: jest.fn().mockResolvedValue(0) },
      consentRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = { client, $executeRaw: jest.fn().mockResolvedValue(1) };
    return { client, prisma, service: new VolunteerProfilesService(prisma as unknown as PrismaService) };
  }

  describe('updateMine', () => {
    it('grava só availability (sem repetir turno) no perfil da conta e audita antes/depois', async () => {
      const { client, prisma, service } = setup();
      const out = await service.updateMine(user, { availability: { monday: ['evening', 'evening'] } });

      expect(client.volunteerProfile.findFirst.mock.calls[0][0].where).toEqual({
        person_id: 'p1',
        tenant_id: 't1',
        congregation_id: 'g1',
      });
      const call = client.volunteerProfile.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'vp1' });
      expect(call.data).toEqual({ availability: { monday: ['evening'] } });
      expect(out.availability).toEqual({ monday: ['evening'] });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const sql = JSON.stringify(prisma.$executeRaw.mock.calls[0].slice(1));
      expect(sql).toContain('volunteer_profile.self_updated');
      expect(sql).toContain('{\\"availability\\":{\\"sunday\\":[\\"morning\\"]}}');
    });

    it('ignora dia sem lista (undefined) ao normalizar', async () => {
      const { client, service } = setup();
      await service.updateMine(user, { availability: { monday: undefined, friday: [] } });
      expect(client.volunteerProfile.update.mock.calls[0][0].data).toEqual({ availability: { friday: [] } });
    });

    it('sessão de suporte não edita', async () => {
      const { client, service } = setup();
      await expect(
        service.updateMine({ ...user, support_session: true }, { availability: {} }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.volunteerProfile.update).not.toHaveBeenCalled();
    });

    it('sem perfil: 404 e nada gravado', async () => {
      const { client, service } = setup();
      client.volunteerProfile.findFirst.mockResolvedValue(null);
      await expect(service.updateMine(user, { availability: {} })).rejects.toBeInstanceOf(NotFoundException);
      expect(client.volunteerProfile.update).not.toHaveBeenCalled();
    });

    it('falha da auditoria não desfaz a edição', async () => {
      const { prisma, service } = setup();
      prisma.$executeRaw.mockRejectedValue(new Error('boom'));
      await expect(service.updateMine(user, { availability: { monday: ['evening'] } })).resolves.toBeDefined();
    });
  });

  describe('acceptTerm', () => {
    const meta = { ip: '1.2.3.4', userAgent: 'jest' };

    it('grava consent_record com versão, origem, ip e user-agent, e audita', async () => {
      const { client, prisma, service } = setup();
      await service.acceptTerm(user, 'volunteer_term_v1', meta);
      expect(client.consentRecord.updateMany).not.toHaveBeenCalled();
      expect(client.consentRecord.create.mock.calls[0][0].data).toMatchObject({
        tenant_id: 't1',
        congregation_id: 'g1',
        person_id: 'p1',
        version: 'volunteer_term_v1',
        origin: 'volunteer_app',
        ip: '1.2.3.4',
        user_agent: 'jest',
      });
      expect(JSON.stringify(prisma.$executeRaw.mock.calls[0].slice(1))).toContain('consent.granted');
    });

    it('sem ip nem user-agent grava null', async () => {
      const { client, service } = setup();
      await service.acceptTerm(user, 'volunteer_term_v1', {});
      expect(client.consentRecord.create.mock.calls[0][0].data).toMatchObject({ ip: null, user_agent: null });
    });

    it('reaceitar a mesma versão não duplica nem audita de novo', async () => {
      const { client, prisma, service } = setup();
      client.consentRecord.findFirst.mockResolvedValue({ version: 'volunteer_term_v1', consented_at: new Date() });
      await service.acceptTerm(user, 'volunteer_term_v1', meta);
      expect(client.consentRecord.create).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('aceite de versão antiga é revogado, não apagado, e o novo é gravado', async () => {
      const { client, service } = setup();
      client.consentRecord.findFirst.mockResolvedValue({ version: 'volunteer_term_v0' });
      await service.acceptTerm(user, 'volunteer_term_v1', meta);
      expect(client.consentRecord.updateMany.mock.calls[0][0].data).toMatchObject({
        revocation_reason: 'superseded_by_new_term',
      });
      expect(client.consentRecord.create).toHaveBeenCalledTimes(1);
    });

    it('versão que não é a vigente: 409 com o termo vigente', async () => {
      const { client, service } = setup();
      await expect(service.acceptTerm(user, 'volunteer_term_v0', meta)).rejects.toBeInstanceOf(ConflictException);
      expect(client.consentRecord.create).not.toHaveBeenCalled();
    });

    it('sessão de suporte não aceita pelo voluntário', async () => {
      const { client, service } = setup();
      await expect(
        service.acceptTerm({ ...user, support_session: true }, 'volunteer_term_v1', meta),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.consentRecord.create).not.toHaveBeenCalled();
    });
  });
});
