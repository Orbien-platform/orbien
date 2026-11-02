import {
  CancellationSnapshot,
  CelebrationRemovalNotifier,
  cancellationBody,
  personsToNotifyOnRemoval,
} from './celebration-removal.notifier';
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

describe('aviso de culto cancelado ou removido (PEND-20)', () => {
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  const assignment = (personId: string, day: string) => ({
    volunteerProfile: { person_id: personId },
    celebrationMinistry: { schedule: { celebrationInstance: { scheduled_date: new Date(`${day}T00:00:00Z`) } } },
  });

  function setup(rows: unknown[] | Error = [], sendResult: () => Promise<unknown> = () => Promise.resolve(true)) {
    const findMany = jest.fn();
    if (rows instanceof Error) findMany.mockRejectedValue(rows);
    else findMany.mockResolvedValue(rows);
    const prisma = { client: { celebrationAssignment: { findMany } } } as unknown as PrismaService;
    const sendPushToPersons = jest.fn().mockImplementation(sendResult);
    const notifications = { sendPushToPersons } as unknown as NotificationsService;
    return { notifier: new CelebrationRemovalNotifier(prisma, notifications), findMany, sendPushToPersons };
  }

  const snap = (entries: Array<[string, string[]]>): CancellationSnapshot => ({
    congregationId: 'g1',
    celebrationName: 'Culto da Família',
    datesByPerson: new Map(entries),
  });

  describe('snapshotCancellation', () => {
    it('busca só escala publicada, já notificada e ainda pending/confirmed, das instâncias dadas', async () => {
      const { notifier, findMany } = setup([assignment('p1', '2026-09-06')]);

      await notifier.snapshotCancellation('t1', 'Culto', 'g1', ['i1', 'i2']);

      const where = findMany.mock.calls[0][0].where;
      expect(where.tenant_id).toBe('t1');
      expect(where.notified_at).toEqual({ not: null });
      expect(where.status).toEqual({ in: ['pending', 'confirmed'] });
      expect(where.celebrationMinistry.schedule).toEqual({
        status: 'published',
        celebration_instance_id: { in: ['i1', 'i2'] },
      });
    });

    it('junta as datas por pessoa, sem repetir nem desordenar', async () => {
      const { notifier } = setup([
        assignment('p1', '2026-09-13'),
        assignment('p1', '2026-09-06'),
        assignment('p1', '2026-09-06'),
        assignment('p2', '2026-09-13'),
      ]);

      const result = await notifier.snapshotCancellation('t1', 'Culto', 'g1', ['i1', 'i2']);

      expect(result?.datesByPerson.get('p1')).toEqual(['2026-09-06', '2026-09-13']);
      expect(result?.datesByPerson.get('p2')).toEqual(['2026-09-13']);
      expect(result?.congregationId).toBe('g1');
      expect(result?.celebrationName).toBe('Culto');
    });

    it('sem instâncias ou sem ninguém escalado devolve null, sem consultar quando não há instância', async () => {
      const a = setup([]);
      expect(await a.notifier.snapshotCancellation('t1', 'Culto', 'g1', [])).toBeNull();
      expect(a.findMany).not.toHaveBeenCalled();

      const b = setup([]);
      expect(await b.notifier.snapshotCancellation('t1', 'Culto', 'g1', ['i1'])).toBeNull();
    });

    it('falha na leitura não derruba a operação: devolve null', async () => {
      const { notifier } = setup(new Error('db fora'));
      await expect(notifier.snapshotCancellation('t1', 'Culto', 'g1', ['i1'])).resolves.toBeNull();
    });
  });

  describe('notifyCancelled', () => {
    it('não envia nada sem snapshot ou com snapshot vazio', async () => {
      const { notifier, sendPushToPersons } = setup();
      notifier.notifyCancelled('t1', null);
      notifier.notifyCancelled('t1', snap([]));
      await flush();
      expect(sendPushToPersons).not.toHaveBeenCalled();
    });

    it('envia à conta de quem estava escalado, respeitando a preferência "avisos"', async () => {
      const { notifier, sendPushToPersons } = setup();
      notifier.notifyCancelled('t1', snap([['p1', ['2026-09-06']]]));
      await flush();

      expect(sendPushToPersons).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 't1',
          congregationId: 'g1',
          title: 'Culto cancelado',
          body: 'Culto da Família de 06/09 foi cancelado. Você não precisa servir nesta data.',
          data: { type: 'celebration_cancelled' },
        }),
        ['p1'],
        'avisos',
      );
    });

    it('lote: um push por pessoa com as datas dela; quem tem as mesmas datas vai junto', async () => {
      const { notifier, sendPushToPersons } = setup();
      notifier.notifyCancelled(
        't1',
        snap([
          ['p1', ['2026-09-06', '2026-09-13']],
          ['p2', ['2026-09-06', '2026-09-13']],
          ['p3', ['2026-09-13']],
        ]),
      );
      await flush();

      expect(sendPushToPersons).toHaveBeenCalledTimes(2);
      const calls = sendPushToPersons.mock.calls.map(([opts, ids]) => [opts.body, ids]);
      expect(calls).toContainEqual([
        'Culto da Família: 06/09, 13/09 foram cancelados. Você não precisa servir nessas datas.',
        ['p1', 'p2'],
      ]);
      expect(calls).toContainEqual([
        'Culto da Família de 13/09 foi cancelado. Você não precisa servir nesta data.',
        ['p3'],
      ]);
    });

    it('engole falha do push e ainda avisa os demais grupos', async () => {
      let n = 0;
      const { notifier, sendPushToPersons } = setup([], () =>
        ++n === 1 ? Promise.reject(new Error('onesignal fora')) : Promise.resolve(true),
      );
      expect(() =>
        notifier.notifyCancelled('t1', snap([['p1', ['2026-09-06']], ['p2', ['2026-09-13']]])),
      ).not.toThrow();
      await flush();
      expect(sendPushToPersons).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancellationBody', () => {
    it('corta a lista de datas depois de seis', () => {
      const days = Array.from({ length: 8 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
      expect(cancellationBody('Culto', days)).toBe(
        'Culto: 01/09, 02/09, 03/09, 04/09, 05/09, 06/09 e mais 2 foram cancelados. Você não precisa servir nessas datas.',
      );
    });
  });
});
