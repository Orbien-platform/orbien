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
  const notifications = { sendPush: jest.fn() };
  const notifier = new MeetingMaterialNotifier(
    { system } as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { system, notifications, notifier };
}

describe('MeetingMaterialNotifier', () => {
  it('visibility all: avisa todos os membros do PG e marca notified_at', async () => {
    const { system, notifications, notifier } = build('all');

    await notifier.notifyLink('link1');

    expect(system.groupMembership.findMany).toHaveBeenCalledWith({
      where: { small_group_id: 'sg1' },
      select: { person_id: true },
    });
    expect(notifications.sendPush).toHaveBeenCalledTimes(1);
    const arg = notifications.sendPush.mock.calls[0][0];
    expect(arg.filters).toEqual([
      { field: 'tag', key: 'person_id', relation: '=', value: 'p1' },
      { operator: 'OR' },
      { field: 'tag', key: 'person_id', relation: '=', value: 'p2' },
    ]);
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

    expect(notifications.sendPush).not.toHaveBeenCalled();
  });

  it('falha no push não derruba o chamador e deixa notified_at nulo para o cron tentar de novo', async () => {
    const { system, notifications, notifier } = build('all');
    notifications.sendPush.mockRejectedValue(new Error('onesignal fora'));

    await expect(notifier.notifyLink('link1')).resolves.toBeUndefined();
    expect(system.groupMeetingMaterial.update).not.toHaveBeenCalled();
  });

  it('cron avisa os vínculos liberados e ainda não avisados', async () => {
    const { system, notifications, notifier } = build('all');

    await notifier.cronNotifyReleased();

    expect(system.groupMeetingMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { notified_at: null, release_at: { lte: expect.any(Date) } } }),
    );
    expect(notifications.sendPush).toHaveBeenCalledTimes(1);
  });
});
