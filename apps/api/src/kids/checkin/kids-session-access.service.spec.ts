import { KidsSessionAccessService } from './kids-session-access.service';
import { KidsChildAccessService, KidsActor } from '../children/kids-child-access.service';
import { PrismaService } from '../../prisma/prisma.service';

const actor = (...roles: string[]): KidsActor => ({ userId: 'u1', tenantId: 't1', congregationId: 'g1', roles });

function build(personId: string | null, assignment: object | null) {
  const client = {
    userAccount: { findUnique: jest.fn().mockResolvedValue(personId ? { person_id: personId } : null) },
    celebrationAssignment: { findFirst: jest.fn().mockResolvedValue(assignment) },
  };
  const prisma = { client } as unknown as PrismaService;
  return { client, svc: new KidsSessionAccessService(prisma, new KidsChildAccessService(prisma)) };
}

describe('KidsSessionAccessService', () => {
  it.each(['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'ministry_leader'])(
    'gestão (%s) opera qualquer sessão sem consultar a escala',
    async (role) => {
      const { svc, client } = build('p1', null);
      await expect(svc.canOperate(actor(role), 's1')).resolves.toBe(true);
      expect(client.celebrationAssignment.findFirst).not.toHaveBeenCalled();
    },
  );

  it('voluntário escalado na sessão (CelebrationMinistry.kids_session_id) opera', async () => {
    const { svc, client } = build('p1', { id: 'a1' });
    await expect(svc.canOperate(actor('volunteer'), 's1')).resolves.toBe(true);
    expect(client.celebrationAssignment.findFirst).toHaveBeenCalledWith({
      where: {
        status: { in: ['pending', 'confirmed'] },
        volunteerProfile: { person_id: 'p1' },
        celebrationMinistry: { kids_session_id: 's1' },
      },
      select: { id: true },
    });
  });

  it('voluntário sem escala naquela sessão não opera (AC 9)', async () => {
    const { svc } = build('p1', null);
    await expect(svc.canOperate(actor('volunteer'), 's1')).resolves.toBe(false);
  });

  it('voluntário sem pessoa vinculada na conta não opera', async () => {
    const { svc, client } = build(null, { id: 'a1' });
    await expect(svc.canOperate(actor('volunteer'), 's1')).resolves.toBe(false);
    expect(client.celebrationAssignment.findFirst).not.toHaveBeenCalled();
  });

  it.each([['member'], ['visitor'], ['cell_leader']])('%s não opera, mesmo com escala', async (role) => {
    const { svc, client } = build('p1', { id: 'a1' });
    await expect(svc.canOperate(actor(role), 's1')).resolves.toBe(false);
    expect(client.celebrationAssignment.findFirst).not.toHaveBeenCalled();
  });
});
