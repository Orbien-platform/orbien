import { CelebrationRemovalNotifier, personsToNotifyOnRemoval } from './celebration-removal.notifier';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';

const row = (status: string, notified: boolean, personId: string) =>
  ({
    status,
    notified_at: notified ? new Date('2026-09-01') : null,
    volunteerProfile: { person_id: personId },
  }) as never;

describe('personsToNotifyOnRemoval', () => {
  it('não avisa ninguém quando a escala não está publicada', () => {
    expect(personsToNotifyOnRemoval('draft' as never, [row('pending', true, 'p1')])).toEqual([]);
    expect(personsToNotifyOnRemoval('archived' as never, [row('confirmed', true, 'p1')])).toEqual([]);
  });

  it('avisa só quem foi notificado e ainda contava com a vaga', () => {
    const result = personsToNotifyOnRemoval('published' as never, [
      row('pending', true, 'p1'),
      row('confirmed', true, 'p2'),
      row('declined', true, 'p3'),
      row('swapped', true, 'p4'),
      row('pending', false, 'p5'),
    ]);
    expect(result).toEqual(['p1', 'p2']);
  });

  it('não repete a mesma pessoa escalada em dois ministérios', () => {
    const result = personsToNotifyOnRemoval('published' as never, [
      row('pending', true, 'p1'),
      row('confirmed', true, 'p1'),
    ]);
    expect(result).toEqual(['p1']);
  });
});

describe('CelebrationRemovalNotifier', () => {
  function setup(instance: unknown, sendResult: Promise<unknown> = Promise.resolve(true)) {
    const findFirst = jest.fn().mockResolvedValue(instance);
    const prisma = { client: { celebrationInstance: { findFirst } } } as unknown as PrismaService;
    const sendPushToPersons = jest.fn().mockReturnValue(sendResult);
    const notifications = { sendPushToPersons } as unknown as NotificationsService;
    return { notifier: new CelebrationRemovalNotifier(prisma, notifications), findFirst, sendPushToPersons };
  }

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('não consulta nem envia nada quando não há ninguém para avisar', async () => {
    const { notifier, findFirst, sendPushToPersons } = setup(null);
    notifier.notifyRemoved('t1', 'g1', 'i1', []);
    await flush();
    expect(findFirst).not.toHaveBeenCalled();
    expect(sendPushToPersons).not.toHaveBeenCalled();
  });

  it('envia o push às pessoas com o nome e a data do culto', async () => {
    const { notifier, sendPushToPersons } = setup({
      scheduled_date: new Date('2026-09-06T00:00:00Z'),
      celebration: { name: 'Culto da Família' },
    });
    notifier.notifyRemoved('t1', 'g1', 'i1', ['p1']);
    await flush();

    expect(sendPushToPersons).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        congregationId: 'g1',
        title: 'Você saiu da escala',
        body: expect.stringContaining('Culto da Família de 06/09'),
        data: { type: 'celebration_assignment_removed', instance_id: 'i1' },
      }),
      ['p1'],
    );
  });

  it('não envia quando a instância já não existe', async () => {
    const { notifier, sendPushToPersons } = setup(null);
    notifier.notifyRemoved('t1', 'g1', 'i1', ['p1']);
    await flush();
    expect(sendPushToPersons).not.toHaveBeenCalled();
  });

  it('engole falha do push sem derrubar quem chamou', async () => {
    const { notifier, sendPushToPersons } = setup(
      { scheduled_date: new Date('2026-09-06T00:00:00Z'), celebration: { name: 'Culto' } },
      Promise.reject(new Error('onesignal fora')),
    );
    expect(() => notifier.notifyRemoved('t1', 'g1', 'i1', ['p1'])).not.toThrow();
    await flush();
    expect(sendPushToPersons).toHaveBeenCalled();
  });
});
