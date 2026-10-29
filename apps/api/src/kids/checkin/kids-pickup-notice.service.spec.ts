import { KidsPickupNoticeService } from './kids-pickup-notice.service';
import { PrismaService } from '../../prisma/prisma.service';

const info = { checkinId: 'k1', sessionId: 's1', childId: 'c1', roomName: 'Maternal' };
const released = { ...info, pickedUpByPersonId: 'avo' as string | null };
const received = { ...info, actorPersonId: 'staff-person' as string | null };

type Opts = {
  guardians?: string[]; // o que o banco devolveria para o filtro pedido
  accounts?: string[]; // pessoas com conta ativa
  child?: { full_name: string } | null;
  push?: jest.Mock;
};

function build(opts: Opts = {}) {
  const client = {
    kidsGuardian: {
      findMany: jest.fn().mockResolvedValue((opts.guardians ?? ['mae']).map((guardian_person_id) => ({ guardian_person_id }))),
    },
    userAccount: {
      findMany: jest.fn(async ({ where }: { where: { person_id: { in: string[] } } }) =>
        where.person_id.in.filter((id) => (opts.accounts ?? ['mae', 'pai', 'avo', 'tio']).includes(id)).map((person_id) => ({ person_id })),
      ),
    },
    person: {
      findFirst: jest.fn().mockResolvedValue(opts.child === undefined ? { full_name: 'Ana Clara Souza' } : opts.child),
    },
  };
  const notifications = { sendPush: opts.push ?? jest.fn().mockResolvedValue(true) };
  const svc = new KidsPickupNoticeService({ client } as unknown as PrismaService, notifications as never);
  const sentTo = () => notifications.sendPush.mock.calls.map(([o]) => (o.filters[0] as { value: string }).value);
  return { client, notifications, svc, sentTo };
}

describe('KidsPickupNoticeService.notifyChildReleased — "Criança entregue"', () => {
  it('pede ao banco o primário e os demais com can_pickup, e avisa pela tag person_id respeitando a preferência kids com != (AD-003)', async () => {
    const { svc, client, notifications } = build();
    await svc.notifyChildReleased('t1', 'g1', released);

    expect(client.kidsGuardian.findMany).toHaveBeenCalledWith({
      where: { child_id: 'c1', tenant_id: 't1', congregation_id: 'g1', OR: [{ is_primary: true }, { can_pickup: true }] },
      select: { guardian_person_id: true },
    });
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
      data: { type: 'kids_child_released', checkin_id: 'k1', session_id: 's1', child_id: 'c1' },
    });
  });

  it('R3-3(b): além do primário, os demais responsáveis com can_pickup e conta recebem; quem retirou, não', async () => {
    const { svc, sentTo } = build({ guardians: ['mae', 'pai', 'avo'] });
    await svc.notifyChildReleased('t1', 'g1', { ...released, pickedUpByPersonId: 'avo' });
    expect(sentTo()).toEqual(['mae', 'pai']); // avó retirou: não duplica
  });

  it('não recebe: responsável sem conta ativa (o filtro de conta corta antes do envio)', async () => {
    const { svc, sentTo, client } = build({ guardians: ['mae', 'pai', 'avo'], accounts: ['mae'] });
    await svc.notifyChildReleased('t1', 'g1', { ...released, pickedUpByPersonId: null });
    expect(sentTo()).toEqual(['mae']);
    expect(client.userAccount.findMany).toHaveBeenCalledWith({
      where: { tenant_id: 't1', person_id: { in: ['mae', 'pai', 'avo'] }, is_active: true },
      select: { person_id: true },
    });
  });

  it('não recebe: terceiro sem can_pickup (o banco não o devolve para o filtro) e quem não é responsável da criança', async () => {
    const { svc, sentTo } = build({ guardians: ['mae'], accounts: ['mae', 'tio', 'estranho'] });
    await svc.notifyChildReleased('t1', 'g1', released);
    expect(sentTo()).toEqual(['mae']);
  });

  it('o texto leva só o primeiro nome e a turma: nenhum dado de saúde é consultado nem enviado', async () => {
    const { svc, client, notifications } = build();
    await svc.notifyChildReleased('t1', 'g1', released);

    const opts = notifications.sendPush.mock.calls[0][0];
    expect(`${opts.title} ${opts.body}`).not.toMatch(/Clara|Souza|alerg|médic|saúde/i);
    expect(Object.keys(client)).toEqual(['kidsGuardian', 'userAccount', 'person']); // nem toca em kidsChildHealth
    expect(client.person.findFirst).toHaveBeenCalledWith({
      where: { id: 'c1', tenant_id: 't1', congregation_id: 'g1' },
      select: { full_name: true },
    });
  });

  it('quem retirou não recebe, mesmo sendo o primário; o outro responsável recebe', async () => {
    const { svc, sentTo } = build({ guardians: ['mae', 'pai'] });
    await svc.notifyChildReleased('t1', 'g1', { ...released, pickedUpByPersonId: 'mae' });
    expect(sentTo()).toEqual(['pai']);
  });

  it('retirada por exceção (sem pessoa cadastrada): todos os responsáveis com conta recebem', async () => {
    const { svc, sentTo } = build({ guardians: ['mae', 'avo'] });
    await svc.notifyChildReleased('t1', 'g1', { ...released, pickedUpByPersonId: null });
    expect(sentTo()).toEqual(['mae', 'avo']);
  });

  it('só quem retirou era destinatário: nada é enviado', async () => {
    const { svc, notifications } = build();
    await svc.notifyChildReleased('t1', 'g1', { ...released, pickedUpByPersonId: 'mae' });
    expect(notifications.sendPush).not.toHaveBeenCalled();
  });

  it('criança sem responsável, sem conta ou sem cadastro: não envia e não quebra', async () => {
    for (const o of [{ guardians: [] }, { accounts: [] }, { child: null }] as Opts[]) {
      const { svc, notifications } = build(o);
      await expect(svc.notifyChildReleased('t1', 'g1', released)).resolves.toBeUndefined();
      expect(notifications.sendPush).not.toHaveBeenCalled();
    }
  });

  it('sendPush devolvendo false (sem aparelho) não quebra', async () => {
    const { svc } = build({ push: jest.fn().mockResolvedValue(false) });
    await expect(svc.notifyChildReleased('t1', 'g1', released)).resolves.toBeUndefined();
  });

  it('falha do OneSignal ou do banco é engolida (best-effort): nunca desfaz o check-out', async () => {
    const { svc } = build({ push: jest.fn().mockRejectedValue(new Error('OneSignal fora do ar')) });
    await expect(svc.notifyChildReleased('t1', 'g1', released)).resolves.toBeUndefined();

    const db = build();
    db.client.kidsGuardian.findMany.mockRejectedValue(new Error('db'));
    await expect(db.svc.notifyChildReleased('t1', 'g1', released)).resolves.toBeUndefined();

    const acc = build();
    acc.client.userAccount.findMany.mockRejectedValue(new Error('db'));
    await expect(acc.svc.notifyChildReleased('t1', 'g1', released)).resolves.toBeUndefined();
  });

  it('um destinatário que falha não impede o aviso do outro', async () => {
    const push = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(true);
    const { svc } = build({ guardians: ['mae', 'pai'], push });
    await svc.notifyChildReleased('t1', 'g1', { ...released, pickedUpByPersonId: null });
    expect(push).toHaveBeenCalledTimes(2);
  });
});

describe('KidsPickupNoticeService.notifyChildReceived — "Criança recebida na turma X" (R3-3a)', () => {
  it('avisa o responsável PRIMÁRIO com conta: título com a turma, só o primeiro nome, mesma categoria kids', async () => {
    const { svc, client, notifications } = build();
    await svc.notifyChildReceived('t1', 'g1', received);

    expect(client.kidsGuardian.findMany).toHaveBeenCalledWith({
      where: { child_id: 'c1', tenant_id: 't1', congregation_id: 'g1', OR: [{ is_primary: true }] },
      select: { guardian_person_id: true },
    });
    expect(notifications.sendPush).toHaveBeenCalledTimes(1);
    const opts = notifications.sendPush.mock.calls[0][0];
    expect(opts).toMatchObject({
      tenantId: 't1',
      congregationId: 'g1',
      contentPostId: null,
      title: 'Criança recebida na turma Maternal',
      filters: [
        { field: 'tag', key: 'person_id', relation: '=', value: 'mae' },
        { field: 'tag', key: 'pref_kids', relation: '!=', value: 'false' },
      ],
      data: { type: 'kids_child_received', checkin_id: 'k1', session_id: 's1', child_id: 'c1' },
    });
    // toMatchObject aceita campo a mais: o contrato do `data` é exato (FIX3).
    expect(opts.data).toEqual({ type: 'kids_child_received', checkin_id: 'k1', session_id: 's1', child_id: 'c1' });
    expect(opts.body).toContain('Ana');
    expect(`${opts.title} ${opts.body}`).not.toMatch(/Clara|Souza|alerg|médic|saúde/i);
  });

  it('o primário que fez o check-in ele mesmo NÃO recebe', async () => {
    const { svc, notifications } = build();
    await svc.notifyChildReceived('t1', 'g1', { ...received, actorPersonId: 'mae' });
    expect(notifications.sendPush).not.toHaveBeenCalled();
  });

  it('feito pela equipe (conta sem pessoa vinculada) ou por um terceiro: o primário recebe', async () => {
    for (const actorPersonId of [null, 'staff-person', 'avo']) {
      const { svc, sentTo } = build();
      await svc.notifyChildReceived('t1', 'g1', { ...received, actorPersonId });
      expect(sentTo()).toEqual(['mae']);
    }
  });

  it('com dois primários, o que fez o check-in não recebe e o outro sim', async () => {
    const { svc, sentTo } = build({ guardians: ['mae', 'pai'] });
    await svc.notifyChildReceived('t1', 'g1', { ...received, actorPersonId: 'pai' });
    expect(sentTo()).toEqual(['mae']);
  });

  it('não recebe: primário sem conta; quem não é primário nunca é consultado (avó, tio)', async () => {
    const noAccount = build({ accounts: [] });
    await noAccount.svc.notifyChildReceived('t1', 'g1', received);
    expect(noAccount.notifications.sendPush).not.toHaveBeenCalled();

    const { svc, client } = build();
    await svc.notifyChildReceived('t1', 'g1', received);
    expect(client.kidsGuardian.findMany.mock.calls[0][0].where.OR).toEqual([{ is_primary: true }]);
  });

  it('falhas do banco ou do OneSignal são engolidas: o check-in já está gravado', async () => {
    const a = build({ push: jest.fn().mockRejectedValue(new Error('OneSignal fora do ar')) });
    await expect(a.svc.notifyChildReceived('t1', 'g1', received)).resolves.toBeUndefined();
    const b = build();
    b.client.kidsGuardian.findMany.mockRejectedValue(new Error('db'));
    await expect(b.svc.notifyChildReceived('t1', 'g1', received)).resolves.toBeUndefined();
  });
});
