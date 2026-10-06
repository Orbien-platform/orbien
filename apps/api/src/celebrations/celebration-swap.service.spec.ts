import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CelebrationSwapService } from './celebration-swap.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';

const FUTURE = new Date(Date.now() + 7 * 86_400_000);
const PAST = new Date(Date.now() - 7 * 86_400_000);

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asg-1',
    tenant_id: 'tenant-1',
    congregation_id: 'cong-1',
    celebration_ministry_id: 'cm-1',
    volunteer_profile_id: 'vp-me',
    status: 'pending',
    checked_in_at: null,
    celebrationMinistry: {
      ministry_id: 'min-1',
      ministry: { id: 'min-1', name: 'Mídia' },
      schedule: {
        id: 'sch-1',
        status: 'published',
        celebrationInstance: {
          scheduled_date: FUTURE,
          celebration: { name: 'Culto da manhã', start_time: '09:30' },
        },
      },
    },
    ...overrides,
  };
}

const profile = (id: string, personId: string, name: string) => ({
  id,
  person: { id: personId, full_name: name },
});

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    status: 'pending',
    message: null,
    created_at: new Date('2026-10-01T12:00:00Z'),
    responded_at: null,
    assignment_id: 'asg-1',
    requester_profile_id: 'vp-ana',
    target_profile_id: null,
    assignment: assignment({ volunteer_profile_id: 'vp-ana' }),
    requester: profile('vp-ana', 'p-ana', 'Ana Souza'),
    target: null,
    acceptedBy: null,
    ...overrides,
  };
}

function setup() {
  const client = {
    userAccount: { findUnique: jest.fn().mockResolvedValue({ person_id: 'p-me' }) },
    volunteerProfile: {
      findFirst: jest.fn().mockResolvedValue(profile('vp-me', 'p-me', 'Caio Freitas')),
    },
    volunteerMinistry: {
      findUnique: jest.fn().mockResolvedValue({ id: 'vm-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    celebrationAssignment: {
      findFirst: jest.fn().mockResolvedValue(assignment()),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 'asg-new' }),
    },
    volunteerUnavailabilityDate: { findMany: jest.fn().mockResolvedValue([]) },
    assignmentSwapRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    client,
    runInTx: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  } as unknown as PrismaService;
  const notifications = {
    sendPush: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<NotificationsService>;
  const service = new CelebrationSwapService(prisma, notifications);
  return { client, prisma, notifications, service };
}

const ctx = ['user-1', 'tenant-1', 'cong-1'] as const;

describe('CelebrationSwapService — perfil e escala de quem pede', () => {
  it('conta sem pessoa vinculada: 404', async () => {
    const { client, service } = setup();
    client.userAccount.findUnique.mockResolvedValue({ person_id: null });
    await expect(service.getCandidates('asg-1', ...ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('conta inexistente: 404', async () => {
    const { client, service } = setup();
    client.userAccount.findUnique.mockResolvedValue(null);
    await expect(service.listMine(...ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pessoa sem perfil de voluntário: 404', async () => {
    const { client, service } = setup();
    client.volunteerProfile.findFirst.mockResolvedValue(null);
    await expect(service.getCandidates('asg-1', ...ctx)).rejects.toThrow(
      'Perfil de voluntário não encontrado',
    );
  });

  it('atribuição inexistente: 404', async () => {
    const { client, service } = setup();
    client.celebrationAssignment.findFirst.mockResolvedValue(null);
    await expect(service.getCandidates('asg-1', ...ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('escala de outra pessoa: 403', async () => {
    const { client, service } = setup();
    client.celebrationAssignment.findFirst.mockResolvedValue(
      assignment({ volunteer_profile_id: 'vp-outro' }),
    );
    await expect(service.getCandidates('asg-1', ...ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('escala em rascunho: 422', async () => {
    const { client, service } = setup();
    const draft = assignment();
    draft.celebrationMinistry.schedule.status = 'draft';
    client.celebrationAssignment.findFirst.mockResolvedValue(draft);
    await expect(service.getCandidates('asg-1', ...ctx)).rejects.toThrow('rascunho');
  });

  it.each([
    ['recusada', { status: 'declined' }],
    ['já trocada', { status: 'swapped' }],
    ['com check-in feito', { status: 'confirmed', checked_in_at: new Date() }],
  ])('escala %s não troca: 409', async (_label, overrides) => {
    const { client, service } = setup();
    client.celebrationAssignment.findFirst.mockResolvedValue(assignment(overrides));
    await expect(service.getCandidates('asg-1', ...ctx)).rejects.toBeInstanceOf(ConflictException);
  });

  it('escala que já passou: 422', async () => {
    const { client, service } = setup();
    const past = assignment();
    past.celebrationMinistry.schedule.celebrationInstance.scheduled_date = PAST;
    client.celebrationAssignment.findFirst.mockResolvedValue(past);
    await expect(service.getCandidates('asg-1', ...ctx)).rejects.toThrow('já passou');
  });
});

describe('CelebrationSwapService.getCandidates', () => {
  it('ministério sem mais ninguém: lista vazia, sem consultar disponibilidade', async () => {
    const { client, service } = setup();
    await expect(service.getCandidates('asg-1', ...ctx)).resolves.toEqual([]);
    expect(client.volunteerUnavailabilityDate.findMany).not.toHaveBeenCalled();
  });

  it('tira quem já está na vaga e ordena livres, ocupados no culto e indisponíveis', async () => {
    const { client, service } = setup();
    client.volunteerMinistry.findMany.mockResolvedValue([
      { volunteerProfile: profile('vp-z', 'p-z', 'Zeca') },
      { volunteerProfile: profile('vp-b', 'p-b', 'Bianca') },
      { volunteerProfile: profile('vp-t', 'p-t', 'Thiago') },
      { volunteerProfile: profile('vp-u', 'p-u', 'Ursula') },
      { volunteerProfile: profile('vp-s', 'p-s', 'Sara') },
      { volunteerProfile: profile('vp-r', 'p-r', 'Rui') },
    ]);
    client.celebrationAssignment.findMany.mockResolvedValue([
      // na mesma vaga (mesmo recusado): sai da lista — o unique não deixaria
      { volunteer_profile_id: 'vp-s', celebration_ministry_id: 'cm-1', status: 'declined' },
      // outro ministério do mesmo culto, ativo: ocupado
      { volunteer_profile_id: 'vp-t', celebration_ministry_id: 'cm-2', status: 'confirmed' },
      // outro ministério, recusado: continua livre
      { volunteer_profile_id: 'vp-r', celebration_ministry_id: 'cm-2', status: 'declined' },
    ]);
    client.volunteerUnavailabilityDate.findMany.mockResolvedValue([
      { unavailability: { volunteer_profile_id: 'vp-u' } },
    ]);

    const result = await service.getCandidates('asg-1', ...ctx);

    expect(result).toEqual([
      { volunteer_profile_id: 'vp-b', full_name: 'Bianca', availability: 'free' },
      { volunteer_profile_id: 'vp-r', full_name: 'Rui', availability: 'free' },
      { volunteer_profile_id: 'vp-z', full_name: 'Zeca', availability: 'free' },
      { volunteer_profile_id: 'vp-t', full_name: 'Thiago', availability: 'busy' },
      { volunteer_profile_id: 'vp-u', full_name: 'Ursula', availability: 'unavailable' },
    ]);
    expect(client.volunteerMinistry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ministry_id: 'min-1',
          volunteer_profile_id: { not: 'vp-me' },
        }),
      }),
    );
  });
});

describe('CelebrationSwapService.createRequest', () => {
  it('pedido aberto ao ministério: grava sem destinatário e avisa o ministério todo', async () => {
    const { client, service, notifications } = setup();
    client.assignmentSwapRequest.create.mockResolvedValue(
      request({ requester_profile_id: 'vp-me', requester: profile('vp-me', 'p-me', 'Caio Freitas') }),
    );
    client.volunteerMinistry.findMany.mockResolvedValue([
      { volunteerProfile: { person_id: 'p-ana' } },
      { volunteerProfile: { person_id: 'p-bia' } },
    ]);

    const view = await service.createRequest('asg-1', { message: '   ' }, ...ctx);

    expect(client.assignmentSwapRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tenant_id: 'tenant-1',
          congregation_id: 'cong-1',
          assignment_id: 'asg-1',
          requester_profile_id: 'vp-me',
          target_profile_id: null,
          message: null,
        },
      }),
    );
    expect(notifications.sendPush).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Caio pediu troca de escala',
        body: 'Mídia · Culto da manhã',
        filters: [
          { field: 'tag', key: 'person_id', relation: '=', value: 'p-ana' },
          { operator: 'OR' },
          { field: 'tag', key: 'person_id', relation: '=', value: 'p-bia' },
        ],
      }),
    );
    expect(view).toEqual({
      id: 'req-1',
      status: 'pending',
      message: null,
      created_at: expect.any(Date),
      responded_at: null,
      assignment: {
        id: 'asg-1',
        scheduled_date: FUTURE,
        celebration: { name: 'Culto da manhã', start_time: '09:30' },
        ministry: { id: 'min-1', name: 'Mídia' },
      },
      requester: { volunteer_profile_id: 'vp-me', full_name: 'Caio Freitas' },
      target: null,
      accepted_by: null,
    });
  });

  it('ministério sem mais ninguém: o pedido aberto nasce, sem push', async () => {
    const { client, service, notifications } = setup();
    client.assignmentSwapRequest.create.mockResolvedValue(request());
    await service.createRequest('asg-1', {}, ...ctx);
    expect(notifications.sendPush).not.toHaveBeenCalled();
  });

  it('pedido a um colega: valida que ele pode assumir e avisa só ele', async () => {
    const { client, service, notifications } = setup();
    client.assignmentSwapRequest.create.mockResolvedValue(
      request({ target_profile_id: 'vp-bia', target: profile('vp-bia', 'p-bia', 'Bianca Lopes') }),
    );

    const view = await service.createRequest(
      'asg-1',
      { target_profile_id: 'vp-bia', message: ' Viagem ' },
      ...ctx,
    );

    expect(client.assignmentSwapRequest.create.mock.calls[0][0].data).toMatchObject({
      target_profile_id: 'vp-bia',
      message: 'Viagem',
    });
    expect(notifications.sendPush).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ field: 'tag', key: 'person_id', relation: '=', value: 'p-bia' }],
      }),
    );
    expect(view.target).toEqual({ volunteer_profile_id: 'vp-bia', full_name: 'Bianca Lopes' });
  });

  it('pedir a si mesmo: 422', async () => {
    const { service } = setup();
    await expect(
      service.createRequest('asg-1', { target_profile_id: 'vp-me' }, ...ctx),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('colega que não serve no ministério: 422', async () => {
    const { client, service } = setup();
    client.volunteerMinistry.findUnique.mockResolvedValue(null);
    await expect(
      service.createRequest('asg-1', { target_profile_id: 'vp-bia' }, ...ctx),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('colega que já está na vaga: 422', async () => {
    const { client, service } = setup();
    client.celebrationAssignment.findUnique.mockResolvedValue({ id: 'asg-bia' });
    await expect(
      service.createRequest('asg-1', { target_profile_id: 'vp-bia' }, ...ctx),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('já há pedido em aberto para a escala: 409', async () => {
    const { client, service } = setup();
    client.assignmentSwapRequest.findFirst.mockResolvedValue({ id: 'req-0' });
    await expect(service.createRequest('asg-1', {}, ...ctx)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(client.assignmentSwapRequest.create).not.toHaveBeenCalled();
  });

  it('corrida pega pelo índice parcial (P2002): 409', async () => {
    const { client, service } = setup();
    client.assignmentSwapRequest.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(service.createRequest('asg-1', {}, ...ctx)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('outro erro do banco sobe como veio', async () => {
    const { client, service } = setup();
    client.assignmentSwapRequest.create.mockRejectedValue(new Error('conexão caiu'));
    await expect(service.createRequest('asg-1', {}, ...ctx)).rejects.toThrow('conexão caiu');
  });

  it('falha no push não derruba o pedido — só fica no log', async () => {
    const { client, service, notifications } = setup();
    client.assignmentSwapRequest.create.mockResolvedValue(
      request({ target_profile_id: 'vp-bia', target: profile('vp-bia', 'p-bia', 'Bianca') }),
    );
    notifications.sendPush.mockRejectedValue(new Error('onesignal fora'));
    const logged = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    await expect(
      service.createRequest('asg-1', { target_profile_id: 'vp-bia' }, ...ctx),
    ).resolves.toMatchObject({ id: 'req-1' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('onesignal fora'));
  });
});

describe('CelebrationSwapService.listMine', () => {
  it('recebidos sem os de vagas em que já estou; enviados como vieram', async () => {
    const { client, service } = setup();
    client.volunteerMinistry.findMany.mockResolvedValue([{ ministry_id: 'min-1' }]);
    const doMinisterio = request({ id: 'req-a' });
    const jaEstou = request({
      id: 'req-b',
      assignment: { ...assignment({ volunteer_profile_id: 'vp-ana' }), celebration_ministry_id: 'cm-9' },
    });
    const enviado = request({
      id: 'req-c',
      requester_profile_id: 'vp-me',
      requester: profile('vp-me', 'p-me', 'Caio Freitas'),
      status: 'accepted',
      acceptedBy: profile('vp-bia', 'p-bia', 'Bianca'),
    });
    client.assignmentSwapRequest.findMany
      .mockResolvedValueOnce([doMinisterio, jaEstou])
      .mockResolvedValueOnce([enviado]);
    client.celebrationAssignment.findMany.mockResolvedValue([{ celebration_ministry_id: 'cm-9' }]);

    const result = await service.listMine(...ctx);

    expect(result.incoming.map((r) => r.id)).toEqual(['req-a']);
    expect(result.outgoing).toHaveLength(1);
    expect(result.outgoing[0].accepted_by).toEqual({
      volunteer_profile_id: 'vp-bia',
      full_name: 'Bianca',
    });
    const incomingWhere = client.assignmentSwapRequest.findMany.mock.calls[0][0].where;
    expect(incomingWhere.OR[1].assignment.celebrationMinistry.ministry_id).toEqual({ in: ['min-1'] });
  });
});

describe('CelebrationSwapService.accept', () => {
  it('passa a vaga: o pedido fecha, a escala original vira swapped e a minha nasce confirmada', async () => {
    const { client, prisma, service, notifications } = setup();
    client.assignmentSwapRequest.findFirst
      .mockResolvedValueOnce(request())
      .mockResolvedValueOnce(
        request({ status: 'accepted', acceptedBy: profile('vp-me', 'p-me', 'Caio Freitas') }),
      );

    const view = await service.accept('req-1', ...ctx);

    expect(prisma.runInTx).toHaveBeenCalled();
    expect(client.assignmentSwapRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'pending' },
      data: expect.objectContaining({ status: 'accepted', accepted_by_profile_id: 'vp-me' }),
    });
    expect(client.celebrationAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: 'asg-1', status: { in: ['pending', 'confirmed'] }, checked_in_at: null },
      data: expect.objectContaining({ status: 'swapped' }),
    });
    expect(client.celebrationAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        celebration_ministry_id: 'cm-1',
        volunteer_profile_id: 'vp-me',
        status: 'confirmed',
      }),
    });
    expect(notifications.sendPush).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Troca aceita',
        body: 'Caio assumiu sua escala de Mídia',
        filters: [{ field: 'tag', key: 'person_id', relation: '=', value: 'p-ana' }],
      }),
    );
    expect(view.status).toBe('accepted');
  });

  it('pedido dirigido a mim também se aceita', async () => {
    const { client, service } = setup();
    client.assignmentSwapRequest.findFirst.mockResolvedValue(
      request({ target_profile_id: 'vp-me', target: profile('vp-me', 'p-me', 'Caio') }),
    );
    await expect(service.accept('req-1', ...ctx)).resolves.toMatchObject({ id: 'req-1' });
  });

  it('pedido inexistente: 404', async () => {
    const { service } = setup();
    await expect(service.accept('req-x', ...ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('o próprio pedido: 403', async () => {
    const { client, service } = setup();
    client.assignmentSwapRequest.findFirst.mockResolvedValue(
      request({ requester_profile_id: 'vp-me' }),
    );
    await expect(service.accept('req-1', ...ctx)).rejects.toThrow('próprio pedido');
  });

  it('pedido dirigido a outra pessoa: 403', async () => {
    const { client, service } = setup();
    client.assignmentSwapRequest.findFirst.mockResolvedValue(
      request({ target_profile_id: 'vp-bia' }),
    );
    await expect(service.accept('req-1', ...ctx)).rejects.toThrow('outra pessoa');
  });

  it('pedido já resolvido: 409', async () => {
    const { client, service } = setup();
    client.assignmentSwapRequest.findFirst.mockResolvedValue(request({ status: 'cancelled' }));
    await expect(service.accept('req-1', ...ctx)).rejects.toBeInstanceOf(ConflictException);
  });

  it('escala que já recebeu check-in: 409', async () => {
    const { client, service } = setup();
    client.assignmentSwapRequest.findFirst.mockResolvedValue(
      request({ assignment: assignment({ checked_in_at: new Date() }) }),
    );
    await expect(service.accept('req-1', ...ctx)).rejects.toBeInstanceOf(ConflictException);
  });

  it('quem não serve no ministério: 403', async () => {
    const { client, service } = setup();
    client.assignmentSwapRequest.findFirst.mockResolvedValue(request());
    client.volunteerMinistry.findUnique.mockResolvedValue(null);
    await expect(service.accept('req-1', ...ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('outro colega aceitou primeiro: 409 e nada é criado', async () => {
    const { client, service } = setup();
    client.assignmentSwapRequest.findFirst.mockResolvedValue(request());
    client.assignmentSwapRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.accept('req-1', ...ctx)).rejects.toBeInstanceOf(ConflictException);
    expect(client.celebrationAssignment.create).not.toHaveBeenCalled();
  });

  it('o titular respondeu a escala no meio: 409 e nada é criado', async () => {
    const { client, service } = setup();
    client.assignmentSwapRequest.findFirst.mockResolvedValue(request());
    client.celebrationAssignment.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.accept('req-1', ...ctx)).rejects.toBeInstanceOf(ConflictException);
    expect(client.celebrationAssignment.create).not.toHaveBeenCalled();
  });
});

describe('CelebrationSwapService.decline e cancel', () => {
  it('destinatário recusa e quem pediu é avisado', async () => {
    const { client, service, notifications } = setup();
    const dirigido = request({
      target_profile_id: 'vp-me',
      target: profile('vp-me', 'p-me', 'Caio Freitas'),
    });
    client.assignmentSwapRequest.findFirst
      .mockResolvedValueOnce(dirigido)
      .mockResolvedValueOnce({ ...dirigido, status: 'declined' });

    const view = await service.decline('req-1', ...ctx);

    expect(client.assignmentSwapRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'pending' },
      data: { status: 'declined', responded_at: expect.any(Date) },
    });
    expect(notifications.sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Troca recusada' }),
    );
    expect(view.status).toBe('declined');
  });

  it('pedido aberto ao ministério não se recusa: 403', async () => {
    const { client, service } = setup();
    client.assignmentSwapRequest.findFirst.mockResolvedValue(request());
    await expect(service.decline('req-1', ...ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('recusar pedido já resolvido: 409 e ninguém é avisado', async () => {
    const { client, service, notifications } = setup();
    client.assignmentSwapRequest.findFirst.mockResolvedValue(
      request({ target_profile_id: 'vp-me', status: 'cancelled' }),
    );
    client.assignmentSwapRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.decline('req-1', ...ctx)).rejects.toBeInstanceOf(ConflictException);
    expect(notifications.sendPush).not.toHaveBeenCalled();
  });

  it('quem pediu cancela', async () => {
    const { client, service, notifications } = setup();
    const meu = request({ requester_profile_id: 'vp-me' });
    client.assignmentSwapRequest.findFirst
      .mockResolvedValueOnce(meu)
      .mockResolvedValueOnce({ ...meu, status: 'cancelled' });

    await expect(service.cancel('req-1', ...ctx)).resolves.toMatchObject({ status: 'cancelled' });
    expect(notifications.sendPush).not.toHaveBeenCalled();
  });

  it('cancelar pedido de outra pessoa: 403', async () => {
    const { client, service } = setup();
    client.assignmentSwapRequest.findFirst.mockResolvedValue(request());
    await expect(service.cancel('req-1', ...ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
