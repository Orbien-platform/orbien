import { Reflector } from '@nestjs/core';
import { NetworksController } from './networks.controller';
import { NetworksService } from './networks.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { REQUIRES_PLAN_KEY } from '../auth/decorators/requires-plan.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['pastor'],
  plan: 'premium',
};

const READ_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'treasurer', 'cell_leader'];
const MANAGE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor'];

function rolesFor(methodName: keyof NetworksController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, NetworksController.prototype[methodName]);
}

function requiredPlanForClass(): string | undefined {
  const reflector = new Reflector();
  return reflector.get<string | undefined>(REQUIRES_PLAN_KEY, NetworksController);
}

describe('NetworksController', () => {
  let service: jest.Mocked<NetworksService>;
  let controller: NetworksController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      getGoalStatus: jest.fn(),
    } as unknown as jest.Mocked<NetworksService>;

    controller = new NetworksController(service);
  });

  it('o controller inteiro exige plano Premium (CEL20-07/08)', () => {
    expect(requiredPlanForClass()).toBe('premium');
  });

  it('create, update e remove exigem papel de gestão', () => {
    expect(rolesFor('create')).toEqual(MANAGE_ROLES);
    expect(rolesFor('update')).toEqual(MANAGE_ROLES);
    expect(rolesFor('remove')).toEqual(MANAGE_ROLES);
  });

  it('findAll, findOne e getGoalStatus aceitam papéis de leitura', () => {
    expect(rolesFor('findAll')).toEqual(READ_ROLES);
    expect(rolesFor('findOne')).toEqual(READ_ROLES);
    expect(rolesFor('getGoalStatus')).toEqual(READ_ROLES);
  });

  it('create delega ao service com dto e usuário', async () => {
    service.create.mockResolvedValue({ id: 'n1' } as never);

    const result = await controller.create({ name: 'Rede Central' } as never, USER);

    expect(service.create).toHaveBeenCalledWith({ name: 'Rede Central' }, USER);
    expect(result).toEqual({ id: 'n1' });
  });

  it('findAll delega ao service', async () => {
    service.findAll.mockResolvedValue([{ id: 'n1' }] as never);

    const result = await controller.findAll();

    expect(service.findAll).toHaveBeenCalledWith();
    expect(result).toEqual([{ id: 'n1' }]);
  });

  it('findOne delega ao service com o id', async () => {
    service.findOne.mockResolvedValue({ id: 'n1' } as never);

    const result = await controller.findOne('n1');

    expect(service.findOne).toHaveBeenCalledWith('n1');
    expect(result).toEqual({ id: 'n1' });
  });

  it('update delega ao service com id e dto', async () => {
    service.update.mockResolvedValue({ id: 'n1', name: 'Novo nome' } as never);

    const result = await controller.update('n1', { name: 'Novo nome' } as never);

    expect(service.update).toHaveBeenCalledWith('n1', { name: 'Novo nome' });
    expect(result).toEqual({ id: 'n1', name: 'Novo nome' });
  });

  it('remove delega ao service com o id', async () => {
    service.remove.mockResolvedValue({ id: 'n1' } as never);

    const result = await controller.remove('n1');

    expect(service.remove).toHaveBeenCalledWith('n1');
    expect(result).toEqual({ id: 'n1' });
  });

  it('getGoalStatus delega ao service com o id', async () => {
    service.getGoalStatus.mockResolvedValue({
      goal_pct: 80,
      current_pct: 80,
      met: true,
      green: 4,
      yellow: 0,
      red: 1,
      total: 5,
    });

    const result = await controller.getGoalStatus('n1');

    expect(service.getGoalStatus).toHaveBeenCalledWith('n1');
    expect(result).toEqual({
      goal_pct: 80,
      current_pct: 80,
      met: true,
      green: 4,
      yellow: 0,
      red: 1,
      total: 5,
    });
  });
});
