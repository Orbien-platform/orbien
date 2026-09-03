import { Reflector } from '@nestjs/core';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const VISIT_WRITE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'cell_leader'];
const VISIT_READ_ROLES = [...VISIT_WRITE_ROLES, 'treasurer'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['secretary'],
  plan: 'starter',
};

function rolesFor(methodName: keyof VisitsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, VisitsController.prototype[methodName]);
}

describe('VisitsController', () => {
  it('create delega ao service com dto e usuário, e exige papel de escrita', async () => {
    const visitsService = {
      create: jest.fn().mockResolvedValue({ visit: { id: 'v1' }, reclassified: false }),
      findByPerson: jest.fn(),
    } as unknown as jest.Mocked<VisitsService>;
    const controller = new VisitsController(visitsService);

    const dto = { person_id: 'p1', origin: 'service' } as never;
    const result = await controller.create(dto, user);

    expect(visitsService.create).toHaveBeenCalledWith(dto, user);
    expect(result).toEqual({ visit: { id: 'v1' }, reclassified: false });
    expect(rolesFor('create')).toEqual(VISIT_WRITE_ROLES);
  });

  it('findByPerson delega ao service e exige papel de leitura (inclui treasurer)', async () => {
    const visitsService = {
      create: jest.fn(),
      findByPerson: jest.fn().mockResolvedValue([{ id: 'v1' }]),
    } as unknown as jest.Mocked<VisitsService>;
    const controller = new VisitsController(visitsService);

    const result = await controller.findByPerson('p1');

    expect(visitsService.findByPerson).toHaveBeenCalledWith('p1');
    expect(result).toEqual([{ id: 'v1' }]);
    expect(rolesFor('findByPerson')).toEqual(VISIT_READ_ROLES);
  });
});
