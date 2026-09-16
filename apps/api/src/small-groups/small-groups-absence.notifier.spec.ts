import { SmallGroupsAbsenceNotifier, type AbsenceAlertRow } from './small-groups-absence.notifier';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';

function row(overrides: Partial<AbsenceAlertRow> = {}): AbsenceAlertRow {
  return {
    tenant_id: 't1',
    congregation_id: 'c1',
    small_group_id: 'sg1',
    group_name: 'Célula Centro',
    leader_person_id: 'p-lider',
    absent_count: 2n,
    meetings_considered: 3,
    ...overrides,
  };
}

function notifierWith(rows: AbsenceAlertRow[]) {
  const system = { $queryRaw: jest.fn().mockResolvedValue(rows) };
  const prisma = { system } as unknown as PrismaService;
  const notifications = {
    sendPush: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<NotificationsService>;

  return { notifier: new SmallGroupsAbsenceNotifier(prisma, notifications), notifications, system };
}

describe('SmallGroupsAbsenceNotifier', () => {
  it('avisa o líder da célula, não o papel cell_leader inteiro', async () => {
    const { notifier, notifications } = notifierWith([row()]);

    await notifier.cronNotifyAbsenceAlerts();

    expect(notifications.sendPush).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        congregationId: 'c1',
        title: 'Faltas na Célula Centro',
        body: '2 membros não apareceram nas últimas 3 reuniões.',
        filters: [{ field: 'tag', key: 'person_id', relation: '=', value: 'p-lider' }],
        data: { type: 'absence_alert', small_group_id: 'sg1' },
      }),
    );
  });

  it('conta as reuniões que existem quando a célula ainda não tem três', async () => {
    const { notifier, notifications } = notifierWith([
      row({ absent_count: 1n, meetings_considered: 1 }),
    ]);

    await notifier.cronNotifyAbsenceAlerts();

    expect(notifications.sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ body: '1 membro não apareceu na última reunião.' }),
    );
  });

  it('não envia nada quando nenhuma célula tem ausente', async () => {
    const { notifier, notifications } = notifierWith([]);

    await notifier.cronNotifyAbsenceAlerts();

    expect(notifications.sendPush).not.toHaveBeenCalled();
  });

  it('segue para a próxima célula quando o envio de uma falha', async () => {
    const { notifier, notifications } = notifierWith([
      row({ small_group_id: 'sg1' }),
      row({ small_group_id: 'sg2', leader_person_id: 'p-outro' }),
    ]);
    notifications.sendPush
      .mockRejectedValueOnce(new Error('OneSignal fora do ar'))
      .mockResolvedValueOnce(undefined);

    await notifier.cronNotifyAbsenceAlerts();

    expect(notifications.sendPush).toHaveBeenCalledTimes(2);
  });
});
