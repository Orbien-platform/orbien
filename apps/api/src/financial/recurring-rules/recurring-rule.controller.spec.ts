import { Reflector } from '@nestjs/core';
import { RecurringRuleController } from './recurring-rule.controller';
import { RecurringRuleService } from './recurring-rule.service';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

const READ_ROLES = ['admin_congregation', 'treasurer', 'tenant_admin'];
const WRITE_ROLES = ['admin_congregation', 'treasurer', 'tenant_admin'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['treasurer'],
  plan: 'starter',
};

function rolesFor(methodName: keyof RecurringRuleController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(
    ROLES_KEY,
    RecurringRuleController.prototype[methodName],
  );
}

describe('RecurringRuleController', () => {
  let recurringRuleService: jest.Mocked<RecurringRuleService>;
  let controller: RecurringRuleController;

  beforeEach(() => {
    recurringRuleService = {
      create: jest.fn(),
      findAll: jest.fn(),
      deactivate: jest.fn(),
    } as unknown as jest.Mocked<RecurringRuleService>;

    controller = new RecurringRuleController(recurringRuleService);
  });

  it('create delega ao service e exige papel de escrita', async () => {
    recurringRuleService.create.mockResolvedValue({ id: 'r1' } as never);

    const result = await controller.create({ mode: 'fixed' } as never, user);

    expect(recurringRuleService.create).toHaveBeenCalledWith({ mode: 'fixed' }, user);
    expect(result).toEqual({ id: 'r1' });
    expect(rolesFor('create')).toEqual(WRITE_ROLES);
  });

  it('findAll delega ao service e exige papel de leitura', async () => {
    recurringRuleService.findAll.mockResolvedValue([{ id: 'r1' }] as never);

    const result = await controller.findAll(user);

    expect(recurringRuleService.findAll).toHaveBeenCalledWith(user);
    expect(result).toEqual([{ id: 'r1' }]);
    expect(rolesFor('findAll')).toEqual(READ_ROLES);
  });

  it('deactivate delega ao service e exige papel de escrita', async () => {
    recurringRuleService.deactivate.mockResolvedValue({ id: 'r1', is_active: false } as never);

    const result = await controller.deactivate('r1', user);

    expect(recurringRuleService.deactivate).toHaveBeenCalledWith('r1', user);
    expect(result).toEqual({ id: 'r1', is_active: false });
    expect(rolesFor('deactivate')).toEqual(WRITE_ROLES);
  });
});
