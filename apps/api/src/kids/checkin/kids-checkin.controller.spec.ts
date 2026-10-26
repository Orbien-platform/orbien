import { Reflector } from '@nestjs/core';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { KidsCheckinController } from './kids-checkin.controller';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { REQUIRES_PLAN_KEY } from '../../auth/decorators/requires-plan.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = { sub: 'u1', tenant_id: 't1', congregation_id: 'g1', roles: ['pastor'], plan: 'premium' };
const ACTOR = { userId: 'u1', tenantId: 't1', congregationId: 'g1', roles: ['pastor'] };
const MANAGE = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'ministry_leader'];

const reflector = new Reflector();
const rolesFor = (m: keyof KidsCheckinController) =>
  reflector.get<string[] | undefined>(ROLES_KEY, KidsCheckinController.prototype[m]);

describe('KidsCheckinController', () => {
  it('exige plano premium na classe inteira', () => {
    expect(reflector.get(REQUIRES_PLAN_KEY, KidsCheckinController)).toBe('premium');
  });

  it('papéis por rota: check-in com responsável e voluntário; check-out sem o responsável; exceção só da gestão', () => {
    expect(rolesFor('checkIn')).toEqual([...MANAGE, 'member', 'volunteer']);
    expect(rolesFor('checkOut')).toEqual([...MANAGE, 'volunteer']);
    expect(rolesFor('checkOut')).not.toContain('member');
    expect(rolesFor('checkOutOverride')).toEqual(MANAGE);
    expect(rolesFor('checkOutOverride')).not.toContain('volunteer');
    expect(rolesFor('labels')).toEqual([...MANAGE, 'member', 'volunteer']);
    expect(rolesFor('roster')).toEqual([...MANAGE, 'volunteer']);
    expect(rolesFor('roster')).not.toContain('member');
    // O responsável relê o código do filho; a equipe de balcão não tem rota para isso.
    expect(rolesFor('openForChild')).toEqual([...MANAGE, 'member']);
    expect(rolesFor('openForChild')).not.toContain('volunteer');
  });

  it('check-out responde 200 (fecha um recurso existente, não cria)', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, KidsCheckinController.prototype.checkOut)).toBe(200);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, KidsCheckinController.prototype.checkOutOverride)).toBe(200);
  });

  it('delega aos services com o ator do JWT', async () => {
    const checkin = {
      checkIn: jest.fn().mockResolvedValue({ id: 'k1' }),
      checkOut: jest.fn().mockResolvedValue({ id: 'k1' }),
      checkOutOverride: jest.fn().mockResolvedValue({ id: 'k1' }),
      getOpenForChild: jest.fn().mockResolvedValue({ id: 'k1' }),
    };
    const roster = { roster: jest.fn().mockResolvedValue({ items: [] }) };
    const labels = { forCheckin: jest.fn().mockResolvedValue({ checkin_id: 'k1', child_label: {}, guardian_label: {} }) };
    const c = new KidsCheckinController(checkin as never, roster as never, labels as never);
    const inDto = { child_id: 'c', guardian_person_id: 'g' };
    const outDto = { code: 'A2B3', picked_up_by_name: 'Maria' };
    const ovDto = { reason: 'Perdeu a etiqueta', picked_up_by_name: 'Maria' };

    const created = await c.checkIn('s1', inDto, USER);
    await c.labels('k1', USER);
    await c.checkOut('k1', outDto, USER);
    await c.checkOutOverride('k1', ovDto, USER);
    await c.roster('s1', USER);
    await c.openForChild('c1', USER);

    expect(checkin.checkIn).toHaveBeenCalledWith(ACTOR, 's1', inDto);
    expect(checkin.checkOut).toHaveBeenCalledWith(ACTOR, 'k1', outDto);
    expect(checkin.checkOutOverride).toHaveBeenCalledWith(ACTOR, 'k1', ovDto);
    expect(roster.roster).toHaveBeenCalledWith(ACTOR, 's1');
    expect(checkin.getOpenForChild).toHaveBeenCalledWith(ACTOR, 'c1');
    expect(labels.forCheckin).toHaveBeenCalledTimes(2);
    expect(labels.forCheckin).toHaveBeenCalledWith(ACTOR, 'k1');
    // AC 5: o check-in devolve o código e as duas etiquetas juntos
    expect(created).toMatchObject({ id: 'k1', labels: { checkin_id: 'k1' } });
  });
});
