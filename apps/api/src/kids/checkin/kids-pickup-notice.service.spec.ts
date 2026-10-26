import { KidsPickupNoticeService } from './kids-pickup-notice.service';
import { PrismaService } from '../../prisma/prisma.service';

const info = { checkinId: 'k1', sessionId: 's1', childId: 'c1', roomName: 'Maternal', pickedUpByPersonId: 'avo' as string | null };

function build(opts: { primaries?: { guardian_person_id: string }[]; child?: { full_name: string } | null; push?: jest.Mock } = {}) {
  const client = {
    kidsGuardian: {
      findMany: jest.fn().mockResolvedValue(opts.primaries ?? [{ guardian_person_id: 'mae' }]),
    },
    person: {
      findFirst: jest.fn().mockResolvedValue(opts.child === undefined ? { full_name: 'Ana Clara Souza' } : opts.child),
    },
  };
  const notifications = { sendPush: opts.push ?? jest.fn().mockResolvedValue(true) };
  const svc = new KidsPickupNoticeService({ client } as unknown as PrismaService, notifications as never);
  return { client, notifications, svc };
}

describe('KidsPickupNoticeService.notifyChildReleased', () => {
  it('avisa o responsável primário pela tag person_id, respeitando a preferência kids com != (AD-003)', async () => {
    const { svc, client, notifications } = build();
    await svc.notifyChildReleased('t1', 'g1', info);

    expect(client.kidsGuardian.findMany).toHaveBeenCalledWith({
      where: { child_id: 'c1', tenant_id: 't1', congregation_id: 'g1', is_primary: true },
      select: { guardian_person_id: true },
    });
    expect(notifications.sendPush).toHaveBeenCalledTimes(1);
    expect(notifications.sendPush).toHaveBeenCalledWith({
      tenantId: 't1',
      congregationId: 'g1',
      contentPostId: null,
      title: 'Criança entregue',
      body: 'Retirada de Ana confirmada na turma Maternal.',
      filters: [
        { field: 'tag', key: 'person_id', relation: '=', value: 'mae' },
        { field: 'tag', key: 'pref_kids', relation: '!=', value: 'false' },
      ],
      data: { type: 'kids_child_released', checkin_id: 'k1', session_id: 's1' },
    });
  });

  it('o texto leva só o primeiro nome e a turma: nenhum dado de saúde é consultado nem enviado', async () => {
    const { svc, client, notifications } = build();
    await svc.notifyChildReleased('t1', 'g1', info);

    const opts = notifications.sendPush.mock.calls[0][0];
    expect(`${opts.title} ${opts.body}`).not.toMatch(/Clara|Souza|alerg|médic|saúde/i);
    expect(Object.keys(client)).toEqual(['kidsGuardian', 'person']); // nem toca em kidsChildHealth
    expect(client.person.findFirst).toHaveBeenCalledWith({
      where: { id: 'c1', tenant_id: 't1', congregation_id: 'g1' },
      select: { full_name: true },
    });
  });

  it('quem retirou não precisa do aviso, mesmo sendo o primário', async () => {
    const { svc, notifications } = build({ primaries: [{ guardian_person_id: 'mae' }, { guardian_person_id: 'pai' }] });
    await svc.notifyChildReleased('t1', 'g1', { ...info, pickedUpByPersonId: 'mae' });

    expect(notifications.sendPush).toHaveBeenCalledTimes(1);
    expect(notifications.sendPush.mock.calls[0][0].filters[0]).toMatchObject({ value: 'pai' });
  });

  it('retirada por exceção (sem pessoa cadastrada): o primário recebe', async () => {
    const { svc, notifications } = build();
    await svc.notifyChildReleased('t1', 'g1', { ...info, pickedUpByPersonId: null });
    expect(notifications.sendPush.mock.calls[0][0].filters[0]).toMatchObject({ value: 'mae' });
  });

  it('só o primário que retirou: ninguém a avisar, nada é enviado', async () => {
    const { svc, notifications } = build();
    await svc.notifyChildReleased('t1', 'g1', { ...info, pickedUpByPersonId: 'mae' });
    expect(notifications.sendPush).not.toHaveBeenCalled();
  });

  it('criança sem primário ou sem cadastro: não envia e não quebra', async () => {
    const none = build({ primaries: [] });
    await expect(none.svc.notifyChildReleased('t1', 'g1', info)).resolves.toBeUndefined();
    expect(none.notifications.sendPush).not.toHaveBeenCalled();

    const ghost = build({ child: null });
    await expect(ghost.svc.notifyChildReleased('t1', 'g1', info)).resolves.toBeUndefined();
    expect(ghost.notifications.sendPush).not.toHaveBeenCalled();
  });

  it('responsável sem push token / sem app: sendPush devolve false e nada quebra', async () => {
    const { svc } = build({ push: jest.fn().mockResolvedValue(false) });
    await expect(svc.notifyChildReleased('t1', 'g1', info)).resolves.toBeUndefined();
  });

  it('falha do OneSignal ou do banco é engolida (best-effort): nunca desfaz o check-out', async () => {
    const { svc } = build({ push: jest.fn().mockRejectedValue(new Error('OneSignal fora do ar')) });
    await expect(svc.notifyChildReleased('t1', 'g1', info)).resolves.toBeUndefined();

    const db = build();
    db.client.kidsGuardian.findMany.mockRejectedValue(new Error('db'));
    await expect(db.svc.notifyChildReleased('t1', 'g1', info)).resolves.toBeUndefined();
  });

  it('um primário que falha não impede o aviso do outro', async () => {
    const push = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(true);
    const { svc } = build({ primaries: [{ guardian_person_id: 'mae' }, { guardian_person_id: 'pai' }], push });
    await svc.notifyChildReleased('t1', 'g1', { ...info, pickedUpByPersonId: null });
    expect(push).toHaveBeenCalledTimes(2);
  });
});
