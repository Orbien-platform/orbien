import { Reflector } from '@nestjs/core';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { RecurringRuleService } from './recurring-rules/recurring-rule.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const READ_ROLES = ['admin_congregation', 'treasurer', 'tenant_admin'];
const WRITE_ROLES = ['admin_congregation', 'treasurer', 'secretary', 'tenant_admin'];
const STATUS_ROLES = ['treasurer', 'admin_congregation', 'tenant_admin'];
const DELETE_ROLES = ['admin_congregation', 'tenant_admin'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['treasurer'],
  plan: 'starter',
};

function rolesFor(methodName: keyof TransactionsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(
    ROLES_KEY,
    TransactionsController.prototype[methodName],
  );
}

describe('TransactionsController', () => {
  let transactionsService: jest.Mocked<TransactionsService>;
  let recurringRuleService: jest.Mocked<RecurringRuleService>;
  let controller: TransactionsController;

  beforeEach(() => {
    transactionsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<TransactionsService>;

    recurringRuleService = {
      updateTransaction: jest.fn(),
      deleteTransaction: jest.fn(),
    } as unknown as jest.Mocked<RecurringRuleService>;

    controller = new TransactionsController(transactionsService, recurringRuleService);
  });

  it('create delega ao service e exige papel de escrita', async () => {
    transactionsService.create.mockResolvedValue({ id: 't1' } as never);

    const result = await controller.create({ amount: 1 } as never, user);

    expect(transactionsService.create).toHaveBeenCalledWith({ amount: 1 }, user);
    expect(result).toEqual({ id: 't1' });
    expect(rolesFor('create')).toEqual(WRITE_ROLES);
  });

  it('findAll delega ao service e exige papel de leitura', async () => {
    transactionsService.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 } as never);

    const result = await controller.findAll({ page: 1, limit: 20 } as never, user);

    expect(transactionsService.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 }, user);
    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    expect(rolesFor('findAll')).toEqual(READ_ROLES);
  });

  it('findOne delega ao service e exige papel de leitura', async () => {
    transactionsService.findOne.mockResolvedValue({ id: 't1' } as never);

    const result = await controller.findOne('t1', user);

    expect(transactionsService.findOne).toHaveBeenCalledWith('t1', user);
    expect(result).toEqual({ id: 't1' });
    expect(rolesFor('findOne')).toEqual(READ_ROLES);
  });

  describe('update', () => {
    it('sem scope, delega ao TransactionsService', async () => {
      transactionsService.update.mockResolvedValue({ id: 't1' } as never);

      const result = await controller.update('t1', { amount: 2 } as never, undefined, user);

      expect(transactionsService.update).toHaveBeenCalledWith('t1', { amount: 2 }, user);
      expect(recurringRuleService.updateTransaction).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 't1' });
    });

    it('com scope, delega ao RecurringRuleService', async () => {
      recurringRuleService.updateTransaction.mockResolvedValue({ id: 't1' } as never);

      const result = await controller.update('t1', { amount: 2 } as never, 'this_and_future', user);

      expect(recurringRuleService.updateTransaction).toHaveBeenCalledWith(
        't1',
        { amount: 2 },
        'this_and_future',
        user,
      );
      expect(transactionsService.update).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 't1' });
    });

    it('exige papel de leitura (é o herdado por esta rota)', () => {
      expect(rolesFor('update')).toEqual(READ_ROLES);
    });
  });

  it('updateStatus delega ao service e exige papel de status', async () => {
    transactionsService.updateStatus.mockResolvedValue({ id: 't1', status: 'paid' } as never);

    const result = await controller.updateStatus('t1', { status: 'paid' } as never, user);

    expect(transactionsService.updateStatus).toHaveBeenCalledWith('t1', { status: 'paid' }, user);
    expect(result).toEqual({ id: 't1', status: 'paid' });
    expect(rolesFor('updateStatus')).toEqual(STATUS_ROLES);
  });

  describe('remove', () => {
    it('sem scope, delega ao TransactionsService', async () => {
      transactionsService.remove.mockResolvedValue({ id: 't1' } as never);

      const result = await controller.remove('t1', undefined, user);

      expect(transactionsService.remove).toHaveBeenCalledWith('t1', user);
      expect(recurringRuleService.deleteTransaction).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 't1' });
    });

    it('com scope, delega ao RecurringRuleService', async () => {
      recurringRuleService.deleteTransaction.mockResolvedValue({ deleted_count: 2 } as never);

      const result = await controller.remove('t1', 'this', user);

      expect(recurringRuleService.deleteTransaction).toHaveBeenCalledWith('t1', 'this', user);
      expect(transactionsService.remove).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted_count: 2 });
    });

    it('exige papel restrito de exclusão', () => {
      expect(rolesFor('remove')).toEqual(DELETE_ROLES);
    });
  });
});
