import { MeetingMaterialNotifier } from './meeting-material.notifier';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';

function build(visibility: 'all' | 'leaders_only', notifiedAt: Date | null = null) {
  const system = {
    groupMeetingMaterial: {
      findMany: jest.fn().mockResolvedValue([{ id: 'link1' }]),
      findUnique: jest.fn().mockResolvedValue({
        id: 'link1',
        visibility,
        notified_at: notifiedAt,
        meeting_id: 'meet1',
        material_id: 'mat1',
        material: { title: 'Estudo de Rute' },
        meeting: {
          small_group_id: 'sg1',
          smallGroup: { name: 'PG Centro', tenant_id: 't1', congregation_id: 'c1' },
        },
      }),
      update: jest.fn(),
    },
    groupMembership: { findMany: jest.fn().mockResolvedValue([{ person_id: 'p1' }, { person_id: 'p2' }]) },
  };
  const notifications = { sendPushToPersons: jest.fn().mockResolvedValue(true) };
  const notifier = new MeetingMaterialNotifier(
    { system } as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { system, notifications, notifier };
}

describe('MeetingMaterialNotifier', () => {
  const ORIGINAL_ENV = process.env;
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, ONESIGNAL_APP_ID: 'app1' };
  });
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('visibility all: avisa as pessoas do PG e marca notified_at', async () => {
    const { system, notifications, notifier } = build('all');

    await notifier.notifyLink('link1');

    expect(system.groupMembership.findMany).toHaveBeenCalledWith({
      where: { small_group_id: 'sg1' },
      select: { person_id: true },
    });
    expect(notifications.sendPushToPersons).toHaveBeenCalledTimes(1);
    const [opts, personIds] = notifications.sendPushToPersons.mock.calls[0];
    expect(opts).toMatchObject({
      tenantId: 't1',
      congregationId: 'c1',
      title: 'Material do encontro — PG Centro',
      body: 'Estudo de Rute já está disponível.',
    });
    expect(personIds).toEqual(['p1', 'p2']);
    expect(system.groupMeetingMaterial.update).toHaveBeenCalledWith({
      where: { id: 'link1' },
      data: { notified_at: expect.any(Date) },
    });
  });

  it('leaders_only: restringe o público a leader e trainee', async () => {
    const { system, notifier } = build('leaders_only');

    await notifier.notifyLink('link1');

    expect(system.groupMembership.findMany).toHaveBeenCalledWith({
      where: { small_group_id: 'sg1', role: { in: ['leader', 'trainee'] } },
      select: { person_id: true },
    });
  });

  it('não reenvia quando o vínculo já foi avisado', async () => {
    const { notifications, notifier } = build('all', new Date());

    await notifier.notifyLink('link1');

    expect(notifications.sendPushToPersons).not.toHaveBeenCalled();
  });

  it('OneSignal recusando o envio deixa notified_at nulo', async () => {
    const { system, notifications, notifier } = build('all');
    notifications.sendPushToPersons.mockResolvedValue(false);

    await notifier.notifyLink('link1');

    expect(system.groupMeetingMaterial.update).not.toHaveBeenCalled();
  });

  it('exceção no push não derruba o chamador nem marca notified_at', async () => {
    const { system, notifications, notifier } = build('all');
    notifications.sendPushToPersons.mockRejectedValue(new Error('rede fora'));

    await expect(notifier.notifyLink('link1')).resolves.toBeUndefined();
    expect(system.groupMeetingMaterial.update).not.toHaveBeenCalled();
  });

  it('cron avisa só vínculos agendados cuja hora chegou nas últimas 24h', async () => {
    const { system, notifications, notifier } = build('all');

    await notifier.cronNotifyReleased();

    expect(system.groupMeetingMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          notified_at: null,
          release_at: { lte: expect.any(Date), gte: expect.any(Date) },
        },
      }),
    );
    const { gte, lte } = system.groupMeetingMaterial.findMany.mock.calls[0][0].where.release_at;
    expect(lte.getTime() - gte.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(notifications.sendPushToPersons).toHaveBeenCalledTimes(1);
  });

  it('cron não faz nada sem ONESIGNAL_APP_ID', async () => {
    delete process.env['ONESIGNAL_APP_ID'];
    const { system, notifier } = build('all');

    await notifier.cronNotifyReleased();

    expect(system.groupMeetingMaterial.findMany).not.toHaveBeenCalled();
  });
});
