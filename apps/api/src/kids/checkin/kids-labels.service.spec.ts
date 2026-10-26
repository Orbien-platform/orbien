import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { KidsLabelsService } from './kids-labels.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsActor } from '../children/kids-child-access.service';

const leader: KidsActor = { userId: 'lider1', tenantId: 't1', congregationId: 'g1', roles: ['ministry_leader'] };
const volunteer: KidsActor = { userId: 'vol1', tenantId: 't1', congregationId: 'g1', roles: ['volunteer'] };
const parent: KidsActor = { userId: 'mae1', tenantId: 't1', congregationId: 'g1', roles: ['member'] };

const checkin = (extra = {}) => ({
  id: 'k1',
  session_id: 's1',
  code: 'A2B3',
  checked_out_at: null,
  checked_in_by: 'lider1',
  child: { id: 'c1', full_name: 'Ana Souza' },
  guardian: { full_name: 'Maria Souza' },
  session: { room: { name: 'Maternal' } },
  ...extra,
});

function build(opts: { checkin?: object | null; allergies?: string | null; hasHealth?: boolean } = {}) {
  const client = {
    kidsCheckin: { findFirst: jest.fn().mockResolvedValue(opts.checkin === undefined ? checkin() : opts.checkin) },
    kidsChildHealth: {
      findUnique: jest.fn().mockResolvedValue(
        opts.hasHealth === false ? null : { allergies: opts.allergies === undefined ? 'amendoim' : opts.allergies, medical_notes: 'bombinha' },
      ),
    },
  };
  const sessionAccess = { canOperate: jest.fn(async (a: KidsActor) => a.roles.includes('ministry_leader')) };
  const children = { auditHealthRead: jest.fn().mockResolvedValue(undefined) };
  return {
    client,
    sessionAccess,
    children,
    svc: new KidsLabelsService({ client } as unknown as PrismaService, sessionAccess as never, children as never),
  };
}

describe('KidsLabelsService.forCheckin (AC 5, sem QR)', () => {
  it('etiqueta da criança: nome, turma, alergia em destaque e o código', async () => {
    const { svc } = build();
    const out = await svc.forCheckin(leader, 'k1');
    expect(out.child_label).toEqual({
      child_name: 'Ana Souza',
      room_name: 'Maternal',
      has_allergy: true,
      allergy: 'amendoim',
      code: 'A2B3',
    });
  });

  it('etiqueta do responsável: o MESMO código e o nome da criança', async () => {
    const { svc } = build();
    const out = await svc.forCheckin(leader, 'k1');
    expect(out.guardian_label).toEqual({ child_name: 'Ana Souza', room_name: 'Maternal', code: 'A2B3' });
    expect(out.guardian_label.code).toBe(out.child_label.code);
    expect(out.checkin_id).toBe('k1');
  });

  it('a etiqueta do responsável nunca leva alergia nem observação médica', async () => {
    const { svc } = build();
    const out = await svc.forCheckin(leader, 'k1');
    expect(JSON.stringify(out.guardian_label)).not.toMatch(/amendoim|bombinha|allerg/i);
    expect(JSON.stringify(out)).not.toMatch(/bombinha/); // observação médica fica na ficha
  });

  it('não há QR: nenhum campo de qr/url na resposta', async () => {
    const { svc } = build();
    expect(JSON.stringify(await svc.forCheckin(leader, 'k1'))).not.toMatch(/qr|http/i);
  });

  it('sem alergia (vazia, só espaços ou sem ficha de saúde): sem destaque', async () => {
    for (const o of [{ allergies: null }, { allergies: '   ' }, { hasHealth: false }]) {
      const { svc } = build(o);
      expect((await svc.forCheckin(leader, 'k1')).child_label).toMatchObject({ has_allergy: false, allergy: null });
    }
  });

  it('a leitura de saúde pela equipe que fez o check-in é auditada (voluntário escalado incluso)', async () => {
    const a = build();
    await a.svc.forCheckin(leader, 'k1');
    expect(a.children.auditHealthRead).toHaveBeenCalledWith(leader, 'c1');

    const b = build({ checkin: checkin({ checked_in_by: 'vol1' }) });
    b.sessionAccess.canOperate.mockResolvedValueOnce(true);
    await b.svc.forCheckin(volunteer, 'k1');
    expect(b.children.auditHealthRead).toHaveBeenCalledWith(volunteer, 'c1');
  });

  it('o responsável que fez o próprio check-in pelo app reimprime, sem auditoria de equipe', async () => {
    const { svc, children } = build({ checkin: checkin({ checked_in_by: 'mae1' }) });
    const out = await svc.forCheckin(parent, 'k1');
    expect(out.child_label.code).toBe('A2B3');
    expect(children.auditHealthRead).not.toHaveBeenCalled();
  });

  it('AC 7: quem não fez o check-in leva 403 e nada é lido — gestão e voluntário escalado inclusos', async () => {
    const outroLider = { ...leader, userId: 'lider2' };
    for (const actor of [outroLider, volunteer, parent, { ...leader, userId: 'v9', roles: ['visitor'] }]) {
      const { svc, client, sessionAccess } = build();
      sessionAccess.canOperate.mockResolvedValue(true);
      await expect(svc.forCheckin(actor, 'k1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.kidsChildHealth.findUnique).not.toHaveBeenCalled();
    }
  });

  it('404 sem check-in na congregação; 409 se já foi retirada (etiqueta de quem saiu não se reimprime)', async () => {
    const a = build({ checkin: null });
    await expect(a.svc.forCheckin(leader, 'k1')).rejects.toBeInstanceOf(NotFoundException);
    expect(a.client.kidsCheckin.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'k1', tenant_id: 't1', congregation_id: 'g1' } }),
    );
    const b = build({ checkin: checkin({ checked_out_at: new Date() }) });
    await expect(b.svc.forCheckin(leader, 'k1')).rejects.toBeInstanceOf(ConflictException);
  });
});
