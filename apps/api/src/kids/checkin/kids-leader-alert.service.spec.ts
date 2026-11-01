import { KidsLeaderAlertService } from './kids-leader-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KIDS_ALERT_ROLES } from '../kids.roles';

function build(leaders: { userAccount: { person_id: string | null } }[], push?: jest.Mock) {
  const client = { roleAssignment: { findMany: jest.fn().mockResolvedValue(leaders) } };
  const notifications = { sendPushToPersons: push ?? jest.fn().mockResolvedValue(true) };
  return { client, notifications, svc: new KidsLeaderAlertService({ client } as unknown as PrismaService, notifications as never) };
}

const info = { sessionId: 's1', checkinId: 'k1', roomName: 'Maternal' };

describe('KidsLeaderAlertService.notifyCheckoutDenied', () => {
  it('avisa os líderes da congregação, sem nome de criança nem dado de saúde', async () => {
    const { svc, client, notifications } = build([
      { userAccount: { person_id: 'p1' } },
      { userAccount: { person_id: 'p2' } },
      { userAccount: { person_id: 'p1' } }, // mesma pessoa com dois papéis
      { userAccount: { person_id: null } }, // conta sem pessoa
    ]);

    await svc.notifyCheckoutDenied('t1', 'g1', info);

    expect(client.roleAssignment.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: 't1',
        congregation_id: 'g1',
        role_code: { in: KIDS_ALERT_ROLES },
        userAccount: { is_active: true },
      },
      select: { userAccount: { select: { person_id: true } } },
    });
    const [opts, personIds] = notifications.sendPushToPersons.mock.calls[0];
    expect(personIds).toEqual(['p1', 'p2']);
    expect(opts).toMatchObject({
      tenantId: 't1',
      congregationId: 'g1',
      contentPostId: null,
      data: { type: 'kids_checkout_denied', session_id: 's1', checkin_id: 'k1' },
    });
    expect(`${opts.title} ${opts.body}`).toContain('Maternal');
  });

  it('sem líder com conta, não envia nada', async () => {
    const { svc, notifications } = build([]);
    await svc.notifyCheckoutDenied('t1', 'g1', info);
    expect(notifications.sendPushToPersons).not.toHaveBeenCalled();
  });

  it('falha do push nunca derruba a recusa (engole e registra)', async () => {
    const { svc } = build([{ userAccount: { person_id: 'p1' } }], jest.fn().mockRejectedValue(new Error('OneSignal fora do ar')));
    await expect(svc.notifyCheckoutDenied('t1', 'g1', info)).resolves.toBeUndefined();
  });

  it('falha na busca dos líderes também não derruba', async () => {
    const { svc, client } = build([]);
    client.roleAssignment.findMany.mockRejectedValue(new Error('db'));
    await expect(svc.notifyCheckoutDenied('t1', 'g1', info)).resolves.toBeUndefined();
  });
});

describe('KidsLeaderAlertService.notifyCheckoutLocked (R3-2)', () => {
  it('avisa os mesmos líderes que a recusa, dizendo que a turma travou e que só a exceção libera; sem nome de criança', async () => {
    const { svc, client, notifications } = build([{ userAccount: { person_id: 'p1' } }, { userAccount: { person_id: 'p2' } }]);
    await svc.notifyCheckoutLocked('t1', 'g1', info);

    expect(client.roleAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ role_code: { in: KIDS_ALERT_ROLES } }) }),
    );
    const [opts, personIds] = notifications.sendPushToPersons.mock.calls[0];
    expect(personIds).toEqual(['p1', 'p2']);
    expect(opts.data).toEqual({ type: 'kids_checkout_locked', session_id: 's1', checkin_id: 'k1' });
    expect(`${opts.title} ${opts.body}`).toContain('Maternal');
    expect(`${opts.title} ${opts.body}`.toLowerCase()).toContain('exceção');
  });

  it('falha do push ou da busca nunca derruba a recusa', async () => {
    const a = build([{ userAccount: { person_id: 'p1' } }], jest.fn().mockRejectedValue(new Error('x')));
    await expect(a.svc.notifyCheckoutLocked('t1', 'g1', info)).resolves.toBeUndefined();
    const b = build([]);
    b.client.roleAssignment.findMany.mockRejectedValue(new Error('db'));
    await expect(b.svc.notifyCheckoutLocked('t1', 'g1', info)).resolves.toBeUndefined();
  });

  it('sem líder com conta, não envia', async () => {
    const { svc, notifications } = build([]);
    await svc.notifyCheckoutLocked('t1', 'g1', info);
    expect(notifications.sendPushToPersons).not.toHaveBeenCalled();
  });
});

describe('KidsLeaderAlertService: líderes resolvidos antes (para avisar depois da transação)', () => {
  it('leaderPersonIds devolve as pessoas distintas dos líderes ativos', async () => {
    const { svc } = build([
      { userAccount: { person_id: 'p1' } },
      { userAccount: { person_id: 'p1' } },
      { userAccount: { person_id: null } },
    ]);
    expect(await svc.leaderPersonIds('t1', 'g1')).toEqual(['p1']);
  });

  it('leaderPersonIds engole a falha da busca e devolve vazio', async () => {
    const { svc, client } = build([]);
    client.roleAssignment.findMany.mockRejectedValue(new Error('db'));
    expect(await svc.leaderPersonIds('t1', 'g1')).toEqual([]);
  });

  it('com a lista já resolvida, o aviso não consulta o banco de novo', async () => {
    const { svc, client, notifications } = build([]);
    await svc.notifyCheckoutLocked('t1', 'g1', info, ['p9']);
    expect(client.roleAssignment.findMany).not.toHaveBeenCalled();
    expect(notifications.sendPushToPersons.mock.calls[0][1]).toEqual(['p9']);
    expect(notifications.sendPushToPersons.mock.calls[0][0].data.type).toBe('kids_checkout_locked');
  });

  it('lista resolvida vazia = ninguém a avisar', async () => {
    const { svc, notifications } = build([{ userAccount: { person_id: 'p1' } }]);
    await svc.notifyCheckoutDenied('t1', 'g1', info, []);
    expect(notifications.sendPushToPersons).not.toHaveBeenCalled();
  });
});
