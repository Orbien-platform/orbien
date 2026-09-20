import { NotFoundException } from '@nestjs/common';
import { AssignmentStatus } from '@prisma/client';
import { CelebrationScheduleSuggestionService } from './celebration-schedule-suggestion.service';
import { PrismaService } from '../prisma/prisma.service';

// 2026-09-20 é domingo (dayKey 'sunday'); start_time '09:00' cai no balde 'morning'.
const SUNDAY_MORNING = new Date('2026-09-20T00:00:00.000Z');

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    celebrationInstance: { findFirst: jest.fn() },
    volunteerMinistry: { findMany: jest.fn().mockResolvedValue([]) },
    volunteerUnavailabilityDate: { findMany: jest.fn().mockResolvedValue([]) },
    celebrationAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  const prisma = { client } as unknown as PrismaService;
  return new CelebrationScheduleSuggestionService(prisma);
}

function profile(id: string, name: string, availability: unknown = { sunday: ['morning'] }) {
  return {
    volunteerProfile: {
      id,
      availability,
      person: { id: `person-${id}`, full_name: name },
    },
  };
}

function instanceWith(ministries: unknown[]) {
  return {
    scheduled_date: SUNDAY_MORNING,
    celebration: { start_time: '09:00' },
    schedule: { ministries },
  };
}

describe('CelebrationScheduleSuggestionService', () => {
  it('lança NotFoundException quando a instância não existe', async () => {
    const client = clientWith();
    client.celebrationInstance.findFirst.mockResolvedValue(null);
    const service = serviceWith(client);

    await expect(service.suggest('t1', 'g1', 'i1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('retorna lista vazia quando a instância não tem escala', async () => {
    const client = clientWith();
    client.celebrationInstance.findFirst.mockResolvedValue({ ...instanceWith([]), schedule: null });
    const service = serviceWith(client);

    expect(await service.suggest('t1', 'g1', 'i1')).toEqual([]);
  });

  it('retorna lista vazia quando a escala não tem ministérios', async () => {
    const client = clientWith();
    client.celebrationInstance.findFirst.mockResolvedValue(instanceWith([]));
    const service = serviceWith(client);

    expect(await service.suggest('t1', 'g1', 'i1')).toEqual([]);
  });

  it('não sugere quem já está atribuído ao slot', async () => {
    const client = clientWith();
    client.celebrationInstance.findFirst.mockResolvedValue(
      instanceWith([
        {
          id: 'cm1',
          ministry_id: 'min1',
          slots: 2,
          ministry: { name: 'Louvor' },
          assignments: [{ volunteer_profile_id: 'v1' }],
        },
      ]),
    );
    client.volunteerMinistry.findMany.mockResolvedValue([profile('v1', 'Ana')]);
    const service = serviceWith(client);

    const [result] = await service.suggest('t1', 'g1', 'i1');

    expect(result).toMatchObject({ already_assigned_count: 1, slots_remaining: 1, suggestions: [] });
  });

  it('não sugere quem não declarou disponibilidade para o dia/horário', async () => {
    const client = clientWith();
    client.celebrationInstance.findFirst.mockResolvedValue(
      instanceWith([
        {
          id: 'cm1',
          ministry_id: 'min1',
          slots: 1,
          ministry: { name: 'Louvor' },
          assignments: [],
        },
      ]),
    );
    client.volunteerMinistry.findMany.mockResolvedValue([
      profile('v1', 'Ana', { monday: ['evening'] }),
      profile('v2', 'Bia', { sunday: ['afternoon'] }),
    ]);
    const service = serviceWith(client);

    const [result] = await service.suggest('t1', 'g1', 'i1');

    expect(result!.eligible_count).toBe(0);
    expect(result!.suggestions).toEqual([]);
  });

  it('não sugere quem está indisponível na data exata', async () => {
    const client = clientWith();
    client.celebrationInstance.findFirst.mockResolvedValue(
      instanceWith([
        { id: 'cm1', ministry_id: 'min1', slots: 1, ministry: { name: 'Louvor' }, assignments: [] },
      ]),
    );
    client.volunteerMinistry.findMany.mockResolvedValue([profile('v1', 'Ana'), profile('v2', 'Bia')]);
    client.volunteerUnavailabilityDate.findMany.mockResolvedValue([
      { unavailability: { volunteer_profile_id: 'v1' } },
    ]);
    const service = serviceWith(client);

    const [result] = await service.suggest('t1', 'g1', 'i1');

    expect(result!.eligible_count).toBe(1);
    expect(result!.suggestions.map((s) => s.volunteer_profile_id)).toEqual(['v2']);
  });

  it('prioriza rodízio: menos vezes servidas primeiro, depois há mais tempo', async () => {
    const client = clientWith();
    client.celebrationInstance.findFirst.mockResolvedValue(
      instanceWith([
        { id: 'cm1', ministry_id: 'min1', slots: 3, ministry: { name: 'Louvor' }, assignments: [] },
      ]),
    );
    client.volunteerMinistry.findMany.mockResolvedValue([
      profile('v1', 'Ana'), // serviu 2x, mais recentemente
      profile('v2', 'Bia'), // nunca serviu
      profile('v3', 'Caio'), // serviu 1x, há muito tempo
    ]);
    client.celebrationAssignment.findMany.mockResolvedValue([
      {
        volunteer_profile_id: 'v1',
        celebrationMinistry: {
          schedule: { celebrationInstance: { scheduled_date: new Date('2026-08-01') } },
        },
      },
      {
        volunteer_profile_id: 'v1',
        celebrationMinistry: {
          schedule: { celebrationInstance: { scheduled_date: new Date('2026-09-01') } },
        },
      },
      {
        volunteer_profile_id: 'v3',
        celebrationMinistry: {
          schedule: { celebrationInstance: { scheduled_date: new Date('2026-01-01') } },
        },
      },
    ]);
    const service = serviceWith(client);

    const [result] = await service.suggest('t1', 'g1', 'i1');

    expect(result!.suggestions.map((s) => s.volunteer_profile_id)).toEqual(['v2', 'v3', 'v1']);
    expect(result!.suggestions[0]).toMatchObject({ times_served: 0, last_served_at: null });
    expect(result!.suggestions[2]).toMatchObject({ times_served: 2 });
  });

  it('não conta assignment declinado ou trocado como rodízio', async () => {
    const client = clientWith();
    client.celebrationInstance.findFirst.mockResolvedValue(
      instanceWith([
        { id: 'cm1', ministry_id: 'min1', slots: 1, ministry: { name: 'Louvor' }, assignments: [] },
      ]),
    );
    client.volunteerMinistry.findMany.mockResolvedValue([profile('v1', 'Ana')]);
    const service = serviceWith(client);

    await service.suggest('t1', 'g1', 'i1');

    expect(client.celebrationAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: [AssignmentStatus.pending, AssignmentStatus.confirmed] },
        }),
      }),
    );
  });

  it('trata availability em formato inesperado como indisponível, sem lançar', async () => {
    const client = clientWith();
    client.celebrationInstance.findFirst.mockResolvedValue(
      instanceWith([
        { id: 'cm1', ministry_id: 'min1', slots: 1, ministry: { name: 'Louvor' }, assignments: [] },
      ]),
    );
    client.volunteerMinistry.findMany.mockResolvedValue([profile('v1', 'Ana', null), profile('v2', 'Bia', 'texto')]);
    const service = serviceWith(client);

    const [result] = await service.suggest('t1', 'g1', 'i1');

    expect(result!.eligible_count).toBe(0);
  });
});
