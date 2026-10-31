import { PersonsRetentionNotifier } from './persons-retention-notifier.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';

function notifierWith(rows: Array<{ tenant_id: string; congregation_id: string; upcoming: bigint }>) {
  const system = { $queryRaw: jest.fn().mockResolvedValue(rows) };
  const prisma = { system } as unknown as PrismaService;
  const notifications = { sendPush: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<NotificationsService>;

  return { notifier: new PersonsRetentionNotifier(prisma, notifications), notifications, system };
}

describe('PersonsRetentionNotifier', () => {
  it('notifica cada congregação com gente perto do prazo de retenção', async () => {
    const { notifier, notifications } = notifierWith([
      { tenant_id: 't1', congregation_id: 'c1', upcoming: 3n },
    ]);

    await notifier.cronNotifyUpcomingRetentions();

    expect(notifications.sendPush).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        congregationId: 'c1',
        body: expect.stringContaining('3 pessoa'),
        filters: [
          { field: 'tag', key: 'tenant_id', relation: '=', value: 't1' },
          { field: 'tag', key: 'congregation_id', relation: '=', value: 'c1' },
          { field: 'tag', key: 'role', relation: '=', value: 'admin_congregation' },
        ],
      }),
    );
  });

  it('não notifica ninguém quando nenhuma congregação tem gente perto do prazo', async () => {
    const { notifier, notifications } = notifierWith([]);

    await notifier.cronNotifyUpcomingRetentions();

    expect(notifications.sendPush).not.toHaveBeenCalled();
  });

  it('segue para a próxima congregação quando o envio de uma falha', async () => {
    const { notifier, notifications } = notifierWith([
      { tenant_id: 't1', congregation_id: 'c1', upcoming: 1n },
      { tenant_id: 't2', congregation_id: 'c2', upcoming: 2n },
    ]);
    notifications.sendPush.mockRejectedValueOnce(new Error('OneSignal fora do ar')).mockResolvedValueOnce(true);

    await notifier.cronNotifyUpcomingRetentions();

    expect(notifications.sendPush).toHaveBeenCalledTimes(2);
  });
});

describe('PersonsRetentionNotifier — criança (AD-013)', () => {
  it('o aviso de retenção por inatividade não conta criança', async () => {
    const { notifier, system } = notifierWith([]);

    await notifier.cronNotifyUpcomingRetentions();

    const sql = (system.$queryRaw.mock.calls[0][0] as { sql: string }).sql;
    // A ramificação de inatividade é a que usa o prazo de 1/2 anos.
    const inactivity = sql.slice(sql.indexOf('inatividade'), sql.indexOf('financeiro:'));
    expect(inactivity).toContain('p.is_child = false');
  });

  it('o aviso conta check-in de Kids e vínculo de responsável como atividade (REV-1)', async () => {
    const { notifier, system } = notifierWith([]);

    await notifier.cronNotifyUpcomingRetentions();

    const sql = (system.$queryRaw.mock.calls[0][0] as { sql: string }).sql;
    const inactivity = sql.slice(sql.indexOf('inatividade'), sql.indexOf('financeiro:'));
    expect(inactivity).toContain('FROM kids_checkins');
    expect(inactivity).toContain('kc.guardian_person_id = p.id');
    expect(inactivity).toContain('kc.picked_up_by_person_id = p.id');
    expect(inactivity).toContain('FROM kids_guardians');
  });
});
