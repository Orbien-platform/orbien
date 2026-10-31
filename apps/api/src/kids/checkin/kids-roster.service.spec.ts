import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { KidsRosterService } from './kids-roster.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsActor } from '../children/kids-child-access.service';

const leader: KidsActor = { userId: 'lider1', tenantId: 't1', congregationId: 'g1', roles: ['ministry_leader'] };
const volunteer: KidsActor = { userId: 'vol1', tenantId: 't1', congregationId: 'g1', roles: ['volunteer'] };
const parent: KidsActor = { userId: 'p1', tenantId: 't1', congregationId: 'g1', roles: ['member'] };

const T0 = new Date('2026-10-26T13:00:00Z');
const checkin = (id: string, childId: string, name: string, extra = {}) => ({
  id,
  code: `C${id}`.padEnd(4, 'X').slice(0, 4),
  checked_in_at: T0,
  age_override: false,
  child: { id: childId, full_name: name, birth_date: new Date('2022-01-01') },
  guardian: { id: 'mae', full_name: 'Maria Souza' },
  ...extra,
});

function build(opts: { session?: object | null; checkins?: object[]; health?: object[] } = {}) {
  const client = {
    kidsSession: {
      findFirst: jest.fn().mockResolvedValue(
        opts.session === undefined
          ? { id: 's1', status: 'open', celebration_instance_id: 'i1', room: { id: 'r1', name: 'Maternal', capacity: 12 } }
          : opts.session,
      ),
    },
    kidsCheckin: { findMany: jest.fn().mockResolvedValue(opts.checkins ?? []) },
    kidsChildHealth: { findMany: jest.fn().mockResolvedValue(opts.health ?? []) },
  };
  const sessionAccess = { canOperate: jest.fn(async (a: KidsActor) => a.roles.includes('ministry_leader')) };
  const children = { auditHealthRead: jest.fn().mockResolvedValue(undefined) };
  return {
    client,
    sessionAccess,
    children,
    svc: new KidsRosterService({ client } as unknown as PrismaService, sessionAccess as never, children as never),
  };
}

describe('KidsRosterService.roster', () => {
  it('lista só os presentes (sem check-out), do mais antigo ao mais novo', async () => {
    const { svc, client } = build({ checkins: [checkin('1', 'c1', 'Ana'), checkin('2', 'c2', 'Beto')] });
    const out = await svc.roster(leader, 's1');

    expect(client.kidsCheckin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { session_id: 's1', tenant_id: 't1', congregation_id: 'g1', checked_out_at: null },
        orderBy: { checked_in_at: 'asc' },
      }),
    );
    expect(out.present_count).toBe(2);
    expect(out.items.map((i) => i.child.full_name)).toEqual(['Ana', 'Beto']);
    expect(out.items[0]).toMatchObject({
      checkin_id: '1',
      checked_in_at: T0,
      age_override: false,
      guardian: { person_id: 'mae', full_name: 'Maria Souza' },
    });
    expect(out.session).toMatchObject({ id: 's1', room: { id: 'r1', name: 'Maternal', capacity: 12 } });
  });

  it('o código de retirada não sai no roster: a equipe não o relê depois do check-in', async () => {
    const { svc } = build({ checkins: [checkin('1', 'c1', 'Ana')] });
    const out = await svc.roster(leader, 's1');

    expect(out.items[0]).not.toHaveProperty('code');
    expect(JSON.stringify(out)).not.toContain('C1XX');
  });

  it('sessão sem ninguém presente devolve lista vazia, não erro', async () => {
    const { svc, children } = build();
    await expect(svc.roster(leader, 's1')).resolves.toMatchObject({ present_count: 0, items: [] });
    expect(children.auditHealthRead).not.toHaveBeenCalled();
  });

  it('alergia em destaque: has_allergy e o texto, e a observação médica fica de fora', async () => {
    const { svc } = build({
      checkins: [checkin('1', 'c1', 'Ana'), checkin('2', 'c2', 'Beto'), checkin('3', 'c3', 'Cida')],
      health: [
        { person_id: 'c1', allergies: 'amendoim', medical_notes: 'usa bombinha' },
        { person_id: 'c3', allergies: '   ', medical_notes: 'x' },
      ],
    });
    const out = await svc.roster(leader, 's1');

    expect(out.items[0]).toMatchObject({ has_allergy: true, allergies: 'amendoim' });
    expect(out.items[1]).toMatchObject({ has_allergy: false, allergies: null });
    expect(out.items[2]).toMatchObject({ has_allergy: false, allergies: null }); // só espaços não é alergia
    expect(JSON.stringify(out)).not.toMatch(/bombinha|medical/i);
  });

  it('a leitura de saúde pela equipe é auditada, uma vez por criança com ficha de saúde', async () => {
    const { svc, children } = build({
      checkins: [checkin('1', 'c1', 'Ana'), checkin('2', 'c2', 'Beto')],
      health: [{ person_id: 'c1', allergies: 'amendoim', medical_notes: null }],
    });
    await svc.roster(leader, 's1');

    expect(children.auditHealthRead).toHaveBeenCalledTimes(1);
    expect(children.auditHealthRead).toHaveBeenCalledWith(leader, 'c1');
  });

  it('voluntário escalado lê (e a leitura também é auditada)', async () => {
    const { svc, sessionAccess, children } = build({
      checkins: [checkin('1', 'c1', 'Ana')],
      health: [{ person_id: 'c1', allergies: 'leite', medical_notes: null }],
    });
    sessionAccess.canOperate.mockResolvedValueOnce(true);
    await expect(svc.roster(volunteer, 's1')).resolves.toMatchObject({ present_count: 1 });
    expect(children.auditHealthRead).toHaveBeenCalledWith(volunteer, 'c1');
  });

  it('AC 9: quem não é equipe/liderança (ou voluntário não escalado) leva 403 e nada é lido', async () => {
    for (const actor of [volunteer, parent]) {
      const { svc, client, children } = build({ checkins: [checkin('1', 'c1', 'Ana')] });
      await expect(svc.roster(actor, 's1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.kidsCheckin.findMany).not.toHaveBeenCalled();
      expect(client.kidsChildHealth.findMany).not.toHaveBeenCalled();
      expect(children.auditHealthRead).not.toHaveBeenCalled();
    }
  });

  it('404 quando a sessão não é da congregação', async () => {
    const { svc, client } = build({ session: null });
    await expect(svc.roster(leader, 's1')).rejects.toBeInstanceOf(NotFoundException);
    expect(client.kidsSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1', tenant_id: 't1', congregation_id: 'g1' } }),
    );
  });
});
